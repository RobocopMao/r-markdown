<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
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
  ChevronRight,
  ChevronDown,
  GitBranch,
  ArrowUpDown,
  RefreshCw,
  ArrowUpToLine,
  ArrowDownToLine,
  FilePlus,
  FolderPlus,
  Search,
  Crosshair,
  Library,
  BookMarked,
  ShieldAlert,
} from 'lucide-vue-next'

const props = defineProps<{
  /** 当前移动端 Tab：编辑 / 预览 / 文章树。菜单内容随它切换 */
  mode?: 'articles' | 'editor' | 'preview'
  /** 文章树状态，用于把菜单项显示成「收起全部 / 已排序 / 已开启搜索」这类当前态 */
  treeStates?: {
    allExpanded: boolean
    sorting: boolean
    searching: boolean
    autoExpand: boolean
    newAtTop: boolean
  }
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
  // 文章树操作。带 anchor 的那些要把三点按钮本身传出去，供弹出菜单定位
  'tree-toggle-expand': []
  'tree-workspace': [anchor: HTMLElement]
  'tree-sort': [anchor: HTMLElement]
  'tree-refresh': []
  'tree-toggle-new-position': []
  'tree-new-article': []
  'tree-new-folder': []
  'tree-toggle-search': []
  'tree-toggle-autoexpand': []
}>()

/**
 * 文章树状态用 computed 读 props，不要在这里把 props.treeStates 解构/赋值一次——
 * 那样只会拿到首次渲染时的对象，之后的「已排序 / 已开启搜索」状态不会更新。
 */
const treeStates = computed(
  () =>
    props.treeStates ?? {
      allExpanded: false,
      sorting: false,
      searching: false,
      autoExpand: true,
      newAtTop: false,
    },
)

const { toggle: groupToggle, isVisible } = useDropdownGroup('actions')
/** 三点按钮，作为工作区 / 排序浮层的锚点 */
const triggerRef = ref<HTMLElement | null>(null)

function toggle() {
  groupToggle(!isVisible.value)
}

/**
 * 执行菜单项并关闭菜单。
 * 工作区、排序要弹浮层且需要锚点：统一用三点按钮本身当锚点——菜单项在列表里，
 * 弹层一滚动就跟着飘，指到三点按钮下面才稳。
 */
function handleAction(action: (anchor?: HTMLElement) => void) {
  const el = triggerRef.value ?? undefined
  action(el)
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
      ref="triggerRef"
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
      <!--
        文章树模式：与桌面端文章树标题栏那一排按钮一一对应
        （展开全部 / 工作区 / 排序 / 刷新 / 新建文章位置 / 新建文章 / 新建文件夹 / 搜索 / 自动定位）。
        具体执行交给父组件转给 TreeSidebar 的 defineExpose 方法，这里只负责展示与点击。
      -->
      <template v-else>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-toggle-expand'))"
        >
          <ChevronRight v-if="!treeStates.allExpanded" :size="14" />
          <ChevronDown v-else :size="14" />
          {{ treeStates.allExpanded ? '收起全部' : '展开全部' }}
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click.stop="handleAction((el) => emit('tree-workspace', el!))"
        >
          <GitBranch :size="14" />
          切换工作区
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click.stop="handleAction((el) => emit('tree-sort', el!))"
        >
          <ArrowUpDown
            :size="14"
            :style="{ color: treeStates.sorting ? 'var(--accent)' : undefined }"
          />
          排序
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-refresh'))"
        >
          <RefreshCw :size="14" />
          刷新文章
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-toggle-new-position'))"
        >
          <ArrowUpToLine v-if="treeStates.newAtTop" :size="14" style="color: var(--accent)" />
          <ArrowDownToLine v-else :size="14" style="color: var(--accent)" />
          {{ treeStates.newAtTop ? '新文章置顶' : '新文章置底' }}
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-new-article'))"
        >
          <FilePlus :size="14" />
          新建文章
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-new-folder'))"
        >
          <FolderPlus :size="14" />
          新建文件夹
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-toggle-search'))"
        >
          <Search
            :size="14"
            :style="{ color: treeStates.searching ? 'var(--accent)' : undefined }"
          />
          {{ treeStates.searching ? '关闭搜索' : '搜索文章' }}
        </button>
        <button
          class="mobile-action-option w-full flex items-center gap-2 px-3 py-2 rounded-lg border-none bg-transparent cursor-pointer text-[13px] text-black/80 transition-colors duration-150 hover:bg-black/5"
          @click="handleAction(() => emit('tree-toggle-autoexpand'))"
        >
          <Crosshair
            :size="14"
            :style="{ color: treeStates.autoExpand ? 'var(--accent)' : undefined }"
          />
          自动定位
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
