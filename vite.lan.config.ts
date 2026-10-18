/**
 * 局域网调试配置：pnpm dev:lan 使用（scripts/dev-lan.mjs 负责生成证书后启动）。
 *
 * 与 vite.config.ts 的唯一区别是 server 段：监听所有网卡 + HTTPS。
 * 手机用 http://局域网IP 访问时不是安全上下文，crypto.subtle 为 undefined，
 * src/main.ts 的 boot() 会因 initCrypto() 抛错而完全不挂载 Vue（白屏），
 * 所以局域网必须走 HTTPS。证书由脚本自签，手机点「继续前往」即可。
 *
 * 证书放 .dev-cert/（已在 .gitignore 里忽略），换网络后脚本会自动重签。
 */
import { defineConfig, mergeConfig } from 'vite'
import { readFileSync } from 'fs'
import base from './vite.config'

const certDir = new URL('./.dev-cert/', import.meta.url)
const port = Number(process.env.RMD_LAN_PORT || 5177)

export default mergeConfig(
  base,
  defineConfig({
    server: {
      port,
      host: '0.0.0.0',
      https: {
        cert: readFileSync(new URL('cert.pem', certDir)),
        key: readFileSync(new URL('key.pem', certDir)),
      },
      // mergeConfig 会整体覆盖 server.proxy，所以要把基座里的 /api/leta 代理重写一遍
      proxy: {
        '/api/leta': {
          target: 'https://www.ltimg.com',
          changeOrigin: true,
          rewrite: (path: string) => {
            const rewritten = path.replace(/^\/api\/leta/, '/api')
            return rewritten === '/api' ? '/' : rewritten
          },
        },
      },
    },
  }),
)
