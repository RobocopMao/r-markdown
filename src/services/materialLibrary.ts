/**
 * 官方素材库（GitHub 仓库托管）
 * 仓库地址由设置项 officialMaterialRepo 控制，默认 robocopmao/r-markdown-materials
 * 请求策略：jsDelivr CDN → GitHub raw → localStorage 缓存
 */

export interface OfficialMaterial {
  id: string
  name: string
  author: string
  category: string
  subCategory?: string
  description: string
  date?: string
  content: string
}

/** 索引条目（含 id / name / category，分类筛选和名称搜索均可在加载前生效） */
export interface IndexEntry {
  id: string
  name: string
  category: string
}

const DEFAULT_REPO = 'RobocopMao/r-markdown-materials'
const DEFAULT_BRANCH = 'main'
const RAW_BASE = 'https://raw.githubusercontent.com'
const CDN_BASE = 'https://cdn.jsdelivr.net/gh'
const API_BASE = 'https://api.github.com/repos'
const FETCH_TIMEOUT = 5000
const LS_PREFIX = 'r-markdown-'

function getRepoPath(): string {
  return localStorage.getItem('r-markdown-officialMaterialRepo') || DEFAULT_REPO
}

let _latestSha: string | null = null
let _shaFetchTime = 0
const SHA_TTL = 60_000

async function getLatestCommitSha(): Promise<string> {
  const repo = getRepoPath()
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

/** 带超时的 fetch */
function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

/** 
 * 多源降级拉取 JSON
 * 依次尝试 jsDelivr → GitHub raw，index.json 失败则读 localStorage 缓存兜底
 */
async function fetchJsonWithFallback(repo: string, sha: string, path: string, useCache = false): Promise<any> {
  const cdnUrl = `${CDN_BASE}/${repo}@${sha}/${path}`
  const rawUrl = `${RAW_BASE}/${repo}/${sha}/${path}`

  // 1. 尝试 jsDelivr CDN
  try {
    const res = await fetchWithTimeout(cdnUrl)
    if (res.ok) {
      const data = await res.json()
      if (useCache) localStorage.setItem(LS_PREFIX + path, JSON.stringify(data))
      return data
    }
  } catch { /* 继续降级 */ }

  // 2. 尝试 GitHub raw
  try {
    const res = await fetchWithTimeout(rawUrl)
    if (res.ok) {
      const data = await res.json()
      if (useCache) localStorage.setItem(LS_PREFIX + path, JSON.stringify(data))
      return data
    }
  } catch { /* 继续降级 */ }

  // 3. 仅 index.json 读 localStorage 缓存兜底
  if (useCache) {
    const cached = localStorage.getItem(LS_PREFIX + path)
    if (cached) return JSON.parse(cached)
  }

  throw new Error(`无法获取 ${path}，网络不可用${useCache ? '且无本地缓存' : ''}`)
}

export const MaterialLibrary = {
  /** 获取官方素材索引列表（含 id + name） */
  async fetchIndex(): Promise<IndexEntry[]> {
    const repo = getRepoPath()
    const sha = await getLatestCommitSha()
    return fetchJsonWithFallback(repo, sha, 'index.json', true)
  },

  /** 获取单个素材详情（含 content），id 由调用方注入（素材 JSON 不含 id 字段） */
  async fetchMaterial(id: string): Promise<OfficialMaterial> {
    const repo = getRepoPath()
    const sha = await getLatestCommitSha()
    const data = await fetchJsonWithFallback(repo, sha, `${id}.json`)
    return { ...data, id }
  },

  /** 设置素材仓库（用于后期自定义仓库） */
  setRepo(repo: string): void {
    localStorage.setItem('r-markdown-officialMaterialRepo', repo)
  },

  getRepo(): string {
    return getRepoPath()
  },
}
