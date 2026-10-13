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
import { getArticleFilesDir, getTreeFilePath } from './localArticlePath'
import {
  buildArticleFileBase,
  isTitleNamingEnabled,
  resolveArticleFileBase,
  uniqueArticleFileBase,
} from '@/utils/articleNaming'

// 路径解析已抽到 localArticlePath.ts，统一支持用户自定义存储目录

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

/** 文件是否存在 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(path)
  } catch {
    return false
  }
}

/** 收集当前树中所有节点已占用的文件基名（文章优先取其实际 file，缺省回退 id） */
function collectTakenFileBases(nodes: TreeNode[]): Set<string> {
  const taken = new Set<string>()
  for (const n of nodes) {
    if (n.type === 'article') taken.add(n.file || n.id)
    else taken.add(n.id)
  }
  return taken
}

/**
 * 写入新文章文件。
 * 开启「用文章名命名文件」时用「文章名-短哈希」并写入 node.file；
 * 否则沿用 `{id}.md`（与改动前完全一致）。
 *
 * 目录里可能残留树中不存在的孤儿文件，因此落盘前用 exists 探测冲突并换名重试。
 */
async function createLocalArticleFile(
  tree: TreeData,
  node: TreeNode,
  content: string,
): Promise<void> {
  const dir = await getArticleFilesDir()
  if (!isTitleNamingEnabled()) {
    await writeTextFile(`${dir}/${node.id}.md`, content)
    return
  }
  const taken = collectTakenFileBases(tree.nodes)
  for (let attempt = 0; attempt < 4; attempt++) {
    const fileBase = uniqueArticleFileBase(
      node.title,
      attempt === 0 ? node.id : `${node.id}-${attempt}`,
      taken,
    )
    if (!(await fileExists(`${dir}/${fileBase}.md`))) {
      await writeTextFile(`${dir}/${fileBase}.md`, content)
      node.file = fileBase
      return
    }
    taken.add(fileBase)
  }
  throw new Error('无法为文章生成唯一文件名，请重试')
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

  /**
   * 读取文章内容。
   * @param id 节点 id（唯一索引）
   * @param fileBase 文件基名（不含 .md）；缺省时按 id 读取，兼容旧命名
   */
  async fetchArticle(id: string, fileBase?: string): Promise<string> {
    const dir = await getArticleFilesDir()
    const raw = await readTextFile(`${dir}/${fileBase || id}.md`)
    if (raw === null) throw new Error(`文章不存在: ${fileBase || id}`)
    return raw
  },

  /**
   * 保存（覆盖）文章内容，保留文件现有位置。
   * @param fileBase 文件基名（不含 .md）；缺省时按 id 读写，兼容旧命名
   */
  async saveArticle(id: string, content: string, fileBase?: string): Promise<void> {
    const dir = await getArticleFilesDir()
    await writeTextFile(`${dir}/${fileBase || id}.md`, content)
  },

  /**
   * 删除文章文件（文件不存在时静默）。
   * @param fileBase 文件基名（不含 .md）；缺省时按 id 删除，兼容旧命名
   */
  async deleteArticle(id: string, fileBase?: string): Promise<void> {
    const dir = await getArticleFilesDir()
    await removeFile(`${dir}/${fileBase || id}.md`)
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

    await createLocalArticleFile(tree, node, content)
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

    // 删除所有 article 的文件（按节点实际文件基名，兼容新旧两种命名）
    const articleNodes = tree.nodes.filter((n) => idsToDelete.has(n.id) && n.type === 'article')
    for (const article of articleNodes) {
      try {
        await this.deleteArticle(article.id, resolveArticleFileBase(article))
      } catch {
        // 文件可能不存在，忽略
      }
    }

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

    const newBase = buildArticleFileBase(newTitle, id)
    if (newBase === oldBase) {
      // 文件名不变（例如只改了大小写/同样净化结果），无需迁移文件
      await this.saveTree(tree.nodes)
      return node
    }

    const dir = await getArticleFilesDir()

    // 1. 读取旧内容（旧文件可能不存在——例如历史孤儿，此时以空内容兜底新建）
    let content = ''
    try {
      content = (await readTextFile(`${dir}/${oldBase}.md`)) ?? ''
    } catch {
      content = ''
    }

    // 2. 写入新文件（不覆盖已存在文件）
    const taken = collectTakenFileBases(tree.nodes)
    taken.delete(oldBase)
    taken.delete(id)
    let actualBase = newBase
    let wrote = false
    for (let attempt = 0; attempt < 4 && !wrote; attempt++) {
      const candidate =
        attempt === 0 && !taken.has(newBase)
          ? newBase
          : uniqueArticleFileBase(newTitle, `${id}-${attempt}`, taken)
      // 防御：候选名若恰好等于旧基名，第 4 步会把刚写入的新文件当旧文件删掉
      if (candidate === oldBase) {
        taken.add(candidate)
        continue
      }
      if (await fileExists(`${dir}/${candidate}.md`)) {
        taken.add(candidate)
        continue
      }
      await writeTextFile(`${dir}/${candidate}.md`, content)
      actualBase = candidate
      wrote = true
    }
    if (!wrote) throw new Error('无法为文章生成唯一文件名，请重试')
    node.file = actualBase

    // 3. 落 tree.json（失败则删除刚建的新文件回滚，避免留下孤儿）
    try {
      await this.saveTree(tree.nodes)
    } catch (e) {
      await removeFile(`${dir}/${actualBase}.md`)
      throw e
    }

    // 4. 删除旧文件（失败仅留孤儿文件，不影响一致性）
    await removeFile(`${dir}/${oldBase}.md`)

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

    // folder 优先再按 sortOrder，与 composable defaultSort 一致
    const siblings = tree.nodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.sortOrder - b.sortOrder
      })

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

    siblings.splice(oldIndex, 1)
    siblings.splice(newIndex, 0, node)

    siblings.forEach((n, i) => {
      n.sortOrder = i * 10
    })

    await this.saveTree(tree.nodes)
  },
}
