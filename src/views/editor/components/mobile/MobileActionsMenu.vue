<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDropdownGroup } from '@/composables/useDropdownGroup'
import { Braces, Copy, EllipsisVertical, FileText, Image, LayoutGrid, Bot } from 'lucide-vue-next'

const isTauri = import.meta.env.VITE_TAURI === 'true'
const router = useRouter()
const aiDemoHref = computed(() =>
  isTauri ? 'https://r-markdown.pages.dev/#/help/r-markdown-formatter' : undefined,
)

function openAiDemo() {
  if (isTauri) {
    window.open(
      'https://r-markdown.pages.dev/#/help/r-markdown-formatter',
      '_blank',
      'noopener,noreferrer',
    )
  } else {
    router.push('/help/r-markdown-formatter')
  }
}

const props = defineProps<{
  mode?: 'editor' | 'preview'
}>()

const emit = defineEmits<{
  'load-demo': []
  'export-html': []
  'save-image': []
  'copy-rich-text': []
  'export-xhs': []
  'go-components': []
}>()

const { toggle: groupToggle, isVisible } = useDropdownGroup('actions')

function toggle() {
  groupToggle(!isVisible.value)
}

function handleAction(action: () => void) {
  action()
  groupToggle(false)
}

function close(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.mobile-actions-menu')) {
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
  <div class="mobile-actions-menu relative sm:hidden">
    <button
      class="w-7 h-7 rounded-full border-2 border-white/30 cursor-pointer flex items-center justify-center p-0 shrink-0 transition-all duration-200 hover:scale-110 hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] bg-[var(--accent)] text-white"
      title="操作菜单"
      @click.stop="toggle"
    >
      <EllipsisVertical :size="15" />
    </button>
    <div
      class="mobile-actions-dropdown absolute top-full right-0 mt-2 p-1.5 bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 w-44"
      :class="{ show: isVisible }"
    >
      <!-- 编辑模式：扩展组件 + AI排版示例 + 加载示例 -->
      <template v-if="mode === 'editor'">
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('go-components'))"
        >
          <LayoutGrid :size="14" />
          扩展组件
        </button>
        <a
          :href="aiDemoHref"
          :target="isTauri ? '_blank' : undefined"
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5 no-underline"
          @click.prevent="handleAction(openAiDemo)"
        >
          <Bot :size="14" />
          AI排版示例
        </a>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('load-demo'))"
        >
          <FileText :size="14" />
          加载示例
        </button>
      </template>
      <!-- 预览模式：显示其他三个 -->
      <template v-else>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('export-html'))"
        >
          <Braces :size="14" />
          HTML
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('save-image'))"
        >
          <Image :size="14" />
          保存图片
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('export-xhs'))"
        >
          <FileText :size="14" />
          小红书图
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('copy-rich-text'))"
        >
          <Copy :size="14" />
          复制到公众号
        </button>
        <div class="px-4 pb-1 text-[10px] opacity-40 leading-tight">
          移动端复制到公众号会丢失样式，推荐在PC端操作
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mobile-actions-dropdown {
  display: none;
}

.mobile-actions-dropdown.show {
  display: block;
}
</style>

<style>
/* Dark mode overrides */
[data-theme='dark'] .mobile-actions-dropdown {
  background: #2a2a2e !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
}
[data-theme='dark'] .mobile-action-option {
  color: #ccc !important;
}
[data-theme='dark'] .mobile-action-option:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
