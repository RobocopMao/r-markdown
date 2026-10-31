/**
 * 统计面板的数据采集层：把三处现成数据归一化成一份可直接渲染的快照。
 *
 * 三源（不新增任何存储、不打点）：
 *   1. 草稿箱 —— IndexedDB `RMarkdownDrafts`（DraftStorage.list），桌面端另有磁盘镜像；
 *   2. 文章树 —— tree.json（本地磁盘 LocalTreeService / GitHub 仓库 GitHubTreeService）；
 *   3. 磁盘与提交 —— 本地 articles/*.md 的 mtime；GitHub commits API 的提交时间。
 *
 * 设计取舍：
 * - 全部只读，失败一律降级并在 `warnings` 里记一句，绝不因某一源不可用就整页报错；
 * - GitHub 正文优先走 GitHubArticleCache（编辑器写入时已缓存），miss 才发请求，
 *   所以正常使用下这里几乎不产生额外网络流量；
 * - 并发有上限（磁盘 8 / 网络 4），单文件失败只丢那一篇；
 * - 时间戳统一转成毫秒数，切天用本地时区，热力图才和用户认知一致。
 */
import { DraftStorage } from '@/services/DraftStorage'
import { LocalTreeService } from '@/services/LocalTreeService'
import { GitHubTreeService, type TreeNode } from '@/services/GitHubTreeService'
import { GitHubArticleCache } from '@/services/GitHubArticleCache'
import { getActiveWorkspace } from '@/services/articleWorkspace'
import { getArticleFilesDir, getArticlesDir } from '@/services/localArticlePath'
import { resolveArticleFileBase } from '@/utils/articleNaming'
import { analyzeArticle, type ArticleHealth } from '@/services/articleHealth'
import { getSetting } from '@/config/settings'

const IS_TAURI = import.meta.env.VITE_TAURI === 'true'

/** 磁盘正文并发上限 */
const DISK_CONCURRENCY = 8
/** 网络正文并发上限 */
const NET_CONCURRENCY = 4
/** 单次网络请求超时 */
const NET_TIMEOUT = 8000
/** commits 最多翻几页（100/页） */
const COMMIT_MAX_PAGES = 3

export type ArticleSource = 'local' | 'github'

export interface ArticleStat {
  /** 渲染用唯一键 */
  key: string
  id: string
  title: string
  source: ArticleSource
  /** 顶层文件夹名；根级文章为「未分类」 */
  folder: string
  chars: number
  createdAt?: number
  updatedAt?: number
  /** 磁盘文件的 mtime（仅本地模式） */
  fileMtime?: number
  /** 该文章被提交过的日期（毫秒，仅 GitHub 模式，且能按文件名对上） */
  commitDates: number[]
  /** 读不到正文时为 null */
  health: ArticleHealth | null
}

export interface DraftStat {
  id: number
  title: string
  chars: number
  createdAt: number
  updatedAt: number
  /** 推到过公众号（有 wechatMediaId） */
  published: boolean
  health: ArticleHealth
}

export interface ActivityDay {
  /** 本地时区 YYYY-MM-DD */
  day: string
  /** 当天碰到过的条目数（草稿 + 文章，不去重来源） */
  count: number
}

export interface DashboardData {
  articles: ArticleStat[]
  drafts: DraftStat[]
  activity: ActivityDay[]
  /** 各数据源当前是否可用 */
  sources: { drafts: boolean; local: boolean; github: boolean }
  /** 本地磁盘有文件、树里没有 */
  orphanFiles: string[]
  /** 树里有节点、但读不到正文 */
  missingContents: string[]
  warnings: string[]
  loadedAt: number
}

/* ────────────────────────── 小工具 ────────────────────────── */

/** 有并发上限的 map，单项抛错返回 null */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      try {
        out[index] = await fn(items[index], index)
      } catch {
        out[index] = null
      }
    }
  })
  await Promise.all(workers)
  return out
}

/** 带超时的 fetch */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NET_TIMEOUT)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 毫秒时间戳 → 本地时区 YYYY-MM-DD */
export function toDayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO 字符串 / 毫秒数 → 毫秒数，非法返回 undefined */
function toMs(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  const ms = typeof value === 'number' ? value : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : undefined
}

