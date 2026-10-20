<script setup lang="ts">
/**
 * AI 配图面板。
 *
 * 职责边界：只负责「提示词 + 参数 → 出图 → 预览」，并把选中的图片以 File 形式交给调用方。
 * 图片的落盘方式（本地 IndexedDB / 本地磁盘 / GitHub 图床 / 乐塔图床）完全交给编辑器的
 * useImageInsert 处理，与手动粘贴一张图片走同一条链路，面板内不做存储判断。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Loader2,
  Sparkles,
  Settings2,
  Download,
  RefreshCw,
  Wand2,
  Sparkle,
  Eraser,
} from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useTheme } from '@/composables/useTheme'
import { getErrorMessage } from '@/utils/helpers'
import { extractTitle } from '@/utils/extractTitle'
import { saveBinaryFile, blobToBytes } from '@/utils/saveFile'
import { useSessionCountdown } from '@/composables/useSessionCountdown'
import { expiresAtFrom, isExpiredAt } from '@/utils/aiSession'
import {
  clearAllBlobs,
  clearRecord,
  loadBlob,
  loadRecord,
  saveBlob,
  saveRecord,
} from '@/services/aiSessionStore'
import {
  generateImage,
  toImageBlob,
  optimizeImagePrompt,
  type ImageGenResult,
} from '@/services/imageGen'
import {
  IMAGE_PROVIDERS,
  CUSTOM_RATIO,
  getActiveProviderId,
  getImageProvider,
  getProviderConfig,
  setActiveProviderId,
  setProviderConfig,
  resolveOutputSize,
  supportsCustomSize,
  getImageRelay,
  isImageProviderConfigured,
  missingImageConfigFields,
  type ImageGenProviderConfig,
} from '@/services/imageProviders'
import { getSetting, setSetting } from '@/config/settings'
import { resolveAiConfig, isAiConfigured } from '@/services/aiFormat'

const props = defineProps<{
  visible: boolean
  /** 编辑器当前内容（仅用于「用文章当主题」这一条快捷填充） */
  markdown: string
  /** 图床上传进行中（来自编辑器的 useImageInsert，用于禁用按钮并显示进度） */
  uploading?: boolean
}>()

const emit = defineEmits<{
  close: []
  /** 用户确认插入：面板只产出图片文件，落地交给编辑器既有链路 */
  insert: [file: File]
  /** 上传图床并插入：走编辑器的图床上传（GitHub / 乐塔），上传期间面板不关闭 */
  upload: [file: File]
  /** 保存磁盘并插入：仅桌面端显示，复用编辑器既有的本地磁盘落盘链路 */
  saveDisk: [file: File]
  /** 跳转设置（落到「AI 设置 → AI 图片」子页） */
  openSettings: []
}>()

const { colors } = useTheme()

/** 一次生成的结果（含本地预览地址与文件） */
interface GeneratedImage {
  id: string
  /** 供 <img> 预览的地址 */
  previewUrl: string
  /** 交给编辑器的图片文件（插入时直接用，避免二次下载） */
  file: File
  /** 展示用尺寸文案，如 1024×1024 · 1K */
  sizeLabel: string
  /** 文件大小文案，如 1.2 MB */
  sizeText: string
  /** 模型改写后的提示词（可能为空） */
  revisedPrompt: string
  /** 本次生成使用的提示词，便于二次编辑 */
  prompt: string
}

// ── 配置 ──
const providerId = ref(getActiveProviderId())
const providerDef = computed(() => getImageProvider(providerId.value))
const cfg = ref(getProviderConfig(providerId.value))

/**
 * 配置状态必须走响应式 ref：
 * getProviderConfig() 只读 localStorage（非响应式），直接放进 computed 会永久缓存，
 * 表现为「去设置填完 Key 回来，面板仍显示待配置」。
 */
function refreshConfig() {
  providerId.value = getActiveProviderId()
  cfg.value = getProviderConfig(providerId.value)
}

const configured = computed(() => isImageProviderConfigured(cfg.value))

function onSettingChanged(e: Event) {
  const key = (e as CustomEvent).detail?.key
  if (key === 'imageGenProviders' || key === 'imageGenProvider') refreshConfig()
}

onMounted(() => {
  window.addEventListener('setting-changed', onSettingChanged)
  window.addEventListener('setting-changed', onAiSettingChanged)
})
onBeforeUnmount(() => {
  window.removeEventListener('setting-changed', onSettingChanged)
  window.removeEventListener('setting-changed', onAiSettingChanged)
})

// ── 参数 ──
/**
 * 提示词草稿：初值取上次保存的内容，让人「重开面板还是在原来那句话上改」。
 *
 * 配图的常见节奏是改几个字再出一版，每次都重敲长提示词很烦。
 * 持久化只跟着输入走（见下面的 watch），与生成结果、保留时长都无关；
 * 需要重来点「清空」即可。
 */
const prompt = ref(getSetting<string>('aiImagePrompt') || '')

