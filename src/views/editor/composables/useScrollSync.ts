import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

export function useScrollSync(
  isMobile: Ref<boolean>,
  mobileTab: Ref<'editor' | 'preview'>,
  nearBottom: Ref<boolean>,
) {
  const minimapScrollRatio = ref(0)
  const minimapViewportRatio = ref(0)

  // ── 滚动同步 ──
  let pendingRatio: number | null = null
  let syncSource: 'editor' | 'preview' | null = null
  let rafId = 0
  let isFlushing = false

  function flushSync() {
    rafId = 0
    if (pendingRatio === null || syncSource === null) return
    const ratio = pendingRatio
    const src = syncSource
    pendingRatio = null
    syncSource = null

    isFlushing = true
    if (src === 'editor') {
      const previewScroll = document.querySelector('.preview-scroll') as HTMLElement
      if (previewScroll) {
        const maxScroll = previewScroll.scrollHeight - previewScroll.clientHeight
        const target = ratio * maxScroll
        if (Math.abs(previewScroll.scrollTop - target) > 1) {
          previewScroll.scrollTop = target
        }
      }
    } else {
      const scroller = document.querySelector('.cm-scroller') as HTMLElement
      if (scroller) {
        const maxScroll = scroller.scrollHeight - scroller.clientHeight
        const target = ratio * maxScroll
        if (Math.abs(scroller.scrollTop - target) > 1) {
          scroller.scrollTop = target
        }
      }
    }
    isFlushing = false
  }

  function scheduleSync() {
    if (!rafId) rafId = requestAnimationFrame(flushSync)
  }

  function handleEditorScroll(ratio: number) {
    if (isFlushing) return
    if (isMobile.value && mobileTab.value !== 'editor') return
    syncSource = 'editor'
    pendingRatio = ratio
    scheduleSync()
  }

  function handlePreviewScroll(ratio: number) {
    if (isFlushing) return
    syncSource = 'preview'
    pendingRatio = ratio
    scheduleSync()
  }

  function onEditorScrollAll(ratio: number) {
    handleEditorScroll(ratio)
    if (isMobile.value) {
      nearBottom.value = ratio > 0.85
    }
  }

  // ── Minimap 导航 ──
  let previewScrollEl: HTMLElement | null = null
  let previewObserver: MutationObserver | null = null

  function onPreviewScroll() {
    if (isFlushing) return
    if (!previewScrollEl) previewScrollEl = document.querySelector('.preview-scroll')
    if (!previewScrollEl) return
    const maxScroll = previewScrollEl.scrollHeight - previewScrollEl.clientHeight
    if (maxScroll > 0) {
      const ratio = previewScrollEl.scrollTop / maxScroll
      handlePreviewScroll(ratio)
      if (isMobile.value) {
        nearBottom.value = ratio > 0.85
      }
    }
    minimapScrollRatio.value = maxScroll > 0 ? previewScrollEl.scrollTop / maxScroll : 0
    minimapViewportRatio.value =
      previewScrollEl.scrollHeight > 0
        ? previewScrollEl.clientHeight / previewScrollEl.scrollHeight
        : 1
  }

  function onMinimapNavigate(ratio: number) {
    const el = previewScrollEl
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    el.scrollTop = ratio * maxScroll
  }

  function resetMinimap() {
    minimapScrollRatio.value = 0
    minimapViewportRatio.value = 0
    if (previewScrollEl) {
      previewScrollEl.scrollTop = 0
    }
  }

  onMounted(() => {
    previewScrollEl = document.querySelector('.preview-scroll')
    if (previewScrollEl) {
      previewScrollEl.addEventListener('scroll', onPreviewScroll, { passive: true })
      previewObserver = new MutationObserver(() => {
        requestAnimationFrame(() => onPreviewScroll())
      })
      previewObserver.observe(previewScrollEl, { childList: true, subtree: true })
      requestAnimationFrame(() => onPreviewScroll())
      setTimeout(() => onPreviewScroll(), 350)
    }
  })

  onBeforeUnmount(() => {
    previewScrollEl?.removeEventListener('scroll', onPreviewScroll)
    previewObserver?.disconnect()
  })

  return {
    minimapScrollRatio,
    minimapViewportRatio,
    handleEditorScroll,
    handlePreviewScroll,
    onEditorScrollAll,
    onPreviewScroll,
    onMinimapNavigate,
    resetMinimap,
  }
}
