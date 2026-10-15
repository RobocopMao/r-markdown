/**
 * AI 各面板的「结果保留」持久化（IndexedDB）。
 *
 * 三个 AI 面板都要把上一次的结果留着，并按「保留时长」（默认 24 小时，从最后一次
 * 请求算起）自动作废。为什么用 IndexedDB：排版结果是整篇长文、配图结果是图片二进制，
 * 都远超 localStorage 的 5MB 且不接受 Blob。
 *
 * 一个 DB 两个 store：
 * - `records`：放纯 JSON（排版的文本结果、配图的元信息）。统一包一层 envelope，
 *   带上 lastActiveAt / expiresAt，各面板的过期判定口径就一致了。
 * - `blobs`：放配图生成的图片二进制（key = 图片 id）。
 *
 * **写入前必须深拷贝成纯对象**：调用方传的是 Vue 响应式对象，structured clone
 * 不接受 Proxy，会直接抛 DataCloneError。
 */

import { expiresAtFrom, isExpiredAt } from '@/utils/aiSession'

const DB_NAME = 'RMarkdownAiSessions'
const DB_VERSION = 1
const RECORDS = 'records'
const BLOBS = 'blobs'

/** 记录结构版本；将来字段变更时用它做迁移判定 */
export const AI_SESSION_VERSION = 1

/** 带过期的记录信封；payload 是各面板自己的数据 */
export interface SessionEnvelope<T> {
  version: number
  /** 最后一次请求时刻（滑动续期的基准） */
  lastActiveAt: number
  expiresAt: number
  payload: T
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS)
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      // 失败时清掉缓存，下次调用重试（IDB 瞬时错误常见）
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error ?? new Error('本地存储操作失败'))
      }),
  )
}

/** 纯 JSON 记录的读取/写入/清除 */
export async function saveRecord<T>(key: string, payload: T, lastActiveAt: number, hours: number) {
  const envelope: SessionEnvelope<T> = {
    version: AI_SESSION_VERSION,
    lastActiveAt,
    expiresAt: expiresAtFrom(lastActiveAt, hours),
    // 深拷贝：调用方传的可能是响应式代理，Proxy 不能被 structured clone
    payload: JSON.parse(JSON.stringify(payload)) as T,
  }
  await tx(RECORDS, 'readwrite', (s) => s.put(envelope, key))
}

/**
 * 读取一个记录。
 *
 * 返回 null 表示「不可用」——没有记录、版本不认识、结构非法、或已过期都归到这一类；
 * 已过期时顺手把记录删掉，避免它一直占着地方。读失败也返回 null 而不抛错：
 * 读不出来最多丢一次结果，抛错会让面板直接打不开。
 */
export async function loadRecord<T>(key: string, now: number): Promise<SessionEnvelope<T> | null> {
  try {
    const raw = await tx<SessionEnvelope<T> | undefined>(RECORDS, 'readonly', (s) => s.get(key))
    if (!raw || typeof raw !== 'object') return null
    if (raw.version !== AI_SESSION_VERSION) return null
    if (!Number.isFinite(Number(raw.lastActiveAt))) return null
    if (!Number.isFinite(Number(raw.expiresAt))) return null

    if (isExpiredAt(Number(raw.expiresAt), now)) {
      void clearRecord(key)
      return null
    }
    return raw
  } catch {
    return null
  }
}

export async function clearRecord(key: string): Promise<void> {
  try {
    await tx(RECORDS, 'readwrite', (s) => s.delete(key))
  } catch {
    /* 清不掉不影响下次覆盖写入 */
  }
}

/** 图片二进制 */
export async function saveBlob(id: string, blob: Blob): Promise<void> {
  await tx(BLOBS, 'readwrite', (s) => s.put(blob, id))
}

export async function loadBlob(id: string): Promise<Blob | null> {
  try {
    const b = await tx<Blob | undefined>(BLOBS, 'readonly', (s) => s.get(id))
    return b instanceof Blob ? b : null
  } catch {
    return null
  }
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    await tx(BLOBS, 'readwrite', (s) => s.delete(id))
  } catch {
    /* ignore */
  }
}

/** 清空所有配图缓存（「清空结果」与过期时调用） */
export async function clearAllBlobs(): Promise<void> {
  try {
    await tx(BLOBS, 'readwrite', (s) => s.clear())
  } catch {
    /* ignore */
  }
}