/** 提示词改动就落盘（防抖：连续输入不必每个字符都写一次 localStorage） */
let promptSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(prompt, (v) => {
  if (promptSaveTimer) clearTimeout(promptSaveTimer)
  promptSaveTimer = setTimeout(() => setSetting('aiImagePrompt', v, true), 400)
})

/**
 * 手动清空提示词。
 *
 * 只改 ref：落盘由上面那个 watch 统一负责（含防抖），这里再写一次是多余的，
 * 而且会和 watch 的 400ms 防抖抢着写同一个键。
 */
function onClearPrompt() {
  prompt.value = ''
}

/** 参数改动即持久化：下次打开面板沿用上次的选择 */
type ParamsPatch = Partial<
  Pick<
    ImageGenProviderConfig,
    'model' | 'size' | 'ratio' | 'width' | 'height' | 'quality' | 'background' | 'moderation'
  >
>

function persistParams(patch: ParamsPatch) {
  setProviderConfig(providerId.value, patch)
  // 重新读一次而不是直接合并：width/height 在非自定义比例下会被收敛成 0，
  // 直接合并会让界面留着上一次的旧宽高，和存储里的值对不上。
  cfg.value = getProviderConfig(providerId.value)
}

function onProviderChange(id: string) {
  setActiveProviderId(id)
  refreshConfig()
}

/** 当前选择对应的像素尺寸与展示文案（换算只发生在 resolveOutputSize 里） */
const outputSize = computed(() => resolveOutputSize(providerDef.value, cfg.value))

/** 该厂商是否支持自定义像素宽高 */
const canCustomSize = computed(() => supportsCustomSize(providerDef.value))

/** 比例下拉选项：预设比例 + （支持时）自定义 */
const ratioOptions = computed(() => {
  const base = providerDef.value.ratios.map((r) => ({ value: r, label: r }))
  return canCustomSize.value ? [...base, { value: CUSTOM_RATIO, label: '自定义' }] : base
})

/** 比例选了「自定义」：此时不选分辨率档位，改填宽高 */
const isCustomRatio = computed(() => cfg.value.ratio === CUSTOM_RATIO && canCustomSize.value)

/**
 * 宽高输入的合法区间与对齐粒度。
 *
 * 对齐到 step（官方表里所有边长都是 16 的倍数）而不是随便接受任意整数：
 * 不对齐的话自定义模式发出的像素和预设模式是两种口径，部分中转站会直接 422。
 */
const customSize = computed(() => providerDef.value.customSize)
const dimMin = computed(() => customSize.value?.min ?? 256)
const dimMax = computed(() => customSize.value?.max ?? 4096)
const dimStep = computed(() => customSize.value?.step ?? 16)

/**
 * 宽高输入回写。
 *
 * change 而不是 input：用户敲 "1920" 的过程中会依次出现 1 / 19 / 192，
 * 每次 input 都存盘并夹到 step 上，光标位置和输入内容都会被打乱。
 */
function onDimensionChange(edge: 'width' | 'height', e: Event) {
  const el = e.target as HTMLInputElement
  persistParams({ [edge]: Number(el.value) || 0 })
  // 值被 clip 到区间或对齐后可能与输入不同，回显一次让用户看到最终的数值
  el.value = String(edge === 'width' ? cfg.value.width : cfg.value.height)
}

/**
 * 参数行控件的公共 class。
 *
 * 抽出来是因为这一行现在有 5–7 个控件（厂商 / 比例 / 分辨率 / 宽高 / 质量 / 背景 / 审核），
 * 每个都内联一长串 class 会让模板没法读；样式本身与原来完全一致。
 */
const paramLabelClass = 'text-[12px] text-[#666] dark:text-[#999]'
/** 输入框与下拉共用的外框；下拉再叠箭头相关的那几个类 */
const paramFieldClass =
  'rounded-lg border border-[#e5e5e5] bg-white px-2 py-1 text-[11px] text-[#1a1a1a] outline-none dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5]'
/**
 * 下拉框：抹掉系统原生箭头自己画一枚。
 * 原生箭头在 macOS 上又大又贴右边框，和设置页里的下拉长得不一样；
 * 这里用同一枚 SVG 图标，只是面板控件更紧凑，贴边距与右内边距都比设置页小一号。
 */
const paramSelectClass = `${paramFieldClass} cursor-pointer appearance-none bg-no-repeat bg-[right_5px_center] pr-5`
const paramChevronStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
}
/** 宽高输入框：定宽，否则 type=number 会撑满整行（不带下拉箭头那套 padding） */
const paramDimensionClass = `${paramFieldClass} w-[64px]`

/**
 * 输入框占位文案：把「推荐结构 + 示例」直接写进 placeholder，
 * 于是不必再在下方单占一行提示（省一行高度，信息也没丢）。
 */
const promptPlaceholder =
  '描述要生成的画面，越具体越好。\n推荐结构：主体 + 场景 + 风格 + 光照 + 构图 + 质量要求\n例如：晨雾中的山谷小镇，暖色晨光，广角构图，写实摄影风格，高细节'

