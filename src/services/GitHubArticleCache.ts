/**
 * GitHub 云端文章 IndexedDB 缓存层
 *
 * DB: RMarkdownGitHubCache
 *  - tree_cache store (keyPath: 'key')
 *  - article_cache store (keyPath: 'id')
 *
 * 缓存 key 全部带命名空间（ns），避免多个仓库/分支/本地目录之间串数据。
 * 例如 ns 形如 'github:owner/repo:main' 或 'local:/abs/path'。
 */

interface CacheEntry<T = string> {
  id: string
  content: T
  updatedAt: number
}

const DB_NAME = 'RMarkdownGitHubCache'
const DB_VERSION = 1
const TREE_KEY_SUFFIX = 'tree.json'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('tree_cache')) {
        db.createObjectStore('tree_cache', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('article_cache')) {
        db.createObjectStore('article_cache', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function storeOp(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const db = await openDB()
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const request = op(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const GitHubArticleCache = {
  // ── tree_cache ──

  async getTreeCache(ns: string): Promise<string | null> {
    try {
      const entry = await storeOp('tree_cache', 'readonly', (s) => s.get(`${ns}:${TREE_KEY_SUFFIX}`))
      return entry?.content ?? null
    } catch {
      return null
    }
  },

  async setTreeCache(ns: string, content: string): Promise<void> {
    await storeOp('tree_cache', 'readwrite', (s) =>
      s.put({ key: `${ns}:${TREE_KEY_SUFFIX}`, content, updatedAt: Date.now() }),
    )
  },

  /** 删除某个命名空间的树缓存（仓库/分支中无 tree.json 时清空） */
  async clearTreeCache(ns: string): Promise<void> {
    try {
      await storeOp('tree_cache', 'readwrite', (s) => s.delete(`${ns}:${TREE_KEY_SUFFIX}`))
    } catch {
      /* ignore */
    }
  },

  // ── article_cache ──

  async getArticle(ns: string, id: string): Promise<string | null> {
    try {
      const entry = await storeOp('article_cache', 'readonly', (s) => s.get(`${ns}:${id}`))
      return entry?.content ?? null
    } catch {
      return null
    }
  },

  async setArticle(ns: string, id: string, content: string): Promise<void> {
    await storeOp('article_cache', 'readwrite', (s) =>
      s.put({ id: `${ns}:${id}`, content, updatedAt: Date.now() }),
    )
  },

  async deleteArticle(ns: string, id: string): Promise<void> {
    await storeOp('article_cache', 'readwrite', (s) => s.delete(`${ns}:${id}`))
  },

  // ── clear ──

  async clearAll(): Promise<void> {
    const db = await openDB()
    const tx = db.transaction(['tree_cache', 'article_cache'], 'readwrite')
    tx.objectStore('tree_cache').clear()
    tx.objectStore('article_cache').clear()
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}
