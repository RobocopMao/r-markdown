import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readdirSync } from 'fs'

declare const process: { env: Record<string, string | undefined> }

const isTauri = process.env.VITE_TAURI === 'true'
const isWebDeploy = process.env.GITHUB_ACTIONS && !isTauri

// 闭源 extension 子模块：目录为空（拉取失败）时 fallback 到本地空 stub，避免编译报错
const extensionDir = `${__dirname}/src/extension`
const hasExtension =
  existsSync(extensionDir) && readdirSync(extensionDir).filter((f) => !f.startsWith('.')).length > 0

// 私有 views 子模块：拉取失败时 fallback 到公开版首页
const privateHomeFile = `${__dirname}/src/views-private/home/HomePage.vue`
const hasPrivateHome = existsSync(privateHomeFile)

// 百度的两个不同跟踪 ID（可通过环境变量覆盖）
const BAIDU_CF_ID = process.env.BAIDU_CF_ID || '1e39ca5c4cef3fe3c3abdd64d9d567e1'
const BAIDU_GH_ID = process.env.BAIDU_GH_ID || 'a5fcc93a9e4cafcc7bea63232dd8a85f'

function baiduPlugin(): Plugin {
  const baiduId = process.env.CF_PAGES ? BAIDU_CF_ID : isWebDeploy ? BAIDU_GH_ID : null
  const scriptTag = baiduId
    ? `<script>var _hmt=_hmt||[];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?${baiduId}";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s)})()</script>`
    : ''

  return {
    name: 'baidu-analytics',
    transformIndexHtml(html) {
      return html.replace('</head>', `${scriptTag}</head>`)
    },
  }
}

export default defineConfig({
  base: isWebDeploy ? '/r-markdown/' : isTauri ? './' : '/',
  plugins: [vue(), tailwindcss(), baiduPlugin()],
  server: {
    proxy: {
      '/api/leta': {
        target: 'https://www.ltimg.com',
        changeOrigin: true,
        rewrite: (path) => {
          const rewritten = path.replace(/^\/api\/leta/, '/api')
          return rewritten === '/api' ? '/' : rewritten
        },
      },
    },
  },
  resolve: {
    alias: [
      ...(!hasExtension ? [{ find: '@/extension', replacement: '/src/extension-stubs' }] : []),
      ...(!hasPrivateHome ? [{ find: '@/views-private', replacement: '/src/views' }] : []),
      { find: '@', replacement: '/src' },
    ],
    // .ts 优先于 .js，避免旧的 .js 残留文件被优先加载
    extensions: ['.ts', '.mts', '.js', '.mjs', '.jsx', '.tsx', '.json'],
    // 强制 @tauri-apps/api 只加载一份，防止 HMR 产生双实例
    dedupe: ['@tauri-apps/api'],
  },
})
