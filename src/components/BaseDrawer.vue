<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  title?: string
  width?: string
  showFooter?: boolean
  noBodyPadding?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

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

watch(() => props.visible, async (v) => {
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
})

onBeforeUnmount(() => {
  if (leaveTimer) clearTimeout(leaveTimer)
  if (show.value) unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[999] flex justify-end overflow-hidden"
      :class="leaving ? 'animate-drawer-leave' : 'animate-drawer-enter'"
    >
      <!-- 遮罩（点击关闭） -->
      <div class="drawer-overlay absolute inset-0 bg-black/40 backdrop-blur-sm" @mousedown="emit('close')" />
      <!-- 抽屉面板 -->
      <div
        class="drawer-panel relative flex h-full flex-col overflow-hidden rounded-l-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:bg-[#1a1a1a] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        :style="{ width: width || '340px' }"
        @mousedown.stop
        @click.stop
      >
        <!-- Header -->
        <div class="flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] px-5 py-3.5 dark:border-[#333]">
          <span
            v-if="title"
            class="text-base font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] shrink-0"
          >{{ title }}</span>
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <slot name="header" />
          </div>
          <button
            class="flex shrink-0 size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[#999] transition-colors hover:bg-[#f5f5f5] hover:text-[#333] dark:hover:bg-[#333] dark:hover:text-[#ccc]"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Body -->
        <div
          class="flex-1 overflow-y-auto bg-[#f5f5f5] dark:bg-[#121212] scrollbar-thin"
          :class="{ 'p-5': !noBodyPadding }"
        >
          <slot />
        </div>

        <!-- Footer -->
        <div
          v-if="showFooter"
          class="flex shrink-0 justify-end gap-3 border-t border-[#f0f0f0] px-5 py-3 dark:border-[#333]"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
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
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes drawer-overlay-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes drawer-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes drawer-slide-out {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
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
