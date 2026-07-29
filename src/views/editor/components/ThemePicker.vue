<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useDropdownGroup } from '@/composables/useDropdownGroup'
import { Palette, Copy, Check } from 'lucide-vue-next'

const props = defineProps<{
  themes: { accent: string; dark: string }[]
  currentAccent: string
  customColor: string
}>()

const emit = defineEmits<{
  select: [accent: string, dark: string]
  customSelect: [hex: string]
}>()

const { toggle: groupToggle, isVisible } = useDropdownGroup('theme')
const pickerRef = ref<HTMLElement | null>(null)

function toggle() {
  groupToggle(!isVisible.value)
}

function onClickOutside(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    groupToggle(false)
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})

function select(a: string, d: string) {
  emit('select', a, d)
  groupToggle(false)
}

function onCustomInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  emit('customSelect', val)
}

const copied = ref(false)
async function copyCurrentColor() {
  try {
    await navigator.clipboard.writeText(props.currentAccent)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 5000)
  } catch {
    // 降级方案
    const ta = document.createElement('textarea')
    ta.value = props.currentAccent
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 5000)
  }
}
</script>

<template>
  <div ref="pickerRef" class="relative">
    <button
      class="theme-btn w-7 h-7 rounded-full cursor-pointer flex items-center justify-center p-0 shrink-0 transition-all duration-200 hover:scale-110"
      :style="{ background: currentAccent, color: '#fff' }"
      @click="toggle"
    >
      <Palette :size="24" />
    </button>
    <div
      class="theme-picker absolute top-full right-0 mt-2 p-3 rounded-xl z-10 w-50"
      :class="{ show: isVisible }"
    >
      <div class="flex flex-wrap gap-2">
        <div
          v-for="t in themes"
          :key="t.accent"
          class="theme-option w-7 h-7 rounded-full cursor-pointer border-2 border-transparent transition-all duration-200 hover:scale-115"
          :class="{ active: t.accent === currentAccent }"
          :style="{ '--c': t.accent, background: t.accent }"
          @click="select(t.accent, t.dark)"
        ></div>
      </div>
      <div class="custom-color-row mt-2.5 pt-2.5 border-t border-[var(--accent-border)]">
        <div class="flex items-center gap-2">
          <div
            class="custom-swatch w-7 h-7 rounded-full shrink-0 border-2 border-transparent transition-all duration-200 cursor-pointer hover:scale-115"
            :class="{
              active: !themes.some((t) => t.accent.toLowerCase() === currentAccent.toLowerCase()),
            }"
            :style="{ '--c': customColor, background: customColor }"
            @click="emit('customSelect', customColor)"
          ></div>
          <label
            class="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[12px] font-medium transition-all duration-150 hover:bg-[var(--accent-light)]"
            :style="{ color: 'var(--accent)' }"
          >
            <Palette :size="14" />
            自定义颜色
            <input type="color" :value="customColor" class="sr-only" @input="onCustomInput" />
          </label>
        </div>
      </div>
      <div class="current-color-row mt-2 pt-2 border-t border-[var(--accent-border)]">
        <div class="flex items-center gap-1.5 px-0.5">
          <span class="text-[11px] font-medium" :style="{ color: 'var(--text-secondary)' }">
            当前主题色值：<span class="font-mono" :style="{ color: 'var(--text-primary)' }">{{
              currentAccent
            }}</span>
          </span>
          <Copy
            v-if="!copied"
            :size="12"
            class="cursor-pointer shrink-0 transition-colors duration-150 hover:text-[var(--accent)]"
            :style="{ color: 'var(--text-secondary)' }"
            @click.stop="copyCurrentColor"
          />
          <Check v-else :size="12" class="shrink-0" :style="{ color: 'var(--accent)' }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-btn {
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.theme-picker {
  display: none;
  background: var(--bg-primary);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.theme-picker.show {
  display: block;
}

.theme-option.active {
  border-color: var(--c);
  box-shadow:
    0 0 0 2px var(--bg-primary),
    0 0 0 3.5px var(--c);
}

.custom-color-row .active {
  border-color: var(--c);
  box-shadow:
    0 0 0 2px var(--bg-primary),
    0 0 0 3.5px var(--c);
}
</style>
