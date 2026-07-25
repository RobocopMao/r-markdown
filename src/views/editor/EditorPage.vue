<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '@/composables/useTheme'
import { useDarkMode } from '@/composables/useDarkMode'
import { getSetting } from '@/config/settings'
import { useSetting } from '@/composables/useSetting'
import { useAutoUpdater, autoUpdatePending, autoUpdateRid, downloadUpdateWithRid, type UpdateInfo } from '@/composables/useAutoUpdater'
import { autoSaveEnabled, autoSaveInterval } from '@/composables/useEditorSettings'
import { uploadToGitHub } from '@/services/githubUploader'
import { uploadToLeta } from '@/services/letaUploader'
import { DEMO_CONTENT } from '@/data/demoContent'
import { DraftStorage, type Draft } from '@/services/DraftStorage'
import { MaterialStorage, type MaterialItem } from '@/services/materialStorage'
import { extractTitle, sanitizeFilename } from '@/utils/extractTitle'
import Editor from './components/Editor.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import { inlineFormatOptions } from '@/utils/inlineFormat'
import {
  Image, ImageUp, Puzzle, Braces, Baseline,
  Highlighter, Sparkles, Pill, TriangleAlert,
  Underline, Strikethrough, Bold, Italic,
  Code2, Superscript, Subscript, RemoveFormatting,
  Save, SquareBottomDashedScissors, CheckCircle,
  Download, Copy, FileText, CircleCheck, Minus,
  Smartphone, SquarePen, CircleQuestionMark,
  ImagePlus, Link, List, ListOrdered, Quote, StickyNote, ListChecks, Images, Crop, Table, Send, Package, Columns2, Rows2, Box, Type, Layers
} from 'lucide-vue-next'
import { putImage, resolveIdbImages, cleanupImages } from '@/utils/imageDB'

const formatIcons: Record<string, any> = {
  '==': Highlighter,
  '::': Sparkles,
  '!!': Pill,
  '^^': TriangleAlert,
  '__': Baseline,
  '~~': Strikethrough,
  '**': Bold,
  '*': Italic,
  '***': RemoveFormatting,
  '`': Code2,
  'sup': Superscript,
  'sub': Subscript,
  'u': Underline,
}

const markdownInsertOptions = [
  { label: '分割线', display: '---', syntax: '\n---\n', icon: Minus },
  { label: '有序列表', display: '1. 2. 3.', syntax: '1. \n2. \n3. \n', icon: ListOrdered },
  { label: '无序列表', display: '-  -  -', syntax: '- \n- \n- ', icon: List },
  { label: '引用', display: '> 引用文字', syntax: '> ', icon: Quote },
  { label: '链接', display: '[文字](url)', syntax: '[链接文字](url)', icon: Link },
  { label: '脚注', display: '[文字](url "标题")', syntax: '[脚注文字](url "脚注描述")', icon: StickyNote },
  { label: '任务列表', display: '☑ 任务1  ☐ 任务2', syntax: '- [x] 任务1\n- [ ] 任务2', icon: ListChecks },
  { label: '行内代码', display: '`code`', syntax: '``', icon: Code2 },
  { label: '代码块', display: '``` ... ```', syntax: '```\n\n```', icon: Braces },
  { label: '限高图', display: '![图](url)[w h]', syntax: '![图片描述](https://robocopmao.github.io/r-markdown/empty.webp)[100% 100%]', icon: Crop },
  { label: '横向多图', display: '<图1, 图2>', syntax: '<![图1描述](https://robocopmao.github.io/r-markdown/empty.webp),![图2描述](https://robocopmao.github.io/r-markdown/empty.webp)>', icon: Images },
  { label: '表格', display: '', syntax: '', icon: Table, table: true },
]

const MAX_GRID_COLS = 10
const MAX_GRID_ROWS = 10
const tableGridHovered = ref({ rows: 0, cols: 0 })

function insertTable(rows: number, cols: number) {
  if (!editorRef.value || rows < 1 || cols < 1) return
  const header = '| ' + Array(cols).fill('表头').join(' | ') + ' |'
  const sep = '| ' + Array(cols).fill('---').join(' | ') + ' |'
  const row = '| ' + Array(cols).fill('单元格').join(' | ') + ' |'
  const body = Array(rows).fill(row).join('\n')
  editorRef.value.insertAtCursor('\n' + header + '\n' + sep + '\n' + body + '\n')
}

function getGridCellClass(i: number) {
  const rows = Math.ceil(i / MAX_GRID_COLS)
  const cols = (i - 1) % MAX_GRID_COLS + 1
  const active = rows <= tableGridHovered.value.rows && cols <= tableGridHovered.value.cols
  return {
    'border-[#d0d0d0] dark:border-white/15 bg-transparent': !active,
  }
}

function isGridCellActive(i: number) {
  const rows = Math.ceil(i / MAX_GRID_COLS)
  const cols = (i - 1) % MAX_GRID_COLS + 1
  return rows <= tableGridHovered.value.rows && cols <= tableGridHovered.value.cols
}

// ── 布局快速插入（Row/Column）──
const MAX_COLS = 6
const MAX_ROWS = 3
const colGridHovered = ref(0)
const rowGridHovered = ref(0)

function isColCellActive(i: number) {
  return i <= colGridHovered.value
}

function isRowCellActive(i: number) {
  return i <= rowGridHovered.value
}

function insertColumnLayout(cols: number) {
  if (!editorRef.value || cols < 1 || cols > MAX_COLS) return
  const colBlocks = Array.from({ length: cols }, () => '<column flex="1">\n内容\n</column>').join('\n')
  const template = `<row gap="16px">\n${colBlocks}\n</row>`
  editorRef.value.insertAtCursor('\n' + template + '\n')
}

function insertColumnStack(cols: number) {
  if (!editorRef.value || cols < 1 || cols > MAX_COLS) return
  const colBlocks = Array.from({ length: cols }, (_, i) =>
    `<column flex="1">\n第 ${i + 1} 列内容\n</column>`
  ).join('\n')
  editorRef.value.insertAtCursor('\n' + colBlocks + '\n')
}

function insertRowStack(rows: number) {
  if (!editorRef.value || rows < 1 || rows > MAX_ROWS) return
  const rowBlocks = Array.from({ length: rows }, (_, i) =>
    `<row gap="16px">\n第 ${i + 1} 行内容\n</row>`
  ).join('\n')
  editorRef.value.insertAtCursor('\n' + rowBlocks + '\n')
}

function insertContainer() {
  if (!editorRef.value) return
  const template = `<container>
内容
</container>`
  editorRef.value.insertAtCursor('\n' + template + '\n')
}

function insertHtmlContainer() {
  if (!editorRef.value) return
  const template = `<html>
符合微信公众号编辑器的html
</html>`
  editorRef.value.insertAtCursor('\n' + template + '\n')
}

function insertText() {
  if (!editorRef.value) return
  editorRef.value.insertAtCursor('<text>文字</text>')
}

function insertStack() {
  if (!editorRef.value) return
  const template = `<stack width="750px" ratio="16/9">
<positioned top="0" left="0" width="100%" height="100%" z-index="0">背景层</positioned>
<positioned top="40px" left="5%" width="90%" z-index="1">前景层</positioned>
</stack>`
  editorRef.value.insertAtCursor('\n' + template + '\n')
}

