/**
 * GitHub 私有仓库树形文章系统 — Contents API 封装
 *
 * 使用 GitHub Contents API 管理树形元数据（tree.json）和文章文件（articles/{id}.md）。
 * Token 只需 repo scope。所有文件内容通过 Base64 编解码。
 */

import { getSetting, setSetting } from '@/config/settings'
import {
  buildArticleFileBase,
  isTitleNamingEnabled,
  resolveArticleFileBase,
  uniqueArticleFileBase,
} from '@/utils/articleNaming'

export interface TreeNode {
  id: string
  title: string
  type: 'folder' | 'article'
  parentId: string | null
  sortOrder: number
  /** ISO 8601 创建时间 */
  createdAt?: string
  /** ISO 8601 最后编辑时间 */
  updatedAt?: string
  /**
   * 文章文件基名（不含 .md），仅「用文章名命名文件」方案写入。
   * 缺省表示沿用旧命名 `{id}.md`；读取一律走 resolveArticleFileBase 回退。
   */
  file?: string
}

export interface TreeData {
  version: number
  nodes: TreeNode[]
}

interface GitHubContentResponse {
  content: string
  sha: string
  encoding: string
  path: string
  name: string
}

interface CloudConfig {
  owner: string
  repo: string
  token: string
  /** 分支（默认 main），GET 用 ?ref，写入用 body.branch */
  branch: string
}

interface RepoConfig {
  owner: string
  repo: string
}

let treeSha: string | null = null

function b64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

function fromB64(str: string): string {
  return decodeURIComponent(escape(atob(str)))
}

function apiBase(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/contents`
}

async function request(url: string, token: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status}: ${body}`)
  }
  return res
}

/**
 * 文章文件基名 → 仓库内相对路径（含 .md）。
 * 基名可能含中文/空格（用文章名命名时），URL 必须逐段编码；
 * 净化阶段已剔除 `/`，不会出现 %2F 破坏路径层级的情况。
 */
function articlePath(fileBase: string): string {
  return `articles/${encodeURIComponent(fileBase)}.md`
}

/**
 * 写入文章文件。
 * sha 为空表示「仅创建」——目标路径已存在时 GitHub 会返回 422（提示缺少 sha），
 * 调用方据此换一个不冲突的文件名重试，而不是静默覆盖。
 */