// ── 生成 ──
const generating = ref(false)
const elapsedSec = ref(0)
/** 走中转站时的任务状态文案（如「生成中 45%」）；同步接口下始终为空 */
const taskStatus = ref('')
const errorMsg = ref('')
const current = ref<GeneratedImage | null>(null)
/** 本次生成的图片；内存 + 本地 IndexedDB（按保留时长自动作废） */
const history = ref<GeneratedImage[]>([])

/** 结果保留倒计时（用配图面板自己的保留时长设置项） */
const { now, remainingText, currentHours, startTicker, stopTicker, syncText } =
  useSessionCountdown('aiImageSessionHours')

/** 本次结果的过期时刻（null = 还没有结果）；倒计时与过期判定都读它 */
const resultExpiresAt = ref<number | null>(null)

/** 结果是否已过期 */
const resultExpired = computed(
  () => resultExpiresAt.value != null && isExpiredAt(resultExpiresAt.value, now.value),
)

let controller: AbortController | null = null
let timer: ReturnType<typeof setInterval> | null = null

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function abort() {
  controller?.abort()
  controller = null
  stopTimer()
  generating.value = false
}

/** 释放不再展示的预览地址，避免长期占用内存 */
function releaseImage(img: GeneratedImage) {
  URL.revokeObjectURL(img.previewUrl)
}

function resetAll() {
  abort()
  onStopOptimize()
  errorMsg.value = ''
  elapsedSec.value = 0
  current.value = null
  for (const img of history.value) releaseImage(img)
  history.value = []
}

/**
 * 把生成的图片与元信息存本地，下次打开面板若还没过期就恢复。
 *
 * 图片本体（Blob）另存 `blobs` store，元信息（提示词、尺寸、文件大小）走 JSON 记录：
 * Blob 不能进 JSON，而元信息也没必要塞进 blob store。
 */
const HISTORY_KEY = 'image-history'
/** 保留的历史条数上限（与内存态一致） */
const MAX_HISTORY = 8

async function persistHistory() {
  const lastActiveAt = Date.now()
  try {
    // 先存图片二进制，再存元信息（元信息里带 id，恢复时按 id 取回 blob）
    for (const img of history.value) {
      await saveBlob(img.id, img.file)
    }
    await saveRecord(
      HISTORY_KEY,
      history.value.map((img) => ({
        id: img.id,
        sizeLabel: img.sizeLabel,
        sizeText: img.sizeText,
        revisedPrompt: img.revisedPrompt,
        prompt: img.prompt,
      })),
      lastActiveAt,
      currentHours(),
    )
    resultExpiresAt.value = expiresAtFrom(lastActiveAt, currentHours())
    syncText(resultExpiresAt.value)
  } catch {
    // 落盘失败只影响「下次打开能否恢复」，不打断本次生成
  }
}

/** 恢复上次未过期的生成结果；返回是否恢复成功 */
async function restoreHistory(): Promise<boolean> {
  const rec = await loadRecord<
    { id: string; sizeLabel: string; sizeText: string; revisedPrompt: string; prompt: string }[]
  >(HISTORY_KEY, Date.now())

  const items = rec?.payload
  if (!Array.isArray(items) || items.length === 0) return false

  const restored: GeneratedImage[] = []
  for (const it of items) {
    if (!it?.id) continue
    const blob = await loadBlob(it.id)
    if (!blob) continue // 图片本体已丢（比如被清过），跳过这一条
    const ext = extFromMime(blob.type)
    const file = new File([blob], `ai-image-${it.id}.${ext}`, {
      type: blob.type || 'image/png',
    })
    restored.push({
      id: it.id,
      previewUrl: URL.createObjectURL(blob),
      file,
      sizeLabel: it.sizeLabel || '',
      sizeText: it.sizeText || '',
      revisedPrompt: it.revisedPrompt || '',
      prompt: it.prompt || '',
    })
  }
  if (restored.length === 0) return false

  history.value = restored
  current.value = restored[0]
  resultExpiresAt.value = Number(rec!.expiresAt)
  return true
}

/** 清空生成的图片：内存 + 本地缓存一起清（用户点按钮时先弹确认） */
function onClearHistory() {
  if (history.value.length === 0) return
  clearConfirmVisible.value = true
}

/**
 * 真正执行清空。手动「清空结果」和「保留时长到期」走同一段，
 * 保证两条路径的收尾（中止请求、清 blobs、清记录、清倒计时）完全一致。
 *
 * 到期时**连提示词草稿一起清**：整套状态是同一个保留窗口，结果都作废了，
 * 留着一份旧草稿反而容易误以为是新的。
 */
async function doClearHistory() {
  clearConfirmVisible.value = false
  abort()
  resetAll()
  resultExpiresAt.value = null
  remainingText.value = ''
  onClearPrompt()
  await clearRecord(HISTORY_KEY)
  await clearAllBlobs()
}

const clearConfirmVisible = ref(false)

