<!--
  本文件**不要**开 vapor：卡片是静态插槽内容，交给 MasonryFlow（VDOM 组件）按高度分列。
  vapor 父组件传给 VDOM 子组件的插槽拿不到可用的 vnode，MasonryFlow 只能收集到 1 张卡，
  瀑布流会退化成单列。实测：加了 vapor 后 7 张卡全挤在左列。
-->
<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import pkg from '../../../../package.json'
import {
  AlignLeft,
  BarChart3,
  Check,
  Cloud,
  Command,
  FileText,
  FolderOpen,
  Gauge,
  Github,
  Image,
  Images,
  Info,
  KeyRound,
  MessageCircle,
  Palette,
  PenLine,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Zap,
  ZoomIn,
} from 'lucide-vue-next'
import BoardHeader from './BoardHeader.vue'
import SettingsCard from './SettingsCard.vue'
import SettingsSlider from './SettingsSlider.vue'
import MasonryFlow from './MasonryFlow.vue'
import ModelMultiSelect from '@/components/ModelMultiSelect.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { getSetting, setSetting } from '@/config/settings'
import {
  autoUpdateEnabled,
  autoUpdatePending,
  autoUpdateRid,
  checkForUpdates,
} from '@/composables/useAutoUpdater'
import { autoSaveEnabled, autoSaveInterval } from '@/composables/useEditorSettings'
import {
  paraFontSize,
  paraLineHeight,
  paraFontWeight,
  paraMargin,
  paraIndent,
} from '@/composables/useParagraphSettings'
import { testConnection } from '@/services/githubUploader'
import { GitHubTreeService } from '@/services/githubTreeService'
import { resolveAiConfig, listModels, testAiConnection } from '@/services/aiFormat'
import {
  isSupportedImageModel,
  IMAGE_PROVIDERS,
  IMAGE_RELAYS,
  getActiveProviderId,
  getImageProvider,
  getProviderConfig,
  setActiveProviderId,
  setProviderConfig,
  type ImageGenProviderConfig,
} from '@/services/imageProviders'
import { listImageModels, testImageConnection } from '@/services/imageGen'
import { useTheme } from '@/composables/useTheme'
import { useIsMobileWeb } from '@/composables/useIsMobile'
import { testConnection as testLetaConnection } from '@/services/letaUploader'
import { getErrorMessage } from '@/utils/helpers'
import { DEFAULT_FORMAT_SHORTCUT } from '@/config/defaults'
import {
  isMac,
  modKeyLabel,
  ctrlKeyLabel,
  altKeyLabel,
  shiftKeyLabel,
  modifierKeyList,
} from '@/utils/platform'
import {
  parseShortcut,
  formatShortcutSpec,
  specFromEvent,
  shortcutDisplay,
  DEFAULT_PALETTE_SHORTCUT,
  type ShortcutSpec,
} from '@/utils/commandPalette'
import {
  activeGithubWorkspaceId,
  activeLocalWorkspaceId,
  ensureWorkspaces,
  listWorkspaces,
  addWorkspace,
  updateWorkspace,
  removeWorkspace,
  getWorkspaceById,
  getWorkspaceToken,
  setWorkspaceToken,
  setActiveWorkspace,
} from '@/services/articleWorkspace'
import { useGitHubTree } from '../composables/useGitHubTree'
import { ARTICLE_NAMING_ID, ARTICLE_NAMING_TITLE } from '@/utils/articleNaming'
import { MAX_SESSION_HOURS, MIN_SESSION_HOURS, normalizeHours } from '@/utils/aiWriteSession'
import {
  DEFAULT_WRITE_MAX_TOKENS,
  DEFAULT_WRITE_TEMPERATURE,
  MAX_WRITE_MAX_TOKENS,
  MIN_WRITE_MAX_TOKENS,
} from '@/services/aiWrite'

const { switchToWorkspace } = useGitHubTree()
ensureWorkspaces()

const props = defineProps<{
  initialTab?: string
}>()

const emit = defineEmits<{
  close: []
  toast: [message: string]
}>()

const ZOOM_PRESETS = [50, 75, 80, 90, 100, 110, 125, 150, 175, 200]
const SAVE_INTERVAL_PRESETS = [0.5, 1, 2, 3, 5, 8, 10]
const isTauri = import.meta.env.VITE_TAURI === 'true'
/** 移动端 Web：无本地存储，图片相关只提供 GitHub/乐塔图床（桌面客户端不受影响） */
const isMobile = useIsMobileWeb()
const { colors } = useTheme()

const selectChevronStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
}

// ── 设置 tab ──
const settingsTab = ref('basic')

/**
 * 「AI 设置」tab 内的二级子页：text（文本：写作 + 排版共用一份接口配置）| image（图片）。
 * 写作与排版共用同一个接口地址 / API Key / 模型名，所以合并成一个子页；
 * 两者不同的采样参数在 text 子页内分区展示。
 */
const aiPane = ref<'text' | 'image'>('text')

/**
 * 按 initialTab 落到对应标签页。
 * 'ai-write' / 'ai-format' / 'ai-image' 是「打开 AI tab 且停在某个子页」的入口约定，
 * 写作与排版现在同属「AI 文本」，前两个都落到 text 子页。
 */
function applyInitialTab(tab?: string) {
  if (tab === 'ai-write' || tab === 'ai-format' || tab === 'ai-image') {
    settingsTab.value = 'ai'
    aiPane.value = tab === 'ai-image' ? 'image' : 'text'
  } else if (tab) {
    settingsTab.value = tab
    if (tab === 'ai') aiPane.value = 'text'
  }
}

/**
 * 设置面板是编辑区里的内嵌面板（父级用 v-if 挂载 / 卸载），所以「打开时初始化」
 * 就等价于 onMounted：按 initialTab 落到对应 tab，并刷新需要回显的配置。
 */
onMounted(() => {
  applyInitialTab(props.initialTab)
  refreshImageConfig()
  refreshWriteConfig()
  // 同步回显存储位置（用户在树下拉中切换工作区时会持久化 articleStorageMode）
  articleStorageMode.value = getSetting<'github' | 'local'>('articleStorageMode')
  // 同步回显文章文件命名开关（可能被其他入口或磁盘配置改动）
  articleTitleNaming.value = getSetting<string>('articleFileNaming') === ARTICLE_NAMING_TITLE
})

/**
 * 面板已经开着时，从别的入口再点进来（顶栏齿轮 / AI 面板的「去设置」/ 文章树的「前往设置」）
 * 只会改 initialTab，面板不会重新挂载，所以这里要跟着切 tab。
 */
watch(
  () => props.initialTab,
  (tab) => applyInitialTab(tab),
)
// 图床上传子 tab：upload | github | leta
const hostingTab = ref('upload')

// ── 图床配置 ──
const githubRepo = ref(getSetting<string>('githubRepo'))
const githubToken = ref(getSetting<string>('githubToken'))
const githubBranch = ref(getSetting<string>('githubBranch'))

const githubTesting = ref(false)
const githubTestResult = ref<'ok' | 'fail' | ''>('')
const githubTestError = ref('')

const letaToken = ref(getSetting<string>('letaToken'))
const letaStorageId = ref(getSetting<string>('letaStorageId'))

const letaTesting = ref(false)
const letaTestResult = ref<'ok' | 'fail' | ''>('')
const letaTestError = ref('')

function saveGitHubRepo(val: string) {
  githubRepo.value = val
  setSetting('githubRepo', val)
  githubTestResult.value = ''
  githubTestError.value = ''
}

function saveGitHubToken(val: string) {
  githubToken.value = val
  setSetting('githubToken', val)
  githubTestResult.value = ''
  githubTestError.value = ''
}

function saveGitHubBranch(val: string) {
  githubBranch.value = val
  setSetting('githubBranch', val)
  githubTestResult.value = ''
  githubTestError.value = ''
}

function saveLetuToken(val: string) {
  letaToken.value = val
  setSetting('letaToken', val)
  letaTestResult.value = ''
  letaTestError.value = ''
}

function saveLetuStorageId(val: string) {
  letaStorageId.value = val
  setSetting('letaStorageId', val)
  letaTestResult.value = ''
  letaTestError.value = ''
}

// ── 粘贴/拖拽上传方式（移动端固定走 GitHub 图床，此项不展示）──
const pasteDropMode = ref(getSetting<string>('pasteDropMode'))

function savePasteDropMode(val: string) {
  pasteDropMode.value = val
  setSetting('pasteDropMode', val)
}

// ── 默认图床（工具栏上传按钮使用）──
const defaultHosting = ref(getSetting<string>('defaultHosting'))

function saveDefaultHosting(val: string) {
  defaultHosting.value = val
  setSetting('defaultHosting', val)
}

// ── 压缩质量 ──
const compressQuality = ref(getSetting<number>('compressQuality'))

function saveCompressQuality(val: number) {
  compressQuality.value = val
  setSetting('compressQuality', val)
}

// ── 磁盘图片上传名称规则 ──
const diskImageNaming = ref(getSetting<string>('diskImageNaming'))

function saveDiskImageNaming(val: string) {
  diskImageNaming.value = val
  setSetting('diskImageNaming', val)
}

// ── Minimap 缩略图 ──
const minimapEnabled = ref(getSetting<boolean>('minimapEnabled'))
watch(minimapEnabled, (val) => setSetting('minimapEnabled', val))

// ── 文档大纲 ──
const outlineEnabled = ref(getSetting<boolean>('outlineEnabled'))
watch(outlineEnabled, (val) => setSetting('outlineEnabled', val))

// ── 底部状态栏 ──
const statusBarEnabled = ref(getSetting<boolean>('statusBarEnabled'))
watch(statusBarEnabled, (val) => setSetting('statusBarEnabled', val))

// ── 命令面板 ──
/** 持久化的是 'Mod+K' 这类描述串，展示时按平台渲染 */
const commandPaletteShortcut = ref(getSetting<string>('commandPaletteShortcut'))
const shortcutRecording = ref(false)
const shortcutButtonRef = ref<HTMLButtonElement | null>(null)

const commandPaletteShortcutText = computed(() => displayShortcut(commandPaletteShortcut.value))

/** 解析配置里的快捷键，失败（如旧版存的 Option 组合字符）时回退默认值 */
function resolveShortcut(raw: string): ShortcutSpec | null {
  return parseShortcut(raw) ?? parseShortcut(DEFAULT_PALETTE_SHORTCUT)
}

