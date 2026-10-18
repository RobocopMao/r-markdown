<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useDropdownGroup } from '@/composables/useDropdownGroup'
import {
  Braces,
  EllipsisVertical,
  FileText,
  Image,
  Images,
  LayoutGrid,
  Bot,
  Feather,
  Cloud,
  ImageUp,
  ImagePlus,
  Import,
  Library,
  BookMarked,
  ShieldAlert,
} from 'lucide-vue-next'

defineProps<{
  /**
   * 当前移动端 Tab：编辑 / 预览。菜单内容随它切换。
   *
   * 「文章」Tab 不走这个菜单——那一排是文章树自己的操作，直接由 TreeSidebar
   * 内置的标题栏工具栏承载（手机上横向可滚动），所以这里没有 articles 分支。
   */
  mode?: 'editor' | 'preview'
}>()

const emit = defineEmits<{
  'load-demo': []
  'export-html': []
  'save-image': []
  'export-xhs': []
  'go-components': []
  'open-gallery': []
  'go-materials': []
  'open-my-materials': []
  'open-banned-words': []
  'save-to-repo': []
  'upload-image': []
  'open-import': []
  'open-ai-write': []
  'open-ai-format': []
  'open-ai-image': []
}>()

const { toggle: groupToggle, isVisible } = useDropdownGroup('actions')

function toggle() {
  groupToggle(!isVisible.value)
}

/** 执行菜单项并关闭菜单 */
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
      class="mobile-actions-dropdown absolute top-full right-0 mt-2 p-1.5 bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 w-32"
      :class="{ show: isVisible }"
    >
      <!-- 编辑模式：AI 写作/排版/配图 → 上传图片 → 保存到仓库 → 扩展组件 → 加载示例 -->
      <template v-if="mode === 'editor'">
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-ai-write'))"
        >
          <Feather :size="14" />
          AI 写作
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-ai-format'))"
        >
          <Bot :size="14" />
          AI 排版
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-ai-image'))"
        >
          <ImagePlus :size="14" />
          AI 配图
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('upload-image'))"
        >
          <ImageUp :size="14" />
          上传图片
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-import'))"
        >
          <Import :size="14" />
          导入
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('save-to-repo'))"
        >
          <Cloud :size="14" />
          保存到仓库
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('go-components'))"
        >
          <LayoutGrid :size="14" />
          扩展组件
        </button>
        <!-- 素材/图库/检测：与桌面端左侧栏同源功能，避免移动端只能从别处绕进去 -->
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-gallery'))"
        >
          <Images :size="14" />
          图库
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('go-materials'))"
        >
          <Library :size="14" />
          素材库
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-my-materials'))"
        >
          <BookMarked :size="14" />
          我的素材
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('open-banned-words'))"
        >
          <ShieldAlert :size="14" />
          违禁词检测
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('load-demo'))"
        >
          <FileText :size="14" />
          加载示例
        </button>
      </template>
      <!-- 预览模式：显示其他三个 -->
      <template v-else-if="mode === 'preview'">
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
