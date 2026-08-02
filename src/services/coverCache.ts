const STORAGE_KEY = 'r-markdown-wechatCoverCache'

interface CoverCacheData {
  entries: Record<string, string>
  lastMediaId: string
}

function load(): CoverCacheData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        entries: parsed.entries || {},
        lastMediaId: parsed.lastMediaId || '',
      }
    }
  } catch {}
  return { entries: {}, lastMediaId: '' }
}

function save(data: CoverCacheData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

const cache = load()

export function getCoverMediaId(imagePath: string): string | undefined {
  return cache.entries[imagePath] || undefined
}

export function setCoverMediaId(imagePath: string, mediaId: string): void {
  cache.entries[imagePath] = mediaId
  cache.lastMediaId = mediaId
  save(cache)
}

export function getLastMediaId(): string | undefined {
  return cache.lastMediaId || undefined
}

/** 清除指定 media_id 对应的缓存条目。如果 lastMediaId 匹配也会一并清空。 */
export function clearMediaId(mediaId: string): void {
  if (!mediaId) return
  // 找到并删除所有匹配该 media_id 的条目
  for (const [path, id] of Object.entries(cache.entries)) {
    if (id === mediaId) {
      delete cache.entries[path]
    }
  }
  if (cache.lastMediaId === mediaId) {
    cache.lastMediaId = ''
  }
  save(cache)
}
