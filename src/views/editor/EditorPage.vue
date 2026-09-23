<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '@/composables/useTheme'
import { useDarkMode } from '@/composables/useDarkMode'
import { getSetting, setSetting } from '@/config/settings'
import { useSetting } from '@/composables/useSetting'
import { useScrollSync } from './composables/useScrollSync'
import { useExport, exportItems } from './composables/useExport'
import { useAutoSave, STORAGE_KEY, SAVE_TIME_KEY } from './composables/useAutoSave'
import {
  useImageInsert,
  saveBase64Store,
  resolveBase64,
  clearBase64Store,
} from './composables/useImageInsert'
import { useImport } from './composables/useImport'
import { useDraft } from './composables/useDraft'
import { useGitHubTree } from './composables/useGitHubTree'
import {
  useToolbar,
  type EditorExposed,
  formatIcons,
  markdownInsertOptions,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  MAX_COLS,
  MAX_ROWS,
} from './composables/useToolbar'
import { useWechatPublish } from './composables/useWechatPublish'
import { useMaterial } from './composables/useMaterial'
import {
  useAutoUpdater,
  autoUpdatePending,
  autoUpdateRid,
  downloadUpdateWithRid,
  type UpdateInfo,
} from '@/composables/useAutoUpdater'
import { autoSaveEnabled, autoSaveInterval } from '@/composables/useEditorSettings'
import { DEMO_CONTENT } from '@/data/demoContent'
import { extractTitle } from '@/utils/extractTitle'
import { extractOutline } from '@/utils/outline'
import { countChars } from '@/utils/charCount'
import Editor from './components/Editor.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import { inlineFormatOptions } from '@/utils/inlineFormat'
import {
  Image,
  ImageUp,
  Puzzle,
  Braces,
  Code2,
  Save,
  SquareBottomDashedScissors,
  CheckCircle,
  Download,
  Copy,
  CircleCheck,
  Smartphone,
  SquarePen,
  CircleQuestionMark,
  ImagePlus,
  Send,
  Package,
  Columns2,
  Rows2,
  Box,
  Type,
  Layers,
  Cloud,
  HardDrive,
  ListTree,
  Search,
} from 'lucide-vue-next'
import { resolveIdbImages } from '@/utils/imageDB'
import { resolveDiskImages } from '@/services/localImageDisk'
import { getErrorMessage } from '@/utils/helpers'
import { findShortcutLabel, replaceShortcutLabel } from '@/utils/platform'
import { isMac, modKeyLabel, ctrlKeyLabel, altKeyLabel, shiftKeyLabel } from '@/utils/platform'
import {
  parseShortcut,
  matchShortcut,
  shortcutDisplay,
  DEFAULT_PALETTE_SHORTCUT,
  type ShortcutSpec,
  type PaletteItem,
  type PaletteKind,
} from '@/utils/commandPalette'
import { DraftStorage } from '@/services/DraftStorage'
import { MaterialStorage } from '@/services/materialStorage'
import CommandPalette from './components/CommandPalette.vue'

import Preview from './components/Preview.vue'
import Minimap from './components/Minimap.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import FindReplacePanel, { type FindSpec } from './components/FindReplacePanel.vue'
import ThemePicker from './components/ThemePicker.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import BannedWordsDialog from './components/BannedWordsDialog.vue'
import Dropdown from './components/Dropdown.vue'
import MobileActionsMenu from './components/mobile/MobileActionsMenu.vue'
import XhsExporter from './components/XhsExporter.vue'
import TagPropsForm from './components/TagPropsForm.vue'
import ComponentPickerDialog from './components/ComponentPickerDialog.vue'
import SaveDraftDialog from './components/SaveDraftDialog.vue'
import DraftListDialog from './components/DraftListDialog.vue'
import FinalizeDialog from './components/FinalizeDialog.vue'
import EditorSidebar from './components/EditorSidebar.vue'
import TreeSidebar from './components/TreeSidebar.vue'
import PushToCloudDialog from './components/PushToCloudDialog.vue'
import ImageCacheDialog from './components/ImageCacheDialog.vue'
import SaveMaterialDialog from './components/SaveMaterialDialog.vue'
import MaterialLibraryPanel from './components/MaterialLibraryPanel.vue'
import PublishToWechatDialog from '@/views/editor/components/PublishToWechatDialog.vue'
import Toast from '@/components/Toast.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import pkg from '../../../package.json'

const { accent, colors, setTheme, setCustomTheme, customColor, themes } = useTheme()
const { isDark } = useDarkMode()
useAutoUpdater()

// ── 左侧侧栏 ──
const sidebarTab = ref('editor')

function onSidebarSelect(tab: string) {
  sidebarTab.value = tab
}

// ── 云端文章 ──
const treePanelVisible = ref(
  window.innerWidth < 768 ? false : getSetting<boolean>('treeSidebarExpanded'),
)
const pushCloudVisible = ref(false)
const pushingCloud = ref(false)

function onToggleTreePanel() {
  treePanelVisible.value = !treePanelVisible.value
  setSetting('treeSidebarExpanded', treePanelVisible.value)
}

// ── Tree Panel 拖动调整宽度 ──
const TREE_PANEL_DEFAULT_WIDTH = 275
const TREE_PANEL_MAX_WIDTH = 350
const treePanelWidth = ref(getSetting<number>('treePanelWidth') || TREE_PANEL_DEFAULT_WIDTH)

let treeDragStartX = 0
let treeDragStartWidth = 0

