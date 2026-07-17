/**
 * 素材发布到 GitHub 素材库
 * 通过 Cloudflare Worker 代理，Token 仅在服务端注入，不暴露给客户端。
 */

const DEFAULT_BRANCH = 'main'
const API_BASE = import.meta.env.VITE_API_PROXY || 'https://r-markdown.pages.dev'

export interface PublishResult {
  ok: boolean
  message: string
}

async function githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}/github/${path}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...(options.headers as Record<string, string> || {}),
  }
  return fetch(url, { ...options, headers })
}

interface IndexEntry {
  id: string
  name: string
  author: string
  category: string
  subCategory?: string
  description: string
  date: string
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
  data: MaterialData
): Promise<PublishResult> {
  try {
    // 1. 获取当前 index.json（需要 sha 用于更新）
    const indexRes = await githubFetch('index.json')
    let indexEntries: IndexEntry[] = []
    let indexSha = ''
    if (indexRes.ok) {
      const indexData = await indexRes.json()
      indexEntries = indexData.content
        ? JSON.parse(decodeURIComponent(escape(atob(indexData.content.replace(/\n/g, '')))))
        : []
      indexSha = indexData.sha
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
    } catch { /* 不存在，新建 */ }

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
    const existingIdx = indexEntries.findIndex((e) => e.id === materialId)
    const newEntry: IndexEntry = {
      id: materialId,
      name: data.name,
      author: data.author,
      category: data.category,
      subCategory: data.subCategory || undefined,
      description: data.description || '',
      date: today,
    }
    if (existingIdx >= 0) {
      indexEntries[existingIdx] = newEntry
    } else {
      indexEntries.push(newEntry)
    }
    indexEntries.sort((a, b) => a.id.localeCompare(b.id))

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
  } catch (e: any) {
    return { ok: false, message: `发布失败: ${e.message}` }
  }
}

/** 格式化素材 ID（分类/日期/序号） */
export function generateMaterialId(category: string, date?: string, index?: number): string {
  const catMap: Record<string, string> = {
    '标题': 'headings',
    '正文': 'body',
    '图文': 'media',
    '引导': 'cta',
    '布局': 'layout',
    '节日': 'festival',
    '行业': 'verticals',
    '其他': 'others',
  }
  const prefix = catMap[category] || 'others'
  const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '/') // YYYY/MM/DD
  const num = index != null ? String(index).padStart(3, '0') : Date.now().toString(36)
  return `${prefix}/${d}/${num}`
}
