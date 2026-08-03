/**
 * 本地磁盘树形文章系统 — Tauri fs API 封装
 *
 * 与 GitHubTreeService 同名方法、同签名，便于 useGitHubTree 切换。
 * 存储位置：Documents/R-Markdown/articles/
 *   - tree.json        树结构元数据
 *   - articles/{id}.md 文章内容
 *
 * 仅桌面端可用。Web 端调用会抛错。
 */

import type { TreeNode, TreeData } from './GitHubTreeService'

const ARTICLES_DIR = 'R-Markdown/articles'
const ARTICLES_SUBDIR = 'articles'

/** 获取本地文章根目录路径 */
async function getArticlesDir(): Promise<string> {
  const { documentDir } = await import('@tauri-apps/api/path')
  const doc = await documentDir()
  return `${doc}/${ARTICLES_DIR}`
}

/** 获取文章文件存储子目录路径 */
async function getArticleFilesDir(): Promise<string> {
  return `${await getArticlesDir()}/${ARTICLES_SUBDIR}`
}

/** 获取 tree.json 路径 */
async function getTreeFilePath(): Promise<string> {
  return `${await getArticlesDir()}/tree.json`
}

/** 确保目录存在 */
async function ensureDir(dir: string): Promise<void> {
  const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}

/** 读取文本文件（不存在时返回 null） */
async function readTextFile(path: string): Promise<string | null> {
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
    if (!(await exists(path))) return null
    return await readTextFile(path)
  } catch {
    return null
  }
}

/** 写入文本文件（自动创建父目录） */
async function writeTextFile(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash > 0) {
    await ensureDir(path.substring(0, lastSlash))
  }
  await writeTextFile(path, content)
}

/** 删除文件（不存在时静默） */
async function removeFile(path: string): Promise<void> {
  try {
    const { exists, remove } = await import('@tauri-apps/plugin-fs')
    if (await exists(path)) {
      await remove(path)
    }
  } catch {
    // ignore
  }
}

export const LocalTreeService = {
  // ── 树操作 ──

  async fetchTree(): Promise<TreeData> {
    const path = await getTreeFilePath()
    const raw = await readTextFile(path)
    if (raw === null) {
      // 首次使用：返回空树
      return { version: 1, nodes: [] }
    }
    try {
      const parsed = JSON.parse(raw) as TreeData
      if (!Array.isArray(parsed.nodes)) {
        return { version: 1, nodes: [] }
      }
      return parsed
    } catch {
      throw new Error('tree.json 解析失败，请检查文件内容')
    }
  },

  async saveTree(nodes: TreeNode[]): Promise<void> {
    const path = await getTreeFilePath()
    const data: TreeData = { version: 1, nodes }
    await writeTextFile(path, JSON.stringify(data, null, 2))
  },

  // ── 文章操作 ──

  async fetchArticle(id: string): Promise<string> {
    const dir = await getArticleFilesDir()
    const raw = await readTextFile(`${dir}/${id}.md`)
    if (raw === null) throw new Error(`文章不存在: ${id}`)
    return raw
  },

  async saveArticle(id: string, content: string): Promise<void> {
    const dir = await getArticleFilesDir()
    await writeTextFile(`${dir}/${id}.md`, content)
  },

  async deleteArticle(id: string): Promise<void> {
    const dir = await getArticleFilesDir()
    await removeFile(`${dir}/${id}.md`)
  },

  // ── 原子操作 ──

  /** 生成唯一 ID（与 GitHubTreeService 保持一致） */
  generateId(prefix: string): string {
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).substring(2, 8)
    return `${prefix}-${ts}-${rand}`
  },

  async createArticle(parentId: string | null, title: string, content: string): Promise<TreeNode> {
    const tree = await this.fetchTree()
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

    await this.saveArticle(id, content)
    tree.nodes.push(node)
    await this.saveTree(tree.nodes)
    return node
  },

  async createFolder(parentId: string | null, title: string): Promise<TreeNode> {
    const tree = await this.fetchTree()
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

  async deleteNode(id: string): Promise<void> {
    const tree = await this.fetchTree()
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

  async moveNode(id: string, newParentId: string | null): Promise<void> {
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
    const maxOrder = tree.nodes
      .filter((n) => n.parentId === newParentId && n.id !== id)
      .reduce((max, n) => Math.max(max, n.sortOrder), -1)
    node.sortOrder = maxOrder + 1
    await this.saveTree(tree.nodes)
  },

  async updateNodeUpdatedAt(id: string): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) return
    node.updatedAt = new Date().toISOString()
    await this.saveTree(tree.nodes)
  },

  async reorderNode(id: string, direction: 'up' | 'down'): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) throw new Error('节点未找到')

    const siblings = tree.nodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const idx = siblings.findIndex((n) => n.id === id)
    if (idx === -1) return

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= siblings.length) return

    const tmp = node.sortOrder
    node.sortOrder = siblings[targetIdx].sortOrder
    siblings[targetIdx].sortOrder = tmp

    await this.saveTree(tree.nodes)
  },

  async reorderToPosition(id: string, newIndex: number): Promise<void> {
    const tree = await this.fetchTree()
    const node = tree.nodes.find((n) => n.id === id)
    if (!node) return

    const siblings = tree.nodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const oldIndex = siblings.findIndex((n) => n.id === id)
    if (oldIndex === -1) return
    if (oldIndex === newIndex) return
    if (newIndex < 0 || newIndex >= siblings.length) return

    siblings.splice(oldIndex, 1)
    siblings.splice(newIndex, 0, node)

    siblings.forEach((n, i) => {
      n.sortOrder = i * 10
    })

    await this.saveTree(tree.nodes)
  },
}
