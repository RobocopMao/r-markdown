import { ref, computed } from 'vue'
import { GitHubTreeService, type TreeNode } from '@/services/GitHubTreeService'
import { LocalTreeService } from '@/services/LocalTreeService'
import { GitHubArticleCache } from '@/services/GitHubArticleCache'
import { getErrorMessage } from '@/utils/helpers'
import { getSetting } from '@/config/settings'
import {
  workspaces,
  activeGithubWorkspaceId,
  activeLocalWorkspaceId,
  ensureWorkspaces,
  getActiveWorkspace,
  getWorkspaceToken,
  setActiveWorkspace as storeSetActive,
} from '@/services/articleWorkspace'

// ── 存储模式 ──
// 'github' 使用 GitHub 仓库；'local' 使用本地磁盘（仅桌面端）
type ArticleStorageMode = 'github' | 'local'
const articleStorageMode = ref<ArticleStorageMode>(
  getSetting<ArticleStorageMode>('articleStorageMode'),
)

/** 根据当前模式选择 service（接口与 GitHubTreeService 一致） */
const treeService = computed(() =>
  articleStorageMode.value === 'local' ? LocalTreeService : GitHubTreeService,
)

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
const persistedCloudTitle = ref('')
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
  persistedCloudTitle.value = ''
}

