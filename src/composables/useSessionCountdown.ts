/**
 * AI 面板的「保留倒计时」。
 *
 * 三个面板（写作 / 排版 / 配图）头部都显示同一个东西：结果还能留多久。
 * 口径都是「从最后一次请求算起」（滑动续期），只是**保留时长各用各的设置项**
 * （写作 aiWriteSessionHours / 排版 aiFormatSessionHours / 配图 aiImageSessionHours）。
 *
 * 这个 composable 只管两件事：
 * 1. 读该面板自己的保留时长（normalizeHours）；
 * 2. 每秒刷新剩余文案，但**只在文案真的变了时才写 ref**，
 *    这样「23 小时 58 分」期间每秒都不会触发重渲染，只有跨分钟才更新。
 *
 * 各面板自己维护 expiresAt（并在发起请求时把它推到 now + 时长），
 * 这里只负责读它、渲染它。
 */

import { onBeforeUnmount, ref } from 'vue'
import { getSetting } from '@/config/settings'
import { formatRemaining, normalizeHours, remainingMs } from '@/utils/aiSession'

/** 各面板的保留时长设置项 key */
export type SessionHoursKey = 'aiWriteSessionHours' | 'aiFormatSessionHours' | 'aiImageSessionHours'

export function useSessionCountdown(hoursKey: SessionHoursKey) {
  /** 用于过期判定与倒计时展示的「当前时间」 */
  const now = ref(Date.now())
  /** 剩余时间文案；用 ref 驱动而不是 computed，避免每秒重算整棵树 */
  const remainingText = ref('')

  let tickTimer: ReturnType<typeof setInterval> | null = null

  function currentHours(): number {
    return normalizeHours(getSetting<number>(hoursKey))
  }

  function stopTicker() {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  /** 立刻按给定过期时刻刷新一次文案（打开面板、续期后调用） */
  function syncText(expiresAt: number) {
    remainingText.value = formatRemaining(remainingMs(expiresAt, now.value))
  }

  /** 开始每秒 tick；重复调用会先停掉旧的 */
  function startTicker(getExpiresAt: () => number | null) {
    stopTicker()
    tickTimer = setInterval(() => {
      now.value = Date.now()
      const expiresAt = getExpiresAt()
      if (expiresAt == null) return
      const text = formatRemaining(remainingMs(expiresAt, now.value))
      if (text !== remainingText.value) remainingText.value = text
    }, 1000)
  }

  onBeforeUnmount(stopTicker)

  return { now, remainingText, currentHours, startTicker, stopTicker, syncText }
}
