/**
 * AI 各面板的「结果保留时长」共用逻辑（纯逻辑，无 Vue、无网络、无 IndexedDB）。
 *
 * 三个 AI 面板（写作 / 排版 / 配图）用同一套保留规则：
 * - 有一个**保留时长**（默认 24 小时，可在设置里调），到点后结果自动作废；
 * - 计时**从最后一次请求算起**（滑动续期），不是从会话创建时刻算——
 *   用户一直在用就一直留得住，停手超过时长的下一次请求会从空白开始。
 *
 * 之前这套逻辑（normalizeHours / remainingMs / formatRemaining / 上下限常量）
 * 长在 aiWriteSession.ts 里、只服务写作面板；三个面板都要用之后抽到这里，
 * 各面板只负责自己的数据结构。
 */

/** 保留时长默认值（小时），与各面板的设置项默认值保持一致 */
export const DEFAULT_SESSION_HOURS = 24

/** 保留时长允许区间（小时），设置页滑块与这里的收敛逻辑共用 */
export const MIN_SESSION_HOURS = 1
export const MAX_SESSION_HOURS = 72

/** 一小时的毫秒数（各面板算 expiresAt 时共用，避免各处写 3600_000） */
export const HOUR_MS = 3600_000

/** 把任意输入收敛到合法的小时数（防手改配置或旧数据导致越界） */
export function normalizeHours(hours: unknown): number {
  const n = Number(hours)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SESSION_HOURS
  return Math.min(MAX_SESSION_HOURS, Math.max(MIN_SESSION_HOURS, Math.round(n)))
}

/**
 * 由「最后一次活动时刻」算过期时刻。
 * 所有面板的 expiresAt 都走这里，保证「从最后一次请求算起」的口径一致。
 */
export function expiresAtFrom(lastActiveAt: number, hours: number): number {
  return lastActiveAt + normalizeHours(hours) * HOUR_MS
}

/** 是否已过期（now >= expiresAt） */
export function isExpiredAt(expiresAt: number, now: number): boolean {
  return now >= expiresAt
}

/** 剩余有效时间（毫秒），已过期返回 0 */
export function remainingMs(expiresAt: number, now: number): number {
  return Math.max(0, expiresAt - now)
}

/** 剩余时间的可读文案；精度随剩余量变化，避免长时间停留时数字无意义地跳动 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '已过期'
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}
