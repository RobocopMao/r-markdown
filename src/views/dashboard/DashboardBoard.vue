<script setup lang="ts">
/**
 * 统计面板主体。
 *
 * 两个地方共用这一份：
 *   · 独立页面 `/dashboard`（桌面版右下角那个站点页）
 *   · 编辑器左侧菜单的「统计」入口（嵌在编辑区里，不显示文章树/编辑器/预览/缩略图）
 *
 * 数据全部来自已有存储，不新增任何埋点或数据库：
 *   · 草稿库（IndexedDB）
 *   · 当前工作区的文章源：本地磁盘 articles/（桌面端）或 GitHub 仓库（两端）
 *
 * 文章源跟着编辑器当前工作区走——同一时刻只有一个，面板上也就只标这一个。
 */
import { computed, onMounted, ref } from 'vue'
import Toast from '@/components/Toast.vue'
import { currentStorageMode } from '@/services/metricsCollector'
import KpiRow from './components/KpiRow.vue'
import ActivityHeatmap from './components/ActivityHeatmap.vue'
import HealthTable from './components/HealthTable.vue'
import DistributionBar from './components/DistributionBar.vue'
import ConsistencyPanel from './components/ConsistencyPanel.vue'
import InsightList from './components/InsightList.vue'
import { CACHE_TTL_MINUTES, RANGE_LABEL, useDashboard } from '@/composables/useDashboard'

const props = defineProps<{
  /** 嵌在编辑器里：去掉外层的最大宽度与页脚留白，自己滚动 */
  embedded?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'openDraft', payload: { id: number; title: string }): void
}>()

const {
  data,
  loading,
  refreshing,
  error,
  storageLabel,
  load,
  refresh,
  kpi,
  heatmap,
  activityStats,
  visibleHealthRows,
  ignoredHealthRows,
  ignoreHealthRow,
  unignoreHealthRow,
  clearIgnoredHealthRows,
  problemCount,
  byFolder,
  charBuckets,
  distribution,
  staleDrafts,
  draftAging,
  insights,
} = useDashboard()

/**
 * 标题下那行「数据来自…」只写当前真正在用的源。
 *
 * 编辑器同一时刻只挂一个工作区，所以文章源要么本地磁盘、要么 GitHub，
 * 把另一个也写上去会让人以为它也在统计（其实一直是 0）。
 */
const sourceLine = computed(() => {
  const mode = data.value?.mode ?? currentStorageMode()
  return mode === 'local' ? '数据来自草稿库与本地磁盘' : '数据来自草稿库与 GitHub 仓库'
})

const toastVisible = ref(false)
const toastMessage = ref('')

function showToast(message: string): void {
  toastMessage.value = message
  toastVisible.value = true
  window.setTimeout(() => (toastVisible.value = false), 2200)
}

function openDraft(draft: { id: number; title: string }): void {
  emit('openDraft', { id: draft.id, title: draft.title })
}

async function onRefresh(): Promise<void> {
  await refresh()
  if (error.value) showToast(error.value)
  else showToast('已刷新')
}

