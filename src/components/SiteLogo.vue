<script setup vapor lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useTheme } from '@/composables/useTheme'

const props = withDefaults(
  defineProps<{
    /** 是否启鼠标悬停打字机效果 */
    typing?: boolean
  }>(),
  {
    typing: true,
  },
)

const { colors } = useTheme()
const accentColor = computed(() => colors.value.accent)

const logoTextRef = ref<HTMLElement | null>(null)
const logoFullText = 'R-Markdown'
let logoTypingTimer: ReturnType<typeof setTimeout> | null = null
let logoTyping = false

function onLogoEnter() {
  if (!props.typing || logoTyping) return
  const el = logoTextRef.value
  if (!el) return
  if (logoTypingTimer) clearTimeout(logoTypingTimer)
  logoTyping = true
  el.textContent = ''
  el.classList.add('typing-cursor')
  let i = 0
  function typeNext() {
    if (i < logoFullText.length) {
      el!.textContent += logoFullText[i]
      i++
      logoTypingTimer = setTimeout(typeNext, 60)
    } else {
      logoTypingTimer = setTimeout(() => {
        el!.classList.remove('typing-cursor')
        logoTyping = false
      }, 400)
    }
  }
  typeNext()
}

function onLogoLeave() {
  if (!props.typing || logoTyping) return
  const el = logoTextRef.value
  if (!el) return
  if (logoTypingTimer) clearTimeout(logoTypingTimer)
  el.classList.remove('typing-cursor')
  el.textContent = logoFullText
}

onBeforeUnmount(() => {
  if (logoTypingTimer) clearTimeout(logoTypingTimer)
})
</script>

<template>
  <router-link
    to="/"
    class="flex items-center gap-2.5 no-underline shrink-0 logo-link"
    @mouseenter="onLogoEnter"
    @mouseleave="onLogoLeave"
  >
    <svg class="logo-icon" viewBox="0 0 24 24" width="26" height="26">
      <rect width="24" height="24" rx="6" :fill="accentColor" />
      <text x="3.5" y="16" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="white">RM</text>
    </svg>
    <span
      ref="logoTextRef"
      class="text-[17px] font-bold text-[#111] tracking-tight logo-text"
      :style="{ '--logo-accent': accentColor }"
      >R-Markdown</span
    >
  </router-link>
</template>

<style scoped>
.logo-link {
  cursor: pointer;
}
.logo-text {
  display: inline-block;
  min-width: 0;
}
.typing-cursor::after {
  content: '|';
  display: inline-block;
  margin-left: 1px;
  font-weight: 400;
  color: var(--logo-accent, #6c5ce7);
  animation: blink-cursor 0.6s step-end infinite;
}
@keyframes blink-cursor {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}
</style>

<style>
/* 深色模式 */
[data-theme='dark'] .logo-text {
  color: #f0f0f0;
}
</style>