function displayShortcut(raw: string): string {
  const spec = resolveShortcut(raw)
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

function startShortcutRecording() {
  shortcutRecording.value = true
  // keydown 需要焦点，点击后主动聚焦按钮本身（否则按键会落到别处）
  nextTick(() => shortcutButtonRef.value?.focus())
}

/**
 * 录制新的快捷键。
 * Esc 恢复默认；按下合法组合则保存；其余按键一律拦截，避免误触其他控件。
 */
function onShortcutKeydown(e: KeyboardEvent) {
  if (!shortcutRecording.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    shortcutRecording.value = false
    commandPaletteShortcut.value = DEFAULT_PALETTE_SHORTCUT
    setSetting('commandPaletteShortcut', DEFAULT_PALETTE_SHORTCUT)
    return
  }

  const spec = specFromEvent(e, isMac())
  if (!spec) return // 仅按修饰键或无修饰键，继续等待
  shortcutRecording.value = false
  const text = formatShortcutSpec(spec)
  commandPaletteShortcut.value = text
  setSetting('commandPaletteShortcut', text)
}

// ── 格式化文档快捷键 ──
/**
 * 与命令面板同一套录制/展示逻辑，只是独立一份状态。
 * 抽公共 composable 会更短，但两边文案与回退值都不同，这里保持显式更易读。
 */
const formatShortcut = ref(getSetting<string>('formatShortcut'))
const formatShortcutRecording = ref(false)
const formatShortcutButtonRef = ref<HTMLButtonElement | null>(null)

const formatShortcutText = computed(() => displayFormatShortcut(formatShortcut.value))

/** 解析失败（如旧版存的组合字符）时回退到默认值 */
function resolveFormatShortcut(raw: string): ShortcutSpec | null {
  return parseShortcut(raw) ?? parseShortcut(DEFAULT_FORMAT_SHORTCUT)
}

function displayFormatShortcut(raw: string): string {
  const spec = resolveFormatShortcut(raw)
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

function startFormatShortcutRecording() {
  formatShortcutRecording.value = true
  // keydown 需要焦点，点击后主动聚焦按钮本身
  nextTick(() => formatShortcutButtonRef.value?.focus())
}

/** 录制格式化快捷键：Esc 恢复默认，合法组合即保存 */
function onFormatShortcutKeydown(e: KeyboardEvent) {
  if (!formatShortcutRecording.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    formatShortcutRecording.value = false
    formatShortcut.value = DEFAULT_FORMAT_SHORTCUT
    setSetting('formatShortcut', DEFAULT_FORMAT_SHORTCUT)
    return
  }

  const spec = specFromEvent(e, isMac())
  if (!spec) return // 仅按修饰键，继续等待
  formatShortcutRecording.value = false
  const text = formatShortcutSpec(spec)
  formatShortcut.value = text
  setSetting('formatShortcut', text)
}

// ── 编辑器主题 ──
const editorTheme = ref(getSetting<string>('editorTheme'))
function saveEditorTheme(theme: string) {
  editorTheme.value = theme
  setSetting('editorTheme', theme)
}

// ── 编辑区字号（仅影响编辑器显示，不影响预览与导出排版）──
const editorFontSize = ref(getSetting<number>('editorFontSize'))
function saveEditorFontSize(val: number) {
  editorFontSize.value = val
  setSetting('editorFontSize', val)
}
function resetEditorFontSize() {
  saveEditorFontSize(13)
}

// ── AI 文本（写作与排版共用一份接口配置，只有采样参数分开）──
/**
 * 「AI 文本」= 写作 + 排版。两者用同一个接口地址、API Key、模型名，
 * 因此这三项在这里只出现一次（原来写作子页那份「模型覆盖」已去掉）。
 * 与任务性质相关的采样温度 / 最大输出分开存、分区展示。
 */
const aiBaseUrl = ref(getSetting<string>('aiBaseUrl'))
const aiApiKey = ref(getSetting<string>('aiApiKey'))
const aiTemperature = ref(getSetting<number>('aiTemperature'))
const aiMaxTokens = ref(getSetting<number>('aiMaxTokens'))
const aiStream = ref(getSetting<boolean>('aiStream'))

/**
 * 结果保留时长（小时）——**三个面板各自独立**。
 * 口径都是「从最后一次请求算起」的滑动续期：一直在用就一直留得住。
 *
 * 分开是因为使用节奏不同：写作一次常聊几十分钟，排版/配图多是「生成一次就用掉」。
 */
const aiWriteSessionHours = ref(getSetting<number>('aiWriteSessionHours'))
const aiFormatSessionHours = ref(getSetting<number>('aiFormatSessionHours'))
const aiImageSessionHours = ref(getSetting<number>('aiImageSessionHours'))

type SessionHoursSettingKey = 'aiWriteSessionHours' | 'aiFormatSessionHours' | 'aiImageSessionHours'

/** 三个面板共用一个写回实现，避免三段重复代码；收敛逻辑与面板侧一致 */
function saveSessionHours(key: SessionHoursSettingKey, val: number) {
  const n = normalizeHours(val)
  if (key === 'aiWriteSessionHours') aiWriteSessionHours.value = n
  else if (key === 'aiFormatSessionHours') aiFormatSessionHours.value = n
  else aiImageSessionHours.value = n
  setSetting(key, n)
}

/** 模型列表查询状态 */
const modelList = ref<string[]>([])
const modelListLoading = ref(false)
const modelListError = ref('')

/** 连接测试状态 */
const aiTesting = ref(false)
const aiTestResult = ref<'ok' | 'fail' | ''>('')
const aiTestError = ref('')
/** 测试/查询后展示的提示信息 */
const aiHint = ref('')

function resetAiTestState() {
  aiTestResult.value = ''
  aiTestError.value = ''
  aiHint.value = ''
}

function saveAiBaseUrl(val: string) {
  aiBaseUrl.value = val
  setSetting('aiBaseUrl', val)
  resetAiTestState()
  modelList.value = []
}

function saveAiApiKey(val: string) {
  aiApiKey.value = val
  setSetting('aiApiKey', val)
  resetAiTestState()
  modelList.value = []
}

/**
 * 把「清单首项」同步进旧字段 `aiModel`。
 *
 * 这个字段已经没有对应设置项了（用户明确不要单独的默认模型），留着是为了：
 * 一是老配置读得回来，二是监听 `aiModel` 的面板（配图里的「优化提示词」就绪判定）
 * 能收到变更事件。别因为「没人读」就删掉这行写入——那是兼容层。
 */
function saveAiModel(val: string) {
  setSetting('aiModel', val)
  resetAiTestState()
}

/**
 * 文本常用模型清单（多选维护）。
 *
 * 没有单独的「默认模型」设置：**清单首项即默认**。面板各自记的当前模型
 * 失效时也回落到首项。
 *
 * 升级迁移：装过旧版本的用户只有单个 `aiModel`、没有这份清单，
 * 直接取空数组会让多选控件显示「还没有选中任何模型」、面板也没模型可发。
 * 所以清单为空而 `aiModel` 有值时，用它兜底成一份只有一项的清单。
 */
function initAiModels(): string[] {
  const listed = getSetting<string[]>('aiModels')
  const out: string[] = []
  for (const m of Array.isArray(listed) ? listed : []) {
    if (typeof m === 'string' && m.trim() && !out.includes(m.trim())) out.push(m.trim())
  }
  if (out.length === 0) {
    const legacy = (getSetting<string>('aiModel') || '').trim()
    if (legacy) out.push(legacy)
  }
  return out
}

const aiModels = ref(initAiModels())

function saveAiModels(val: string[]) {
  aiModels.value = val
  setSetting('aiModels', val)
  // 清单首项即默认，顺手同步进旧字段 aiModel：老配置读得回来，
  // 监听 aiModel 的面板（如配图里的「优化提示词」）也能收到变更。
  // saveAiModel 内部会 resetAiTestState()。
  saveAiModel(val[0] || '')
}

function saveAiTemperature(val: number) {
  aiTemperature.value = val
  setSetting('aiTemperature', val)
}

function saveAiMaxTokens(val: number) {
  aiMaxTokens.value = val
  setSetting('aiMaxTokens', val)
}

function saveAiStream(val: boolean) {
  aiStream.value = val
  setSetting('aiStream', val)
}

// ── AI 配图（按厂商配置；各家参数不一致，字段由厂商注册表驱动）──
/** 当前厂商 id（响应式，用于切换厂商时刷新配置回显） */
const imageProviderId = ref(getActiveProviderId())
/** 当前厂商的能力描述 */
const imageDef = computed(() => getImageProvider(imageProviderId.value))
/** 当前厂商的配置（写回时按厂商分开存储） */
const imageConfig = ref<ImageGenProviderConfig>(getProviderConfig(imageProviderId.value))

/** 模型列表查询状态 */
const imageModelList = ref<string[]>([])
const imageModelLoading = ref(false)
const imageModelError = ref('')
/**
 * 清单里哪些模型名可能不被本厂商支持（只提示、不阻止保存）。
 *
 * 检查**整份清单**而不只是「当前用的那个」：面板参数行的下拉就是这份清单，
 * 用户随手切到一个不支持的模型就会失败，所以勾选时就得知道。
 * 「获取模型列表」已经按同一规则过滤过了，剩下的只可能是**手填**进来的
 * ——手填入口故意不受过滤限制（中转站常漏项），所以这条提醒是手填的兜底。
 */
const imageInvalidModels = computed<string[]>(() =>
  imageConfig.value.models.filter((m) => Boolean(m) && !isSupportedImageModel(imageDef.value, m)),
)
/** 提醒文案：把具体是哪几个模型点出来，比一句泛泛的「可能不支持」有用 */
const imageModelWarnText = computed(() => {
  const names = imageInvalidModels.value
  if (names.length === 0) return ''
  return `手填的 ${names.join('、')} 可能不支持。${imageDef.value.modelIdWarn || ''}`
})
/** 连接测试状态 */
const imageTesting = ref(false)
const imageTestResult = ref<'ok' | 'fail' | ''>('')
const imageTestError = ref('')
const imageHint = ref('')

function resetImageTestState() {
  imageTestResult.value = ''
  imageTestError.value = ''
  imageHint.value = ''
}

/** 从设置里重新读取当前厂商配置（面板打开、切换厂商时调用） */
function refreshImageConfig() {
  imageProviderId.value = getActiveProviderId()
  imageConfig.value = getProviderConfig(imageProviderId.value)
  imageModelList.value = []
  imageModelError.value = ''
  resetImageTestState()
}

function patchImageConfig(patch: Partial<ImageGenProviderConfig>) {
  setProviderConfig(imageProviderId.value, patch)
  /**
   * 写回后重新读一次，而不是本地合并补丁。
   * 存储侧会把值收敛（切中转站时质量档位要从 max 收到 low、非自定义比例下宽高归零），
   * 直接合并会让界面上留着「其实没存进去」的值。
   */
  imageConfig.value = getProviderConfig(imageProviderId.value)
}

function switchImageProvider(id: string) {
  setActiveProviderId(id)
  refreshImageConfig()
}

function saveImageBaseUrl(val: string) {
  patchImageConfig({ baseUrl: val })
  resetImageTestState()
  imageModelList.value = []
}

function saveImageApiKey(val: string) {
  patchImageConfig({ apiKey: val })
  resetImageTestState()
  imageModelList.value = []
}

/**
 * 保存图片常用模型清单。
 *
 * 没有单独的「默认模型」设置：**清单首项即默认**（`normalizeConfig()` 里兜底）。
 * 当前使用的模型必须留在清单里——清单是配图面板下拉的数据源，
 * 删掉当前项会让下拉没有可选项，所以这里顺手把当前模型纠到清单首项。
 */
function saveImageModels(val: string[]) {
  patchImageConfig({
    models: val,
    model: val.includes(imageConfig.value.model) ? imageConfig.value.model : val[0] || '',
  })
  resetImageTestState()
}

function saveImageTimeout(val: number) {
  patchImageConfig({ timeoutSec: val })
}

/**
 * 选中转站。
 *
 * 选中后生图改走「提交 → 轮询任务 → 取图」；选「不使用」则回到标准同步接口。
 * 每个中转站的查询路径与结果结构不同，由厂商 def 的 relays 描述，这里只存 id。
 */
function saveImageRelay(val: string) {
  const relay = IMAGE_RELAYS.find((r) => r.id === val)
  if (relay?.baseUrl) {
    // 选中转站时顺手把接口地址换成该站的（省得手抄）
    patchImageConfig({ relay: val, baseUrl: relay.baseUrl })
  } else {
    /**
     * 取消选择：地址如果还停在某家中转站的地址上，就退回厂商默认地址。
     * 否则会留在「地址是中转站、却按同步接口解析」的状态，那边只回 task_id，
     * 生成时只会得到「接口未返回图片」，看不出是哪里错了。
     */
    const current = imageConfig.value.baseUrl
    const staleRelay = IMAGE_RELAYS.find((r) => r.baseUrl === current)
    patchImageConfig({ relay: val, baseUrl: staleRelay ? imageDef.value.baseUrl : current })
  }
  resetImageTestState()
  imageModelList.value = []
}

/** 当前选中的中转站 def（没选时为 undefined） */
const imageRelay = computed(() => IMAGE_RELAYS.find((r) => r.id === imageConfig.value.relay))

/**
 * 能不能按「获取模型列表」去拉一次。
 * 中转站可能压根没有 /models（多米API 就是 404），那种情况把按钮藏掉，
 * 换成一句手填说明 —— 留个按下去必然失败的按钮只会让人怀疑地址或 Key 错了。
 */
const canFetchImageModels = computed(() => imageRelay.value?.modelList !== false)

/** 当前选中中转站的说明（未选时说清默认行为） */
const imageRelayHint = computed(() => {
  const relay = imageRelay.value
  if (!relay) {
    return '不选＝直连官方，按标准 /images/generations 一次性返回；只有提交只回 task_id 的站才需要选。'
  }
  const addr = relay.baseUrl ? `接口地址已填为 ${relay.baseUrl}，` : ''
  // 有的站一个名字下挂几条线路，能力（比例 / 质量 / 是否收像素）各不相同，
  // 模型名选错线路就会「提交成功、几十秒后才失败」，所以这里先提醒一句
  const lines = relay.modelRules?.length
    ? '该站同一模型有不同线路，能力按模型名区分（生成面板里的比例 · 质量 · 背景会随之变化）。'
    : ''
  return `${addr}该站提交后只返回任务 id，生图时会自动轮询任务接口取图。${lines}`
})

/**
 * 查询该厂商的可用图像模型。
 *
 * 筛两道：先按 modelIdPattern 挑出图像模型，再按 modelIdValid 去掉本厂商用不了的。
 * 中转站的 /models 把几十个别家图像模型一起列出来，全塞进勾选清单只会让人选错、
 * 生成才失败；过滤掉之后清单里就是「勾了就能用」的部分。
 *
 * 手填入口照样不受过滤限制——中转站常漏项、也常改写法，写死过滤会挡住能用的配置。
 */
async function handleFetchImageModels() {
  if (!imageConfig.value.baseUrl || !imageConfig.value.apiKey) {
    imageModelError.value = '请先填写接口地址与 API Key'
    imageModelList.value = []
    return
  }
  imageModelLoading.value = true
  imageModelError.value = ''
  imageModelList.value = []
  try {
    const strict = imageDef.value.modelIdValid
    imageModelList.value = await listImageModels(
      {
        baseUrl: imageConfig.value.baseUrl,
        apiKey: imageConfig.value.apiKey,
        timeoutSec: imageConfig.value.timeoutSec,
      },
      imageDef.value.modelIdPattern,
      strict,
    )
    imageHint.value = `已获取 ${imageModelList.value.length} 个${strict ? '可用' : '图像'}模型`
  } catch (e: unknown) {
    imageModelError.value = getErrorMessage(e, '获取模型列表失败')
  } finally {
    imageModelLoading.value = false
  }
}

/** 测试连接：复用 /models 校验地址与 Key */
async function handleTestImageConnection() {
  imageTesting.value = true
  resetImageTestState()
  try {
    await testImageConnection(
      {
        baseUrl: imageConfig.value.baseUrl,
        apiKey: imageConfig.value.apiKey,
        timeoutSec: imageConfig.value.timeoutSec,
      },
      imageDef.value.modelIdPattern,
      // 这里不传 strict：测试连接只关心「通不通」，不该因为清单被过滤空了就判失败
      undefined,
      imageRelay.value,
    )
    imageTestResult.value = 'ok'
  } catch (e: unknown) {
    imageTestResult.value = 'fail'
    imageTestError.value = getErrorMessage(e, '连接失败')
  }
  imageTesting.value = false
}

/** 查询接口可用模型列表 */
async function handleFetchModels() {
  if (!aiBaseUrl.value || !aiApiKey.value) {
    modelListError.value = '请先填写接口地址与 API Key'
    modelList.value = []
    return
  }
  modelListLoading.value = true
  modelListError.value = ''
  modelList.value = []
  try {
    modelList.value = await listModels(resolveAiConfig())
    aiHint.value = `已获取 ${modelList.value.length} 个模型`
  } catch (e: unknown) {
    modelListError.value = getErrorMessage(e, '获取模型列表失败')
  } finally {
    modelListLoading.value = false
  }
}

/** 测试连接：复用 /models 校验地址与 Key */
async function handleTestAiConnection() {
  aiTesting.value = true
  resetAiTestState()
  try {
    await testAiConnection(resolveAiConfig())
    aiTestResult.value = 'ok'
  } catch (e: unknown) {
    aiTestResult.value = 'fail'
    aiTestError.value = getErrorMessage(e, '连接失败')
  }
  aiTesting.value = false
}

// ── AI 写作（写作与排版共用「AI 文本」的地址 / Key / 模型，这里只放写作专属项）──
/**
 * 与「AI 文本」公共配置不同的部分：采样温度、最大输出，以及写作独有的长期补充要求。
 *
 * 「附带参考资料」不在这里——它和「四层自检」一样是「这一轮怎么写」的开关，
 * 已挪到 AI 写作面板的参数行（排在四层自检后面），开关值仍存在同一个设置项里。
 * 「结果保留时长」是三个面板**各自独立**的，写作那份见 aiWriteSessionHours。
 */
const writeTemperature = ref(getSetting<number>('aiWriteTemperature'))
const writeMaxTokens = ref(getSetting<number>('aiWriteMaxTokens'))
const writeExtraInstruction = ref(getSetting<string>('aiWriteExtraInstruction'))

/** 面板打开时重新读取（可能被其他标签页或磁盘配置改动） */
function refreshWriteConfig() {
  writeTemperature.value = getSetting<number>('aiWriteTemperature')
  writeMaxTokens.value = getSetting<number>('aiWriteMaxTokens')
  writeExtraInstruction.value = getSetting<string>('aiWriteExtraInstruction')
}

function saveWriteTemperature(val: number) {
  writeTemperature.value = val
  setSetting('aiWriteTemperature', val)
}

function saveWriteMaxTokens(val: number) {
  writeMaxTokens.value = val
  setSetting('aiWriteMaxTokens', val)
}

function saveWriteExtraInstruction(val: string) {
  writeExtraInstruction.value = val
  setSetting('aiWriteExtraInstruction', val)
}

// ── 普通段落设置（使用共享 ref，变更时预览自动响应）──
function saveParaFontSize(val: number) {
  paraFontSize.value = val
}
function saveParaLineHeight(val: number) {
  paraLineHeight.value = val
}
function saveParaFontWeight(val: string) {
  paraFontWeight.value = val
}
function saveParaMargin(val: number) {
  paraMargin.value = val
}
function saveParaIndent(val: string) {
  paraIndent.value = val
}

function resetParaDefaults() {
  saveParaFontSize(16)
  saveParaLineHeight(1.85)
  saveParaFontWeight('400')
  saveParaMargin(24)
  saveParaIndent('')
}

/** 普通段落卡片自己的「恢复默认」 */
function onResetPara() {
  resetParaDefaults()
  emit('toast', '普通段落已恢复默认')
}

/** 编辑区字号卡片自己的「恢复默认」 */
function onResetEditorFontSize() {
  resetEditorFontSize()
  emit('toast', '编辑区字号已恢复默认')
}

async function handleTestConnection() {
  if (!githubRepo.value || !githubToken.value) return
  githubTesting.value = true
  githubTestResult.value = ''
  githubTestError.value = ''
  try {
    await testConnection({
      repo: githubRepo.value,
      token: githubToken.value,
      branch: githubBranch.value || 'main',
    })
    githubTestResult.value = 'ok'
  } catch (e: unknown) {
    githubTestResult.value = 'fail'
    githubTestError.value = getErrorMessage(e, '连接失败')
  }
  githubTesting.value = false
}

async function handleTestLetuConnection() {
  if (!letaToken.value) return
  letaTesting.value = true
  letaTestResult.value = ''
  letaTestError.value = ''
  try {
    await testLetaConnection({
      token: letaToken.value,
      storageId: letaStorageId.value || '1',
    })
    letaTestResult.value = 'ok'
  } catch (e: unknown) {
    letaTestResult.value = 'fail'
    letaTestError.value = getErrorMessage(e, '连接失败')
  }
  letaTesting.value = false
}

const currentZoom = ref(getSetting<number>('pageZoom'))

const updateChecking = ref(false)
const updateMessage = ref('')
const updateError = ref(false)

// ── 公众号配置 ──
const wechatAppId = ref(getSetting<string>('wechatAppId'))
const wechatAppSecret = ref(getSetting<string>('wechatAppSecret'))
const wechatDefaultAuthor = ref(getSetting<string>('wechatDefaultAuthor'))

function saveWechatAppId(val: string) {
  wechatAppId.value = val
  setSetting('wechatAppId', val)
}
function saveWechatAppSecret(val: string) {
  wechatAppSecret.value = val
  setSetting('wechatAppSecret', val)
}
function saveWechatDefaultAuthor(val: string) {
  wechatDefaultAuthor.value = val
  setSetting('wechatDefaultAuthor', val)
}

// ── 云端文章 GitHub 配置（Token 按工作区单独配置）──

// ── 文章存储模式（仅桌面端）──
const articleStorageMode = ref<'github' | 'local'>(
  getSetting<'github' | 'local'>('articleStorageMode'),
)

function saveArticleStorageMode(mode: 'github' | 'local') {
  if (mode === articleStorageMode.value) return
  articleStorageMode.value = mode
  setSetting('articleStorageMode', mode)
}

// ── 文章文件命名方式（桌面端 / Web 端均适用）──
/** 是否用「菜单树文章名 + 短哈希」命名文章文件，默认关闭 */
const articleTitleNaming = ref<boolean>(
  getSetting<string>('articleFileNaming') === ARTICLE_NAMING_TITLE,
)
watch(articleTitleNaming, (val) =>
  setSetting('articleFileNaming', val ? ARTICLE_NAMING_TITLE : ARTICLE_NAMING_ID),
)

// ── 本地存储目录（仅桌面端、local 模式）──
const articleStorageDir = ref<string>(getSetting<string>('articleStorageDir'))
const dirChanging = ref(false)
const dirError = ref('')

function clearDirError() {
  dirError.value = ''
}

async function onSelectStorageDir() {
  // 默认工作区的目录操作总是作用于第一个本地工作区
  bindPrimaryActive()
  dirChanging.value = true
  clearDirError()
  try {
    const { pickArticleDir } = await import('@/services/localArticleStorage')
    const dir = await pickArticleDir()
    if (dir) {
      articleStorageDir.value = dir
      bindPrimaryLocalDir(dir)
      // 通知编辑器重新加载本地树
      window.dispatchEvent(
        new CustomEvent('setting-changed', {
          detail: { key: 'articleStorageDir', value: dir },
        }),
      )
    }
  } catch (e: unknown) {
    dirError.value = getErrorMessage(e, '选择目录失败')
    console.error('[SettingsBoard] select storage dir failed:', e)
  } finally {
    dirChanging.value = false
  }
}

async function onChangeStorageDir() {
  // 先让用户选目标目录，再执行剪切移动
  clearDirError()
  // 移动前先切到默认工作区，确保移动的是「默认工作区」的文件
  bindPrimaryActive()
  const { open } = await import('@tauri-apps/plugin-dialog')
  const target = await open({
    directory: true,
    title: '选择文章存储目录（原有文章将移动到此处）',
    canCreateDirectories: true,
  })
  if (typeof target !== 'string' || !target) return

  dirChanging.value = true
  try {
    const { moveArticleDir } = await import('@/services/localArticleStorage')
    await moveArticleDir(target)
    articleStorageDir.value = target
    bindPrimaryLocalDir(target)
    window.dispatchEvent(
      new CustomEvent('setting-changed', {
        detail: { key: 'articleStorageDir', value: target },
      }),
    )
  } catch (e: unknown) {
    dirError.value = getErrorMessage(e, '移动目录失败，请选择空目录后重试')
    console.error('[SettingsBoard] move storage dir failed:', e)
  } finally {
    dirChanging.value = false
  }
}

async function onResetStorageDir() {
  // 默认工作区的目录操作总是作用于第一个本地工作区
  bindPrimaryActive()
  dirChanging.value = true
  clearDirError()
  try {
    const { resetToDefaultDir } = await import('@/services/localArticleStorage')
    await resetToDefaultDir()
    articleStorageDir.value = ''
    bindPrimaryLocalDir('')
    window.dispatchEvent(
      new CustomEvent('setting-changed', {
        detail: { key: 'articleStorageDir', value: '' },
      }),
    )
  } catch (e: unknown) {
    dirError.value = getErrorMessage(e, '恢复默认目录失败')
    console.error('[SettingsBoard] reset storage dir failed:', e)
  } finally {
    dirChanging.value = false
  }
}

/** 当前正在测试中的工作区 id（空表示无） */
const cloudTestingWsId = ref<string | null>(null)
/** 各工作区的测试结果：'ok' | 'fail' | ''，以及失败信息 */
const cloudTestResult = ref<Record<string, 'ok' | 'fail' | ''>>({})
const cloudTestError = ref<Record<string, string>>({})

function onCloudTokenInput(id: string, val: string) {
  setWorkspaceToken(id, val)
}

// ── 文章工作区管理（github 多仓库/分支 + local 多目录）──
const localWorkspaces = computed(() => listWorkspaces('local'))
const githubWorkspaces = computed(() => listWorkspaces('github'))

/** 待删除的工作区（确认弹窗用，null 表示未在确认中） */
const pendingDeleteWorkspace = ref<{ kind: 'github' | 'local'; id: string } | null>(null)
const deleteConfirmVisible = ref(false)
const deletingWorkspace = ref(false)

function requestDeleteWorkspace(kind: 'github' | 'local', id: string) {
  pendingDeleteWorkspace.value = { kind, id }
  deleteConfirmVisible.value = true
}

const deleteWorkspaceName = computed(() => {
  const target = pendingDeleteWorkspace.value
  if (!target) return ''
  const ws = getWorkspaceById(target.id)
  if (!ws) return ''
  if (ws.kind === 'github') return ws.repo ? `「${ws.repo}」` : ''
  return ws.dir ? `「${ws.dir}」` : ''
})

/** 删除确认文案：按工作区类型区分远程/本地 */
const deleteWorkspaceMessage = computed(() => {
  const target = pendingDeleteWorkspace.value
  if (!target) return ''
  const kindLabel = target.kind === 'github' ? '远程' : '本地'
  return `确定删除该工作区${deleteWorkspaceName.value}？删除后其 tree.json 缓存将被清除，但${kindLabel}数据文件不会被删除。`
})

async function confirmDeleteWorkspace() {
  const target = pendingDeleteWorkspace.value
  if (!target) return
  deletingWorkspace.value = true
  try {
    if (target.kind === 'github') {
      await removeCloudWorkspace(target.id)
    } else {
      await removeLocalWorkspace(target.id)
    }
  } finally {
    deletingWorkspace.value = false
    pendingDeleteWorkspace.value = null
    deleteConfirmVisible.value = false
  }
}

function isCloudActive(id: string): boolean {
  return activeGithubWorkspaceId.value === id
}

function isLocalActive(id: string): boolean {
  return activeLocalWorkspaceId.value === id
}

function onCloudRepoInput(id: string, val: string) {
  updateWorkspace(id, { repo: val.trim() })
}

function onCloudBranchInput(id: string, val: string) {
  updateWorkspace(id, { branch: val.trim() || 'main' })
}

function onCloudRepoBlur(id: string) {
  const ws = getWorkspaceById(id)
  if (!ws) return
  // 正在编辑的是激活工作区时，失焦即应用并重载
  if (isCloudActive(id)) {
    switchToWorkspace('github', id)
  }
}

function addCloudWorkspace() {
  addWorkspace('github', { repo: '', branch: 'main' })
}

async function onSwitchCloudWorkspace(id: string) {
  await switchToWorkspace('github', id)
}

async function removeCloudWorkspace(id: string) {
  const wasActive = isCloudActive(id)
  removeWorkspace(id)
  if (wasActive) {
    const remains = listWorkspaces('github')
    if (remains.length > 0) {
      await switchToWorkspace('github', remains[0].id)
    } else {
      // 删光所有仓库 → 视为未配置
      if (getSetting<string>('cloudArticleRepo')) GitHubTreeService.clearRepo()
      // 桌面端且仍有本地工作区：提示是否切到本地磁盘模式，避免树结构空置
      if (isTauri && localWorkspaces.value.length > 0) {
        switchToLocalPromptVisible.value = true
      }
    }
  }
}

/** 删光 github 仓库后，询问是否切换到本地磁盘模式的弹窗 */
const switchToLocalPromptVisible = ref(false)

async function confirmSwitchToLocal() {
  const primary = localWorkspaces.value[0]
  if (primary) await switchToWorkspace('local', primary.id)
  // 同步设置弹窗内的存储位置高亮（本地工作区「设为当前」由共享 ref 自动更新）
  articleStorageMode.value = 'local'
  switchToLocalPromptVisible.value = false
}

async function onAddLocalWorkspace() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    directory: true,
    title: '选择本地工作区目录（将自动创建 tree.json / articles / images）',
    canCreateDirectories: true,
  })
  if (typeof selected !== 'string' || !selected) return
  const dir = selected.trim().replace(/\/+$/, '')
  const exists = localWorkspaces.value.some((ws) => ws.dir === dir)
  if (exists) {
    emit('toast', '该目录已添加为本地工作区，请勿重复添加')
    return
  }
  addWorkspace('local', { dir })
}