function fmtDate(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 到分钟的时间：2026-11-01 01:25（数据是什么时候汇总的，要能看出新旧） */
function fmtDateTime(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div :class="props.embedded ? 'h-full overflow-y-auto' : ''">
    <div :class="props.embedded ? 'px-4 py-4' : ''">
      <!-- 顶部工具条 -->
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1
              :class="props.embedded ? 'text-[16px]' : 'text-[22px]'"
              class="font-semibold tracking-tight"
            >
              统计
            </h1>
            <button
              v-if="props.embedded"
              type="button"
              class="rounded-md border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              @click="emit('close')"
            >
              返回编辑
            </button>
          </div>
          <p class="mt-1 text-[12px] text-[var(--text-secondary)]">
            {{ sourceLine }}
            <span v-if="storageLabel" class="text-[var(--text-muted)]">· {{ storageLabel }}</span>
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[11px] text-[var(--text-muted)]">{{ RANGE_LABEL }}</span>
          <button
            type="button"
            class="rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
            :disabled="loading || refreshing"
            @click="onRefresh"
          >
            {{ refreshing ? '刷新中…' : '刷新' }}
          </button>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loading && !data" class="flex flex-col items-center gap-2 py-24">
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)]"
        />
        <span class="text-[12px] text-[var(--text-muted)]">正在汇总数据…</span>
      </div>

      <!-- 出错 -->
      <div
        v-else-if="error && !data"
        class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-6 text-center"
      >
        <p class="text-[13px] text-[var(--text-primary)]">统计数据没能加载出来</p>
        <p class="mt-1 text-[12px] text-[var(--text-muted)]">{{ error }}</p>
        <button
          type="button"
          class="mt-3 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] text-white"
          @click="load(true)"
        >
          重试
        </button>
      </div>

      <template v-else-if="data">
        <!-- 概览 -->
        <section class="mb-4">
          <KpiRow
            :article-count="kpi.articleCount"
            :draft-count="kpi.draftCount"
            :total-chars="kpi.totalWords"
            :month-new="kpi.monthNew"
            :avg-score="kpi.avgScore"
            :stale-count="kpi.staleCount"
            :avg-chars="kpi.avgChars"
          />
        </section>

        <!--
          写作活跃度独占整行。
          热力图固定画近一年 = 53 列，宽度约 870px，塞进两栏的左栏（约 590px）
          会永远露出一条滚动条，所以给它整页宽度；只有在窗口本身比它窄时
          才在卡片内部出现横向滚动条。
        -->
        <section
          class="mb-4 min-w-0 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
        >
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 class="text-[13px] font-semibold">写作活跃度</h2>
            <span class="text-[11px] text-[var(--text-muted)]">
              一天里有稿子被保存 / 提交就算活跃 · {{ RANGE_LABEL }}
            </span>
          </div>
          <ActivityHeatmap
            :cells="heatmap"
            :active-days="activityStats.activeDays"
            :longest-streak="activityStats.longestStreak"
            :coverage="activityStats.coverage"
          />
        </section>

        <div class="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <!-- 左列 -->
          <div class="min-w-0 space-y-4">
            <!-- 体检表 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <div class="mb-1 flex items-baseline justify-between">
                <h2 class="text-[13px] font-semibold">文章体检</h2>
                <span v-if="problemCount" class="text-[11px] text-[#b87514] dark:text-[#e8a33d]">
                  {{ problemCount }} 篇有可改项
                </span>
                <span v-else-if="visibleHealthRows.length" class="text-[11px] text-[var(--accent)]">
                  全部达标
                </span>
              </div>
              <p class="mb-2 text-[11px] text-[var(--text-muted)]">
                按结构分从低到高排，点一行展开细节；不想看的可以「忽略」，之后在底部恢复
              </p>
              <HealthTable
                :rows="visibleHealthRows"
                :ignored-rows="ignoredHealthRows"
                @ignore="ignoreHealthRow"
                @unignore="unignoreHealthRow"
                @clear-ignored="clearIgnoredHealthRows"
              />
            </section>
          </div>

          <!-- 右列 -->
          <div class="min-w-0 space-y-4">
            <!-- 洞察 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <h2 class="mb-2.5 text-[13px] font-semibold">可以注意的</h2>
              <InsightList :items="insights" />
            </section>

            <!-- 栏目分布 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <h2 class="mb-2.5 text-[13px] font-semibold">按栏目</h2>
              <DistributionBar
                :items="byFolder.map((f) => ({ label: f.folder, value: f.count }))"
                unit=" 篇"
                empty-text="还没有文章"
              />
            </section>

            <!-- 字数分布 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <div class="mb-2.5 flex items-baseline justify-between">
                <h2 class="text-[13px] font-semibold">字数分布</h2>
                <span v-if="distribution.median" class="text-[11px] text-[var(--text-muted)]">
                  中位数 {{ distribution.median }} 字
                </span>
              </div>
              <DistributionBar
                :items="charBuckets.map((b) => ({ label: b.label, value: b.count }))"
                unit=" 篇"
                empty-text="还没有文章"
              />
            </section>

            <!-- 草稿年龄 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <h2 class="mb-2.5 text-[13px] font-semibold">草稿年龄</h2>
              <DistributionBar
                :items="draftAging.map((b) => ({ label: b.label, value: b.count }))"
                unit=" 篇"
                empty-text="还没有草稿"
              />

              <div
                v-if="staleDrafts.length"
                class="mt-3 border-t border-[var(--border-color)] pt-2.5"
              >
                <div class="mb-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  搁置最久的几篇
                  <span v-if="props.embedded" class="text-[var(--text-muted)]">· 点击继续写</span>
                </div>
                <ul class="space-y-1">
                  <li v-for="draft in staleDrafts.slice(0, 4)" :key="draft.id">
                    <button
                      v-if="props.embedded"
                      type="button"
                      class="flex w-full items-baseline justify-between gap-2 border-none bg-transparent p-0 text-left text-[11px]"
                      @click="openDraft(draft)"
                    >
                      <span
                        class="truncate text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline"
                      >
                        {{ draft.title || '（无标题）' }}
                      </span>
                      <span class="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                        {{ draft.idleDays }} 天
                      </span>
                    </button>
                    <div v-else class="flex items-baseline justify-between gap-2 text-[11px]">
                      <span class="truncate text-[var(--text-secondary)]">
                        {{ draft.title || '（无标题）' }}
                      </span>
                      <span class="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                        {{ draft.idleDays }} 天
                      </span>
                    </div>
                  </li>
                </ul>
              </div>
            </section>

            <!-- 一致性 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <h2 class="mb-2.5 text-[13px] font-semibold">数据源</h2>
              <ConsistencyPanel
                :orphan-files="data.orphanFiles"
                :missing-contents="data.missingContents"
                :sources="data.sources"
                :mode="data.mode"
                :warnings="data.warnings"
              />
            </section>
          </div>
        </div>

        <!-- 页脚信息：说清「数据有多旧」和「什么时候才会重新采集」。
             这里没有定时器，面板开着不动不会自己刷新，别写成「自动失效」。 -->
        <p class="mt-5 text-center text-[11px] text-[var(--text-muted)]">
          汇总于 {{ fmtDateTime(data.loadedAt) }} · 快照缓存在本页会话内，有效期
          {{ CACHE_TTL_MINUTES }} 分钟；过期后重新进入面板或点「刷新」才会重新采集
        </p>
      </template>
    </div>

    <Teleport to="body">
      <Toast :visible="toastVisible" :message="toastMessage" />
    </Teleport>
  </div>
</template>
