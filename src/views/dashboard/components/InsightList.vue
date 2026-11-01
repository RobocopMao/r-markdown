<script setup lang="ts">
/**
 * 洞察列表。
 *
 * 全部来自纯规则判断（见 useDashboard 的 insights），不是 AI 生成的，
 * 所以每句话都能对应到上面某个数字，用户能自己验证。
 */
defineProps<{
  items: { tone: 'good' | 'warn' | 'info'; text: string }[]
}>()

function dotClass(tone: 'good' | 'warn' | 'info'): string {
  if (tone === 'good') return 'bg-[var(--accent)]'
  if (tone === 'warn') return 'bg-[#e0962a]'
  return 'bg-[var(--text-muted)] opacity-50'
}
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="(item, i) in items"
      :key="i"
      class="flex gap-2 text-[12px] leading-relaxed text-[var(--text-secondary)]"
    >
      <span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" :class="dotClass(item.tone)" />
      <span>{{ item.text }}</span>
    </li>
  </ul>
</template>
