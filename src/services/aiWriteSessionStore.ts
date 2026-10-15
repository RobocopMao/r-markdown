/**
 * AI 写作会话的持久化（IndexedDB，单条记录）。
 *
 * 为什么用 IndexedDB 而不是 localStorage：会话里会存下多篇完整稿件（每篇几千字），
 * 加上对话历史很容易超过 localStorage 的 5MB 上限；IndexedDB 没有这个约束。
 *
 * 存储形态刻意做成「单条记录」：AI 写作是单会话模型（全局只有一个当前会话），
 * 没有历史列表，所以不需要 keyPath 与索引，固定 key 'current' 读写即可。
 *
 * 写盘时机：只在每一轮对话完成时调用 saveSession()，流式增量期间只留在内存，
 * 避免几十次/秒的 IDB 写入。
 */

import type { WriteSession } from '@/utils/aiWriteSession'

const DB_NAME = 'RMarkdownAiWrite'
const STORE_NAME = 'session'
const DB_VERSION = 1
/** 单会话，固定 key */
const RECORD_KEY = 'current'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // 无 keyPath：调用方显式传 key，适合「只有一条记录」的场景
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      // 失败时清掉缓存的 Promise，下次调用可以重试（IDB 瞬时错误常见）
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

/**
 * 读取当前会话。
 *
 * 读失败一律返回 null（当作「没有会话」）而不抛错：会话读不出来最多是丢一次对话，
 * 但若在这里抛错，面板就打不开了，代价更大。
 */
export async function loadSession(): Promise<WriteSession | null> {
  try {
    const db = await openDB()
    return await new Promise<WriteSession | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY)
      req.onsuccess = () => resolve((req.result as WriteSession | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/**
 * 写入当前会话。
 *
 * **必须先深拷贝成纯对象**：调用方传进来的是 Vue 的响应式对象（reactive proxy），
 * 而 IndexedDB 的 structured clone 不接受 Proxy，会直接抛 DataCloneError
 * （「#<Object> could not be cloned」），表现为每次保存都失败。
 * 用 JSON 往返而不是 structuredClone：会话里只有字符串与数字，够用且不挑运行环境。
 *
 * 与读取不同，写失败必须让调用方知道（配额超限、隐私模式禁用存储等），
 * 因为用户以为对话被保存了、实际没有 —— 面板会据此提示「本次对话关闭后会丢失」。
 */
export async function saveSession(session: WriteSession): Promise<void> {
  const db = await openDB()
  const plain = JSON.parse(JSON.stringify(session)) as WriteSession
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(plain, RECORD_KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('会话写入本地存储失败'))
  })
}

/** 清空当前会话（新建会话时调用） */
export async function clearSession(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).delete(RECORD_KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error ?? new Error('会话清除失败'))
    })
  } catch {
    // 清除失败不影响新建（新会话会直接覆盖同一条记录）
  }
}
