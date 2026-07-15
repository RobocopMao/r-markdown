/**
 * 官方素材库（GitHub 仓库托管）
 * 仓库地址由设置项 officialMaterialRepo 控制，默认 robocopmao/r-markdown-materials
 */

export interface OfficialMaterial {
  id: string
  name: string
  author: string
  category: string
  description: string
  date?: string
  content: string
}

const DEFAULT_REPO = 'RobocopMao/r-markdown-materials'
const DEFAULT_BRANCH = 'main'
const RAW_BASE = 'https://raw.githubusercontent.com'
const API_BASE = 'https://api.github.com/repos'

function getRepoUrl(): string {
  const repo = localStorage.getItem('r-markdown-officialMaterialRepo') || DEFAULT_REPO
  return `${RAW_BASE}/${repo}/${DEFAULT_BRANCH}`
}

let _latestSha: string | null = null
let _shaFetchTime = 0
const SHA_TTL = 60_000 // 1 分钟内不重复请求

async function getLatestCommitSha(): Promise<string> {
  const repo = localStorage.getItem('r-markdown-officialMaterialRepo') || DEFAULT_REPO
  if (_latestSha && Date.now() - _shaFetchTime < SHA_TTL) return _latestSha

  const res = await fetch(`${API_BASE}/${repo}/commits/${DEFAULT_BRANCH}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`获取 commit 信息失败: ${res.status}`)
  const data = await res.json()
  _latestSha = data.sha
  _shaFetchTime = Date.now()
  return _latestSha!
}

export const MaterialLibrary = {
  /** 获取官方素材索引列表 */
  async fetchIndex(): Promise<Omit<OfficialMaterial, 'content'>[]> {
    const repo = localStorage.getItem('r-markdown-officialMaterialRepo') || DEFAULT_REPO
    const sha = await getLatestCommitSha()
    const url = `${RAW_BASE}/${repo}/${sha}/index.json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`获取素材索引失败: ${res.status}`)
    return res.json()
  },

  /** 获取单个素材详情（含 content） */
  async fetchMaterial(id: string): Promise<OfficialMaterial> {
    const base = getRepoUrl()
    // ID 格式如 "cards/001"，拼接路径
    const url = `${base}/${id}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`获取素材失败: ${res.status}`)
    return res.json()
  },

  /** 设置素材仓库（用于后期自定义仓库） */
  setRepo(repo: string): void {
    localStorage.setItem('r-markdown-officialMaterialRepo', repo)
  },

  getRepo(): string {
    return localStorage.getItem('r-markdown-officialMaterialRepo') || DEFAULT_REPO
  },
}
