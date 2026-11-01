export interface Draft {
  id?: number
  title: string
  content: string
  createdAt: number
  updatedAt: number
  wechatMediaId?: string
  wechatCoverMediaId?: string
}

const DB_NAME = 'RMarkdownDrafts'
const STORE_NAME = 'drafts'
const DB_VERSION = 1
const DRAFTS_DIR = 'R-Markdown/drafts'

let dbPromise: Promise<IDBDatabase> | null = null

/** 获取草案磁盘目录路径（桌面端专用） */
async function getDraftsDir(): Promise<string> {
  const { documentDir } = await import('@tauri-apps/api/path')
  const doc = await documentDir()
  return `${doc}/${DRAFTS_DIR}`
}

/** 确保草案磁盘目录存在 */
async function ensureDraftsDir(): Promise<void> {
  try {
    const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
    const dir = await getDraftsDir()
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
    }
  } catch {
    // Web 端忽略
  }
}

/** 写入磁盘草案文件 */
async function writeDraftFile(id: number, title: string, content: string): Promise<void> {
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await ensureDraftsDir()
    const dir = await getDraftsDir()
    const safeTitle = title.replace(/[/\\:*?"<>|]/g, '')
    const path = `${dir}/${id}-${safeTitle}.md`
    await writeTextFile(path, content)
  } catch {
    // Web 端忽略
  }
}

/** 删除磁盘草案文件 */
async function removeDraftFile(id: number): Promise<void> {
  try {
    const { exists, remove } = await import('@tauri-apps/plugin-fs')
    const { readDir } = await import('@tauri-apps/plugin-fs')
    const dir = await getDraftsDir()
    if (!(await exists(dir))) return
    const entries = await readDir(dir)
    for (const entry of entries) {
      if (entry.name?.startsWith(`${id}-`)) {
        await remove(`${dir}/${entry.name}`)
        break
      }
    }
  } catch {
    // Web 端忽略
  }
}

export const DraftStorage = {
  initDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })

    return dbPromise
  },

  async save(title: string, content: string, existingId?: number): Promise<number> {
    const db = await this.initDB()
    const now = Date.now()

    if (existingId !== undefined) {
      // 更新已有草稿：保留原 createdAt，避免覆盖创建时间
      const existing = await this.getById(existingId)
      const createdAt = existing?.createdAt ?? now
      const draft: Draft = {
        id: existingId,
        title,
        content,
        createdAt,
        updatedAt: now,
      }
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(draft)
        request.onsuccess = () => {
          writeDraftFile(existingId, title, content)
          resolve(existingId)
        }
        request.onerror = () => reject(request.error)
      })
    }

    return new Promise<number>((resolve, reject) => {
      const draft: Draft = {
        title,
        content,
        createdAt: now,
        updatedAt: now,
      }
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.add(draft)
      request.onsuccess = () => {
        const id = request.result as number
        writeDraftFile(id, title, content)
        resolve(id)
      }
      request.onerror = () => reject(request.error)
    })
  },

  async getById(id: number): Promise<Draft | null> {
    const db = await this.initDB()

    return new Promise<Draft | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => {
        resolve(request.result ?? null)
      }
      request.onerror = () => reject(request.error)
    })
  },

  async updateWechatMediaId(id: number, mediaId: string): Promise<void> {
    const db = await this.initDB()

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)

      getReq.onsuccess = () => {
        const draft = getReq.result as Draft | undefined
        if (!draft) {
          resolve()
          return
        }
        draft.wechatMediaId = mediaId
        const putReq = store.put(draft)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    })
  },

  async updateWechatCoverMediaId(id: number, coverMediaId: string): Promise<void> {
    const db = await this.initDB()

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)

      getReq.onsuccess = () => {
        const draft = getReq.result as Draft | undefined
        if (!draft) {
          resolve()
          return
        }
        draft.wechatCoverMediaId = coverMediaId
        const putReq = store.put(draft)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    })
  },

  async list(): Promise<Draft[]> {
    const db = await this.initDB()

    return new Promise<Draft[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('updatedAt')
      const request = index.openCursor(null, 'prev')

      const drafts: Draft[] = []
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          drafts.push(cursor.value)
          cursor.continue()
        } else {
          resolve(drafts)
        }
      }
      request.onerror = () => reject(request.error)
    })
  },

  async remove(id: number): Promise<void> {
    const db = await this.initDB()

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => {
        removeDraftFile(id)
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  },

  async isDuplicate(title: string, content: string, excludeId?: number): Promise<boolean> {
    const drafts = await this.list()
    return drafts.some(
      (d) =>
        d.title === title &&
        d.content === content &&
        (excludeId === undefined || d.id !== excludeId),
    )
  },

  getCurrentDraftId(): number | null {
    const val = localStorage.getItem('r-markdown-currentDraftId')
    if (val === null) return null
    const id = parseInt(val, 10)
    return isNaN(id) ? null : id
  },

  setCurrentDraftId(id: number | null): void {
    if (id === null) {
      localStorage.removeItem('r-markdown-currentDraftId')
    } else {
      localStorage.setItem('r-markdown-currentDraftId', String(id))
    }
  },
}
