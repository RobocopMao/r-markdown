<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useDropdownGroup } from '@/composables/useDropdownGroup'
import { EllipsisVertical } from 'lucide-vue-next'

export interface MobileNavItem {
  key: string
  label: string
  iconPath?: string
  iconViewBox?: string
  icon?: any
  external?: boolean
  to?: string
}

const props = defineProps<{
  items: MobileNavItem[]
}>()

const emit = defineEmits<{
  (e: 'click', key: string): void
}>()

const { toggle: groupToggle, isVisible } = useDropdownGroup('mobile-nav')

function toggle() {
  groupToggle(!isVisible.value)
}

function handleItemClick(key: string) {
  groupToggle(false)
  emit('click', key)
}

function close(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.mobile-nav-menu')) {
    groupToggle(false)
  }
}

onMounted(() => {
  document.addEventListener('click', close)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', close)
})
</script>

<template>
  <div class="mobile-nav-menu relative sm:hidden">
    <button
      class="w-7 h-7 rounded-full border-2 border-white/30 cursor-pointer flex items-center justify-center p-0 shrink-0 transition-all duration-200 hover:scale-110 hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] bg-[var(--accent)] text-white"
      title="导航菜单"
      @click.stop="toggle"
    >
      <EllipsisVertical :size="15" />
    </button>
    <div
      class="mobile-nav-dropdown absolute top-full right-0 mt-2 p-1.5 bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 w-40"
      :class="{ show: isVisible }"
    >
      <template v-for="(item, idx) in items" :key="item.key">
        <!-- 外部链接 -->
        <a
          v-if="item.external"
          :href="item.to"
          target="_blank"
          rel="noopener noreferrer"
          class="mobile-nav-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 no-underline transition-colors duration-150 hover:bg-black/5"
        >
          <component :is="item.icon" v-if="item.icon" :size="14" />
          <svg
            v-else-if="item.iconPath"
            :viewBox="item.iconViewBox || '0 0 24 24'"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path :d="item.iconPath" />
          </svg>
          {{ item.label }}
        </a>
        <!-- 普通按钮 -->
        <button
          v-else
          class="mobile-nav-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleItemClick(item.key)"
        >
          <component :is="item.icon" v-if="item.icon" :size="14" />
          <svg
            v-else-if="item.iconPath"
            :viewBox="item.iconViewBox || '0 0 24 24'"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="item.iconPath" />
          </svg>
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mobile-nav-dropdown {
  display: none;
}
.mobile-nav-dropdown.show {
  display: block;
}
</style>

<style>
/* 深色模式 */
[data-theme='dark'] .mobile-nav-dropdown {
  background: #2a2a2e !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
}
[data-theme='dark'] .mobile-nav-option {
  color: #ccc !important;
}
[data-theme='dark'] .mobile-nav-option:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
