import { DEFAULT_SETTINGS, type SettingDef } from './defaults'
import { writeDiskConfig, readDiskConfig } from '@/services/configPersistence'
import { initCrypto, encrypt, decrypt, isPlaintextJSON } from '@/services/encryption'

const PREFIX = 'r-markdown-'
const isDesktop = import.meta.env.VITE_TAURI === 'true'
type Platform = 'desktop' | 'web'
const currentPlatform: Platform = isDesktop ? 'desktop' : 'web'

/** 敏感字段解密后缓存在内存中，供 getSetting 同步读取 */
const sensitiveCache = new Map<string, string>()

const SENSITIVE_KEYS: Set<string> = new Set([
  'cloudArticleToken',
  'cloudArticleRepo',
  'githubRepo',
  'githubToken',
  'letaToken',
  'wechatAppId',
  'wechatAppSecret',
])

/** 桌面端：setSetting 后异步同步到磁盘。写丢不管，下次存新值时覆盖。 */
async function syncToDisk() {
  if (!isDesktop) return
  try {
    const all = getAllSettings()
    await writeDiskConfig(all)
  } catch (e) {
    console.error('[configPersistence] writeDiskConfig failed:', e)
  }
}

/** 判断某个设置是否适用于当前平台 */
function appliesToCurrent(def: SettingDef): boolean {
  if (!def.platforms) return true
  return def.platforms.includes(currentPlatform)
}

/**
 * 初始化配置：将 DEFAULT_SETTINGS 中所有在 localStorage 中不存在的 key
 * 写入默认值。已有值的 key 跳过。同时迁移旧版 key 格式。
 * 不适用当前平台的 key 会跳过初始化。应在 main.ts 最早时机调用。
 */
export function initSettings(): void {
  // 迁移旧 key 格式（wechat-md-* → r-markdown-*）
  const migrations: [string, string][] = [
    ['r-markdown-auto-update', PREFIX + 'autoUpdate'],
    ['editor-page-zoom', PREFIX + 'pageZoom'],
    ['wechat-md-dark-mode', 'r-markdown-darkMode'],
    ['wechat-md-theme', 'r-markdown-theme'],
    ['wechat-md-editor-imgs', 'r-markdown-editorImgs'],
    ['wechat-md-editor-content', 'r-markdown-editorContent'],
    ['wechat-md-editor-save-time', 'r-markdown-editorSaveTime'],
  ]
  for (const [oldKey, newKey] of migrations) {
    if (localStorage.getItem(newKey) === null && localStorage.getItem(oldKey) !== null) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey)!)
      localStorage.removeItem(oldKey)
    }
  }

  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!appliesToCurrent(def)) continue
    const storageKey = PREFIX + key
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(def.default))
    }
  }
}

/**
 * 初始化加密层并解密 localStorage 中已有的敏感字段到内存缓存。
 * 应在 initSettings() 之后、任何 getSetting 读取敏感字段之前调用。
 * 同时兼容旧版明文格式：检测到后自动加密迁移。
 */
export async function initEncryption(): Promise<void> {
  await initCrypto()
  for (const key of SENSITIVE_KEYS) {
    const storageKey = PREFIX + key
    const stored = localStorage.getItem(storageKey)
    if (stored === null) continue

    // 尝试解密（已是加密格式）
    try {
      const plaintext = await decrypt(stored)
      sensitiveCache.set(key, plaintext)
      continue
    } catch {
      // 解密失败，可能是旧明文或损坏数据
    }

    // 迁移：旧版明文 JSON 格式
    if (isPlaintextJSON(stored)) {
      sensitiveCache.set(key, stored)
      try {
        const encrypted = await encrypt(stored)
        localStorage.setItem(storageKey, encrypted)
      } catch {
        // 加密失败不阻塞，下次 setSetting 会重试
      }
    } else {
      // 无法识别的格式，清除
      localStorage.removeItem(storageKey)
    }
  }
}

/**
 * 读取一个设置项的值。
 * 敏感字段从内存缓存读取（由 initEncryption 解密填充）。
 * 普通字段从 localStorage 读取，无记录时回退默认值。
 */
export function getSetting<T = unknown>(key: string): T {
  if (SENSITIVE_KEYS.has(key)) {
    const cached = sensitiveCache.get(key)
    if (cached !== undefined) {
      try {
        return JSON.parse(cached) as T
      } catch {
        return cached as unknown as T
      }
    }
    const def = (DEFAULT_SETTINGS as Record<string, SettingDef>)[key]
    return def?.default as T
  }

  const storageKey = PREFIX + key
  const raw = localStorage.getItem(storageKey)
  if (raw !== null) {
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }
  const def = (DEFAULT_SETTINGS as Record<string, SettingDef>)[key]
  return def?.default as T
}

/**
 * 写入一个设置项到 localStorage。桌面端同时同步到磁盘 JSON。
 * 敏感字段：先更新内存缓存，再异步加密写入 localStorage（不阻塞调用方）。
 */
export function setSetting(key: string, value: unknown): void {
  const serialized = JSON.stringify(value)

  if (SENSITIVE_KEYS.has(key)) {
    // 立即更新缓存，后续 getSetting 立即可用
    sensitiveCache.set(key, serialized)
    // 异步加密持久化
    encrypt(serialized).then((encrypted) => {
      localStorage.setItem(PREFIX + key, encrypted)
    }).catch(() => {
      // 加密失败兜底：明文存储（不应发生，但防崩溃）
      localStorage.setItem(PREFIX + key, serialized)
    })
  } else {
    const storageKey = PREFIX + key
    localStorage.setItem(storageKey, serialized)
    syncToDisk()
  }

  window.dispatchEvent(new CustomEvent('setting-changed', { detail: { key, value } }))
}

/** 导出当前所有设置（用于写入磁盘 JSON） */
export function getAllSettings(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!SENSITIVE_KEYS.has(key)) result[key] = getSetting(key)
  }
  return result
}

/**
 * 桌面端：从磁盘配置恢复到 localStorage。
 * 只恢复 DEFAULT_SETTINGS 中已声明的 key，忽略磁盘中的未知 key。
 * 不适用当前平台的 key 跳过。
 */
export async function restoreFromDiskConfig(): Promise<void> {
  const disk = await readDiskConfig()
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!appliesToCurrent(def)) continue
    if (key in disk) {
      const storageKey = PREFIX + key
      localStorage.setItem(storageKey, JSON.stringify(disk[key]))
    }
  }
}