async function removeLocalWorkspace(id: string) {
  const wasActive = isLocalActive(id)
  removeWorkspace(id)
  if (wasActive) {
    const remains = listWorkspaces('local')
    if (remains.length > 0) {
      await switchToWorkspace('local', remains[0].id)
    } else {
      setSetting('articleStorageDir', '')
    }
  }
}

function onSwitchLocalWorkspace(id: string) {
  switchToWorkspace('local', id)
}

/** 绑定「默认/第一个」本地工作区目录（移动/选择/恢复操作后调用） */
function bindPrimaryLocalDir(dir: string) {
  articleStorageDir.value = dir
  const primary = localWorkspaces.value[0]
  if (primary) {
    updateWorkspace(primary.id, { dir })
    setActiveWorkspace('local', primary.id)
  }
}

/** 切换激活到「默认/第一个」本地工作区（不改变目录内容） */
function bindPrimaryActive() {
  const primary = localWorkspaces.value[0]
  if (primary) setActiveWorkspace('local', primary.id)
}

async function handleCloudTestConnection(id: string) {
  const ws = getWorkspaceById(id)
  const token = ws ? getWorkspaceToken(ws.id) : ''
  if (!token || !ws?.repo || !ws.repo.includes('/')) {
    cloudTestResult.value = { ...cloudTestResult.value, [id]: 'fail' }
    cloudTestError.value = { ...cloudTestError.value, [id]: '请填写 Token 和仓库' }
    return
  }
  const slashIdx = ws.repo.indexOf('/')
  const owner = ws.repo.substring(0, slashIdx)
  const repoName = ws.repo.substring(slashIdx + 1)

  cloudTestingWsId.value = id
  cloudTestResult.value = { ...cloudTestResult.value, [id]: '' }
  cloudTestError.value = { ...cloudTestError.value, [id]: '' }
  try {
    await GitHubTreeService.testConnection(owner, repoName, token, ws.branch || 'main')
    cloudTestResult.value = { ...cloudTestResult.value, [id]: 'ok' }
  } catch (e: unknown) {
    cloudTestResult.value = { ...cloudTestResult.value, [id]: 'fail' }
    cloudTestError.value = { ...cloudTestError.value, [id]: getErrorMessage(e, '连接失败') }
  }
  cloudTestingWsId.value = null
}

