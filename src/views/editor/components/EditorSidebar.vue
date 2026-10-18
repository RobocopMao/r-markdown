<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getSetting, setSetting } from '@/config/settings'
import {
  Puzzle,
  Paperclip,
  FilePlus,
  Bot,
  Feather,
  ImagePlus,
  Import,
  Images,
  ChevronLeft,
  ChevronRight,
  SquareBottomDashedScissors,
  HelpCircle,
  Package,
  Library,
  BookMarked,
  Folder,
  ShieldAlert,
} from 'lucide-vue-next'

const isTauri = import.meta.env.VITE_TAURI === 'true'
const router = useRouter()
const helpHref = computed(() => (isTauri ? 'https://r-markdown.pages.dev/#/help' : undefined))
const aiDemoHref = computed(() =>
  isTauri ? 'https://r-markdown.pages.dev/#/help/r-markdown-formatter' : undefined,
)

function openHelp() {
  if (isTauri) {
    window.open('https://r-markdown.pages.dev/#/help', '_blank', 'noopener,noreferrer')
  } else {
    router.push('/help')
  }
}

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
  activeTab?: string
  draftCount?: number
  treePanelVisible?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', tab: string): void
  (e: 'openComponents'): void
  (e: 'openDrafts'): void
  (e: 'exampleAction', action: 'load'): void
  (e: 'openImport'): void
  (e: 'openGallery'): void
  (e: 'openBannedWords'): void
  (e: 'materialAction', action: 'my' | 'library'): void
  (e: 'toggleTreePanel'): void
  (e: 'aiAction', action: 'write' | 'format' | 'image'): void
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
  if (exampleHideTimer) {
    clearTimeout(exampleHideTimer)
    exampleHideTimer = null
  }
  if (showExamples.value) return
  showExamples.value = true
  if (exampleBtnRef.value) {
    await nextTick()
    const rect = exampleBtnRef.value.getBoundingClientRect()
    popoverPos.value = {
      top: rect.top + 'px',
      left: rect.right + 4 + 'px',
    }
  }
}

function hideExamplesPopover() {
  exampleHideTimer = setTimeout(() => {
    showExamples.value = false
  }, 150)
}

function cancelExampleHide() {
  if (exampleHideTimer) {
    clearTimeout(exampleHideTimer)
    exampleHideTimer = null
  }
}

const showAi = ref(false)
const aiRef = ref<HTMLElement | null>(null)
const aiBtnRef = ref<HTMLElement | null>(null)
const aiPopoverPos = ref({ top: '0px', left: '0px' })
let aiHideTimer: ReturnType<typeof setTimeout> | null = null

async function showAiPopover() {
  if (aiHideTimer) {
    clearTimeout(aiHideTimer)
    aiHideTimer = null
  }
  if (showAi.value) return
  showAi.value = true
  if (aiBtnRef.value) {
    await nextTick()
    const rect = aiBtnRef.value.getBoundingClientRect()
    aiPopoverPos.value = {
      top: rect.top + 'px',
      left: rect.right + 4 + 'px',
    }
  }
}

function hideAiPopover() {
  aiHideTimer = setTimeout(() => {
    showAi.value = false
  }, 150)
}

function cancelAiHide() {
  if (aiHideTimer) {
    clearTimeout(aiHideTimer)
    aiHideTimer = null
  }
}

function selectAiAction(action: 'write' | 'format' | 'image') {
  showAi.value = false
  emit('aiAction', action)
}

async function showMaterialsPopover() {
  if (materialHideTimer) {
    clearTimeout(materialHideTimer)
    materialHideTimer = null
  }
  if (showMaterials.value) return
  showMaterials.value = true
  if (materialBtnRef.value) {
    await nextTick()
    const rect = materialBtnRef.value.getBoundingClientRect()
    materialPopoverPos.value = {
      top: rect.top + 'px',
      left: rect.right + 4 + 'px',
    }
  }
}

function hideMaterialsPopover() {
  materialHideTimer = setTimeout(() => {
    showMaterials.value = false
  }, 150)
}

