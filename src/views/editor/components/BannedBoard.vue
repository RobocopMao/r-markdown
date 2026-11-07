<script setup vapor lang="ts">
/**
 * 违禁词检测面板。
 *
 * 呈现方式与草稿箱（DraftBoard）/ 图库（GalleryBoard）/ 我的素材（MaterialBoard）/ 统计面板
 * 一致：激活后占满编辑区、面板内部自己滚动，不再用抽屉弹窗盖住编辑器。
 *
 * 三个 Tab 沿用原弹窗的划分：
 * - 检测结果：分类过滤 + 命中列表，点条目跳到编辑器对应行
 * - 自定义词：补充所在行业的专属敏感词
 * - 白名单：排除误报（如「第一次」里的「第一」）
 */
import { ref, computed, onMounted } from 'vue'
import {
  ShieldAlert,
  CircleCheck,
  Plus,
  X,
  MousePointerClick,
  BookLock,
  Info,
} from 'lucide-vue-next'
import BoardHeader from './BoardHeader.vue'
import { getSetting, setSetting } from '@/config/settings'
import { BANNED_CATEGORIES, scanBannedWords, type BannedMatch } from '@/utils/bannedWords'

const props = defineProps<{
  markdown: string
}>()

const emit = defineEmits<{
  close: []
  jump: [line: number]
}>()

type TabId = 'result' | 'custom' | 'whitelist'

const TABS: { id: TabId; label: string }[] = [
  { id: 'result', label: '检测结果' },
  { id: 'custom', label: '自定义词' },
  { id: 'whitelist', label: '白名单' },
]

const activeTab = ref<TabId>('result')
const filterCategoryId = ref<string>('all')

// ── 词库数据（面板挂载时从 settings 加载，修改后立即持久化）──
const customWords = ref<string[]>([])
const whitelist = ref<string[]>([])
const customInput = ref('')
const whitelistInput = ref('')

// ── 扫描结果 ──
const matches = ref<BannedMatch[]>([])

function rescan() {
  matches.value = scanBannedWords(props.markdown, {
    customWords: customWords.value,
    whitelist: whitelist.value,
  })
}

onMounted(() => {
  customWords.value = [...getSetting<string[]>('bannedCustomWords')]
  whitelist.value = [...getSetting<string[]>('bannedWhitelist')]
  rescan()
})

const filteredMatches = computed(() =>
  filterCategoryId.value === 'all'
    ? matches.value
    : matches.value.filter((m) => m.categoryId === filterCategoryId.value),
)

/** 各分类命中计数，仅显示有命中的分类 */
const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const m of matches.value) counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1)
  return BANNED_CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({
    ...c,
    count: counts.get(c.id) ?? 0,
  }))
})

const subtitleText = computed(() => {
  if (activeTab.value === 'custom') {
    return `内置 ${builtinWordCount()} 个高风险词，已补充 ${customWords.value.length} 个自定义词`
  }
  if (activeTab.value === 'whitelist') {
    return whitelist.value.length
      ? `白名单 ${whitelist.value.length} 个词不会被判为违禁词`
      : '白名单为空，白名单里的词不会被判为违禁词'
  }
  if (!matches.value.length) return '未发现违禁词'
  return `命中 ${matches.value.length} 处，点条目跳到编辑器对应位置`
})

function tabCount(id: TabId): number {
  if (id === 'result') return matches.value.length
  if (id === 'custom') return customWords.value.length
  return whitelist.value.length
}

function badgeStyle(color: string) {
  return {
    background: `${color}1A`,
    color,
    border: `1px solid ${color}40`,
  }
}

function onJump(m: BannedMatch) {
  emit('jump', m.line)
}

// ── 自定义词 / 白名单管理 ──
function addWord(target: 'custom' | 'whitelist') {
  const input = target === 'custom' ? customInput : whitelistInput
  const list = target === 'custom' ? customWords : whitelist
  const opposite = target === 'custom' ? whitelist : customWords
  const word = input.value.trim()
  if (!word) return
  if (list.value.includes(word)) {
    input.value = ''
    return
  }
  // 与另一个列表互斥，避免语义冲突（白名单优先级在扫描器中更高）
  opposite.value = opposite.value.filter((w) => w !== word)
  setSetting(target === 'custom' ? 'bannedWhitelist' : 'bannedCustomWords', opposite.value)
  list.value.push(word)
  setSetting(target === 'custom' ? 'bannedCustomWords' : 'bannedWhitelist', list.value)
  input.value = ''
  rescan()
}

function removeWord(target: 'custom' | 'whitelist', word: string) {
  const list = target === 'custom' ? customWords : whitelist
  list.value = list.value.filter((w) => w !== word)
  setSetting(target === 'custom' ? 'bannedCustomWords' : 'bannedWhitelist', list.value)
  rescan()
}

