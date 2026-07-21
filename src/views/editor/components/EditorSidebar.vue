<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getSetting, setSetting } from '@/config/settings'
import {
  Component, Paperclip, FilePlus, Bot, Import, Images,
  Sun, Moon, Monitor, Bolt, ChevronDown, ChevronUp, SquareBottomDashedScissors,
  HelpCircle, Package, Library, BookMarked
} from 'lucide-vue-next'

const isTauri = import.meta.env.VITE_TAURI === 'true'
const router = useRouter()
const helpHref = computed(() => isTauri ? 'https://r-markdown.pages.dev/#/help' : undefined)
const aiDemoHref = computed(() => isTauri ? 'https://r-markdown.pages.dev/#/help/r-markdown-formatter' : undefined)

function openHelp() {
  if (isTauri) {
    window.open('https://r-markdown.pages.dev/#/help', '_blank', 'noopener,noreferrer')
  } else {
    router.push('/help')
  }
}

function openAiDemo() {
  if (isTauri) {
    window.open('https://r-markdown.pages.dev/#/help/r-markdown-formatter', '_blank', 'noopener,noreferrer')
  } else {
    router.push('/help/r-markdown-formatter')
  }
}

const props = defineProps<{
  activeTab?: string
  darkMode?: string
  draftCount?: number
}>()

const emit = defineEmits<{
  (e: 'select', tab: string): void
  (e: 'toggleDarkMode'): void
  (e: 'openSettings'): void
  (e: 'openComponents'): void
  (e: 'openDrafts'): void
  (e: 'exampleAction', action: 'load'): void
  (e: 'openImport'): void
  (e: 'openGallery'): void
  (e: 'materialAction', action: 'my' | 'library'): void
}>()

const showExamples = ref(false)
const examplesRef = ref<HTMLElement | null>(null)
const exampleBtnRef = ref<HTMLElement | null>(null)
const popoverPos = ref({ top: '0px', left: '0px' })

const showMaterials = ref(false)
const materialsRef = ref<HTMLElement | null>(null)
const materialBtnRef = ref<HTMLElement | null>(null)
const materialPopoverPos = ref({ top: '0px', left: '0px' })
let materialHideTimer: ReturnType<typeof setTimeout> | null = null
let exampleHideTimer: ReturnType<typeof setTimeout> | null = null

async function showExamplesPopover() {
  if (exampleHideTimer) { clearTimeout(exampleHideTimer); exampleHideTimer = null }
  if (showExamples.value) return
  showExamples.value = true
  if (exampleBtnRef.value) {
    await nextTick()
    const rect = exampleBtnRef.value.getBoundingClientRect()
    popoverPos.value = {
      top: rect.top + 'px',
      left: (rect.right + 4) + 'px',
    }
  }
}

function hideExamplesPopover() {
  exampleHideTimer = setTimeout(() => {
    showExamples.value = false
  }, 150)
}

function cancelExampleHide() {
  if (exampleHideTimer) { clearTimeout(exampleHideTimer); exampleHideTimer = null }
}

async function showMaterialsPopover() {
  if (materialHideTimer) { clearTimeout(materialHideTimer); materialHideTimer = null }
  if (showMaterials.value) return
  showMaterials.value = true
  if (materialBtnRef.value) {
    await nextTick()
    const rect = materialBtnRef.value.getBoundingClientRect()
    materialPopoverPos.value = {
      top: rect.top + 'px',
      left: (rect.right + 4) + 'px',
    }
  }
}

function hideMaterialsPopover() {
  materialHideTimer = setTimeout(() => {
    showMaterials.value = false
  }, 150)
}

function cancelMaterialHide() {
  if (materialHideTimer) { clearTimeout(materialHideTimer); materialHideTimer = null }
}

function selectMaterialAction(action: 'my' | 'library') {
  showMaterials.value = false
  emit('materialAction', action)
}

function selectExample(action: 'load') {
  showExamples.value = false
  emit('exampleAction', action)
}

const collapsed = ref(getSetting<boolean>('sidebarCollapsed') ?? false)

function toggleCollapse() {
  collapsed.value = !collapsed.value
  setSetting('sidebarCollapsed', collapsed.value)
}
</script>

