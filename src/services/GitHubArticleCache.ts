/**
 * GitHub 云端文章 IndexedDB 缓存层
 *
 * DB: RMarkdownGitHubCache
 *  - tree_cache store (keyPath: 'key')
 *  - article_cache store (keyPath: 'id')
 */

interface CacheEntry<T = string> {
  id: string
  content: T
  updatedAt: number
}

const DB_NAME = 'RMarkdownGitHubCache'
const DB_VERSION = 1

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

  async getTreeCache(): Promise<string | null> {
    try {
      const entry = await storeOp('tree_cache', 'readonly', (s) => s.get('tree.json'))
      return entry?.content ?? null
    } catch {
      return null
    }
  },

  async setTreeCache(content: string): Promise<void> {
    await storeOp('tree_cache', 'readwrite', (s) =>
      s.put({ key: 'tree.json', content, updatedAt: Date.now() }),
    )
  },

  // ── article_cache ──

  async getArticle(id: string): Promise<string | null> {
    try {
      const entry = await storeOp('article_cache', 'readonly', (s) => s.get(id))
      return entry?.content ?? null
    } catch {
      return null
    }
  },

  async setArticle(id: string, content: string): Promise<void> {
    await storeOp('article_cache', 'readwrite', (s) =>
      s.put({ id, content, updatedAt: Date.now() }),
    )
  },

  async deleteArticle(id: string): Promise<void> {
    await storeOp('article_cache', 'readwrite', (s) => s.delete(id))
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
