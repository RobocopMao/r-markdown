import { createApp, vaporInteropPlugin } from 'vue'
import App from './App.vue'
import router from './router'
import { preloadMathJax } from './utils/mathRenderer'
import { initSettings } from './config/settings'
import { checkForOldConfig } from './services/startupCheck'
import './styles/style.css'

// 桌面端：检测磁盘上是否有旧配置文件，有则弹窗询问恢复
// 必须在 initSettings() 之前调用，才能判断 localStorage 是否为空（首次启动）
checkForOldConfig()

// 初始化默认配置（仅首次写入缺失的默认值，已有值跳过）
initSettings()

// 预加载 MathJax CDN，减少首次渲染公式的等待
preloadMathJax()

// 桌面客户端启动显示 loading，Vue 挂载后移除，避免白屏闪烁
const isTauri = import.meta.env.VITE_TAURI === 'true'
if (isTauri) {
  const loading = document.getElementById('app-loading')
  if (loading) {
    try {
      const themeRaw = localStorage.getItem('r-markdown-theme')
      if (themeRaw) {
        const theme = JSON.parse(themeRaw)
        if (theme.accent) {
          loading.style.setProperty('--loading-accent', theme.accent)
        }
      }
    } catch {}
    const mode = localStorage.getItem('r-markdown-darkMode') || 'system'
    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    const bg = isDark ? 'rgba(0,0,0,0.88)' : '#f5f5f7'
    const textColor = isDark ? '#6b7280' : '#9ca3af'
    loading.setAttribute(
      'style',
      `display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:${textColor};font-size:14px;background:${bg}`,
    )
  }
}

const mountStart = performance.now()

createApp(App).use(vaporInteropPlugin).use(router).mount('#app')

if (isTauri) {
  const loading = document.getElementById('app-loading')
  if (loading) {
    const minDuration = 300
    const elapsed = performance.now() - mountStart
    const delay = Math.max(0, minDuration - elapsed)
    setTimeout(() => {
      loading.style.opacity = '0'
      loading.style.transition = 'opacity 0.15s'
      setTimeout(() => loading.remove(), 150)
    }, delay)
  }
}