<template>
  <div
    class="editor-sidebar flex flex-col shrink-0 transition-all duration-300"
    :class="collapsed ? 'fixed bottom-4 z-50 shadow-lg' : ''"
    :style="{
      width: collapsed ? 'auto' : '64px',
      height: collapsed ? 'auto' : '100%',
      marginRight: collapsed ? '0px' : '10px',
      left: collapsed ? '10px' : undefined,
      background: collapsed ? 'color-mix(in srgb, var(--bg-primary) 80%, transparent)' : 'var(--bg-primary)',
      borderRadius: collapsed ? '20px' : '12px',
      overflow: collapsed ? 'hidden' : 'visible',
    }"
  >
    <!-- Top content: hidden when collapsed -->
    <div
      class="flex flex-col items-center gap-1 pt-2 pb-1 transition-all duration-300 space-y-2"
      :style="{
        maxHeight: collapsed ? '0px' : '200px',
        opacity: collapsed ? 0 : 1,
        overflow: collapsed ? 'hidden' : 'visible',
        paddingTop: collapsed ? '0px' : undefined,
        paddingBottom: collapsed ? '0px' : undefined,
      }"
    >
      <!-- 草稿列表 button -->
      <button
        class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
        title="草稿箱"
        @click="emit('openDrafts')"
      >
        <SquareBottomDashedScissors :size="24" class="shrink-0" />
        <span class="text-[10px] leading-tight">草稿</span>
        <span
          v-if="draftCount && draftCount > 0"
          class="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-semibold text-white"
          :style="{ background: 'var(--accent)' }"
        >{{ draftCount > 99 ? '99+' : draftCount }}</span>
      </button>
      <!-- 导入 button -->
      <button
        class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
        title="导入文件"
        @click="emit('openImport')"
      >
        <Import :size="24" class="shrink-0" />
        <span class="text-[10px] leading-tight">导入</span>
      </button>
      <!-- 扩展组件 button -->
      <button
        class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
        title="扩展组件API"
        @click="emit('openComponents')"
      >
        <Component :size="24" class="shrink-0" />
        <span class="text-[10px] leading-tight">组件</span>
      </button>
      <!-- 图库 button -->
      <button
        class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
        title="图库"
        @click="emit('openGallery')"
      >
        <Images :size="24" class="shrink-0" />
        <span class="text-[10px] leading-tight">图库</span>
      </button>
      <!-- 素材 button with popover -->
      <div
        class="relative w-full"
        @mouseenter="showMaterialsPopover"
        @mouseleave="hideMaterialsPopover"
      >
        <button
          ref="materialBtnRef"
          class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
          title="素材"
        >
          <Package :size="24" class="shrink-0" />
          <span class="text-[10px] leading-tight">素材</span>
        </button>
        <!-- Materials popover -->
        <div
          v-if="showMaterials"
          ref="materialsRef"
          class="examples-popover fixed rounded-xl z-50 p-1.5 min-w-[120px]"
          :style="{ background: 'white', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', top: materialPopoverPos.top, left: materialPopoverPos.left }"
          @mouseenter="cancelMaterialHide"
          @mouseleave="hideMaterialsPopover"
        >
          <button
            class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5"
            @click="selectMaterialAction('my')"
          >
            <BookMarked :size="14" class="shrink-0" />
            我的素材
          </button>
          <button
            class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5"
            @click="selectMaterialAction('library')"
          >
            <Library :size="14" class="shrink-0" />
            素材库
          </button>
        </div>
      </div>
      <!-- 示例 button with popover -->
      <div
        class="relative w-full"
        @mouseenter="showExamplesPopover"
        @mouseleave="hideExamplesPopover"
      >
        <button
          ref="exampleBtnRef"
          class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
          title="示例"
        >
          <Paperclip :size="24" class="shrink-0" />
          <span class="text-[10px] leading-tight">示例</span>
        </button>
        <!-- Examples popover -->
        <div
          v-if="showExamples"
          ref="examplesRef"
          class="examples-popover fixed rounded-xl z-50 p-1.5 min-w-[120px]"
          :style="{ background: 'white', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', top: popoverPos.top, left: popoverPos.left }"
          @mouseenter="cancelExampleHide"
          @mouseleave="hideExamplesPopover"
        >
          <button
            class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5"
            @click="selectExample('load')"
          >
            <FilePlus :size="14" class="shrink-0" />
            加载示例
          </button>
          <a
            class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5 no-underline"
            :href="aiDemoHref"
            :target="isTauri ? '_blank' : undefined"
            @click.prevent="openAiDemo"
          >
            <Bot :size="14" class="shrink-0" />
            AI排版示例
          </a>
        </div>
      </div>
      <!-- 帮助 button -->
      <a
        :href="helpHref"
        :target="isTauri ? '_blank' : undefined"
        class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150 no-underline"
        title="使用帮助"
        @click.prevent="openHelp"
      >
        <HelpCircle :size="24" class="shrink-0" />
        <span class="text-[10px] leading-tight">帮助</span>
      </a>
    </div>

    <!-- Bottom buttons: dark mode / settings / collapse — always visible -->
    <div
      class="flex items-center gap-1 space-y-1"
      :class="collapsed ? 'flex-col px-1 py-1.5' : 'flex-col pb-2 mt-auto'"
    >
      <button
        class="sidebar-bottom-btn flex items-center justify-center w-8 h-8 cursor-pointer transition-all duration-200 hover:scale-110"
        :class="collapsed ? 'rounded-full' : 'rounded-lg'"
        :title="darkMode === 'dark' ? '切换跟随系统' : darkMode === 'system' ? '切换浅色模式' : '切换深色模式'"
        @click="emit('toggleDarkMode')"
      >
        <Sun v-if="darkMode === 'dark'" :size="20" />
        <Monitor v-else-if="darkMode === 'system'" :size="20" />
        <Moon v-else :size="20" />
      </button>
      <button
        class="sidebar-bottom-btn flex items-center justify-center w-8 h-8 cursor-pointer transition-all duration-200 hover:scale-110"
        :class="collapsed ? 'rounded-full' : 'rounded-lg'"
        title="编辑器设置"
        @click="emit('openSettings')"
      >
        <Bolt :size="20" />
      </button>

      <!-- Collapse / Expand button -->
      <button
        class="flex items-center justify-center w-8 h-8 border-none cursor-pointer transition-colors duration-150"
        :class="collapsed ? 'rounded-full' : 'rounded-lg'"
        :style="{ background: `color-mix(in srgb, var(--accent) 10%, transparent)`, color: 'var(--accent)' }"
        :title="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="toggleCollapse"
      >
        <ChevronDown v-if="!collapsed" :size="20" />
        <ChevronUp v-else :size="20" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-top-btn {
  color: var(--text-secondary);
}
.sidebar-top-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.sidebar-bottom-btn {
  color: var(--text-secondary);
}
.sidebar-bottom-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.sidebar-item:hover {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
.sidebar-item.active:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
</style>

<style>
[data-theme='dark'] .examples-popover {
  background: #2a2a2e !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
}
[data-theme='dark'] .examples-item {
  color: #ccc !important;
}
[data-theme='dark'] .examples-item:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
