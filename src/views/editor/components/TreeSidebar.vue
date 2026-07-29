<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Folder, FileText, Plus, ChevronRight, ChevronDown, FolderPlus, FilePlus, SquarePen, ArrowUp, ArrowDown, Search, X } from 'lucide-vue-next'
import { useGitHubTree } from '../composables/useGitHubTree'
import type { TreeNode } from '@/services/GitHubTreeService'
import PromptDialog from '@/components/PromptDialog.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'

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
  getChildren,
  isExpanded,
  toggleExpand,
  selectNode,
  createFolder,
  createArticle,
  renameNode,
  deleteNode,
  moveNode,
  reorderNode,
  getSiblings,
} = useGitHubTree()

// ── 搜索 ──
const searchQuery = ref('')

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

// ── 右键菜单 ──
const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  node: TreeNode | null
}>({ visible: false, x: 0, y: 0, node: null })

function openContextMenu(e: MouseEvent, node: TreeNode) {
  e.preventDefault()
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    node,
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
    await createFolder(null, title)
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
    await createArticle(null, finalTitle, '# ' + finalTitle.replace(/\.md$/, '') + '\n')
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
      await createArticle(parent.id, title, '# ' + title + '\n')
      emit('clearEditor')
    } else {
      await createFolder(parent.id, title)
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
  return node.type === 'folder'
    ? `文件夹「${node.title}」及其所有内容`
    : `文章「${node.title}」`
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
    ? treeData.value.find(f => f.id === moveParentId.value)?.title || '目标文件夹'
    : '根目录'
  moving.value = true
  try {
    await moveNode(target.id, moveParentId.value)
    movePopup.value = false
    emit('toast', `「${targetTitle}」已移动到「${destName}」`)
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

// ── 节点排序 ──
async function handleReorder(node: TreeNode, direction: 'up' | 'down') {
  await reorderNode(node.id, direction)
}

function isFirstSibling(id: string): boolean {
  const siblings = getSiblings(id)
  return siblings.length > 0 && siblings[0].id === id
}

function isLastSibling(id: string): boolean {
  const siblings = getSiblings(id)
  return siblings.length > 0 && siblings[siblings.length - 1].id === id
}

// ── 全部展开/收起 ──
const isAllExpanded = computed(() => {
  const allFolders = treeData.value.filter(n => n.type === 'folder')
  if (allFolders.length === 0) return false
  return allFolders.every(f => expandedIds.value.has(f.id))
})

function toggleAllExpand() {
  const allFolders = treeData.value.filter(n => n.type === 'folder')
  if (allFolders.length === 0) return

  if (isAllExpanded.value) {
    // 全部收起
    allFolders.forEach(f => {
      if (expandedIds.value.has(f.id)) toggleExpand(f.id)
    })
  } else {
    // 全部展开
    allFolders.forEach(f => {
      if (!expandedIds.value.has(f.id)) toggleExpand(f.id)
    })
  }
}

// ── 点击外部关闭菜单 ──
function onDocumentClick() {
  closeContextMenu()
}

onMounted(() => {
  init()
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('setting-changed', onSettingChanged)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('setting-changed', onSettingChanged)
})

/** SettingsDialog 保存云端配置后自动同步 */
function onSettingChanged(e: Event) {
  const { key } = (e as CustomEvent).detail || {}
  if (key === 'cloudArticleToken' || key === 'cloudArticleRepo') {
    checkConfig()
  }
}
</script>

<template>
  <div
    class="tree-panel flex flex-col h-full overflow-hidden shrink-0 transition-all duration-250 rounded-xl mr-[10px]"
    style="width: 100%; background: var(--bg-primary);"
  >
    <!-- 标题栏 -->
    <div
      class="flex items-center justify-between px-3 py-2 shrink-0"
      style="border-bottom: 1px solid var(--border-color, #e5e5e5);"
    >
      <div class="flex flex-1 items-center gap-1.5 bg-[var(--bg-hover)] rounded-full border border-[var(--border-color,#e5e5e5)] focus-within:border-[var(--accent)] py-1 mr-2 px-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索文章..."
          class="flex-1 bg-transparent border-none outline-none text-xs w-22"
          style="color: var(--text-primary);"
        />
        <button
          v-if="searchQuery"
          class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-[var(--bg-primary)] cursor-pointer border-none bg-transparent"
          @click="searchQuery = ''"
        >
          <X :size="10" style="color: var(--text-secondary);" />
        </button>
      </div>
      <div class="flex items-center gap-0.5">
        <BaseTooltip :text="isAllExpanded ? '收起全部' : '展开全部'">
          <button
            class="flex items-center justify-center h-7 px-2 rounded-[5px] border-none cursor-pointer transition-all duration-150 panel-action-btn"
            @click="toggleAllExpand"
          >
            <ChevronRight v-if="!isAllExpanded" :size="14" />
            <ChevronDown v-else :size="14" />
          </button>
        </BaseTooltip>
        <BaseTooltip text="新建文件">
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
      </div>
    </div>

    <!-- 树形区域 -->
    <div class="flex-1 overflow-auto py-1">
      <!-- 未配置 -->
      <div v-if="!isConfigured" class="px-3 py-6 text-center">
        <p class="text-xs mb-2" style="color: var(--text-secondary);">尚未配置 GitHub 仓库</p>
        <button
          class="px-3 py-1 text-xs rounded-lg border-none cursor-pointer transition-colors duration-150"
          style="background: var(--accent); color: white;"
          @click="emit('openSettings', 'cloud')"
        >
          前往设置
        </button>
      </div>

      <!-- 加载中 -->
      <div v-else-if="loading && treeData.length === 0" class="px-3 py-6 text-center">
        <p class="text-xs" style="color: var(--text-secondary);">加载中...</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="error && treeData.length === 0" class="px-3 py-4 text-center">
        <p class="text-xs" style="color: #e74c3c;">{{ error }}</p>
        <button
          class="px-3 py-1 text-xs rounded-lg border-none cursor-pointer mt-2"
          style="background: var(--accent-light); color: var(--accent);"
          @click="init()"
        >
          重试
        </button>
      </div>

      <!-- 树节点 -->
      <template v-else>
        <template v-for="root in treeRoots" :key="root.id">
          <!-- folder -->
          <template v-if="root.type === 'folder'">
            <div
              v-if="!searchQuery || isNodeVisible(root.id)"
              class="tree-node group relative flex items-center gap-0.5 px-2 py-1 cursor-pointer select-none transition-colors duration-100"
              :class="{ 'tree-node--active': currentCloudArticleId === root.id }"
              @click="toggleExpand(root.id)"
              @contextmenu.prevent="openContextMenu($event, root)"
            >
              <span class="flex items-center justify-center w-4 h-4 shrink-0">
                <ChevronRight v-if="!isExpanded(root.id)" :size="12" style="color: var(--text-secondary);" />
                <ChevronDown v-else :size="12" style="color: var(--text-secondary);" />
              </span>
              <Folder :size="14" class="shrink-0 ml-0.5" style="color: var(--accent);" />
              <span class="text-xs truncate ml-1" style="color: var(--text-primary);">{{ root.title }}</span>
              <span class="ml-auto shrink-0 hidden group-hover:flex items-center">
                <button
                  class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                  :disabled="reordering || isFirstSibling(root.id)"
                  title="上移"
                  @click.stop="handleReorder(root, 'up')"
                ><ArrowUp :size="12" style="color: var(--text-secondary);" /></button>
                <button
                  class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                  :disabled="reordering || isLastSibling(root.id)"
                  title="下移"
                  @click.stop="handleReorder(root, 'down')"
                ><ArrowDown :size="12" style="color: var(--text-secondary);" /></button>
              </span>
            </div>
            <!-- 子节点 -->
            <template v-if="isExpanded(root.id)">
              <template v-for="child in getChildren(root.id)" :key="child.id">
                <div
                  v-if="!searchQuery || isNodeVisible(child.id)"
                  class="tree-node group relative flex items-center gap-0.5 px-2 py-1 cursor-pointer select-none transition-colors duration-100"
                  :class="{ 'tree-node--active': currentCloudArticleId === child.id }"
                  :style="{ paddingLeft: '26px' }"
                  @click="child.type === 'folder' ? toggleExpand(child.id) : undefined"
                  @contextmenu.prevent="openContextMenu($event, child)"
                >
                  <span class="flex items-center justify-center w-4 h-4 shrink-0">
                    <ChevronRight
                      v-if="child.type === 'folder' && !isExpanded(child.id)"
                      :size="12"
                      style="color: var(--text-secondary);"
                    />
                    <ChevronDown
                      v-else-if="child.type === 'folder' && isExpanded(child.id)"
                      :size="12"
                      style="color: var(--text-secondary);"
                    />
                    <span v-else class="w-4" />
                  </span>
                  <FileText v-if="child.type === 'article'" :size="14" class="shrink-0" style="color: var(--text-secondary);" />
                  <Folder v-else :size="14" class="shrink-0" style="color: var(--accent);" />
                  <div class="flex flex-col min-w-0 flex-1 ml-1">
                    <span class="text-xs truncate" style="color: var(--text-primary);">{{ child.title }}</span>
                  </div>
                  <span class="ml-auto shrink-0 hidden group-hover:flex items-center">
                    <button
                      v-if="child.type === 'article'"
                      class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                      title="加载到编辑器"
                      @click.stop="onEditArticleClick(child)"
                    ><SquarePen :size="14" style="color: var(--text-secondary);" /></button>
                    <button
                      class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                      :disabled="reordering || isFirstSibling(child.id)"
                      title="上移"
                      @click.stop="handleReorder(child, 'up')"
                    ><ArrowUp :size="12" style="color: var(--text-secondary);" /></button>
                    <button
                      class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                      :disabled="reordering || isLastSibling(child.id)"
                      title="下移"
                      @click.stop="handleReorder(child, 'down')"
                    ><ArrowDown :size="12" style="color: var(--text-secondary);" /></button>
                  </span>
                </div>
                <!-- 二级展开的文章（folder 下还有子节点） -->
                <template v-if="child.type === 'folder' && isExpanded(child.id)">
                  <template v-for="sub in getChildren(child.id)" :key="sub.id">
                    <div
                      v-if="!searchQuery || isNodeVisible(sub.id)"
                      class="tree-node group relative flex items-center gap-0.5 px-2 py-1 cursor-pointer select-none transition-colors duration-100"
                      :class="{ 'tree-node--active': currentCloudArticleId === sub.id }"
                      :style="{ paddingLeft: '42px' }"
                      @click="sub.type === 'folder' ? toggleExpand(sub.id) : undefined"
                      @contextmenu.prevent="openContextMenu($event, sub)"
                    >
                      <FileText v-if="sub.type === 'article'" :size="14" class="shrink-0" style="color: var(--text-secondary);" />
                      <Folder v-else :size="14" class="shrink-0" style="color: var(--accent);" />
                      <div class="flex flex-col min-w-0 flex-1 ml-1">
                        <span class="text-xs truncate" style="color: var(--text-primary);">{{ sub.title }}</span>
                      </div>
                      <span class="ml-auto shrink-0 hidden group-hover:flex items-center">
                        <button
                          v-if="sub.type === 'article'"
                          class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                          title="加载到编辑器"
                          @click.stop="onEditArticleClick(sub)"
                        ><SquarePen :size="14" style="color: var(--text-secondary);" /></button>
                        <button
                          class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                          :disabled="reordering || isFirstSibling(sub.id)"
                          title="上移"
                          @click.stop="handleReorder(sub, 'up')"
                        ><ArrowUp :size="12" style="color: var(--text-secondary);" /></button>
                        <button
                          class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                          :disabled="reordering || isLastSibling(sub.id)"
                          title="下移"
                          @click.stop="handleReorder(sub, 'down')"
                        ><ArrowDown :size="12" style="color: var(--text-secondary);" /></button>
                      </span>
                    </div>
                  </template>
                </template>
              </template>
            </template>
          </template>

          <!-- 根级 article -->
          <template v-else>
            <div
              v-if="!searchQuery || isNodeVisible(root.id)"
              class="tree-node group relative flex items-center gap-0.5 px-2 py-1 cursor-pointer select-none transition-colors duration-100"
              :class="{ 'tree-node--active': currentCloudArticleId === root.id }"
              @click="undefined"
              @contextmenu.prevent="openContextMenu($event, root)"
            >
              <span class="w-4 shrink-0" />
              <FileText :size="14" class="shrink-0" style="color: var(--text-secondary);" />
              <div class="flex flex-col min-w-0 flex-1 ml-1">
                <span class="text-xs truncate" style="color: var(--text-primary);">{{ root.title }}</span>
              </div>
              <span class="ml-auto shrink-0 hidden group-hover:flex items-center">
                <button
                  class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                  title="加载到编辑器"
                  @click.stop="onEditArticleClick(root)"
                ><SquarePen :size="14" style="color: var(--text-secondary);" /></button>
                <button
                  class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                  :disabled="reordering || isFirstSibling(root.id)"
                  title="上移"
                  @click.stop="handleReorder(root, 'up')"
                ><ArrowUp :size="12" style="color: var(--text-secondary);" /></button>
                <button
                  class="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                  :disabled="reordering || isLastSibling(root.id)"
                  title="下移"
                  @click.stop="handleReorder(root, 'down')"
                ><ArrowDown :size="12" style="color: var(--text-secondary);" /></button>
              </span>
            </div>
          </template>
        </template>

        <!-- 空树 -->
        <div v-if="treeData.length === 0 && !loading" class="px-3 py-6 text-center">
          <p class="text-xs" style="color: var(--text-secondary);">暂无文章</p>
          <p class="text-xs mt-1" style="color: var(--text-secondary); opacity: 0.6;">点击右上角 [+] 新建</p>
        </div>

        <!-- 搜索无结果 -->
        <div v-if="noSearchResults" class="px-3 py-6 text-center">
          <p class="text-xs" style="color: var(--text-secondary);">未找到匹配「{{ searchQuery }}」的文章</p>
        </div>
      </template>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible && contextMenu.node"
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
          <button class="ctx-item" @click="onCtxMenuAction('rename', contextMenu.node!)">重命名</button>
          <button class="ctx-item" @click="onCtxMenuAction('delete', contextMenu.node!)">删除</button>
          <button class="ctx-item" @click="onCtxMenuAction('move', contextMenu.node!)">移动到...</button>
        </template>
        <!-- folder 右键菜单 -->
        <template v-else>
          <button class="ctx-item" @click="onCtxMenuAction('new-article', contextMenu.node!)">新建子文章</button>
          <button class="ctx-item" @click="onCtxMenuAction('new-folder', contextMenu.node!)">新建子文件夹</button>
          <div style="border-top: 1px solid var(--border-color, #e5e5e5); margin: 2px 0;" />
          <button class="ctx-item" @click="onCtxMenuAction('rename', contextMenu.node!)">重命名</button>
          <button class="ctx-item" @click="onCtxMenuAction('delete', contextMenu.node!)">删除</button>
          <button class="ctx-item" @click="onCtxMenuAction('move', contextMenu.node!)">移动到...</button>
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
      @save="(v: string) => { newRootTitle = v; confirmNewRoot() }"
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
      @save="(v: string) => { newRootArticleTitle = v; confirmNewRootArticle() }"
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
      @save="(v: string) => { newChildTitle = v; confirmNewChild() }"
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
      @save="(v: string) => { renameTitle = v; confirmRename() }"
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
          :style="moveParentId === null ? { background: 'var(--accent-light)', color: 'var(--accent)' } : { color: 'var(--text-primary)' }"
          @click="moveParentId = null"
        >
          <Folder :size="14" style="color: var(--accent);" />
          <span>（根目录）</span>
        </div>

        <!-- 文件夹树 -->
        <template v-for="root in treeRoots.filter((n) => n.type === 'folder')" :key="root.id">
          <div
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors duration-100"
            :class="{ 'cursor-pointer': !moveDisabledIds.has(root.id), 'cursor-not-allowed': moveDisabledIds.has(root.id) }"
            :style="moveParentId === root.id ? { background: 'var(--accent-light)', color: 'var(--accent)' } : { color: 'var(--text-primary)', opacity: moveDisabledIds.has(root.id) ? 0.3 : 1 }"
            @click="!moveDisabledIds.has(root.id) && (moveParentId = root.id)"
          >
            <span
              class="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer"
              @click.stop="toggleExpand(root.id)"
            >
              <ChevronRight v-if="!isExpanded(root.id)" :size="12" style="color: var(--text-secondary);" />
              <ChevronDown v-else :size="12" style="color: var(--text-secondary);" />
            </span>
            <Folder :size="14" style="color: var(--accent);" />
            <span>{{ root.title }}</span>
          </div>

          <!-- 一级子文件夹 -->
          <template v-if="isExpanded(root.id)">
            <template v-for="child in getChildren(root.id).filter((n) => n.type === 'folder')" :key="child.id">
              <div
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors duration-100"
                :class="{ 'cursor-pointer': !moveDisabledIds.has(child.id), 'cursor-not-allowed': moveDisabledIds.has(child.id) }"
                :style="{ paddingLeft: '36px', ...(moveParentId === child.id ? { background: 'var(--accent-light)', color: 'var(--accent)' } : { color: 'var(--text-primary)', opacity: moveDisabledIds.has(child.id) ? 0.3 : 1 }) }"
                @click="!moveDisabledIds.has(child.id) && (moveParentId = child.id)"
              >
                <Folder :size="14" style="color: var(--accent);" />
                <span>{{ child.title }}</span>
              </div>

              <!-- 二级子文件夹 -->
              <template v-for="grandchild in getChildren(child.id).filter((n) => n.type === 'folder')" :key="grandchild.id">
                <div
                  class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors duration-100"
                  :class="{ 'cursor-pointer': !moveDisabledIds.has(grandchild.id), 'cursor-not-allowed': moveDisabledIds.has(grandchild.id) }"
                  :style="{ paddingLeft: '52px', ...(moveParentId === grandchild.id ? { background: 'var(--accent-light)', color: 'var(--accent)' } : { color: 'var(--text-primary)', opacity: moveDisabledIds.has(grandchild.id) ? 0.3 : 1 }) }"
                  @click="!moveDisabledIds.has(grandchild.id) && (moveParentId = grandchild.id)"
                >
                  <Folder :size="14" style="color: var(--accent);" />
                  <span>{{ grandchild.title }}</span>
                </div>
              </template>
            </template>
          </template>
        </template>
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
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin 0.25s ease;
}

.tree-node {
  min-height: 28px;
}

.tree-node:hover {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.tree-node--active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
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
</style>
