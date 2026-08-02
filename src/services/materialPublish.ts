/**
 * 素材发布到 GitHub 素材库
 * 通过 Cloudflare Worker 代理，Token 仅在服务端注入，不暴露给客户端。
 */

import type { IndexEntry } from './materialLibrary'
import { getErrorMessage } from '@/utils/helpers'

const DEFAULT_BRANCH = 'main'
const API_BASE = import.meta.env.VITE_API_PROXY || ''
const isTauri = import.meta.env.VITE_TAURI === 'true'
const R_MARKDOWN_SECRET = import.meta.env.VITE_R_MARKDOWN_SECRET || ''

export interface PublishResult {
  ok: boolean
  message: string
}

async function githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}/github/${path}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...((options.headers as Record<string, string>) || {}),
  }
  if (isTauri && R_MARKDOWN_SECRET) {
    headers['r-markdown-secret'] = R_MARKDOWN_SECRET
  }
  return fetch(url, { ...options, headers })
}

interface MaterialData {
  name: string
  author: string
  category: string
  subCategory?: string
  description?: string
  content: string
}

/** 上传素材文件到仓库 */
export async function publishMaterial(
  materialId: string,
  data: MaterialData,
): Promise<PublishResult> {
  try {
    // 1. 获取当前 index.json（需要 sha 用于更新）
    const indexRes = await githubFetch('index.json')
    let indexEntries: IndexEntry[] = []
    let indexSha = ''
    if (indexRes.ok) {
      const indexData = await indexRes.json()
      const raw: unknown[] = indexData.content
        ? JSON.parse(decodeURIComponent(escape(atob(indexData.content.replace(/\n/g, '')))))
        : []
      indexSha = indexData.sha
      // 格式迁移：旧格式 string[] → 新格式 IndexEntry[]
      if (raw.length > 0 && typeof raw[0] === 'string') {
        indexEntries = (raw as string[]).map((id) => {
          const segments = id.split('/')
          return {
            id,
            name: id === materialId ? data.name : '',
            category: segments[0] || 'others',
          }
        })
      } else {
        indexEntries = raw as IndexEntry[]
      }
    }

    // 2. 准备素材文件内容（不含 id，id 由路径决定）
    const today = new Date().toISOString().slice(0, 10)
    const materialFile = {
      name: data.name,
      author: data.author,
      category: data.category,
      subCategory: data.subCategory || '',
      description: data.description || '',
      date: today,
      content: data.content,
    }

    // 3. 检查素材文件是否已存在，获取 sha
    let materialSha = ''
    try {
      const existing = await githubFetch(`${materialId}.json`)
      if (existing.ok) {
        const d = await existing.json()
        materialSha = d.sha
      }
    } catch {
      /* 不存在，新建 */
    }

    // 4. 上传素材文件
    const materialBody: Record<string, string> = {
      message: `发布素材: ${data.name}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(materialFile, null, 2)))),
      branch: DEFAULT_BRANCH,
    }
    if (materialSha) materialBody.sha = materialSha

    const uploadRes = await githubFetch(`${materialId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(materialBody),
    })
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}))
      return { ok: false, message: `上传失败: ${(err as any).message || uploadRes.status}` }
    }

    // 5. 更新 index.json
    const existing = indexEntries.find((e) => e.id === materialId)
    if (existing) {
      existing.name = data.name
      existing.category = data.category
    } else {
      indexEntries.push({ id: materialId, name: data.name, category: data.category })
    }
    // 与 generate-index.mjs 保持一致：按 id 中的日期降序，同一天按完整 id 降序兜底
    const extractDate = (id: string) => {
      const m = id.match(/(\d{4}\/\d{2}\/\d{2})/)
      return m ? m[1] : ''
    }
    indexEntries.sort((a, b) => {
      const dateA = extractDate(a.id)
      const dateB = extractDate(b.id)
      if (dateA !== dateB) return dateB.localeCompare(dateA)
      return b.id.localeCompare(a.id)
    })

    const indexBody: Record<string, string> = {
      message: `更新索引: ${data.name}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(indexEntries, null, 2) + '\n'))),
      branch: DEFAULT_BRANCH,
    }
    if (indexSha) indexBody.sha = indexSha

    const indexUploadRes = await githubFetch('index.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(indexBody),
    })
    if (!indexUploadRes.ok) {
      return { ok: true, message: `素材已上传，但索引更新失败。请手动运行 generate-index.mjs` }
    }

    return { ok: true, message: '发布成功' }
  } catch (e: unknown) {
    return { ok: false, message: `发布失败: ${getErrorMessage(e)}` }
  }
}

/** 提取 content 中所有图片 URL（Markdown ![]() 和 HTML <img>） */
export function extractImageUrls(content: string): string[] {
  const urls: string[] = []

  // 匹配 Markdown 图片: ![alt](url)
  const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = mdRegex.exec(content)) !== null) {
    urls.push(match[1].trim())
  }

  // 匹配 HTML <img> 标签: <img ... src="url" ...>
  const htmlRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi
  while ((match = htmlRegex.exec(content)) !== null) {
    urls.push(match[1].trim())
  }

  return urls
}

/** 检查图片 URL 是否全部为在线地址 */
export interface ImageUrlValidation {
  valid: boolean
  localUrls: string[]
}

export function validateImageUrls(content: string): ImageUrlValidation {
  const urls = extractImageUrls(content)
  const localUrls = urls.filter((url) => !url.startsWith('http://') && !url.startsWith('https://'))
  return {
    valid: localUrls.length === 0,
    localUrls,
  }
}

/** 格式化素材 ID（分类/日期/序号） */
export function generateMaterialId(category: string, date?: string, index?: number): string {
  const catMap: Record<string, string> = {
    标题: 'headings',
    正文: 'body',
    图文: 'media',
    引导: 'cta',
    布局: 'layout',
    节日: 'festival',
    行业: 'verticals',
    其他: 'others',
  }
  const prefix = catMap[category] || 'others'
  const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '/') // YYYY/MM/DD
  const num = index != null ? String(index).padStart(3, '0') : Date.now().toString(36)
  return `${prefix}/${d}/${num}`
}
