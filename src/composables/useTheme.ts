import { ref, computed, watch } from 'vue'
import { hexToRgb, lightenHex, darkenHex } from '@/utils/helpers'

export interface ThemeColors {
  accent: string
  dark: string
  light: string
  border: string
  rgb: string
}

const THEMES = [
  { accent: '#6c5ce7', dark: '#5a4bd1' },
  { accent: '#667eea', dark: '#536DFE' },
  { accent: '#e74c3c', dark: '#c0392b' },
  { accent: '#27ae60', dark: '#1e8449' },
  { accent: '#f39c12', dark: '#e67e22' },
  { accent: '#e84393', dark: '#d63384' },
  { accent: '#00b894', dark: '#00a381' },
  { accent: '#0984e3', dark: '#0769b5' },
  { accent: '#fd79a8', dark: '#e84393' },
  { accent: '#a29bfe', dark: '#6c5ce7' },
  { accent: '#888888', dark: '#666666' },
  { accent: '#000000', dark: '#1a1a1a' },
  { accent: '#1e3a5f', dark: '#0f2744' },
  { accent: '#722f37', dark: '#5a252c' },
  { accent: '#556B2F', dark: '#3d4f1f' },
]

const STORAGE_KEY = 'r-markdown-theme'

// 模块级单例 ref，确保所有 useTheme() 调用方共享同一份响应式状态
const saved = (() => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
})()

let init = THEMES[3]
const isCustom = ref(false)
if (saved?.accent) {
  const match = THEMES.find((t2) => t2.accent.toLowerCase() === saved.accent.toLowerCase())
  if (match) {
    init = match
  } else {
    init = { accent: saved.accent, dark: saved.dark }
    isCustom.value = true
  }
}

const accent = ref(init.accent)
const accentDark = ref(init.dark)
const customColor = ref(isCustom.value ? init.accent : init.accent)

const colors = computed<ThemeColors>(() => ({
  accent: accent.value,
  dark: accentDark.value,
  light: accent.value + '26',
  border: accent.value + '33',
  rgb: hexToRgb(accent.value),
}))

/** 把当前主题色应用到 :root CSS 变量 */
function applyCssVars(a: string, d: string) {
  const root = document.documentElement
  root.style.setProperty('--accent', a)
  root.style.setProperty('--accent-dark', d)
  root.style.setProperty('--accent-light', a + '26')
  root.style.setProperty('--accent-border', a + '33')
  root.style.setProperty('--accent-rgb', hexToRgb(a))
}

// 模块级副作用：只注册一次 watcher，accent / accentDark 变化时自动同步 CSS 变量
// 避免 useTheme() 每次被调用都重复注册 watcher + 重复 applyCssVars
watch([accent, accentDark], ([a, d]) => applyCssVars(a, d), { immediate: true })

function setTheme(a: string, d: string) {
  accent.value = a
  accentDark.value = d
  isCustom.value = false
  customColor.value = a
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: a, dark: d }))
}

function setCustomTheme(hex: string) {
  customColor.value = hex
  const dark = darkenHex(hex, 0.15)
  setTheme(hex, dark)
  isCustom.value = true
}

export function useTheme() {
  return {
    accent,
    accentDark,
    colors,
    setTheme,
    setCustomTheme,
    customColor,
    themes: THEMES,
    lightenHex,
  }
}
