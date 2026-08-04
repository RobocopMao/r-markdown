/**
 * GitHub 私有仓库树形文章系统 — Contents API 封装
 *
 * 使用 GitHub Contents API 管理树形元数据（tree.json）和文章文件（articles/{id}.md）。
 * Token 只需 repo scope。所有文件内容通过 Base64 编解码。
 */

import { getSetting, setSetting } from '@/config/settings'

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

export const GitHubTreeService = {
  // ── 配置（Token / Repo 走统一 settings 框架，独立存储，清一个不影响另一个）──

  getConfig(): CloudConfig | null {
    const token = this.getToken()
    const repo = this.getRepo()
    if (!token || !repo) return null
    return { token, ...repo }
  },

  setConfig(owner: string, repo: string, token: string): void {
    this.setToken(token)
    this.setRepo(owner, repo)
    treeSha = null
  },

  // ── Token ──

  getToken(): string | null {
    return getSetting<string>('cloudArticleToken') || null
  },

  setToken(token: string): void {
    setSetting('cloudArticleToken', token)
  },

  clearToken(): void {
    setSetting('cloudArticleToken', '')
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
    setSetting('cloudArticleRepo', `${owner}/${repo}`)
  },

  clearRepo(): void {
    setSetting('cloudArticleRepo', '')
    treeSha = null
  },

  // ── 树操作 ──

  async fetchTree(): Promise<TreeData> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const url = `${apiBase(cfg.owner, cfg.repo)}/tree.json`
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
        const getRes = await request(url, cfg.token, { cache: 'no-cache' })
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

  async fetchArticle(id: string): Promise<string> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const url = `${apiBase(cfg.owner, cfg.repo)}/articles/${id}.md`
    const res = await request(url, cfg.token, { cache: 'no-cache' })
    const data: GitHubContentResponse = await res.json()
    return fromB64(data.content)
  },

  async saveArticle(id: string, content: string): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const url = `${apiBase(cfg.owner, cfg.repo)}/articles/${id}.md`

    // 先获取已有 sha（更新时）
    let existingSha: string | null = null
    try {
      const getRes = await request(url, cfg.token, { cache: 'no-cache' })
      const data: GitHubContentResponse = await getRes.json()
      existingSha = data.sha
    } catch {
      // 新文件
    }

    const body: any = {
      message: `保存文章: ${id}`,
      content: b64(content),
    }
    if (existingSha) body.sha = existingSha

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!putRes.ok) {
      const errBody = await putRes.text()
      throw new Error(`GitHub API ${putRes.status}: ${errBody}`)
    }
  },

  async deleteArticle(id: string): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('未配置 GitHub 云端文章')
    const url = `${apiBase(cfg.owner, cfg.repo)}/articles/${id}.md`

    const getRes = await request(url, cfg.token, { cache: 'no-cache' })
    const data: GitHubContentResponse = await getRes.json()

    const delRes = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `删除文章: ${id}`,
        sha: data.sha,
      }),
    })
    if (!delRes.ok) {
      const errBody = await delRes.text()
      throw new Error(`GitHub API ${delRes.status}: ${errBody}`)
    }
  },

  /**
   * 测试连接：验证 Token 和仓库是否可访问
   */
  async testConnection(owner: string, repo: string, token: string): Promise<void> {
    const url = `https://api.github.com/repos/${owner}/${repo}`
    await request(url, token)
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

    // 3. 写入文章文件
    await this.saveArticle(id, content)

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

    // 删除所有 article 的文件
    const articleNodes = tree.nodes.filter((n) => idsToDelete.has(n.id) && n.type === 'article')
    for (const article of articleNodes) {
      try {
        await this.deleteArticle(article.id)
      } catch {
        // 文件可能不存在，忽略
      }
    }

    // 从 tree 移除
    tree.nodes = tree.nodes.filter((n) => !idsToDelete.has(n.id))
    await this.saveTree(tree.nodes)
  },

  async renameNode(id: string, newTitle: string): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) throw new Error(`节点不存在: ${id}`)
    node.title = newTitle
    node.updatedAt = new Date().toISOString()
    await this.saveTree(tree.nodes)
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