/** 节点所在的顶层文件夹名 */
function topFolderOf(node: TreeNode, byId: Map<string, TreeNode>): string {
  if (!node.parentId) return '未分类'
  let current = byId.get(node.parentId)
  let guard = 0
  while (current?.parentId && guard++ < 32) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return current?.title || '未分类'
}

/* ────────────────────────── 草稿源 ────────────────────────── */

function readHealthOptions(): { customWords: string[]; whitelist: string[] } {
  return {
    customWords: getSetting<string[]>('bannedCustomWords') ?? [],
    whitelist: getSetting<string[]>('bannedWhitelist') ?? [],
  }
}

async function collectDrafts(warnings: string[]): Promise<{ drafts: DraftStat[]; ok: boolean }> {
  try {
    const drafts = await DraftStorage.list()
    const opts = readHealthOptions()
    const stats: DraftStat[] = drafts
      .filter((d) => typeof d.updatedAt === 'number')
      .map((d) => {
        const health = analyzeArticle(d.content ?? '', opts)
        return {
          id: d.id ?? 0,
          title: d.title || '未命名草稿',
          chars: health.chars,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          published: Boolean(d.wechatMediaId),
          health,
        }
      })
    return { drafts: stats, ok: true }
  } catch {
    warnings.push('草稿箱读取失败，本次未包含草稿数据')
    return { drafts: [], ok: false }
  }
}

/* ────────────────────────── GitHub 提交历史 ────────────────────────── */

interface GitHubCommitItem {
  commit?: {
    message?: string
    author?: { date?: string }
    committer?: { date?: string }
  }
}

/** 从 commit message 里认出文章文件名（`保存文章: articles/xxx.md`） */
function fileBaseFromMessage(message: string): string | null {
  const matched = message.match(/articles\/(.+?)\.md\s*$/)
  if (!matched) return null
  try {
    return decodeURIComponent(matched[1])
  } catch {
    return matched[1]
  }
}

/**
 * 拉取 articles 目录的提交历史。
 * 返回「文件基名 → 提交时间数组」和「所有提交时间」两路数据。
 */
