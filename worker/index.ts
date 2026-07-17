/**
 * Cloudflare Worker：GitHub API 代理
 * 仅允许来自官方域名和桌面客户端的请求。
 */

// secrets injected by wrangler secret put
declare const GITHUB_TOKEN: string
declare const DESKTOP_SECRET: string

const REPO = 'RobocopMao/r-markdown-materials'

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin') || ''
    const desktopSecret = request.headers.get('x-marvis-secret') || ''

    // 桌面客户端鉴权（Tauri 不发送标准 Origin）
    if (desktopSecret && desktopSecret === DESKTOP_SECRET) {
      return forwardToGitHub(request)
    }

    // Web 端 Origin 白名单
    if (
      origin === 'https://robocopmao.github.io' ||
      origin === 'https://r-markdown.pages.dev' ||
      origin.endsWith('.r-markdown.pages.dev')
    ) {
      return forwardToGitHub(request)
    }

    return new Response('Forbidden', { status: 403 })
  },
}

async function forwardToGitHub(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // /github/{path} → https://api.github.com/repos/{REPO}/contents/{path}
  const path = url.pathname.replace(/^\/github\//, '')
  const githubUrl = `https://api.github.com/repos/${REPO}/contents/${path}`

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${GITHUB_TOKEN}`)
  headers.set('Accept', 'application/vnd.github.v3+json')
  // 清理内部头，不泄露给 GitHub
  headers.delete('Origin')
  headers.delete('x-marvis-secret')

  return fetch(githubUrl, {
    method: request.method,
    headers,
    body: request.body,
  })
}
