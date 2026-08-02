import { ref, computed } from 'vue'
import { GitHubTreeService, type TreeNode } from '@/services/GitHubTreeService'
import { GitHubArticleCache } from '@/services/GitHubArticleCache'
import { getErrorMessage } from '@/utils/helpers'

// ── 模块级单例状态（所有调用方共享同一份数据）──
const isConfigured = ref(false)

// ── 云端文章关联持久化 ──
const CLOUD_ARTICLE_ID_KEY = 'r-markdown-cloudArticleId'
const CLOUD_ARTICLE_TITLE_KEY = 'r-markdown-cloudArticleTitle'
const AUTO_EXPAND_KEY = 'r-markdown-autoExpand'

const treeData = ref<TreeNode[]>([])
const selectedNode = ref<TreeNode | null>(null)
const expandedIds = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref('')
const currentCloudArticleId = ref<string | null>(null)
const reordering = ref(false)

/** 是否自动展开当前关联文章所在文件夹 */
const autoExpandEnabled = ref(localStorage.getItem(AUTO_EXPAND_KEY) !== 'false')

function persistCloudArticle(id: string, title?: string) {
  localStorage.setItem(CLOUD_ARTICLE_ID_KEY, id)
  if (title) localStorage.setItem(CLOUD_ARTICLE_TITLE_KEY, title)
}

function clearCloudArticlePersistence() {
  localStorage.removeItem(CLOUD_ARTICLE_ID_KEY)
  localStorage.removeItem(CLOUD_ARTICLE_TITLE_KEY)
}

function restoreCloudArticlePersistence(): { id: string | null; title: string } {
  return {
    id: localStorage.getItem(CLOUD_ARTICLE_ID_KEY),
    title: localStorage.getItem(CLOUD_ARTICLE_TITLE_KEY) || '',
  }
}

/** 展开目标节点的所有祖先 folder，使关联文章在树中可见 */
function expandAncestors(nodeId: string) {
  if (!autoExpandEnabled.value) return
  if (treeData.value.length === 0) return
  const ancestors: string[] = []
  let current = treeData.value.find((n) => n.id === nodeId)
  while (current?.parentId) {
    const parent = treeData.value.find((n) => n.id === current!.parentId)
    if (parent && parent.type === 'folder') {
      ancestors.push(parent.id)
    }
    current = parent ?? undefined
  }
  if (ancestors.length > 0) {
    expandedIds.value = new Set([...expandedIds.value, ...ancestors])
  }
}

