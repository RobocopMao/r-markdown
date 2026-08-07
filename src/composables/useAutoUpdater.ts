import { onMounted, ref, watch } from 'vue'
import { invoke, Channel } from '@tauri-apps/api/core'
import { getSetting, setSetting } from '@/config/settings'
import { startupState } from '@/services/startupCheck'

const isTauri = import.meta.env.VITE_TAURI === 'true'

/** 发布版本变更说明的 GitHub 仓库（固定） */
const RELEASE_REPO = 'RobocopMao/r-markdown'
/** 按版本缓存变更说明，避免重复请求 */
const releaseNotesCache = new Map<string, string>()

/**
 * 从 GitHub Releases 拉取指定版本的变更说明。
 * 发布体是 markdown，只保留「变更」正文（去掉"## 下载"段落），并转纯文本。
 * 任何失败（离线/限流/无该版本）都返回空字符串，不抛错、不影响更新流程。
 */
async function fetchReleaseNotes(version: string): Promise<string> {
  const cached = releaseNotesCache.get(version)
  if (cached !== undefined) return cached

  const tag = `v${version.replace(/^v/i, '')}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${tag}`,
      { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal },
    )
    clearTimeout(timer)
    if (!res.ok) return ''

    const data = (await res.json()) as { body?: string }
    let body = (data.body || '').replace(/##\s*下载[\s\S]*$/, '').trim()
    body = body
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/^变更$/m, '本次更新内容：')
      .trim()
    releaseNotesCache.set(version, body)
    return body
  } catch {
    return ''
  }
}

/** 从 Rust invoke 返回的原始更新元数据（含 rid） */
export interface RawUpdateMeta {
  rid: number
  version: string
  currentVersion: string
  date?: string
  body?: string
}

/** 供 UI 使用的更新信息 */
export interface UpdateInfo {
  version: string
  currentVersion: string
  date?: string
  body?: string
}

export interface CheckResult {
  update: UpdateInfo | null
  error: string | null
  /** 原始 rid，下载时直接传给 invoke */
  rid: number | null
}

/** 启动自动检查时发现的新版本，组件可 watch 此 ref 弹窗 */
export const autoUpdatePending = ref<UpdateInfo | null>(null)
/** 与 autoUpdatePending 对应的 raw rid */
export const autoUpdateRid = ref<number | null>(null)
/** 自动检查更新开关，通过统一的 settings 层读写 */
export const autoUpdateEnabled = ref<boolean>(getSetting<boolean>('autoUpdate'))

// 持久化开关状态
watch(autoUpdateEnabled, (val) => {
  setSetting('autoUpdate', val)
})

/**
 * 手动检查更新。完全绕过 @tauri-apps/plugin-updater 的 Resource 类，
 * 通过 invoke 直接获取原始数据，避免 ES2022 private field WeakMap 跨模块失败。
 */
export async function checkForUpdates(): Promise<CheckResult> {
  if (!isTauri) return { update: null, error: '当前环境不支持自动更新', rid: null }

  try {
    const raw = await Promise.race([
      invoke<RawUpdateMeta | null>('plugin:updater|check', {
        headers: [['User-Agent', 'R-Markdown-Updater/1.0']],
        timeout: 30000,
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('检查更新超时，请检查网络后重试')), 15000),
      ),
    ])
    if (!raw) return { update: null, error: null, rid: null }

    const body = await fetchReleaseNotes(raw.version)

    return {
      update: {
        version: raw.version,
        currentVersion: raw.currentVersion,
        date: raw.date,
        body: body || raw.body,
      },
      error: null,
      rid: raw.rid,
    }
  } catch (e: unknown) {
    console.error('[updater] checkForUpdates error:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return { update: null, error: msg, rid: null }
  }
}

/**
 * 使用 raw rid 直接调用下载安装（绕过 Update 类的 private field）。
 */
export async function downloadUpdateWithRid(
  rid: number,
  onEvent: (event: {
    event: string
    data?: { contentLength?: number; chunkLength?: number }
  }) => void,
): Promise<void> {
  const c = new Channel<{
    event: string
    data?: { contentLength?: number; chunkLength?: number }
  }>()
  c.onmessage = onEvent
  await invoke('plugin:updater|download_and_install', {
    onEvent: c,
    rid,
  })
}

function autoCheck() {
  setTimeout(async () => {
    // 等待配置恢复弹窗处理完毕，避免两弹窗重叠；最多等 60s 后放弃本次检查
    if (!startupState.resolved) {
      await new Promise<void>((resolve) => {
        const stop = watch(
          () => startupState.resolved,
          (v) => {
            if (v) {
              stop()
              resolve()
            }
          },
        )
        // 超时保护：避免用户始终不处理弹窗导致 watcher 永久泄漏 + Promise 永久 pending
        setTimeout(() => {
          stop()
          resolve()
        }, 60000)
      })
    }
    if (!autoUpdateEnabled.value) return
    const { update, rid } = await checkForUpdates()
    if (update) {
      autoUpdatePending.value = update
      autoUpdateRid.value = rid
    }
  }, 3000)
}

/**
 * Tauri 自动更新检查（仅在桌面客户端环境下生效，不影响网页版）
 * 启动后延迟 3 秒静默检查，有更新时通过 autoUpdatePending ref 通知 UI 弹窗。
 */
export function useAutoUpdater() {
  onMounted(() => {
    if (isTauri) autoCheck()
  })
}
