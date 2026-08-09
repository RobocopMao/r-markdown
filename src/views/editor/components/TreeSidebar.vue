<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, provide, nextTick } from 'vue'
import {
  Folder,
  Plus,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  FilePlus,
  Search,
  X,
  ArrowUpDown,
  Crosshair,
  RefreshCw,
  ArrowUpToLine,
  ArrowDownToLine,
  Check,
  GitBranch,
} from 'lucide-vue-next'
import { useGitHubTree } from '../composables/useGitHubTree'
import { getWorkspaceToken } from '@/services/articleWorkspace'
import type { TreeNode } from '@/services/GitHubTreeService'
import PromptDialog from '@/components/PromptDialog.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import TreeNodeComponent from './TreeNode.vue'
import PushToCloudTree from './PushToCloudTree.vue'

const emit = defineEmits<{
  (e: 'openSettings', tab: string): void
  (e: 'editArticle', content: string, node: TreeNode): void
  (e: 'close'): void
  (e: 'toast', message: string): void
  (e: 'clearEditor'): void
}>()

const {
  checkConfig,
  isConfigured,
  treeData,
  treeRoots,
  folders,
  selectedNode,
  currentCloudArticleId,
  expandedIds,
  loading,
  error,
  reordering,
  init,
  loadTree,
  getChildren,
  isExpanded,
  toggleExpand,
  selectNode,
  createFolder,
  createArticle,
  renameNode,
  deleteNode,
  moveNode,
  reorderToPosition,
  moveAndReorder,
  getSiblings,
  autoExpandEnabled,
  toggleAutoExpand,
  articleStorageMode,
  currentWorkspace,
  workspaces,
  switchToWorkspace,
} = useGitHubTree()

// ── 工作区切换 ──
const wsMenuVisible = ref(false)
/** 弹层定位：基于触发按钮的 fixed 坐标（避开滚动容器裁切） */
const wsMenuStyle = ref<Record<string, string>>({})
const wsTriggerRef = ref<HTMLElement | null>(null)

/** 当前模式下的工作区列表（未配置仓库/Token 的 github 工作区不展示） */
const kindWorkspaceList = computed(() => {
  const githubMode = articleStorageMode.value !== 'local'
  return workspaces.value.filter((w) => {
    const isLocalKind = w.kind === 'local'
    if (isLocalKind !== !githubMode) return false
    // github 工作区需已配置仓库且 Token 才可展示/切换
    if (githubMode) {
      return !!w.repo && !!w.repo.includes('/') && !!getWorkspaceToken(w.id)
    }
    return true
  })
})

async function onSwitchWorkspace(ws: (typeof workspaces.value)[number]) {
  wsMenuVisible.value = false
  await switchToWorkspace(ws.kind, ws.id)
}

/** 打开工作区菜单：把弹层定位到按钮下方（fixed，避免被滚动容器裁剪） */
function toggleWsMenu() {
  sortMenuVisible.value = false
  wsMenuVisible.value = !wsMenuVisible.value
  if (wsMenuVisible.value && wsTriggerRef.value) {
    const rect = wsTriggerRef.value.getBoundingClientRect()
    wsMenuStyle.value = {
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
    }
  }
}

// ── 搜索 ──
const SEARCH_VISIBLE_KEY = 'r-markdown-treeSearchVisible'
const searchQuery = ref('')
const searchVisible = ref(localStorage.getItem(SEARCH_VISIBLE_KEY) === 'true')

function toggleSearch() {
  searchVisible.value = !searchVisible.value
  localStorage.setItem(SEARCH_VISIBLE_KEY, String(searchVisible.value))
  if (!searchVisible.value) searchQuery.value = ''
}

// ── 新建文章位置偏好 ──
const NEW_ARTICLE_POSITION_KEY = 'r-markdown-treeNewArticlePosition'
const newAtTop = ref(localStorage.getItem(NEW_ARTICLE_POSITION_KEY) === 'top')

function toggleNewArticlePosition() {
  newAtTop.value = !newAtTop.value
  localStorage.setItem(NEW_ARTICLE_POSITION_KEY, newAtTop.value ? 'top' : 'bottom')
}

// ── 手动刷新 ──
async function refreshTree() {
  try {
    const ok = await loadTree()
    emit('toast', ok ? '文章已刷新' : '刷新失败')
  } catch {
    emit('toast', '刷新失败')
  }
}

/** 递归收集某节点的所有后代 ID */
function getAllDescendantIds(nodeId: string): Set<string> {
  const ids = new Set<string>()
  const children = getChildren(nodeId)
  for (const child of children) {
    ids.add(child.id)
    if (child.type === 'folder') {
      for (const descId of getAllDescendantIds(child.id)) {
        ids.add(descId)
      }
    }
  }
  return ids
}

