<script setup lang="ts">
/**
 * 概览指标卡。
 *
 * 每个卡片一个关键数字 + 一句解释，解释里带对比基准，
 * 让用户知道这个数字该怎么读（比如「篇均 2.3k 字」）。
 * 浏览器版只有草稿箱，所以除了「篇均」之外的口径都把草稿算进来了，
 * 否则整排数字会全是 0。
 */
import { computed } from 'vue'

const props = defineProps<{
  articleCount: number
  draftCount: number
  /** 文章 + 草稿的总字数 */
  totalChars: number
  monthNew: number
  avgScore: number
  staleCount: number
  avgChars: number
}>()

/** 10000 → 1.0 万，避免 KPI 里出现长数字 */
function compact(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  if (n >= 1000) return n.toLocaleString('en-US')
  return String(n)
}

const cards = computed(() => [
  {
    label: '写过的稿子',
    value: compact(props.articleCount + props.draftCount),
    hint: `文章 ${props.articleCount} · 草稿 ${props.draftCount}`,
  },
  {
    label: '累计字数',
    value: compact(props.totalChars),
    hint: `篇均 ${compact(props.avgChars)} 字`,
  },
  {
    label: '本月新增',
    value: compact(props.monthNew),
    hint: '新文章 + 新草稿',
  },
  {
    label: '结构均分',
    value: props.avgScore ? String(props.avgScore) : '—',
    hint: props.avgScore >= 85 ? '排版习惯不错' : props.avgScore ? '还有优化空间' : '还没有正文',
    tone: props.avgScore >= 85 ? 'good' : undefined,
  },
  {
    label: '搁置待处理',
    value: compact(props.staleCount),
    hint: props.staleCount > 0 ? '超过 14 天没动' : '都在推进中',
    tone: props.staleCount > 0 ? 'warn' : undefined,
  },
])
</script>

<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    <div
      v-for="card in cards"
      :key="card.label"
      class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-3.5"
    >
      <div class="text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
        {{ card.label }}
      </div>
      <div
        class="mt-1.5 text-[24px] leading-none font-semibold tabular-nums"
        :class="{
          'text-[var(--accent)]': card.tone === 'good',
          'text-[#b87514] dark:text-[#e8a33d]': card.tone === 'warn',
          'text-[var(--text-primary)]': !card.tone,
        }"
      >
        {{ card.value }}
      </div>
      <div class="mt-1.5 truncate text-[11px] text-[var(--text-secondary)]">
        {{ card.hint }}
      </div>
    </div>
  </div>
</template>
