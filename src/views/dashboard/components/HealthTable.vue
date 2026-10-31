<script setup lang="ts">
/**
 * 文章体检表。
 *
 * 按结构分从低到高排，最需要改的排在最前。
 * 点击一行展开细节（问题清单 + 各项指标），默认折叠，避免页面太长。
 */
import { computed, ref } from 'vue'
import type { HealthIssue } from '@/services/articleHealth'
import type { ArticleSource } from '@/services/metricsCollector'

export interface HealthRow {
  key: string
  title: string
  folder: string
  source: ArticleSource | 'draft'
  chars: number
  minutes: number
  paragraphs: number
  avgParagraphChars: number
  longParagraphs: number
  headings: number
  headingJumps: number
  images: number
  components: number
  bannedCount: number
  bannedSample: string[]
  issues: HealthIssue[]
  score: number
  band: 'good' | 'fair' | 'poor'
  updatedAt?: number
}

const props = defineProps<{
  rows: HealthRow[]
}>()

const expanded = ref<string | null>(null)

/** 默认只显示最差的前 12 篇，其余折叠起来 */
const SHOW_LIMIT = 12
const showAll = ref(false)

const visibleRows = computed(() => (showAll.value ? props.rows : props.rows.slice(0, SHOW_LIMIT)))

const hiddenCount = computed(() => Math.max(0, props.rows.length - SHOW_LIMIT))

function toggle(key: string): void {
  expanded.value = expanded.value === key ? null : key
}

function scoreClass(band: HealthRow['band']): string {
  if (band === 'good') return 'bg-[rgba(var(--accent-rgb),0.12)] text-[var(--accent)]'
  if (band === 'fair') return 'bg-[rgba(230,150,40,0.12)] text-[#b87514] dark:text-[#e8a33d]'
  return 'bg-[rgba(220,70,70,0.12)] text-[#c0392b] dark:text-[#f0736a]'
}

function barColor(band: HealthRow['band']): string {
  if (band === 'good') return 'bg-[var(--accent)]'
  if (band === 'fair') return 'bg-[#e0962a]'
  return 'bg-[#d24b3f]'
}

function sourceLabel(source: HealthRow['source']): string {
  if (source === 'github') return '云端'
  if (source === 'local') return '本地'
  return '草稿'
}

/** 字数显示：1234 → 1.2k */
function compactChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function fmtDate(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <div>
    <div v-if="rows.length === 0" class="py-8 text-center text-[13px] text-[var(--text-muted)]">
      还没有可体检的文章。
    </div>

    <div v-else class="divide-y divide-[var(--border-color)]">
      <div v-for="row in visibleRows" :key="row.key">
        <button
          type="button"
          class="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
          @click="toggle(row.key)"
        >
          <!-- 分数徽章 -->
          <span
            class="w-9 shrink-0 rounded-md py-1 text-center text-[12px] font-semibold tabular-nums"
            :class="scoreClass(row.band)"
          >
            {{ row.score }}
          </span>

          <!-- 标题 + 元信息 -->
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium text-[var(--text-primary)]">
              {{ row.title || '（无标题）' }}
            </span>
            <span
              class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]"
            >
              <span>{{ row.folder }}</span>
              <span class="opacity-40">·</span>
              <span>{{ compactChars(row.chars) }} 字 / {{ row.minutes }} 分钟</span>
              <span class="opacity-40">·</span>
              <span>{{ sourceLabel(row.source) }}</span>
            </span>
          </span>

          <!-- 问题标签 -->
          <span class="hidden shrink-0 items-center gap-1.5 sm:flex">
            <span
              v-if="row.headingJumps > 0"
              class="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border-color)] ring-inset"
            >
              跳级 {{ row.headingJumps }}
            </span>
            <span
              v-if="row.longParagraphs > 0"
              class="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border-color)] ring-inset"
            >
              长段 {{ row.longParagraphs }}
            </span>
            <span
              v-if="row.bannedCount > 0"
              class="rounded bg-[rgba(220,70,70,0.1)] px-1.5 py-0.5 text-[10px] text-[#c0392b] dark:text-[#f0736a]"
            >
              违禁 {{ row.bannedCount }}
            </span>
          </span>

          <span
            class="w-4 shrink-0 text-center text-[10px] text-[var(--text-muted)] transition-transform"
            :class="expanded === row.key ? 'rotate-90' : ''"
          >
            ▶
          </span>
        </button>

        <!-- 展开详情 -->
        <div
          v-if="expanded === row.key"
          class="mb-2 ml-12 rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5 text-[12px]"
        >
          <!-- 分数条 -->
          <div class="mb-2.5 flex items-center gap-2">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-color)]">
              <div
                class="h-full rounded-full transition-all"
                :class="barColor(row.band)"
                :style="{ width: `${row.score}%` }"
              />
            </div>
            <span class="shrink-0 tabular-nums text-[var(--text-muted)]">{{ row.score }}/100</span>
          </div>

          <!-- 指标网格 -->
          <div class="mb-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
            <div>
              <span class="text-[var(--text-muted)]">段落</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">{{ row.paragraphs }}</span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">平均段长</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">
                {{ row.avgParagraphChars }} 字
              </span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">配图</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">{{ row.images }}</span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">组件</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">{{ row.components }}</span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">标题数</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">{{ row.headings }}</span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">最近更新</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">{{
                fmtDate(row.updatedAt)
              }}</span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">字数</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]">{{ row.chars }}</span>
            </div>
            <div>
              <span class="text-[var(--text-muted)]">阅读</span>
              <span class="ml-1 tabular-nums text-[var(--text-primary)]"
                >{{ row.minutes }} 分钟</span
              >
            </div>
          </div>

          <!-- 问题清单 -->
          <ul v-if="row.issues.length" class="space-y-1">
            <li
              v-for="(issue, i) in row.issues"
              :key="i"
              class="flex gap-1.5 text-[11px] leading-relaxed"
              :class="
                issue.level === 'warn' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
              "
            >
              <span class="shrink-0" :class="issue.level === 'warn' ? 'text-[#d24b3f]' : ''">
                {{ issue.level === 'warn' ? '●' : '○' }}
              </span>
              <span>{{ issue.text }}</span>
            </li>
          </ul>
          <div v-else class="text-[11px] text-[var(--accent)]">没有发现明显问题。</div>

          <!-- 违禁词样例 -->
          <div v-if="row.bannedSample.length" class="mt-2 text-[11px] text-[var(--text-muted)]">
            命中：{{ row.bannedSample.join('、') }}
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="hiddenCount > 0"
      type="button"
      class="mt-2 w-full rounded-lg py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
      @click="showAll = !showAll"
    >
      {{ showAll ? '只看最差的 12 篇' : `再看其余 ${hiddenCount} 篇` }}
    </button>
  </div>
</template>
