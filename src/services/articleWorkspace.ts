/**
 * 文章工作区管理（github 仓库+分支 / local 目录）。
 *
 * 工作区列表是用户可见的「多仓库多分支多目录」配置层，
 * 激活的工作区会被应用（写入/配置）到对应的旧设置字段/树服务：
 * - github：cloudArticleRepo / cloudArticleBranch + 该工作区专属 Token（cloudArticleTokens）
 * - local：articleStorageDir
 *
 * 当列表为空时视为「未初始化」，沿用旧架构的单仓库/单目录行为，
 * 由 getActiveWorkspace 返回 null 供调用方回退到旧配置。
 */

import { ref } from 'vue'
import { getSetting, setSetting } from '@/config/settings'

export type WorkspaceKind = 'github' | 'local'

export interface ArticleWorkspace {
  id: string
  kind: WorkspaceKind
  /** 展示名（自动生成，用于选择器显示） */
  name: string
  /** github: owner/repo */
  repo?: string
  /** github: 分支，默认 main */
  branch?: string
  /** local: 目录绝对路径（空串表示默认 Documents/R-Markdown/articles） */
  dir?: string
}

const WORKSPACES_KEY = 'articleWorkspaces'
const ACTIVE_GITHUB_KEY = 'activeGithubWorkspaceId'
const ACTIVE_LOCAL_KEY = 'activeLocalWorkspaceId'
/** 各工作区的 GitHub Token 映射（敏感字段，整体加密存储） */
const TOKENS_KEY = 'cloudArticleTokens'

/** 响应式工作区列表 */
export const workspaces = ref<ArticleWorkspace[]>([])
/** 响应式激活 id */
export const activeGithubWorkspaceId = ref<string>(getSetting<string>(ACTIVE_GITHUB_KEY) || '')
export const activeLocalWorkspaceId = ref<string>(getSetting<string>(ACTIVE_LOCAL_KEY) || '')
/** 响应式按工作区 Token 映射 */
export const workspaceTokens = ref<Record<string, string>>(loadWorkspaceTokens())
let seeded = false

function loadWorkspaceTokens(): Record<string, string> {
  const stored = getSetting<Record<string, string>>(TOKENS_KEY)
  return stored && typeof stored === 'object' ? stored : {}
}

/** 获取某工作区的 Token（未配置时为空串） */
export function getWorkspaceToken(id: string): string {
  return workspaceTokens.value[id] || ''
}

/** 设置工作区 Token（空串表示清除） */
export function setWorkspaceToken(id: string, token: string): void {
  const next = { ...workspaceTokens.value }
  if (token) next[id] = token
  else delete next[id]
  workspaceTokens.value = next
  setSetting(TOKENS_KEY, next)
}

function persistWorkspaces() {
  setSetting(WORKSPACES_KEY, workspaces.value)
}

function persistActive(kind: WorkspaceKind, id: string) {
  if (kind === 'github') {
    activeGithubWorkspaceId.value = id
    setSetting(ACTIVE_GITHUB_KEY, id)
  } else {
    activeLocalWorkspaceId.value = id
    setSetting(ACTIVE_LOCAL_KEY, id)
  }
}

function genId(kind: WorkspaceKind): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 6)
  return `${kind === 'github' ? 'gw' : 'lw'}-${ts}-${rand}`
}

function githubName(repo: string, branch: string): string {
  return branch && branch !== 'main' ? `${repo} · ${branch}` : repo
}

function localName(dir: string): string {
  return dir ? dir : '默认目录'
}

/** 按 id 查找工作区（不分类型） */
export function getWorkspaceById(id: string): ArticleWorkspace | null {
  return workspaces.value.find((w) => w.id === id) ?? null
}

/** 过滤某类型的工作区 */
export function listWorkspaces(kind: WorkspaceKind): ArticleWorkspace[] {
  return workspaces.value.filter((w) => w.kind === kind)
}

/** 获取当前激活的工作区；未设置时回退到该类型第一个；没有则返回 null（沿用旧行为） */
export function getActiveWorkspace(kind: WorkspaceKind): ArticleWorkspace | null {
  const list = listWorkspaces(kind)
  if (list.length === 0) return null
  const activeId = kind === 'github' ? activeGithubWorkspaceId.value : activeLocalWorkspaceId.value
  return list.find((w) => w.id === activeId) ?? list[0]
}

/** 设置激活工作区并持久化 */
export function setActiveWorkspace(kind: WorkspaceKind, id: string): ArticleWorkspace | null {
  const ws = getWorkspaceById(id)
  if (!ws || ws.kind !== kind) return null
  persistActive(kind, id)
  return ws
}

/** 新增工作区（自动生成 id 与展示名），返回创建后的工作区 */
export function addWorkspace(kind: WorkspaceKind, partial: Partial<ArticleWorkspace>): ArticleWorkspace {
  const isGithub = kind === 'github'
  const repo = (partial.repo ?? '').trim().replace(/\/+$/, '')
  const branch = (partial.branch ?? '').trim() || 'main'
  const dir = (partial.dir ?? '').trim()
  const ws: ArticleWorkspace = {
    id: genId(kind),
    kind,
    name: isGithub ? githubName(repo, branch) : localName(dir),
    ...(isGithub ? { repo, branch } : { dir }),
  }
  workspaces.value = [...workspaces.value, ws]
  persistWorkspaces()
  return ws
}

