<script setup vapor lang="ts">
/**
 * 设置面板里统一风格的滑杆。
 *
 * 为什么不用原生 input[type=range] 直接上样式：设计稿要求「已填充段绿色、未填充段灰色」，
 * 而原生滑杆只能靠 accent-color 上色，填充段跟着系统走、不同浏览器不一致。
 * 这里用一层 linear-gradient 画轨道，把当前百分比算成断点即可。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min: number
    max: number
    step?: number
  }>(),
  { step: 1 },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const percent = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / span) * 100))
})

const trackStyle = computed(() => ({
  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent.value}%, var(--settings-track) ${percent.value}%, var(--settings-track) 100%)`,
}))

function onInput(e: Event) {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <input
    type="range"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :value="props.modelValue"
    :style="trackStyle"
    class="settings-slider"
    @input="onInput"
  />
</template>

<style scoped>
.settings-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}

.settings-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}

.settings-slider::-moz-range-track {
  background: transparent;
}
</style>
