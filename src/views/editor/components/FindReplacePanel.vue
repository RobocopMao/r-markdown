<script setup lang="ts">
/**
 * 查找替换面板。
 *
 * 替代 CodeMirror 自带的搜索面板（那套只有快捷键 + 英文按钮，对非技术用户不友好）。
 * 本组件只负责输入与展示，实际查找/替换由 Editor.vue 暴露的方法驱动 CodeMirror。
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
  CaseSensitive,
  GripHorizontal,
} from 'lucide-vue-next'
import { shortcut } from '@/utils/platform'

export interface FindSpec {
  search: string
  replace: string
  caseSensitive: boolean
  wholeWord: boolean
  regexp: boolean
}

const props = defineProps<{
  visible: boolean
  /** 匹配总数 */
  total: number
  /** 当前命中的序号（1-based，0 表示未落在某个匹配上） */
  current: number
  /** 正则语法无效 */
  invalid: boolean
}>()

const emit = defineEmits<{
  change: [spec: FindSpec]
  next: []
  prev: []
  replaceOne: []
  replaceAll: []
  close: []
}>()

const searchInput = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const search = ref('')
const replace = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const regexp = ref(false)
/** 替换行默认收起，降低视觉噪音；需要替换时再展开 */
const showReplace = ref(false)

// ── 全局拖拽定位 ──
// 面板通过 Teleport 挂到 body 并用 position: fixed，因此可以拖到窗口任意位置，
// 不受编辑器容器裁剪，也不会遮挡正文（拖走后即可让开）。
/** null 表示仍在默认位置（编辑器右上角），拖动后才写入视口坐标 */
const pos = ref<{ x: number; y: number } | null>(null)
const dragging = ref(false)

/** 面板默认位置：编辑器容器的右上角（避免整页最右侧太远，贴合用户视觉焦点） */
const anchor = ref<{ x: number; y: number } | null>(null)

/** 面板定位：拖动后使用视口坐标；否则用锚点算出的默认右上角 */
const panelStyle = computed(() => {
  if (pos.value) return { left: `${pos.value.x}px`, top: `${pos.value.y}px` }
  if (anchor.value) return { left: `${anchor.value.x}px`, top: `${anchor.value.y}px` }
  return { left: '50%', top: '72px' }
})

/** 把面板夹在视口内（四周留 8px 余量），保证永远可见可点 */
function clampToViewport(x: number, y: number) {
  const panel = panelRef.value
  if (!panel) return { x, y }
  const w = panel.offsetWidth || 420
  const h = panel.offsetHeight || 80
  const margin = 8
  const maxX = Math.max(margin, window.innerWidth - w - margin)
  const maxY = Math.max(margin, window.innerHeight - h - margin)
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  }
}