const visibleNodeIds = computed<Set<string>>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return new Set() // 空 set 表示不过滤，isNodeVisible 在空查询时直接返回 true

  const matched = new Set<string>()
  // 收集所有 node（含后代）中标题匹配的节点
  function collect(node: TreeNode) {
    if (node.title.toLowerCase().includes(q)) {
      matched.add(node.id)
    }
    for (const child of getChildren(node.id)) {
      collect(child)
    }
  }
  for (const root of treeRoots.value) {
    collect(root)
  }

  // 收集这些匹配节点的所有祖先
  const result = new Set(matched)
  function collectAncestors(nodeId: string) {
    const node = findNodeById(nodeId)
    if (node && 'parentId' in node && node.parentId) {
      result.add(node.parentId)
      collectAncestors(node.parentId)
    }
  }
  for (const id of matched) {
    collectAncestors(id)
  }
  return result
})

function findNodeById(id: string): TreeNode | undefined {
  for (const root of treeRoots.value) {
    if (root.id === id) return root
    const stack = [...getChildren(root.id)]
    while (stack.length) {
      const n = stack.pop()!
      if (n.id === id) return n
      stack.push(...getChildren(n.id))
    }
  }
  return undefined
}

function isNodeVisible(id: string): boolean {
  const q = searchQuery.value.trim()
  if (!q) return true
  return visibleNodeIds.value.has(id)
}

const noSearchResults = computed(() => {
  if (!searchQuery.value.trim()) return false
  if (!treeData.value || treeData.value.length === 0) return false
  return treeRoots.value.every((root) => !isNodeVisible(root.id))
})

// 搜索结果自动展开所有祖先文件夹
watch(visibleNodeIds, (ids) => {
  if (ids.size === 0 || !searchQuery.value.trim()) return
  const newExpanded = new Set(expandedIds.value)
  for (const id of ids) {
    const node = findNodeById(id)
    if (node?.type === 'folder') {
      newExpanded.add(id)
    }
  }
  expandedIds.value = newExpanded
})

// ── 排序 ──
type SortMode =
  | 'created-desc'
  | 'created-asc'
  | 'updated-desc'
  | 'updated-asc'
  | 'alpha-asc'
  | 'alpha-desc'

const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: '文件名 A-Z', value: 'alpha-asc' },
  { label: '文件名 Z-A', value: 'alpha-desc' },
  { label: '创建时间降序', value: 'created-desc' },
  { label: '创建时间升序', value: 'created-asc' },
  { label: '修改时间降序', value: 'updated-desc' },
  { label: '修改时间升序', value: 'updated-asc' },
]

const SORT_MODE_KEY = 'r-markdown-treeSortMode'
const SORT_ACTIVE_KEY = 'r-markdown-treeSortActive'

const sortMode = ref<SortMode>((localStorage.getItem(SORT_MODE_KEY) as SortMode) || 'created-desc')

const isSorting = ref(localStorage.getItem(SORT_ACTIVE_KEY) === 'true')

const sortMenuVisible = ref(false)
/** 排序弹层定位（fixed，避开滚动容器裁剪） */
const sortMenuStyle = ref<Record<string, string>>({})
const sortTriggerRef = ref<HTMLElement | null>(null)

function getSortModeLabel(): string {
  return SORT_OPTIONS.find((o) => o.value === sortMode.value)?.label || '排序'
}

function setSortMode(mode: SortMode) {
  if (sortMode.value === mode && isSorting.value) {
    // 再次点击同一模式 → 取消排序，恢复默认
    isSorting.value = false
    localStorage.setItem(SORT_ACTIVE_KEY, 'false')
  } else {
    sortMode.value = mode
    isSorting.value = true
    localStorage.setItem(SORT_MODE_KEY, mode)
    localStorage.setItem(SORT_ACTIVE_KEY, 'true')
  }
  sortMenuVisible.value = false
}

function toggleSortMenu() {
  wsMenuVisible.value = false
  sortMenuVisible.value = !sortMenuVisible.value
  if (sortMenuVisible.value && sortTriggerRef.value) {
    const rect = sortTriggerRef.value.getBoundingClientRect()
    sortMenuStyle.value = {
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
    }
  }
}

function sortByMode(a: TreeNode, b: TreeNode): number {
  switch (sortMode.value) {
    case 'created-desc':
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    case 'created-asc':
      return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
    case 'updated-desc':
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    case 'updated-asc':
      return new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()
    case 'alpha-asc':
      return a.title.localeCompare(b.title)
    case 'alpha-desc':
      return b.title.localeCompare(a.title)
    default:
      return 0
  }
}