/**
 * 保留时长到期 → 自动清空（结果图片 + 提示词草稿）。
 *
 * 用 watch(resultExpired) 而不是让 ticker 自己去清：resultExpired 由 now 驱动，
 * 而 ticker 每秒刷一次 now，所以「越过过期时刻」这个边沿只会出现一次，
 * 边沿触发最省，也不会重复清。过期只在**有结果**时成立（resultExpiresAt 非 null），
 * 因此不会在空态误触发。
 */
watch(resultExpired, (expired) => {
  if (expired && history.value.length > 0) void doClearHistory()
})

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      // 关闭时只中止进行中的请求；**结果留在内存与本地**，下次打开可继续用
      abort()
      stopTicker()
      return
    }
    refreshConfig()
    refreshAiReady()
    errorMsg.value = ''

    // 没有内存态结果时，尝试恢复上次未过期的生成结果
    if (history.value.length === 0) await restoreHistory()
    if (resultExpiresAt.value) {
      syncText(resultExpiresAt.value)
      startTicker(() => resultExpiresAt.value)
    }
  },
)

function isAbort(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'AbortError'
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('abort') || msg.includes('中止')
}

async function onGenerate() {
  const text = prompt.value.trim()
  errorMsg.value = ''

  if (!configured.value) {
    const missing = missingImageConfigFields(cfg.value)
    errorMsg.value = `尚未配置 AI 配图：请先在设置中填写${missing.join('、')}`
    return
  }
  if (!text) {
    errorMsg.value = '请先填写提示词'
    return
  }
  // 比例与分辨率在表里没有对应格子（或自定义宽高异常）时，先拦住，别发一个 size 为空的请求
  if (!outputSize.value.pixels) {
    errorMsg.value = '当前比例与分辨率没有对应的尺寸，请换一组参数'
    return
  }

  generating.value = true
  elapsedSec.value = 0
  taskStatus.value = ''
  // 发起请求即续期：保留时长按「最后一次请求」算，倒计时回满
  resultExpiresAt.value = expiresAtFrom(Date.now(), currentHours())
  syncText(resultExpiresAt.value)
  startTicker(() => resultExpiresAt.value)
  const startedAt = Date.now()
  timer = setInterval(() => {
    elapsedSec.value = Math.round((Date.now() - startedAt) / 1000)
  }, 500)
  controller = new AbortController()

  try {
    const result: ImageGenResult = await generateImage(
      {
        baseUrl: cfg.value.baseUrl,
        apiKey: cfg.value.apiKey,
        model: cfg.value.model,
        timeoutSec: cfg.value.timeoutSec,
        // 选过中转站才走「提交 → 轮询」，否则是同步接口
        relay: getImageRelay(cfg.value.relay),
      },
      {
        prompt: text,
        size: cfg.value.size,
        ratio: cfg.value.ratio,
        // 像素尺寸由 resolveOutputSize 统一换算，buildBody 直接透传
        pixels: outputSize.value.pixels,
        quality: cfg.value.quality,
        background: cfg.value.background,
        moderation: cfg.value.moderation,
      },
      providerDef.value.buildBody,
      providerDef.value.parseResponse,
      {
        signal: controller.signal,
        onTaskState(state) {
          const label = relayStatusLabel(state.status)
          taskStatus.value = state.progress > 0 ? `${label} ${Math.round(state.progress)}%` : label
        },
      },
    )

    const blob = await toImageBlob(result, Math.min(cfg.value.timeoutSec, 120), controller.signal)
    const img = buildImage(blob, result, text)
    current.value = img
    history.value = [img, ...history.value].slice(0, MAX_HISTORY)
    await persistHistory()
  } catch (e: unknown) {
    if (isAbort(e)) return
    errorMsg.value = getErrorMessage(e, '生成失败')
  } finally {
    generating.value = false
    controller = null
    taskStatus.value = ''
    stopTimer()
  }
}

/** 任务状态的展示文案：认识的状态翻成中文，不认识的直接显示原文 */
function relayStatusLabel(status: string): string {
  const relay = getImageRelay(cfg.value.relay)
  return relay?.statusText?.[status] || status || '处理中'
}

function buildImage(blob: Blob, result: ImageGenResult, usedPrompt: string): GeneratedImage {
  const ext = extFromMime(blob.type)
  const file = new File([blob], `ai-image-${timestamp()}.${ext}`, {
    type: blob.type || 'image/png',
  })
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    previewUrl: URL.createObjectURL(blob),
    file,
    sizeLabel: outputSize.value.label || cfg.value.size,
    sizeText: formatBytes(blob.size),
    revisedPrompt: result.revisedPrompt,
    prompt: usedPrompt,
  }
}

function extFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'png'
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ── 结果操作 ──
function onStop() {
  abort()
}

function onRegenerate() {
  if (!prompt.value.trim()) return
  void onGenerate()
}

function onInsert() {
  const img = current.value
  if (!img) return
  emit('insert', img.file)
  emit('close')
}

/** 上传图床并插入：交给编辑器既有的图床上传链路（GitHub / 乐塔） */
function onUploadToHosting() {
  const img = current.value
  if (!img) return
  emit('upload', img.file)
}