async function putArticleFile(
  cfg: CloudConfig,
  path: string,
  content: string,
  sha: string | null,
): Promise<Response> {
  const body: Record<string, unknown> = {
    message: `保存文章: ${path}`,
    content: b64(content),
    branch: cfg.branch,
  }
  if (sha) body.sha = sha

  return fetch(`${apiBase(cfg.owner, cfg.repo)}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

/**
 * 解释「仅创建」PUT 的结果：
 * - 成功 → true
 * - 422 且原因是未提供 sha（目标已存在）→ false，交由调用方换名重试
 * - 其他错误 → 抛错
 */
async function interpretCreateOnly(putRes: Response): Promise<boolean> {
  if (putRes.ok) return true
  const errBody = await putRes.text()
  if (putRes.status === 422 && /sha/i.test(errBody)) return false
  throw new Error(`GitHub API ${putRes.status}: ${errBody}`)
}

/** 收集当前树中所有文章已占用的文件基名（含旧命名 id、新命名 file 与文件夹 id） */
function collectTakenFileBases(nodes: TreeNode[]): Set<string> {
  const taken = new Set<string>()
  for (const n of nodes) {
    if (n.type === 'article') taken.add(n.file || n.id)
    // 文件夹 id 也纳入：避免文章基名与（理论上可能同名的）其他标识混淆
    else taken.add(n.id)
  }
  return taken
}

/**
 * 按「文章名-短哈希」创建文章文件（仅创建，不覆盖）。
 * 若目标路径已存在（孤儿文件或哈希碰撞），依次加长哈希重试。
 * @returns 实际写入的文件基名（不含 .md）
 */
async function createArticleFile(
  cfg: CloudConfig,
  tree: TreeData,
  id: string,
  title: string,
  content: string,
): Promise<string> {
  const taken = collectTakenFileBases(tree.nodes)
  for (let attempt = 0; attempt < 4; attempt++) {
    const fileBase =
      attempt === 0
        ? uniqueArticleFileBase(title, id, taken)
        : uniqueArticleFileBase(title, `${id}-${attempt}`, taken)
    const ok = await interpretCreateOnly(
      await putArticleFile(cfg, articlePath(fileBase), content, null),
    )
    if (ok) return fileBase
    taken.add(fileBase)
  }
  throw new Error('无法为文章生成唯一文件名，请重试')
}

/**
 * 改名迁移：把文章内容写到新基名（仅创建，不覆盖），返回实际使用的基名。
 *
 * 与 renameNode 配合保证任一中间态都不丢数据：先建新 → 再落 tree → 最后删旧。
 * 最坏情况只是仓库里多出一个孤儿文件，而 tree.json 指向的文件始终存在。
 */
async function putRenamedArticleFile(
  cfg: CloudConfig,
  tree: TreeData,
  nodeId: string,
  oldBase: string,
  newTitle: string,
  content: string,
): Promise<string> {
  // 排除自身的旧基名与 id：改名不应与自己冲突
  const taken = collectTakenFileBases(tree.nodes)
  taken.delete(oldBase)
  taken.delete(nodeId)

  for (let attempt = 0; attempt < 4; attempt++) {
    const canonical = buildArticleFileBase(newTitle, nodeId)
    const fileBase =
      attempt === 0 && !taken.has(canonical)
        ? canonical
        : uniqueArticleFileBase(newTitle, `${nodeId}-${attempt}`, taken)
    // 防御：候选名若恰好等于旧基名，第 4 步会把刚写入的新文件当旧文件删掉
    if (fileBase === oldBase) {
      taken.add(fileBase)
      continue
    }
    const ok = await interpretCreateOnly(
      await putArticleFile(cfg, articlePath(fileBase), content, null),
    )
    if (ok) return fileBase
    taken.add(fileBase)
  }
  throw new Error('无法为文章生成唯一文件名，请重试')
}

export const GitHubTreeService = {
  // ── 配置（Token / Repo 走统一 settings 框架，独立存储，清一个不影响另一个）──

  getConfig(): CloudConfig | null {
    const token = this.getToken()
    const repo = this.getRepo()
    if (!token || !repo) return null
    return { token, ...repo, branch: getSetting<string>('cloudArticleBranch') || 'main' }
  },

  setConfig(owner: string, repo: string, token: string, branch = 'main'): void {
    // 值未变化时跳过写入，避免重复触发 setting-changed 造成重入
    if (getSetting<string>('cloudArticleToken') !== token) this.setToken(token)
    const combo = `${owner}/${repo}`
    if (getSetting<string>('cloudArticleRepo') !== combo) this.setRepo(owner, repo)
    const targetBranch = branch || 'main'
    if ((getSetting<string>('cloudArticleBranch') || 'main') !== targetBranch) {
      setSetting('cloudArticleBranch', targetBranch, true)
    }
    treeSha = null
  },

  // ── Token ──

  getToken(): string | null {
    return getSetting<string>('cloudArticleToken') || null
  },

  setToken(token: string): void {
    // silent：GitHubTreeService 仅作为激活工作区 token 的副本同步层，
    // 写入不应触发 setting-changed → onSettingChanged → checkConfig 重入。
    setSetting('cloudArticleToken', token, true)
  },

  clearToken(): void {
    setSetting('cloudArticleToken', '', true)
    treeSha = null
  },

  // ── Repo ──

  getRepo(): RepoConfig | null {
    const val = getSetting<string>('cloudArticleRepo')
    if (!val) return null
    const idx = val.indexOf('/')
    if (idx <= 0) return null
    return { owner: val.substring(0, idx), repo: val.substring(idx + 1) }
  },

  setRepo(owner: string, repo: string): void {
    // silent：原因同 setToken，避免 applyActiveWorkspace 同步副本触发事件循环
    setSetting('cloudArticleRepo', `${owner}/${repo}`, true)
  },

  clearRepo(): void {
    setSetting('cloudArticleRepo', '', true)
    treeSha = null
  },

  // ── 树操作 ──

  async fetchTree(): Promise<TreeData> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const url = `${apiBase(cfg.owner, cfg.repo)}/tree.json?ref=${encodeURIComponent(cfg.branch)}`
    const res = await request(url, cfg.token, { cache: 'no-cache' })
    const data: GitHubContentResponse = await res.json()
    treeSha = data.sha
    const json = fromB64(data.content)
    return JSON.parse(json) as TreeData
  },

  async saveTree(nodes: TreeNode[]): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')

    const url = `${apiBase(cfg.owner, cfg.repo)}/tree.json`

    // 我们期望写入的节点状态，409 重试时会根据最新 tree 做合并
    let currentNodes = nodes

    // 最多重试 3 次（含首次），每次重试前重新 GET 最新 tree（sha + content）
    const RETRY_LIMIT = 3
    for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
      // 每次都拉取最新 tree.json，同时获取 sha 和 content
      let latestTree: TreeData | null = null
      try {
        const getRes = await request(`${url}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token, {
          cache: 'no-cache',
        })
        const data: GitHubContentResponse = await getRes.json()
        treeSha = data.sha
        const json = fromB64(data.content)
        latestTree = JSON.parse(json) as TreeData
      } catch {
        // 文件可能不存在（首次创建），此时 sha 为空，latestTree 为 null
      }

      // 409 重试时，将我们的变更合并到最新 tree 上，避免覆盖并发修改
      if (attempt > 0 && latestTree) {
        const latestIds = new Set(latestTree.nodes.map((n) => n.id))
        const merged = [...latestTree.nodes]
        for (const ourNode of currentNodes) {
          const idx = merged.findIndex((n) => n.id === ourNode.id)
          if (idx !== -1) {
            merged[idx] = ourNode // 覆盖已存在的节点（处理重命名/移动等）
          } else {
            merged.push(ourNode) // 追加新节点
          }
        }
        currentNodes = merged
      }

      const treeData: TreeData = { version: 1, nodes: currentNodes }
      const content = b64(JSON.stringify(treeData, null, 2))
      const body: any = {
        message: '更新文章树',
        content,
        branch: cfg.branch,
      }
      if (treeSha) body.sha = treeSha

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (putRes.ok) {
        const putData = await putRes.json()
        treeSha = putData.content?.sha ?? treeSha
        return
      }

      // 409 冲突则重试，其他错误直接抛出
      if (putRes.status !== 409) {
        const errBody = await putRes.text()
        throw new Error(`GitHub API ${putRes.status}: ${errBody}`)
      }

      // 最后一次重试仍然 409，抛出错误
      if (attempt === RETRY_LIMIT - 1) {
        const errBody = await putRes.text()
        throw new Error(`GitHub API 409 (after ${RETRY_LIMIT} attempts): ${errBody}`)
      }

      // 指数退避后重试
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
    }
  },

  // ── 文章操作 ──

  /**
   * 读取文章内容。
   * @param id 节点 id（唯一索引）
   * @param fileBase 文件基名（不含 .md）；缺省时按 id 读取，兼容旧命名
   */
  async fetchArticle(id: string, fileBase?: string): Promise<string> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const path = articlePath(fileBase || id)
    const url = `${apiBase(cfg.owner, cfg.repo)}/${path}?ref=${encodeURIComponent(cfg.branch)}`
    const res = await request(url, cfg.token, { cache: 'no-cache' })
    const data: GitHubContentResponse = await res.json()
    return fromB64(data.content)
  },

  /**
   * 保存（覆盖）文章内容，保留文件现有位置。
   * @param fileBase 文件基名（不含 .md）；缺省时按 id 读写，兼容旧命名
   */
  async saveArticle(id: string, content: string, fileBase?: string): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const path = articlePath(fileBase || id)
    const url = `${apiBase(cfg.owner, cfg.repo)}/${path}`

    // 先获取已有 sha（更新时）
    let existingSha: string | null = null
    try {
      const getRes = await request(`${url}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token, {
        cache: 'no-cache',
      })
      const data: GitHubContentResponse = await getRes.json()
      existingSha = data.sha
    } catch {
      // 新文件
    }

    const putRes = await putArticleFile(cfg, path, content, existingSha)
    if (!putRes.ok) {
      const errBody = await putRes.text()
      throw new Error(`GitHub API ${putRes.status}: ${errBody}`)
    }
  },

  /**
   * 删除文章文件（文件不存在时静默）。
   * @param fileBase 文件基名（不含 .md）；缺省时按 id 删除，兼容旧命名
   */
  async deleteArticle(id: string, fileBase?: string): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const path = articlePath(fileBase || id)
    const url = `${apiBase(cfg.owner, cfg.repo)}/${path}`

    let sha: string
    try {
      const getRes = await request(`${url}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token, {
        cache: 'no-cache',
      })
      const data: GitHubContentResponse = await getRes.json()
      sha = data.sha
    } catch {
      // 文件不存在（或节点已无对应文件）：无需删除
      return
    }

    const delRes = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `删除文章: ${path}`,
        sha,
        branch: cfg.branch,
      }),
    })
    if (!delRes.ok) {
      const errBody = await delRes.text()
      throw new Error(`GitHub API ${delRes.status}: ${errBody}`)
    }
  },

  /**
   * 测试连接：验证 Token、仓库是否可访问；branch 提供时额外校验分支是否存在
   */
  async testConnection(
    owner: string,
    repo: string,
    token: string,
    branch?: string,
  ): Promise<void> {
    const base = `https://api.github.com/repos/${owner}/${repo}`
    await request(base, token)
    if (branch) {
      // 校验分支存在（空仓库默认分支为 main），不存在则抛出可读错误
      const branchUrl = `${base}/branches/${encodeURIComponent(branch)}`
      try {
        await request(branchUrl, token)
      } catch {
        throw new Error(`仓库不存在分支 "${branch}"`)
      }
    }
  },

  // ── 原子操作 ──

  /**
   * 生成唯一 ID
   */
  generateId(prefix: string): string {
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).substring(2, 8)
    return `${prefix}-${ts}-${rand}`
  },

  async createArticle(parentId: string | null, title: string, content: string): Promise<TreeNode> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')

    // 1. 获取当前 tree
    let tree: TreeData
    try {
      tree = await this.fetchTree()
    } catch {
      tree = { version: 1, nodes: [] }
    }

    // 2. 生成 id 并创建节点
    const id = this.generateId('art')
    const maxOrder = tree.nodes
      .filter((n) => n.parentId === parentId)
      .reduce((max, n) => Math.max(max, n.sortOrder), -1)

    const now = new Date().toISOString()
    const node: TreeNode = {
      id,
      title,
      type: 'article',
      parentId,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }

    // 3. 写入文章文件（开启「用文章名命名文件」时用「文章名-短哈希」）
    if (isTitleNamingEnabled()) {
      node.file = await createArticleFile(cfg, tree, id, title, content)
    } else {
      await this.saveArticle(id, content)
    }

    // 4. 更新 tree.json
    tree.nodes.push(node)
    await this.saveTree(tree.nodes)

    return node
  },

  async createFolder(parentId: string | null, title: string): Promise<TreeNode> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')

    let tree: TreeData
    try {
      tree = await this.fetchTree()
    } catch {
      tree = { version: 1, nodes: [] }
    }

    const id = this.generateId('f')
    const maxOrder = tree.nodes
      .filter((n) => n.parentId === parentId)
      .reduce((max, n) => Math.max(max, n.sortOrder), -1)

    const now = new Date().toISOString()
    const node: TreeNode = {
      id,
      title,
      type: 'folder',
      parentId,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }

    tree.nodes.push(node)
    await this.saveTree(tree.nodes)

    return node
  },

  /**
   * 删除节点：从 tree.json 移除，若为 article 则同时删除文章文件
   * 若为 folder：递归删除其下所有子 article 的文件 + 所有子节点
   */
  async deleteNode(id: string): Promise<void> {
    let tree: TreeData
    try {
      tree = await this.fetchTree()
    } catch {
      return
    }

    const node = tree.nodes.find((n) => n.id === id)
    if (!node) return

    // 递归收集需要删除的所有节点 id
    const idsToDelete = new Set<string>()
    function collect(pid: string) {
      idsToDelete.add(pid)
      tree.nodes.filter((n) => n.parentId === pid).forEach((n) => collect(n.id))
    }
    collect(id)

    // 删除所有 article 的文件（按节点实际文件基名，兼容新旧两种命名）
    const articleNodes = tree.nodes.filter((n) => idsToDelete.has(n.id) && n.type === 'article')
    for (const article of articleNodes) {
      try {
        await this.deleteArticle(article.id, resolveArticleFileBase(article))
      } catch {
        // 文件可能不存在，忽略
      }
    }

    // 从 tree 移除
    tree.nodes = tree.nodes.filter((n) => !idsToDelete.has(n.id))
    await this.saveTree(tree.nodes)
  },

  /**
   * 重命名节点。
   *
   * 开启「用文章名命名文件」时，文章文件会同步改名为「新文章名-短哈希」，
   * 老文章（art-xxxx.md）也在此时完成迁移；顺序为
   * 先写新文件 → 再落 tree.json → 最后删旧文件，保证中途失败不丢内容。
   *
   * @returns 更新后的节点（含新的 file 基名），供调用方就地刷新本地树
   */
  async renameNode(id: string, newTitle: string): Promise<TreeNode> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) throw new Error(`节点不存在: ${id}`)

    const oldBase = resolveArticleFileBase(node)
    node.title = newTitle
    node.updatedAt = new Date().toISOString()

    // 非文章节点，或未开启文章名命名 → 只改标题（与改动前行为一致）
    if (node.type !== 'article' || !isTitleNamingEnabled()) {
      await this.saveTree(tree.nodes)
      return node
    }

    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')

    const newBase = buildArticleFileBase(newTitle, id)
    if (newBase === oldBase) {
      // 文件名不变（例如只改了大小写/同样净化结果），无需迁移文件
      await this.saveTree(tree.nodes)
      return node
    }

    // 1. 读取旧内容（旧文件可能不存在——例如历史孤儿，此时以空内容兜底新建）
    let content = ''
    try {
      content = await this.fetchArticle(id, oldBase)
    } catch {
      content = ''
    }

    // 2. 写入新文件（仅创建，不覆盖已存在文件）
    const actualBase = await putRenamedArticleFile(cfg, tree, id, oldBase, newTitle, content)
    node.file = actualBase

    // 3. 落 tree.json（失败则删除刚建的新文件回滚，避免留下孤儿）
    try {
      await this.saveTree(tree.nodes)
    } catch (e) {
      try {
        await this.deleteArticle(id, actualBase)
      } catch {
        // 回滚失败仅留孤儿文件，不影响 tree 一致性
      }
      throw e
    }

    // 4. 删除旧文件（失败仅留孤儿文件，不影响一致性）
    try {
      await this.deleteArticle(id, oldBase)
    } catch {
      // 忽略：tree 已指向新文件
    }

    return node
  },

  async moveNode(
    id: string,
    newParentId: string | null,
    position: 'top' | 'bottom' = 'bottom',
  ): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) throw new Error(`节点不存在: ${id}`)

    // 防止移动到自己的子节点下
    function isDescendant(ancestorId: string, targetId: string): boolean {
      if (ancestorId === targetId) return true
      return tree.nodes
        .filter((n) => n.parentId === ancestorId)
        .some((n) => isDescendant(n.id, targetId))
    }
    if (newParentId && isDescendant(id, newParentId)) {
      throw new Error('不能移动到自己的子节点下')
    }

    node.parentId = newParentId
    node.updatedAt = new Date().toISOString()
    const siblings = tree.nodes.filter((n) => n.parentId === newParentId && n.id !== id)
    if (position === 'top') {
      // 插到头部：取最小 sortOrder - 1
      const minOrder = siblings.reduce((min, n) => Math.min(min, n.sortOrder), 1)
      node.sortOrder = minOrder - 1
    } else {
      // 追加到尾部
      const maxOrder = siblings.reduce((max, n) => Math.max(max, n.sortOrder), -1)
      node.sortOrder = maxOrder + 1
    }
    await this.saveTree(tree.nodes)
  },

  /**
   * 更新节点 updatedAt 时间戳（用于文章保存后同步更新树元数据）
   */
  async updateNodeUpdatedAt(id: string): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) return
    node.updatedAt = new Date().toISOString()
    await this.saveTree(tree.nodes)
  },

  /**
   * 移动节点在同级中的顺序（上移/下移）
   * @param id 目标节点 id
   * @param direction 'up' 上移（与前一节点交换）, 'down' 下移（与后一节点交换）
   */
  async reorderNode(id: string, direction: 'up' | 'down'): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) throw new Error('节点未找到')

    // 获取同级节点（同一 parentId），folder 优先再按 sortOrder，与 composable defaultSort 一致
    const siblings = tree.nodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.sortOrder - b.sortOrder
      })

    const idx = siblings.findIndex((n) => n.id === id)
    if (idx === -1) return

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= siblings.length) return // 已在最前/最后

    // 交换 sortOrder
    const tmp = node.sortOrder
    node.sortOrder = siblings[targetIdx].sortOrder
    siblings[targetIdx].sortOrder = tmp

    await this.saveTree(tree.nodes)
  },

  /**
   * 拖拽排序：将节点移动到同级中的指定位置
   * @param id 目标节点 id
   * @param newIndex 同级中的目标索引（0-based，插入后位于该位置）
   */
  async reorderToPosition(id: string, newIndex: number): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) return

    const siblings = tree.nodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => {
        // 与 composable defaultSort 一致：folder 优先，再按 sortOrder
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.sortOrder - b.sortOrder
      })

    const oldIndex = siblings.findIndex((n) => n.id === id)
    if (oldIndex === -1) return
    if (oldIndex === newIndex) return
    if (newIndex < 0) return
    // 允许 newIndex === siblings.length（追加到末尾）：
    // splice 移除自身后 length-1，splice(newIndex, 0) 会追加到末尾，合法

    // 从旧位置移除，插入新位置
    siblings.splice(oldIndex, 1)
    siblings.splice(newIndex, 0, node)

    // 重新分配 sortOrder（步长 10，留出插入空间）
    siblings.forEach((n, i) => {
      n.sortOrder = i * 10
    })

    await this.saveTree(tree.nodes)
  },
}
