<script setup lang="ts">
/**
 * 通用大图预览浮层。
 *
 * 用途：任何「缩略图 → 点开看大图」的场景都复用它，不要再各写一份 Teleport 浮层。
 * 用法（命令式，状态在组件内部）：
 *
 *   <ImagePreview ref="imagePreviewRef" />
 *   imagePreviewRef.value?.open(src, '可选的说明文字')
 *
 * 三个必须注意的点（都是从图库那版踩出来的）：
 * 1. 浮层 Teleport 到 body：调用方常常挂在 BaseDrawer / BaseDialog 里，
 *    那些面板带 overflow: hidden 与滑入动画的 transform，position: fixed 在里面
 *    会退化成相对面板定位、直接被裁掉。
 * 2. 层级 z-[1200]：BaseDrawer / BaseDialog 是 z-[999]、ConfirmDialog 1000、
 *    PromptDialog 1100，大图要盖在它们之上；全局 tooltip 是 z-[9999]，仍在上层
 *    （有意为之，悬停提示不该被大图挡掉）。
 * 3. Esc 走捕获阶段 + stopPropagation：否则 Escape 会先被编辑器 / 抽屉的其它
 *    Esc 逻辑吃掉，出现「按了没反应」或「大图和抽屉一起关」。
 *
 * 说明行里的像素尺寸只能等 <img> 的 @load 回填：传进来的 src 通常是缩略图
 * dataUrl 或 blob URL，本身带不出宽高；必须取 naturalWidth / naturalHeight
 * （不能用 offsetWidth，那是被 object-contain 缩放后的显示尺寸）。
 * 解码失败时保持 0，那一行就只显示说明文字，不会出现「0 × 0」。
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'

const visible = ref(false)
const src = ref('')
const caption = ref('')
const width = ref(0)
const height = ref(0)

/** 大图下方那行说明：像素尺寸在前，调用方给的说明在后 */
const meta = computed(() => {
  const dims = width.value > 0 && height.value > 0 ? `${width.value} × ${height.value}` : ''
  return [dims, caption.value].filter(Boolean).join(' · ')
})

/**
 * 打开大图。
 * @param imageSrc 图片地址（dataUrl / blob URL / 普通 URL 都行）
 * @param imageCaption 大图下方那行说明，可省略
 */
function open(imageSrc: string | undefined | null, imageCaption = '') {
  // 磁盘图片等场景的地址是异步补上的，没就绪时直接不打开，别留个空白浮层
  if (!imageSrc) return
  src.value = imageSrc
  caption.value = imageCaption
  width.value = 0
  height.value = 0
  visible.value = true
  window.addEventListener('keydown', onKeydown, true)
}

function close() {
  visible.value = false
  window.removeEventListener('keydown', onKeydown, true)
}

/** Esc 关浮层；捕获阶段拦下来，避免被下层组件的 Esc 逻辑抢先处理 */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !visible.value) return
  e.stopPropagation()
  close()
}

function onImageLoaded(e: Event) {
  const el = e.target as HTMLImageElement | null
  if (!el) return
  width.value = el.naturalWidth || 0
  height.value = el.naturalHeight || 0
}

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))

defineExpose({ open, close, visible })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[1200] flex flex-col items-center justify-center gap-3 bg-black/80 p-6 backdrop-blur-sm"
      @click.self="close"
    >
      <img
        :src="src"
        :alt="caption"
        class="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
        @load="onImageLoaded"
        @click.stop
      />
      <div v-if="meta" class="text-xs text-white/70 tabular-nums">{{ meta }}</div>
      <button
        class="absolute right-5 top-5 flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-white transition-colors hover:bg-white/20"
        title="关闭（Esc）"
        @click="close"
      >
        <X :size="18" />
      </button>
    </div>
  </Teleport>
</template>