/**
 * 保存磁盘并插入：交给编辑器既有的本地磁盘落盘链路（与「粘贴/拖拽上传方式 = 本地磁盘」同一条）。
 * 仅桌面端有意义——Web 版没有本地文件系统。
 */
function onSaveToDisk() {
  const img = current.value
  if (!img) return
  emit('saveDisk', img.file)
  emit('close')
}

/** 是否桌面客户端（本地磁盘保存只在客户端可用） */
const isDesktop = import.meta.env.VITE_TAURI === 'true'

/** 按钮文案带上目标图床名，让用户知道会上传到哪 */
const uploadButtonLabel = computed(() =>
  getSetting<string>('defaultHosting') === 'leta' ? '上传乐塔图床并插入' : '上传 GitHub 图床并插入',
)

/**
 * 是否显示页脚。
 * 页脚只放「出图后」的两个落地动作（上传图床 / 本地插入），没图时若仍渲染，
 * 会留下一条只有上边框的空白条 —— 所以跟着有没有图走。
 * 生成中也不显示：那时主操作是输入框旁的「停止生成」，页脚没有内容可放。
 */
const showFooter = computed(() => Boolean(current.value) && !generating.value)

/** 再次生成同款：把该图的提示词放回输入框，参数沿用当前选择 */
function reusePrompt(img: GeneratedImage) {
  prompt.value = img.prompt
}

function selectHistory(img: GeneratedImage) {
  current.value = img
}

/**
 * 下载当前图片。
 * 走共享的 saveBinaryFile()：桌面端弹原生保存对话框（Tauri 的 WebView 里
 * `<a download>` 对 blob URL 不生效，这正是之前「下载失败」的原因），
 * 浏览器端才用 a.download。
 */
async function onDownload() {
  const img = current.value
  if (!img) return
  downloading.value = true
  errorMsg.value = ''
  try {
    const bytes = await blobToBytes(img.file)
    const result = await saveBinaryFile(bytes, img.file.name, [
      { name: '图片', extensions: [extOf(img.file.name)] },
    ])
    if (result === 'saved') downloaded.value = true
    setTimeout(() => (downloaded.value = false), 1500)
  } catch (e: unknown) {
    errorMsg.value = getErrorMessage(e, '保存图片失败')
  } finally {
    downloading.value = false
  }
}
const downloaded = ref(false)
const downloading = ref(false)

/** 取文件扩展名，供保存对话框的过滤器使用 */
function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : 'png'
}

/**
 * 是否可「优化提示词」：取决于「AI 文本」接口是否配置齐全
 * （地址 + Key + 模型名）。配了就借用那个对话模型扩写，没配则整个按钮不出现。
 *
 * 必须走响应式 ref：isAiConfigured() 只读 localStorage，直接放进 computed
 * 会永久缓存，表现为「在设置里填完回来按钮还是不出现」。
 */
const aiReady = ref(isAiConfigured())
function refreshAiReady() {
  aiReady.value = isAiConfigured()
}
function onAiSettingChanged(e: Event) {
  const key = (e as CustomEvent).detail?.key
  if (key === 'aiBaseUrl' || key === 'aiApiKey' || key === 'aiModel') refreshAiReady()
}

/** 优化中：流式累计的文本（用于实时回显） */
const optimizing = ref(false)
const optimizedPreview = ref('')
let optimizeController: AbortController | null = null

/** 优化的结果落到输入框；期间可随时点「停止优化」 */
async function onOptimizePrompt() {
  const text = prompt.value.trim()
  if (!text) {
    errorMsg.value = '请先写一句描述，再点优化'
    return
  }
  if (!aiReady.value) {
    errorMsg.value =
      '尚未配置 AI 文本接口：请先在「设置 → AI 设置 → AI 文本」填写接口地址、API Key 与模型名'
    return
  }

  errorMsg.value = ''
  optimizing.value = true
  optimizedPreview.value = ''
  optimizeController = new AbortController()
  try {
    const result = await optimizeImagePrompt(resolveAiConfig(), text, {
      // 传成品描述（"2K · 2048x1152" 或 "1080×1440 · 3:4"）：自定义模式下没有档位，
      // 拼成「1K 档」会让模型根据不存在的档位编构图
      sizeText: outputSize.value.label,
      signal: optimizeController.signal,
      onDelta: (d) => {
        optimizedPreview.value += d
      },
    })
    prompt.value = result
  } catch (e: unknown) {
    if (isAbort(e)) return
    errorMsg.value = getErrorMessage(e, '优化提示词失败')
  } finally {
    optimizing.value = false
    optimizeController = null
    optimizedPreview.value = ''
  }
}

function onStopOptimize() {
  optimizeController?.abort()
  optimizeController = null
  optimizing.value = false
  optimizedPreview.value = ''
}

/**
 * 用文章标题当作提示词起点。
 * 标题来源统一走 extractTitle()（<title> 组件 → front-matter → # 一级标题 → <breaking>），
 * 不要自己按 '#' 找——R-Markdown 文章的标题多数写在 <title> 组件里。
 */
