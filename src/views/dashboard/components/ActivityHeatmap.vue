<script setup lang="ts">
/**
 * 活跃日历热力图。
 *
 * 用 CSS Grid 排（7 行 × N 列），行对应周一~周日，列对应自然周。
 * 每格的颜色由 --accent 叠加不同透明度得到，所以换主题色会整体跟着变。
 * 不用 SVG 是因为格子要 hover 出 tooltip，DOM 元素上做交互更省事。
 */
import { computed } from 'vue'

export interface HeatCell {
  day: string | null
  count: number
  level: number
}

const props = defineProps<{
  cells: HeatCell[]
  activeDays: number
  longestStreak: number
  coverage: number
}>()

/** 把线性排列的格子切成「每周一列」的分组 */
const columns = computed(() => {
  const result: HeatCell[][] = []
  for (let i = 0; i < props.cells.length; i += 7) {
    result.push(props.cells.slice(i, i + 7))
  }
  return result
})

/** 七行只标行号为偶数的四个：一 / 三 / 五 / 日 */
const WEEK_ROWS = ['一', '', '三', '', '五', '', '日']

/** 月份标签：某列第一天所在月份，避免重复显示同一个月 */
const monthLabels = computed(() => {
  const labels: (string | null)[] = []
  let last = ''
  for (const column of columns.value) {
    const firstDay = column.find((c) => c.day)?.day
    if (!firstDay) {
      labels.push(null)
      continue
    }
    const month = `${Number(firstDay.slice(5, 7))}月`
    if (month !== last) {
      labels.push(month)
      last = month
    } else {
      labels.push(null)
    }
  }
  return labels
})

const LEVEL_CLASS: Record<number, string> = {
  0: 'bg-[var(--bg-secondary)]',
  1: 'bg-[rgba(var(--accent-rgb),0.25)]',
  2: 'bg-[rgba(var(--accent-rgb),0.45)]',
  3: 'bg-[rgba(var(--accent-rgb),0.7)]',
  4: 'bg-[var(--accent)]',
}

function titleOf(cell: HeatCell): string {
  if (!cell.day) return ''
  return cell.count > 0 ? `${cell.day} · ${cell.count} 项动过` : `${cell.day} · 没动`
}
</script>

<template>
  <div>
    <div
      class="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px] text-[var(--text-secondary)]"
    >
      <span>
        <b class="text-[15px] font-semibold text-[var(--text-primary)]">{{ activeDays }}</b>
        天动过稿
      </span>
      <span>
        最长连续
        <b class="text-[15px] font-semibold text-[var(--text-primary)]">{{ longestStreak }}</b>
        天
      </span>
      <span>覆盖率 {{ coverage }}%</span>
    </div>

    <div class="overflow-x-auto pb-1">
      <div class="inline-block min-w-full">
        <!-- 月份标尺 -->
        <div class="mb-1 flex gap-[3px] pl-[22px]">
          <div
            v-for="(label, index) in monthLabels"
            :key="index"
            class="w-[13px] shrink-0 text-[10px] leading-none text-[var(--text-muted)]"
          >
            {{ label ?? '' }}
          </div>
        </div>

        <div class="flex gap-[3px]">
          <!-- 星期标尺：隔行标注，避免挤成一片 -->
          <div class="mr-1 flex w-[18px] shrink-0 flex-col gap-[3px]">
            <div
              v-for="(label, index) in WEEK_ROWS"
              :key="index"
              class="h-[13px] text-[10px] leading-[13px] text-[var(--text-muted)]"
            >
              {{ label }}
            </div>
          </div>

          <div
            v-for="(column, colIndex) in columns"
            :key="colIndex"
            class="flex flex-col gap-[3px]"
          >
            <div
              v-for="(cell, rowIndex) in column"
              :key="rowIndex"
              class="h-[13px] w-[13px] rounded-[3px] transition-transform duration-150"
              :class="[
                cell.day ? LEVEL_CLASS[cell.level] : 'bg-transparent',
                cell.day ? 'hover:scale-125' : '',
              ]"
              :title="titleOf(cell)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
      <span>少</span>
      <span
        v-for="level in [0, 1, 2, 3, 4]"
        :key="level"
        class="h-[11px] w-[11px] rounded-[2px]"
        :class="LEVEL_CLASS[level]"
      />
      <span>多</span>
    </div>
  </div>
</template>