function cancelMaterialHide() {
  if (materialHideTimer) {
    clearTimeout(materialHideTimer)
    materialHideTimer = null
  }
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
  <!--
    外层 host 是布局占位者；真正控制折叠的是里面的 shell。

    shell 只过渡 width（60px ↔ 0px）+ overflow:hidden，内层面板固定 60px 宽，
    于是收起时是从右往左被「像帘子一样」盖住——这就是左右折叠，全程不碰高度。

    折叠按钮放在 shell 外面（absolute 贴 host 左下角），所以它既不被裁切、
    也不占布局位置：展开时贴侧栏底部，收起后原地浮在左下角，与改造前的观感一致。
  -->
  <div class="sidebar-host flex shrink-0">
    <div
      class="sidebar-shell"
      :style="{
        width: collapsed ? '0px' : '60px',
        marginRight: collapsed ? '0px' : '10px',
      }"
    >
      <div
        class="editor-sidebar flex flex-col"
        :style="{
          width: '60px',
          height: '100%',
          background: 'var(--bg-primary)',
          borderRadius: '12px',
        }"
      >
        <!-- 顶部入口 -->
        <div class="sidebar-top-content flex flex-col items-center gap-1 pt-2 pb-1 space-y-2">
          <!-- 云端文章 button -->
          <button
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            :class="{ active: props.treePanelVisible }"
            :style="
              props.treePanelVisible
                ? {
                    color: 'var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  }
                : undefined
            "
            @click="emit('toggleTreePanel')"
          >
            <Folder :size="24" class="shrink-0" />
            <span class="text-[10px] leading-tight">文章</span>
          </button>
          <!-- 草稿列表 button -->
          <button
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            @click="emit('openDrafts')"
          >
            <SquareBottomDashedScissors :size="24" class="shrink-0" />
            <span class="text-[10px] leading-tight">草稿</span>
            <span
              v-if="draftCount && draftCount > 0"
              class="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-semibold text-white"
              :style="{ background: 'var(--accent)' }"
              >{{ draftCount > 99 ? '99+' : draftCount }}</span
            >
          </button>
          <!-- 导入 button -->
          <button
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            @click="emit('openImport')"
          >
            <Import :size="24" class="shrink-0" />
            <span class="text-[10px] leading-tight">导入</span>
          </button>
          <!--
        AI button with popover：写作 / 排版 / 配图同属「AI 能力」，合成一个入口，
        二级菜单里再分。悬停展开，与「素材 / 示例」的交互保持一致。
      -->
          <div class="relative w-full" @mouseenter="showAiPopover" @mouseleave="hideAiPopover">
            <button
              ref="aiBtnRef"
              class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            >
              <Bot :size="24" class="shrink-0" />
              <span class="text-[10px] leading-tight">AI</span>
            </button>
            <!-- AI popover -->
            <div
              v-if="showAi"
              ref="aiRef"
              class="examples-popover fixed rounded-xl z-50 p-1.5 min-w-[120px]"
              :style="{
                background: 'white',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                top: aiPopoverPos.top,
                left: aiPopoverPos.left,
              }"
              @mouseenter="cancelAiHide"
              @mouseleave="hideAiPopover"
            >
              <button
                class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5"
                @click="selectAiAction('write')"
              >
                <Feather :size="14" class="shrink-0" />
                AI 写作
              </button>
              <button
                class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5"
                @click="selectAiAction('format')"
              >
                <Bot :size="14" class="shrink-0" />
                AI 排版
              </button>
              <button
                class="examples-item flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border-none bg-transparent cursor-pointer text-black/80 transition-colors duration-150 hover:bg-black/5"
                @click="selectAiAction('image')"
              >
                <ImagePlus :size="14" class="shrink-0" />
                AI 配图
              </button>
            </div>
          </div>
          <!-- 扩展组件 button -->
          <button
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            @click="emit('openComponents')"
          >
            <Puzzle :size="24" class="shrink-0" />
            <span class="text-[10px] leading-tight">组件</span>
          </button>
          <!-- 图库 button -->
          <button
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
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
            >
              <Package :size="24" class="shrink-0" />
              <span class="text-[10px] leading-tight">素材</span>
            </button>
            <!-- Materials popover -->
            <div
              v-if="showMaterials"
              ref="materialsRef"
              class="examples-popover fixed rounded-xl z-50 p-1.5 min-w-[120px]"
              :style="{
                background: 'white',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                top: materialPopoverPos.top,
                left: materialPopoverPos.left,
              }"
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
          <!-- 违禁词检测 button -->
          <button
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            @click="emit('openBannedWords')"
          >
            <ShieldAlert :size="24" class="shrink-0" />
            <span class="text-[10px] leading-tight">检测</span>
          </button>
          <!-- 示例 button with popover -->
          <div
            class="relative w-full"
            @mouseenter="showExamplesPopover"
            @mouseleave="hideExamplesPopover"
          >
            <button
              ref="exampleBtnRef"
              class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150"
            >
              <Paperclip :size="24" class="shrink-0" />
              <span class="text-[10px] leading-tight">示例</span>
            </button>
            <!-- Examples popover -->
            <div
              v-if="showExamples"
              ref="examplesRef"
              class="examples-popover fixed rounded-xl z-50 p-1.5 min-w-[120px]"
              :style="{
                background: 'white',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                top: popoverPos.top,
                left: popoverPos.left,
              }"
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
                AI排版skill
              </a>
            </div>
          </div>
          <!-- 帮助 button -->
          <a
            :href="helpHref"
            :target="isTauri ? '_blank' : undefined"
            class="sidebar-top-btn flex flex-col items-center gap-0.5 w-full py-2 rounded-lg border-none cursor-pointer transition-colors duration-150 no-underline"
            @click.prevent="openHelp"
          >
            <HelpCircle :size="24" class="shrink-0" />
            <span class="text-[10px] leading-tight">帮助</span>
          </a>
        </div>
      </div>
    </div>

    <!--
      折叠按钮：浮在左下角，不占布局位置，也不受 shell 的 overflow 裁切。
      展开时箭头向左 = 收起侧栏；收起时箭头向右 = 展开侧栏。

      left 随状态走：展开时 (60 - 32) / 2 = 14px，落在 60px 面板的水平正中；
      收起时回到 6px，也就是它浮动位置的原点，视觉上不发生跳动。
    -->
    <button
      class="sidebar-collapse-btn flex items-center justify-center border-none cursor-pointer transition-colors duration-150"
      :class="collapsed ? 'rounded-full' : 'rounded-lg'"
      :style="{
        width: '32px',
        height: '32px',
        left: collapsed ? '6px' : '14px',
        background: `color-mix(in srgb, var(--accent) 10%, transparent)`,
        color: 'var(--accent)',
      }"
      @click="toggleCollapse"
    >
      <ChevronLeft v-if="!collapsed" :size="20" />
      <ChevronRight v-else :size="20" />
    </button>
  </div>