import Preview from './components/Preview.vue'
import Minimap from './components/Minimap.vue'
import ThemePicker from './components/ThemePicker.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import Dropdown from './components/Dropdown.vue'
import MobileActionsMenu from './components/mobile/MobileActionsMenu.vue'
import XhsExporter from './components/XhsExporter.vue'
import TagPropsForm from './components/TagPropsForm.vue'
import ComponentPickerDialog from './components/ComponentPickerDialog.vue'
import SaveDraftDialog from './components/SaveDraftDialog.vue'
import DraftListDialog from './components/DraftListDialog.vue'
import FinalizeDialog from './components/FinalizeDialog.vue'
import EditorSidebar from './components/EditorSidebar.vue'
import ImageCacheDialog from './components/ImageCacheDialog.vue'
import SaveMaterialDialog from './components/SaveMaterialDialog.vue'
import MaterialLibraryPanel from './components/MaterialLibraryPanel.vue'
import PublishToWechatDialog from '@/views/editor/components/PublishToWechatDialog.vue'
import Toast from '@/components/Toast.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import pkg from '../../../package.json'

// base64 图片数据存储，避免长字符串撑大编辑器
const IMG_STORE_KEY = 'r-markdown-editorImgs'
const base64Store = new Map<string, string>()

// 初始化时从 localStorage 恢复图片数据
;(() => {
  try {
    const raw = localStorage.getItem(IMG_STORE_KEY)
    if (raw) {
      const entries: [string, string][] = JSON.parse(raw)
      for (const [token, b64] of entries) {
        base64Store.set(token, b64)
      }
    }
  } catch {
    /* ignore corrupt data */
  }
})()

function saveBase64Store() {
  if (base64Store.size === 0) {
    localStorage.removeItem(IMG_STORE_KEY)
    return
  }
  const entries = Array.from(base64Store.entries())
  localStorage.setItem(IMG_STORE_KEY, JSON.stringify(entries))
}