async function collectCommits(
  warnings: string[],
): Promise<{ byFile: Map<string, number[]>; all: number[] }> {
  const byFile = new Map<string, number[]>()
  const all: number[] = []
  const cfg = GitHubTreeService.getConfig()
  if (!cfg) return { byFile, all }

  const base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits`
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github.v3+json',
  }

  for (let page = 1; page <= COMMIT_MAX_PAGES; page++) {
    let items: GitHubCommitItem[]
    try {
      const res = await fetchWithTimeout(
        `${base}?path=articles&per_page=100&page=${page}&sha=${encodeURIComponent(cfg.branch)}`,
        { headers, cache: 'no-cache' },
      )
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as unknown
      if (!Array.isArray(data)) throw new Error('payload')
      items = data as GitHubCommitItem[]
    } catch {
      warnings.push('GitHub 提交历史拉取失败，活跃度只看本地数据')
      break
    }
    if (items.length === 0) break

    for (const item of items) {
      const ms = toMs(item.commit?.author?.date ?? item.commit?.committer?.date)
      if (ms === undefined) continue
      all.push(ms)
      const fileBase = fileBaseFromMessage(item.commit?.message ?? '')
      if (!fileBase) continue
      const list = byFile.get(fileBase)
      if (list) list.push(ms)
      else byFile.set(fileBase, [ms])
    }
    if (items.length < 100) break
  }

  return { byFile, all }
}

/* ────────────────────────── 文章树源 ────────────────────────── */

interface TreeCollectResult {
  articles: ArticleStat[]
  orphanFiles: string[]
  missingContents: string[]
  commitAll: number[]
}

/** 本地磁盘模式：tree.json + articles/*.md（一次读取同时拿到正文与 mtime） */
async function collectLocalArticles(
  nodes: TreeNode[],
  warnings: string[],
): Promise<TreeCollectResult> {
  const articleNodes = nodes.filter((n) => n.type === 'article')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const opts = readHealthOptions()
  const filesDir = await getArticleFilesDir()

  const { stat, readTextFile, readDir, exists } = await import('@tauri-apps/plugin-fs')

  const results = await mapLimit(articleNodes, DISK_CONCURRENCY, async (node) => {
    const fileBase = resolveArticleFileBase(node)
    const path = `${filesDir}/${fileBase}.md`
    const content = await readTextFile(path)
    let mtime: number | undefined
    try {
      const info = await stat(path)
      mtime = info.mtime?.getTime()
    } catch {
      /* 拿不到 mtime 不影响统计 */
    }
    const health = analyzeArticle(content, opts)
    const stat0: ArticleStat = {
      key: `local:${node.id}`,
      id: node.id,
      title: node.title,
      source: 'local',
      folder: topFolderOf(node, byId),
      chars: health.chars,
      createdAt: toMs(node.createdAt),
      updatedAt: toMs(node.updatedAt),
      fileMtime: mtime,
      commitDates: [],
      health,
    }
    return stat0
  })

  const articles: ArticleStat[] = []
  const missingContents: string[] = []
  results.forEach((item, index) => {
    if (item) articles.push(item)
    else missingContents.push(articleNodes[index].title)
  })

  // 目录里存在但树里没有登记的 .md（多为手动删节点后残留）
  const orphanFiles: string[] = []
  try {
    if (await exists(filesDir)) {
      const expected = new Set(articleNodes.map((n) => `${resolveArticleFileBase(n)}.md`))
      const entries = await readDir(filesDir)
      for (const entry of entries) {
        const name = entry.name ?? ''
        if (!entry.isFile || !name.endsWith('.md')) continue
        if (name.startsWith('.')) continue
        if (!expected.has(name)) orphanFiles.push(name)
      }
    }
  } catch {
    warnings.push('文章目录读取失败，未校验孤儿文件')
  }

  return { articles, orphanFiles, missingContents, commitAll: [] }
}

/** GitHub 模式：tree.json + 缓存正文 + commits */
async function collectGithubArticles(
  nodes: TreeNode[],
  warnings: string[],
): Promise<TreeCollectResult> {
  const articleNodes = nodes.filter((n) => n.type === 'article')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const opts = readHealthOptions()
  const ns = githubNamespace()
  const cfg = GitHubTreeService.getConfig()
  if (!cfg) {
    warnings.push('未配置 GitHub 云端文章，本次未包含仓库数据')
    return { articles: [], orphanFiles: [], missingContents: [], commitAll: [] }
  }

  const { byFile, all: commitAll } = await collectCommits(warnings)

  const results = await mapLimit(articleNodes, NET_CONCURRENCY, async (node) => {
    const fileBase = resolveArticleFileBase(node)
    let content = await GitHubArticleCache.getArticle(ns, node.id)
    if (content === null) {
      try {
        content = await GitHubTreeService.fetchArticle(node.id, fileBase)
      } catch {
        return null
      }
    }
    const health = analyzeArticle(content, opts)
    const dates = [...(byFile.get(fileBase) ?? []), ...(byFile.get(node.id) ?? [])]
    const stat0: ArticleStat = {
      key: `github:${node.id}`,
      id: node.id,
      title: node.title,
      source: 'github',
      folder: topFolderOf(node, byId),
      chars: health.chars,
      createdAt: toMs(node.createdAt),
      updatedAt: toMs(node.updatedAt),
      fileMtime: undefined,
      commitDates: dates,
      health,
    }
    return stat0
  })

  const articles: ArticleStat[] = []
  const missingContents: string[] = []
  results.forEach((item, index) => {
    if (item) articles.push(item)
    else missingContents.push(articleNodes[index].title)
  })

  if (missingContents.length > 0) {
    warnings.push(`${missingContents.length} 篇仓库文章正文读取失败，未计入体检`)
  }

  return { articles, orphanFiles: [], missingContents, commitAll }
}

/** 与 useGitHubTree 保持一致的缓存命名空间口径 */
function githubNamespace(): string {
  const ws = getActiveWorkspace('github')
  if (ws?.repo) return `github:${ws.repo}:${ws.branch || 'main'}`
  const cfg = GitHubTreeService.getConfig()
  return cfg ? `github:${cfg.owner}/${cfg.repo}:${cfg.branch}` : 'github:legacy'
}

/* ────────────────────────── 汇总 ────────────────────────── */

/** 把各源的日期事件按本地天聚合成热力图序列 */
function buildActivity(
  articles: ArticleStat[],
  drafts: DraftStat[],
  commitAll: number[],
): ActivityDay[] {
  const buckets = new Map<string, number>()
  const bump = (ms?: number) => {
    if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return
    const key = toDayKey(ms)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  for (const draft of drafts) {
    bump(draft.updatedAt)
    if (draft.createdAt !== draft.updatedAt) bump(draft.createdAt)
  }
  for (const article of articles) {
    bump(article.updatedAt)
    bump(article.fileMtime)
    for (const date of article.commitDates) bump(date)
  }
  // 提交时间可能找不到对应文章（重命名/删除过），仍然算「那天动过手」
  const seenCommits = new Set<number>()
  for (const article of articles) for (const d of article.commitDates) seenCommits.add(d)
  for (const ms of commitAll) {
    if (seenCommits.has(ms)) continue
    bump(ms)
  }

  return Array.from(buckets.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * 采集全量统计数据。
 * 桌面端按当前存储模式取一棵树；Web 端只有草稿箱。
 */
export async function collectDashboardData(): Promise<DashboardData> {
  const warnings: string[] = []
  const mode = getSetting<'github' | 'local'>('articleStorageMode')

  const { drafts, ok: draftsOk } = await collectDrafts(warnings)

  let articles: ArticleStat[] = []
  let orphanFiles: string[] = []
  let missingContents: string[] = []
  let commitAll: number[] = []
  let githubAvailable = false
  let localAvailable = false

  if (IS_TAURI) {
    try {
      if (mode === 'local') {
        const tree = await LocalTreeService.fetchTree()
        const result = await collectLocalArticles(tree.nodes, warnings)
        articles = result.articles
        orphanFiles = result.orphanFiles
        missingContents = result.missingContents
        localAvailable = true
        if (tree.nodes.filter((n) => n.type === 'article').length === 0) {
          warnings.push('本地文章树为空，可以在编辑器里新建文章')
        }
      } else {
        const cfg = GitHubTreeService.getConfig()
        if (!cfg) {
          warnings.push('未配置 GitHub 云端文章，只统计本地草稿')
        } else {
          githubAvailable = true
          try {
            const tree = await GitHubTreeService.fetchTree()
            const result = await collectGithubArticles(tree.nodes, warnings)
            articles = result.articles
            missingContents = result.missingContents
            commitAll = result.commitAll
          } catch {
            warnings.push('GitHub 文章树拉取失败，本次只有草稿数据')
            githubAvailable = false
          }
        }
      }
    } catch {
      warnings.push('文章数据读取失败，本次只有草稿数据')
    }
  } else {
    warnings.push('浏览器版没有本地磁盘与仓库数据，只统计草稿箱')
  }

  return {
    articles,
    drafts,
    activity: buildActivity(articles, drafts, commitAll),
    sources: {
      drafts: draftsOk,
      local: localAvailable,
      github: githubAvailable,
    },
    orphanFiles,
    missingContents,
    warnings,
    loadedAt: Date.now(),
  }
}

/** 当前工作目录（仅用于 UI 上标注数据来源） */
export async function currentStorageLabel(): Promise<string> {
  if (!IS_TAURI) return '浏览器草稿箱'
  const mode = getSetting<'github' | 'local'>('articleStorageMode')
  if (mode === 'local') {
    try {
      return await getArticlesDir()
    } catch {
      return '本地目录'
    }
  }
  const cfg = GitHubTreeService.getConfig()
  return cfg ? `${cfg.owner}/${cfg.repo}@${cfg.branch}` : '未配置仓库'
}