export function useGitHubTree() {
  // ── 计算属性 ──

  /** 默认排序：文件夹在前，同类型内按 sortOrder 升序 */
  function defaultSort(a: TreeNode, b: TreeNode): number {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.sortOrder - b.sortOrder
  }

  /** 根级节点（parentId === null） */
  const treeRoots = computed(() =>
    treeData.value.filter((n) => n.parentId === null).sort(defaultSort),
  )

  /** 所有 folder 节点 */
  const folders = computed(() => treeData.value.filter((n) => n.type === 'folder'))

  // ── 方法 ──

  function getChildren(parentId: string): TreeNode[] {
    return treeData.value.filter((n) => n.parentId === parentId).sort(defaultSort)
  }

  /** 获取某节点的所有兄弟节点（包含自身），按 sortOrder 排序 */
  function getSiblings(id: string): TreeNode[] {
    const node = treeData.value.find((n) => n.id === id)
    if (!node) return []
    return node.parentId === null ? treeRoots.value : getChildren(node.parentId)
  }

  function isExpanded(id: string): boolean {
    return expandedIds.value.has(id)
  }

  function toggleExpand(id: string) {
    const s = new Set(expandedIds.value)
    if (s.has(id)) {
      s.delete(id)
    } else {
      s.add(id)
    }
    expandedIds.value = s
  }

  function toggleAutoExpand() {
    autoExpandEnabled.value = !autoExpandEnabled.value
    localStorage.setItem(AUTO_EXPAND_KEY, String(autoExpandEnabled.value))
  }

  /**
   * 初始化：检查配置，拉取 tree
   */
  async function init(): Promise<boolean> {
    const cfg = GitHubTreeService.getConfig()
    if (!cfg) {
      isConfigured.value = false
      return false
    }
    isConfigured.value = true
    await loadTree()
    return true
  }

  /**
   * 重新检查配置：用于 SettingsDialog 保存配置后，
   * TreeSidebar 通过 window focus 事件触发更新 isConfigured 状态
   */
  function checkConfig() {
    const wasConfigured = isConfigured.value
    isConfigured.value = !!GitHubTreeService.getConfig()
    if (!wasConfigured && isConfigured.value) {
      loadTree()
    } else if (wasConfigured && !isConfigured.value) {
      treeData.value = []
      selectedNode.value = null
      currentCloudArticleId.value = null
      expandedIds.value = new Set()
    }
  }

  /**
   * 将 GitHub API 原始错误转为用户友好提示
   */
  function formatError(e: unknown): string {
    const msg = getErrorMessage(e)
    // 仓库为空
    if (msg.includes('This repository is empty')) {
      return '仓库为空，请先创建文章或文件夹'
    }
    // 404 Not Found（可能是 tree.json 不存在）
    if (/GitHub API 404/.test(msg)) {
      return '未找到文章数据，请确保仓库中有 tree.json 文件'
    }
    return msg || '加载失败'
  }

  /**
   * 加载树（优先用缓存，后台静默更新）
   */
  async function loadTree() {
    loading.value = true
    error.value = ''

    // 先展示缓存
    const cachedJson = await GitHubArticleCache.getTreeCache()
    if (cachedJson) {
      try {
        const tree = JSON.parse(cachedJson)
        treeData.value = tree.nodes || []
      } catch {
        /* ignore */
      }
    }

    // 后台请求最新
    try {
      const tree = await GitHubTreeService.fetchTree()
      treeData.value = tree.nodes
      await GitHubArticleCache.setTreeCache(JSON.stringify(tree))
    } catch (e: unknown) {
      error.value = formatError(e)
      // 缓存不可用时尝试用旧数据
      if (treeData.value.length === 0) {
        throw e
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 选中节点 → 若为 article 则加载内容
   * @returns 文章内容（Markdown 文本），供调用方覆盖到编辑器
   */
  async function selectNode(node: TreeNode): Promise<string | null> {
    selectedNode.value = node
    if (node.type !== 'article') return null

    loading.value = true
    try {
      // 先看缓存
      const cached = await GitHubArticleCache.getArticle(node.id)
      if (cached) {
        // 后台更新
        GitHubTreeService.fetchArticle(node.id)
          .then((remote) => {
            if (remote !== cached) {
              GitHubArticleCache.setArticle(node.id, remote)
            }
          })
          .catch(() => {})
        return cached
      }

      // 没缓存，直接请求
      const content = await GitHubTreeService.fetchArticle(node.id)
      await GitHubArticleCache.setArticle(node.id, content)
      return content
    } catch (e: unknown) {
      error.value = getErrorMessage(e, '加载文章失败')
      return null
    } finally {
      loading.value = false
    }
  }

  function clearSelection() {
    selectedNode.value = null
    currentCloudArticleId.value = null
    clearCloudArticlePersistence()
  }

  /** 将指定节点设为当前关联的云端文章 */
  function setCloudArticle(node: TreeNode) {
    currentCloudArticleId.value = node.id
    persistCloudArticle(node.id, node.title)
  }

  /** 根据标题自动匹配云端文章并关联（仅当尚未关联时生效） */
  function matchCloudArticle(title: string | null): boolean {
    if (!title || treeData.value.length === 0 || currentCloudArticleId.value) return false
    const node = treeData.value.find((n) => n.type === 'article' && n.title === title)
    if (node) {
      setCloudArticle(node)
      return true
    }
    return false
  }

  // ── 树编辑操作 ──
  async function createFolder(
    parentId: string | null,
    title: string,
    prepend = false,
  ): Promise<TreeNode> {
    const node = await GitHubTreeService.createFolder(parentId, title)
    treeData.value = [...treeData.value, node]
    if (prepend) {
      try {
        await reorderToPosition(node.id, 0)
      } catch {
        // reorderToPosition 内部已回滚
      }
    } else {
      try {
        await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
      } catch {
        /* 缓存失败不影响主流程 */
      }
    }
    if (parentId) expandedIds.value.add(parentId)
    return node
  }

  async function createArticle(
    parentId: string | null,
    title: string,
    content: string,
    prepend = false,
  ): Promise<TreeNode> {
    const node = await GitHubTreeService.createArticle(parentId, title, content)
    treeData.value = [...treeData.value, node]
    if (prepend) {
      try {
        await reorderToPosition(node.id, 0)
      } catch {
        // reorderToPosition 内部已回滚
      }
    }
    try {
      await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
      await GitHubArticleCache.setArticle(node.id, content)
    } catch {
      /* 缓存失败不影响主流程 */
    }
    if (parentId) expandedIds.value.add(parentId)
    setCloudArticle(node)
    return node
  }

  async function renameNode(id: string, newTitle: string): Promise<void> {
    await GitHubTreeService.renameNode(id, newTitle)
    // 本地立即更新 treeData，避免依赖 loadTree() 回读
    const idx = treeData.value.findIndex((n) => n.id === id)
    if (idx !== -1) {
      treeData.value[idx] = { ...treeData.value[idx], title: newTitle }
    }
    try {
      await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
    } catch {
      /* 缓存失败不影响主流程 */
    }
  }

  async function deleteNode(id: string): Promise<void> {
    const node = treeData.value.find((n) => n.id === id)
    await GitHubTreeService.deleteNode(id)
    // 本地立即更新 treeData，避免依赖 loadTree() 回读
    treeData.value = treeData.value.filter((n) => n.id !== id)
    // 清除缓存
    if (node?.type === 'article') {
      await GitHubArticleCache.deleteArticle(id)
    }
    try {
      await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
    } catch {
      /* 缓存失败不影响主流程 */
    }
    if (selectedNode.value?.id === id) {
      selectedNode.value = null
    }
    if (currentCloudArticleId.value === id) {
      currentCloudArticleId.value = null
      clearCloudArticlePersistence()
    }
  }

  async function moveNode(id: string, newParentId: string | null): Promise<void> {
    // 乐观更新：立即移动节点
    const node = treeData.value.find((n) => n.id === id)
    if (node) {
      const oldParentId = node.parentId
      node.parentId = newParentId
      if (oldParentId !== newParentId) {
        // 对受影响的分组重新排序
        const affected = new Set([oldParentId, newParentId].map((p) => String(p)))
        affected.forEach((pid) => {
          treeData.value
            .filter((n) => String(n.parentId) === pid)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .forEach((n, i) => {
              n.sortOrder = i * 10
            })
        })
      }
    }
    if (newParentId) expandedIds.value.add(newParentId)

    try {
      await GitHubTreeService.moveNode(id, newParentId)
      // 乐观更新已生效，同步写入缓存防止刷新后回跳
      await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
    } catch {
      await loadTree()
      throw new Error('移动失败，已还原')
    }
  }

  async function reorderNode(id: string, direction: 'up' | 'down'): Promise<void> {
    if (reordering.value) return

    const siblings = getSiblings(id)
    const index = siblings.findIndex((n) => n.id === id)
    if (direction === 'up' && index <= 0) return
    if (direction === 'down' && index >= siblings.length - 1) return

    reordering.value = true
    // 乐观更新：立即重排本地节点
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const a = siblings[index]
    const b = siblings[swapIndex]
    const tmp = a.sortOrder
    a.sortOrder = b.sortOrder
    b.sortOrder = tmp

    try {
      await GitHubTreeService.reorderNode(id, direction)
      await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
    } catch {
      // 失败时回滚
      const tmp2 = a.sortOrder
      a.sortOrder = b.sortOrder
      b.sortOrder = tmp2
      throw new Error('排序失败，已还原')
    } finally {
      reordering.value = false
    }
  }

  async function reorderToPosition(id: string, newIndex: number): Promise<void> {
    if (reordering.value) return

    // 乐观更新：立即重排本地节点
    const node = treeData.value.find((n) => n.id === id)
    if (node) {
      const siblings = treeData.value
        .filter((n) => n.parentId === node.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const oldIndex = siblings.findIndex((n) => n.id === id)
      if (oldIndex !== -1 && oldIndex !== newIndex) {
        siblings.splice(oldIndex, 1)
        siblings.splice(newIndex, 0, node)
        siblings.forEach((n, i) => {
          n.sortOrder = i * 10
        })
      }
    }

    reordering.value = true
    try {
      await GitHubTreeService.reorderToPosition(id, newIndex)
      // 乐观更新已生效，同步写入缓存防止刷新后回跳
      await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
    } catch {
      await loadTree() // 失败时回滚
      throw new Error('排序失败，已还原')
    } finally {
      reordering.value = false
    }
  }

  /**
   * 推送当前编辑器内容到云端
   * @param parentId 目标文件夹 id（根级为 null）
   * @param title 文章标题
   * @param content Markdown 内容
   * @param existingArticleId 若更新已有文章，传入其 id
   */
  async function pushToCloud(
    parentId: string | null,
    title: string,
    content: string,
    existingArticleId?: string,
  ): Promise<TreeNode> {
    if (existingArticleId) {
      // 更新已有文章
      await GitHubTreeService.saveArticle(existingArticleId, content)
      await GitHubTreeService.renameNode(existingArticleId, title)
      try {
        await GitHubTreeService.updateNodeUpdatedAt(existingArticleId)
      } catch {
        /* 时间戳更新失败不影响主流程 */
      }
      // 本地立即更新 treeData，避免依赖 API 回读（GitHub 内容 API 有短暂缓存延迟）
      const idx = treeData.value.findIndex((n) => n.id === existingArticleId)
      if (idx !== -1) {
        treeData.value[idx] = { ...treeData.value[idx], title, updatedAt: new Date().toISOString() }
      }
      try {
        await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
        await GitHubArticleCache.setArticle(existingArticleId, content)
      } catch {
        /* 缓存失败不影响主流程 */
      }
      const node = treeData.value.find((n) => n.id === existingArticleId)
      if (!node) throw new Error('文章节点未找到')
      setCloudArticle(node)
      return node
    } else {
      // 新建文章
      const node = await GitHubTreeService.createArticle(parentId, title, content)
      // 本地立即更新 treeData，避免依赖 API 回读（GitHub 内容 API 有短暂缓存延迟）
      treeData.value = [...treeData.value, node]
      try {
        await GitHubArticleCache.setTreeCache(JSON.stringify({ nodes: treeData.value }))
        await GitHubArticleCache.setArticle(node.id, content)
      } catch {
        /* 缓存失败不影响主流程 */
      }
      setCloudArticle(node)
      return node
    }
  }

  return {
    // 状态
    isConfigured,
    treeData,
    treeRoots,
    folders,
    selectedNode,
    expandedIds,
    loading,
    error,
    reordering,
    currentCloudArticleId,

    // 方法
    init,
    checkConfig,
    loadTree,
    getChildren,
    getSiblings,
    isExpanded,
    toggleExpand,
    selectNode,
    clearSelection,
    setCloudArticle,
    matchCloudArticle,
    createFolder,
    createArticle,
    renameNode,
    deleteNode,
    moveNode,
    reorderNode,
    reorderToPosition,
    pushToCloud,

    // 持久化
    restoreCloudArticlePersistence,
    clearCloudArticlePersistence,
    expandAncestors,

    // 自动展开开关
    autoExpandEnabled,
    toggleAutoExpand,
  }
}
