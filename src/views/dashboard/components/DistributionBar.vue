<script setup lang="ts">
/**
 * 产量分布：横向条形图。
 *
 * 两种用途（栏目分布 / 字数分箱）共用一套渲染，所以用 label+value 的通用输入。
 * 纯 div 宽度百分比实现，不需要任何图表库。
 */
import { computed } from 'vue'

const props = defineProps<{
  items: { label: string; value: number }[]
  /** 单位后缀，如「篇」 */
  unit?: string
  /** 空状态文案 */
  emptyText?: string
}>()

const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))
const total = computed(() => props.items.reduce((sum, i) => sum + i.value, 0))

function widthOf(value: number): string {
  // 最小 3%，否则 0 值边上的条看起来像不存在
  return `${Math.max(value > 0 ? 3 : 0, (value / max.value) * 100)}%`
}

function percentOf(value: number): number {
  return total.value ? Math.round((value / total.value) * 100) : 0
}
</script>

<template>
  <div>
    <div v-if="items.length === 0" class="py-6 text-center text-[12px] text-[var(--text-muted)]">
      {{ emptyText ?? '暂无数据' }}
    </div>

    <div v-else class="space-y-2">
      <div v-for="item in items" :key="item.label" class="group">
        <div class="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
          <span class="truncate text-[var(--text-secondary)]" :title="item.label">
            {{ item.label }}
          </span>
          <span class="shrink-0 tabular-nums text-[var(--text-muted)]">
            {{ item.value }}{{ unit ?? '' }}
            <span class="ml-1 opacity-60">{{ percentOf(item.value) }}%</span>
          </span>
        </div>
        <div class="h-[6px] overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <div
            class="h-full rounded-full bg-[var(--accent)] opacity-70 transition-all duration-500 group-hover:opacity-100"
            :style="{ width: widthOf(item.value) }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
