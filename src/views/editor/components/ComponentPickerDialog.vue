<script setup vapor lang="ts">
import { ref, computed, watch } from 'vue'
import { components } from '@/extension'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import { useTheme } from '@/composables/useTheme'
import { useMermaid } from '@/composables/useMermaid'
import BaseDrawer from '@/components/BaseDrawer.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  insert: [code: string]
}>()

const { colors } = useTheme()
const { renderAll } = useMermaid()

const contentRef = ref<HTMLElement | null>(null)

const categories = [
  { key: 'title', label: '标题' },
  { key: 'content', label: '内容' },
  { key: 'layout', label: '布局' },
  { key: 'image', label: '图片' },
  { key: 'interactive', label: '互动' },
  { key: 'other', label: '其他' },
]

const componentCategoryMap: Record<string, string> = {
  Title_DA01: 'title',
  Title_DA02: 'title',
  PTitle_DA01: 'title',
  PTitle_DA02: 'title',
  Breaking_DA01: 'title',
  Lead_DA01: 'content',
  Statement_DA01: 'content',
  Steps_DA01: 'layout',
  Steps_DA02: 'layout',
  CaseFlow_DA01: 'layout',
  Compare_DA01: 'layout',
  Compare_DA02: 'layout',
  Table_DA01: 'layout',
  Timeline_DA01: 'layout',
  Chart_DA01: 'other',
  CTA_DA01: 'interactive',
  Engage_DA01: 'interactive',
  Engage_DA02: 'interactive',
  Slider_DA01: 'image',
  Img_DA01: 'image',
  Badges_DA01: 'other',
  Mermaid_DA01: 'other',
}

const activeCategory = ref('title')
const selectedId = ref<string | null>(null)

type CompItem = {
  id: string
  name: string
  idSuffix: string
  example: string
  rendered: string
}

const compItems = ref<CompItem[]>([])

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    selectedId.value = null
    activeCategory.value = 'title'
    await refreshRendered()
  },
)

// 主题色切换时重新渲染所有组件预览 HTML
watch(colors, async () => {
  if (!props.visible) return
  await refreshRendered()
})

async function refreshRendered() {
  const c = colors.value
  const items = await Promise.all(
    components
      .filter((comp) => comp.id !== 'ReadingPath_DA01' && comp.example)
      .map(async (comp) => {
        let rendered = comp.example ? await parseMarkdownAsync(comp.example, c) : ''
        // 对 mermaid 组件，用临时容器触发 JS 渲染，再取回渲染后的 HTML
        if (comp.id === 'Mermaid_DA01' && rendered) {
          const tmp = document.createElement('div')
          tmp.style.position = 'absolute'
          tmp.style.visibility = 'hidden'
          tmp.style.pointerEvents = 'none'
          tmp.innerHTML = rendered
          document.body.appendChild(tmp)
          await renderAll(tmp)
          rendered = tmp.innerHTML
          document.body.removeChild(tmp)
        }
        return {
          id: comp.id,
          name: comp.name,
          idSuffix: comp.id.split('_').slice(1).join('_'),
          example: comp.example || '',
          rendered,
        }
      }),
  )
  compItems.value = items
}

const filteredComponents = computed(() => {
  return compItems.value.filter((c) => componentCategoryMap[c.id] === activeCategory.value)
})

function selectComponent(id: string) {
  selectedId.value = id
}

function confirmInsert() {
  const comp = compItems.value.find((c) => c.id === selectedId.value)
  if (comp?.example) {
    emit('insert', comp.example)
    emit('close')
  }
}

function handleClose() {
  selectedId.value = null
  activeCategory.value = 'title'
  emit('close')
}
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="插入扩展组件"
    :show-footer="true"
    width="500px"
    @close="handleClose"
  >
    <template #header>
      <div class="flex gap-1 overflow-x-auto">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="cursor-pointer whitespace-nowrap rounded-full border-0 transition-colors px-3 py-[5px] text-xs"
          :class="
            activeCategory === cat.key
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[#999] hover:text-[#333] dark:hover:text-[#ccc]'
          "
          @click="
            activeCategory = cat.key;
            selectedId = null
          "
        >
          {{ cat.label }}
        </button>
      </div>
    </template>

    <div ref="contentRef" class="flex flex-col gap-3">
      <div
        v-for="comp in filteredComponents"
        :key="comp.id"
        class="cursor-pointer overflow-hidden rounded-[10px] border border-[var(--border-color,#e0e0e0)] bg-[var(--bg-primary,#fff)] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none transition-all hover:-translate-y-px hover:border-[var(--accent,#6c5ce7)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] dark:hover:shadow-none"
        :class="{
          '!border-[var(--accent,#6c5ce7)] !shadow-[0_0_0_2px_var(--accent-light,rgba(108,92,231,0.15)),0_4px_16px_rgba(0,0,0,0.08)] -translate-y-px dark:!shadow-[0_0_0_2px_var(--accent-light,rgba(108,92,231,0.3))]':
            selectedId === comp.id,
        }"
        @click="selectComponent(comp.id)"
      >
        <div class="flex items-center justify-between px-3 pt-2.5">
          <span class="text-xs font-semibold text-[var(--text-primary,#1a1a1a)]">{{
            comp.name
          }}</span>
          <span
            class="rounded px-1.5 py-px font-mono text-[10px] font-medium text-[var(--accent,#6c5ce7)] bg-[var(--accent-light,rgba(108,92,231,0.08))]"
            >{{ comp.idSuffix }}</span
          >
        </div>
        <div
          class="pointer-events-none px-3 pb-3.5 pt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary,#666)]"
          v-html="comp.rendered"
        ></div>
      </div>
      <div
        v-if="filteredComponents.length === 0"
        class="flex min-h-[120px] items-center justify-center text-[13px] text-[var(--text-muted,#999)]"
      >
        该分类暂无组件
      </div>
    </div>

    <template #footer>
      <button
        class="cursor-pointer rounded-lg border-0 px-4 py-1.5 text-[12px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        :style="{ backgroundColor: colors.accent }"
        :disabled="!selectedId"
        @click="confirmInsert"
      >
        插入
      </button>
    </template>
  </BaseDrawer>
</template>