/** 更新工作区字段，返回更新后的工作区 */
export function updateWorkspace(id: string, patch: Partial<ArticleWorkspace>): ArticleWorkspace | null {
  const idx = workspaces.value.findIndex((w) => w.id === id)
  if (idx === -1) return null
  const next: ArticleWorkspace = { ...workspaces.value[idx], ...patch }
  next.name =
    next.kind === 'github'
      ? githubName(next.repo ?? '', next.branch ?? 'main')
      : localName(next.dir ?? '')
  const updated = [...workspaces.value]
  updated[idx] = next
  workspaces.value = updated
  persistWorkspaces()
  return next
}

/** 仅从列表移除工作区（不删除任何数据文件），若移除的是当前激活项则切换到同类型第一个 */
export function removeWorkspace(id: string): void {
  const ws = getWorkspaceById(id)
  if (!ws) return
  workspaces.value = workspaces.value.filter((w) => w.id !== id)
  persistWorkspaces()
  setWorkspaceToken(id, '')
  const wasGithubActive = ws.kind === 'github' && activeGithubWorkspaceId.value === id
  const wasLocalActive = ws.kind === 'local' && activeLocalWorkspaceId.value === id
  if (wasGithubActive || wasLocalActive) {
    const first = listWorkspaces(ws.kind)[0]
    persistActive(ws.kind, first ? first.id : '')
  }
}

/**
 * 旧全局 Token 迁移：用户此前可能在「单仓库」结构下配置过 cloudArticleToken，
 * 需要把它对号入座到新的工作区结构，避免用户重复配置。
 *
 * 关键约束：cloudArticleToken 在新架构下被 applyActiveWorkspace 用作「激活工作区 token 的副本」
 * （供 GitHubTreeService.getConfig 同步读取）。因此只有「所有工作区都没配 token」时才视为
 * 真正需要迁移的旧 token；只要任一工作区已配 token，就视为迁移已完成，跳过迁移并清空副本，
 * 避免把激活工作区的 token 副本误填到新增的空工作区。
 */
function migrateLegacyToken(): boolean {
  const legacyToken = getSetting<string>('cloudArticleToken')
  if (!legacyToken) return true // 没有旧 token，视为已迁移完成
  const githubList = listWorkspaces('github')
  if (githubList.length === 0) return false // 没有工作区可迁，保留旧值下次重试
  // 任一工作区已配 token → 视为用户已在新架构下配置，cloudArticleToken 只是被反向同步的副本
  if (githubList.some((w) => getWorkspaceToken(w.id))) {
    // silent 避免触发 setting-changed → checkConfig → ensureWorkspaces 重入
    setSetting('cloudArticleToken', '', true)
    return true
  }
  // 所有工作区都没配 token：真正首次迁移
  const target = githubList[0]
  setWorkspaceToken(target.id, legacyToken)
  // silent 避免触发 setting-changed → checkConfig → ensureWorkspaces 重入
  setSetting('cloudArticleToken', '', true)
  return true
}

/**
 * 用旧的单仓库/单目录配置 seed 出默认工作区（仅在首次、列表为空时执行）。
 *  - github：cloudArticleRepo 有值时生成
 *  - local：桌面端总是生成一个默认工作区（dir 跟随 articleStorageDir）
 * 同时执行旧 Token 迁移（无论列表是否刚 seed，保证用户历史 Token 不被丢）。
 * 桌面端主按钮点击树头选择器前保证执行一次。
 */
export function ensureWorkspaces(): void {
  // 模块加载阶段解密尚未就绪（initEncryption 可能未完成），
  // 这里重新从已经解密好的敏感缓存同步一次工作区 Token。
  workspaceTokens.value = loadWorkspaceTokens()
  if (seeded) {
    // 已 seed 过：仍尝试补迁旧 token（避免首次启动时迁移条件不满足导致 token 永久丢失）
    migrateLegacyToken()
    return
  }
  if (workspaces.value.length > 0) {
    seeded = true
    migrateLegacyToken()
    return
  }
  const stored = getSetting<ArticleWorkspace[]>(WORKSPACES_KEY)
  if (Array.isArray(stored) && stored.length > 0) {
    workspaces.value = stored
    seeded = true
    migrateLegacyToken()
    return
  }

  const isDesktop = import.meta.env.VITE_TAURI === 'true'
  const seeds: ArticleWorkspace[] = []
  const repo = getSetting<string>('cloudArticleRepo')
  if (repo) {
    seeds.push({
      id: genId('github'),
      kind: 'github',
      name: githubName(repo, getSetting<string>('cloudArticleBranch') || 'main'),
      repo,
      branch: getSetting<string>('cloudArticleBranch') || 'main',
    })
  }
  if (isDesktop) {
    seeds.push({
      id: genId('local'),
      kind: 'local',
      name: localName(getSetting<string>('articleStorageDir')),
      dir: getSetting<string>('articleStorageDir'),
    })
  }
  workspaces.value = seeds
  persistWorkspaces()
  seeded = true
  // seed 完成后尝试迁移旧 token；迁移失败时保持 seeded=false 让下次 ensureWorkspaces 重试
  // （主要场景：cloudArticleRepo 暂未配置导致没有 github 工作区可迁）
  if (!migrateLegacyToken()) seeded = false
}