<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  ShieldAlert,
  CircleCheck,
  Plus,
  X,
  MousePointerClick,
  BookLock,
  Info,
} from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import { getSetting, setSetting } from '@/config/settings'
import { BANNED_CATEGORIES, scanBannedWords, type BannedMatch } from '@/utils/bannedWords'

const props = defineProps<{
  visible: boolean
  markdown: string
}>()

const emit = defineEmits<{
  close: []
  jump: [line: number]
}>()

type TabId = 'result' | 'custom' | 'whitelist'

const activeTab = ref<TabId>('result')
const filterCategoryId = ref<string>('all')

// ── Tab 滑块：主题色圆角滑块（参考图库头部切换按钮）──
const btnResult = ref<HTMLButtonElement | null>(null)
const btnCustom = ref<HTMLButtonElement | null>(null)
const btnWhitelist = ref<HTMLButtonElement | null>(null)
const tabSliderStyle = ref<Record<string, string>>({})

function updateTabSlider() {
  const btn =
    activeTab.value === 'result'
      ? btnResult.value
      : activeTab.value === 'custom'
        ? btnCustom.value
        : btnWhitelist.value
  if (!btn) return
  const parent = btn.parentElement
  if (!parent) return
  const parentRect = parent.getBoundingClientRect()
  const btnRect = btn.getBoundingClientRect()
  tabSliderStyle.value = {
    width: `${btnRect.width - 4}px`,
    transform: `translateX(${btnRect.left - parentRect.left}px)`,
  }
}

watch(activeTab, () => nextTick(updateTabSlider))

// ── 词库数据（打开弹窗时从 settings 加载，修改后立即持久化）──
const customWords = ref<string[]>([])
const whitelist = ref<string[]>([])
const customInput = ref('')
const whitelistInput = ref('')

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    customWords.value = [...getSetting<string[]>('bannedCustomWords')]
    whitelist.value = [...getSetting<string[]>('bannedWhitelist')]
    activeTab.value = 'result'
    filterCategoryId.value = 'all'
    customInput.value = ''
    whitelistInput.value = ''
    nextTick(updateTabSlider)
  },
)

// ── 扫描：打开期间响应式重扫；关闭时保留旧结果，避免滑出动画中闪现空状态 ──
const matches = ref<BannedMatch[]>([])

watch(
  [() => props.visible, () => props.markdown, customWords, whitelist],
  ([vis]) => {
    if (!vis) return
    matches.value = scanBannedWords(props.markdown, {
      customWords: customWords.value,
      whitelist: whitelist.value,
    })
  },
  { deep: true },
)

const filteredMatches = computed(() =>
  filterCategoryId.value === 'all'
    ? matches.value
    : matches.value.filter((m) => m.categoryId === filterCategoryId.value),
)

/** 各分类命中计数（含「全部」），仅显示有命中的分类 */
const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const m of matches.value) counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1)
  return BANNED_CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({
    ...c,
    count: counts.get(c.id) ?? 0,
  }))
})

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
}

function removeWord(target: 'custom' | 'whitelist', word: string) {
  const list = target === 'custom' ? customWords : whitelist
  list.value = list.value.filter((w) => w !== word)
  setSetting(target === 'custom' ? 'bannedCustomWords' : 'bannedWhitelist', list.value)
}

