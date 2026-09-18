<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { OutlineItem } from '@/utils/outline'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  items: OutlineItem[]
  /** 当前光标所在行号（1-based），用于高亮当前小节 */
  activeLine: number
}>()

const emit = defineEmits<{
  jump: [line: number]
}>()

const { colors } = useTheme()
const listRef = ref<HTMLElement | null>(null)

/** 光标行之前（含）的最后一个条目即当前小节 */
const activeIndex = computed(() => {
  let idx = -1
  for (let i = 0; i < props.items.length; i++) {
    if (props.items[i].line <= props.activeLine) idx = i
    else break
  }
  return idx
})

// 当前小节变化时保持条目在可视区域内
watch(activeIndex, async () => {
  await nextTick()
  listRef.value?.querySelector('.outline-item-active')?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div
    class="flex flex-col h-full w-[210px] shrink-0 border-l border-[var(--border-color)] bg-[var(--bg-primary)]"
  >
    <div
      class="flex items-center justify-between px-3 h-9 shrink-0 border-b border-[var(--border-color)]"
    >
      <span class="text-[11px] font-semibold" style="color: var(--text-secondary)">大纲</span>
      <span class="text-[10px]" style="color: var(--text-muted)">{{ items.length }}</span>
    </div>
    <div ref="listRef" class="flex-1 overflow-y-auto py-1.5">
      <template v-if="items.length > 0">
        <button
          v-for="(item, i) in items"
          :key="i"
          class="outline-item"
          :class="{ 'outline-item-active': i === activeIndex }"
          :style="{ paddingLeft: 12 + (item.level - 1) * 14 + 'px' }"
          @click="emit('jump', item.line)"
        >
          <span
            v-if="item.kind === 'ptitle' && item.num"
            class="outline-num"
            :style="{ color: colors.accent }"
            >{{ item.num }}</span
          >
          <span class="outline-text" :class="'outline-lv' + item.level">{{ item.text }}</span>
        </button>
      </template>
      <p v-else class="px-3 py-4 text-[11px] leading-relaxed text-center outline-empty">
        暂无标题<br />使用 # 标题或 &lt;p-title&gt; 组件后<br />将在此显示大纲
      </p>
    </div>
  </div>
</template>

<style scoped>
.outline-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding-right: 10px;
  padding-top: 5px;
  padding-bottom: 5px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.12s ease;
}

.outline-item:hover {
  background: rgba(var(--accent-rgb), 0.06);
}

.outline-item-active {
  background: rgba(var(--accent-rgb), 0.1);
  box-shadow: inset 2px 0 0 var(--accent);
}

.outline-num {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

.outline-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.outline-lv1 {
  font-size: 12px;
  font-weight: 600;
}

.outline-lv2 {
  font-size: 12px;
  font-weight: 400;
}

.outline-lv3 {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.75;
}

.outline-lv4 {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.6;
}

.outline-empty {
  color: var(--text-muted);
}
</style>