function useArticleTitle() {
  const title = extractTitle(props.markdown)
  if (title) prompt.value = title
  else errorMsg.value = '没能从当前文章里提取到标题，可手动填写提示词'
}

onBeforeUnmount(() => {
  abort()
  onStopOptimize()
  for (const img of history.value) releaseImage(img)
})
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="AI 配图"
    width="min(95vw, 880px)"
    :show-footer="showFooter"
    no-body-padding
    @close="emit('close')"
  >
    <!-- 头部：结果保留倒计时 + 清空结果 -->
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span
          v-if="history.length > 0"
          class="shrink-0 rounded-full px-2 py-[3px] text-[11px]"
          :class="
            resultExpired
              ? 'bg-[#fdecec] text-[#c0392b] dark:bg-[#3a1f1f] dark:text-[#e57373]'
              : 'bg-[#f0f0f0] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]'
          "
        >
          {{ resultExpired ? '结果已过期' : `结果保留 ${remainingText}` }}
        </span>
        <button
          v-if="history.length > 0"
          class="ml-auto shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[#c0392b] hover:text-[#c0392b] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
          @click="onClearHistory"
        >
          清空结果
        </button>
      </div>
    </template>
    <div class="flex h-full min-h-0 flex-col gap-2 p-3">
      <!-- 未配置引导 -->
      <div
        v-if="!configured"
        class="m-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-xl border border-[#f0f0f0] bg-white px-6 py-10 text-center dark:border-[#333] dark:bg-[#1e1e1e]"
      >
        <Settings2 :size="28" class="text-[var(--accent)]" />
        <p class="text-[13px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">还没有配置配图接口</p>
        <p class="max-w-[420px] text-[12px] leading-relaxed text-[#999] dark:text-[#666]">
          当前厂商：{{ providerDef.name }}。填入 API Key 即可使用，地址与模型名已给出默认值；Key
          加密后仅保存在本地设备。
        </p>
        <button
          class="cursor-pointer rounded-lg border-0 px-4 py-1.5 text-[12px] font-medium text-white"
          :style="{ backgroundColor: colors.accent }"
          @click="emit('openSettings')"
        >
          去设置
        </button>
      </div>

      <template v-else>
        <!-- 参数区 -->
        <div
          class="shrink-0 rounded-xl border border-[#f0f0f0] bg-white p-2.5 dark:border-[#333] dark:bg-[#1e1e1e]"
        >
          <div class="flex flex-wrap items-center gap-3">
            <div v-if="IMAGE_PROVIDERS.length > 1" class="flex items-center gap-1.5">
              <span :class="paramLabelClass">厂商</span>
              <select
                :value="providerId"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="onProviderChange(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="p in IMAGE_PROVIDERS" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>

            <!--
              模型：选项来自设置页勾选的常用模型清单（每家厂商一份）。
              只有一项时不渲染——单个选项的下拉没有可选的余地，白占一格挤别的控件；
              判断与写作 / 排版面板保持一致。
            -->
            <div v-if="cfg.models.length > 1" class="flex items-center gap-1.5">
              <span :class="paramLabelClass">模型</span>
              <select
                :value="cfg.model"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="persistParams({ model: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="m in cfg.models" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>

            <div class="flex items-center gap-1.5">
              <span :class="paramLabelClass">比例</span>
              <select
                :value="cfg.ratio"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="persistParams({ ratio: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="r in ratioOptions" :key="r.value" :value="r.value">
                  {{ r.label }}
                </option>
              </select>
            </div>

            <!--
              分辨率档位只在预设比例下出现：自定义模式已经由宽高定死了像素，
              再选一个档位既是多余的，也会让人以为档位会参与换算。
            -->
            <div v-if="!isCustomRatio" class="flex items-center gap-1.5">
              <span :class="paramLabelClass">分辨率</span>
              <select
                :value="cfg.size"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="persistParams({ size: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="s in providerDef.sizes" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>

            <div v-else class="flex items-center gap-1.5">
              <span :class="paramLabelClass">宽高</span>
              <input
                type="number"
                inputmode="numeric"
                :value="cfg.width"
                :min="dimMin"
                :max="dimMax"
                :step="dimStep"
                :disabled="generating"
                :class="paramDimensionClass"
                aria-label="宽度（像素）"
                @change="onDimensionChange('width', $event)"
              />
              <span class="text-[11px] text-[#999] dark:text-[#666]">×</span>
              <input
                type="number"
                inputmode="numeric"
                :value="cfg.height"
                :min="dimMin"
                :max="dimMax"
                :step="dimStep"
                :disabled="generating"
                :class="paramDimensionClass"
                aria-label="高度（像素）"
                @change="onDimensionChange('height', $event)"
              />
            </div>

            <div v-if="providerDef.qualities?.length" class="flex items-center gap-1.5">
              <span :class="paramLabelClass">质量</span>
              <select
                :value="cfg.quality"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="persistParams({ quality: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="q in providerDef.qualities" :key="q.value" :value="q.value">
                  {{ q.label }}
                </option>
              </select>
            </div>

            <div v-if="providerDef.backgrounds?.length" class="flex items-center gap-1.5">
              <span :class="paramLabelClass">背景</span>
              <select
                :value="cfg.background"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="persistParams({ background: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="b in providerDef.backgrounds" :key="b.value" :value="b.value">
                  {{ b.label }}
                </option>
              </select>
            </div>

            <div v-if="providerDef.moderations?.length" class="flex items-center gap-1.5">
              <span :class="paramLabelClass">审核</span>
              <select
                :value="cfg.moderation"
                :class="paramSelectClass"
                :style="paramChevronStyle"
                :disabled="generating"
                @change="persistParams({ moderation: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="m in providerDef.moderations" :key="m.value" :value="m.value">
                  {{ m.label }}
                </option>
              </select>
            </div>

            <!--
              输出提示跟在参数后面同一行。
              原来移动端加了 w-full 把它整条换到下一行，白白多占一行高度；
              实测 390/360 宽都放得下（行内剩余 126px，最长的「输出 4K · 4096x4096」约 112px），
              所以只在 320px 这种极窄屏会自然折行，不再强制。
              whitespace-nowrap 保证「4K · 4096x4096」不被从中间劈开。
            -->
            <span class="whitespace-nowrap text-[11px] text-[#999] dark:text-[#666]">
              {{ outputSize.label ? `输出 ${outputSize.label}` : '该组合无对应尺寸' }}
            </span>
          </div>

          <div class="mt-2.5">
            <textarea
              v-model="prompt"
              rows="3"
              :disabled="generating || optimizing"
              :placeholder="promptPlaceholder"
              class="w-full resize-y rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] disabled:opacity-60 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            ></textarea>

            <!-- 优化中的实时回显：让用户看到模型正在写什么，可随时停止 -->
            <div
              v-if="optimizing"
              class="mt-1.5 flex items-start gap-2 rounded-lg border border-[#e8e3ff] bg-[#f7f5ff] px-3 py-2 dark:border-[#3a3355] dark:bg-[#221f33]"
            >
              <Loader2 :size="13" class="mt-0.5 shrink-0 animate-spin text-[var(--accent)]" />
              <div class="min-w-0 flex-1">
                <p class="text-[11px] font-medium text-[var(--accent)]">正在优化提示词…</p>
                <p
                  class="mt-0.5 break-words text-[11px] leading-relaxed text-[#666] dark:text-[#999]"
                >
                  {{ optimizedPreview || '等待模型响应…' }}
                </p>
              </div>
              <button
                class="shrink-0 cursor-pointer rounded-md border border-[#e5e5e5] bg-white px-2 py-0.5 text-[11px] text-[#666] transition-colors hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                @click="onStopOptimize"
              >
                停止
              </button>
            </div>

            <!-- 提示词操作行：用标题 / 优化 / 开始生成（或重新生成） -->
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <BaseTooltip text="取当前文章的标题作为提示词起点" placement="bottom">
                <button
                  class="flex cursor-pointer items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[var(--accent)]"
                  :disabled="generating || optimizing"
                  @click="useArticleTitle"
                >
                  <Wand2 :size="13" />
                  用标题
                </button>
              </BaseTooltip>
              <BaseTooltip
                v-if="aiReady"
                text="调用「AI 文本」配置的大模型，把描述扩写成完整提示词"
                placement="bottom"
              >
                <button
                  class="flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="generating || optimizing || !prompt.trim()"
                  @click="onOptimizePrompt"
                >
                  <Sparkle :size="13" />
                  优化提示词
                </button>
              </BaseTooltip>
              <!-- 清空：紧跟在「优化提示词」后面，同属「对提示词本身的操作」 -->
              <button
                v-if="prompt.length > 0"
                class="flex cursor-pointer items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-[11px] text-[#666] transition-colors hover:border-[#c0392b] hover:text-[#c0392b] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#e57373] dark:hover:text-[#e57373]"
                :disabled="generating || optimizing"
                @click="onClearPrompt"
              >
                <Eraser :size="13" />
                清空
              </button>

              <!-- 主操作：与提示词同区，写完即可点 -->
              <button
                v-if="generating"
                class="ml-auto cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] text-[#666] transition-colors hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:bg-[#333]"
                @click="onStop"
              >
                停止生成
              </button>
              <button
                v-else-if="current"
                class="ml-auto cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] text-[#666] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:bg-[#333]"
                :disabled="!prompt.trim() || optimizing"
                @click="onRegenerate"
              >
                重新生成
              </button>
              <button
                v-else
                class="ml-auto cursor-pointer rounded-lg border-0 px-4 py-1.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                :style="{ backgroundColor: colors.accent }"
                :disabled="!configured || !prompt.trim() || optimizing"
                @click="onGenerate"
              >
                开始生成
              </button>
            </div>
          </div>
        </div>

        <!-- 错误 -->
        <div
          v-if="errorMsg"
          class="shrink-0 rounded-lg border border-[#fde2e2] bg-[#fef5f5] px-3 py-2 text-[12px] text-[#c0392b] dark:border-[#5a2a2a] dark:bg-[#2a1a1a]"
        >
          {{ errorMsg }}
        </div>

        <!-- 生成中 -->
        <div
          v-if="generating"
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-[#f0f0f0] bg-white px-6 dark:border-[#333] dark:bg-[#1e1e1e]"
        >
          <Loader2 :size="24" class="animate-spin text-[var(--accent)]" />
          <p class="text-[12px] text-[#666] dark:text-[#999]">
            <template v-if="taskStatus">{{ taskStatus }} · </template>
            {{ taskStatus ? '已用' : '正在生成图片…' }} {{ elapsedSec }}s / 最长
            {{ cfg.timeoutSec }}s
          </p>
          <p class="text-[11px] text-[#999] dark:text-[#666]">
            {{
              taskStatus
                ? '中转站按任务异步出图，会自动轮询到出结果。'
                : '大尺寸或复杂提示词可能需要几十秒，'
            }}可随时点「停止」。
          </p>
        </div>

        <!-- 结果 -->
        <div
          v-else-if="current"
          class="flex min-h-0 flex-1 flex-col rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
        >
          <div
            class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
          >
            <span class="text-[12px] text-[#666] dark:text-[#999]">
              {{ current.sizeLabel }} · {{ current.sizeText }}
            </span>
            <div class="ml-auto flex gap-1">
              <button
                class="flex cursor-pointer items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                @click="reusePrompt(current)"
              >
                <RefreshCw :size="12" />
                用这条提示词
              </button>
              <button
                class="flex cursor-pointer items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                :disabled="downloading"
                @click="onDownload"
              >
                <Loader2 v-if="downloading" :size="12" class="animate-spin" />
                <Download v-else :size="12" />
                {{ downloaded ? '已保存' : '下载' }}
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-3">
            <img
              :src="current.previewUrl"
              alt="AI 生成结果"
              class="mx-auto max-h-[46vh] w-auto max-w-full rounded-lg border border-[#f0f0f0] object-contain dark:border-[#333]"
            />
            <p
              v-if="current.revisedPrompt"
              class="mt-2 rounded-lg bg-[#fafafa] px-3 py-2 text-[11px] leading-relaxed text-[#666] dark:bg-[#252525] dark:text-[#999]"
            >
              模型改写后的提示词：{{ current.revisedPrompt }}
            </p>
          </div>

          <!-- 本次会话历史 -->
          <div
            v-if="history.length > 1"
            class="flex shrink-0 gap-2 overflow-x-auto border-t border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
          >
            <button
              v-for="img in history"
              :key="img.id"
              class="shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 p-0 transition-colors"
              :class="
                current.id === img.id ? 'border-[var(--accent)]' : 'border-transparent opacity-70'
              "
              :title="img.sizeLabel"
              @click="selectHistory(img)"
            >
              <img :src="img.previewUrl" alt="" class="h-14 w-14 object-cover" />
            </button>
          </div>
        </div>

        <!-- 空态 -->
        <div
          v-else
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e5e5e5] bg-white px-6 text-center dark:border-[#444] dark:bg-[#1e1e1e]"
        >
          <Sparkles :size="22" class="text-[#ccc]" />
          <p class="text-[12px] text-[#999] dark:text-[#666]">
            填好提示词后点「开始生成」，出图后可预览、下载，确认满意再插入编辑器。
          </p>
        </div>
      </template>
    </div>

    <!--
      页脚只留「出图后」的落地动作。
      「开始生成 / 重新生成 / 停止」已移到提示词输入框下方 —— 与输入框同区，
      写完提示词就地提交，不用再从面板底部找按钮。
    -->
    <template #footer>
      <button
        class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-5 py-2 text-[13px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[var(--accent)]"
        :disabled="uploading"
        @click="onUploadToHosting"
      >
        {{ uploading ? '上传中…' : uploadButtonLabel }}
      </button>
      <!-- 保存磁盘并插入：仅桌面客户端（Web 版没有本地文件系统） -->
      <button
        v-if="isDesktop"
        class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-5 py-2 text-[13px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[var(--accent)]"
        :disabled="uploading"
        @click="onSaveToDisk"
      >
        保存磁盘并插入
      </button>
      <button
        class="cursor-pointer rounded-lg border-0 px-5 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        :style="{ backgroundColor: colors.accent }"
        :disabled="uploading"
        @click="onInsert"
      >
        插入编辑器
      </button>
    </template>
  </BaseDrawer>

  <!-- 清空结果确认 -->
  <ConfirmDialog
    v-model:visible="clearConfirmVisible"
    title="清空结果"
    message="清空后这些图片将不再保留（已插入编辑器的图片不受影响）。确定清空吗？"
    cancel-text="取消"
    confirm-text="清空"
    @confirm="doClearHistory"
    @cancel="clearConfirmVisible = false"
  />
</template>
