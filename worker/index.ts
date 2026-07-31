/**
 * Cloudflare Worker：GitHub API 代理
 * 仅允许来自官方域名、桌面客户端和本地开发的请求。
 */

// secrets injected via wrangler secret put, accessed from env

const REPO = 'RobocopMao/r-markdown-materials'

const ALLOWED_ORIGINS = ['https://robocopmao.github.io', 'https://r-markdown.pages.dev']

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, r-markdown-secret',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const origin = request.headers.get('Origin') || ''
    const GITHUB_TOKEN = env.GITHUB_TOKEN as string
    const DESKTOP_SECRET = env.DESKTOP_SECRET as string

    try {
      // CORS 预检
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(origin) })
      }

      const desktopSecret = request.headers.get('r-markdown-secret') || ''

      // 桌面客户端鉴权（Tauri 不发送标准 Origin）
      if (desktopSecret && desktopSecret === DESKTOP_SECRET) {
        return forwardToGitHub(request, origin, GITHUB_TOKEN)
      }

      // Web 端 Origin 白名单（含 pages.dev 分支预览）
      if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.r-markdown.pages.dev')) {
        return forwardToGitHub(request, origin, GITHUB_TOKEN)
      }

      return new Response('Forbidden', {
        status: 403,
        headers: corsHeaders(origin),
      })
    } catch (e) {
      return new Response(`Worker Error: ${(e as Error).message || String(e)}`, {
        status: 500,
        headers: corsHeaders(origin),
      })
    }
  },
}

async function forwardToGitHub(request: Request, origin: string, token: string): Promise<Response> {
  const url = new URL(request.url)
  // /github/{path} → https://api.github.com/repos/{REPO}/contents/{path}
  const path = url.pathname.replace(/^\/github\//, '')
  const githubUrl = `https://api.github.com/repos/${REPO}/contents/${path}`

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', 'application/vnd.github.v3+json')
  // 清理内部头，不泄露给 GitHub
  headers.delete('Origin')
  headers.delete('r-markdown-secret')

  const resp = await fetch(githubUrl, {
    method: request.method,
    headers,
    body: request.body,
  })

  // 把 GitHub 响应打上 CORS 头
  const newHeaders = new Headers(resp.headers)
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => {
    newHeaders.set(k, v)
  })
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders,
  })
}
