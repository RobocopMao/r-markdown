/**
 * Cloudflare Worker：GitHub API 代理
 * 仅允许来自官方域名、桌面客户端和本地开发的请求。
 */

// secrets injected by wrangler secret put
declare const GITHUB_TOKEN: string
declare const DESKTOP_SECRET: string

const REPO = 'RobocopMao/r-markdown-materials'

const ALLOWED_ORIGINS = [
  'https://robocopmao.github.io',
  'https://r-markdown.pages.dev',
]

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, x-marvis-secret',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin') || ''

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) })
    }

    const desktopSecret = request.headers.get('x-marvis-secret') || ''

    // 桌面客户端鉴权（Tauri 不发送标准 Origin）
    if (desktopSecret && desktopSecret === DESKTOP_SECRET) {
      return forwardToGitHub(request, origin)
    }

    // Web 端 Origin 白名单（含 pages.dev 分支预览）
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.r-markdown.pages.dev')
    ) {
      return forwardToGitHub(request, origin)
    }

    return new Response('Forbidden', {
      status: 403,
      headers: corsHeaders(origin),
    })
  },
}

async function forwardToGitHub(request: Request, origin: string): Promise<Response> {
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
