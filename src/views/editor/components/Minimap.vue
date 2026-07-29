<script setup vapor lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import type { ThemeColors } from '@/composables/useTheme'

const props = defineProps<{
  markdown: string
  colors: ThemeColors
  scrollRatio: number
  viewportRatio: number
  previewWidth: number
}>()

const emit = defineEmits<{
  navigate: [ratio: number]
}>()

const renderedHtml = ref('')
const minimapRef = ref<HTMLElement>()
const innerRef = ref<HTMLElement>()
const unscaledContentH = ref(0)
const minimapScrollRatio = ref(0)

const CONTAINER_W = 80

// Minimap 渲染宽度与 Preview 的 phone-frame 一致，确保文本换行相同
const contentWidth = computed(() => props.previewWidth || 700)
const scaleFactor = computed(() => CONTAINER_W / contentWidth.value)

watch(
  () => props.markdown,
  async (md) => {
    if (!md) {
      renderedHtml.value = ''
      unscaledContentH.value = 0
      minimapScrollRatio.value = 0
      return
    }
    // 内容变化时重置内部滚动位置，避免旧位置与新内容不匹配
    minimapScrollRatio.value = 0
    renderedHtml.value = await parseMarkdownAsync(md, props.colors)
    await nextTick()
    if (innerRef.value) {
      unscaledContentH.value = innerRef.value.scrollHeight
    }
  },
  { immediate: true },
)

watch(
  () => props.colors,
  async (c) => {
    if (!props.markdown) return
    renderedHtml.value = await parseMarkdownAsync(props.markdown, c)
    await nextTick()
    if (innerRef.value) {
      unscaledContentH.value = innerRef.value.scrollHeight
    }
  },
)

// 内容变化时重新读取高度
watch(contentWidth, async () => {
  if (!renderedHtml.value) return
  await nextTick()
  if (innerRef.value) {
    unscaledContentH.value = innerRef.value.scrollHeight
  }
})

// ── ResizeObserver：持续追踪异步内容（mermaid / 图片）加载后的高度变化 ──
let resizeObserver: ResizeObserver | null = null

watch(innerRef, (el) => {
  resizeObserver?.disconnect()
  if (el) {
    resizeObserver = new ResizeObserver(() => {
      unscaledContentH.value = el.scrollHeight
    })
    resizeObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

const visualH = computed(() => unscaledContentH.value * scaleFactor.value)

const maxScroll = computed(() => {
  const ch = minimapRef.value?.clientHeight ?? 0
  return Math.max(0, visualH.value - ch)
})

// 指示条在可视内容坐标系中的位置。
// EditorPage 的 scrollRatio = scrollTop / (scrollHeight - clientHeight)，
// 指示条顶部在内容中的比例 = scrollTop / scrollHeight = scrollRatio * (1 - viewportRatio)
const indicatorTopInContent = computed(
  () => props.scrollRatio * visualH.value * (1 - props.viewportRatio),
)
const indicatorBottomInContent = computed(
  () => indicatorTopInContent.value + props.viewportRatio * visualH.value,
)

// minimap 视口在内容中的范围
const viewTop = computed(() => minimapScrollRatio.value * maxScroll.value)
const viewBottom = computed(() => {
  const ch = minimapRef.value?.clientHeight ?? 0
  return viewTop.value + ch
})

// 预览滚动时自动跟随 minimap
watch([indicatorTopInContent, indicatorBottomInContent], () => {
  const max = maxScroll.value
  if (max <= 0) return
  const ch = minimapRef.value?.clientHeight ?? 0
  const vTop = viewTop.value
  const vBottom = viewBottom.value
  const iTop = indicatorTopInContent.value
  const iBottom = indicatorBottomInContent.value

  if (iTop < vTop) {
    minimapScrollRatio.value = Math.max(0, iTop / max)
  } else if (iBottom > vBottom) {
    minimapScrollRatio.value = Math.min(1, (iBottom - ch) / max)
  }
})

const scrollOffset = computed(() => minimapScrollRatio.value * maxScroll.value)

const innerStyle = computed(() => {
  const s = scaleFactor.value
  const visualW = contentWidth.value * s
  const tx = (CONTAINER_W - visualW) / 2
  return {
    width: `${contentWidth.value}px`,
    transform: `translateX(${tx}px) translateY(${-scrollOffset.value}px) scale(${s})`,
    transformOrigin: 'top left',
  }
})

const indicatorStyle = computed(() => {
  const top = indicatorTopInContent.value - scrollOffset.value
  const height = Math.max(2, props.viewportRatio * visualH.value)
  return {
    top: `${top}px`,
    height: `${height}px`,
  }
})

function onWheel(e: WheelEvent) {
  const max = maxScroll.value
  if (max <= 0) return
  minimapScrollRatio.value = Math.max(0, Math.min(1, minimapScrollRatio.value + e.deltaY / max))
}

function onClick(e: MouseEvent) {
  if (!minimapRef.value || visualH.value <= 0) return
  const rect = minimapRef.value.getBoundingClientRect()
  const viewY = e.clientY - rect.top
  const clickVisualY = viewY + scrollOffset.value
  const denom = 1 - props.viewportRatio
  if (denom <= 0) return
  const ratio = Math.max(
    0,
    Math.min(1, (clickVisualY / visualH.value - props.viewportRatio / 2) / denom),
  )
  emit('navigate', ratio)
}
</script>

<template>
  <div
    ref="minimapRef"
    class="relative w-20 h-full overflow-hidden shrink-0 ml-2.5 rounded-xl bg-[var(--bg-primary,#fff)] cursor-pointer"
    @click="onClick"
    @wheel.prevent="onWheel"
  >
    <div
      v-if="renderedHtml"
      ref="innerRef"
      class="relative pointer-events-none"
      :style="innerStyle"
    >
      <div
        class="text-[#333] text-[15px] leading-[1.8] break-words bg-transparent p-[18px]"
        :style="{ width: contentWidth + 'px' }"
        v-html="renderedHtml"
      ></div>
    </div>
    <div
      class="absolute left-0 right-0 rounded-xl border border-[var(--accent,#6c5ce7)] bg-[var(--accent,#6c5ce7)]/15 pointer-events-none transition-[top,height] duration-100 ease-linear"
      :style="indicatorStyle"
    ></div>
  </div>
</template>

<style scoped>
:global([data-theme='dark']) .minimap {
  background: var(--bg-primary, #1a1a1a);
  border-color: rgba(255, 255, 255, 0.1);
}
</style>
