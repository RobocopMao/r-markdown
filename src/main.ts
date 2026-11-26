import { createApp, vaporInteropPlugin } from 'vue'
import App from './App.vue'
import router from './router'
import { preloadMathJax } from './utils/mathRenderer'
import { initSettings, initEncryption } from './config/settings'
import { checkForOldConfig } from './services/startupCheck'
import './styles/style.css'

// 桌面端：检测磁盘上是否有旧配置文件，有则弹窗询问恢复
// 必须在 initSettings() 之前调用，才能判断 localStorage 是否为空（首次启动）
checkForOldConfig()

// 初始化默认配置（仅首次写入缺失的默认值，已有值跳过）
initSettings()

// MathJax 的 tex-svg.js 有 3MB，只有在文档里真的出现公式时才需要。
// 原先在这里无条件预加载，等于每次打开首页都白拉 3MB —— 改成空闲时再预取。
function prefetchMathJaxIdle() {
  const run = () => preloadMathJax()
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    }
  ).requestIdleCallback
  if (ric) ric.call(window, run, { timeout: 5000 })
  else setTimeout(run, 1500)
}

if (document.readyState === 'complete') {
  prefetchMathJaxIdle()
} else {
  window.addEventListener('load', prefetchMathJaxIdle, { once: true })
}

/**
 * 收掉启动页（index.html 里那个全屏 R+M 字标）。
 *
 * 时机是这个函数唯一的难点：Vue 把 DOM 写进去 ≠ 用户看到画面。
 * 所以这里等两层——先 await router.isReady() 让首页那个懒加载 chunk 解析完，
 * 再用连续两帧 rAF 保证浏览器真的把那帧画出来，最后才淡出。
 *
 * 「最短展示时长」是给快网准备的：局域网里 100ms 就加载完的话，
 * 启动页一闪而过反而像闪屏，所以至少留 420ms。
 */
function dismissLoader() {
  const loading = document.getElementById('app-loading')
  if (!loading) return

  const MIN_VISIBLE = 420
  const FADE = 320
  const delay = Math.max(0, MIN_VISIBLE - (performance.now() - bootStart))

  const finish = () => {
    loading.classList.add('is-done')
    // transitionend 正常路径；再用 timeout 兜底（prefers-reduced-motion 下没有过渡）
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      loading.remove()
    }
    loading.addEventListener('transitionend', remove, { once: true })
    setTimeout(remove, FADE + 80)
  }

  setTimeout(() => {
    requestAnimationFrame(() => {
      // 第一帧让真实内容上屏，第二帧再淡出，避免中间露白
      requestAnimationFrame(finish)
    })
  }, delay)
}

/**
 * 初始化加密层（解密敏感字段到内存缓存，迁移旧明文格式）。
 * 必须在挂载 Vue、任何 getSetting 读取敏感字段之前完成，
 * 否则旧 Token 工作区迁移等初始化逻辑会读取到空值。
 */
async function boot() {
  await initEncryption()
  createApp(App).use(vaporInteropPlugin).use(router).mount('#app')
  // 首个路由的组件是懒加载的，isReady 之后才真的有东西可看
  await router.isReady()
  dismissLoader()
}

const bootStart = performance.now()
void boot()

// 兜底：无论上面哪一步卡住，8 秒后都把启动页收掉，不让用户对着 logo 干等
setTimeout(() => {
  const loading = document.getElementById('app-loading')
  if (loading) loading.remove()
}, 8000)
