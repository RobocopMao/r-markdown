import { ref, computed } from 'vue'
import { GitHubTreeService, type TreeNode } from '@/services/GitHubTreeService'
import { GitHubArticleCache } from '@/services/GitHubArticleCache'

// ── 模块级单例状态（所有调用方共享同一份数据）──
const isConfigured = ref(false)
const treeData = ref<TreeNode[]>([])
const selectedNode = ref<TreeNode | null>(null)
const expandedIds = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref('')
const currentCloudArticleId = ref<string | null>(null)
const reordering = ref(false)

export function useGitHubTree() {
  // ── 计算属性 ──

  /** 根级节点（parentId === null），按 sortOrder 排序 */
  const treeRoots = computed(() =>
    treeData.value
      .filter((n) => n.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  )

  /** 所有 folder 节点 */
  const folders = computed(() =>
    treeData.value.filter((n) => n.type === 'folder'),
  )

  // ── 方法 ──

  function getChildren(parentId: string): TreeNode[] {
    return treeData.value
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  /** 获取某节点的所有兄弟节点（包含自身），按 sortOrder 排序 */
  function getSiblings(id: string): TreeNode[] {
    const node = treeData.value.find((n) => n.id === id)
    if (!node) return []
    return node.parentId === null
      ? treeRoots.value
      : getChildren(node.parentId)
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
  function formatError(e: any): string {
    const msg: string = e.message || ''
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
      } catch { /* ignore */ }
    }

    // 后台请求最新
    try {
      const tree = await GitHubTreeService.fetchTree()
      treeData.value = tree.nodes
      await GitHubArticleCache.setTreeCache(JSON.stringify(tree))
    } catch (e: any) {
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
        currentCloudArticleId.value = node.id
        // 后台更新
        GitHubTreeService.fetchArticle(node.id).then((remote) => {
          if (remote !== cached) {
            GitHubArticleCache.setArticle(node.id, remote)
          }
        }).catch(() => {})
        return cached
      }

      // 没缓存，直接请求
      const content = await GitHubTreeService.fetchArticle(node.id)
      await GitHubArticleCache.setArticle(node.id, content)
      currentCloudArticleId.value = node.id
      return content
    } catch (e: any) {
      error.value = e.message || '加载文章失败'
      return null
    } finally {
      loading.value = false
    }
  }

  function clearSelection() {
    selectedNode.value = null
    currentCloudArticleId.value = null
  }

  // ── 树编辑操作 ──

  async function createFolder(parentId: string | null, title: string): Promise<TreeNode> {
    const node = await GitHubTreeService.createFolder(parentId, title)
    await loadTree()
    if (parentId) expandedIds.value.add(parentId)
    return node
  }

  async function createArticle(parentId: string | null, title: string, content: string): Promise<TreeNode> {
    const node = await GitHubTreeService.createArticle(parentId, title, content)
    // 同步写入缓存
    await GitHubArticleCache.setArticle(node.id, content)
    await loadTree()
    if (parentId) expandedIds.value.add(parentId)
    return node
  }

  async function renameNode(id: string, newTitle: string): Promise<void> {
    await GitHubTreeService.renameNode(id, newTitle)
    await loadTree()
  }

  async function deleteNode(id: string): Promise<void> {
    const node = treeData.value.find((n) => n.id === id)
    await GitHubTreeService.deleteNode(id)
    // 清除缓存
    if (node?.type === 'article') {
      await GitHubArticleCache.deleteArticle(id)
    }
    if (selectedNode.value?.id === id) {
      selectedNode.value = null
      currentCloudArticleId.value = null
    }
    await loadTree()
  }

  async function moveNode(id: string, newParentId: string | null): Promise<void> {
    await GitHubTreeService.moveNode(id, newParentId)
    if (newParentId) expandedIds.value.add(newParentId)
    await loadTree()
  }

  async function reorderNode(id: string, direction: 'up' | 'down'): Promise<void> {
    if (reordering.value) return

    const siblings = getSiblings(id)
    const index = siblings.findIndex((n) => n.id === id)
    if (direction === 'up' && index <= 0) return
    if (direction === 'down' && index >= siblings.length - 1) return

    reordering.value = true
    try {
      await GitHubTreeService.reorderNode(id, direction)
      await loadTree()
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
      // 同步更新树的 updatedAt 时间戳（renameNode 已更新，此处兜底以防 renameNode 失败）
      try { await GitHubTreeService.updateNodeUpdatedAt(existingArticleId) } catch { /* 时间戳更新失败不影响主流程 */ }
      // 缓存和刷新失败不阻塞流程（文章已成功更新到 GitHub）
      try { await GitHubArticleCache.setArticle(existingArticleId, content) } catch { /* 缓存失败不影响主流程 */ }
      try { await loadTree() } catch { /* 刷新树失败使用已有缓存数据 */ }
      const node = treeData.value.find((n) => n.id === existingArticleId)
      if (!node) throw new Error('文章节点未找到')
      return node
    } else {
      // 新建文章
      const node = await GitHubTreeService.createArticle(parentId, title, content)
      // 缓存和刷新失败不阻塞流程（文章已成功上传到 GitHub）
      try { await GitHubArticleCache.setArticle(node.id, content) } catch { /* 缓存失败不影响主流程 */ }
      try { await loadTree() } catch { /* 刷新树失败使用已有缓存数据 */ }
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
    createFolder,
    createArticle,
    renameNode,
    deleteNode,
    moveNode,
    reorderNode,
    pushToCloud,
  }
}
