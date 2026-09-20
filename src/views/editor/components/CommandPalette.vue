<!--
  命令面板（⌘K / Ctrl+K）：类 Spotlight 的全局检索浮层。

  交互约定：
  - 打开时不加载任何数据，只显示输入框、分类筛选与最近搜索
  - 输入关键词后才筛选结果（数据由父组件在首次输入时懒加载）
  - 结果右侧按类别给动作：文章/草稿为「编辑」，素材为「插入」

  挂到 body 并用 fixed 定位，避免被编辑器容器的 overflow 裁剪。
  z-index 取 990：低于弹窗类（BaseDialog 999 / PromptDialog 1100），高于查找面板 900。
-->
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search, FileText, FolderOpen, Package, CornerDownLeft, Clock, X } from 'lucide-vue-next'
import {
  searchPalette,
  groupByKind,
  KIND_META,
  KIND_FILTERS,
  pushHistory,
  PALETTE_HISTORY_LIMIT,
  type PaletteItem,
  type PaletteKind,
} from '@/utils/commandPalette'

const props = defineProps<{
  visible: boolean
  items: PaletteItem[]
  /** 快捷键展示文案，用于输入框右侧提示 */
  shortcutText?: string
  /** 是否正在加载数据源 */
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  /** 确认执行：编辑文章/草稿或插入素材 */
  activate: [item: PaletteItem]
  /** 关键词变化（非空），父组件据此懒加载数据 */
  search: [query: string]
}>()

const HISTORY_KEY = 'r-markdown-paletteHistory'

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const query = ref('')
const activeIndex = ref(0)
/** 当前选中的分类筛选，'all' 表示全部 */
const activeKind = ref('all')

const history = ref<string[]>([])

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    history.value = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    history.value = []
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  } catch {
    // 隐私模式等写入失败时静默忽略，不影响检索
  }
}

/** 当前筛选对应的类别集合，空数组表示不限 */
const selectedKinds = computed<PaletteKind[]>(
  () => KIND_FILTERS.find((f) => f.key === activeKind.value)?.kinds ?? [],
)

/** 是否已输入关键词。只有输入后才展示结果（打开时保持干净） */
const hasQuery = computed(() => query.value.trim().length > 0)

/** 过滤 + 排序 + 分组后的结果 */
const groups = computed(() =>
  hasQuery.value ? groupByKind(searchPalette(props.items, query.value, selectedKinds.value)) : [],
)

/** 拍平后的顺序，键盘上下移动与此对齐 */
const flat = computed(() => groups.value.flatMap((g) => g.items))

/** 结果项的唯一键。用 kind+id 组合，避免不同类别出现同 id 时误高亮 */
function itemKey(item: PaletteItem): string {
  return `${item.kind}:${item.id}`
}

/** 当前高亮项的唯一键 */
const activeKey = computed(() => {
  const it = flat.value[activeIndex.value]
  return it ? itemKey(it) : null
})

/** 按唯一键反查序号，供鼠标悬停同步高亮 */
function indexOfKey(key: string): number {
  return flat.value.findIndex((f) => itemKey(f) === key)
}

const kindIcon: Record<PaletteKind, unknown> = {
  draft: FileText,
  cloud: FileText,
  local: FolderOpen,
  material: Package,
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    query.value = ''
    activeIndex.value = 0
    activeKind.value = 'all'
    loadHistory()
    await nextTick()
    inputRef.value?.focus()
  },
)

// 关键词或分类变化后重置高亮，避免选中越界
watch([query, activeKind], () => {
  activeIndex.value = 0
})

// 首次输入时通知父组件按需拉取数据
watch(query, (q) => {
  if (q.trim()) emit('search', q.trim())
})

/** 点击历史项：回填关键词并触发检索 */
function useHistory(text: string) {
  query.value = text
  inputRef.value?.focus()
}

function clearHistory() {
  history.value = []
  saveHistory()
}

function onSelectKind(key: string) {
  activeKind.value = key
  inputRef.value?.focus()
}

/** 键盘导航：上下移动、回车执行、Esc 关闭 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (flat.value.length) activeIndex.value = (activeIndex.value + 1) % flat.value.length
    scrollActiveIntoView()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (flat.value.length)
      activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length
    scrollActiveIntoView()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const item = flat.value[activeIndex.value]
    if (item) onActivate(item)
  }
}

/** 让高亮项保持可见 */
async function scrollActiveIntoView() {
  await nextTick()
  const el = listRef.value?.querySelector<HTMLElement>('[data-active="true"]')
  el?.scrollIntoView({ block: 'nearest' })
}

/** 鼠标悬停时同步高亮，保证「移动鼠标后回车」符合直觉 */
function onHover(index: number) {
  activeIndex.value = index
}

