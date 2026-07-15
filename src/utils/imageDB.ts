const DB_NAME = 'RMarkdownImages'
const STORE_NAME = 'images'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

/** SHA-256 摘要（hex 格式） */
async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** hash → token 缓存，用于去重 */
const hashCache = new Map<string, string>()
let cachePopulated = false

async function ensureHashCache(): Promise<void> {
  if (cachePopulated) return
  try {
    const db = await openDB()
    const keys: string[] = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(req.result as string[])
      req.onerror = () => resolve([])
    })
    for (const key of keys) {
      const record = await new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
      })
      if (record?.hash) {
        hashCache.set(record.hash, key as string)
      }
    }
  } catch { /* ignore */ }
  cachePopulated = true
}

function invalidateHashCache(): void {
  cachePopulated = false
  hashCache.clear()
}

/** 将 File 转为 ArrayBuffer 存入 IndexedDB，相同图片自动复用已有 token */
export async function putImage(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hash = await sha256(buffer)

  // 先检查内存缓存
  await ensureHashCache()
  if (hashCache.has(hash)) {
    return hashCache.get(hash)!
  }

  // 新图片，先生成 token 并设缓存（在写 IDB 之前，防止并发重复写入）
  const token = `DBI_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  hashCache.set(hash, token)

  const db = await openDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put({ buffer, mime: file.type || 'image/png', hash, createdAt: Date.now() }, token)

      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'))
      req.onerror = () => reject(req.error || new Error('put failed'))
    })
  } catch {
    hashCache.delete(hash)
    invalidateHashCache()
    throw new Error('存储图片失败')
  }

  return token
}

/** 从存储记录中提取 buffer 和 mime（兼容旧版纯 ArrayBuffer 格式） */
function unpack(record: any): { buffer: ArrayBuffer; mime: string } {
  if (record instanceof ArrayBuffer) {
    return { buffer: record, mime: '' }
  }
  return { buffer: record.buffer, mime: record.mime || '' }
}

/** 按 token 获取 data URL */
export async function getDataURL(token: string): Promise<string | null> {
  try {
    const db = await openDB()
    const record: any = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(token)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(undefined)
    })
    if (!record) return null
    const { buffer, mime } = unpack(record)
    const blob = new Blob([buffer], mime ? { type: mime } : undefined)
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** 按 token 获取 Blob URL */
export async function getBlobUrl(token: string): Promise<string | null> {
  try {
    const db = await openDB()
    const record: any = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(token)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(undefined)
    })
    if (!record) return null
    const { buffer, mime } = unpack(record)
    return URL.createObjectURL(new Blob([buffer], mime ? { type: mime } : undefined))
  } catch {
    return null
  }
}

/** 删除单张图片 */
export async function deleteImage(token: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(token)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
    invalidateHashCache()
  } catch {
    /* ignore */
  }
}

/** 将文本中的 idb: 令牌替换为 base64 data URL */
export async function resolveIdbImages(text: string): Promise<string> {
  const idbTokens = text.match(/idb:DBI_\d+_[a-z0-9]{6}/g)
  if (!idbTokens || idbTokens.length === 0) return text
  let result = text
  for (const ref of idbTokens) {
    const token = ref.slice(4) // 去掉 "idb:"
    const dataUrl = await getDataURL(token)
    if (dataUrl) {
      result = result.split(ref).join(dataUrl)
    }
  }
  return result
}

/** 清理未被引用的图片 */
export async function cleanupImages(tokensInUse: Set<string>): Promise<void> {
  try {
    const db = await openDB()
    const keys: string[] = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(req.result as string[])
      req.onerror = () => resolve([])
    })
    for (const key of keys) {
      if (!tokensInUse.has(key)) {
        await deleteImage(key)
      }
    }
  } catch {
    /* ignore */
  }
}

/** 获取所有已存储图片的缩略预览（token + data URL + 原始大小 + 上传时间） */
export async function getAllImagePreviews(): Promise<{ token: string; dataUrl: string; size: number; createdAt: number }[]> {
  const result: { token: string; dataUrl: string; size: number; createdAt: number }[] = []
  try {
    const db = await openDB()
    const keys: string[] = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(req.result as string[])
      req.onerror = () => resolve([])
    })
    for (const key of keys) {
      const dataUrl = await getDataURL(key as string)
      if (dataUrl) {
        // 从 data URL 的 base64 部分估算原始文件大小
        const base64Part = dataUrl.split(',')[1] || ''
        const size = Math.round((base64Part.length * 3) / 4)
        // 读取 createdAt 记录
        const record: any = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly')
          const store = tx.objectStore(STORE_NAME)
          const req = store.get(key)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(undefined)
        })
        const createdAt = record?.createdAt || 0
        result.push({ token: key as string, dataUrl, size, createdAt })
      }
    }
  } catch {
    /* ignore */
  }
  return result
}