async function applyZoom(scale: number) {
  currentZoom.value = scale
  setSetting('pageZoom', scale)
  try {
    await invoke('set_page_zoom', { scale: scale / 100 })
  } catch {
    // 非 Tauri 环境忽略
  }
}

/** 打开 GitHub 仓库主页（桌面端在系统浏览器新开页面） */
function openGitHubRepo() {
  const url = 'https://github.com/RobocopMao/r-markdown'
  if (isTauri) {
    open(url).catch(() => window.open(url, '_blank'))
  } else {
    window.open(url, '_blank')
  }
}

/**
 * 手动检查更新。复用 EditorPage 的更新弹窗：
 * 检查成功后把结果写入共享的 autoUpdatePending / autoUpdateRid，
 * 由 EditorPage 的 watcher 统一弹出「发现新版本」弹窗并处理下载。
 */
async function manualCheckUpdate() {
  updateChecking.value = true
  updateMessage.value = ''
  updateError.value = false

  const result = await checkForUpdates()

  if (result.error) {
    updateMessage.value = result.error
    updateError.value = true
  } else if (result.update) {
    autoUpdatePending.value = result.update
    autoUpdateRid.value = result.rid
  } else {
    autoUpdatePending.value = null
    updateMessage.value = '已是最新版本'
    updateError.value = false
  }

  updateChecking.value = false
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-4">
      <BoardHeader
        title="设置"
        description="排版、图床、文章存储与 AI 接口都在这里调"
        @close="emit('close')"
      >
        <!-- 标签页：统一放在标题下面一行靠左 -->
        <template #tabs>
          <button
            class="board-tab"
            :class="{ active: settingsTab === 'basic' }"
            @click="settingsTab = 'basic'"
          >
            基础设置
          </button>
          <button
            class="board-tab"
            :class="{ active: settingsTab === 'github' }"
            @click="settingsTab = 'github'"
          >
            图片设置
          </button>
          <button
            class="board-tab"
            :class="{ active: settingsTab === 'cloud' }"
            @click="settingsTab = 'cloud'"
          >
            {{ isTauri ? '文章存储' : '文章仓库' }}
          </button>
          <button
            v-if="isTauri"
            class="board-tab"
            :class="{ active: settingsTab === 'wechat' }"
            @click="settingsTab = 'wechat'"
          >
            公众号
          </button>
          <button
            class="board-tab"
            :class="{ active: settingsTab === 'ai' }"
            @click="settingsTab = 'ai'"
          >
            AI 设置
          </button>
          <button
            class="board-tab"
            :class="{ active: settingsTab === 'other' }"
            @click="settingsTab = 'other'"
          >
            关于
          </button>
        </template>
      </BoardHeader>

      <!-- 基础设置 -->
      <template v-if="settingsTab === 'basic'">
        <MasonryFlow>
          <!-- 普通段落：三列子卡 + 两列补充 -->
          <SettingsCard title="普通段落" description="设置默认的文字排版参数" icon-text="A">
            <template #action>
              <button class="settings-reset-btn" @click="onResetPara">
                <RotateCcw :size="12" :stroke-width="2" />
                <span>恢复默认</span>
              </button>
            </template>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">字体大小</span>
                  <span class="settings-subcard-value">{{ paraFontSize }}px</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="paraFontSize"
                  :min="12"
                  :max="24"
                  @update:model-value="saveParaFontSize"
                />
                <div class="settings-subcard-range">
                  <span>12px</span>
                  <span>24px</span>
                </div>
              </div>

              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">行高</span>
                  <span class="settings-subcard-value">{{ paraLineHeight }}</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="paraLineHeight"
                  :min="1.2"
                  :max="3"
                  :step="0.05"
                  @update:model-value="saveParaLineHeight"
                />
                <div class="settings-subcard-range">
                  <span>1.2</span>
                  <span>3.0</span>
                </div>
              </div>

              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">段落间距</span>
                  <span class="settings-subcard-value">{{ paraMargin }}px</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="paraMargin"
                  :min="8"
                  :max="48"
                  @update:model-value="saveParaMargin"
                />
                <div class="settings-subcard-range">
                  <span>8px</span>
                  <span>48px</span>
                </div>
              </div>
            </div>

            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <span class="settings-subcard-label">字重</span>
                <select
                  :value="paraFontWeight"
                  class="settings-select mt-2 w-full"
                  :style="selectChevronStyle"
                  @change="saveParaFontWeight(($event.target as HTMLSelectElement).value)"
                >
                  <option value="300">300（更细）</option>
                  <option value="400">400（常规）</option>
                  <option value="500">500（中等）</option>
                  <option value="600">600（半粗）</option>
                  <option value="700">700（粗体）</option>
                </select>
              </div>

              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">首行缩进</span>
                  <span v-if="paraIndent" class="settings-subcard-value">{{ paraIndent }}</span>
                </div>
                <input
                  type="text"
                  :value="paraIndent"
                  placeholder="如 2em（不填则不缩进）"
                  class="settings-input mt-2 w-full"
                  @input="saveParaIndent(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </SettingsCard>

          <!-- 桌面端专属：页面缩放 + 自动保存 -->
          <SettingsCard
            v-if="isTauri"
            title="页面缩放"
            description="调整整个客户端的界面比例"
            :icon="ZoomIn"
          >
            <div class="flex flex-wrap gap-2">
              <button
                v-for="p in ZOOM_PRESETS"
                :key="p"
                class="settings-chip"
                :class="{ active: currentZoom === p }"
                @click="applyZoom(p)"
              >
                {{ p }}%
              </button>
            </div>
            <p class="settings-note mt-2.5">当前缩放：{{ currentZoom }}%（设置会自动保存）</p>
          </SettingsCard>

          <SettingsCard
            v-if="isTauri"
            title="自动保存"
            description="停止输入后自动暂存当前文章"
            :icon="Save"
          >
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: autoSaveEnabled }"
                role="switch"
                :aria-checked="autoSaveEnabled"
                @click="autoSaveEnabled = !autoSaveEnabled"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <p
              v-if="!autoSaveEnabled"
              class="mb-3 rounded-lg bg-[var(--accent-light)] px-3 py-2 text-[12px] text-[var(--accent)]"
            >
              自动保存已关闭，请及时手动保存（工具栏「暂存」按钮）
            </p>
            <span class="settings-subcard-label" :class="{ 'opacity-40': !autoSaveEnabled }">
              保存间隔
            </span>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="s in SAVE_INTERVAL_PRESETS"
                :key="s"
                class="settings-chip"
                :class="{ active: autoSaveInterval === s }"
                :disabled="!autoSaveEnabled"
                @click="autoSaveInterval = s"
              >
                {{ s }}s
              </button>
            </div>
            <p class="settings-note mt-2.5">
              当前间隔：{{ autoSaveInterval }}s（停止输入后触发保存）
            </p>
          </SettingsCard>

          <!-- 预览与界面 -->
          <SettingsCard
            v-if="!isMobile"
            title="预览缩略图"
            description="在预览区右侧显示文档全貌缩略图"
            :icon="Images"
          >
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: minimapEnabled }"
                role="switch"
                :aria-checked="minimapEnabled"
                @click="minimapEnabled = !minimapEnabled"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <p class="settings-note">开启后可在预览区右侧看到文档全貌缩略图，点击可快速跳转</p>
          </SettingsCard>

          <SettingsCard
            v-if="!isMobile"
            title="文档大纲"
            description="启用编辑器右侧标题大纲"
            :icon="FileText"
          >
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: outlineEnabled }"
                role="switch"
                :aria-checked="outlineEnabled"
                @click="outlineEnabled = !outlineEnabled"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <p class="settings-note">
              关闭后工具栏「大纲」按钮与右侧面板一起隐藏；开启后用工具栏按钮展开或收起
            </p>
          </SettingsCard>

          <SettingsCard
            v-if="!isMobile"
            title="底部状态栏"
            description="显示编辑器底部状态栏"
            :icon="BarChart3"
          >
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: statusBarEnabled }"
                role="switch"
                :aria-checked="statusBarEnabled"
                @click="statusBarEnabled = !statusBarEnabled"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <p class="settings-note">显示光标所在行列、选中字数、总字数与预估阅读时长</p>
          </SettingsCard>

          <SettingsCard v-if="!isMobile" title="命令面板" description="快捷键" :icon="Command">
            <template #action>
              <button
                ref="shortcutButtonRef"
                class="settings-shortcut"
                :class="{ recording: shortcutRecording }"
                @click="startShortcutRecording"
                @keydown="onShortcutKeydown"
              >
                {{ shortcutRecording ? '请按下快捷键…' : commandPaletteShortcutText }}
              </button>
            </template>
            <p class="settings-note">
              用于快速搜索草稿、云文章、本地文章与素材。点击后按下新的组合键即可修改，需包含
              {{ modifierKeyList() }} 之一；恢复默认请按 <span class="font-medium">Esc</span>。
            </p>
          </SettingsCard>

          <SettingsCard v-if="!isMobile" title="格式化文档" description="快捷键" :icon="AlignLeft">
            <template #action>
              <button
                ref="formatShortcutButtonRef"
                class="settings-shortcut"
                :class="{ recording: formatShortcutRecording }"
                @click="startFormatShortcutRecording"
                @keydown="onFormatShortcutKeydown"
              >
                {{ formatShortcutRecording ? '请按下快捷键…' : formatShortcutText }}
              </button>
            </template>
            <p class="settings-note">
              一键整理当前文档：组件标签去缩进、块级组件前后补空行、清理行尾空白与连续空行、统一列表与标题层级。执行后可用
              ⌘Z 撤销。点击后按下新的组合键即可修改，需包含
              {{ modifierKeyList() }} 之一；恢复默认请按 <span class="font-medium">Esc</span>。
            </p>
          </SettingsCard>

          <SettingsCard
            title="编辑区字号"
            description="设置编辑区域（Markdown 输入区）的显示字号"
            icon-text="Tt"
          >
            <template #action>
              <button class="settings-reset-btn" @click="onResetEditorFontSize">
                <RotateCcw :size="12" :stroke-width="2" />
                <span>恢复默认</span>
              </button>
            </template>
            <div class="settings-subcard">
              <div class="flex items-end justify-between">
                <span class="settings-subcard-label">字号</span>
                <span class="settings-subcard-value">{{ editorFontSize }}px</span>
              </div>
              <SettingsSlider
                class="mt-2.5"
                :model-value="editorFontSize"
                :min="11"
                :max="20"
                @update:model-value="saveEditorFontSize"
              />
              <div class="settings-subcard-range">
                <span>11px</span>
                <span>20px</span>
              </div>
            </div>
            <p class="settings-note mt-2.5">
              仅调整左侧编辑区（Markdown
              输入区）的显示字号，不影响预览效果与导出排版。行距会随字号等比放大。
            </p>
          </SettingsCard>

          <SettingsCard title="编辑器主题" description="切换编辑器界面主题" :icon="Palette">
            <select
              :value="editorTheme"
              class="settings-select w-full"
              :style="selectChevronStyle"
              @change="saveEditorTheme(($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="浅色主题">
                <option value="default">默认</option>
                <option value="github-light">GitHub Light</option>
                <option value="solarized-light">Solarized Light</option>
                <option value="material-light">Material Light</option>
              </optgroup>
              <optgroup label="深色主题">
                <option value="one-dark">One Dark</option>
                <option value="github-dark">GitHub Dark</option>
                <option value="solarized-dark">Solarized Dark</option>
                <option value="material-dark">Material Dark</option>
                <option value="dracula">Dracula</option>
                <option value="monokai">Monokai</option>
              </optgroup>
            </select>
            <p class="settings-note mt-2.5">
              仅切换语法高亮色，编辑器背景不受主题切换影响。切换后立即生效，设置自动保存。
            </p>
          </SettingsCard>
        </MasonryFlow>
      </template>

      <!-- AI 设置（内部再分「AI 文本 / AI 图片」两个子页，共用同一个设置 tab） -->
      <template v-if="settingsTab === 'ai'">
        <div class="flex gap-1.5 mb-4">
          <button class="board-tab" :class="{ active: aiPane === 'text' }" @click="aiPane = 'text'">
            AI 文本
          </button>
          <button
            class="board-tab"
            :class="{ active: aiPane === 'image' }"
            @click="aiPane = 'image'"
          >
            AI 图片
          </button>
        </div>

        <!--
        AI 文本 = 写作 + 排版。
        接口地址 / API Key / 模型名三项是两者共用的，只出现一次；
        「AI 排版」「AI 写作」两张卡只放与任务相关、两边取值不同的采样参数。
      -->
        <MasonryFlow v-if="aiPane === 'text'">
          <SettingsCard
            title="接口配置"
            description="写作与排版共用的 OpenAI 兼容接口"
            :icon="KeyRound"
          >
            <p class="settings-note">
              「AI 文本」是写作与排版的公共配置：填写任意 OpenAI 兼容接口即可使用编辑器内的「AI
              排版」（把文章转成 R-Markdown 排版稿）与「AI
              写作」（用内置的卡兹克写作技能以对话方式出长文）。接口地址、API&nbsp;Key、模型名均由你自己提供，应用不代付费用；API&nbsp;Key
              加密后仅保存在本地。但请注意：<span class="text-[var(--text-primary)]"
                >你发的内容会发送给你配置的模型服务商</span
              >。
            </p>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <span class="settings-subcard-label">接口地址</span>
                <input
                  :value="aiBaseUrl"
                  placeholder="https://api.deepseek.com/v1"
                  class="settings-input mt-2 w-full"
                  @input="saveAiBaseUrl(($event.target as HTMLInputElement).value)"
                />
                <p class="settings-note mt-1.5">
                  兼容 /chat/completions 的地址；省略版本段时会自动补 /v1。
                </p>
              </div>

              <div class="settings-subcard">
                <span class="settings-subcard-label">API Key</span>
                <input
                  :value="aiApiKey"
                  type="password"
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
                  class="settings-input mt-2 w-full"
                  @input="saveAiApiKey(($event.target as HTMLInputElement).value)"
                />
                <p class="settings-note mt-1.5">加密后仅保存在本地，不会上传到别处。</p>
              </div>
            </div>

            <!--
            勾选顺序有意义：**第一项就是默认模型**，面板没单独选过时用它。
            所以这里不再另设「默认模型」下拉——同一份清单选两次，纯属多余。
          -->
            <div class="mt-3 settings-subcard">
              <div class="flex items-end justify-between gap-2">
                <span class="settings-subcard-label">模型名</span>
                <button
                  class="settings-chip"
                  :disabled="modelListLoading"
                  @click="handleFetchModels"
                >
                  {{ modelListLoading ? '查询中…' : '获取模型列表' }}
                </button>
              </div>
              <div class="mt-2">
                <ModelMultiSelect
                  :models="aiModels"
                  :options="modelList"
                  placeholder="手填模型名后回车添加，如 deepseek-chat"
                  @update:models="saveAiModels"
                />
              </div>
              <p v-if="modelListError" class="mt-1.5 text-[11px] text-[#e74c3c]">
                {{ modelListError }}
              </p>
              <p v-else-if="modelList.length > 0" class="settings-note mt-1.5">
                已获取 {{ modelList.length }} 个模型，勾选常用的几个即可；排在最前的一个就是默认。
              </p>
              <p v-else class="settings-note mt-1.5">
                手填模型名后回车添加；也可以点上面的「获取模型列表」从接口拉取。
              </p>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-3">
              <button
                class="settings-chip"
                :disabled="aiTesting || !aiBaseUrl || !aiApiKey"
                @click="handleTestAiConnection"
              >
                {{ aiTesting ? '测试中…' : '测试连接' }}
              </button>
              <span
                v-if="aiTestResult === 'ok'"
                class="text-[12px]"
                :style="{ color: colors.accent }"
                >连接成功</span
              >
              <span v-if="aiTestResult === 'fail'" class="text-[12px] text-[#e74c3c]">{{
                aiTestError
              }}</span>
              <span v-else-if="aiHint" class="settings-note">{{ aiHint }}</span>
            </div>
          </SettingsCard>

          <SettingsCard title="流式输出" description="边生成边显示，不用等整段返回" :icon="Zap">
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: aiStream }"
                role="switch"
                :aria-checked="aiStream"
                @click="saveAiStream(!aiStream)"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <p class="settings-note">关闭后等整段生成完再一次性显示，适合网络不稳时使用。</p>
          </SettingsCard>

          <!-- ── 以下是两边取值不同的采样参数，按用途分卡 ── -->
          <SettingsCard
            title="AI 排版"
            description="把文章按组件规范重排；确定性高，温度与输出上限都比写作低"
            :icon="PenLine"
          >
            <div class="space-y-3">
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">采样温度</span>
                  <span class="settings-subcard-value">{{ aiTemperature }}</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="aiTemperature"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  @update:model-value="saveAiTemperature"
                />
                <div class="settings-subcard-range">
                  <span>0（稳定）</span>
                  <span>1（发散）</span>
                </div>
                <p class="settings-note mt-1.5">
                  越低越稳定踏实，越高越有变化。排版任务建议 0.2–0.4。
                </p>
              </div>

              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">最大输出</span>
                  <span class="settings-subcard-value">{{ aiMaxTokens }}</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="aiMaxTokens"
                  :min="1024"
                  :max="32768"
                  :step="1024"
                  @update:model-value="saveAiMaxTokens"
                />
                <div class="settings-subcard-range">
                  <span>1024</span>
                  <span>32768 tokens</span>
                </div>
                <p class="settings-note mt-1.5">长文排版结果被截断时调大此值。</p>
              </div>

              <!-- 保留时长（每个面板各设各的）：口径是「从最后一次请求算起」 -->
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">结果保留时长</span>
                  <span class="settings-subcard-value">{{ aiFormatSessionHours }}h</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="aiFormatSessionHours"
                  :min="MIN_SESSION_HOURS"
                  :max="MAX_SESSION_HOURS"
                  :step="1"
                  @update:model-value="(v: number) => saveSessionHours('aiFormatSessionHours', v)"
                />
                <div class="settings-subcard-range">
                  <span>{{ MIN_SESSION_HOURS }}h</span>
                  <span>{{ MAX_SESSION_HOURS }}h</span>
                </div>
                <p class="settings-note mt-1.5">
                  排版结果的面板保留时长，从最后一次请求算起；到期后不再恢复。
                </p>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            title="AI 写作"
            description="用内置的卡兹克写作技能以对话方式出公众号长文"
            :icon="Sparkles"
          >
            <div class="space-y-3">
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">采样温度</span>
                  <span class="settings-subcard-value">{{ writeTemperature.toFixed(1) }}</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="writeTemperature"
                  :min="0"
                  :max="1.5"
                  :step="0.1"
                  @update:model-value="saveWriteTemperature"
                />
                <div class="settings-subcard-range">
                  <span>0（稳定）</span>
                  <span>1.5（发散）</span>
                </div>
                <p class="settings-note mt-1.5">
                  默认
                  {{ DEFAULT_WRITE_TEMPERATURE }}。写作需要比排版更高的发散度；调太低会写得很平。
                </p>
              </div>

              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">最大输出</span>
                  <span class="settings-subcard-value">{{ writeMaxTokens }}</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="writeMaxTokens"
                  :min="MIN_WRITE_MAX_TOKENS"
                  :max="MAX_WRITE_MAX_TOKENS"
                  :step="1024"
                  @update:model-value="saveWriteMaxTokens"
                />
                <div class="settings-subcard-range">
                  <span>{{ MIN_WRITE_MAX_TOKENS }}</span>
                  <span>{{ MAX_WRITE_MAX_TOKENS }} tokens</span>
                </div>
                <p class="settings-note mt-1.5">
                  单次输出上限，默认 {{ DEFAULT_WRITE_MAX_TOKENS }}。公众号长文 4000-8000
                  字，比排版需要更大余量；结果被截断时调大。
                </p>
              </div>

              <!-- 保留时长（每个面板各设各的）：口径是「从最后一次请求算起」 -->
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">结果保留时长</span>
                  <span class="settings-subcard-value">{{ aiWriteSessionHours }}h</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="aiWriteSessionHours"
                  :min="MIN_SESSION_HOURS"
                  :max="MAX_SESSION_HOURS"
                  :step="1"
                  @update:model-value="(v: number) => saveSessionHours('aiWriteSessionHours', v)"
                />
                <div class="settings-subcard-range">
                  <span>{{ MIN_SESSION_HOURS }}h</span>
                  <span>{{ MAX_SESSION_HOURS }}h</span>
                </div>
                <p class="settings-note mt-1.5">
                  写作对话与稿件的面板保留时长，从最后一次请求算起；到期后打开面板会开启新会话。
                </p>
              </div>

              <div class="settings-subcard">
                <span class="settings-subcard-label">长期补充要求（可留空）</span>
                <textarea
                  :value="writeExtraInstruction"
                  rows="3"
                  placeholder="例如：结尾不要行动呼吁 / 不要出现「我」/ 每篇开头先讲一个具体场景"
                  class="settings-input mt-2 w-full resize-y"
                  @input="saveWriteExtraInstruction(($event.target as HTMLTextAreaElement).value)"
                />
                <p class="settings-note mt-1.5">
                  每次写作都会拼进 system prompt，用来固化个人偏好，不用每篇都重复说。
                </p>
              </div>
            </div>
          </SettingsCard>
        </MasonryFlow>

        <!-- AI 图片（按厂商配置：各厂商参数不同，这里以厂商注册表为准逐项渲染） -->
        <MasonryFlow v-if="aiPane === 'image'">
          <SettingsCard
            title="厂商与接口"
            description="配置按厂商分开保存，换厂商不会串配置"
            :icon="Image"
          >
            <div class="grid gap-3 sm:grid-cols-2">
              <!-- 厂商下拉常显：即便当前只有一家，也让「配置按厂商分开存」这件事可见 -->
              <div class="settings-subcard">
                <span class="settings-subcard-label">厂商</span>
                <select
                  :value="imageProviderId"
                  class="settings-select mt-2 w-full"
                  :style="selectChevronStyle"
                  @change="switchImageProvider(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="p in IMAGE_PROVIDERS" :key="p.id" :value="p.id">
                    {{ p.name }}
                  </option>
                </select>
                <p class="settings-note mt-1.5">
                  各厂商参数不同，配置按厂商分开保存；当前可选：{{
                    IMAGE_PROVIDERS.map((p) => p.name).join('、')
                  }}。
                </p>
              </div>

              <!--
              中转站紧跟在厂商下面：选了哪家站才决定下面「接口地址」填什么，
              所以顺序是 厂商 → 中转站 → 接口地址。不声明 relays 的厂商（如 Agnes）整块不渲染。
            -->
              <div v-if="imageDef.relays?.length" class="settings-subcard">
                <span class="settings-subcard-label">中转站</span>
                <select
                  :value="imageConfig.relay"
                  class="settings-select mt-2 w-full"
                  :style="selectChevronStyle"
                  @change="saveImageRelay(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">不使用（官方直连 / 标准同步接口）</option>
                  <option v-for="relay in imageDef.relays" :key="relay.id" :value="relay.id">
                    {{ relay.name }}
                  </option>
                </select>
                <p class="settings-note mt-1.5">{{ imageRelayHint }}</p>
                <!--
                Key 是按厂商存的（一家一份），换站不会连带换 Key：上一家的 Key 拿去新站用
                必然认证失败，而报错看着像「Key 填错了」，所以这里点名说清要重填。
              -->
                <p class="mt-1.5 text-[11px] text-[#d97706] dark:text-[#f0b429]">
                  切换中转站后，请重新填写该站的 API Key——各站 Key 不通用。
                </p>
              </div>
            </div>

            <p class="settings-note mt-3">{{ imageDef.intro }}</p>
          </SettingsCard>

          <SettingsCard
            title="接口与密钥"
            description="填完地址、Key、模型名就能立刻测一次连通性"
            :icon="KeyRound"
          >
            <!--
            版式：接口地址 + API Key 并排一行，模型名独占一行。
            「获取模型列表」跟着模型名走——拉的是模型，不属于地址/密钥那一排。
          -->
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <div class="flex items-end justify-between gap-2">
                  <span class="settings-subcard-label">接口地址</span>
                  <div class="flex flex-wrap justify-end gap-1.5">
                    <button
                      v-for="alt in imageDef.altBaseUrls"
                      :key="alt.url"
                      class="settings-chip"
                      :disabled="imageConfig.baseUrl === alt.url"
                      @click="saveImageBaseUrl(alt.url)"
                    >
                      {{ imageConfig.baseUrl === alt.url ? '当前：' : '改用' }}{{ alt.label }}
                    </button>
                  </div>
                </div>
                <input
                  :value="imageConfig.baseUrl"
                  :placeholder="imageDef.baseUrl"
                  class="settings-input mt-2 w-full"
                  @input="saveImageBaseUrl(($event.target as HTMLInputElement).value)"
                />
                <p class="settings-note mt-1.5">
                  形如 <span class="font-mono">{{ imageDef.baseUrl }}</span
                  >；省略版本段时会自动补 /v1。
                </p>
              </div>

              <div class="settings-subcard">
                <span class="settings-subcard-label">API Key</span>
                <input
                  :value="imageConfig.apiKey"
                  type="password"
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
                  class="settings-input mt-2 w-full"
                  @input="saveImageApiKey(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <!--
            勾选顺序有意义：**第一项就是默认模型**，配图面板没单独选过时用它。
            手填入口常驻——中转站的 /models 经常漏项，也常把 id 加前缀。
          -->
            <div class="mt-3 settings-subcard">
              <div class="flex items-end justify-between gap-2">
                <span class="settings-subcard-label">模型名</span>
                <button
                  v-if="canFetchImageModels"
                  class="settings-chip"
                  :disabled="imageModelLoading"
                  @click="handleFetchImageModels"
                >
                  {{ imageModelLoading ? '查询中…' : '获取模型列表' }}
                </button>
              </div>
              <div class="mt-2">
                <ModelMultiSelect
                  :models="imageConfig.models"
                  :options="imageModelList"
                  :placeholder="`手填模型名后回车添加，如 ${imageDef.defaultModel}`"
                  @update:models="saveImageModels"
                />
              </div>
            </div>

            <p v-if="imageModelError" class="mt-2 text-[11px] text-[#e74c3c]">
              {{ imageModelError }}
            </p>
            <p v-else-if="imageModelList.length > 0" class="settings-note mt-2">
              已获取
              {{ imageModelList.length }}
              个本厂商可用的模型，勾选常用的几个即可；排在最前的一个就是默认。
            </p>
            <p v-else-if="!canFetchImageModels" class="settings-note mt-2">
              该中转站没有模型列表接口，模型名请在上面的输入框手动填写。
            </p>
            <p v-else-if="imageDef.modelHint" class="settings-note mt-2">
              {{ imageDef.modelHint }}
            </p>
            <!--
            「可能不支持」的提醒：只提示、不拦保存。
            列表已经过滤过，能命中这里的只剩**手填**的模型名（手填故意不受过滤限制）。
          -->
            <p
              v-if="imageModelWarnText"
              class="mt-1.5 text-[11px] text-[#d97706] dark:text-[#f0b429]"
            >
              {{ imageModelWarnText }}
            </p>

            <div class="mt-3 flex flex-wrap items-center gap-3">
              <button
                class="settings-chip"
                :disabled="imageTesting || !imageConfig.baseUrl || !imageConfig.apiKey"
                @click="handleTestImageConnection"
              >
                {{ imageTesting ? '测试中…' : '测试连接' }}
              </button>
              <span
                v-if="imageTestResult === 'ok'"
                class="text-[12px]"
                :style="{ color: colors.accent }"
                >连接成功</span
              >
              <span v-if="imageTestResult === 'fail'" class="text-[12px] text-[#e74c3c]">{{
                imageTestError
              }}</span>
              <span v-else-if="imageHint" class="settings-note">{{ imageHint }}</span>
            </div>
          </SettingsCard>

          <SettingsCard
            title="生成参数"
            description="单次请求的超时与结果在面板里的保留时长"
            :icon="SlidersHorizontal"
          >
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">单次超时</span>
                  <span class="settings-subcard-value">{{ imageConfig.timeoutSec }}s</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="imageConfig.timeoutSec"
                  :min="imageDef.minTimeoutSec"
                  :max="imageDef.maxTimeoutSec"
                  :step="10"
                  @update:model-value="saveImageTimeout"
                />
                <div class="settings-subcard-range">
                  <span>{{ imageDef.minTimeoutSec }}s</span>
                  <span>{{ imageDef.maxTimeoutSec }}s</span>
                </div>
                <p class="settings-note mt-1.5">
                  官方建议 {{ imageDef.minTimeoutSec }}–{{ imageDef.maxTimeoutSec }}
                  秒；复杂提示词与大尺寸需要更久。走中转站时这段时间是「提交 + 轮询」的总时长。
                </p>
              </div>

              <!-- 保留时长（每个面板各设各的）：口径是「从最后一次请求算起」 -->
              <div class="settings-subcard">
                <div class="flex items-end justify-between">
                  <span class="settings-subcard-label">结果保留时长</span>
                  <span class="settings-subcard-value">{{ aiImageSessionHours }}h</span>
                </div>
                <SettingsSlider
                  class="mt-2.5"
                  :model-value="aiImageSessionHours"
                  :min="MIN_SESSION_HOURS"
                  :max="MAX_SESSION_HOURS"
                  :step="1"
                  @update:model-value="(v: number) => saveSessionHours('aiImageSessionHours', v)"
                />
                <div class="settings-subcard-range">
                  <span>{{ MIN_SESSION_HOURS }}h</span>
                  <span>{{ MAX_SESSION_HOURS }}h</span>
                </div>
                <p class="settings-note mt-1.5">
                  生成的图片在面板里保留多久，从最后一次请求算起；已插入编辑器的图片不受影响。
                </p>
              </div>
            </div>

            <p class="settings-note mt-3">
              生成结果不会上传到别处：插入时按「图片设置 →
              粘贴/拖拽上传方式」保存（本地存储、本地磁盘、GitHub 图床或乐塔图床）。
            </p>
          </SettingsCard>
        </MasonryFlow>
      </template>

      <!-- 图床设置 -->
      <template v-if="settingsTab === 'github'">
        <!-- 图床子 tab -->
        <div class="mb-4 flex gap-1.5">
          <button
            class="board-tab"
            :class="{ active: hostingTab === 'upload' }"
            @click="hostingTab = 'upload'"
          >
            上传设置
          </button>
          <button
            class="board-tab"
            :class="{ active: hostingTab === 'github' }"
            @click="hostingTab = 'github'"
          >
            GitHub 图床
          </button>
          <button
            class="board-tab"
            :class="{ active: hostingTab === 'leta' }"
            @click="hostingTab = 'leta'"
          >
            乐塔图床
          </button>
        </div>

        <!-- 上传设置 -->
        <MasonryFlow v-if="hostingTab === 'upload'">
          <!-- 上传方式（移动端固定走 GitHub 图床，无需展示） -->
          <SettingsCard
            v-if="!isMobile"
            :title="isTauri ? '粘贴上传方式' : '粘贴/拖拽上传方式'"
            description="把图片粘进编辑器时走哪条链路"
            :icon="Upload"
          >
            <div class="flex flex-wrap gap-2">
              <label class="settings-chip" :class="{ active: pasteDropMode === 'local' }">
                <input
                  type="radio"
                  class="sr-only"
                  value="local"
                  :checked="pasteDropMode === 'local'"
                  @change="savePasteDropMode('local')"
                />
                本地存储
              </label>
              <label
                v-if="isTauri"
                class="settings-chip"
                :class="{ active: pasteDropMode === 'disk' }"
              >
                <input
                  type="radio"
                  class="sr-only"
                  value="disk"
                  :checked="pasteDropMode === 'disk'"
                  @change="savePasteDropMode('disk')"
                />
                磁盘存储
              </label>
              <label class="settings-chip" :class="{ active: pasteDropMode === 'github' }">
                <input
                  type="radio"
                  class="sr-only"
                  value="github"
                  :checked="pasteDropMode === 'github'"
                  @change="savePasteDropMode('github')"
                />
                GitHub 图床
              </label>
              <label class="settings-chip" :class="{ active: pasteDropMode === 'leta' }">
                <input
                  type="radio"
                  class="sr-only"
                  value="leta"
                  :checked="pasteDropMode === 'leta'"
                  @change="savePasteDropMode('leta')"
                />
                乐塔图床
              </label>
            </div>
            <p class="settings-note mt-3">
              本地存储：图片以 base64 编码嵌入文档（压缩后单张 ≤ 5M），建议开启压缩以减少文档体积<br />
              磁盘存储：图片保存到文章存储目录下的
              <code class="text-[var(--accent)]">images/</code>
              子目录，文件名规则可在下方配置，文章中以相对路径引用（压缩后单张 ≤ 10MB）<br />
              GitHub 图床：上传至仓库后使用 CDN 链接（压缩后单张 ≤ 5MB）<br />
              乐塔图床：通过乐塔 API 上传，返回直链地址（压缩后单张 ≤ 10MB）
            </p>
          </SettingsCard>

          <!-- 默认图床（工具栏上传按钮使用） -->
          <SettingsCard
            title="默认图床"
            description="点击工具栏「图床」按钮上传时使用，独立于粘贴 / 拖拽方式"
            :icon="Cloud"
          >
            <div class="flex flex-wrap gap-2">
              <label class="settings-chip" :class="{ active: defaultHosting === 'github' }">
                <input
                  type="radio"
                  class="sr-only"
                  value="github"
                  :checked="defaultHosting === 'github'"
                  @change="saveDefaultHosting('github')"
                />
                GitHub 图床
              </label>
              <label class="settings-chip" :class="{ active: defaultHosting === 'leta' }">
                <input
                  type="radio"
                  class="sr-only"
                  value="leta"
                  :checked="defaultHosting === 'leta'"
                  @change="saveDefaultHosting('leta')"
                />
                乐塔图床
              </label>
            </div>
          </SettingsCard>

          <!-- 压缩质量 -->
          <SettingsCard title="压缩质量" description="值越高图片越清晰，体积越大" :icon="Gauge">
            <div class="settings-subcard">
              <div class="flex items-end justify-between">
                <span class="settings-subcard-label">质量</span>
                <span class="settings-subcard-value">{{ compressQuality }}%</span>
              </div>
              <SettingsSlider
                class="mt-2.5"
                :model-value="compressQuality"
                :min="10"
                :max="100"
                :step="5"
                @update:model-value="saveCompressQuality"
              />
              <div class="settings-subcard-range">
                <span>低（小体积）</span>
                <span>高（高画质）</span>
              </div>
            </div>
            <p class="settings-note mt-2">
              对应 JPEG
              压缩质量，值越高图片越清晰，体积越大。压缩比100%时，不会对图片做任何处理。压缩后图片将统一转为
              JPEG 格式。
            </p>
          </SettingsCard>

          <!-- 磁盘图片上传名称 -->
          <SettingsCard
            v-if="isTauri"
            title="磁盘图片上传名称"
            description="磁盘存储模式下，上传图片的命名规则"
            :icon="FolderOpen"
          >
            <select
              :value="diskImageNaming"
              class="settings-select w-full"
              :style="selectChevronStyle"
              @change="saveDiskImageNaming(($event.target as HTMLSelectElement).value)"
            >
              <option value="original">原图名称</option>
              <option value="datetime">按日期时间（年月日时分秒）</option>
            </select>
            <p class="settings-note mt-2">
              原图名称保留原始文件名（重名时追加序号）；按日期时间则使用年月日时分秒命名（如
              20260818231010）。
            </p>
          </SettingsCard>
        </MasonryFlow>

        <!-- GitHub 图床 -->
        <MasonryFlow v-if="hostingTab === 'github'">
          <SettingsCard
            title="GitHub 图床"
            description="图片通过 GitHub API 上传后，使用 jsDelivr CDN 返回链接"
            :icon="Github"
          >
            <template #action>
              <button
                class="settings-chip"
                :disabled="!githubRepo || !githubToken || githubTesting"
                @click="handleTestConnection"
              >
                {{ githubTesting ? '测试中…' : '测试连接' }}
              </button>
            </template>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <label class="settings-subcard-label">仓库</label>
                <input
                  :value="githubRepo"
                  placeholder="用户名/仓库名"
                  class="settings-input mt-2 w-full"
                  @input="saveGitHubRepo(($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="settings-subcard">
                <label class="settings-subcard-label">分支</label>
                <input
                  :value="githubBranch"
                  placeholder="main"
                  class="settings-input mt-2 w-full"
                  @input="saveGitHubBranch(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <div class="settings-subcard mt-3">
              <label class="settings-subcard-label">Personal Access Token</label>
              <input
                :value="githubToken"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                class="settings-input mt-2 w-full"
                @input="saveGitHubToken(($event.target as HTMLInputElement).value)"
              />
              <p class="settings-note mt-2">需要公共仓库 + Personal Access Token（repo 权限）。</p>
            </div>
            <p
              v-if="githubTestResult === 'ok'"
              class="settings-note mt-3"
              :style="{ color: colors.accent }"
            >
              连接成功
            </p>
            <p v-if="githubTestResult === 'fail'" class="settings-note mt-3" style="color: #e74c3c">
              连接失败
            </p>
          </SettingsCard>
        </MasonryFlow>

        <!-- 乐塔图床 -->
        <MasonryFlow v-if="hostingTab === 'leta'">
          <SettingsCard
            title="乐塔图床"
            description="通过乐塔图床 API 上传图片，返回直链地址"
            :icon="Cloud"
          >
            <template #action>
              <button
                class="settings-chip"
                :disabled="!letaToken || letaTesting"
                @click="handleTestLetuConnection"
              >
                {{ letaTesting ? '测试中…' : '测试连接' }}
              </button>
            </template>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <label class="settings-subcard-label">Token</label>
                <input
                  :value="letaToken"
                  type="password"
                  placeholder="Token"
                  class="settings-input mt-2 w-full"
                  @input="saveLetuToken(($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="settings-subcard">
                <label class="settings-subcard-label">存储 ID</label>
                <input
                  :value="letaStorageId"
                  placeholder="1"
                  class="settings-input mt-2 w-full"
                  @input="saveLetuStorageId(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <p class="settings-note mt-3">
              登录乐塔图床，按 F12 打开控制台，切换到 Network 标签，上传一张图片，点击 upload
              接口，点击 Payload，找到 storage_id 的值。
            </p>
            <p
              v-if="letaTestResult === 'ok'"
              class="settings-note mt-2"
              :style="{ color: colors.accent }"
            >
              连接成功
            </p>
            <p v-if="letaTestResult === 'fail'" class="settings-note mt-2" style="color: #e74c3c">
              连接失败
            </p>
          </SettingsCard>
        </MasonryFlow>
      </template>

      <!-- 公众号设置（仅桌面端） -->
      <template v-if="settingsTab === 'wechat'">
        <MasonryFlow>
          <SettingsCard
            title="微信公众号配置"
            description="用于将文章直接发布到微信公众号草稿箱，需要公众号的开发者 ID 和密钥"
            :icon="MessageCircle"
          >
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="settings-subcard">
                <label class="settings-subcard-label">AppID</label>
                <input
                  :value="wechatAppId"
                  placeholder="wx0000000000000000"
                  class="settings-input mt-2 w-full"
                  @input="saveWechatAppId(($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="settings-subcard">
                <label class="settings-subcard-label">AppSecret</label>
                <input
                  :value="wechatAppSecret"
                  type="password"
                  placeholder="请输入 AppSecret"
                  class="settings-input mt-2 w-full"
                  @input="saveWechatAppSecret(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <div class="settings-subcard mt-3">
              <label class="settings-subcard-label">默认作者名</label>
              <input
                :value="wechatDefaultAuthor"
                placeholder="用于草稿 author 字段的默认值"
                class="settings-input mt-2 w-full"
                @input="saveWechatDefaultAuthor(($event.target as HTMLInputElement).value)"
              />
            </div>
          </SettingsCard>
        </MasonryFlow>
      </template>

      <!-- 文章仓库 -->
      <template v-if="settingsTab === 'cloud'">
        <MasonryFlow>
          <!-- 存储位置（仅桌面端可切换） -->
          <SettingsCard
            v-if="isTauri"
            title="存储位置"
            description="文章与图片放在哪里"
            :icon="FolderOpen"
          >
            <div class="flex flex-wrap gap-2">
              <button
                class="settings-chip"
                :class="{ active: articleStorageMode === 'github' }"
                @click="saveArticleStorageMode('github')"
              >
                GitHub 仓库
              </button>
              <button
                class="settings-chip"
                :class="{ active: articleStorageMode === 'local' }"
                @click="saveArticleStorageMode('local')"
              >
                本地磁盘
              </button>
            </div>
            <p class="settings-note mt-3">
              <template v-if="articleStorageMode === 'local'">
                文章与图片存储在本地磁盘；卸载重装后，可在下方「选择已有目录」加载之前的文件。
              </template>
              <template v-else>
                切换到本地模式后，GitHub 仓库配置会保留但暂不使用；两种模式各自独立，不会互相影响。
              </template>
            </p>
          </SettingsCard>

          <!-- 本地存储目录管理（仅 local 模式） -->
          <SettingsCard
            v-if="isTauri && articleStorageMode === 'local'"
            title="本地工作区"
            :description="`支持多目录，当前 ${localWorkspaces.length} 个`"
            :icon="FolderOpen"
          >
            <template #action>
              <button class="settings-chip" @click="onAddLocalWorkspace">添加工作区</button>
            </template>

            <div class="space-y-3">
              <div
                v-for="(ws, idx) in localWorkspaces"
                :key="ws.id"
                class="settings-subcard"
                :class="{ 'is-active': isLocalActive(ws.id) }"
              >
                <div class="mb-2 flex items-center gap-2">
                  <span class="settings-subcard-label !text-[13px] !font-semibold">
                    {{ idx === 0 ? '默认工作区' : '工作区' + (idx + 1) }}
                  </span>
                  <span v-if="isLocalActive(ws.id)" class="settings-badge">当前</span>
                  <span class="ml-auto flex items-center gap-1">
                    <BaseTooltip v-if="!isLocalActive(ws.id)" text="设为当前" placement="top">
                      <button
                        class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--accent)] transition-colors hover:bg-[var(--dropdown-hover)]"
                        @click="onSwitchLocalWorkspace(ws.id)"
                      >
                        <Check :size="14" />
                      </button>
                    </BaseTooltip>
                    <BaseTooltip v-if="idx > 0" text="删除" placement="top">
                      <button
                        class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--dropdown-hover)] hover:text-[#e74c3c]"
                        @click="requestDeleteWorkspace('local', ws.id)"
                      >
                        <Trash2 :size="14" />
                      </button>
                    </BaseTooltip>
                  </span>
                </div>
                <div
                  class="mb-2 break-all rounded-md px-2.5 py-2 text-[12px]"
                  style="background: var(--bg-primary); color: var(--text-secondary)"
                >
                  {{ ws.dir || 'Documents/R-Markdown/articles/（默认）' }}
                </div>

                <!-- 仅默认工作区保留移动/选择/恢复功能 -->
                <template v-if="idx === 0">
                  <div class="flex flex-wrap gap-2">
                    <button
                      class="settings-chip"
                      :class="{ active: true }"
                      :disabled="dirChanging"
                      @click="onChangeStorageDir"
                    >
                      {{ dirChanging ? '处理中…' : '更改目录（移动文件）' }}
                    </button>
                    <button
                      class="settings-chip"
                      :disabled="dirChanging"
                      @click="onSelectStorageDir"
                    >
                      选择已有目录
                    </button>
                    <button
                      v-if="articleStorageDir"
                      class="settings-chip"
                      :disabled="dirChanging"
                      @click="onResetStorageDir"
                    >
                      恢复默认目录
                    </button>
                  </div>
                  <p class="settings-note mt-2">
                    更改目录会将现有文章与图片<strong>剪切移动</strong>到新位置。选择已有目录用于重装后加载旧数据。恢复默认目录不会移动文章。<br />修改目录后如果遇到当前编辑图片加载异常，建议先重启客户端。
                  </p>
                </template>
              </div>
            </div>

            <p class="settings-note mt-3">
              新增工作区只需选择目录（不存在时自动创建 tree.json / articles /
              images），移除仅从列表移出，不会删除任何文件。
            </p>
            <p v-if="dirError" class="settings-note mt-2" style="color: #e74c3c">{{ dirError }}</p>
          </SettingsCard>

          <!-- GitHub 仓库配置（仅 github 模式显示） -->
          <SettingsCard
            v-if="articleStorageMode === 'github'"
            title="GitHub 文章仓库"
            description="支持多个仓库 / 分支 / 账号，每个仓库单独配置 Token"
            :icon="Github"
          >
            <template #action>
              <button class="settings-chip" @click="addCloudWorkspace">添加工作区</button>
            </template>

            <div class="space-y-3">
              <div
                v-for="(ws, i) in githubWorkspaces"
                :key="ws.id"
                class="settings-subcard"
                :class="{ 'is-active': isCloudActive(ws.id) }"
              >
                <div class="mb-2 flex items-center gap-2">
                  <span class="settings-subcard-label !text-[13px] !font-semibold">{{
                    `工作区${i + 1}`
                  }}</span>
                  <span v-if="isCloudActive(ws.id)" class="settings-badge">当前</span>
                  <span class="ml-auto flex items-center gap-1">
                    <BaseTooltip v-if="!isCloudActive(ws.id)" text="设为当前" placement="top">
                      <button
                        class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--accent)] transition-colors hover:bg-[var(--dropdown-hover)]"
                        @click="onSwitchCloudWorkspace(ws.id)"
                      >
                        <Check :size="14" />
                      </button>
                    </BaseTooltip>
                    <BaseTooltip text="删除" placement="top">
                      <button
                        class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--dropdown-hover)] hover:text-[#e74c3c]"
                        @click="requestDeleteWorkspace('github', ws.id)"
                      >
                        <Trash2 :size="14" />
                      </button>
                    </BaseTooltip>
                  </span>
                </div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label class="settings-subcard-label">仓库名</label>
                    <input
                      :value="ws.repo"
                      placeholder="用户名/仓库名"
                      class="settings-input mt-1.5 w-full"
                      @input="onCloudRepoInput(ws.id, ($event.target as HTMLInputElement).value)"
                      @blur="onCloudRepoBlur(ws.id)"
                    />
                  </div>
                  <div>
                    <label class="settings-subcard-label">分支</label>
                    <input
                      :value="ws.branch"
                      placeholder="main"
                      class="settings-input mt-1.5 w-full"
                      @input="onCloudBranchInput(ws.id, ($event.target as HTMLInputElement).value)"
                      @blur="onCloudRepoBlur(ws.id)"
                    />
                  </div>
                </div>
                <div class="mt-2">
                  <label class="settings-subcard-label">Token</label>
                  <input
                    :value="getWorkspaceToken(ws.id)"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    class="settings-input mt-1.5 w-full"
                    @input="onCloudTokenInput(ws.id, ($event.target as HTMLInputElement).value)"
                    @blur="onCloudRepoBlur(ws.id)"
                  />
                </div>
                <div class="mt-2 flex items-center gap-3">
                  <button
                    class="settings-chip"
                    :disabled="cloudTestingWsId === ws.id"
                    @click="handleCloudTestConnection(ws.id)"
                  >
                    {{ cloudTestingWsId === ws.id ? '测试中…' : '测试连接' }}
                  </button>
                  <span
                    v-if="cloudTestResult[ws.id] === 'ok'"
                    class="text-[12px]"
                    style="color: var(--accent-green, #27ae60)"
                  >
                    连接成功
                  </span>
                  <span
                    v-if="cloudTestResult[ws.id] === 'fail'"
                    class="text-[12px]"
                    style="color: #e74c3c"
                  >
                    {{ cloudTestError[ws.id] || '连接失败' }}
                  </span>
                </div>
              </div>
            </div>

            <p class="settings-note mt-3">
              GitHub 私有仓库（文章仓库存储），需要
              <code class="text-[var(--accent)]">repo</code> scope 的 Personal Access Token。
            </p>
          </SettingsCard>

          <!-- 文章文件命名 -->
          <SettingsCard
            title="文章文件命名"
            description="新建文章时用什么名字存文件"
            :icon="FileText"
          >
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: articleTitleNaming }"
                role="switch"
                :aria-checked="articleTitleNaming"
                @click="articleTitleNaming = !articleTitleNaming"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <p class="settings-note">
              <template v-if="articleTitleNaming">
                开启后，新建文章的存储文件名为「文章名-短哈希」，例如
                <code class="text-[var(--accent)]">公众号排版技巧-k3f9a2b1.md</code
                >；短哈希用于避免同名文章的文件名冲突。重命名文章时，文件名会同步修改，已有文章也在此时自动迁移为新命名。
              </template>
              <template v-else>
                关闭时沿用内部编号命名（如
                <code class="text-[var(--accent)]">art-m3k2x9-a1b2c3.md</code
                >），与历史版本一致。开启后仅影响新建与重命名的文章，已有文章不会自动改名。
              </template>
            </p>
          </SettingsCard>
        </MasonryFlow>
      </template>

      <!-- 关于 -->
      <template v-if="settingsTab === 'other'">
        <MasonryFlow>
          <SettingsCard
            title="关于"
            :description="`版本 v${pkg.version} · 面向公众号排版的一站式 Markdown 扩展免费写作工具`"
            :icon="Info"
          >
            <div class="mx-auto flex max-w-[460px] flex-col items-center py-2 text-center">
              <svg viewBox="0 0 24 24" width="56" height="56" class="mb-3">
                <rect width="24" height="24" rx="6" :fill="colors.accent" />
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
              <BaseTooltip placement="bottom" :delay="300" :content-width="300">
                <span class="relative inline-block">
                  <h3 class="m-0 text-[15px] font-bold text-[#1a1a1a] dark:text-[#e5e5e5]">
                    R-Markdown
                  </h3>
                  <span class="sponsor-bubble">
                    <span
                      class="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm"
                      style="background: #ff8c42"
                    >
                      请我喝杯咖啡
                    </span>
                    <span class="sponsor-bubble-tail" />
                  </span>
                </span>
                <template #content>
                  <div class="flex flex-col items-center gap-2 pt-2 pb-1">
                    <img
                      src="/wechat-qr.jpg"
                      alt="微信公众号二维码"
                      class="qr-light w-[260px] rounded-lg border border-[#e5e5e5] dark:border-[#444]"
                    />
                    <img
                      src="/wechat-qr-dark.jpg"
                      alt="微信公众号二维码"
                      class="qr-dark w-[260px] rounded-lg border border-[#e5e5e5] dark:border-[#444]"
                    />
                    <span class="text-center leading-relaxed">
                      微信搜索「<span class="text-[var(--accent)] font-medium">五味杂陈杂货铺</span
                      >」关注，文章末尾可赞赏
                    </span>
                  </div>
                </template>
              </BaseTooltip>
              <button
                class="settings-chip mt-3 inline-flex items-center gap-1.5 whitespace-nowrap"
                @click="openGitHubRepo"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="currentColor"
                  aria-hidden="true"
                  class="shrink-0"
                >
                  <path
                    d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
                  />
                </svg>
                <span>GitHub 仓库</span>
              </button>
              <p class="m-0 mt-3 text-[11px] text-[#bbb] dark:text-[#555]">
                Copyright © 2026 R-Markdown
              </p>
            </div>
          </SettingsCard>

          <SettingsCard
            v-if="isTauri"
            title="版本更新"
            description="启动时自动检查更新，也可以手动检查一次"
            :icon="RotateCcw"
          >
            <template #action>
              <button
                class="settings-toggle"
                :class="{ on: autoUpdateEnabled }"
                role="switch"
                :aria-checked="autoUpdateEnabled"
                @click="autoUpdateEnabled = !autoUpdateEnabled"
              >
                <span class="settings-toggle-knob" />
              </button>
            </template>
            <div class="flex flex-wrap items-center gap-3">
              <button class="settings-chip" :disabled="updateChecking" @click="manualCheckUpdate">
                {{ updateChecking ? '检查中…' : '检查更新' }}
              </button>
              <span
                v-if="updateMessage"
                class="text-[12px]"
                :class="updateError ? 'text-[#e74c3c]' : 'text-[var(--accent)]'"
              >
                {{ updateMessage }}
              </span>
            </div>
            <p class="settings-note mt-2.5">开启后启动客户端时自动检查；有新版本会提示下载。</p>
          </SettingsCard>
        </MasonryFlow>
      </template>

      <!-- 删除工作区确认弹窗 -->
      <ConfirmDialog
        v-model:visible="deleteConfirmVisible"
        title="删除工作区"
        :message="deleteWorkspaceMessage"
        confirm-text="删除"
        confirm-type="danger"
        :loading="deletingWorkspace"
        loading-text="正在删除..."
        @confirm="confirmDeleteWorkspace"
        @cancel="pendingDeleteWorkspace = null"
      />

      <!-- 删光云端仓库后，询问是否切换到本地磁盘模式 -->
      <ConfirmDialog
        v-model:visible="switchToLocalPromptVisible"
        title="切换到本地磁盘"
        message="已删除所有云端仓库，当前将停留在空的 GitHub 模式。是否切换到本地磁盘模式以继续使用文章树？"
        confirm-text="切换到本地磁盘"
        cancel-text="保持 GitHub 模式"
        @confirm="confirmSwitchToLocal"
      />
    </div>
  </div>