function onTreeDragStart(e: MouseEvent) {
  treeDragStartX = e.clientX
  treeDragStartWidth = treePanelWidth.value
  document.addEventListener('mousemove', onTreeDragMove)
  document.addEventListener('mouseup', onTreeDragEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onTreeDragMove(e: MouseEvent) {
  const delta = e.clientX - treeDragStartX
  const newWidth = Math.min(
    Math.max(treeDragStartWidth + delta, TREE_PANEL_DEFAULT_WIDTH),
    TREE_PANEL_MAX_WIDTH,
  )
  treePanelWidth.value = newWidth
}

function onTreeDragEnd() {
  document.removeEventListener('mousemove', onTreeDragMove)
  document.removeEventListener('mouseup', onTreeDragEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  setSetting('treePanelWidth', treePanelWidth.value)
}

// ── Tree 拖动条圆形按钮 hover 显示 ──
const treeResizeHandleRef = ref<HTMLElement | null>(null)
const treeHandleBtnVisible = ref(false)
const treeHandleBtnTop = ref(0)

function onTreeHandleEnter() {
  treeHandleBtnVisible.value = true
}

function onTreeHandleMove(e: MouseEvent) {
  const el = treeResizeHandleRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const top = e.clientY - rect.top - 12
  const clamped = Math.max(0, Math.min(top, rect.height - 24))
  treeHandleBtnTop.value = clamped
}

function onTreeHandleLeave() {
  treeHandleBtnVisible.value = false
}

async function onPushToCloud(result: {
  parentId: string | null
  title: string
  content: string
  existingArticleId?: string
}) {
  pushingCloud.value = true
  // 快照 push 前的草稿 ID，避免 push 过程中被异步清零导致检测失败
  const draftToCheck = currentDraftId.value
  try {
    await useGitHubTree().pushToCloud(
      result.parentId,
      result.title,
      result.content,
      result.existingArticleId,
    )
    pushCloudVisible.value = false
    const isLocal = articleStorageMode.value === 'local'
    showToast(
      result.existingArticleId
        ? isLocal
          ? '文章已更新到本地'
          : '文章已更新到仓库'
        : isLocal
          ? `「${result.title}」已保存到本地`
          : `「${result.title}」已上传到仓库`,
    )
    // 检查是否绑定了本地草稿
    if (draftToCheck !== null) {
      setTimeout(() => {
        pushToCloudDeleteConfirmVisible.value = true
      }, 200)
    }
  } catch (e: unknown) {
    const isLocal = articleStorageMode.value === 'local'
    showToast(
      getErrorMessage(
        e,
        isLocal ? '保存失败，请检查本地目录权限' : '上传失败，请检查网络和仓库配置',
      ),
    )
  } finally {
    pushingCloud.value = false
  }
}

function onSettingsOpen(tab: string) {
  settingsInitialTab.value = tab
  settingsVisible.value = true
}

// ── 云端文章编辑按钮加载（需确认） ──
const articleLoadConfirmVisible = ref(false)
const pendingArticleLoad = ref<{
  content: string
  node: import('@/services/GitHubTreeService').TreeNode
} | null>(null)

async function onTreeEditArticle(
  content: string,
  node: import('@/services/GitHubTreeService').TreeNode,
) {
  // 编辑器有内容且与文章内容不一致时，弹出确认
  if (markdown.value.trim() && markdown.value.trim() !== content.trim()) {
    pendingArticleLoad.value = { content, node }
    articleLoadConfirmVisible.value = true
    return
  }
  setCloudArticle(node)
  doLoadArticle(content)
}

function confirmLoadArticle() {
  if (!pendingArticleLoad.value) return
  setCloudArticle(pendingArticleLoad.value.node)
  doLoadArticle(pendingArticleLoad.value.content)
  articleLoadConfirmVisible.value = false
  pendingArticleLoad.value = null
}

function cancelLoadArticle() {
  articleLoadConfirmVisible.value = false
  pendingArticleLoad.value = null
}

function onClearEditor() {
  markdown.value = ''
  currentDraftId.value = null
  localStorage.setItem(STORAGE_KEY, '')
  localStorage.setItem(SAVE_TIME_KEY, '')
  saveMode.value = ''
  saveHint.value = ''
  setTimeout(() => matchExistingDraft(), 300)
}

function doLoadArticle(content: string) {
  markdown.value = content
  currentDraftId.value = null
  // 加载云端文章后自动匹配本地草稿（通过标题或内容）
  setTimeout(() => matchExistingDraft(), 300)
}

// ── 移动端 Tab 切换 ──
const mobileTab = ref<'editor' | 'preview'>('editor')
const isMobile = ref(window.innerWidth < 768)
const router = useRouter()
const nearBottom = ref(false)

function onResize() {
  isMobile.value = window.innerWidth < 768
}

function onPreviewClickLine(lineNo: number) {
  editorRef.value?.scrollToLineAndHighlight(lineNo)
}

/** 违禁词命中跳转：关闭弹窗 → 移动端切回编辑 Tab → 滚动定位并高亮 */
function onBannedWordsJump(line: number) {
  bannedWordsVisible.value = false
  if (isMobile.value) mobileTab.value = 'editor'
  nextTick(() => editorRef.value?.scrollToLineAndHighlight(line))
}

onMounted(() => {
  refreshDrafts()
  // 左侧目录收起时 TreeSidebar 不挂载，isConfigured 永远不会被初始化，
  // 工具栏「仓库/本地」按钮就会消失；此时由这里主动同步一次配置状态。
  // 目录展开时 TreeSidebar 自己的 init() 已经处理，无需重复触发加载。
  if (!treePanelVisible.value) useGitHubTree().checkConfig()
  // 恢复云端文章关联（刷新后 selectedNode 为 null，但 ID 已持久化到 localStorage）
  const { id: storedCloudId } = restoreCloudArticlePersistence()
  if (storedCloudId) {
    // 树加载完成后自动展开关联文章所在路径
    let expanded = false
    watch(
      treeData,
      (data) => {
        if (data.length > 0 && !expanded) {
          expanded = true
          expandAncestors(storedCloudId)
        }
      },
      { immediate: true },
    )
  }
  // 异步匹配草稿：根据当前标题查找已有同名草稿
  setTimeout(() => matchExistingDraft(), 300)
  window.addEventListener('resize', onResize)
  // 命令面板快捷键：window 级监听，编辑器/预览/侧栏聚焦时都能唤起
  window.addEventListener('keydown', onPaletteGlobalKeydown)
  // 恢复页面缩放
  if (import.meta.env.VITE_TAURI === 'true') {
    const val = getSetting<number>('pageZoom')
    if (val >= 50 && val <= 200 && val !== 100) {
      invoke('set_page_zoom', { scale: val / 100 }).catch(() => {})
    }
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onPaletteGlobalKeydown)
})

// ── 拖动调整宽度 ──
const previewWidth = ref(400)
const isDragging = ref(false)

// ── Minimap 缩略图 ──
const minimapEnabled = useSetting<boolean>('minimapEnabled')
const {
  minimapScrollRatio,
  minimapViewportRatio,
  onEditorScrollAll,
  onMinimapNavigate,
  resetMinimap,
} = useScrollSync(isMobile, mobileTab, nearBottom)

// ── 文档大纲 ──
/** 设置项：大纲总开关。关闭后工具栏按钮与右侧面板一起隐藏，只能在设置里重新开启。 */
const outlineEnabled = useSetting<boolean>('outlineEnabled')
/**
 * 面板显隐：持久化的界面状态（与 treeSidebarExpanded 同类），默认收起。
 * 工具栏按钮只切换它，避免「点一下把总开关关掉、按钮自己跟着消失」，
 * 也避免刷新后大纲面板自行展开。
 */
const outlinePanelVisible = useSetting<boolean>('outlinePanelVisible')
const outlineVisible = computed(() => outlineEnabled.value && outlinePanelVisible.value)
const outlineItems = computed(() => (outlineVisible.value ? extractOutline(markdown.value) : []))

function onToggleOutline() {
  setSetting('outlinePanelVisible', !outlinePanelVisible.value)
}

/** 大纲条目跳转：滚动编辑器并移动光标，动画结束后同步预览 */
function onOutlineJump(line: number) {
  editorRef.value?.scrollToLineAndHighlight(line, { syncPreview: true, moveCursor: true })
}

// ── 查找替换 ──
const findVisible = ref(false)
const findPanelRef = ref<InstanceType<typeof FindReplacePanel> | null>(null)
/** 面板回传的匹配数/当前序号相对编辑器真实状态略有延迟，但对展示足够 */
const findTotal = ref(0)
const findCurrent = ref(0)
const findInvalid = ref(false)

function openFind(withReplace = false) {
  // 有选中文字就带过来当查找词，和常见编辑器一致
  const selected = editorRef.value?.getSelectedText?.() ?? ''
  findVisible.value = true
  nextTick(() => {
    findPanelRef.value?.open(withReplace)
    if (selected) findPanelRef.value?.seed(selected)
  })
}

function onFindChange(spec: FindSpec) {
  editorRef.value?.applyFindSpec?.({ ...spec })
  findTotal.value = editorRef.value?.findTotal ?? 0
  findCurrent.value = editorRef.value?.findCurrent ?? 0
  findInvalid.value = editorRef.value?.findInvalid ?? false
}

function onFindNext() {
  editorRef.value?.findNext?.()
  syncFindCounters()
}

function onFindPrev() {
  editorRef.value?.findPrevious?.()
  syncFindCounters()
}

function syncFindCounters() {
  findTotal.value = editorRef.value?.findTotal ?? 0
  findCurrent.value = editorRef.value?.findCurrent ?? 0
  findInvalid.value = editorRef.value?.findInvalid ?? false
}

function onFindReplaceOne() {
  editorRef.value?.replaceCurrent?.()
  syncFindCounters()
}

function onFindReplaceAll() {
  const n = editorRef.value?.replaceAllMatches?.() ?? 0
  syncFindCounters()
  if (n > 0) showToast(`已替换 ${n} 处`)
  else showToast('没有可替换的内容')
}

function closeFind() {
  findVisible.value = false
  editorRef.value?.applyFindSpec?.({
    search: '',
    replace: '',
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
  })
  syncFindCounters()
  editorRef.value?.focusEditor?.()
}

/**
 * 工具栏「查找」按钮：已打开时再点则关闭，未打开时打开。
 * 快捷键（⌘F）仍走 openFind，保持「按快捷键总是打开并聚焦」的常见行为。
 */
function toggleFind() {
  findVisible.value ? closeFind() : openFind(false)
}

// ── 字数统计状态栏 ──
/** 与 <title> 组件保持同一口径：都排除标题块的文字，避免两处「字数」对不上 */
const statusStats = computed(() => countChars(markdown.value, { excludeTitle: true }))
const editorCursorLine = computed(() => editorRef.value?.cursorLine ?? 1)
const editorCursorCol = computed(() => editorRef.value?.cursorCol ?? 1)
const editorSelectedChars = computed(() => editorRef.value?.selectedChars ?? 0)
/** 底部状态栏总开关，可在设置里关闭 */
const statusBarEnabled = useSetting<boolean>('statusBarEnabled')

/**
 * 查找替换的提示文案。快捷键显示名按平台区分（macOS 用 ⌘/⌥，其余用 Ctrl/Alt），
 * 判断逻辑集中在 utils/platform.ts，这里只负责组装文案。
 */
const findReplaceTooltip = computed(
  () => `查找替换（${findShortcutLabel()} 查找，${replaceShortcutLabel()} 展开替换）`,
)

let startX = 0
let startWidth = 0

function onDragStart(e: MouseEvent) {
  isDragging.value = true
  startX = e.clientX
  startWidth = previewWidth.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDragMove(e: MouseEvent) {
  const delta = startX - e.clientX
  const minW = 400
  const maxW = 700
  const newWidth = Math.min(Math.max(startWidth + delta, minW), maxW)
  previewWidth.value = newWidth
}

function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ── 拖拽条圆形按钮 hover 显示 ──
const resizeHandleRef = ref<HTMLElement | null>(null)
const handleBtnVisible = ref(false)
const handleBtnTop = ref(0)

function onHandleEnter() {
  handleBtnVisible.value = true
}

function onHandleMove(e: MouseEvent) {
  const el = resizeHandleRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const top = e.clientY - rect.top - 12 // 12 = 半按钮高
  const clamped = Math.max(0, Math.min(top, rect.height - 24))
  handleBtnTop.value = clamped
}

function onHandleLeave() {
  handleBtnVisible.value = false
}

function stripIdbSrc(text: string): string {
  return text.replace(/src="idb:DBI_\d+_[a-z0-9]{6}"/g, 'src=""')
}

const saved = localStorage.getItem(STORAGE_KEY)
const markdown = ref(saved !== null ? saved : DEMO_CONTENT)
const isTauri = import.meta.env.VITE_TAURI === 'true'
const resolvedMarkdown = ref(stripIdbSrc(resolveBase64(markdown.value)))

watch(
  markdown,
  async (val) => {
    let step1 = resolveBase64(val)
    const hasIdb = /idb:DBI_\d+_[a-z0-9]{6}/.test(step1)
    if (hasIdb) {
      step1 = await resolveIdbImages(step1)
    }
    // 桌面端：解析本地磁盘图片引用（images/xxx.png）为 dataURL
    if (isTauri && /src="images\/[^"<>|*?\\]+\.(?:png|jpe?g|gif|webp|bmp|svg|ico)"/i.test(step1)) {
      step1 = await resolveDiskImages(step1)
    }
    resolvedMarkdown.value = step1
  },
  { immediate: true, flush: 'sync' },
)
const previewRef = ref()
const editorRef = ref<EditorExposed>()
const xhsVisible = ref(false)
const settingsVisible = ref(false)
const settingsInitialTab = ref('')
const showGallery = ref(false)
const bannedWordsVisible = ref(false)

// ── 自动更新 ──
const autoUpdateDialogVisible = ref(false)
const autoUpdateVersion = ref('')
const autoUpdateObj = ref<UpdateInfo | null>(null)
const autoUpdateRidVal = ref<number | null>(null)
const autoUpdateDownloading = ref(false)
const autoUpdateProgress = ref(0)

watch(autoUpdatePending, (u) => {
  if (u) {
    autoUpdateObj.value = u
    autoUpdateVersion.value = u.version
    autoUpdateDialogVisible.value = true
  }
})

watch(autoUpdateRid, (r) => {
  if (r != null) {
    autoUpdateRidVal.value = r
  }
})

async function doAutoUpdateDownload() {
  autoUpdateDialogVisible.value = false
  if (!autoUpdateObj.value || autoUpdateRidVal.value == null) return
  autoUpdateDownloading.value = true
  autoUpdateProgress.value = 0
  try {
    let total = 0
    let totalSize = 0
    await downloadUpdateWithRid(autoUpdateRidVal.value, (event) => {
      if (event.event === 'Started') {
        totalSize = event.data?.contentLength ?? 0
      } else if (event.event === 'Progress') {
        total += event.data?.chunkLength ?? 0
        if (totalSize > 0) {
          autoUpdateProgress.value = Math.round((total / totalSize) * 100)
        }
      }
    })
    // dev 模式下 restart 不生效，提示手动重启
    showToast('更新已下载，请重启应用以完成安装')
    autoUpdateDownloading.value = false
  } catch (e) {
    console.error('[updater] auto download error:', e, typeof e, JSON.stringify(e))
    showToast(`更新下载失败: ${e}`)
    autoUpdateDownloading.value = false
  }
}

// ── 插入扩展组件 ──
const confirmLoadVisible = ref(false)

// ── 云端文章关联 ──
const {
  currentCloudArticleId,
  persistedCloudTitle,
  treeData,
  selectedNode: cloudSelectedNode,
  restoreCloudArticlePersistence,
  setCloudArticle,
  matchCloudArticle,
  expandAncestors,
  clearCloudArticlePersistence,
  articleStorageMode,
  isConfigured: cloudTreeConfigured,
  selectNode: selectTreeNode,
} = useGitHubTree()

// 是否已配置（local 模式始终 true，github 模式需要 token+repo）
const cloudConfigured = computed(() => cloudTreeConfigured.value)

// ── 草稿功能 ──
const extractedTitle = computed(() => extractTitle(markdown.value) || '')

const {
  draftListVisible,
  saveDraftVisible,
  finalizeVisible,
  finalizeDeleteConfirmVisible,
  pushToCloudDeleteConfirmVisible,
  drafts,
  currentDraftId,
  draftConfirmVisible,
  draftConfirmTitle,
  draftConfirmMessage,
  draftConfirmType,
  draftConfirmText,
  confirmOverwriteVisible,
  confirmOverwriteMode,
  pendingDraftTitle,
  draftCount,
  currentDraftTitle,
  refreshDrafts,
  matchExistingDraft,
  handleOpenSaveDraft,
  handleSaveDraft,
  handleOverwrite,
  handleSaveAsNew,
  handleCancelOverwrite,
  onDraftConfirmLoad,
  onDraftConfirmDelete,
  onDraftConfirm,
  handleOpenFinalize,
  handleFinalize,
  handleDeleteAfterFinalize,
  handlePushCloudDeleteConfirm,
} = useDraft(
  markdown,
  showToast,
  extractedTitle,
  resetMinimap,
  currentCloudArticleId,
  matchCloudArticle,
)

// currentCloudArticleTitle：优先用 selectedNode 的 title（已选中时），
// 否则回退到 persistedCloudTitle（由 useGitHubTree 在 setCloudArticle/restore 时同步）
const currentCloudArticleTitle = computed(() => {
  if (!currentCloudArticleId.value) return ''
  if (cloudSelectedNode.value?.id === currentCloudArticleId.value) {
    return cloudSelectedNode.value.title
  }
  return persistedCloudTitle.value
})

const {
  wechatPublishVisible,
  wechatMediaId,
  wechatCoverMediaId,
  handlePublishToWechat,
  handleWechatSaved,
} = useWechatPublish(
  markdown,
  extractedTitle,
  currentDraftId,
  showToast,
  settingsVisible,
  settingsInitialTab,
)

// ── 素材 ──
const {
  showMaterialPanel,
  saveMaterialVisible,
  confirmMaterialOverwriteVisible,
  pendingMaterial,
  pendingOverwriteMaterialName,
  onMaterialAction,
  handleOpenSaveMaterial,
  handleSaveMaterial,
  handleMaterialOverwrite,
  handleMaterialSaveAsNew,
  handleCancelMaterialOverwrite,
  handleInsertMaterial,
} = useMaterial(markdown, showToast, editorRef)

// ── 命令面板（⌘K）：检索草稿 / 云文章 / 本地文章 / 素材 ──
const paletteVisible = ref(false)
const paletteLoading = ref(false)
const paletteShortcut = useSetting<string>('commandPaletteShortcut')

/** 四类数据的统一结果集，打开时重建 */
const paletteItems = ref<PaletteItem[]>([])

/** 提示条右侧显示的快捷键文案（按平台渲染） */
const paletteShortcutText = computed(() => displayPaletteShortcut(paletteShortcut.value))

/**
 * 解析配置里的快捷键，失败时回退默认值。
 *
 * 旧版本在 macOS 上会把 Option 组合字符（`˚`）存进配置，
 * parseShortcut 判定为无效，这里统一兜底成默认快捷键，避免面板唤不起来。
 */
function resolvePaletteShortcut(raw: string): ShortcutSpec | null {
  return parseShortcut(raw) ?? parseShortcut(DEFAULT_PALETTE_SHORTCUT)
}

function displayPaletteShortcut(raw: string): string {
  const spec = resolvePaletteShortcut(raw)
  if (!spec) return raw
  return shortcutDisplay(
    spec,
    isMac(),
    modKeyLabel(),
    ctrlKeyLabel(),
    altKeyLabel(),
    shiftKeyLabel(),
  )
}

/**
 * 汇总四类数据源。
 *
 * 文章（云/本地）都取当前树结构里的节点 —— 树数据由 useGitHubTree 按
 * articleStorageMode 决定指向 GitHub 还是本地，所以这里只需读 treeData。
 * 全部按标题检索，不读正文。
 *
 * 只在用户首次输入关键词时才调用（见 onPaletteSearch）：打开面板本身
 * 不加载数据，避免每次唤起都读一遍 IndexedDB。
 */
async function loadPaletteItems() {
  paletteLoading.value = true
  const items: PaletteItem[] = []

  try {
    // 本地草稿
    const drafts = await DraftStorage.list()
    for (const d of drafts) {
      if (d.id === undefined) continue
      items.push({
        kind: 'draft',
        id: String(d.id),
        title: d.title || '未命名草稿',
        meta: formatPaletteDate(d.updatedAt),
        updatedAt: d.updatedAt,
      })
    }
  } catch (e) {
    console.error('[palette] 载入草稿失败', getErrorMessage(e))
  }

  try {
    // 素材
    const materials = await MaterialStorage.list()
    for (const m of materials) {
      items.push({
        kind: 'material',
        id: m.id,
        title: m.name || '未命名素材',
        meta: m.category,
        updatedAt: m.updatedAt,
      })
    }
  } catch (e) {
    console.error('[palette] 载入素材失败', getErrorMessage(e))
  }

  // 文章：云 / 本地取决于当前存储方式
  const articleKind: PaletteKind = articleStorageMode.value === 'local' ? 'local' : 'cloud'
  for (const node of treeData.value) {
    if (node.type !== 'article') continue
    items.push({
      kind: articleKind,
      id: node.id,
      title: node.title || '未命名文章',
      meta: findPaletteParentTitle(node.parentId),
      updatedAt: node.updatedAt,
    })
  }

  paletteItems.value = items
  paletteLoading.value = false
}

/** 用父节点标题作为次要信息，方便区分同名文章 */
function findPaletteParentTitle(parentId: string | null): string | undefined {
  if (!parentId) return undefined
  return treeData.value.find((n) => n.id === parentId)?.title
}

function formatPaletteDate(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined
  const t = typeof v === 'number' ? v : Date.parse(v)
  if (!Number.isFinite(t)) return undefined
  const d = new Date(t)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`
}

/** 打开面板：不加载数据，只显示输入框、分类筛选与最近搜索 */
function openPalette() {
  paletteVisible.value = true
}

function closePalette() {
  paletteVisible.value = false
}

/**
 * 用户首次输入关键词时才拉取数据，拉过一次就复用缓存。
 * 每次打开面板会清空缓存（见下方 watch），保证数据不会长期过期。
 */
let paletteLoaded = false
async function onPaletteSearch() {
  if (paletteLoaded) return
  await loadPaletteItems()
  paletteLoaded = true
}

// 每次打开都重置缓存，下次输入时重新拉取
watch(paletteVisible, (v) => {
  if (v) paletteLoaded = false
})

/** 执行结果项：文章/草稿走「编辑」，素材走「插入」 */
async function onPaletteActivate(item: PaletteItem) {
  closePalette()

  if (item.kind === 'material') {
    const material = await MaterialStorage.get(item.id)
    if (material) handleInsertMaterial(material)
    else showToast('素材已不存在')
    return
  }

  if (item.kind === 'draft') {
    // 复用草稿列表的「重新编辑」确认流程，避免直接覆盖未保存内容
    onDraftConfirmLoad({ draftId: Number(item.id), title: item.title })
    return
  }

  // 云 / 本地文章：与文章树点击一致，先取正文再走统一的加载确认
  const node = treeData.value.find((n) => n.id === item.id)
  if (!node) {
    showToast('文章已不存在')
    return
  }
  const content = await selectTreeNode(node)
  if (content === null) {
    showToast('加载文章失败')
    return
  }
  onTreeEditArticle(content, node)
}

/**
 * 全局快捷键监听。
 *
 * CodeMirror 的 keymap 只在编辑器聚焦时生效，而命令面板需要在
 * 编辑器、预览区、侧栏任意位置都能唤起，所以用 window 级监听。
 */
function onPaletteGlobalKeydown(e: KeyboardEvent) {
  const spec = resolvePaletteShortcut(paletteShortcut.value)
  if (!spec) return
  if (!matchShortcut(spec, e, isMac())) return
  e.preventDefault()
  // 已打开时再按一次关闭，与查找面板的切换手感一致
  paletteVisible.value ? closePalette() : openPalette()
}

// ── Toolbar（表格插入、布局插入、组件对话框、标签解析）──
const {
  tableGridHovered,
  insertTable,
  getGridCellClass,
  isGridCellActive,
  colGridHovered,
  rowGridHovered,
  isColCellActive,
  isRowCellActive,
  resetGridSelection,
  insertColumnLayout,
  insertColumnStack,
  insertRowStack,
  insertContainer,
  insertHtmlContainer,
  insertText,
  insertStack,
  componentDialogVisible,
  tagInfo,
  showTagDialog,
  onTagSelected,
  onTagDialogUpdate,
} = useToolbar(editorRef)

// ── Toast ──
const toastVisible = ref(false)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 1500)
}

// ── 插入图片 ──
const {
  imageInputRef,
  persistImageInputRef,
  githubImageInputRef,
  diskImageInputRef,
  githubUploading,
  githubUploadProgress,
  uploadHostingLabel,
  handleInsertImage,
  onImageSelected,
  handleInsertImagePersist,
  onImagePersistSelected,
  handlePasteImage,
  handlePasteMultipleImages,
  handleDropImage,
  handleDropMultipleImages,
  handleDropNonImage,
  handleUploadToGitHub,
  onGithubImageSelected,
  handleUploadToDisk,
  onDiskImageSelected,
} = useImageInsert(editorRef, showToast, markdown)

const imageMenuOpen = ref(false)
let imageMenuTimer: ReturnType<typeof setTimeout> | undefined

function openImageMenu() {
  clearTimeout(imageMenuTimer)
  imageMenuOpen.value = true
  uploadHostingLabel.value =
    getSetting<string>('defaultHosting') === 'leta' ? '乐塔图床' : 'GitHub 图床'
}

function closeImageMenu() {
  imageMenuTimer = setTimeout(() => {
    imageMenuOpen.value = false
  }, 150)
}

// ── 导入 ──
const { onImportClick } = useImport(
  markdown,
  showToast,
  currentDraftId,
  matchExistingDraft,
  currentCloudArticleId,
  matchCloudArticle,
)

/** TagPropsForm 关闭：重置弹窗可见性与编辑中的标签信息 */
function onTagDialogClose() {
  showTagDialog.value = false
  tagInfo.value = null
}

/** 双击草稿图标：取消当前草稿关联 */
function onUnlinkDraft() {
  if (!currentDraftId.value) return
  currentDraftId.value = null
  showToast('已取消草稿关联')
}

/** 双击关联图标：取消当前仓库/本地文章关联 */
function onUnlinkCloudArticle() {
  if (!currentCloudArticleId.value) return
  currentCloudArticleId.value = null
  clearCloudArticlePersistence()
  showToast(articleStorageMode.value === 'local' ? '已取消本地文章关联' : '已取消仓库文章关联')
}

/** SettingsDialog 关闭：关闭弹窗并刷新树配置状态（含模式切换） */
function onSettingsClose() {
  settingsVisible.value = false
  // checkConfig 内部会同步 articleStorageMode 并按需重载树
  useGitHubTree().checkConfig()
}

function onPasteText() {
  // currentDraftId.value = null
  // currentCloudArticleId.value = null
  // clearCloudArticlePersistence()
  setTimeout(() => {
    matchExistingDraft()
    matchCloudArticle(extractTitle(markdown.value))
  }, 300)
}

function onUndoRedo() {
  // currentDraftId.value = null
  // currentCloudArticleId.value = null
  // clearCloudArticlePersistence()
  setTimeout(() => {
    matchExistingDraft()
    matchCloudArticle(extractTitle(markdown.value))
  }, 300)
}

// ── 标签解析表单（合并在下方 useToolbar 调用中）──

const {
  savedTime: _savedTime,
  saveMode,
  saveHint,
  saveContent,
  formatTime,
  onInput,
} = useAutoSave(markdown, autoSaveEnabled, autoSaveInterval, isMobile, saveBase64Store)

const { handleCopyRichText, handleExportHTML, handleSaveImage, onDropdownSelect } = useExport(
  extractedTitle,
  previewRef,
  showToast,
  xhsVisible,
)

function onExampleAction(action: string) {
  if (action === 'load') confirmLoadVisible.value = true
}

// ── Markdown 自动加载 ──
function loadDemo() {
  clearBase64Store()
  currentDraftId.value = null
  currentCloudArticleId.value = null
  clearCloudArticlePersistence()
  markdown.value = DEMO_CONTENT
  localStorage.setItem(STORAGE_KEY, DEMO_CONTENT)
  const now = new Date()
  const timeStr =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0') +
    ':' +
    String(now.getSeconds()).padStart(2, '0')
  localStorage.setItem(SAVE_TIME_KEY, timeStr)
  saveMode.value = '自动'
  saveHint.value = '自动保存于 ' + formatTime(timeStr)
  setTimeout(() => matchExistingDraft(), 300)
}
</script>

<template>
  <div class="flex flex-col h-screen">
    <!-- Toolbar -->
    <div class="toolbar flex items-center justify-between px-4 py-2 shrink-0">
      <div class="flex items-center min-w-0">
        <router-link
          to="/"
          class="flex items-center text-sm font-semibold tracking-tight no-underline"
          style="color: var(--text-primary)"
        >
          <svg class="shrink-0 mr-1.5" viewBox="0 0 24 24" width="26" height="26">
            <rect width="24" height="24" rx="6" :fill="accent" />
            <text
              x="3.5"
              y="16"
              font-family="Arial, sans-serif"
              font-size="11"
              font-weight="bold"
              fill="white"
            >
              RM
            </text>
          </svg>
          <span class="hidden sm:inline">R-Markdown 编辑器</span>
          <span
            class="hidden sm:inline-flex flex-col ml-0.5"
            style="font-size: 0.55em; vertical-align: super; line-height: 1.1"
          >
            <span class="opacity-60">for 公众号</span>
            <span class="opacity-50">v{{ pkg.version }}</span>
          </span>
          <span class="sm:hidden">R-Markdown</span>
        </router-link>
        <span class="hidden sm:inline text-[11px] opacity-50 ml-1.5 shrink-0">{{ saveHint }}</span>
        <CircleCheck
          v-if="saveMode"
          :size="14"
          color="var(--accent)"
          class="hidden sm:inline shrink-0 ml-1"
        />
        <span class="sm:hidden text-[11px] opacity-50 ml-2 shrink-0">{{ saveHint }}</span>
        <CircleCheck
          v-if="saveMode"
          :size="14"
          color="var(--accent)"
          class="sm:hidden shrink-0 ml-1"
        />
        <BaseTooltip
          v-if="currentDraftId"
          class="inline-flex ml-1"
          :text="'已关联草稿：' + currentDraftTitle + '（双击取消关联）'"
          placement="bottom"
        >
          <SquareBottomDashedScissors
            :size="14"
            class="w-3.5 h-3.5 shrink-0 cursor-pointer"
            :style="{ color: colors.accent }"
            @dblclick="onUnlinkDraft"
          />
        </BaseTooltip>
        <BaseTooltip
          v-if="currentCloudArticleId"
          class="inline-flex ml-1"
          :text="
            (articleStorageMode === 'local' ? '已关联本地文章：' : '已关联仓库文章：') +
            currentCloudArticleTitle +
            '（双击取消关联）'
          "
          placement="bottom"
        >
          <Cloud
            v-if="articleStorageMode === 'github'"
            :size="14"
            class="w-3.5 h-3.5 shrink-0 cursor-pointer"
            :style="{ color: colors.accent }"
            @dblclick="onUnlinkCloudArticle"
          />
          <HardDrive
            v-else
            :size="14"
            class="w-3.5 h-3.5 shrink-0 cursor-pointer"
            :style="{ color: colors.accent }"
            @dblclick="onUnlinkCloudArticle"
          />
        </BaseTooltip>
      </div>
      <div class="flex items-center gap-1.5">
        <!-- 桌面端：显示所有按钮 -->
        <Dropdown
          group-id="export"
          label="导出"
          :icon-trigger="Download"
          :items="exportItems"
          @select="(action: string) => onDropdownSelect('export', action)"
        />
        <button
          class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white active:scale-[0.97]"
          @click="handleOpenSaveMaterial"
        >
          <Package :size="14" />
          保存素材
        </button>
        <button
          v-if="isTauri"
          class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white active:scale-[0.97]"
          @click="handlePublishToWechat"
        >
          <Send :size="14" />
          存到公众号
        </button>
        <button
          class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] active:scale-[0.97]"
          @click="handleCopyRichText"
        >
          <Copy :size="14" />
          复制到公众号
        </button>
        <!-- 移动端：下拉菜单 -->
        <MobileActionsMenu
          :mode="mobileTab"
          @load-demo="confirmLoadVisible = true"
          @export-html="handleExportHTML"
          @save-image="handleSaveImage"
          @copy-rich-text="handleCopyRichText"
          @export-xhs="xhsVisible = true"
          @go-components="$router.push('/components')"
        />
        <ThemePicker
          :themes="themes"
          :current-accent="accent"
          :custom-color="customColor"
          @select="setTheme"
          @custom-select="setCustomTheme"
        />
      </div>
    </div>

    <!-- Main Layout -->
    <!-- 移动端：底部悬浮胶囊 Tab（始终显示） -->
    <div
      class="mobile-tab-bar md:hidden"
      :style="{
        '--accent': accent,
        '--pill-bg': isDark ? 'rgba(30, 30, 30, 0.45)' : 'rgba(245, 245, 247, 0.45)',
        '--pill-shadow': isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.08)',
        '--pill-shadow-sm': isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
        '--pill-inset': isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.4)',
        '--pill-text': isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
      }"
    >
      <div class="mobile-tab-pill">
        <div class="mobile-tab-highlight" :class="mobileTab === 'preview' ? 'right' : 'left'"></div>
        <button
          class="mobile-tab-btn"
          :class="{ active: mobileTab === 'editor' }"
          @click="mobileTab = 'editor'"
        >
          <SquarePen :size="16" />
          编辑
        </button>
        <button
          class="mobile-tab-btn"
          :class="{ active: mobileTab === 'preview' }"
          @click="mobileTab = 'preview'"
        >
          <Smartphone :size="16" />
          预览
        </button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <div
        class="flex flex-1 overflow-hidden"
        :style="{ padding: isMobile ? '0px' : '10px', background: 'var(--bg-frame)' }"
      >
        <!-- 桌面端左侧侧栏 -->
        <div class="hidden md:flex shrink-0">
          <EditorSidebar
            :active-tab="sidebarTab"
            :draft-count="draftCount"
            :tree-panel-visible="treePanelVisible"
            @select="onSidebarSelect"
            @open-settings="settingsVisible = true"
            @open-gallery="showGallery = true"
            @open-banned-words="bannedWordsVisible = true"
            @material-action="onMaterialAction"
            @open-components="$router.push('/components')"
            @open-drafts="draftListVisible = true"
            @example-action="onExampleAction"
            @open-import="onImportClick"
            @toggle-tree-panel="onToggleTreePanel"
          />
        </div>
        <!-- Tree Panel -->
        <Transition name="tree-panel">
          <div
            v-if="treePanelVisible"
            :style="{ width: treePanelWidth + 'px' }"
            class="overflow-hidden"
          >
            <TreeSidebar
              @open-settings="onSettingsOpen"
              @edit-article="onTreeEditArticle"
              @toast="showToast"
              @clear-editor="onClearEditor"
            />
          </div>
        </Transition>
        <!-- Tree Resize Handle -->
        <div
          v-if="treePanelVisible"
          ref="treeResizeHandleRef"
          class="resize-handle shrink-0 hidden md:block"
          @mousedown="onTreeDragStart"
          @mouseenter="onTreeHandleEnter"
          @mousemove="onTreeHandleMove"
          @mouseleave="onTreeHandleLeave"
        >
          <div
            class="resize-handle-btn"
            :class="{ 'resize-handle-btn--visible': treeHandleBtnVisible }"
            :style="{ top: treeHandleBtnTop + 'px' }"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="17 8 21 12 17 16" />
              <polyline points="7 8 3 12 7 16" />
            </svg>
          </div>
        </div>
        <!-- Editor Panel -->
        <div
          class="flex flex-col overflow-x-hidden flex-1 min-w-0 relative"
          style="background: var(--bg-primary)"
          :class="{
            'hidden md:flex': mobileTab !== 'editor',
            'mobile-near-bottom': nearBottom && isMobile,
            'rounded-xl': !isMobile,
          }"
        >
          <div
            class="panel-header hidden md:flex items-center gap-x-2 px-2 py-2 border-b text-xs font-semibold shrink-0"
            style="background: var(--bg-primary)"
          >
            <span class="flex flex-wrap items-center gap-2 flex-auto min-w-0">
              <!-- 操作按钮组：图标+文字 -->
              <span class="flex flex-wrap items-center gap-1">
                <!-- 基础语法 -->
                <span class="relative inline-flex items-center group">
                  <button
                    class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium whitespace-nowrap"
                    :class="
                      editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                    "
                    :disabled="!editorRef?.isAtLineStart"
                  >
                    <component
                      :is="markdownInsertOptions[1].icon"
                      :size="14"
                      class="w-3.5 h-3.5"
                      :style="{ color: colors.accent }"
                    />
                    <span>基础</span>
                  </button>
                  <span
                    class="absolute top-full left-0 mt-0.5 py-1 min-w-[120px] rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50"
                    :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                  >
                    <template v-for="opt in markdownInsertOptions" :key="opt.label">
                      <div
                        v-if="opt.table"
                        class="relative"
                        :class="
                          editorRef?.isAtLineStart ? 'group/table' : 'cursor-not-allowed opacity-40'
                        "
                        @mouseenter="resetGridSelection"
                      >
                        <div class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none">
                          <component
                            :is="opt.icon"
                            :size="14"
                            class="w-3.5 h-3.5 flex-shrink-0"
                            :style="{ color: colors.accent }"
                          />
                          <span class="text-[#333] dark:text-white font-medium">表格</span>
                          <span class="text-[#999] dark:text-white/40 ml-auto">{{
                            opt.label
                          }}</span>
                        </div>
                        <div
                          class="absolute left-full top-0 ml-1 p-2 rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover/table:opacity-100 group-hover/table:visible transition-all duration-150 z-50"
                          :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                        >
                          <div
                            class="grid gap-0.5"
                            :style="{ gridTemplateColumns: `repeat(${MAX_GRID_COLS}, 22px)` }"
                          >
                            <button
                              v-for="i in MAX_GRID_ROWS * MAX_GRID_COLS"
                              :key="i"
                              class="w-[22px] h-[22px] rounded-[3px] border cursor-pointer transition-colors duration-75"
                              :class="getGridCellClass(i)"
                              :style="
                                isGridCellActive(i)
                                  ? {
                                      borderColor: colors.accent,
                                      backgroundColor: colors.accent + '20',
                                    }
                                  : {}
                              "
                              :disabled="!editorRef?.isAtLineStart"
                              @mousemove="
                                editorRef?.isAtLineStart &&
                                (tableGridHovered = {
                                  rows: Math.ceil(i / MAX_GRID_COLS),
                                  cols: ((i - 1) % MAX_GRID_COLS) + 1,
                                })
                              "
                              @click="
                                editorRef?.isAtLineStart &&
                                insertTable(tableGridHovered.rows, tableGridHovered.cols)
                              "
                            />
                          </div>
                          <div
                            class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none"
                          >
                            {{
                              tableGridHovered.rows === 0
                                ? '选择行列'
                                : `${tableGridHovered.rows} 行 × ${tableGridHovered.cols} 列`
                            }}
                          </div>
                        </div>
                      </div>
                      <button
                        v-else
                        class="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] leading-none text-left whitespace-nowrap border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100 cursor-pointer"
                        :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                        :disabled="!editorRef?.isAtLineStart"
                        @click="editorRef?.isAtLineStart && editorRef?.insertAtCursor(opt.syntax)"
                      >
                        <component
                          :is="opt.icon"
                          :size="14"
                          class="w-3.5 h-3.5 flex-shrink-0"
                          :style="{ color: colors.accent }"
                        />
                        <span class="text-[#333] dark:text-white font-medium">{{
                          opt.display
                        }}</span>
                        <span class="text-[#999] dark:text-white/40 ml-auto">{{ opt.label }}</span>
                      </button>
                    </template>
                  </span>
                </span>
                <!-- 容器/布局 -->
                <span class="relative inline-flex items-center group">
                  <button
                    class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium whitespace-nowrap"
                    :class="
                      editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                    "
                    :disabled="!editorRef?.isAtLineStart"
                  >
                    <Box :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                    <span>容器</span>
                  </button>
                  <span
                    class="absolute top-full left-0 mt-0.5 py-1 min-w-[100px] rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50"
                    :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                  >
                    <!-- 列 -->
                    <div
                      class="relative"
                      :class="
                        editorRef?.isAtLineStart ? 'group/col' : 'cursor-not-allowed opacity-40'
                      "
                      @mouseenter="resetGridSelection"
                    >
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap"
                      >
                        <Columns2
                          :size="14"
                          class="w-3.5 h-3.5 flex-shrink-0"
                          :style="{ color: colors.accent }"
                        />
                        <span class="text-[#333] dark:text-white font-medium">列</span>
                        <span class="text-[#999] dark:text-white/40 ml-auto">水平分栏</span>
                      </div>
                      <div
                        class="absolute left-full top-0 ml-1 p-2 rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover/col:opacity-100 group-hover/col:visible transition-all duration-150 z-50"
                        :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                      >
                        <div class="flex gap-0.5">
                          <button
                            v-for="i in MAX_COLS"
                            :key="i"
                            class="w-[28px] h-[28px] rounded-[3px] border cursor-pointer transition-colors duration-75"
                            :class="
                              isColCellActive(i)
                                ? ''
                                : 'border-[#d0d0d0] dark:border-white/15 bg-transparent'
                            "
                            :style="
                              isColCellActive(i)
                                ? {
                                    borderColor: colors.accent,
                                    backgroundColor: colors.accent + '20',
                                  }
                                : {}
                            "
                            :disabled="!editorRef?.isAtLineStart"
                            @mousemove="editorRef?.isAtLineStart && (colGridHovered = i)"
                            @click="editorRef?.isAtLineStart && insertColumnLayout(colGridHovered)"
                          />
                        </div>
                        <div
                          class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none"
                        >
                          {{ colGridHovered === 0 ? '选择列数' : `${colGridHovered} 列均分` }}
                        </div>
                      </div>
                    </div>
                    <!-- 列（独立，无 Row 包裹） -->
                    <div
                      class="relative"
                      :class="
                        editorRef?.isAtLineStart
                          ? 'group/colstack'
                          : 'cursor-not-allowed opacity-40'
                      "
                      @mouseenter="resetGridSelection"
                    >
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap"
                      >
                        <Columns2
                          :size="14"
                          class="w-3.5 h-3.5 flex-shrink-0"
                          :style="{ color: colors.accent }"
                        />
                        <span class="text-[#333] dark:text-white font-medium">列堆叠</span>
                        <span class="text-[#999] dark:text-white/40 ml-auto">独立排列</span>
                      </div>
                      <div
                        class="absolute left-full top-0 ml-1 p-2 rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover/colstack:opacity-100 group-hover/colstack:visible transition-all duration-150 z-50"
                        :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                      >
                        <div class="flex gap-0.5">
                          <button
                            v-for="i in MAX_COLS"
                            :key="i"
                            class="w-[28px] h-[28px] rounded-[3px] border cursor-pointer transition-colors duration-75"
                            :class="
                              isColCellActive(i)
                                ? ''
                                : 'border-[#d0d0d0] dark:border-white/15 bg-transparent'
                            "
                            :style="
                              isColCellActive(i)
                                ? {
                                    borderColor: colors.accent,
                                    backgroundColor: colors.accent + '20',
                                  }
                                : {}
                            "
                            :disabled="!editorRef?.isAtLineStart"
                            @mousemove="editorRef?.isAtLineStart && (colGridHovered = i)"
                            @click="editorRef?.isAtLineStart && insertColumnStack(colGridHovered)"
                          />
                        </div>
                        <div
                          class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none"
                        >
                          {{ colGridHovered === 0 ? '选择列数' : `${colGridHovered} 列独立` }}
                        </div>
                      </div>
                    </div>
                    <!-- 行 -->
                    <div
                      class="relative"
                      :class="
                        editorRef?.isAtLineStart ? 'group/row' : 'cursor-not-allowed opacity-40'
                      "
                      @mouseenter="resetGridSelection"
                    >
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap"
                      >
                        <Rows2
                          :size="14"
                          class="w-3.5 h-3.5 flex-shrink-0"
                          :style="{ color: colors.accent }"
                        />
                        <span class="text-[#333] dark:text-white font-medium">行</span>
                        <span class="text-[#999] dark:text-white/40 ml-auto">纵向堆叠</span>
                      </div>
                      <div
                        class="absolute left-full top-0 ml-1 p-2 rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover/row:opacity-100 group-hover/row:visible transition-all duration-150 z-50"
                        :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                      >
                        <div class="flex flex-col gap-1">
                          <button
                            v-for="i in MAX_ROWS"
                            :key="i"
                            class="w-[80px] h-[20px] rounded-[3px] border cursor-pointer transition-colors duration-75"
                            :class="
                              isRowCellActive(i)
                                ? ''
                                : 'border-[#d0d0d0] dark:border-white/15 bg-transparent'
                            "
                            :style="
                              isRowCellActive(i)
                                ? {
                                    borderColor: colors.accent,
                                    backgroundColor: colors.accent + '20',
                                  }
                                : {}
                            "
                            :disabled="!editorRef?.isAtLineStart"
                            @mousemove="editorRef?.isAtLineStart && (rowGridHovered = i)"
                            @click="editorRef?.isAtLineStart && insertRowStack(rowGridHovered)"
                          />
                        </div>
                        <div
                          class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none"
                        >
                          {{ rowGridHovered === 0 ? '选择行数' : `${rowGridHovered} 行纵向堆叠` }}
                        </div>
                      </div>
                    </div>
                    <!-- 层叠 -->
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      @click="editorRef?.isAtLineStart && insertStack()"
                    >
                      <Layers
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">层叠</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">多层叠加</span>
                    </div>
                    <!-- 容器 -->
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      @click="editorRef?.isAtLineStart && insertContainer()"
                    >
                      <Package
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">块容器</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">通用包裹</span>
                    </div>
                    <!-- 文本 -->
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      @click="editorRef?.isAtLineStart && insertText()"
                    >
                      <Type
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">文本</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">样式文字</span>
                    </div>
                    <!-- HTML 容器 -->
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      @click="editorRef?.isAtLineStart && insertHtmlContainer()"
                    >
                      <Code2
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">HTML 容器</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">内联样式</span>
                    </div>
                  </span>
                </span>
                <span
                  class="relative inline-flex items-center"
                  @mouseenter="openImageMenu"
                  @mouseleave="closeImageMenu"
                >
                  <button
                    class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium whitespace-nowrap"
                    :class="
                      editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                    "
                    :disabled="!editorRef?.isAtLineStart"
                  >
                    <Image :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                    <span>图片</span>
                  </button>
                  <span
                    v-show="imageMenuOpen"
                    class="absolute top-full left-0 mt-0.5 py-1 min-w-[120px] rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 transition-all duration-150 z-50"
                    :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                  >
                    <button
                      class="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] leading-none text-left whitespace-nowrap border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100 cursor-pointer"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      :disabled="!editorRef?.isAtLineStart"
                      @click="editorRef?.isAtLineStart && handleInsertImage()"
                    >
                      <Image
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">临时存储</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">本地临时图片</span>
                    </button>
                    <button
                      class="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] leading-none text-left whitespace-nowrap border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100 cursor-pointer"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      :disabled="!editorRef?.isAtLineStart"
                      @click="editorRef?.isAtLineStart && handleInsertImagePersist()"
                    >
                      <ImagePlus
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">长期存储</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">本地长期图片</span>
                    </button>
                    <button
                      v-if="isTauri"
                      class="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] leading-none text-left whitespace-nowrap border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100 cursor-pointer"
                      :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                      :disabled="!editorRef?.isAtLineStart"
                      @click="editorRef?.isAtLineStart && handleUploadToDisk()"
                    >
                      <HardDrive
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">磁盘存储</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">本地磁盘图片</span>
                    </button>
                    <button
                      class="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] leading-none text-left whitespace-nowrap border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100"
                      :class="
                        !editorRef?.isAtLineStart || githubUploading
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-pointer'
                      "
                      :disabled="!editorRef?.isAtLineStart || githubUploading"
                      @click="
                        editorRef?.isAtLineStart && !githubUploading && handleUploadToGitHub()
                      "
                    >
                      <ImageUp
                        :size="14"
                        class="w-3.5 h-3.5 flex-shrink-0"
                        :style="{ color: colors.accent }"
                      />
                      <span class="text-[#333] dark:text-white font-medium">上传图床</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">{{
                        githubUploading ? '上传中...' : uploadHostingLabel
                      }}</span>
                    </button>
                  </span>
                </span>
                <BaseTooltip text="插入组件">
                  <button
                    class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium whitespace-nowrap"
                    :class="
                      editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                    "
                    :disabled="!editorRef?.isAtLineStart"
                    @click="editorRef?.isAtLineStart && (componentDialogVisible = true)"
                  >
                    <Puzzle :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                    <span>组件</span>
                  </button>
                </BaseTooltip>
                <BaseTooltip
                  :text="
                    tagInfo
                      ? '解析 <' + tagInfo.tagName + '> 属性'
                      : '解析标签 — 选中组件标签或光标在标签后可用'
                  "
                >
                  <button
                    class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium whitespace-nowrap"
                    :class="
                      tagInfo && !showTagDialog && !isMobile
                        ? 'cursor-pointer'
                        : 'cursor-not-allowed opacity-40'
                    "
                    :disabled="!tagInfo || showTagDialog || isMobile"
                    @click="tagInfo && !showTagDialog && !isMobile && (showTagDialog = true)"
                  >
                    <Braces :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                    <span>解析</span>
                  </button>
                </BaseTooltip>
                <!-- 行内样式按钮组 -->
                <BaseTooltip
                  v-for="opt in inlineFormatOptions"
                  :key="opt.syntax"
                  :text="opt.label + '：' + opt.hint"
                >
                  <button
                    class="inline-flex items-center justify-center w-7 h-7 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn"
                    :class="
                      editorRef?.hasInlineSelection
                        ? 'cursor-pointer'
                        : 'cursor-not-allowed opacity-40'
                    "
                    :disabled="!editorRef?.hasInlineSelection"
                    @click="
                      editorRef?.hasInlineSelection &&
                      editorRef?.applyInlineFormat(opt.syntax, opt.wrapType ?? 'delim')
                    "
                  >
                    <component
                      :is="formatIcons[opt.syntax]"
                      :size="14"
                      class="w-3.5 h-3.5"
                      :style="{ color: colors.accent }"
                    />
                  </button>
                </BaseTooltip>
                <!-- 帮助提示 -->
                <BaseTooltip placement="bottom">
                  <CircleQuestionMark :size="14" />
                  <template #content>
                    选中非标签内文字后可加样式<br />基础/语法/图片/组件：仅空行可点击<br />解析：选中组件标签或光标在标签后可点击。
                  </template>
                </BaseTooltip>
              </span>
            </span>
            <span
              class="flex flex-row flex-wrap items-center justify-end gap-1 ml-auto shrink min-w-[152px]"
            >
              <BaseTooltip v-if="isTauri && !autoSaveEnabled" text="暂存">
                <button
                  class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  @click="saveContent(markdown, true)"
                >
                  <Save :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                  <span>暂存</span>
                </button>
              </BaseTooltip>
              <BaseTooltip text="保存草稿">
                <button
                  class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  @click="handleOpenSaveDraft"
                >
                  <SquareBottomDashedScissors
                    :size="14"
                    class="w-3.5 h-3.5"
                    :style="{ color: colors.accent }"
                  />
                  <span>草稿</span>
                </button>
              </BaseTooltip>
              <BaseTooltip text="本地导出">
                <button
                  class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  @click="handleOpenFinalize"
                >
                  <CheckCircle :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                  <span>定稿</span>
                </button>
              </BaseTooltip>
              <BaseTooltip
                v-if="cloudConfigured"
                :text="articleStorageMode === 'local' ? '保存到本地' : '推送到远程仓库'"
              >
                <button
                  class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  @click="pushCloudVisible = true"
                >
                  <Cloud
                    v-if="articleStorageMode === 'github'"
                    :size="14"
                    class="w-3.5 h-3.5"
                    :style="{ color: colors.accent }"
                  />
                  <HardDrive
                    v-else
                    :size="14"
                    class="w-3.5 h-3.5"
                    :style="{ color: colors.accent }"
                  />
                  <span>{{ articleStorageMode === 'local' ? '本地' : '仓库' }}</span>
                </button>
              </BaseTooltip>
              <BaseTooltip :text="findVisible ? '关闭查找' : findReplaceTooltip">
                <button
                  class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  @click="toggleFind"
                >
                  <Search :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                  <span :style="findVisible ? { color: colors.accent } : undefined">查找</span>
                </button>
              </BaseTooltip>
              <BaseTooltip
                v-if="outlineEnabled"
                :text="outlinePanelVisible ? '隐藏大纲' : '显示大纲'"
              >
                <button
                  class="inline-flex items-center gap-1 h-7 px-1 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
                  @click="onToggleOutline"
                >
                  <ListTree :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                  <span :style="outlinePanelVisible ? { color: colors.accent } : undefined"
                    >大纲</span
                  >
                </button>
              </BaseTooltip>
            </span>
          </div>
          <!-- 图床上传进度 -->
          <div
            v-if="githubUploading"
            class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl bg-[#111] text-white text-sm shadow-lg"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span>正在上传到 {{ uploadHostingLabel }}...</span>
              <span class="font-medium text-[var(--accent)]">{{ githubUploadProgress }}%</span>
            </div>
            <div class="h-1 w-48 rounded-full bg-[#444] overflow-hidden">
              <div
                class="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                :style="{ width: githubUploadProgress + '%' }"
              />
            </div>
          </div>
          <!-- data-find-anchor：查找面板 Teleport 到 body 后靠它定位默认位置 -->
          <div class="flex flex-1 overflow-hidden relative" data-find-anchor>
            <Editor
              ref="editorRef"
              class="flex-1"
              :model-value="markdown"
              @update:model-value="onInput"
              @scroll="onEditorScrollAll"
              @tag-selected="onTagSelected"
              @paste-image="handlePasteImage"
              @paste-multiple-images="handlePasteMultipleImages"
              @paste-text="onPasteText"
              @undo-redo="onUndoRedo"
              @drop-image="handleDropImage"
              @drop-multiple-images="handleDropMultipleImages"
              @drop-non-image="handleDropNonImage"
              @open-find="openFind"
            />
            <input
              ref="imageInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onImageSelected"
            />
            <input
              ref="githubImageInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onGithubImageSelected"
            />
            <input
              ref="persistImageInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onImagePersistSelected"
            />
            <input
              v-if="isTauri"
              ref="diskImageInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onDiskImageSelected"
            />
            <TagPropsForm
              :visible="showTagDialog && !isMobile"
              :tag-info="tagInfo"
              @close="onTagDialogClose"
              @update="onTagDialogUpdate"
            />
            <OutlinePanel
              v-if="outlineVisible && !isMobile"
              :items="outlineItems"
              :active-line="editorCursorLine"
              @jump="onOutlineJump"
            />
            <!-- 查找替换面板：浮在编辑器右上角 -->
            <FindReplacePanel
              ref="findPanelRef"
              :visible="findVisible"
              :total="findTotal"
              :current="findCurrent"
              :invalid="findInvalid"
              @change="onFindChange"
              @next="onFindNext"
              @prev="onFindPrev"
              @replace-one="onFindReplaceOne"
              @replace-all="onFindReplaceAll"
              @close="closeFind"
            />
          </div>
          <!-- 字数统计状态栏 -->
          <div
            v-if="statusBarEnabled"
            class="hidden md:flex items-center justify-between px-3 h-7 shrink-0 border-t border-[var(--border-color)] text-[11px]"
            style="background: var(--bg-primary); color: var(--text-secondary)"
          >
            <span class="opacity-70">行 {{ editorCursorLine }}，列 {{ editorCursorCol }}</span>
            <span class="flex items-center gap-3">
              <span
                v-if="editorSelectedChars > 0"
                class="font-medium"
                :style="{ color: colors.accent }"
              >
                已选 {{ editorSelectedChars }} 字
              </span>
              <span class="opacity-70">字数 {{ statusStats.chars }}</span>
              <span class="opacity-70">约 {{ statusStats.minutes }} 分钟读完</span>
            </span>
          </div>
        </div>

        <!-- Resize Handle -->
        <div
          ref="resizeHandleRef"
          class="resize-handle hidden md:block"
          @mousedown="onDragStart"
          @mouseenter="onHandleEnter"
          @mousemove="onHandleMove"
          @mouseleave="onHandleLeave"
        >
          <div
            class="resize-handle-btn"
            :class="{ 'resize-handle-btn--visible': handleBtnVisible }"
            :style="{ top: handleBtnTop + 'px' }"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="17 8 21 12 17 16" />
              <polyline points="7 8 3 12 7 16" />
            </svg>
          </div>
        </div>

        <!-- Preview Panel -->
        <div
          class="flex flex-col overflow-hidden flex-1 md:flex-none"
          :class="{
            'hidden md:flex': mobileTab !== 'preview',
            'mobile-near-bottom': nearBottom && isMobile,
            'rounded-xl': !isMobile,
          }"
          data-theme="light"
          :style="
            isMobile
              ? { background: 'var(--bg-primary)' }
              : { width: previewWidth + 'px', background: 'var(--bg-primary)' }
          "
        >
          <Preview
            ref="previewRef"
            :markdown="resolvedMarkdown"
            :colors="colors"
            :is-mobile="isMobile"
            @click-line="onPreviewClickLine"
          />
        </div>

        <!-- Minimap -->
        <Minimap
          v-if="minimapEnabled && !isMobile"
          :markdown="resolvedMarkdown"
          :colors="colors"
          :scroll-ratio="minimapScrollRatio"
          :viewport-ratio="minimapViewportRatio"
          :preview-width="previewWidth"
          @navigate="onMinimapNavigate"
        />
      </div>
    </div>
  </div>

  <Toast :visible="toastVisible" :message="toastMessage" />
  <XhsExporter
    :visible="xhsVisible"
    :markdown="resolvedMarkdown"
    :colors="colors"
    :is-mobile="isMobile"
    @close="xhsVisible = false"
    @toast="showToast"
  />
  <ComponentPickerDialog
    :visible="componentDialogVisible"
    @close="componentDialogVisible = false"
    @insert="(code: string) => editorRef?.insertAtCursor(code)"
  />
  <SettingsDialog
    :visible="settingsVisible"
    :initial-tab="settingsInitialTab"
    @close="onSettingsClose"
    @toast="showToast"
  />
  <!-- 违禁词检测弹窗 -->
  <BannedWordsDialog
    :visible="bannedWordsVisible"
    :markdown="markdown"
    @close="bannedWordsVisible = false"
    @jump="onBannedWordsJump"
  />
  <PushToCloudDialog
    :visible="pushCloudVisible"
    :markdown="markdown"
    :current-cloud-article-id="currentCloudArticleId"
    :loading="pushingCloud"
    @close="pushCloudVisible = false"
    @push="onPushToCloud"
  />
  <PublishToWechatDialog
    :visible="wechatPublishVisible"
    :title="extractedTitle"
    :content="markdown"
    :update-media-id="wechatMediaId"
    :initial-cover-media-id="wechatCoverMediaId"
    @close="wechatPublishVisible = false"
    @saved="handleWechatSaved"
  />
  <ImageCacheDialog
    :visible="showGallery"
    mode="gallery"
    @close="showGallery = false"
    @insert="
      (payload: { kind: 'local' | 'disk'; value: string }) => {
        showGallery = false
        const src = payload.kind === 'disk' ? payload.value : `idb:${payload.value}`
        editorRef?.insertAtCursor(
          `<img src=&quot;${src}&quot; width=&quot;100%&quot; height=&quot;auto&quot; radius=&quot;8px&quot; fit=&quot;cover&quot; />`,
        )
      }
    "
  />
  <!-- 素材库面板 -->
  <MaterialLibraryPanel
    :visible="showMaterialPanel"
    @close="showMaterialPanel = false"
    @insert="handleInsertMaterial"
  />
  <!-- 保存素材弹窗 -->
  <SaveMaterialDialog
    :visible="saveMaterialVisible"
    @close="saveMaterialVisible = false"
    @save="handleSaveMaterial"
  />
  <ConfirmDialog
    :visible="confirmLoadVisible"
    title="加载示例"
    message="加载示例将覆盖当前编辑内容，确定继续吗？"
    confirm-text="加载"
    @confirm="loadDemo"
    @update:visible="confirmLoadVisible = $event"
  />
  <!-- 自动更新确认弹窗 -->
  <ConfirmDialog
    :visible="autoUpdateDialogVisible"
    title="发现新版本"
    :message="`版本 ${autoUpdateVersion} 可用，是否立即下载安装？`"
    :body="autoUpdateObj?.body"
    :wide="true"
    confirm-text="立即更新"
    @confirm="doAutoUpdateDownload"
    @update:visible="autoUpdateDialogVisible = $event"
  />
  <!-- 自动更新下载进度 -->
  <div
    v-if="autoUpdateDownloading"
    class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl bg-[#111] text-white text-sm shadow-lg"
  >
    <div class="flex items-center gap-2 mb-1.5">
      <span>正在下载更新...</span>
      <span class="font-medium text-[var(--accent)]">{{ autoUpdateProgress }}%</span>
    </div>
    <div class="h-1 w-48 rounded-full bg-[#444] overflow-hidden">
      <div
        class="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
        :style="{ width: autoUpdateProgress + '%' }"
      />
    </div>
  </div>
  <!-- 定稿后删除草稿确认弹窗 -->
  <ConfirmDialog
    :visible="finalizeDeleteConfirmVisible"
    title="定稿完成"
    message="定稿已保存，是否删除当前草稿？"
    confirm-text="删除"
    confirm-type="danger"
    @confirm="handleDeleteAfterFinalize"
    @update:visible="finalizeDeleteConfirmVisible = $event"
  />
  <!-- 保存到仓库/本地后删除草稿确认弹窗 -->
  <ConfirmDialog
    :visible="pushToCloudDeleteConfirmVisible"
    :title="articleStorageMode === 'local' ? '保存成功' : '上传成功'"
    :message="
      articleStorageMode === 'local'
        ? '文章已保存到本地，是否删除草稿？'
        : '文章已上传到仓库，是否删除本地草稿？'
    "
    confirm-text="删除"
    confirm-type="danger"
    @confirm="handlePushCloudDeleteConfirm"
    @update:visible="pushToCloudDeleteConfirmVisible = $event"
  />

  <!-- 草稿列表弹窗 -->
  <DraftListDialog
    :visible="draftListVisible"
    :drafts="drafts"
    @close="draftListVisible = false"
    @confirm-load="onDraftConfirmLoad"
    @confirm-delete="onDraftConfirmDelete"
  />

  <!-- 命令面板（⌘K）：统一检索草稿 / 云文章 / 本地文章 / 素材 -->
  <CommandPalette
    :visible="paletteVisible"
    :items="paletteItems"
    :loading="paletteLoading"
    :shortcut-text="paletteShortcutText"
    @close="closePalette"
    @activate="onPaletteActivate"
    @search="onPaletteSearch"
  />

  <!-- 保存草稿弹窗 -->
  <SaveDraftDialog
    :visible="saveDraftVisible"
    :initial-title="extractedTitle"
    @close="saveDraftVisible = false"
    @saved="handleSaveDraft"
  />

  <!-- 定稿弹窗 -->
  <FinalizeDialog
    :visible="finalizeVisible"
    :initial-title="extractedTitle"
    @close="finalizeVisible = false"
    @finalize="handleFinalize"
  />

  <!-- 标题变更确认弹窗 -->
  <ConfirmDialog
    :visible="confirmOverwriteVisible"
    :title="confirmOverwriteMode === 'same-title-draft' ? '存在同名草稿' : '标题已变更'"
    :message="
      confirmOverwriteMode === 'same-title-draft'
        ? '已存在同名草稿「' + pendingDraftTitle + '」，请选择操作：'
        : '原标题与草稿「' + currentDraftTitle + '」不一致，请选择操作：'
    "
    confirm-text="覆盖现有草稿"
    cancel-text="取消"
    @confirm="handleOverwrite"
    @cancel="handleCancelOverwrite"
    @update:visible="confirmOverwriteVisible = $event"
  >
    <button
      class="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none bg-[#f3f0ea] text-[#8a8175] transition-colors hover:bg-[#e8e3da]"
      @click="handleSaveAsNew"
    >
      另存为新草稿
    </button>
  </ConfirmDialog>

  <!-- 素材重复内容确认弹窗 -->
  <ConfirmDialog
    :visible="confirmMaterialOverwriteVisible"
    title="存在相同内容的素材"
    :message="
      '素材「' +
      pendingMaterial?.name +
      '」与已有素材「' +
      pendingOverwriteMaterialName +
      '」内容相同，请选择操作：'
    "
    confirm-text="覆盖"
    cancel-text="取消"
    @confirm="handleMaterialOverwrite"
    @cancel="handleCancelMaterialOverwrite"
    @update:visible="confirmMaterialOverwriteVisible = $event"
  >
    <button
      class="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none bg-[#f3f0ea] text-[#8a8175] transition-colors hover:bg-[#e8e3da]"
      @click="handleMaterialSaveAsNew"
    >
      另存为新素材
    </button>
  </ConfirmDialog>

  <!-- 草稿加载/删除全局确认弹窗 -->
  <ConfirmDialog
    v-model:visible="draftConfirmVisible"
    :title="draftConfirmTitle"
    :message="draftConfirmMessage"
    :confirm-type="draftConfirmType"
    :confirm-text="draftConfirmText"
    @confirm="onDraftConfirm"
    @cancel="draftConfirmVisible = false"
  />
  <ConfirmDialog
    :visible="articleLoadConfirmVisible"
    title="重新编辑"
    :message="`当前编辑器内容与仓库中的「${pendingArticleLoad?.node.title}」不一致，确定重新编辑？编辑器中的修改将被覆盖。`"
    confirm-text="重新编辑"
    @confirm="confirmLoadArticle"
    @cancel="cancelLoadArticle"
  />
</template>

<style scoped>
/* 移动端底部悬浮胶囊 */
.mobile-tab-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  pointer-events: none;
}

.mobile-tab-pill {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 9999px;
  background: var(--pill-bg, rgba(245, 245, 247, 0.45));
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  box-shadow:
    0 4px 24px var(--pill-shadow, rgba(0, 0, 0, 0.08)),
    0 1px 4px var(--pill-shadow-sm, rgba(0, 0, 0, 0.05)),
    inset 0 1px 0 var(--pill-inset, rgba(255, 255, 255, 0.4));
  pointer-events: auto;
}

.mobile-tab-highlight {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: calc(50% - 4px);
  border-radius: 9999px;
  background: var(--accent, #6c5ce7);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.mobile-tab-highlight.left {
  transform: translateX(0);
}

.mobile-tab-highlight.right {
  transform: translateX(100%);
}

.mobile-tab-btn {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--pill-text, rgba(0, 0, 0, 0.45));
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.25s ease;
  white-space: nowrap;
  line-height: 1;
}

.mobile-tab-btn.active {
  color: #fff;
}

/* 面板操作按钮 - 结构用 Tailwind，仅保留 CSS 变量相关样式 */
.panel-action-btn {
  color: var(--text-secondary);
}
.panel-action-btn:hover {
  color: var(--accent, #6c5ce7);
  background: var(--accent-light, rgba(108, 92, 231, 0.08));
}

/* 暗色模式 - 按钮文字颜色（通过 CSS 变量处理，见 :style 绑定） */

/* 滚动到底部附近时，给内容区域加底部 padding 避免被胶囊遮挡 */
@media (max-width: 767px) {
  .mobile-near-bottom :deep(.cm-editor) {
    padding-bottom: 80px;
  }
  .mobile-near-bottom :deep(.preview-scroll) {
    padding-bottom: 80px;
  }
}

/* Tree Panel 展开/收起动画 */
.tree-panel-enter-active,
.tree-panel-leave-active {
  transition: width 0.25s ease;
  overflow: hidden;
}

.tree-panel-enter-from,
.tree-panel-leave-to {
  width: 0 !important;
}
</style>