</template>

<style scoped>
/*
  折叠只动宽度：shell 60px ↔ 0px + overflow:hidden，内层面板固定 60px 宽，
  收起时像帘子一样从右往左盖住。全程不碰高度，所以不会出现上下塌缩。

  时长与曲线保持一致，避免宽度和内容滑出速度不匹配。
*/
.sidebar-host {
  position: relative;
}

.sidebar-shell {
  overflow: hidden;
  transition: width 0.28s ease;
}

/*
  按钮用 absolute 贴着 host 左下角，而不是 fixed：
  fixed 相对视口定位，侧栏上下左右的留白一变就会飘；
  absolute 跟着侧栏走，也不占布局宽度。

  left 由模板按状态给（展开 14px 居中 / 收起 6px 回原位），这里只兜底定位方式。
  加 left 过渡，让展开收起时按钮水平移动是滑过去而不是瞬移。
*/
.sidebar-collapse-btn {
  position: absolute;
  bottom: 8px;
  z-index: 40;
  transition:
    left 0.28s ease,
    background 0.15s ease;
}

.sidebar-collapse-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent) !important;
}

.sidebar-top-btn {
  color: var(--text-secondary);
}
.sidebar-top-btn:hover {
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
  color: var(--text-secondary);
}
[data-theme='dark'] .examples-item:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
