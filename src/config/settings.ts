import { DEFAULT_SETTINGS, type SettingDef } from './defaults'
import { writeDiskConfig, readDiskConfig } from '@/services/configPersistence'

const PREFIX = 'r-markdown-'
const isDesktop = import.meta.env.VITE_TAURI === 'true'
type Platform = 'desktop' | 'web'
const currentPlatform: Platform = isDesktop ? 'desktop' : 'web'

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
 * 读取一个设置项的值。优先从 localStorage 取，无记录时回退到默认值。
 */
export function getSetting<T = unknown>(key: string): T {
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
 */
export function setSetting(key: string, value: unknown): void {
  const storageKey = PREFIX + key
  localStorage.setItem(storageKey, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('setting-changed', { detail: { key, value } }))
  syncToDisk()
}

const SENSITIVE_KEYS: Set<string> = new Set([
  'cloudArticleToken',
  'cloudArticleRepo',
  'githubRepo',
  'githubToken',
  'letaToken',
  'wechatAppId',
  'wechatAppSecret',
])

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