function builtinWordCount(): number {
  return BANNED_CATEGORIES.reduce((sum, c) => sum + c.words.length, 0)
}
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="违禁词检测"
    width="min(92vw, 640px)"
    @close="emit('close')"
  >
    <template #header>
      <!-- Tab 切换：主题色圆角滑块 -->
      <div class="relative flex shrink-0 items-center gap-0.5 rounded-full p-0.5 bg-[#f3f0ea] dark:bg-[#333]">
        <div
          class="absolute top-0.5 bottom-0.5 rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
          :style="tabSliderStyle"
        ></div>
        <button
          ref="btnResult"
          class="relative z-10 cursor-pointer rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
          :class="activeTab === 'result' ? 'text-white' : 'text-[#8a8175] dark:text-[#999]'"
          @click="activeTab = 'result'"
        >
          检测结果{{ matches.length ? `(${matches.length})` : '' }}
        </button>
        <button
          ref="btnCustom"
          class="relative z-10 cursor-pointer rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
          :class="activeTab === 'custom' ? 'text-white' : 'text-[#8a8175] dark:text-[#999]'"
          @click="activeTab = 'custom'"
        >
          自定义词{{ customWords.length ? `(${customWords.length})` : '' }}
        </button>
        <button
          ref="btnWhitelist"
          class="relative z-10 cursor-pointer rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
          :class="activeTab === 'whitelist' ? 'text-white' : 'text-[#8a8175] dark:text-[#999]'"
          @click="activeTab = 'whitelist'"
        >
          白名单{{ whitelist.length ? `(${whitelist.length})` : '' }}
        </button>
      </div>
    </template>

    <!-- ═══ 检测结果 ═══ -->
    <div v-if="activeTab === 'result'">
      <!-- 仅供参考提示 -->
      <div
        class="mb-3 flex items-center gap-1.5 rounded-lg bg-[#f59e0b]/10 px-3 py-2 text-xs text-[#b45309] dark:text-[#fbbf24]"
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
        class="flex flex-col items-center gap-2 py-10 text-center"
      >
        <CircleCheck :size="40" class="text-emerald-500" />
        <p class="text-sm font-medium text-[#333] dark:text-[#ddd]">未发现违禁词</p>
        <p class="text-xs text-[#999]">
          已扫描内置 {{ builtinWordCount() }} 个高风险词 + {{ customWords.length }} 个自定义词
        </p>
      </div>

      <!-- 命中列表 -->
      <div v-else class="flex flex-col gap-1.5">
        <p
          class="mb-1 flex items-center gap-1 text-[11px] text-[#999]"
        >
          <MousePointerClick :size="12" />
          点击条目跳转到编辑器对应位置
        </p>
        <button
          v-for="(m, i) in filteredMatches"
          :key="i"
          class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-[var(--accent)]/30 hover:bg-black/[0.03] dark:hover:bg-white/5"
          @click="onJump(m)"
        >
          <span
            class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            :style="badgeStyle(m.color)"
          >
            {{ m.word }}
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] text-[#555] dark:text-[#aaa]">
            {{ m.context }}
          </span>
          <span class="shrink-0 text-[11px] tabular-nums text-[#bbb]">第 {{ m.line }} 行</span>
        </button>
      </div>
    </div>

    <!-- ═══ 自定义词库 ═══ -->
    <div v-else-if="activeTab === 'custom'">
      <p class="mb-3 flex items-center gap-1.5 text-xs text-[#888] dark:text-[#999]">
        <ShieldAlert :size="13" />
        内置 {{ builtinWordCount() }} 个高风险词，可在此补充你所在行业的专属敏感词。
      </p>
      <div class="mb-3 flex gap-2">
        <input
          v-model="customInput"
          class="h-8 min-w-0 flex-1 rounded-lg border border-[#e0e0e0] bg-white px-3 text-[13px] outline-none focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#222]"
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
      <p v-else class="py-6 text-center text-xs text-[#999]">暂无自定义词</p>
    </div>

    <!-- ═══ 白名单 ═══ -->
    <div v-else>
      <p class="mb-3 flex items-center gap-1.5 text-xs text-[#888] dark:text-[#999]">
        <BookLock :size="13" />
        白名单中的词不会被判为违禁词，适合排除误报（如「第一次」中的「第一」）。
      </p>
      <div class="mb-3 flex gap-2">
        <input
          v-model="whitelistInput"
          class="h-8 min-w-0 flex-1 rounded-lg border border-[#e0e0e0] bg-white px-3 text-[13px] outline-none focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#222]"
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
      <p v-else class="py-6 text-center text-xs text-[#999]">白名单为空</p>
    </div>
  </BaseDrawer>
</template>
