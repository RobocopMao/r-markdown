<script setup vapor lang="ts">
import { ref, watch, onBeforeUnmount, nextTick, useSlots } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  title?: string
  width?: string
  showFooter?: boolean
  noBodyPadding?: boolean
  /**
   * 内嵌模式：不 Teleport、不遮罩、不锁滚动、不做抽屉动效，
   * 直接把「头部 / 内容 / 页脚」三段按普通块级布局铺满父容器。
   *
   * 用途：AI 写作 / 排版 / 配图合成一个编辑区内嵌面板（AiBoard.vue），
   * 三者原本都是抽屉，靠这个开关复用同一份模板，避免把 3000 行界面复制一遍。
   * 内嵌时由父级用 v-show 控制显示，本组件不再看 visible 做显隐。
   */
  embedded?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const slots = useSlots()

const show = ref(false)
const leaving = ref(false)

let lockCount = 0
let leaveTimer: ReturnType<typeof setTimeout> | null = null

function lockScroll() {
  lockCount++
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  lockCount--
  if (lockCount <= 0) {
    lockCount = 0
    document.body.style.overflow = ''
  }
}

watch(
  () => props.visible,
  async (v) => {
    // 内嵌模式不看 visible：显隐由父级 v-show 控制，也没有遮罩要锁滚动
    if (props.embedded) return
    if (v) {
      leaving.value = false
      show.value = true
      lockScroll()
      await nextTick()
    } else {
      leaving.value = true
      if (leaveTimer) clearTimeout(leaveTimer)
      leaveTimer = setTimeout(() => {
        show.value = false
        leaving.value = false
      }, 250)
      unlockScroll()
    }
  },
)

onBeforeUnmount(() => {
  if (leaveTimer) clearTimeout(leaveTimer)
  if (show.value) unlockScroll()
})
</script>

<template>
  <!--
    内嵌模式（embedded）：不开传送门、没有遮罩、没有抽屉外框与动效，
    只保留「头部插槽 / 内容 / 页脚」三段，按普通块级布局铺满父容器。
    用于 AI 写作 / 排版 / 配图合成一个编辑区内嵌面板（AiBoard.vue），
    避免把三千行界面复制一遍。显隐由父级 v-show 控制。
  -->
  <Teleport to="body" :disabled="props.embedded">
    <div
      v-if="props.embedded || show"
      :class="
        props.embedded
          ? 'flex h-full min-h-0 w-full flex-col overflow-hidden'
          : [
              'fixed inset-0 z-[999] flex justify-end overflow-hidden',
              leaving ? 'animate-drawer-leave' : 'animate-drawer-enter',
            ]
      "
    >
      <!-- 遮罩（点击关闭）：内嵌模式没有遮罩 -->
      <div
        v-if="!props.embedded"
        class="drawer-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
        @mousedown="emit('close')"
      />
      <!-- 抽屉面板：移动端占满宽度，避免头部按钮与标题挤压重叠；内嵌模式铺满父容器 -->
      <div
        class="drawer-panel relative flex h-full min-h-0 flex-col overflow-hidden"
        :class="
          props.embedded
            ? 'w-full'
            : 'bg-white dark:bg-[#1a1a1a] rounded-l-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]'
        "
        :style="{ '--drawer-width': width || '340px' }"
        @mousedown.stop
        @click.stop
      >
        <!-- Header：内嵌模式不显示标题与关闭按钮（标题在 BoardHeader 里），只留头部插槽 -->
        <div
          v-if="!props.embedded || slots.header"
          class="drawer-header flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] dark:border-[#333]"
          :class="props.embedded ? 'px-4 py-2' : 'px-5 py-3.5'"
        >
          <span
            v-if="title && !props.embedded"
            class="text-base font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] shrink-0"
            >{{ title }}</span
          >
          <div class="drawer-header-slot flex min-w-0 flex-1 items-center gap-2">
            <slot name="header" />
          </div>
          <button
            v-if="!props.embedded"
            class="flex shrink-0 size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[#999] transition-colors hover:bg-[#f5f5f5] hover:text-[#333] dark:hover:bg-[#333] dark:hover:text-[#ccc]"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Body -->
        <div
          class="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
          :class="[
            props.embedded ? 'bg-transparent' : 'bg-[#f5f5f5] dark:bg-[#121212]',
            { 'p-5': !noBodyPadding },
          ]"
        >
          <slot />
        </div>

        <!-- Footer -->
        <div
          v-if="showFooter"
          class="flex shrink-0 justify-end gap-3 border-t border-[#f0f0f0] dark:border-[#333]"
          :class="props.embedded ? 'px-4 py-2.5' : 'p-3'"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 宽度：默认用调用方传入值；窄屏（<640px）占满整屏宽度 */
.drawer-panel {
  width: var(--drawer-width, 340px);
  max-width: 100%;
}

/* 内嵌模式铺满父容器，不吃 --drawer-width */
.drawer-panel.w-full {
  width: 100%;
}

@media (max-width: 639px) {
  .drawer-panel {
    width: 100%;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  /* 窄屏收紧头部间距，给标签留出更多横向空间 */
  .drawer-header {
    gap: 0.5rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
}

/* 头部插槽：窄屏允许横向滚动，避免与右侧关闭按钮重叠 */
@media (max-width: 639px) {
  .drawer-header-slot {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .drawer-header-slot::-webkit-scrollbar {
    display: none;
  }
}

/* 入场：遮罩淡入 + 抽屉从右滑入 */
.animate-drawer-enter .drawer-overlay {
  animation: drawer-overlay-in 0.2s ease-out both;
}
.animate-drawer-enter .drawer-panel {
  animation: drawer-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* 退场：遮罩淡出 + 抽屉向右滑出 */
.animate-drawer-leave .drawer-overlay {
  animation: drawer-overlay-out 0.2s ease-out both;
}
.animate-drawer-leave .drawer-panel {
  animation: drawer-slide-out 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes drawer-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes drawer-overlay-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes drawer-slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes drawer-slide-out {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(100%);
  }
}

/* ── 滚动条 ── */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: #e0e0e0 transparent;
}
.scrollbar-thin::-webkit-scrollbar {
  width: 5px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #e0e0e0;
  border-radius: 3px;
}
.dark .scrollbar-thin {
  scrollbar-color: #444 transparent;
}
.dark .scrollbar-thin::-webkit-scrollbar-thumb {
  background: #444;
}
</style>
