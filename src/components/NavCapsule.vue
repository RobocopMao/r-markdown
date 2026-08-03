<script setup lang="ts">
import { ref } from 'vue'

export interface NavItem {
  /** 显示文本 */
  label: string
  /** 图标 SVG path（可选） */
  iconPath?: string
  /** 图标 SVG viewBox（可选，默认 '0 0 24 24'） */
  iconViewBox?: string
  /** Lucide 图标组件（可选，优先级高于 iconPath） */
  icon?: any
  /** 是否外部链接 */
  external?: boolean
  /** 链接地址（router-link to 或 href） */
  to?: string
  /** 唯一标识（用于高亮） */
  key: string
}

defineProps<{
  items: NavItem[]
}>()

const emit = defineEmits<{
  (e: 'hover', key: string, el: HTMLElement): void
  (e: 'leave'): void
  (e: 'click', key: string): void
}>()

const highlightStyle = ref<{ left: string; width: string; opacity: string }>({
  left: '0px',
  width: '0px',
  opacity: '0',
})

function onNavEnter(e: MouseEvent, key: string) {
  const el = e.currentTarget as HTMLElement
  const nav = (e.currentTarget as HTMLElement).parentElement
  if (!nav || !el) return
  const navRect = nav.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  highlightStyle.value = {
    left: elRect.left - navRect.left + 'px',
    width: elRect.width + 'px',
    opacity: '1',
  }
  emit('hover', key, el)
}

function onNavLeave() {
  highlightStyle.value = { ...highlightStyle.value, opacity: '0' }
  emit('leave')
}
</script>

<template>
  <nav
    class="nav-pill relative hidden sm:flex items-center rounded-full bg-black/5 px-0.5 py-0.5 ml-auto"
    @mouseleave="onNavLeave"
  >
    <div
      class="nav-highlight absolute top-0.5 bottom-0.5 rounded-full bg-black/8 transition-all duration-300 ease-out"
      :style="highlightStyle"
    ></div>
    <template v-for="(item, idx) in items" :key="item.key">
      <!-- 外部链接 -->
      <a
        v-if="item.external"
        :href="item.to"
        target="_blank"
        rel="noopener noreferrer"
        class="nav-link relative z-10 inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-[14px] font-medium text-[#555] no-underline transition-colors hover:text-[#111]"
        @mouseenter="onNavEnter($event, item.key)"
      >
        <component :is="item.icon" v-if="item.icon" :size="16" />
        <svg
          v-else-if="item.iconPath"
          :viewBox="item.iconViewBox || '0 0 24 24'"
          width="16"
          height="16"
          fill="currentColor"
        >
          <path :d="item.iconPath" />
        </svg>
        {{ item.label }}
      </a>
      <!-- 内部路由链接 -->
      <router-link
        v-else-if="item.to"
        :to="item.to"
        class="nav-link relative z-10 inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-[14px] font-medium text-[#555] no-underline transition-colors hover:text-[#111]"
        @mouseenter="onNavEnter($event, item.key)"
      >
        <component :is="item.icon" v-if="item.icon" :size="16" />
        <svg
          v-else-if="item.iconPath"
          :viewBox="item.iconViewBox || '0 0 24 24'"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="item.iconPath" />
        </svg>
        {{ item.label }}
      </router-link>
      <!-- 普通按钮（无链接） -->
      <a
        v-else
        href="javascript:void(0)"
        class="nav-link relative z-10 inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-[14px] font-medium text-[#555] no-underline transition-colors hover:text-[#111]"
        @mouseenter="onNavEnter($event, item.key)"
        @click="$emit('click', item.key)"
      >
        <component :is="item.icon" v-if="item.icon" :size="16" />
        <svg
          v-else-if="item.iconPath"
          :viewBox="item.iconViewBox || '0 0 24 24'"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="item.iconPath" />
        </svg>
        {{ item.label }}
      </a>
      <!-- 分隔点（非最后一项） -->
      <span
        v-if="idx < items.length - 1"
        class="w-1 h-1 rounded-full bg-black/20 relative z-10 mx-1"
      ></span>
    </template>
  </nav>
</template>

<style scoped>
.nav-pill {
  overflow: hidden;
}
</style>

<style>
/* 深色模式 */
[data-theme='dark'] .nav-pill {
  background: rgba(255, 255, 255, 0.1) !important;
}
[data-theme='dark'] .nav-link {
  color: rgba(255, 255, 255, 0.6) !important;
}
[data-theme='dark'] .nav-link:hover {
  color: #fff !important;
}
[data-theme='dark'] .nav-highlight {
  background: rgba(255, 255, 255, 0.12) !important;
}
</style>