function onDragStart(e: PointerEvent) {
  // 只响应主键，避免右键/中键触发拖动
  if (e.button !== 0) return
  const panel = panelRef.value
  if (!panel) return

  e.preventDefault()
  e.stopPropagation()

  // 指针相对面板左上角的偏移，拖动时保持不跳变
  const rect = panel.getBoundingClientRect()
  const offsetX = e.clientX - rect.left
  const offsetY = e.clientY - rect.top

  const onMove = (ev: PointerEvent) => {
    const next = clampToViewport(ev.clientX - offsetX, ev.clientY - offsetY)
    pos.value = next
  }

  const onUp = () => {
    dragging.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }

  dragging.value = true
  // 立即把当前位置固化为视口坐标，避免首次移动时瞬移
  pos.value = clampToViewport(rect.left, rect.top)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

/** 双击手柄回到默认位置（编辑器右上角） */
function resetPosition() {
  pos.value = null
}

/** 计算默认锚点：编辑器容器右上角；容器不可用时退回页面右上角 */
function computeAnchor() {
  const panel = panelRef.value
  // Teleport 到 body 后 offsetParent 为 body，需通过父组件传入的选择器定位编辑器区域
  const host = document.querySelector('[data-find-anchor]') as HTMLElement | null
  const w = panel?.offsetWidth || 420
  if (host) {
    const r = host.getBoundingClientRect()
    return clampToViewport(r.right - w - 12, r.top + 12)
  }
  return clampToViewport(window.innerWidth - w - 12, 72)
}

/** 视口尺寸变化时重算锚点/夹取，避免面板跑到屏幕外 */
function reclamp() {
  const panel = panelRef.value
  if (!panel || !panel.offsetWidth) return
  if (pos.value) {
    pos.value = clampToViewport(pos.value.x, pos.value.y)
  } else {
    anchor.value = computeAnchor()
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onWindowResize() {
  // 拖动窗口时高频触发，轻量防抖
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(reclamp, 120)
}

onMounted(() => {
  anchor.value = computeAnchor()
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  if (resizeTimer) clearTimeout(resizeTimer)
  dragging.value = false
})

function currentSpec(): FindSpec {
  return {
    search: search.value,
    replace: replace.value,
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    regexp: regexp.value,
  }
}

// 任一条件变化即同步给编辑器
watch([search, replace, caseSensitive, wholeWord, regexp], () => emit('change', currentSpec()))

/** 计数文案：正则非法 > 未输入 > 无结果 > 第 n/m 项 */
const counterText = computed(() => {
  if (props.invalid) return '正则无效'
  if (!search.value) return ''
  if (props.total === 0) return '无结果'
  return props.current > 0 ? `${props.current}/${props.total}` : `${props.total}`
})

const counterClass = computed(() =>
  props.invalid || (search.value && props.total === 0) ? 'text-[#e74c3c]' : '',
)

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    // Shift+Enter 反向查找，与编辑器快捷键一致
    e.shiftKey ? emit('prev') : emit('next')
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

function onReplaceKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

/** 展开替换行并把焦点移到查找框 */
async function open(withReplace = false) {
  if (withReplace) showReplace.value = true
  await nextTick()
  searchInput.value?.focus()
  searchInput.value?.select()
}

/** 打开时若编辑器里有选中文字，带过来作为查找词 */
function seed(text: string) {
  if (!text) return
  search.value = text
}

/** 关闭时清空高亮，但保留用户输入的查找词，下次打开还在 */
function resetHighlights() {
  emit('change', { ...currentSpec(), search: '' })
}

defineExpose({ open, seed, resetHighlights, focus: () => searchInput.value?.focus() })
</script>

<template>
  <!--
    挂到 body 并用 fixed 定位：可拖到窗口任意位置，不受编辑器容器 overflow 裁剪。
    z-index 取 900 —— 低于弹窗类（BaseDialog 999 / ConfirmDialog 1000 / PromptDialog 1100），
    高于编辑器内部浮层，保证被对话框遮挡时不会盖住对话框。
  -->
  <Teleport to="body">
    <div
      v-show="visible"
      ref="panelRef"
      class="fixed z-[900] w-[420px] max-w-[calc(100vw-16px)] rounded-lg border text-[12px]"
      :class="dragging ? 'shadow-2xl' : 'shadow-lg'"
      :style="[
        {
          background: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)',
        },
        panelStyle,
      ]"
      @keydown.esc.stop="emit('close')"
    >
      <!-- 查找行（空白处可拖动面板） -->
      <div class="flex items-center gap-1 px-2 py-1.5">
        <button
          class="flex items-center justify-center w-5 h-5 shrink-0 border-none bg-transparent cursor-pointer rounded transition-colors hover:bg-black/5"
          style="color: var(--text-muted)"
          :aria-label="showReplace ? '收起替换' : '展开替换'"
          @click="showReplace = !showReplace"
        >
          <ChevronDown v-if="showReplace" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>

        <!-- 拖拽手柄：提示可以拖动改变位置 -->
        <span
          class="find-drag-handle shrink-0"
          @pointerdown="onDragStart"
          @dblclick="resetPosition"
        >
          <GripHorizontal :size="14" />
        </span>

        <Search :size="14" class="shrink-0" style="color: var(--text-muted)" />

        <input
          ref="searchInput"
          v-model="search"
          type="text"
          placeholder="查找"
          class="flex-1 min-w-0 h-7 px-2 rounded-[5px] outline-none border bg-transparent"
          :style="{
            borderColor: invalid ? '#e74c3c' : 'var(--border-color)',
            color: 'var(--text-primary)',
          }"
          @keydown="onSearchKeydown"
        />

        <span
          v-if="counterText"
          class="shrink-0 px-1 tabular-nums whitespace-nowrap"
          :class="counterClass"
          style="color: var(--text-muted)"
          >{{ counterText }}</span
        >

        <button
          class="flex items-center justify-center w-6 h-6 shrink-0 border-none bg-transparent cursor-pointer rounded transition-colors hover:bg-black/5 disabled:opacity-30"
          style="color: var(--text-secondary)"
          aria-label="上一个"
          :disabled="total === 0"
          @click="emit('prev')"
        >
          <ChevronUp :size="14" />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 shrink-0 border-none bg-transparent cursor-pointer rounded transition-colors hover:bg-black/5 disabled:opacity-30"
          style="color: var(--text-secondary)"
          aria-label="下一个"
          :disabled="total === 0"
          @click="emit('next')"
        >
          <ChevronDown :size="14" />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 shrink-0 border-none bg-transparent cursor-pointer rounded transition-colors hover:bg-black/5"
          style="color: var(--text-secondary)"
          aria-label="关闭"
          @click="emit('close')"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- 替换行 -->
      <div v-if="showReplace" class="flex items-center gap-1 px-2 pb-1.5">
        <!-- 占位对齐上面的「折叠箭头 + 拖拽手柄 + 放大镜」三列 -->
        <span class="w-5 shrink-0" />
        <span class="shrink-0" style="width: 14px" />
        <Replace :size="14" class="shrink-0" style="color: var(--text-muted)" />
        <input
          v-model="replace"
          type="text"
          placeholder="替换为"
          class="flex-1 min-w-0 h-7 px-2 rounded-[5px] outline-none border bg-transparent"
          style="border-color: var(--border-color); color: var(--text-primary)"
          @keydown="onReplaceKeydown"
        />
        <button
          class="shrink-0 h-7 px-2 rounded-[5px] border cursor-pointer whitespace-nowrap transition-colors disabled:opacity-30"
          style="border-color: var(--border-color); color: var(--text-secondary)"
          :disabled="total === 0"
          @click="emit('replaceOne')"
        >
          替换
        </button>
        <button
          class="shrink-0 h-7 px-2 rounded-[5px] border cursor-pointer whitespace-nowrap transition-colors disabled:opacity-30"
          style="border-color: var(--border-color); color: var(--text-secondary)"
          :disabled="total === 0"
          @click="emit('replaceAll')"
        >
          全部替换
        </button>
      </div>

      <!-- 选项行 -->
      <div
        class="flex items-center gap-1 px-2 py-1.5 border-t"
        :style="{ borderColor: 'var(--border-color)' }"
      >
        <button
          class="find-opt"
          :class="{ 'find-opt-on': caseSensitive }"
          :aria-pressed="caseSensitive"
          aria-label="区分大小写"
          @click="caseSensitive = !caseSensitive"
        >
          <CaseSensitive :size="13" />
          <span>Aa</span>
        </button>
        <button
          class="find-opt"
          :class="{ 'find-opt-on': wholeWord }"
          :aria-pressed="wholeWord"
          aria-label="全词匹配"
          @click="wholeWord = !wholeWord"
        >
          全词
        </button>
        <button
          class="find-opt"
          :class="{ 'find-opt-on': regexp }"
          :aria-pressed="regexp"
          aria-label="使用正则表达式"
          @click="regexp = !regexp"
        >
          正则
        </button>
        <span class="ml-auto text-[11px]" style="color: var(--text-muted)">
          Enter 下一个 · {{ shortcut('shift', 'Enter') }} 上一个
        </span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.find-opt {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 7px;
  border-radius: 5px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.find-opt:hover {
  background: rgba(var(--accent-rgb), 0.08);
}

.find-opt-on {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.12);
  font-weight: 600;
}

/* 拖拽手柄：抓取光标 + 悬停高亮，明确「这里可以拖」 */
.find-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 22px;
  color: var(--text-muted);
  cursor: grab;
  touch-action: none;
  border-radius: 4px;
  transition: color 0.15s ease;
}

.find-drag-handle:hover {
  color: var(--accent);
}

.find-drag-handle:active {
  cursor: grabbing;
}
</style>
