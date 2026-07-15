<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { Check, Pin } from 'lucide-vue-next'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import { resolveIdbImages } from '@/utils/imageDB'
import { useTheme } from '@/composables/useTheme'
import { useMermaid } from '@/composables/useMermaid'

const props = defineProps<{
  name: string
  category: string
  author?: string
  description?: string
  updatedAt?: string
  content?: string
  isAdded?: boolean
  selected?: boolean
  active?: boolean
  showCheck?: boolean
  compact?: boolean
  pinned?: boolean
}>()

const emit = defineEmits<{
  click: []
  pin: []
}>()

const { colors } = useTheme()
const { renderAll } = useMermaid()

const renderedContent = ref('')
const contentRef = ref<HTMLElement | null>(null)

async function refreshRendered() {
  if (!props.content) {
    renderedContent.value = ''
    return
  }
  try {
    const resolvedContent = await resolveIdbImages(props.content)
    let html = await parseMarkdownAsync(resolvedContent, colors.value)
    // 处理 mermaid
    if (html.includes('class="mermaid"')) {
      const tmp = document.createElement('div')
      tmp.style.position = 'absolute'
      tmp.style.visibility = 'hidden'
      tmp.style.pointerEvents = 'none'
      tmp.innerHTML = html
      document.body.appendChild(tmp)
      await renderAll(tmp)
      html = tmp.innerHTML
      document.body.removeChild(tmp)
    }
    renderedContent.value = html
  } catch (e) {
    console.error('MaterialCard render failed:', e)
    renderedContent.value = ''
  }
}

watch(() => props.content, refreshRendered, { immediate: true })
watch(colors, () => {
  if (props.content) refreshRendered()
})

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch { return '' }
}

const CATEGORY_COLORS: Record<string, string> = {
  '标题': '#6366f1',
  '卡片': '#f59e0b',
  '分隔线': '#10b981',
  '图文': '#3b82f6',
  '引导关注': '#ec4899',
  '引用': '#8b5cf6',
  '代码块': '#14b8a6',
  '列表': '#f97316',
  '其他': '#6b7280',
}

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || '#6b7280'
}
</script>

<template>
  <div
    class="material-card group relative overflow-hidden rounded-[10px] p-3 cursor-pointer transition-all duration-200 select-none border border-[var(--border-color,#e0e0e0)] bg-[var(--bg-primary,#fff)] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"
    :class="[
      selected || active
        ? '!border-[var(--accent)] !shadow-[0_0_0_2px_var(--accent-light,rgba(108,92,231,0.15)),0_4px_16px_rgba(0,0,0,0.08)] -translate-y-px dark:!shadow-[0_0_0_2px_var(--accent-light,rgba(108,92,231,0.3))]'
        : 'hover:-translate-y-px hover:border-[var(--accent)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] dark:hover:shadow-none',
      compact ? 'text-[11px]' : 'text-[12px]',
    ]"
    @click="emit('click')"
  >
    <!-- 多选勾选框 -->
    <div
      v-if="showCheck"
      class="absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10"
      :class="selected
        ? 'bg-[var(--accent)] border-[var(--accent)]'
        : 'border-[#ccc] dark:border-[#555] bg-white dark:bg-[#2a2a2a]'"
    >
      <Check v-if="selected" :size="12" class="text-white" />
    </div>

    <!-- 置顶按钮 -->
    <button
      v-if="!showCheck"
      class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors border-none z-10"
      :class="pinned
        ? 'bg-[color-mix(in_srgb,_var(--accent)_12%,_transparent)] text-[var(--accent)]'
        : 'bg-white/80 dark:bg-[#2a2a2a]/80 text-[#999] dark:text-[#666] opacity-0 group-hover:opacity-100 hover:opacity-100'"
      :title="pinned ? '取消置顶' : '置顶'"
      @click.stop="emit('pin')"
    >
      <Pin :size="12" :fill="pinned ? 'currentColor' : 'none'" />
    </button>

    <!-- 内容预览 -->
    <div
      v-if="renderedContent"
      class="material-preview w-full overflow-hidden rounded-md mb-2 dark:border-[#333]"
    >
      <div class="material-preview-inner" v-html="renderedContent" />
    </div>

    <!-- 卡片信息 -->
    <div class="card-info">
      <div class="card-body">
        <div class="flex items-center gap-1.5">
          <div class="font-medium truncate">{{ name }}</div>
          <span
            class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
            :style="{ background: `${categoryColor(category)}15`, color: categoryColor(category) }"
          >
            {{ category }}
          </span>
        </div>
        <p v-if="description" class="text-[10px] opacity-50 truncate mt-0.5">{{ description }}</p>
        <p v-if="author" class="text-[10px] opacity-50 truncate mt-0.5">作者：{{ author }}<span v-if="updatedAt"> ｜ {{ formatDate(updatedAt) }}</span></p>
      </div>
    </div>

    <!-- 已添加标记 -->
    <div
      v-if="isAdded"
      class="absolute inset-0 flex items-center justify-center rounded-xl z-20 pointer-events-none"
      :style="{ background: 'color-mix(in srgb, var(--accent) 90%, transparent)' }"
    >
      <span class="text-white text-[11px] font-medium flex items-center gap-1">
        <Check :size="13" /> 已添加
      </span>
    </div>
  </div>
</template>

<style scoped>
.material-preview :deep(span) {
 line-height: 1.8;
}
</style>
