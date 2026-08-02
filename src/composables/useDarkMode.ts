import { ref, computed, watch } from 'vue'

export type DarkMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'r-markdown-darkMode'

const mode = ref<DarkMode>((localStorage.getItem(STORAGE_KEY) as DarkMode) || 'system')
const systemDark = ref(false)

// 初始化系统监听（只执行一次）
let initialized = false
function initSystemListener() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mq.matches
  mq.addEventListener('change', (e) => {
    systemDark.value = e.matches
  })
}

const isDark = computed(() => {
  if (mode.value === 'system') return systemDark.value
  return mode.value === 'dark'
})

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  document.documentElement.classList.toggle('dark', dark)
}

// 模块级副作用：只注册一次 watcher，避免 useDarkMode() 每次调用都重复注册
initSystemListener()
watch(isDark, (v) => applyTheme(v), { immediate: true })

export function useDarkMode() {
  function setMode(m: DarkMode) {
    mode.value = m
    localStorage.setItem(STORAGE_KEY, m)
  }

  return { mode, isDark, setMode }
}