/** 执行结果项，并把当前关键词记入历史 */
function onActivate(item: PaletteItem) {
  if (query.value.trim()) {
    history.value = pushHistory(history.value, query.value)
    saveHistory()
  }
  emit('activate', item)
}
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩透明（不加底色），仅用于捕获点击外部关闭 -->
    <div
      v-show="visible"
      class="fixed inset-0 z-[990] flex items-start justify-center"
      @mousedown.self="emit('close')"
    >
      <div
        class="mt-[12vh] w-[560px] max-w-[calc(100vw-32px)] rounded-xl border border-[rgba(var(--accent-rgb),0.45)] shadow-2xl overflow-hidden text-[13px]"
        :style="{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
        }"
        @keydown="onKeydown"
      >
        <!-- 输入行：圆角搜索框（无背景；聚焦时边框变主题色） -->
        <div class="p-3 pb-2">
          <div
            class="flex items-center gap-2 px-3.5 h-10 rounded-full border bg-transparent border-[var(--border-color)] transition-colors focus-within:border-[var(--accent)]"
          >
            <Search :size="15" class="shrink-0" style="color: var(--text-muted)" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="搜索草稿、云文章、本地文章、素材…"
              class="flex-1 min-w-0 h-full bg-transparent border-none outline-none text-[13px]"
              :style="{ color: 'var(--text-primary)' }"
            />
            <kbd
              v-if="shortcutText && !query"
              class="shrink-0 px-1.5 py-0.5 rounded border text-[10px]"
              :style="{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }"
              >{{ shortcutText }}</kbd
            >
            <button
              v-else-if="query"
              class="shrink-0 flex items-center justify-center w-4 h-4 rounded-full border-none bg-transparent cursor-pointer p-0"
              style="color: var(--text-muted)"
              aria-label="清空"
              @click="query = ''"
            >
              <X :size="13" />
            </button>
          </div>
        </div>

        <!-- 分类筛选 -->
        <div class="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          <button
            v-for="f in KIND_FILTERS"
            :key="f.key"
            class="px-2.5 h-6 rounded-full border text-[11px] cursor-pointer transition-colors"
            :style="
              activeKind === f.key
                ? {
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                    background: 'rgba(var(--accent-rgb), 0.12)',
                    fontWeight: 600,
                  }
                : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }
            "
            @click="onSelectKind(f.key)"
          >
            {{ f.label }}
          </button>
        </div>

        <!-- 结果列表 -->
        <div ref="listRef" class="max-h-[46vh] overflow-y-auto pb-1">
          <!-- 未输入：只展示最近搜索，不展示任何数据 -->
          <template v-if="!hasQuery">
            <div
              v-if="history.length"
              class="flex items-center gap-1.5 px-3 pt-1 pb-1"
              style="color: var(--text-muted)"
            >
              <Clock :size="12" class="shrink-0" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">最近搜索</span>
              <button
                class="ml-auto text-[10px] border-none bg-transparent cursor-pointer px-1"
                style="color: var(--text-muted)"
                @click="clearHistory"
              >
                清空
              </button>
            </div>
            <button
              v-for="h in history"
              :key="h"
              class="w-full flex items-center gap-2.5 px-3 py-1.5 border-none bg-transparent cursor-pointer text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              @click="useHistory(h)"
            >
              <Clock :size="13" class="shrink-0" style="color: var(--text-muted)" />
              <span class="flex-1 min-w-0 truncate">{{ h }}</span>
            </button>
            <p
              v-if="!history.length"
              class="px-3 py-5 text-center text-[12px]"
              style="color: var(--text-muted)"
            >
              输入关键词开始搜索
            </p>
          </template>

          <!-- 已输入：展示筛选结果 -->
          <template v-else>
            <p
              v-if="loading"
              class="px-3 py-6 text-center text-[12px]"
              style="color: var(--text-muted)"
            >
              正在载入…
            </p>
            <p
              v-else-if="!flat.length"
              class="px-3 py-6 text-center text-[12px]"
              style="color: var(--text-muted)"
            >
              没有匹配的内容
            </p>

            <template v-for="g in groups" :key="g.kind">
              <p
                class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                style="color: var(--text-muted)"
              >
                {{ KIND_META[g.kind].label }}
              </p>
              <!--
                行本身不是按钮：点击行内文字只做高亮，不触发动作，
                必须点右侧的「编辑」/「插入」按钮才执行，避免误触。
              -->
              <div
                v-for="item in g.items"
                :key="itemKey(item)"
                :data-active="activeKey === itemKey(item) ? 'true' : 'false'"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                :style="
                  activeKey === itemKey(item)
                    ? { background: 'rgba(var(--accent-rgb), 0.12)' }
                    : undefined
                "
                @mousemove="onHover(indexOfKey(itemKey(item)))"
              >
                <component
                  :is="kindIcon[item.kind]"
                  :size="15"
                  class="shrink-0"
                  :style="{ color: 'var(--accent)' }"
                />
                <span class="flex-1 min-w-0 truncate">{{ item.title }}</span>
                <span
                  v-if="item.meta"
                  class="shrink-0 text-[11px] truncate max-w-[140px]"
                  style="color: var(--text-muted)"
                  >{{ item.meta }}</span
                >
                <!-- 动作按钮：文章/草稿为「编辑」，素材为「插入」；只有点这里才执行 -->
                <button
                  class="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium border bg-transparent cursor-pointer transition-colors border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                  :aria-label="`${KIND_META[item.kind].action}：${item.title}`"
                  @click="onActivate(item)"
                >
                  {{ KIND_META[item.kind].action }}
                </button>
              </div>
            </template>
          </template>
        </div>

        <!-- 底部提示 -->
        <div
          class="flex items-center gap-3 px-3 h-8 border-t text-[11px]"
          :style="{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }"
        >
          <span class="flex items-center gap-1"> <CornerDownLeft :size="12" /> 执行 </span>
          <span>↑↓ 选择</span>
          <span>Esc 关闭</span>
          <span v-if="hasQuery && flat.length" class="ml-auto">{{ flat.length }} 项</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