</template>

<style scoped>
/* 收款码明暗切换（与首页公众号二维码一致） */
.qr-dark {
  display: none;
}
[data-theme='dark'] .qr-light {
  display: none;
}
[data-theme='dark'] .qr-dark {
  display: block;
}

/* 标题右上方气泡：上下轻轻摇动，气泡悬于标题右上角 */
.sponsor-bubble {
  position: absolute;
  top: -22px;
  right: -72px;
  animation: sponsor-bob 1.6s ease-in-out infinite;
}
@keyframes sponsor-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
.sponsor-bubble-tail {
  position: absolute;
  top: calc(100% - 4px);
  left: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 5px 4px 0 4px;
  border-color: #ff8c42 transparent transparent transparent;
  transform: rotate(30deg);
}

/* ── 设置卡片内部控件（卡片外壳在 SettingsCard.vue）── */
.settings-subcard {
  border-radius: 12px;
  background: var(--settings-subcard-bg);
  padding: 12px 14px;
}

/* 工作区卡片：当前选中的那张加一圈 accent 边，替代原来整卡改边框色的写法 */
.settings-subcard.is-active {
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* 「当前」小徽标 */
.settings-badge {
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
}

.settings-subcard-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings-subcard-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.settings-subcard-range {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.settings-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.settings-input,
.settings-select {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 7px 11px;
  font-size: 12.5px;
  color: var(--text-primary);
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.settings-select {
  box-sizing: border-box;
  cursor: pointer;
  appearance: none;
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.settings-input::placeholder {
  color: var(--text-muted);
}

.settings-input:focus,
.settings-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent);
}

/* 预设值胶囊（缩放比例 / 保存间隔） */
.settings-chip {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-primary);
  padding: 4px 11px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.settings-chip:hover:not(:disabled) {
  border-color: var(--settings-hover-border);
  color: var(--text-primary);
}

.settings-chip.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.settings-chip:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

/* 开关：40×22，比原来略大一点，贴合设计稿 */
.settings-toggle {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--settings-track);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.settings-toggle.on {
  background: var(--accent);
}

.settings-toggle-knob {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transform: translateX(3px);
  transition: transform 0.2s ease;
}

.settings-toggle.on .settings-toggle-knob {
  transform: translateX(21px);
}

/* 快捷键按钮（命令面板卡右上角） */
.settings-shortcut {
  min-width: 64px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-primary);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.settings-shortcut:hover {
  border-color: var(--settings-hover-border);
}

.settings-shortcut.recording {
  border-color: var(--accent);
  color: var(--accent);
}

/* 卡片右上角的「恢复默认」（普通段落 / 编辑区字号各自一个） */
.settings-reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-primary);
  padding: 3px 9px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}

.settings-reset-btn:hover {
  border-color: var(--settings-hover-border);
  color: var(--accent);
}
</style>
