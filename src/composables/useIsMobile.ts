import { ref, computed, onBeforeUnmount, type Ref } from 'vue'

/** 移动端断点，与编辑器布局（md）保持一致 */
export const MOBILE_BREAKPOINT = 768

/**
 * 响应式判断当前是否为「移动端 Web（窄屏 且 非桌面客户端）」。
 *
 * 注意：桌面客户端（Tauri）窗口可被拖窄到 768px 以下，但它依然支持
 * 本地磁盘 / 本地文章存储，因此不能只按宽度判断，必须排除 Tauri，
 * 否则桌面端缩窄窗口后会丢失「本地存储」等选项。
 *
 * 移动端 Web 与浏览器端一致：没有本地存储，图片粘贴/拖拽强制走 GitHub 图床。
 */
export function useIsMobileWeb(): Ref<boolean> {
  const isTauri = import.meta.env.VITE_TAURI === 'true'
  const isNarrow = ref(window.innerWidth < MOBILE_BREAKPOINT)

  const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  const onChange = (e: MediaQueryListEvent) => {
    isNarrow.value = e.matches
  }
  mq.addEventListener('change', onChange)
  onBeforeUnmount(() => mq.removeEventListener('change', onChange))

  return computed(() => !isTauri && isNarrow.value)
}
