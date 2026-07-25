<script setup vapor lang="ts">
import { ref, computed, useSlots } from 'vue'

const props = withDefaults(defineProps<{ text?: string; placement?: 'top' | 'bottom' }>(), { placement: 'top' })
const slots = useSlots()

const triggerRef = ref<HTMLElement>()
const visible = ref(false)
const tooltipStyle = computed(() => {
  if (!triggerRef.value) return {}
  const rect = triggerRef.value.getBoundingClientRect()
  if (props.placement === 'bottom') {
    return {
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.bottom + 4}px`,
      transform: 'translateX(-50%)',
    }
  }
  return {
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top - 4}px`,
    transform: 'translate(-50%, -100%)',
  }
})

function show() { visible.value = true }
function hide() { visible.value = false }
</script>

<template>
  <span
    ref="triggerRef"
    class="inline-flex items-center group/tip"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
    <Teleport to="body">
      <span
        v-show="visible"
        class="fixed px-2 py-1 rounded-md bg-white text-[#333] dark:bg-[#333] dark:text-white border border-[#e5e5e5] dark:border-white/10 shadow-lg text-[11px] leading-none whitespace-nowrap pointer-events-none z-[9999]"
        :class="{ '!leading-relaxed !whitespace-normal !px-3 !py-2 !w-[180px]': slots.content }"
        :style="tooltipStyle"
      >
        <slot v-if="slots.content" name="content" />
        <template v-else>{{ text }}</template>
      </span>
    </Teleport>
  </span>
</template>
