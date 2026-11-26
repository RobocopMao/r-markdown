import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'

declare const process: { env: Record<string, string | undefined> }

const isTauri = process.env.VITE_TAURI === 'true'
const isWebDeploy = process.env.GITHUB_ACTIONS && !isTauri

/** 产物路径前缀：GitHub Pages 子路径 / Tauri 相对路径 / 本地绝对路径 */
const base = isWebDeploy ? '/r-markdown/' : isTauri ? './' : '/'

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

/**
 * 首页 chunk 预加载（仅 Web 版）。
 *
 * 首页是懒加载路由，浏览器要等 entry 执行、router 解析完才会去拉它的 chunk：
 * 实测 entry 到 t≈180ms 就开始下载，首页 chunk 却拖到 t≈1100ms 才发请求，
 * 首屏白白多等一个往返。这里在构建产物落地后，把首页 chunk 名写进 index.html
 * 的 modulepreload，让它和 entry 并行下载。
 *
 * 用 writeBundle 而不是 transformIndexHtml：后者在 vite:build-html 里执行，
 * 早于本插件的 generateBundle，那时还拿不到 chunk 文件名。
 *
 * 桌面端不走这条路：Tauri 版首页就是编辑器，预加载商品页反而浪费。
 */
function homePreloadPlugin(): Plugin {
  let homeChunk = ''
  const isHomeModule = (id: string) => /views(-private)?[\\/]home[\\/]HomePageV2\.vue$/.test(id)

  return {
    name: 'home-chunk-preload',
    apply: () => !isTauri,
    generateBundle(_options, bundle) {
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        // chunk.modules 的 key 就是模块 id（value 上只有 code/长度，没有 id）
        if (Object.keys(chunk.modules || {}).some(isHomeModule)) {
          homeChunk = file
          break
        }
      }
    },
    writeBundle(options) {
      if (!homeChunk) return
      const outDir = options.dir || 'dist'
      const htmlPath = `${outDir}/index.html`
      if (!existsSync(htmlPath)) return
      const html = readFileSync(htmlPath, 'utf8')
      if (html.includes(homeChunk)) return
      const href = `${base}${homeChunk}`
      const tag = `<link rel="modulepreload" crossorigin href="${href}">`
      writeFileSync(htmlPath, html.replace('</head>', `  ${tag}\n  </head>`))
    },
  }
}

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
  base,
  plugins: [vue(), tailwindcss(), baiduPlugin(), homePreloadPlugin()],
  build: {
    // rolldown(oxc) 压缩时会把 "\n" 这类单字符字符串写成含真实换行的模板字面量，
    // vite:build-import-analysis 里的 es-module-lexer 解析这类 chunk 会抛 Parse error，
    // 生产构建整个失败。关掉 compress、只保留标识符混淆，构建即可通过。
    rolldownOptions: { output: { minify: { compress: false } } },
  },
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
