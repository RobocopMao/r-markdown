<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDarkMode, type DarkMode } from '@/composables/useDarkMode'
import { useDropdownGroup } from '@/composables/useDropdownGroup'
import { Sun, Moon, Monitor } from 'lucide-vue-next'

const { mode, setMode } = useDarkMode()

const { toggle: groupToggle, isVisible } = useDropdownGroup('theme-mode')
const toggleRef = ref<HTMLElement | null>(null)

const options: { value: DarkMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色模式', icon: Sun },
  { value: 'dark', label: '深色模式', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

const currentIcon = computed(() => options.find((o) => o.value === mode.value)?.icon ?? Monitor)
const currentLabel = computed(
  () => options.find((o) => o.value === mode.value)?.label ?? '跟随系统',
)

function toggle() {
  groupToggle(!isVisible.value)
}

function select(m: DarkMode) {
  setMode(m)
  groupToggle(false)
}

function onClickOutside(e: MouseEvent) {
  if (toggleRef.value && !toggleRef.value.contains(e.target as Node)) {
    groupToggle(false)
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <div ref="toggleRef" class="relative">
    <button class="toolbar-round-btn flex" :title="currentLabel" @click.stop="toggle">
      <component :is="currentIcon" :size="18" />
    </button>
    <div
      class="theme-mode-menu absolute top-full right-0 mt-2 p-1.5 rounded-xl z-50 w-28"
      :class="{ show: isVisible }"
      :style="{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }"
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        class="theme-mode-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
        :class="{ active: mode === opt.value }"
        @click="select(opt.value)"
      >
        <component :is="opt.icon" :size="14" class="shrink-0" />
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
  外观与顶栏「导出」下拉（Dropdown.vue 的 .dd-menu / .dd-option）保持一致：
  白底 + 同一套阴影，暗色走下方的 [data-theme='dark'] 覆盖。
  改这里的配色时，记得和 Dropdown.vue 一起看，两个下拉不要各写一套。
*/
.theme-mode-menu {
  display: none;
  background: #ffffff;
}

.theme-mode-menu.show {
  display: block;
}

/* 选中项只用主题色 + 加粗标识，底色与 hover 同款，避免出现第三种色块 */
.theme-mode-option.active {
  color: var(--accent);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.05);
}
</style>

<style>
/* 暗色覆盖：与 Dropdown.vue 的暗色规则逐条对齐 */
[data-theme='dark'] .theme-mode-menu {
  background: #2a2a2e !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
}
[data-theme='dark'] .theme-mode-option {
  color: #ccc !important;
}
[data-theme='dark'] .theme-mode-option:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}

/*
  选中项要保持主题色，必须写在上面那条 #ccc 之后并提高选择器权重，
  否则会被 !important 覆盖成普通灰字，选中状态就只剩加粗了。
*/
[data-theme='dark'] .theme-mode-option.active {
  color: var(--accent) !important;
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