const sortedTreeRoots = computed(() => {
  const roots = [...treeRoots.value]
  const folders = roots
    .filter((n) => n.type === 'folder')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const articles = roots.filter((n) => n.type === 'article')
  articles.sort(isSorting.value ? sortByMode : (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  return [...folders, ...articles]
})

function sortedGetChildren(parentId: string): TreeNode[] {
  const children = [...getChildren(parentId)]
  const folders = children
    .filter((n) => n.type === 'folder')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const articles = children.filter((n) => n.type === 'article')
  articles.sort(isSorting.value ? sortByMode : (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  return [...folders, ...articles]
}

// ── 右键菜单 ──
const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  node: TreeNode | null
}>({ visible: false, x: 0, y: 0, node: null })

const ctxMenuRef = ref<HTMLElement | null>(null)

async function openContextMenu(e: MouseEvent, node: TreeNode) {
  e.preventDefault()
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    node,
  }
  await nextTick()
  if (!ctxMenuRef.value) return
  const rect = ctxMenuRef.value.getBoundingClientRect()
  const padding = 8
  if (rect.bottom > window.innerHeight - padding) {
    contextMenu.value.y = e.clientY - rect.height
  }
  if (rect.right > window.innerWidth - padding) {
    contextMenu.value.x = e.clientX - rect.width
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function onCtxMenuAction(action: string, node: TreeNode) {
  closeContextMenu()
  if (action === 'rename') {
    startRename(node)
  } else if (action === 'delete') {
    handleDelete(node)
  } else if (action === 'new-article') {
    startNewChild(node, 'article')
  } else if (action === 'new-folder') {
    startNewChild(node, 'folder')
  } else if (action === 'move') {
    startMove(node)
  }
}

// ── 新建根级 ──
const newRootPopup = ref(false)
const newRootTitle = ref('')
const newRootCreating = ref(false)

function showNewRoot() {
  newRootTitle.value = ''
  newRootPopup.value = true
}

async function confirmNewRoot() {
  const title = newRootTitle.value.trim()
  if (!title) return
  newRootCreating.value = true
  try {
    await createFolder(null, title, newAtTop.value)
    newRootPopup.value = false
  } finally {
    newRootCreating.value = false
  }
}

// ── 新建根级文章 ──
const newRootArticlePopup = ref(false)
const newRootArticleTitle = ref('')
const newRootArticleCreating = ref(false)

function showNewRootArticle() {
  newRootArticleTitle.value = ''
  newRootArticlePopup.value = true
}

async function confirmNewRootArticle() {
  const title = newRootArticleTitle.value.trim()
  if (!title) return
  // .md 后缀自动补全
  const finalTitle = title.endsWith('.md') ? title : title + '.md'
  newRootArticleCreating.value = true
  try {
    await createArticle(
      null,
      finalTitle,
      '# ' + finalTitle.replace(/\.md$/, '') + '\n',
      newAtTop.value,
    )
    newRootArticlePopup.value = false
    emit('toast', `文章「${finalTitle}」已创建`)
    emit('clearEditor')
  } finally {
    newRootArticleCreating.value = false
  }
}

// ── 新建子节点 ──
const newChildPopup = ref(false)
const newChildType = ref<'article' | 'folder'>('article')
const newChildTitle = ref('')
const newChildParent = ref<TreeNode | null>(null)
const newChildCreating = ref(false)

function startNewChild(parent: TreeNode, type: 'article' | 'folder') {
  newChildParent.value = parent
  newChildType.value = type
  newChildTitle.value = ''
  newChildPopup.value = true
}

async function confirmNewChild() {
  const title = newChildTitle.value.trim()
  const parent = newChildParent.value
  if (!title || !parent) return
  newChildCreating.value = true
  try {
    if (newChildType.value === 'article') {
      await createArticle(parent.id, title, '# ' + title + '\n', newAtTop.value)
      emit('clearEditor')
    } else {
      await createFolder(parent.id, title, newAtTop.value)
    }
    newChildPopup.value = false
  } finally {
    newChildCreating.value = false
  }
}

// ── 重命名 ──
const renamePopup = ref(false)
const renameTitle = ref('')
const renameTarget = ref<TreeNode | null>(null)
const renaming = ref(false)

function startRename(node: TreeNode) {
  renameTarget.value = node
  renameTitle.value = node.title
  renamePopup.value = true
}

async function confirmRename() {
  const title = renameTitle.value.trim()
  const target = renameTarget.value
  if (!title || !target) return
  const oldTitle = target.title
  renaming.value = true
  try {
    await renameNode(target.id, title)
    renamePopup.value = false
    emit('toast', `「${oldTitle}」已重命名为「${title}」`)
  } finally {
    renaming.value = false
  }
}

// ── 删除 ──
const deleteConfirmVisible = ref(false)
const deleteConfirmTarget = ref<TreeNode | null>(null)
const deleting = ref(false)
const deleteConfirmLabel = computed(() => {
  const node = deleteConfirmTarget.value
  if (!node) return ''
  return node.type === 'folder' ? `文件夹「${node.title}」及其所有内容` : `文章「${node.title}」`
})

function handleDelete(node: TreeNode) {
  // 非空文件夹不允许删除
  if (node.type === 'folder' && getChildren(node.id).length > 0) {
    emit('toast', '请先清空文件夹内的内容后再删除')
    return
  }
  deleteConfirmTarget.value = node
  deleteConfirmVisible.value = true
}

async function confirmDelete() {
  const node = deleteConfirmTarget.value
  if (!node || deleting.value) return
  const label = deleteConfirmLabel.value
  deleting.value = true
  try {
    await deleteNode(node.id)
    deleteConfirmVisible.value = false
    deleteConfirmTarget.value = null
    emit('toast', `已删除${label}`)
  } finally {
    deleting.value = false
  }
}

function cancelDelete() {
  deleteConfirmVisible.value = false
  deleteConfirmTarget.value = null
}

// ── 移动到 ──
const movePopup = ref(false)
const moveTarget = ref<TreeNode | null>(null)
const moveParentId = ref<string | null>(null)
const moving = ref(false)

function startMove(node: TreeNode) {
  moveTarget.value = node
  moveParentId.value = node.parentId
  movePopup.value = true
}

async function confirmMove() {
  const target = moveTarget.value
  if (!target) return
  const targetTitle = target.title
  const destName = moveParentId.value
    ? treeData.value.find((f) => f.id === moveParentId.value)?.title || '目标文件夹'
    : '根目录'
  moving.value = true
  try {
    await moveNode(target.id, moveParentId.value, newAtTop.value ? 'top' : 'bottom')
    movePopup.value = false
    emit('toast', `「${targetTitle}」已移动到「${destName}」`)
  } catch {
    emit('toast', '移动失败')
  } finally {
    moving.value = false
  }
}

// ── 移动弹窗辅助：计算不可选中的文件夹（自身+所有后代） ──
const moveDisabledIds = computed(() => {
  if (!moveTarget.value) return new Set<string>()
  const ids = new Set<string>()
  ids.add(moveTarget.value.id)
  // BFS 收集所有后代
  const stack = [...getChildren(moveTarget.value.id)]
  while (stack.length) {
    const n = stack.pop()!
    ids.add(n.id)
    stack.push(...getChildren(n.id))
  }
  return ids
})

// ── 点击文章加载 ──
async function onEditArticleClick(node: TreeNode) {
  closeContextMenu()
  const content = await selectNode(node)
  if (content) {
    emit('editArticle', content, node)
  }
}

// ── 拖拽排序（pointer events，兼容 WKWebView）──
const dragNodeId = ref<string | null>(null)
const dragOverNodeId = ref<string | null>(null)
const dragOverPosition = ref<'before' | 'after' | 'inside'>('after')
const isDragging = ref(false)
let dragStartY = 0

function onPointerDown(e: PointerEvent, node: TreeNode) {
  if (e.button !== 0) return
  dragStartY = e.clientY
  dragNodeId.value = node.id
  isDragging.value = false
}

function findTreeNodeAtPoint(x: number, y: number): { node: TreeNode; el: HTMLElement } | null {
  const elements = document.elementsFromPoint(x, y)
  for (const el of elements) {
    const treeEl = (el as HTMLElement).closest('[data-node-id]') as HTMLElement | null
    if (!treeEl) continue
    const id = treeEl.dataset.nodeId
    if (!id) continue
    const node = treeData.value.find((n) => n.id === id)
    if (node) return { node, el: treeEl }
  }
  return null
}

function onPointerMove(e: PointerEvent) {
  if (!dragNodeId.value) return

  if (!isDragging.value) {
    if (Math.abs(e.clientY - dragStartY) < 5) return
    isDragging.value = true
  }

  const hit = findTreeNodeAtPoint(e.clientX, e.clientY)
  if (!hit || hit.node.id === dragNodeId.value) {
    dragOverNodeId.value = null
    return
  }

  const draggedNode = treeData.value.find((n) => n.id === dragNodeId.value)
  if (!draggedNode) return

  dragOverNodeId.value = hit.node.id
  const rect = hit.el.getBoundingClientRect()
  const yRatio = (e.clientY - rect.top) / rect.height

  // folder 中部区域（15%~85%）作为 inside 吸入态，显示虚线框；
  // 文章节点不支持 inside，只能 before/after。
  // folder 拖到祖先 folder 也显示 inside 虚线框（视觉反馈），
  // 实际行为在 onPointerUp 区分：直接父级不移动，更高祖先移到其同级
  if (hit.node.type === 'folder' && yRatio > 0.15 && yRatio < 0.85) {
    dragOverPosition.value = 'inside'
  } else {
    dragOverPosition.value = yRatio < 0.5 ? 'before' : 'after'
  }
}

async function onPointerUp(e: PointerEvent) {
  if (!isDragging.value || !dragNodeId.value) {
    dragNodeId.value = null
    return
  }

  const hit = findTreeNodeAtPoint(e.clientX, e.clientY)
  const targetNode = hit?.node

  if (!targetNode || targetNode.id === dragNodeId.value) {
    resetDrag()
    return
  }

  const draggedNode = treeData.value.find((n) => n.id === dragNodeId.value)
  if (!draggedNode) {
    resetDrag()
    return
  }

  if (dragOverPosition.value === 'inside' && targetNode.type === 'folder') {
    // folder 拖到自己的后代 folder 会造成循环，禁止；
    // 拖到祖先 folder（含直接父级）安全，移到该 folder 内部
    if (draggedNode.type === 'folder' && isDescendantOf(dragNodeId.value, targetNode.id)) {
      // targetNode 是 draggedNode 的后代 → 循环，不移动
      resetDrag()
      return
    }
    try {
      await moveNode(dragNodeId.value, targetNode.id, newAtTop.value ? 'top' : 'bottom')
    } catch {
      emit('toast', '移动失败')
    }
  } else if (dragOverPosition.value === 'before' || dragOverPosition.value === 'after') {
    // before/after 落点：移动到目标节点的同级位置（支持跨级）
    const targetSiblings = getSiblings(targetNode.id)
    const targetIdx = targetSiblings.findIndex((n) => n.id === targetNode.id)
    if (targetIdx !== -1) {
      // newIndex 语义：在「移除被拖节点后的兄弟列表」中的插入位置。
      // targetSiblings 不含跨级的被拖节点；同级时含自身，但 splice 先移除再插入，
      // 所以 after+1 / before 不变的原始 index 即正确值，无需 oldIndex 调整。
      const newIndex = dragOverPosition.value === 'after' ? targetIdx + 1 : targetIdx
      if (draggedNode.parentId === targetNode.parentId) {
        // 同级排序
        try {
          await reorderToPosition(dragNodeId.value, newIndex)
        } catch {
          emit('toast', '排序失败')
        }
      } else {
        // 跨级移动：先改父级再排到目标位置
        try {
          await moveAndReorder(dragNodeId.value, targetNode.parentId, newIndex)
        } catch {
          emit('toast', '移动失败')
        }
      }
    }
  }

  resetDrag()
}

function resetDrag() {
  dragNodeId.value = null
  dragOverNodeId.value = null
  isDragging.value = false
}

/** 防止节点拖入自己的后代文件夹（形成循环） */
function isDescendantOf(ancestorId: string, nodeId: string): boolean {
  let currentId: string | null = nodeId
  while (currentId) {
    if (currentId === ancestorId) return true
    const node = treeData.value.find((n) => n.id === currentId)
    currentId = node?.parentId ?? null
  }
  return false
}

/** 计算拖拽指示线样式 */
function dropIndicatorStyle(nodeId: string) {
  if (dragOverNodeId.value !== nodeId || !dragNodeId.value || !isDragging.value) return null
  if (dragOverPosition.value === 'inside') return null
  return dragOverPosition.value === 'before'
    ? { top: '0', borderTop: '2px solid var(--accent)' }
    : { bottom: '0', borderBottom: '2px solid var(--accent)' }
}

/** 文件夹是否处于吸入态（拖入内部） */
function isDropInside(node: TreeNode): boolean {
  return (
    dragOverNodeId.value === node.id &&
    dragOverPosition.value === 'inside' &&
    !!dragNodeId.value &&
    isDragging.value
  )
}

// ── 注入给 TreeNode 递归组件 ──
provide('tree-isNodeVisible', isNodeVisible)
provide('tree-isExpanded', isExpanded)
provide('tree-toggleExpand', toggleExpand)
provide('tree-getChildren', sortedGetChildren)
provide('tree-onPointerDown', onPointerDown)
provide('tree-dropIndicatorStyle', dropIndicatorStyle)
provide('tree-isDropInside', isDropInside)
provide('tree-onEditArticleClick', onEditArticleClick)
provide('tree-openContextMenu', openContextMenu)
provide('tree-currentCloudArticleId', currentCloudArticleId)
provide('tree-dragNodeId', dragNodeId)
provide('tree-reordering', reordering)

// ── 全部展开/收起 ──
const isAllExpanded = computed(() => {
  const allFolders = treeData.value.filter((n) => n.type === 'folder')
  if (allFolders.length === 0) return false
  return allFolders.every((f) => expandedIds.value.has(f.id))
})

function toggleAllExpand() {
  const allFolders = treeData.value.filter((n) => n.type === 'folder')
  if (allFolders.length === 0) return

  if (isAllExpanded.value) {
    // 全部收起
    allFolders.forEach((f) => {
      if (expandedIds.value.has(f.id)) toggleExpand(f.id)
    })
  } else {
    // 全部展开
    allFolders.forEach((f) => {
      if (!expandedIds.value.has(f.id)) toggleExpand(f.id)
    })
  }
}

// ── 点击外部关闭菜单 ──
function onDocumentClick() {
  closeContextMenu()
  sortMenuVisible.value = false
  wsMenuVisible.value = false
}

onMounted(() => {
  init()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  window.addEventListener('setting-changed', onSettingChanged)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('setting-changed', onSettingChanged)
})

/** SettingsDialog 保存云端配置、切换存储模式或更改本地目录后自动同步 */
function onSettingChanged(e: Event) {
  const { key } = (e as CustomEvent).detail || {}
  if (key === 'cloudArticleToken' || key === 'cloudArticleRepo' || key === 'articleStorageMode') {
    checkConfig()
  } else if (key === 'articleStorageDir') {
    // 本地存储目录被移动/切换后，重新从新路径加载树
    loadTree()
  }
}
</script>

<template>
  <div
    class="tree-panel flex flex-col h-full overflow-hidden shrink-0 transition-all duration-290 rounded-xl mr-[10px]"
    style="width: 100%; background: var(--bg-primary)"
  >
    <!-- 标题栏 -->
    <div
      v-if="isConfigured"
      class="flex items-center justify-between px-3 py-2 shrink-0"
      :style="{ borderBottom: searchVisible ? 'none' : '1px solid var(--border-color, #e5e5e5)' }"
    >
      <div class="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
        <BaseTooltip :text="isAllExpanded ? '收起全部' : '展开全部'">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="toggleAllExpand"
          >
            <ChevronRight v-if="!isAllExpanded" :size="14" />
            <ChevronDown v-else :size="14" />
          </button>
        </BaseTooltip>
        <div class="relative mr-0.5">
          <BaseTooltip text="切换工作区">
            <button
              ref="wsTriggerRef"
              class="flex items-center justify-center h-7 w-7 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
              @click.stop="toggleWsMenu"
            >
              <GitBranch :size="14" class="shrink-0" />
            </button>
          </BaseTooltip>
        </div>

        <div class="relative">
          <BaseTooltip text="排序">
            <button
              ref="sortTriggerRef"
              class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
              @click.stop="toggleSortMenu"
            >
              <ArrowUpDown :size="14" :style="{ color: isSorting ? 'var(--accent)' : undefined }" />
            </button>
          </BaseTooltip>
        </div>
        <BaseTooltip text="手动刷新">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="refreshTree"
          >
            <RefreshCw :size="14" />
          </button>
        </BaseTooltip>
        <BaseTooltip :text="newAtTop ? '新建文章添加到头部' : '新建文章添加到尾部'">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="toggleNewArticlePosition"
          >
            <ArrowUpToLine v-if="newAtTop" :size="14" :style="{ color: 'var(--accent)' }" />
            <ArrowDownToLine v-else :size="14" :style="{ color: 'var(--accent)' }" />
          </button>
        </BaseTooltip>
        <BaseTooltip text="新建文章">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="showNewRootArticle()"
          >
            <FilePlus :size="14" />
          </button>
        </BaseTooltip>
        <BaseTooltip text="新建文件夹">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="showNewRoot()"
          >
            <Folder :size="14" />
          </button>
        </BaseTooltip>
        <BaseTooltip :text="searchVisible ? '关闭搜索' : '搜索文章'">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="toggleSearch"
          >
            <Search :size="14" :style="{ color: searchVisible ? 'var(--accent)' : undefined }" />
          </button>
        </BaseTooltip>
        <BaseTooltip :text="autoExpandEnabled ? '关闭自动定位' : '自动定位到当前文章'">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="toggleAutoExpand()"
          >
            <Crosshair
              :size="14"
              :style="{ color: autoExpandEnabled ? 'var(--accent)' : undefined }"
            />
          </button>
        </BaseTooltip>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div
      v-if="isConfigured && searchVisible"
      class="px-3 pb-2 shrink-0"
      style="border-bottom: 1px solid var(--border-color, #e5e5e5)"
    >
      <div
        class="flex items-center gap-1.5 bg-[var(--bg-hover)] rounded-full border border-[var(--border-color,#e5e5e5)] focus-within:border-[var(--accent)] py-1 px-3"
      >
        <Search :size="12" style="color: var(--text-secondary)" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索文章..."
          class="flex-1 bg-transparent border-none outline-none text-xs"
          style="color: var(--text-primary)"
        />
        <button
          v-if="searchQuery"
          class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-[var(--bg-primary)] cursor-pointer border-none bg-transparent"
          @click="searchQuery = ''"
        >
          <X :size="10" style="color: var(--text-secondary)" />
        </button>
      </div>
    </div>

    <!-- 树形区域 -->
    <div class="flex-1 overflow-auto py-1 scrollbar-hide">
      <!-- 未配置 -->
      <div v-if="!isConfigured" class="px-3 py-6 text-center">
        <p class="text-xs mb-2" style="color: var(--text-secondary)">尚未配置 GitHub 仓库</p>
        <button
          class="px-3 py-1 text-xs rounded-lg border-none cursor-pointer transition-colors duration-150"
          style="background: var(--accent-light); color: var(--accent)"
          @click="emit('openSettings', 'cloud')"
        >
          前往设置
        </button>
      </div>

      <!-- 加载中 -->
      <div v-else-if="loading && treeData.length === 0" class="px-3 py-6 text-center">
        <p class="text-xs" style="color: var(--text-secondary)">加载中...</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="error && treeData.length === 0" class="px-3 py-4 text-center">
        <p class="text-xs" style="color: #e74c3c">{{ error }}</p>
        <button
          class="px-3 py-1 text-xs rounded-lg border-none cursor-pointer mt-2"
          style="background: var(--accent-light); color: var(--accent)"
          @click="init()"
        >
          重试
        </button>
      </div>

      <!-- 树节点 -->
      <template v-else>
        <TreeNodeComponent v-for="root in sortedTreeRoots" :key="root.id" :node="root" :depth="0" />

        <!-- 空树 -->
        <div v-if="treeData.length === 0 && !loading" class="px-3 py-6 text-center">
          <p class="text-xs" style="color: var(--text-secondary)">暂无文章</p>
          <p class="text-xs mt-1" style="color: var(--text-secondary); opacity: 0.6">
            点击上方「新建文章」图标创建
          </p>
        </div>

        <!-- 搜索无结果 -->
        <div v-if="noSearchResults" class="px-3 py-6 text-center">
          <p class="text-xs" style="color: var(--text-secondary)">
            未找到匹配「{{ searchQuery }}」的文章
          </p>
        </div>
      </template>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible && contextMenu.node"
        ref="ctxMenuRef"
        class="ctx-menu fixed z-[9999] rounded-lg py-1 min-w-[140px]"
        :style="{
          left: contextMenu.x + 'px',
          top: contextMenu.y + 'px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color, #e5e5e5)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }"
        @click.stop
      >
        <!-- article 右键菜单 -->
        <template v-if="contextMenu.node.type === 'article'">
          <button class="ctx-item" @click="onCtxMenuAction('rename', contextMenu.node!)">
            重命名
          </button>
          <button class="ctx-item" @click="onCtxMenuAction('delete', contextMenu.node!)">
            删除
          </button>
          <button class="ctx-item" @click="onCtxMenuAction('move', contextMenu.node!)">
            移动到...
          </button>
        </template>
        <!-- folder 右键菜单 -->
        <template v-else>
          <button class="ctx-item" @click="onCtxMenuAction('new-article', contextMenu.node!)">
            新建子文章
          </button>
          <button class="ctx-item" @click="onCtxMenuAction('new-folder', contextMenu.node!)">
            新建子文件夹
          </button>
          <div style="border-top: 1px solid var(--border-color, #e5e5e5); margin: 2px 0" />
          <button class="ctx-item" @click="onCtxMenuAction('rename', contextMenu.node!)">
            重命名
          </button>
          <button class="ctx-item" @click="onCtxMenuAction('delete', contextMenu.node!)">
            删除
          </button>
          <button class="ctx-item" @click="onCtxMenuAction('move', contextMenu.node!)">
            移动到...
          </button>
        </template>
      </div>
    </Teleport>

    <!-- 新建根级文件夹弹窗 -->
    <PromptDialog
      v-model:visible="newRootPopup"
      value=""
      title="新建文件夹"
      placeholder="名称"
      confirm-text="确定"
      :loading="newRootCreating"
      loading-text="正在创建..."
      @save="
        (v: string) => {
          newRootTitle = v
          confirmNewRoot()
        }
      "
    />

    <!-- 新建根级文章弹窗 -->
    <PromptDialog
      v-model:visible="newRootArticlePopup"
      value=""
      title="新建文章"
      placeholder="文件名（.md 自动补全）"
      confirm-text="确定"
      :loading="newRootArticleCreating"
      loading-text="正在创建..."
      @save="
        (v: string) => {
          newRootArticleTitle = v
          confirmNewRootArticle()
        }
      "
    />

    <!-- 新建子节点弹窗 -->
    <PromptDialog
      v-model:visible="newChildPopup"
      value=""
      :title="`在「${newChildParent?.title}」中${newChildType === 'folder' ? '新建文件夹' : '新建文章'}`"
      placeholder="名称"
      confirm-text="确定"
      :loading="newChildCreating"
      loading-text="正在创建..."
      @save="
        (v: string) => {
          newChildTitle = v
          confirmNewChild()
        }
      "
    />

    <!-- 重命名弹窗 -->
    <PromptDialog
      v-model:visible="renamePopup"
      :value="renameTarget?.title || ''"
      title="重命名"
      placeholder="名称"
      confirm-text="确定"
      :loading="renaming"
      loading-text="正在重命名..."
      @save="
        (v: string) => {
          renameTitle = v
          confirmRename()
        }
      "
    />

    <!-- 移动到弹窗 -->
    <BaseDialog
      :visible="movePopup"
      :title="`移动「${moveTarget?.title}」`"
      width="360px"
      :show-footer="true"
      confirm-text="确定"
      accent="var(--accent)"
      :loading="moving"
      loading-text="正在移动..."
      @close="movePopup = false"
      @confirm="confirmMove"
    >
      <div class="max-h-[300px] overflow-auto">
        <!-- 根目录 -->
        <div
          class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-100"
          :style="
            moveParentId === null
              ? { background: 'var(--accent-light)', color: 'var(--accent)' }
              : { color: 'var(--text-primary)' }
          "
          @click="moveParentId = null"
        >
          <Folder :size="14" style="color: var(--accent)" />
          <span>（根目录）</span>
        </div>

        <!-- 文件夹树（复用 PushToCloudTree 递归渲染，支持任意层级） -->
        <PushToCloudTree
          :nodes="treeRoots"
          :depth="0"
          mode="new"
          :selected-id="moveParentId"
          :disabled-ids="moveDisabledIds"
          :get-children="getChildren"
          :is-expanded="isExpanded"
          :toggle-expand="toggleExpand"
          @select="(id: string) => (moveParentId = id)"
        />
      </div>
    </BaseDialog>
    <ConfirmDialog
      :visible="deleteConfirmVisible"
      title="确认删除"
      :message="`确定删除 ${deleteConfirmLabel}？此操作不可恢复。`"
      confirm-text="确定删除"
      confirm-type="danger"
      :loading="deleting"
      loading-text="正在删除..."
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />

    <!-- 工作区切换弹层（teleport 到 body，避免被滚动容器裁剪） -->
    <Teleport to="body">
      <div
        v-if="wsMenuVisible"
        class="fixed rounded-lg py-1 min-w-[180px] z-[9999]"
        :style="{
          ...wsMenuStyle,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color, #e5e5e5)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }"
        @click.stop
      >
        <div v-if="kindWorkspaceList.length === 0" class="px-3 py-1.5 text-xs" style="color: var(--text-secondary)">
          暂无工作区
        </div>
        <button
          v-for="ws in kindWorkspaceList"
          :key="ws.id"
          class="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer border-none text-left hover:bg-[var(--bg-hover)] transition-colors duration-100"
          :style="{ color: 'var(--text-primary)' }"
          @click="onSwitchWorkspace(ws)"
        >
          <span class="flex-1 truncate">{{ ws.name }}</span>
          <Check
            v-if="ws.id === currentWorkspace?.id"
            :size="13"
            style="color: var(--accent)"
          />
        </button>
        <div
          class="my-1"
          :style="{ borderTop: '1px solid var(--border-color, #e5e5e5)' }"
        />
        <button
          class="flex items-center w-full px-3 py-1.5 text-xs cursor-pointer border-none text-left transition-colors duration-100 hover:bg-[var(--bg-hover)]"
          style="color: var(--text-secondary)"
          @click="emit('openSettings', 'cloud'); wsMenuVisible = false"
        >
          管理工作区
        </button>
      </div>
    </Teleport>

    <!-- 排序弹层（teleport 到 body，避免被滚动容器裁剪） -->
    <Teleport to="body">
      <div
        v-if="sortMenuVisible"
        class="fixed rounded-lg py-1 min-w-[140px] z-[9999]"
        :style="{
          ...sortMenuStyle,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color, #e5e5e5)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }"
        @click.stop
      >
        <button
          v-for="opt in SORT_OPTIONS"
          :key="opt.value"
          class="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer border-none text-left hover:bg-[var(--bg-hover)] transition-colors duration-100"
          :style="{
            color:
              isSorting && sortMode === opt.value ? 'var(--accent)' : 'var(--text-primary)',
            background:
              isSorting && sortMode === opt.value ? 'var(--accent-light)' : 'transparent',
          }"
          @click="setSortMode(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 面板操作按钮 - 与 EditorPage.vue panel-action-btn 样式一致 */
.panel-action-btn {
  color: var(--text-secondary);
}
.panel-action-btn:hover {
  color: var(--accent, #6c5ce7);
  background: var(--accent-light, rgba(108, 92, 231, 0.08));
}

.tree-panel {
  transition:
    width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s ease,
    margin 0.25s ease;
}

.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.1s;
}

.ctx-item:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
}

.scrollbar-hide {
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