function compactBase64(dataUrl: string): string {
  const m = dataUrl.match(/^(data:image\/[\w+]+);base64,(.+)$/)
  if (!m) return dataUrl
  const [, prefix, b64] = m
  if (b64.length <= 100) return dataUrl
  // 去重：相同 base64 内容复用已有 token
  for (const [existingToken, existingB64] of base64Store) {
    if (existingB64 === b64) {
      return `${prefix};base64,${existingToken}`
    }
  }
  const token = `IMG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  base64Store.set(token, b64)
  return `${prefix};base64,${token}`
}

function resolveBase64(text: string): string {
  if (base64Store.size === 0) return text
  let result = text
  for (const [token, b64] of base64Store) {
    result = result.split(token).join(b64)
  }
  return result
}

function cleanupUnusedBase64() {
  const tokensInUse = new Set(markdown.value.match(/IMG_\d+_[a-z0-9]{6}/g) ?? [])
  let removed = false
  for (const token of base64Store.keys()) {
    if (!tokensInUse.has(token)) {
      base64Store.delete(token)
      removed = true
    }
  }
  if (removed) saveBase64Store()
}

// ── 图片压缩（Canvas） ──
const MAX_DIMENSION = 1920

async function compressImage(file: File, maxSizeKB: number, maxQuality: number): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })

  const canvas = document.createElement('canvas')
  let { width, height } = img
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / Math.max(width, height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  const maxBytes = maxSizeKB * 1024
  let low = 0.1
  let high = maxQuality
  let best: Blob | null = null

  for (let i = 0; i < 6; i++) {
    const mid = (low + high) / 2
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', mid)
    })
    if (blob.size <= maxBytes) {
      best = blob
      low = mid
    } else {
      high = mid
    }
  }

  if (!best) {
    best = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', low)
    })
  }

  const newName = file.name.replace(/\.[^.]+$/, '.jpg')
  return new File([best], newName, { type: 'image/jpeg' })
}

const { accent, colors, setTheme, setCustomTheme, customColor, themes } = useTheme()
const { isDark } = useDarkMode()
useAutoUpdater()

// ── 左侧侧栏 ──
const sidebarTab = ref('editor')

function onSidebarSelect(tab: string) {
  sidebarTab.value = tab
}

// ── 移动端 Tab 切换 ──
const mobileTab = ref<'editor' | 'preview'>('editor')
const isMobile = ref(window.innerWidth < 768)
const router = useRouter()
const nearBottom = ref(false)

function onResize() {
  isMobile.value = window.innerWidth < 768
}

// 编辑器滚动：同步预览 + 检测是否接近底部
function onEditorScrollAll(ratio: number) {
  handleEditorScroll(ratio)
  if (isMobile.value) {
    nearBottom.value = ratio > 0.85
  }
}

function onPreviewClickLine(lineNo: number) {
  editorRef.value?.scrollToLineAndHighlight(lineNo)
}

onMounted(() => {
  refreshDrafts()
  // 异步匹配草稿：根据当前标题查找已有同名草稿
  setTimeout(() => matchExistingDraft(), 300)
  window.addEventListener('resize', onResize)
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
})

// ── 拖动调整宽度 ──
const previewWidth = ref(430)
const isDragging = ref(false)

// ── Minimap 缩略图 ──
const minimapEnabled = useSetting<boolean>('minimapEnabled')
const minimapScrollRatio = ref(0)
const minimapViewportRatio = ref(0)

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
  const minW = 407
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

const STORAGE_KEY = 'r-markdown-editorContent'
const SAVE_TIME_KEY = 'r-markdown-editorSaveTime'

function stripIdbSrc(text: string): string {
  return text.replace(/src="idb:DBI_\d+_[a-z0-9]{6}"/g, 'src=""')
}

const saved = localStorage.getItem(STORAGE_KEY)
const markdown = ref(saved !== null ? saved : DEMO_CONTENT)
const resolvedMarkdown = ref(stripIdbSrc(resolveBase64(markdown.value)))

watch(markdown, async (val) => {
  const step1 = resolveBase64(val)
  const hasIdb = /idb:DBI_\d+_[a-z0-9]{6}/.test(step1)
  if (!hasIdb) {
    resolvedMarkdown.value = step1
    return
  }
  resolvedMarkdown.value = await resolveIdbImages(step1)
}, { immediate: true, flush: 'sync' })
const previewRef = ref()
interface EditorExposed {
  insertAtCursor: (text: string) => void
  scrollToLineAndHighlight: (lineNo: number) => void
  isAtLineStart: boolean
  hasInlineSelection: boolean
  isInsideTag: boolean
  applyInlineFormat: (syntax: string, wrapType?: 'delim' | 'tag') => void
  replaceRange: (from: number, to: number, text: string) => void
}
const editorRef = ref<EditorExposed>()
const xhsVisible = ref(false)
const settingsVisible = ref(false)
const settingsInitialTab = ref('')
const wechatPublishVisible = ref(false)
const showGallery = ref(false)
const showMaterialPanel = ref(false)
const saveMaterialVisible = ref(false)
const isTauri = import.meta.env.VITE_TAURI === 'true'

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
const componentDialogVisible = ref(false)
const confirmLoadVisible = ref(false)

// ── 草稿功能 ──
const draftListVisible = ref(false)
const saveDraftVisible = ref(false)
const finalizeVisible = ref(false)
const finalizeDeleteConfirmVisible = ref(false)
const drafts = ref<Draft[]>([])
const currentDraftId = ref<number | null>(DraftStorage.getCurrentDraftId())

// ── 草稿加载/删除确认弹窗（全局，在 BaseDrawer 之外渲染）──
const draftConfirmVisible = ref(false)
const draftConfirmTitle = ref('')
const draftConfirmMessage = ref('')
const draftConfirmType = ref<'accent' | 'danger'>('accent')
const draftConfirmText = ref('')
const draftPendingAction = ref<{ type: 'load' | 'delete'; draftId: number } | null>(null)

const extractedTitle = computed(() => extractTitle(markdown.value) || '')
const draftCount = computed(() => drafts.value.length)

// 持久化 currentDraftId 到 localStorage
watch(currentDraftId, (val) => {
  DraftStorage.setCurrentDraftId(val)
})

// 当前关联草稿的标题，用于工具栏显示
const currentDraftTitle = ref('')
watch(currentDraftId, async (id) => {
  if (id !== null) {
    const draft = await DraftStorage.getById(id)
    currentDraftTitle.value = draft?.title ?? ''
  } else {
    currentDraftTitle.value = ''
  }
}, { immediate: true })

async function refreshDrafts() {
  drafts.value = await DraftStorage.list()
}

// 异步匹配草稿：标题优先，标题为空时降级为内容匹配
function matchExistingDraft() {
  if (currentDraftId.value !== null) return
  const title = extractedTitle.value

  let match: Draft | undefined
  if (title) {
    match = drafts.value
      .filter((d) => d.title === title)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  }

  // 标题匹配失败或标题为空时，尝试内容匹配
  if (!match) {
    const content = markdown.value
    match = drafts.value.find((d) => d.content === content)
  }

  if (match) {
    currentDraftId.value = match.id!
  }
}

// ── 插入图片 ──
const imageInputRef = ref<HTMLInputElement>()
const persistImageInputRef = ref<HTMLInputElement>()
const githubImageInputRef = ref<HTMLInputElement>()
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

function handleInsertImage() {
  imageInputRef.value?.click()
}

function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    input.value = ''
    return
  }

  // 验证文件大小（2MB，未开启压缩时限制）
  const quality = (getSetting<number>('compressQuality') || 100) / 100
  if (quality >= 1.0 && file.size > 2 * 1024 * 1024) {
    showToast('图片不能超过 2MB')
    input.value = ''
    return
  }

  doInsertLocalImage(file, input)
}

async function doInsertLocalImage(file: File, input: HTMLInputElement) {
  const quality = (getSetting<number>('compressQuality') || 100) / 100
  let finalFile = file
  if (quality < 1.0) {
    showToast('正在压缩图片...')
    finalFile = await compressImage(file, 2000, quality)
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    const compacted = compactBase64(dataUrl)
    editorRef.value?.insertAtCursor(
      `<img src="${compacted}" width="100%" height="auto" radius="8px" fit="cover" />`,
    )
    const cleanup = window.requestIdleCallback || ((fn) => setTimeout(fn, 200))
    cleanup(() => cleanupUnusedBase64())
    input.value = ''
  }
  reader.onerror = () => {
    showToast('图片读取失败')
    input.value = ''
  }
  reader.readAsDataURL(finalFile)
}

// ── 长期存储图片（IndexedDB） ──
function handleInsertImagePersist() {
  persistImageInputRef.value?.click()
}

async function onImagePersistSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    input.value = ''
    return
  }

  const quality = (getSetting<number>('compressQuality') || 100) / 100
  let finalFile = file
  if (quality < 1.0) {
    showToast('正在压缩图片...')
    finalFile = await compressImage(file, 5000, quality)
    if (finalFile.size > 5 * 1024 * 1024) {
      showToast('图片压缩后仍超过 5MB')
      input.value = ''
      return
    }
  } else if (file.size > 5 * 1024 * 1024) {
    showToast('图片不能超过 5MB')
    input.value = ''
    return
  }

  try {
    const token = await putImage(finalFile)
    editorRef.value?.insertAtCursor(
      `<img src="idb:${token}" width="100%" height="auto" radius="8px" fit="cover" />`,
    )
    await nextTick()
  } catch {
    showToast('存储图片失败')
  }
  input.value = ''
}

// ── 粘贴/拖拽图片 ──
async function processImageInsert(file: File, insertAt: number | null = null) {
  // 检查是否在标签内部（不允许在组件标签内插入）
  if (editorRef.value?.isInsideTag) {
    showToast('不能在组件标签内插入图片')
    return
  }

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }

  const mode = getSetting<string>('pasteDropMode') || 'local'

  if (mode === 'github') {
    const repo = getSetting<string>('githubRepo')
    const token = getSetting<string>('githubToken')
    if (!repo || !token) {
      showToast('请先在设置中配置 GitHub 图床')
      return
    }
    let uploadFile = file
    const quality = (getSetting<number>('compressQuality') || 100) / 100
    if (quality < 1.0) {
      showToast('正在压缩图片...')
      uploadFile = await compressImage(file, 5000, quality)
      if (uploadFile.size > 5 * 1024 * 1024) {
        showToast('图片压缩后仍超过 5MB')
        return
      }
    } else if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB')
      return
    }
    githubUploading.value = true
    githubUploadProgress.value = 0
    uploadToGitHub(
      uploadFile,
      { repo, token, branch: getSetting<string>('githubBranch') || 'main' },
      (percent) => { githubUploadProgress.value = percent },
    )
      .then((result) => {
        const tag = `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`
        if (insertAt !== null) {
          editorRef.value?.replaceRange(insertAt, insertAt, tag)
        } else {
          editorRef.value?.insertAtCursor(tag)
        }
        showToast('上传成功')
      })
      .catch((e: any) => {
        showToast(e.message || '上传失败')
      })
      .finally(() => {
        githubUploading.value = false
        githubUploadProgress.value = 0
      })
    return
  }

  if (mode === 'leta') {
    const token = getSetting<string>('letaToken')
    const storageId = getSetting<string>('letaStorageId') || '1'
    if (!token) {
      showToast('请先在设置中配置乐塔图床 Token')
      return
    }
    let uploadFile = file
    const quality = (getSetting<number>('compressQuality') || 100) / 100
    if (quality < 1.0) {
      showToast('正在压缩图片...')
      uploadFile = await compressImage(file, 10000, quality)
      if (uploadFile.size > 10 * 1024 * 1024) {
        showToast('图片压缩后仍超过 10MB')
        return
      }
    } else if (file.size > 10 * 1024 * 1024) {
      showToast('图片不能超过 10MB')
      return
    }
    githubUploading.value = true
    githubUploadProgress.value = 0
    uploadToLeta(
      uploadFile,
      { token, storageId },
      (percent) => { githubUploadProgress.value = percent },
    )
      .then((result) => {
        const tag = `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`
        if (insertAt !== null) {
          editorRef.value?.replaceRange(insertAt, insertAt, tag)
        } else {
          editorRef.value?.insertAtCursor(tag)
        }
        showToast('上传成功')
      })
      .catch((e: any) => {
        showToast(e.message || '上传失败')
      })
      .finally(() => {
        githubUploading.value = false
        githubUploadProgress.value = 0
      })
    return
  }

  // 本地模式 → IndexedDB 存储
  const quality = (getSetting<number>('compressQuality') || 100) / 100
  let finalFile = file
  if (quality < 1.0) {
    showToast('正在压缩图片...')
    finalFile = await compressImage(file, 5000, quality)
    if (finalFile.size > 5 * 1024 * 1024) {
      showToast('图片压缩后仍超过 5MB')
      return
    }
  } else if (file.size > 5 * 1024 * 1024) {
    showToast('图片不能超过 5MB')
    return
  }
  try {
    const token = await putImage(finalFile)
    const tag = `<img src="idb:${token}" width="100%" height="auto" radius="8px" fit="cover" />`
    if (insertAt !== null) {
      editorRef.value?.replaceRange(insertAt, insertAt, tag)
    } else {
      editorRef.value?.insertAtCursor(tag)
    }
    await nextTick()
  } catch {
    showToast('存储图片失败')
  }
}

function handlePasteImage(file: File) {
  processImageInsert(file)
}

function handlePasteMultipleImages() {
  showToast('一次只能粘贴一张图片')
}

function onPasteText() {
  // 粘贴通常替换全部内容，需要清空旧关联后重新匹配
  currentDraftId.value = null
  setTimeout(() => matchExistingDraft(), 300)
}

function onUndoRedo() {
  // 撤销/重做后内容可能大幅变化，清空旧关联后重新匹配
  currentDraftId.value = null
  setTimeout(() => matchExistingDraft(), 300)
}

function handleDropImage(file: File, from: number) {
  processImageInsert(file, from)
}

function handleDropMultipleImages() {
  showToast('一次只能拖入一张图片')
}

function handleDropNonImage() {
  showToast('请拖入图片文件')
}

// ── 图床上传 ──
const githubUploading = ref(false)
const githubUploadProgress = ref(0)
const uploadHostingLabel = ref('图床')

function handleUploadToGitHub() {
  githubImageInputRef.value?.click()
}

async function onGithubImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    input.value = ''
    return
  }

  const hosting = getSetting<string>('defaultHosting') || 'github'
  uploadHostingLabel.value = hosting === 'leta' ? '乐塔图床' : 'GitHub 图床'
  const maxSize = hosting === 'leta' ? 10 : 5

  const quality = (getSetting<number>('compressQuality') || 100) / 100
  let finalFile = file
  if (quality < 1.0) {
    showToast('正在压缩图片...')
    finalFile = await compressImage(file, maxSize * 1000, quality)
    if (finalFile.size > maxSize * 1024 * 1024) {
      showToast(`图片压缩后仍超过 ${maxSize}MB`)
      input.value = ''
      return
    }
  } else if (file.size > maxSize * 1024 * 1024) {
    showToast(`图片不能超过 ${maxSize}MB`)
    input.value = ''
    return
  }

  if (hosting === 'leta') {
    const letaToken = getSetting<string>('letaToken')
    const storageId = getSetting<string>('letaStorageId') || '1'
    if (!letaToken) {
      showToast('请先在设置中配置乐塔图床 Token')
      input.value = ''
      return
    }
    githubUploading.value = true
    githubUploadProgress.value = 0
    try {
      const result = await uploadToLeta(
        finalFile,
        { token: letaToken, storageId },
        (percent) => { githubUploadProgress.value = percent },
      )
      editorRef.value?.insertAtCursor(
        `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`,
      )
      showToast('上传成功')
    } catch (e: any) {
      showToast(e.message || '上传失败')
    }
    githubUploading.value = false
    githubUploadProgress.value = 0
    input.value = ''
    return
  }

  const repo = getSetting<string>('githubRepo')
  const token = getSetting<string>('githubToken')
  const branch = getSetting<string>('githubBranch') || 'main'

  if (!repo || !token) {
    showToast('请先在设置中配置 GitHub 图床')
    input.value = ''
    return
  }

  githubUploading.value = true
  githubUploadProgress.value = 0
  try {
    const result = await uploadToGitHub(
      finalFile,
      { repo, token, branch },
      (percent) => {
        githubUploadProgress.value = percent
      },
    )
    editorRef.value?.insertAtCursor(
      `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`,
    )
    showToast('上传成功')
  } catch (e: any) {
    showToast(e.message || '上传失败')
  }
  githubUploading.value = false
  githubUploadProgress.value = 0
  input.value = ''
}

// ── 标签解析表单 ──
interface TagInfo {
  tagName: string
  attrs: Record<string, string>
  selfClose: boolean
  from: number
  to: number
}
const tagInfo = ref<TagInfo | null>(null)
const showTagDialog = ref(false)

function onTagSelected(info: TagInfo | null) {
  tagInfo.value = info
}

// 光标离开标签时自动关闭侧栏
watch(tagInfo, (val) => {
  if (!val) showTagDialog.value = false
})

function onTagDialogUpdate(attrs: Record<string, string>) {
  if (!tagInfo.value) return
  const prev = tagInfo.value
  const attrParts = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  const attrsStr = attrParts ? ` ${attrParts}` : ''
  const newTag = prev.selfClose ? `<${prev.tagName}${attrsStr} />` : `<${prev.tagName}${attrsStr}>`
  editorRef.value?.replaceRange(prev.from, prev.to, newTag)
}

const savedTime = localStorage.getItem(SAVE_TIME_KEY)
function formatTime(full: string) {
  // desktop: MM-DD HH:mm:ss, mobile: MM-DD HH:mm
  let s = full
  if (s.length >= 5 && s[4] === '-') s = s.slice(5) // strip YYYY-
  if (isMobile.value) {
    const lastColon = s.lastIndexOf(':')
    if (lastColon > 0) s = s.slice(0, lastColon)
  }
  return s
}
const saveMode = ref<'自动' | '手动' | ''>(savedTime ? (autoSaveEnabled.value ? '自动' : '手动') : '')
const saveHint = ref(savedTime ? saveMode.value + '保存于 ' + formatTime(savedTime) : '')

let saveTimer: ReturnType<typeof setTimeout> | null = null

function saveContent(value: string, isManual = false) {
  localStorage.setItem(STORAGE_KEY, value)
  saveBase64Store()
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
  saveMode.value = isManual ? '手动' : '自动'
  saveHint.value = saveMode.value + '保存于 ' + formatTime(timeStr)
}

function onInput(value: string) {
  markdown.value = value
  if (!autoSaveEnabled.value) {
    saveHint.value = '未保存'
    return
  }
  saveHint.value = '输入中…'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveContent(value)
  }, autoSaveInterval.value * 1000)
}

// ── 通用下拉菜单数据 ──
const exportItems = [
  { label: '保存图片', icon: Image, action: 'saveImage' },
  { label: '小红书图', icon: FileText, action: 'xhs' },
  { label: '完整HTML', icon: Braces, action: 'export-full-html' },
]

function onDropdownSelect(groupId: string, action: string) {
  if (groupId === 'export') {
    if (action === 'saveImage') handleSaveImage()
    else if (action === 'xhs') xhsVisible.value = true
    else if (action === 'export-full-html') handleExportFullHTML()
  }
}

function onExampleAction(action: string) {
  if (action === 'download') downloadDemo()
  else if (action === 'load') confirmLoadVisible.value = true
  else if (action === 'aiDemo') openAiDemo()
}

// ── 素材入口 ──
function onMaterialAction(action: 'my' | 'library') {
  if (action === 'my') {
    showMaterialPanel.value = true
  } else if (action === 'library') {
    router.push('/materials')
  }
}

// ── 导入 ──
async function onImportClick() {
  // 判断是否 Tauri 环境
  const isTauri = import.meta.env.VITE_TAURI === 'true'

  if (isTauri) {
    // 桌面端：Tauri 原生对话框
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const filePath = await open({
        multiple: false,
        filters: [{ name: '文档', extensions: ['md', 'txt', 'docx'] }]
      })
      if (!filePath) return

      const fp = Array.isArray(filePath) ? filePath[0] : filePath
      if (fp.endsWith('.docx')) {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const buffer = await readFile(fp)
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer })
        markdown.value = result.value
      } else {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        markdown.value = await readTextFile(fp)
      }
      localStorage.setItem(STORAGE_KEY, markdown.value)
      currentDraftId.value = null
      // 导入后异步匹配草稿
      setTimeout(() => matchExistingDraft(), 300)
      showToast('导入成功')
    } catch (e: any) {
      showToast(e?.toString() || '导入失败')
      console.error('导入失败:', e)
    }
    return
  }

  // Web 端：浏览器文件选择
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.txt,.docx'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      if (file.name.endsWith('.docx')) {
        const buf = await file.arrayBuffer()
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ arrayBuffer: buf })
        markdown.value = result.value
      } else {
        markdown.value = await file.text()
      }
      localStorage.setItem(STORAGE_KEY, markdown.value)
      currentDraftId.value = null
      // 导入后异步匹配草稿
      setTimeout(() => matchExistingDraft(), 300)
      showToast('导入成功')
    } catch (e: any) {
      showToast(e?.toString() || '导入失败')
      console.error('导入失败:', e)
    }
  })
  input.click()
}

// ── 外链：Tauri 中用系统浏览器打开，Web 中用 window.open ──
const AI_DEMO_URL = 'https://chat.deepseek.com/share/f6bhvloktj8wdl5fie'

async function openAiDemo() {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(AI_DEMO_URL)
  } catch {
    window.open(AI_DEMO_URL, '_blank', 'noopener,noreferrer')
  }
}

// ── Markdown 自动加载 ──
function loadDemo() {
  base64Store.clear()
  localStorage.removeItem(IMG_STORE_KEY)
  currentDraftId.value = null
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

function downloadDemo() {
  try {
    const blob = new Blob([DEMO_CONTENT], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'R-Markdown示例.md'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('示例下载完成')
  } catch (e) {
    showToast('示例下载失败')
    console.error('下载示例失败:', e)
  }
}

function handleCopyRichText() {
  previewRef.value?.copyRichText()
}

async function handlePublishToWechat() {
  const appid = getSetting<string>('wechatAppId')
  const appsecret = getSetting<string>('wechatAppSecret')
  if (!appid || !appsecret) {
    showToast('请先在设置中配置公众号 AppID 和 AppSecret')
    settingsInitialTab.value = 'wechat'
    settingsVisible.value = true
    return
  }
  if (!currentDraftId.value) {
    showToast('请先保存本地草稿后再推送到公众号')
    return
  }
  await loadWechatMediaId()
  wechatPublishVisible.value = true
}

const wechatMediaId = ref('')
const wechatCoverMediaId = ref('')

async function loadWechatMediaId() {
  if (currentDraftId.value) {
    const draft = await DraftStorage.getById(currentDraftId.value)
    wechatMediaId.value = draft?.wechatMediaId || ''
    wechatCoverMediaId.value = draft?.wechatCoverMediaId || ''
  } else {
    wechatMediaId.value = ''
    wechatCoverMediaId.value = ''
  }
}

async function handleWechatSaved(mediaId: string, coverMediaId: string) {
  showToast('草稿已保存，请前往公众号后台查看')
  if (currentDraftId.value) {
    if (mediaId) await DraftStorage.updateWechatMediaId(currentDraftId.value, mediaId)
    if (coverMediaId) await DraftStorage.updateWechatCoverMediaId(currentDraftId.value, coverMediaId)
  }
}

function handleCopyHTML() {
  previewRef.value?.copyHTML()
}

async function handleExportFullHTML() {
  const html = previewRef.value?.getHTML() || ''
  const fullDoc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extractedTitle.value || 'R-Markdown 导出'}</title>
  <style>
    body {
      max-width: 677px;
      margin: 0 auto;
      padding: 20px 0;
    }
  </style>
</head>
<body>
${html}
</body>
</html>`

  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const filePath = await save({
      defaultPath: (extractedTitle.value || 'export') + '.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
    if (!filePath) return
    await writeTextFile(filePath, fullDoc)
    showToast('完整HTML已导出')
  } catch {
    const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (extractedTitle.value || 'export') + '.html'
    a.click()
    URL.revokeObjectURL(url)
    showToast('完整HTML已下载')
  }
}

function handleSaveImage() {
  previewRef.value?.saveAsImage()
}

// ── 草稿业务方法 ──
function handleOpenSaveDraft() {
  saveDraftVisible.value = true
}

// ── 素材业务方法 ──

function handleOpenSaveMaterial() {
  saveMaterialVisible.value = true
}

async function handleSaveMaterial(name: string, author: string, category: string, subCategory: string, description: string) {
  const raw = markdown.value
  if (!raw.trim()) {
    showToast('编辑器内容为空')
    return
  }
  const content = raw.trim()

  // 检查是否有相同内容的素材
  const allMaterials = await MaterialStorage.list()
  const sameContent = allMaterials.find((m) => m.content === content)
  if (sameContent) {
    pendingMaterial.value = { name, author: author || '匿名', category, subCategory, description }
    pendingMaterialContent.value = content
    pendingOverwriteMaterialId.value = sameContent.id
    pendingOverwriteMaterialName.value = sameContent.name
    confirmMaterialOverwriteVisible.value = true
    return
  }

  await doSaveMaterial(name, author || '匿名', category, subCategory, description, content)
}

async function doSaveMaterial(name: string, author: string, category: string, subCategory: string, description: string, content: string) {
  const item: MaterialItem = {
    id: crypto.randomUUID(),
    name,
    author,
    category,
    subCategory: subCategory || undefined,
    description: description || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content,
  }
  await MaterialStorage.save(item)
  saveMaterialVisible.value = false
  confirmMaterialOverwriteVisible.value = false
  showToast('素材已保存')
}

async function handleMaterialOverwrite() {
  if (!pendingMaterial.value || !pendingOverwriteMaterialId.value) return
  const existing = await MaterialStorage.get(pendingOverwriteMaterialId.value)
  if (!existing) return
  const updated: MaterialItem = {
    ...existing,
    name: pendingMaterial.value.name,
    author: pendingMaterial.value.author,
    category: pendingMaterial.value.category,
    subCategory: pendingMaterial.value.subCategory || undefined,
    description: pendingMaterial.value.description || undefined,
    content: pendingMaterialContent.value,
    updatedAt: new Date().toISOString(),
  }
  await MaterialStorage.save(updated)
  saveMaterialVisible.value = false
  confirmMaterialOverwriteVisible.value = false
  showToast('素材已覆盖')
}

async function handleMaterialSaveAsNew() {
  if (!pendingMaterial.value) return
  confirmMaterialOverwriteVisible.value = false
  await doSaveMaterial(pendingMaterial.value.name, pendingMaterial.value.author, pendingMaterial.value.category, pendingMaterial.value.subCategory, pendingMaterial.value.description, pendingMaterialContent.value)
}

function handleCancelMaterialOverwrite() {
  confirmMaterialOverwriteVisible.value = false
  pendingMaterial.value = null
  pendingMaterialContent.value = ''
  pendingOverwriteMaterialId.value = null
}

function handleInsertMaterial(item: MaterialItem) {
  if (!editorRef.value) return
  editorRef.value.insertAtCursor('\n' + item.content)
  showMaterialPanel.value = false
  showToast('素材已插入')
}

// 标题变更确认弹窗状态
const confirmOverwriteVisible = ref(false)
const confirmOverwriteMode = ref<'title-changed' | 'same-title-draft'>('title-changed')
const pendingDraftTitle = ref('')
const pendingOverwriteDraftId = ref<number | null>(null)

// 素材重复内容确认弹窗状态
const confirmMaterialOverwriteVisible = ref(false)
const pendingMaterial = ref<{ name: string; author: string; category: string; subCategory: string; description: string } | null>(null)
const pendingMaterialContent = ref('')
const pendingOverwriteMaterialId = ref<string | null>(null)
const pendingOverwriteMaterialName = ref('')

async function handleSaveDraft(_draftId: number, title: string) {
  const isDup = await DraftStorage.isDuplicate(title, markdown.value, currentDraftId.value ?? undefined)
  if (isDup) {
    showToast('内容无变化，无需重复保存')
    return
  }

  // 如果正在编辑已有草稿但标题变了，弹选项
  if (currentDraftId.value) {
    const existing = await DraftStorage.getById(currentDraftId.value)
    if (existing && existing.title !== title) {
      pendingDraftTitle.value = title
      confirmOverwriteMode.value = 'title-changed'
      confirmOverwriteVisible.value = true
      return
    }
  } else {
    // 无关联草稿时，检查是否存在同名草稿
    const allDrafts = await DraftStorage.list()
    const sameNameDraft = allDrafts.find((d) => d.title === title)
    if (sameNameDraft) {
      pendingDraftTitle.value = title
      pendingOverwriteDraftId.value = sameNameDraft.id!
      confirmOverwriteMode.value = 'same-title-draft'
      confirmOverwriteVisible.value = true
      return
    }
  }

  await doSaveDraft(title, currentDraftId.value ?? undefined)
}

async function doSaveDraft(title: string, targetId?: number) {
  if (targetId !== undefined) {
    await DraftStorage.save(title, markdown.value, targetId)
    currentDraftId.value = targetId
  } else {
    const id = await DraftStorage.save(title, markdown.value)
    currentDraftId.value = id
  }
  saveDraftVisible.value = false
  confirmOverwriteVisible.value = false
  showToast('草稿已保存')
  await refreshDrafts()
}

function handleOverwrite() {
  const targetId = confirmOverwriteMode.value === 'same-title-draft'
    ? pendingOverwriteDraftId.value!
    : currentDraftId.value!
  doSaveDraft(pendingDraftTitle.value, targetId)
}

function handleSaveAsNew() {
  confirmOverwriteVisible.value = false
  doSaveDraft(pendingDraftTitle.value)
}

function handleCancelOverwrite() {
  confirmOverwriteVisible.value = false
  pendingDraftTitle.value = ''
}

async function handleLoadDraft(id: number) {
  const draft = await DraftStorage.getById(id)
  if (draft) {
    markdown.value = draft.content
    currentDraftId.value = draft.id!
    // 重置缩略图指示器到顶部
    minimapScrollRatio.value = 0
    minimapViewportRatio.value = 0
    if (previewScrollEl) {
      previewScrollEl.scrollTop = 0
    }
    showToast('已加载草稿')
    draftListVisible.value = false
  }
}

async function handleDeleteDraft(id: number) {
  await DraftStorage.remove(id)
  if (currentDraftId.value === id) {
    currentDraftId.value = null
  }
  showToast('草稿已删除')
  await refreshDrafts()
  // 删除后重新匹配草稿
  setTimeout(() => matchExistingDraft(), 300)
}

function onDraftConfirmLoad(payload: { draftId: number; title: string }) {
  draftPendingAction.value = { type: 'load', draftId: payload.draftId }
  draftConfirmTitle.value = '重新编辑'
  draftConfirmMessage.value = `将重新编辑「${payload.title}」，当前编辑内容将被覆盖。`
  draftConfirmType.value = 'accent'
  draftConfirmText.value = '重新编辑'
  draftConfirmVisible.value = true
}

function onDraftConfirmDelete(payload: { draftId: number; title: string }) {
  draftPendingAction.value = { type: 'delete', draftId: payload.draftId }
  draftConfirmTitle.value = '删除草稿'
  draftConfirmMessage.value = `将永久删除草稿「${payload.title}」，此操作不可撤销。`
  draftConfirmType.value = 'danger'
  draftConfirmText.value = '删除'
  draftConfirmVisible.value = true
}

function onDraftConfirm() {
  if (!draftPendingAction.value) return
  const { type, draftId } = draftPendingAction.value
  draftPendingAction.value = null
  draftConfirmVisible.value = false
  if (type === 'load') {
    handleLoadDraft(draftId)
  } else {
    handleDeleteDraft(draftId)
  }
}

function handleOpenFinalize() {
  finalizeVisible.value = true
}

async function handleFinalize(title: string) {
  const safeName = sanitizeFilename(title)
  try {
    // 桌面端：弹出原生保存对话框选择路径
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const filePath = await save({
      defaultPath: safeName + '.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (!filePath) return // 用户取消
    await writeTextFile(filePath, markdown.value)
    showToast('已保存')
  } catch {
    // Web 端 / 对话框失败：降级为下载
    const blob = new Blob([markdown.value], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = safeName + '.md'
    a.click()
    URL.revokeObjectURL(url)
    showToast('已下载')
  }
  finalizeVisible.value = false
  // 定稿成功后，如有当前草稿则询问是否删除
  if (currentDraftId.value !== null) {
    // 等定稿弹窗关闭动画结束后再弹出确认
    setTimeout(() => {
      finalizeDeleteConfirmVisible.value = true
    }, 200)
  }
}

async function handleDeleteAfterFinalize() {
  finalizeDeleteConfirmVisible.value = false
  if (currentDraftId.value !== null) {
    await DraftStorage.remove(currentDraftId.value)
    currentDraftId.value = null
    showToast('草稿已删除')
    await refreshDrafts()
  }
}

// 滚动同步
let pendingRatio: number | null = null
let syncSource: 'editor' | 'preview' | null = null
let rafId = 0
let isFlushing = false

function flushSync() {
  rafId = 0
  if (pendingRatio === null || syncSource === null) return
  const ratio = pendingRatio
  const src = syncSource
  pendingRatio = null
  syncSource = null

  isFlushing = true
  if (src === 'editor') {
    const previewScroll = document.querySelector('.preview-scroll') as HTMLElement
    if (previewScroll) {
      const maxScroll = previewScroll.scrollHeight - previewScroll.clientHeight
      const target = ratio * maxScroll
      if (Math.abs(previewScroll.scrollTop - target) > 1) {
        previewScroll.scrollTop = target
      }
    }
  } else {
    const scroller = document.querySelector('.cm-scroller') as HTMLElement
    if (scroller) {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight
      const target = ratio * maxScroll
      if (Math.abs(scroller.scrollTop - target) > 1) {
        scroller.scrollTop = target
      }
    }
  }
  isFlushing = false
}

function scheduleSync() {
  if (!rafId) rafId = requestAnimationFrame(flushSync)
}

function handleEditorScroll(ratio: number) {
  if (isFlushing) return
  if (isMobile.value && mobileTab.value !== 'editor') return
  syncSource = 'editor'
  pendingRatio = ratio
  scheduleSync()
}

function handlePreviewScroll(ratio: number) {
  if (isFlushing) return
  syncSource = 'preview'
  pendingRatio = ratio
  scheduleSync()
}

let previewScrollEl: HTMLElement | null = null
let previewObserver: MutationObserver | null = null

function onPreviewScroll() {
  if (isFlushing) return
  if (!previewScrollEl) previewScrollEl = document.querySelector('.preview-scroll')
  if (!previewScrollEl) return
  const maxScroll = previewScrollEl.scrollHeight - previewScrollEl.clientHeight
  if (maxScroll > 0) {
    const ratio = previewScrollEl.scrollTop / maxScroll
    handlePreviewScroll(ratio)
    if (isMobile.value) {
      nearBottom.value = ratio > 0.85
    }
  }
  // 更新 minimap 滚动状态
  minimapScrollRatio.value = maxScroll > 0 ? previewScrollEl.scrollTop / maxScroll : 0
  minimapViewportRatio.value = previewScrollEl.scrollHeight > 0 ? previewScrollEl.clientHeight / previewScrollEl.scrollHeight : 1
}

onMounted(() => {
  previewScrollEl = document.querySelector('.preview-scroll')
  if (previewScrollEl) {
    previewScrollEl.addEventListener('scroll', onPreviewScroll, { passive: true })
    // MutationObserver 监听 Preview 内容 DOM 变更，渲染完成后自动更新指示器
    previewObserver = new MutationObserver(() => {
      requestAnimationFrame(() => onPreviewScroll())
    })
    previewObserver.observe(previewScrollEl, { childList: true, subtree: true })
    // 初始加载兜底：renderAll 的 setTimeout 300ms 后才完成 mermaid 渲染
    requestAnimationFrame(() => onPreviewScroll())
    setTimeout(() => onPreviewScroll(), 350)
  }
})
onBeforeUnmount(() => {
  previewScrollEl?.removeEventListener('scroll', onPreviewScroll)
  previewObserver?.disconnect()
})

function onMinimapNavigate(ratio: number) {
  const el = previewScrollEl
  if (!el) return
  const maxScroll = el.scrollHeight - el.clientHeight
  el.scrollTop = ratio * maxScroll
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
            <text x="3.5" y="16" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="white">RM</text>
          </svg>
          <span class="hidden sm:inline"
            >R-Markdown 编辑器</span
          >
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
        <CircleCheck v-if="saveMode" :size="14" color="var(--accent)" class="hidden sm:inline shrink-0 ml-1" />
        <span class="sm:hidden text-[11px] opacity-50 ml-2 shrink-0">{{ saveHint }}</span>
        <CircleCheck v-if="saveMode" :size="14" color="var(--accent)" class="sm:hidden shrink-0 ml-1" />
        <BaseTooltip v-if="currentDraftId" class="inline-flex ml-1" :text="'已关联草稿：' + currentDraftTitle" placement="bottom">
          <Link :size="14" class="w-3.5 h-3.5 shrink-0" :style="{ color: colors.accent }" />
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
          @download-demo="downloadDemo"
          @export-full-html="handleExportFullHTML"
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
      <div class="flex flex-1 overflow-hidden" :style="{ padding: isMobile ? '0px' : '10px', background: 'var(--bg-frame)' }">
      <!-- 桌面端左侧侧栏 -->
      <div class="hidden md:flex shrink-0">
        <EditorSidebar
          :active-tab="sidebarTab"
          :draft-count="draftCount"
          @select="onSidebarSelect"
          @open-settings="settingsVisible = true"
          @open-gallery="showGallery = true"
          @material-action="onMaterialAction"
          @open-components="$router.push('/components')"
          @open-drafts="draftListVisible = true"
          @example-action="onExampleAction"
          @open-import="onImportClick"
        />
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
          class="panel-header hidden md:flex items-center justify-between px-4 py-2 border-b text-xs font-semibold shrink-0"
          style="background: var(--bg-primary)"
        >
          <span class="flex flex-wrap items-center gap-3">
            <!-- 操作按钮组：图标+文字 -->
            <span class="flex items-center gap-1">
              <!-- 基础语法 -->
              <span class="relative inline-flex items-center group">
                <button
                  class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                  :class="editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                  :disabled="!editorRef?.isAtLineStart"
                >
                  <component :is="markdownInsertOptions[1].icon" :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                  <span>基础语法</span>
                </button>
                <span
                  class="absolute top-full left-0 mt-0.5 py-1 min-w-[120px] rounded-lg bg-white dark:bg-[#1a1a1a] shadow-lg border border-[#e5e5e5] dark:border-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50"
                  :class="!editorRef?.isAtLineStart ? 'pointer-events-none' : ''"
                >
                  <template v-for="opt in markdownInsertOptions" :key="opt.label">
                    <div
                      v-if="opt.table"
                      class="relative"
                      :class="editorRef?.isAtLineStart ? 'group/table' : 'cursor-not-allowed opacity-40'"
                    >
                      <div class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none">
                        <component :is="opt.icon" :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
                        <span class="text-[#333] dark:text-white font-medium">表格</span>
                        <span class="text-[#999] dark:text-white/40 ml-auto">{{ opt.label }}</span>
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
                            :style="isGridCellActive(i) ? { borderColor: colors.accent, backgroundColor: colors.accent + '20' } : {}"
                            :disabled="!editorRef?.isAtLineStart"
                            @mousemove="editorRef?.isAtLineStart && (tableGridHovered = { rows: Math.ceil(i / MAX_GRID_COLS), cols: (i - 1) % MAX_GRID_COLS + 1 })"
                            @click="editorRef?.isAtLineStart && insertTable(tableGridHovered.rows, tableGridHovered.cols)"
                          />
                        </div>
                        <div class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none">
                          {{ tableGridHovered.rows }} 行 × {{ tableGridHovered.cols }} 列

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
                      <component :is="opt.icon" :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
                      <span class="text-[#333] dark:text-white font-medium">{{ opt.display }}</span>
                      <span class="text-[#999] dark:text-white/40 ml-auto">{{ opt.label }}</span>
                    </button>
                  </template>
                </span>
              </span>
              <!-- 容器/布局 -->
              <span class="relative inline-flex items-center group">
                <button
                  class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                  :class="editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
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
                    :class="editorRef?.isAtLineStart ? 'group/col' : 'cursor-not-allowed opacity-40'"
                  >
                    <div class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap">
                      <Columns2 :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
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
                          :class="isColCellActive(i) ? '' : 'border-[#d0d0d0] dark:border-white/15 bg-transparent'"
                          :style="isColCellActive(i) ? { borderColor: colors.accent, backgroundColor: colors.accent + '20' } : {}"
                          :disabled="!editorRef?.isAtLineStart"
                          @mousemove="editorRef?.isAtLineStart && (colGridHovered = i)"
                          @click="editorRef?.isAtLineStart && insertColumnLayout(colGridHovered)"
                        />
                      </div>
                      <div class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none">
                        {{ colGridHovered }} 列均分
                      </div>
                    </div>
                  </div>
                  <!-- 列（独立，无 Row 包裹） -->
                  <div
                    class="relative"
                    :class="editorRef?.isAtLineStart ? 'group/colstack' : 'cursor-not-allowed opacity-40'"
                  >
                    <div class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap">
                      <Columns2 :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
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
                          :class="isColCellActive(i) ? '' : 'border-[#d0d0d0] dark:border-white/15 bg-transparent'"
                          :style="isColCellActive(i) ? { borderColor: colors.accent, backgroundColor: colors.accent + '20' } : {}"
                          :disabled="!editorRef?.isAtLineStart"
                          @mousemove="editorRef?.isAtLineStart && (colGridHovered = i)"
                          @click="editorRef?.isAtLineStart && insertColumnStack(colGridHovered)"
                        />
                      </div>
                      <div class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none">
                        {{ colGridHovered }} 列独立
                      </div>
                    </div>
                  </div>
                  <!-- 行 -->
                  <div
                    class="relative"
                    :class="editorRef?.isAtLineStart ? 'group/row' : 'cursor-not-allowed opacity-40'"
                  >
                    <div class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap">
                      <Rows2 :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
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
                          :class="isRowCellActive(i) ? '' : 'border-[#d0d0d0] dark:border-white/15 bg-transparent'"
                          :style="isRowCellActive(i) ? { borderColor: colors.accent, backgroundColor: colors.accent + '20' } : {}"
                          :disabled="!editorRef?.isAtLineStart"
                          @mousemove="editorRef?.isAtLineStart && (rowGridHovered = i)"
                          @click="editorRef?.isAtLineStart && insertRowStack(rowGridHovered)"
                        />
                      </div>
                      <div class="text-center text-[11px] text-[#666] dark:text-white/50 mt-1.5 leading-none">
                        {{ rowGridHovered }} 行纵向堆叠
                      </div>
                    </div>
                  </div>
                  <!-- 层叠 -->
                  <div
                    class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                    :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                    @click="editorRef?.isAtLineStart && insertStack()"
                  >
                    <Layers :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
                    <span class="text-[#333] dark:text-white font-medium">层叠</span>
                    <span class="text-[#999] dark:text-white/40 ml-auto">多层叠加</span>
                  </div>
                  <!-- 容器 -->
                  <div
                    class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                    :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                    @click="editorRef?.isAtLineStart && insertContainer()"
                  >
                    <Package :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
                    <span class="text-[#333] dark:text-white font-medium">块容器</span>
                    <span class="text-[#999] dark:text-white/40 ml-auto">通用包裹</span>
                  </div>
                  <!-- 文本 -->
                  <div
                    class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                    :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                    @click="editorRef?.isAtLineStart && insertText()"
                  >
                    <Type :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
                    <span class="text-[#333] dark:text-white font-medium">文本</span>
                    <span class="text-[#999] dark:text-white/40 ml-auto">样式文字</span>
                  </div>
                    <!-- HTML 容器 -->
                  <div
                     class="flex items-center gap-2 px-3 py-1.5 text-[11px] leading-none whitespace-nowrap cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-white/5 transition-colors duration-75"
                     :class="!editorRef?.isAtLineStart ? 'cursor-not-allowed opacity-40' : ''"
                     @click="editorRef?.isAtLineStart && insertHtmlContainer()"
                  >
                    <Code2 :size="14" class="w-3.5 h-3.5 flex-shrink-0" :style="{ color: colors.accent }" />
                    <span class="text-[#333] dark:text-white font-medium">HTML 容器</span>
                    <span class="text-[#999] dark:text-white/40 ml-auto">内联样式</span>
                  </div>
                </span>
              </span>
              <BaseTooltip text="临时存储本地图片">
              <button
                class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                :class="editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                :disabled="!editorRef?.isAtLineStart"
                @click="editorRef?.isAtLineStart && handleInsertImage()"
              >
                <Image :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                <span>临时</span>
              </button>
              </BaseTooltip>
              <BaseTooltip text="长期存储本地图片">
              <button
                class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                :class="editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                :disabled="!editorRef?.isAtLineStart"
                @click="editorRef?.isAtLineStart && handleInsertImagePersist()"
              >
                <ImagePlus :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                <span>长期</span>
              </button>
              </BaseTooltip>
              <BaseTooltip text="上传到图床">
              <button
                class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                :class="editorRef?.isAtLineStart && !githubUploading ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                :disabled="!editorRef?.isAtLineStart || githubUploading"
                @click="editorRef?.isAtLineStart && !githubUploading && handleUploadToGitHub()"
              >
                <ImageUp :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                <span>图床</span>
              </button>
              </BaseTooltip>
              <BaseTooltip text="插入组件">
              <button
                class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                :class="editorRef?.isAtLineStart ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                :disabled="!editorRef?.isAtLineStart"
                @click="editorRef?.isAtLineStart && (componentDialogVisible = true)"
              >
                <Puzzle :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                <span>组件</span>
              </button>
              </BaseTooltip>
              <BaseTooltip :text="tagInfo ? '解析 <' + tagInfo.tagName + '> 属性' : '解析标签 — 选中扩展组件标签后可用'">
              <button
                class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium"
                :class="(tagInfo && !showTagDialog && !isMobile) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                :disabled="!tagInfo || showTagDialog || isMobile"
                @click="tagInfo && !showTagDialog && !isMobile && (showTagDialog = true)"
              >
                <Braces :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
                <span>解析</span>
              </button>
              </BaseTooltip>
            </span>
            <!-- 行内样式按钮组 -->
            <span class="flex items-center gap-0.5">
              <BaseTooltip
                v-for="opt in inlineFormatOptions"
                :key="opt.syntax"
                :text="opt.label + '：' + opt.hint"
              >
              <button
                class="inline-flex items-center justify-center w-7 h-7 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn"
                :class="editorRef?.hasInlineSelection ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                :disabled="!editorRef?.hasInlineSelection"
                @click="editorRef?.hasInlineSelection && editorRef?.applyInlineFormat(opt.syntax, opt.wrapType ?? 'delim')"
              >
                <component :is="formatIcons[opt.syntax]" :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
              </button>
              </BaseTooltip>
            </span>
            <!-- 帮助提示 -->
            <BaseTooltip placement="bottom">
              <CircleQuestionMark :size="14" />
              <template #content>
                选中非标签内文字后可加样式<br>基础语法/临时/长期/图床/组件：仅空行可点击<br>解析：选中组件标签后可点击。
              </template>
            </BaseTooltip>
          </span>
          <span class="flex flex-col lg:flex-row lg:items-center gap-1">
          <BaseTooltip v-if="isTauri && !autoSaveEnabled" text="暂存">
          <button
            class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
            @click="saveContent(markdown, true)"
          >
            <Save :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
            <span>暂存</span>
          </button>
          </BaseTooltip>
          <BaseTooltip text="保存草稿">
          <button
            class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent
                   transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
            @click="handleOpenSaveDraft"
          >
            <SquareBottomDashedScissors :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
            <span>草稿</span>
          </button>
          </BaseTooltip>
          <BaseTooltip text="定稿导出">
          <button
            class="inline-flex items-center gap-1 h-7 px-2 rounded-[5px] border-none bg-transparent
                   transition-all duration-150 panel-action-btn text-[11px] font-medium cursor-pointer whitespace-nowrap"
            @click="handleOpenFinalize"
          >
            <CheckCircle :size="14" class="w-3.5 h-3.5" :style="{ color: colors.accent }" />
            <span>定稿</span>
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
        <div class="flex flex-1 overflow-hidden relative">
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
          <TagPropsForm
            :visible="showTagDialog && !isMobile"
            :tag-info="tagInfo"
            @close="
              showTagDialog = false;
              tagInfo = null
            "
            @update="onTagDialogUpdate"
          />
        </div>
      </div>

      <!-- Resize Handle (仅桌面端) -->
      <div
        class="resize-handle hidden md:block"
        @mousedown="onDragStart"
        @mouseenter="onHandleEnter"
        @mousemove="onHandleMove"
        @mouseleave="onHandleLeave"
        ref="resizeHandleRef"
      >
        <div
          class="resize-handle-btn"
          :class="{ 'resize-handle-btn--visible': handleBtnVisible }"
          :style="{ top: handleBtnTop + 'px' }"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
        :style="isMobile ? { background: 'var(--bg-primary)' } : { width: previewWidth + 'px', background: 'var(--bg-primary)' }"
      >
        <Preview ref="previewRef" :markdown="resolvedMarkdown" :colors="colors" :is-mobile="isMobile" @click-line="onPreviewClickLine" />
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
  <SettingsDialog :visible="settingsVisible" :initialTab="settingsInitialTab" @close="settingsVisible = false" />
  <PublishToWechatDialog
    :visible="wechatPublishVisible"
    :title="extractedTitle"
    :content="markdown"
    :updateMediaId="wechatMediaId"
    :initialCoverMediaId="wechatCoverMediaId"
    @close="wechatPublishVisible = false"
    @saved="handleWechatSaved"
  />
  <ImageCacheDialog
    :visible="showGallery"
    mode="gallery"
    @close="showGallery = false"
    @insert="(token: string) => { showGallery = false; editorRef?.insertAtCursor(`<img src=&quot;idb:${token}&quot; width=&quot;100%&quot; height=&quot;auto&quot; radius=&quot;8px&quot; fit=&quot;cover&quot; />`) }"
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

  <!-- 草稿列表弹窗 -->
  <DraftListDialog
    :visible="draftListVisible"
    :drafts="drafts"
    @close="draftListVisible = false"
    @confirm-load="onDraftConfirmLoad"
    @confirm-delete="onDraftConfirmDelete"
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
    :message="confirmOverwriteMode === 'same-title-draft'
      ? '已存在同名草稿「' + pendingDraftTitle + '」，请选择操作：'
      : '原标题与草稿「' + currentDraftTitle + '」不一致，请选择操作：'"
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
    :message="'素材「' + pendingMaterial?.name + '」与已有素材「' + pendingOverwriteMaterialName + '」内容相同，请选择操作：'"
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
</style>
