export interface MaterialItem {
  id: string
  name: string
  author: string
  category: string
  description?: string
  createdAt: string
  updatedAt: string
  content: string
  pinned?: boolean
  source?: 'local' | 'official'
  officialId?: string
}

export const DEFAULT_CATEGORIES = [
  '标题', '卡片', '分隔线', '图文', '引导关注',
  '引用', '代码块', '列表', '其他',
]

const DB_NAME = 'RMaterialLibrary'
const STORE_NAME = 'materials'
const DB_VERSION = 2
const MATERIALS_DIR = 'R-Markdown/materials'

let dbPromise: Promise<IDBDatabase> | null = null

async function getMaterialsDir(): Promise<string> {
  const { documentDir } = await import('@tauri-apps/api/path')
  const doc = await documentDir()
  return `${doc}/${MATERIALS_DIR}`
}

async function ensureMaterialsDir(): Promise<void> {
  try {
    const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
    const dir = await getMaterialsDir()
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
    }
  } catch {
    // Web 端忽略
  }
}

async function writeMaterialFile(item: MaterialItem): Promise<void> {
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await ensureMaterialsDir()
    const dir = await getMaterialsDir()
    const path = `${dir}/${item.id}.json`
    await writeTextFile(path, JSON.stringify(item, null, 2))
  } catch {
    // Web 端忽略
  }
}

async function removeMaterialFile(id: string): Promise<void> {
  try {
    const { remove } = await import('@tauri-apps/plugin-fs')
    const dir = await getMaterialsDir()
    const path = `${dir}/${id}.json`
    await remove(path)
  } catch {
    // Web 端忽略
  }
}

async function readAllMaterialFiles(): Promise<MaterialItem[]> {
  try {
    const { exists, readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
    const dir = await getMaterialsDir()
    if (!(await exists(dir))) return []
    const entries = await readDir(dir)
    const items: MaterialItem[] = []
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const text = await readTextFile(`${dir}/${entry.name}`)
          items.push(JSON.parse(text))
        } catch { /* skip corrupt files */ }
      }
    }
    return items
  } catch {
    return []
  }
}

export const MaterialStorage = {
  initDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('category', 'category', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
          store.createIndex('source', 'source', { unique: false })
          store.createIndex('pinned', 'pinned', { unique: false })
        } else {
          const tx = (event.target as IDBOpenDBRequest).transaction!
          const store = tx.objectStore(STORE_NAME)
          if (!store.indexNames.contains('pinned')) {
            store.createIndex('pinned', 'pinned', { unique: false })
          }
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return dbPromise
  },

  async save(item: MaterialItem): Promise<void> {
    const db = await this.initDB()
    const now = new Date().toISOString()
    const saved: MaterialItem = {
      ...item,
      updatedAt: item.id ? now : item.createdAt || now,
      createdAt: item.createdAt || now,
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(saved)

      request.onsuccess = () => {
        writeMaterialFile(saved)
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  },

  async get(id: string): Promise<MaterialItem | null> {
    const db = await this.initDB()

    return new Promise<MaterialItem | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
  },

  async list(): Promise<MaterialItem[]> {
    const db = await this.initDB()

    return new Promise<MaterialItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('updatedAt')
      const request = index.openCursor(null, 'prev')

      const items: MaterialItem[] = []
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          items.push(cursor.value)
          cursor.continue()
        } else {
          resolve(items)
        }
      }
      request.onerror = () => reject(request.error)
    })
  },

  async listByCategory(category: string): Promise<MaterialItem[]> {
    const all = await this.list()
    return all.filter((m) => m.category === category)
  },

  async remove(id: string): Promise<void> {
    const db = await this.initDB()

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => {
        removeMaterialFile(id)
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  },

  async removeBatch(ids: string[]): Promise<void> {
    const db = await this.initDB()

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      let count = ids.length
      let hasError = false

      for (const id of ids) {
        const req = store.delete(id)
        req.onsuccess = () => {
          removeMaterialFile(id)
          count--
          if (count === 0) {
            if (hasError) reject(new Error('部分删除失败'))
            else resolve()
          }
        }
        req.onerror = () => {
          count--
          hasError = true
          if (count === 0) reject(new Error('部分删除失败'))
        }
      }
    })
  },

  async syncFromFiles(): Promise<void> {
    try {
      const fileItems = await readAllMaterialFiles()
      if (fileItems.length === 0) return
      const db = await this.initDB()

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        let count = fileItems.length
        for (const item of fileItems) {
          const req = store.put(item)
          req.onsuccess = () => { count--; if (count === 0) resolve() }
          req.onerror = () => { count--; if (count === 0) reject(req.error) }
        }
      })
    } catch { /* Web 端忽略 */ }
  },

  async togglePin(id: string): Promise<boolean> {
    const item = await this.get(id)
    if (!item) return false
    const newPinned = !item.pinned
    await this.save({ ...item, pinned: newPinned })
    return newPinned
  },

  async hasOfficialMaterial(officialId: string): Promise<boolean> {
    const all = await this.list()
    return all.some((m) => m.officialId === officialId)
  },
}
