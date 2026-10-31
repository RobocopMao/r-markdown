<script setup lang="ts">
/**
 * 统计面板。
 *
 * 全部数据来自三处已有存储，不新增任何埋点或数据库：
 *   · 本地草稿库（IndexedDB）
 *   · 本地磁盘 articles/（tree.json + .md 文件 mtime）
 *   · GitHub 仓库（tree.json + commits 提交历史）
 *
 * 因此这里能说的是「写了多少、什么时候在写、稿子什么状态」，
 * 说不了「阅读量/在看数」——那需要公众号后台接口。
 */
import { onMounted, ref } from 'vue'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import Toast from '@/components/Toast.vue'
import KpiRow from './components/KpiRow.vue'
import ActivityHeatmap from './components/ActivityHeatmap.vue'
import HealthTable from './components/HealthTable.vue'
import DistributionBar from './components/DistributionBar.vue'
import ConsistencyPanel from './components/ConsistencyPanel.vue'
import InsightList from './components/InsightList.vue'
import { RANGE_OPTIONS, useDashboard, type RangeKey } from '@/composables/useDashboard'

const {
  data,
  loading,
  refreshing,
  error,
  range,
  storageLabel,
  load,
  refresh,
  kpi,
  heatmap,
  activityStats,
  healthRows,
  problemCount,
  byFolder,
  charBuckets,
  distribution,
  staleDrafts,
  draftAging,
  insights,
} = useDashboard()

const toastVisible = ref(false)
const toastMessage = ref('')

function showToast(message: string): void {
  toastMessage.value = message
  toastVisible.value = true
  window.setTimeout(() => (toastVisible.value = false), 2200)
}

function setRange(key: RangeKey): void {
  range.value = key
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

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="min-h-screen bg-[var(--bg-secondary)] font-sans text-[var(--text-primary)]">
    <SiteHeader :show-nav-links="false" />

    <main class="mx-auto w-full max-w-[1080px] px-4 pt-[104px] pb-16 sm:px-6 sm:pt-[124px]">
      <!-- 页头 -->
      <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">统计</h1>
          <p class="mt-1 text-[12px] text-[var(--text-secondary)]">
            数据来自草稿库、本地磁盘与 GitHub 仓库
            <span v-if="storageLabel" class="text-[var(--text-muted)]">· {{ storageLabel }}</span>
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- 时间范围 -->
          <div class="flex rounded-lg border border-[var(--border-color)] p-0.5">
            <button
              v-for="option in RANGE_OPTIONS"
              :key="option.key"
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] transition-colors"
              :class="
                range === option.key
                  ? 'bg-[var(--accent)] font-medium text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              "
              @click="setRange(option.key)"
            >
              {{ option.label }}
            </button>
          </div>

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
        <span class="text-[12px] text-[var(--text-muted)]">正在汇总三个数据源…</span>
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

        <div class="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <!-- 左列 -->
          <div class="space-y-4">
            <!-- 活跃热力图 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <div class="mb-3 flex items-baseline justify-between">
                <h2 class="text-[13px] font-semibold">写作活跃度</h2>
                <span class="text-[11px] text-[var(--text-muted)]">
                  一天里有稿子被保存 / 提交就算活跃
                </span>
              </div>
              <ActivityHeatmap
                :cells="heatmap"
                :active-days="activityStats.activeDays"
                :longest-streak="activityStats.longestStreak"
                :coverage="activityStats.coverage"
              />
            </section>

            <!-- 体检表 -->
            <section
              class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
            >
              <div class="mb-1 flex items-baseline justify-between">
                <h2 class="text-[13px] font-semibold">文章体检</h2>
                <span v-if="problemCount" class="text-[11px] text-[#b87514] dark:text-[#e8a33d]">
                  {{ problemCount }} 篇有可改项
                </span>
                <span v-else-if="healthRows.length" class="text-[11px] text-[var(--accent)]">
                  全部达标
                </span>
              </div>
              <p class="mb-2 text-[11px] text-[var(--text-muted)]">
                按结构分从低到高排，点一行展开细节
              </p>
              <HealthTable :rows="healthRows" />
            </section>
          </div>

          <!-- 右列 -->
          <div class="space-y-4">
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
                </div>
                <ul class="space-y-1">
                  <li
                    v-for="draft in staleDrafts.slice(0, 4)"
                    :key="draft.id"
                    class="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <a
                      :href="`/editor?id=${draft.id}`"
                      class="truncate text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline"
                    >
                      {{ draft.title || '（无标题）' }}
                    </a>
                    <span class="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                      {{ draft.idleDays }} 天
                    </span>
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
                :warnings="data.warnings"
              />
            </section>
          </div>
        </div>

        <!-- 页脚信息 -->
        <p class="mt-5 text-center text-[11px] text-[var(--text-muted)]">
          汇总于 {{ fmtDate(data.loadedAt) }} · 数据缓存在本页会话内，5 分钟后自动失效
        </p>
      </template>
    </main>

    <SiteFooter />
    <Toast :visible="toastVisible" :message="toastMessage" />
  </div>
</template>