function restoreCloudArticlePersistence(): { id: string | null; title: string } {
  const id = localStorage.getItem(CLOUD_ARTICLE_ID_KEY)
  const title = localStorage.getItem(CLOUD_ARTICLE_TITLE_KEY) || ''
  // 同步 ref 状态，供 currentCloudArticleTitle computed 使用
  if (id) {
    currentCloudArticleId.value = id
    persistedCloudTitle.value = title
  }
  return { id, title }
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

/** 当前工作区的缓存命名空间，避免多仓库/分支/目录之间串数据 */
const cacheNs = computed<string>(() => {
  if (articleStorageMode.value === 'local') {
    const ws = getActiveWorkspace('local')
    return ws?.dir ? `local:${ws.dir}` : 'local:default'
  }
  const ws = getActiveWorkspace('github')
  if (ws?.repo) return `github:${ws.repo}:${ws.branch || 'main'}`
  const cfg = GitHubTreeService.getConfig()
  return cfg ? `github:${cfg.owner}/${cfg.repo}:${cfg.branch}` : 'github:legacy'
})

/** 当前存储模式下的激活工作区（未设置工作区时返回 null） */
const currentWorkspace = computed(() =>
  articleStorageMode.value === 'local'
    ? getActiveWorkspace('local')
    : getActiveWorkspace('github'),
)

/**
 * 将当前激活的工作区应用到底层配置（github 写入 repo/branch + 该工作区专属 Token）。
 * 值未变化时 GitHubTreeService.setConfig 内部会跳过写入，避免触发事件循环。
 */
function applyActiveWorkspace(kind: 'github' | 'local' = articleStorageMode.value) {
  if (kind === 'local') {
    // 本地路径由 localArticlePath 直接读取激活工作区，无需额外配置
    return
  }
  const ws = getActiveWorkspace('github')
  if (ws?.repo && ws.repo.includes('/')) {
    const idx = ws.repo.indexOf('/')
    // 每个仓库使用自己的 Token（未配置则为空串 → 视为未配置）
    GitHubTreeService.setConfig(
      ws.repo.substring(0, idx),
      ws.repo.substring(idx + 1),
      getWorkspaceToken(ws.id),
      ws.branch || 'main',
    )
  } else if (ws) {
    // 激活了但仓库为空 → 视为未配置
    if (getSetting<string>('cloudArticleRepo')) GitHubTreeService.clearRepo()
  }
  // 无工作区时沿用旧 cloudArticleRepo 配置，由 getConfig 判定
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
   * - local 模式：本地磁盘始终可用，直接加载
   * - github 模式：需要 token + repo 配置完成
   */
  async function init(): Promise<boolean> {
    ensureWorkspaces()
    if (articleStorageMode.value === 'local') {
      isConfigured.value = true
      await loadTree()
      return true
    }
    applyActiveWorkspace()
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
    // 同步最新的存储模式（用户可能在设置中切换）
    const newMode = getSetting<ArticleStorageMode>('articleStorageMode')
    if (newMode !== articleStorageMode.value) {
      setArticleStorageMode(newMode)
      return
    }

    ensureWorkspaces()
    applyActiveWorkspace()

    // local 模式始终视为已配置
    if (articleStorageMode.value === 'local') {
      if (!isConfigured.value) {
        isConfigured.value = true
        loadTree()
      }
      return
    }

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
   * 切换存储模式：清空当前树状态并按新模式重新加载
   */
  function setArticleStorageMode(mode: ArticleStorageMode) {
    if (mode === articleStorageMode.value) return
    articleStorageMode.value = mode
    // 清空旧模式的树状态（两种模式互相独立，避免错位）
    treeData.value = []
    selectedNode.value = null
    currentCloudArticleId.value = null
    expandedIds.value = new Set()
    clearCloudArticlePersistence()
    ensureWorkspaces()
    if (mode === 'github') applyActiveWorkspace()
    isConfigured.value = mode === 'local' ? true : !!GitHubTreeService.getConfig()
    if (isConfigured.value) {
      loadTree()
    }
  }

  /**
   * 将 GitHub API 原始错误转为用户友好提示
   */
  function formatError(e: unknown): string {
    const msg = getErrorMessage(e)
    // local 模式错误直接返回
    if (articleStorageMode.value === 'local') {
      return msg || '加载失败'
    }
    // 仓库为空
    if (msg.includes('This repository is empty')) {
      return '仓库为空，请先创建文章或文件夹'
    }
    // 404 Not Found（可能是 tree.json 不存在）
    if (/GitHub API 404/.test(msg)) {
      return '仓库中暂无文章数据，点击「新建文章」或「新建文件夹」创建'
    }
    return msg || '加载失败'
  }

  /**
   * 加载树（优先用缓存，后台静默更新）
   * @returns 是否成功拉到最新数据（404/失败时返回 false）
   */
  async function loadTree(): Promise<boolean> {
    loading.value = true
    error.value = ''

    // 先展示缓存
    const cachedJson = await GitHubArticleCache.getTreeCache(cacheNs.value)
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
      const tree = await treeService.value.fetchTree()
      treeData.value = tree.nodes
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify(tree))
      return true
    } catch (e: unknown) {
      const msg = getErrorMessage(e)
      // 仓库/分支中不存在 tree.json（GitHub API 404）→ 以远端为准：
      // 清空该工作区的树缓存与当前树，明确提示，不再回退显示旧数据
      const isMissingTree =
        articleStorageMode.value === 'github' && /GitHub API 404/.test(msg)
      if (isMissingTree) {
        await GitHubArticleCache.clearTreeCache(cacheNs.value)
        treeData.value = []
        error.value = '仓库中暂无文章数据，点击「新建文章」或「新建文件夹」创建'
        return false
      }
      error.value = formatError(e)
      // 缓存不可用且无旧数据 → 向上抛出
      if (treeData.value.length === 0) {
        throw e
      }
      return false
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
      const cached = await GitHubArticleCache.getArticle(cacheNs.value, node.id)
      if (cached) {
        // 后台更新
        treeService.value
          .fetchArticle(node.id)
          .then((remote) => {
            if (remote !== cached) {
              GitHubArticleCache.setArticle(cacheNs.value, node.id, remote)
            }
          })
          .catch(() => {})
        return cached
      }

      // 没缓存，直接请求
      const content = await treeService.value.fetchArticle(node.id)
      await GitHubArticleCache.setArticle(cacheNs.value, node.id, content)
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
    persistedCloudTitle.value = node.title
    persistCloudArticle(node.id, node.title)
  }

  /** 根据标题自动匹配云端文章并关联（仅当尚未关联时生效） */
  function matchCloudArticle(title: string | null): boolean {
    if (!title || treeData.value.length === 0 || currentCloudArticleId.value) return false
    // 优先精确匹配；匹配不到时回退到包含关系（树节点标题包含提取的标题）
    // 兼容用户在树标题前加日期等前缀的情况
    const exact = treeData.value.find((n) => n.type === 'article' && n.title === title)
    if (exact) {
      setCloudArticle(exact)
      return true
    }
    const contains = treeData.value.find((n) => n.type === 'article' && n.title.includes(title))
    if (contains) {
      setCloudArticle(contains)
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
    const node = await treeService.value.createFolder(parentId, title)
    treeData.value = [...treeData.value, node]
    if (prepend) {
      try {
        await reorderToPosition(node.id, 0)
      } catch {
        // reorderToPosition 内部已回滚
      }
    } else {
      try {
        await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
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
    const node = await treeService.value.createArticle(parentId, title, content)
    treeData.value = [...treeData.value, node]
    if (prepend) {
      try {
        await reorderToPosition(node.id, 0)
      } catch {
        // reorderToPosition 内部已回滚
      }
    }
    try {
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
      await GitHubArticleCache.setArticle(cacheNs.value, node.id, content)
    } catch {
      /* 缓存失败不影响主流程 */
    }
    if (parentId) expandedIds.value.add(parentId)
    setCloudArticle(node)
    return node
  }

  async function renameNode(id: string, newTitle: string): Promise<void> {
    await treeService.value.renameNode(id, newTitle)
    // 本地立即更新 treeData，避免依赖 loadTree() 回读
    const idx = treeData.value.findIndex((n) => n.id === id)
    if (idx !== -1) {
      treeData.value[idx] = { ...treeData.value[idx], title: newTitle }
    }
    try {
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
    } catch {
      /* 缓存失败不影响主流程 */
    }
  }

  async function deleteNode(id: string): Promise<void> {
    const node = treeData.value.find((n) => n.id === id)
    await treeService.value.deleteNode(id)
    // 本地立即更新 treeData，避免依赖 loadTree() 回读
    treeData.value = treeData.value.filter((n) => n.id !== id)
    // 清除缓存
    if (node?.type === 'article') {
      await GitHubArticleCache.deleteArticle(cacheNs.value, id)
    }
    try {
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
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

  async function moveNode(
    id: string,
    newParentId: string | null,
    position: 'top' | 'bottom' = 'bottom',
  ): Promise<void> {
    // 乐观更新：立即移动节点
    const node = treeData.value.find((n) => n.id === id)
    if (node) {
      const oldParentId = node.parentId
      node.parentId = newParentId
      if (oldParentId !== newParentId) {
        // 根据位置偏好设置被移节点在新父级下的 sortOrder
        const newSiblings = treeData.value.filter(
          (n) => String(n.parentId) === String(newParentId) && n.id !== id,
        )
        if (position === 'top') {
          const minOrder = newSiblings.reduce((min, n) => Math.min(min, n.sortOrder), 1)
          node.sortOrder = minOrder - 1
        } else {
          const maxOrder = newSiblings.reduce((max, n) => Math.max(max, n.sortOrder), -1)
          node.sortOrder = maxOrder + 1
        }
        // 对受影响分组重新规整 sortOrder（步长 10）
        const affected = new Set([oldParentId, newParentId].map((p) => String(p)))
        affected.forEach((pid) => {
          treeData.value
            .filter((n) => String(n.parentId) === pid)
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
              return a.sortOrder - b.sortOrder
            })
            .forEach((n, i) => {
              n.sortOrder = i * 10
            })
        })
      }
    }
    if (newParentId) expandedIds.value.add(newParentId)

    try {
      await treeService.value.moveNode(id, newParentId, position)
      // 乐观更新已生效，同步写入缓存防止刷新后回跳
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
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
      await treeService.value.reorderNode(id, direction)
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
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
        .sort((a, b) => {
          // 与 defaultSort 一致：folder 优先，再按 sortOrder
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
          return a.sortOrder - b.sortOrder
        })
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
      await treeService.value.reorderToPosition(id, newIndex)
      // 乐观更新已生效，同步写入缓存防止刷新后回跳
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
    } catch {
      await loadTree() // 失败时回滚
      throw new Error('排序失败，已还原')
    } finally {
      reordering.value = false
    }
  }

  /**
   * 跨级移动并排序：把节点移到新父级下的指定位置。
   * 用于拖拽到不同父级的兄弟节点 before/after 位置。
   * @param id 被移动节点 id
   * @param newParentId 新父级 id（根级为 null）
   * @param newIndex 在新父级兄弟中的目标 index（0 起算）
   */
  async function moveAndReorder(
    id: string,
    newParentId: string | null,
    newIndex: number,
  ): Promise<void> {
    if (reordering.value) return
    const node = treeData.value.find((n) => n.id === id)
    if (!node) return
    const oldParentId = node.parentId

    // 乐观更新：立即改 parentId 并按目标位置插入
    node.parentId = newParentId
    const newSiblings = treeData.value
      .filter((n) => String(n.parentId) === String(newParentId))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    // 过滤掉自身后插入到目标位置
    const idx = newSiblings.findIndex((n) => n.id === id)
    if (idx !== -1) newSiblings.splice(idx, 1)
    const clamped = Math.max(0, Math.min(newIndex, newSiblings.length))
    newSiblings.splice(clamped, 0, node)
    newSiblings.forEach((n, i) => {
      n.sortOrder = i * 10
    })
    // 旧父级兄弟重排（若跨父级）
    if (String(oldParentId) !== String(newParentId)) {
      treeData.value
        .filter((n) => String(n.parentId) === String(oldParentId))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((n, i) => {
          n.sortOrder = i * 10
        })
    }
    if (newParentId) expandedIds.value.add(newParentId)

    reordering.value = true
    try {
      // 先 moveNode 改父级（服务层会追加到末尾），再 reorderToPosition 排到目标位置
      await treeService.value.moveNode(id, newParentId)
      await treeService.value.reorderToPosition(id, clamped)
      await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
    } catch {
      await loadTree() // 失败时回滚
      throw new Error('移动失败，已还原')
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
      await treeService.value.saveArticle(existingArticleId, content)
      await treeService.value.renameNode(existingArticleId, title)
      try {
        await treeService.value.updateNodeUpdatedAt(existingArticleId)
      } catch {
        /* 时间戳更新失败不影响主流程 */
      }
      // 本地立即更新 treeData，避免依赖 API 回读（GitHub 内容 API 有短暂缓存延迟）
      const idx = treeData.value.findIndex((n) => n.id === existingArticleId)
      if (idx !== -1) {
        treeData.value[idx] = { ...treeData.value[idx], title, updatedAt: new Date().toISOString() }
      }
      try {
        await GitHubArticleCache.setTreeCache(cacheNs.value, JSON.stringify({ nodes: treeData.value }))
        await GitHubArticleCache.setArticle(cacheNs.value, existingArticleId, content)
      } catch {
        /* 缓存失败不影响主流程 */
      }
      const node = treeData.value.find((n) => n.id === existingArticleId)
      if (!node) throw new Error('文章节点未找到')
      setCloudArticle(node)
      return node
    } else {
      // 新建文章 - 复用 createArticle，尊重新建位置偏好
      const prepend =
        localStorage.getItem('r-markdown-treeNewArticlePosition') === 'top'
      return await createArticle(parentId, title, content, prepend)
    }
  }

  /**
   * 切换工作区：清空当前树与文章关联，应用新工作区配置并重新加载。
   * @param kind 存储模式（github | local）
   * @param id   目标工作区 id
   */
  async function switchToWorkspace(kind: 'github' | 'local', id: string) {
    const ws = storeSetActive(kind, id)
    if (!ws) return

    if (kind === 'github') {
      applyActiveWorkspace()
    } else {
      // 本地目录由 localArticlePath 读取激活工作区，切换后需刷新解析
      ensureWorkspaces()
    }

    // 清空旧工作区的树状态与文章关联
    treeData.value = []
    selectedNode.value = null
    currentCloudArticleId.value = null
    persistedCloudTitle.value = ''
    expandedIds.value = new Set()
    clearCloudArticlePersistence()

    isConfigured.value = kind === 'local' ? true : !!GitHubTreeService.getConfig()
    error.value = ''
    if (isConfigured.value) {
      await loadTree()
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
    persistedCloudTitle,
    articleStorageMode,

    // 工作区
    workspaces,
    activeGithubWorkspaceId,
    activeLocalWorkspaceId,
    currentWorkspace,
    switchToWorkspace,
    applyActiveWorkspace,

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
    moveAndReorder,
    pushToCloud,
    setArticleStorageMode,

    // 持久化
    restoreCloudArticlePersistence,
    clearCloudArticlePersistence,
    expandAncestors,

    // 自动展开开关
    autoExpandEnabled,
    toggleAutoExpand,
  }
}
