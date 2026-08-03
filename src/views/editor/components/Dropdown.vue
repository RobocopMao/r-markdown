<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useDropdownGroup } from '@/composables/useDropdownGroup'

export interface DropdownItem {
  label: string
  svgInner?: string
  /** lucide 组件，优先级高于 svgInner */
  icon?: any
  href?: string
  action?: string
}

const props = defineProps<{
  groupId: string
  label: string
  svgTriggerInner?: string
  /** lucide 组件，优先级高于 svgTriggerInner */
  iconTrigger?: any
  items: DropdownItem[]
}>()

const emit = defineEmits<{
  select: [action: string]
}>()

const { toggle: groupToggle, isVisible } = useDropdownGroup(props.groupId)
const menuClass = `dd-menu-${props.groupId}`
const optionClass = `dd-option-${props.groupId}`

function toggle() {
  groupToggle(!isVisible.value)
}

function close(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest(`.${menuClass}`) && !target.closest('.dd-trigger')) {
    groupToggle(false)
  }
}

function onItemClick(item: DropdownItem) {
  groupToggle(false)
  if (item.action) emit('select', item.action)
}

onMounted(() => {
  document.addEventListener('click', close)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', close)
})
</script>

<template>
  <div :class="[menuClass, 'hidden sm:inline-flex relative']">
    <button
      class="dd-trigger inline-flex items-center gap-1.5 px-3 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white active:scale-[0.97]"
      @click.stop="toggle"
    >
      <component :is="iconTrigger" v-if="iconTrigger" :size="14" />
      <svg
        v-else
        class="w-3.5 h-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
        viewBox="0 0 24 24"
        v-html="svgTriggerInner"
      />
      {{ label }}
      <svg class="w-3 h-3 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <div
      class="dd-menu absolute top-full right-0 mt-2 p-1.5 bg-white rounded-xl z-50 w-40"
      :class="[menuClass, { show: isVisible }]"
      :style="{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }"
    >
      <template v-for="item in items" :key="item.label">
        <a
          v-if="item.href"
          :href="item.href"
          target="_blank"
          rel="noopener noreferrer"
          :class="[
            optionClass,
            'dd-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 no-underline transition-colors duration-150 hover:bg-black/5',
          ]"
          @click="groupToggle(false)"
        >
          <component :is="item.icon" v-if="item.icon" :size="14" />
          <svg
            v-else
            class="w-3.5 h-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
            viewBox="0 0 24 24"
            v-html="item.svgInner"
          />
          {{ item.label }}
        </a>
        <button
          v-else
          :class="[
            optionClass,
            'dd-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5',
          ]"
          @click="onItemClick(item)"
        >
          <component :is="item.icon" v-if="item.icon" :size="14" />
          <svg
            v-else
            class="w-3.5 h-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
            viewBox="0 0 24 24"
            v-html="item.svgInner"
          />
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dd-menu {
  display: none;
}

.dd-menu.show {
  display: block;
}
</style>

<style>
[data-theme='dark'] .dd-menu {
  background: #2a2a2e !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
}
[data-theme='dark'] .dd-option {
  color: #ccc !important;
}
[data-theme='dark'] .dd-option:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