function builtinWordCount(): number {
  return BANNED_CATEGORIES.reduce((sum, c) => sum + c.words.length, 0)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-4">
      <BoardHeader title="违禁词检测" :description="subtitleText" @close="emit('close')">
        <!-- 标签页：检测结果 / 自定义词 / 白名单，统一放在标题下面一行靠左 -->
        <template #tabs>
          <button
            v-for="tab in TABS"
            :key="tab.id"
            class="board-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}{{ tabCount(tab.id) ? `(${tabCount(tab.id)})` : '' }}
          </button>
        </template>
      </BoardHeader>

      <!-- ═══ 检测结果 ═══ -->
      <div v-if="activeTab === 'result'">
        <!-- 仅供参考提示 -->
        <div
          class="mb-3 flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] px-3 py-2 text-[12px] text-[#b45309] dark:text-[#fbbf24]"
          style="background: color-mix(in srgb, #f59e0b 8%, transparent)"
        >
          <Info :size="13" class="shrink-0" />
          检测结果基于常见违禁词库匹配，仅供参考，请结合文章内容自行判断
        </div>

        <!-- 分类过滤 -->
        <div v-if="matches.length" class="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            class="cursor-pointer rounded-full border px-2.5 py-1 text-[12px] transition-colors"
            :class="
              filterCategoryId === 'all'
                ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[#9ca3af]/40 bg-[#9ca3af]/10 text-[#9ca3af]'
            "
            @click="filterCategoryId = 'all'"
          >
            全部 {{ matches.length }}
          </button>
          <button
            v-for="cat in categoryCounts"
            :key="cat.id"
            class="cursor-pointer rounded-full border px-2.5 py-1 text-[12px] transition-colors"
            :style="badgeStyle(filterCategoryId === cat.id ? cat.color : '#9ca3af')"
            @click="filterCategoryId = filterCategoryId === cat.id ? 'all' : cat.id"
          >
            {{ cat.label }} {{ cat.count }}
          </button>
        </div>

        <!-- 空状态 -->
        <div
          v-if="!matches.length"
          class="flex flex-col items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center"
        >
          <CircleCheck :size="40" class="text-emerald-500" />
          <p class="text-sm font-medium">未发现违禁词</p>
          <p class="text-[12px] text-[var(--text-secondary)]">
            已扫描内置 {{ builtinWordCount() }} 个高风险词 + {{ customWords.length }} 个自定义词
          </p>
        </div>

        <!-- 命中列表 -->
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-1.5">
          <button
            v-for="(m, i) in filteredMatches"
            :key="i"
            class="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
            @click="onJump(m)"
          >
            <span
              class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              :style="badgeStyle(m.color)"
            >
              {{ m.word }}
            </span>
            <span class="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
              {{ m.context }}
            </span>
            <span class="shrink-0 text-[11px] tabular-nums text-[var(--text-secondary)]">
              第 {{ m.line }} 行
            </span>
          </button>
        </div>

        <p
          v-if="matches.length"
          class="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"
        >
          <MousePointerClick :size="12" />
          点击条目跳转到编辑器对应位置
        </p>
      </div>

      <!-- ═══ 自定义词库 ═══ -->
      <div v-else-if="activeTab === 'custom'">
        <p class="mb-3 flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
          <ShieldAlert :size="13" class="shrink-0" />
          内置 {{ builtinWordCount() }} 个高风险词，可在此补充你所在行业的专属敏感词。
        </p>
        <div class="mb-3 flex flex-wrap gap-2">
          <input
            v-model="customInput"
            class="h-8 min-w-[180px] flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-[13px] outline-none focus:border-[var(--accent)]"
            placeholder="输入词语后回车添加，如：内部价"
            @keydown.enter="addWord('custom')"
          />
          <button
            class="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg border-none bg-[var(--accent)] px-3 text-[13px] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            :disabled="!customInput.trim()"
            @click="addWord('custom')"
          >
            <Plus :size="14" />
            添加
          </button>
        </div>
        <div v-if="customWords.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="w in customWords"
            :key="w"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[12px]"
            :style="badgeStyle('#64748b')"
          >
            {{ w }}
            <X
              :size="12"
              class="cursor-pointer opacity-60 hover:opacity-100"
              @click="removeWord('custom', w)"
            />
          </span>
        </div>
        <p
          v-else
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[12px] text-[var(--text-secondary)]"
        >
          暂无自定义词
        </p>
      </div>

      <!-- ═══ 白名单 ═══ -->
      <div v-else>
        <p class="mb-3 flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
          <BookLock :size="13" class="shrink-0" />
          白名单中的词不会被判为违禁词，适合排除误报（如「第一次」中的「第一」）。
        </p>
        <div class="mb-3 flex flex-wrap gap-2">
          <input
            v-model="whitelistInput"
            class="h-8 min-w-[180px] flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-[13px] outline-none focus:border-[var(--accent)]"
            placeholder="输入词语后回车加入白名单"
            @keydown.enter="addWord('whitelist')"
          />
          <button
            class="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg border-none bg-[var(--accent)] px-3 text-[13px] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            :disabled="!whitelistInput.trim()"
            @click="addWord('whitelist')"
          >
            <Plus :size="14" />
            添加
          </button>
        </div>
        <div v-if="whitelist.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="w in whitelist"
            :key="w"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[12px]"
            :style="badgeStyle('#059669')"
          >
            {{ w }}
            <X
              :size="12"
              class="cursor-pointer opacity-60 hover:opacity-100"
              @click="removeWord('whitelist', w)"
            />
          </span>
        </div>
        <p
          v-else
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[12px] text-[var(--text-secondary)]"
        >
          白名单为空
        </p>
      </div>
    </div>
  </div>
</template>
