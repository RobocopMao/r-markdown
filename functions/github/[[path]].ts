/**
 * Cloudflare Pages Function：GitHub API 代理
 * 匹配 /github/* 路由，转发到 GitHub Contents API。
 */

interface Env {
  GITHUB_TOKEN: string
  DESKTOP_SECRET: string
}

const REPO = 'RobocopMao/r-markdown-materials'

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  const origin = request.headers.get('Origin') || ''
  const desktopSecret = request.headers.get('x-marvis-secret') || ''

  if (desktopSecret && desktopSecret === env.DESKTOP_SECRET) {
    return forwardToGitHub(request, env)
  }

  if (
    origin === 'https://robocopmao.github.io' ||
    origin === 'https://r-markdown.pages.dev' ||
    origin.endsWith('.r-markdown.pages.dev')
  ) {
    return forwardToGitHub(request, env)
  }

  return new Response('Forbidden', { status: 403 })
}

async function forwardToGitHub(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/github\//, '')
  const githubUrl = `https://api.github.com/repos/${REPO}/contents/${path}`

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`)
  headers.set('Accept', 'application/vnd.github.v3+json')
  headers.delete('Origin')
  headers.delete('x-marvis-secret')

  return fetch(githubUrl, {
    method: request.method,
    headers,
    body: request.body,
  })
}
