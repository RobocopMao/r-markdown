<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Loader2,
  Sparkles,
  FileText,
  ClipboardPaste,
  FileUp,
  Settings2,
  Plus,
  ChevronDown,
} from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import BaseCheckbox from '@/components/BaseCheckbox.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useTheme } from '@/composables/useTheme'
import { useIsMobileWeb } from '@/composables/useIsMobile'
import { getSetting, setSetting } from '@/config/settings'
import { getErrorMessage } from '@/utils/helpers'
import { undoShortcutLabel } from '@/utils/platform'
import { countChars } from '@/utils/charCount'
import { components } from '@/extension'
import {
  buildSystemPrompt,
  buildUserMessage,
  cleanModelOutput,
  composeExtraInstruction,
  estimateTokens,
  loadFormatSpec,
  maskImageTokens,
  newPresetId,
  normalizePresets,
  unmaskImageTokens,
  validateFormat,
  AI_STYLE_PRESETS,
  LONG_ARTICLE_CHARS,
  type AiStylePreset,
  type ExtraPreset,
} from '@/utils/aiFormatPrompt'
import { formatArticle, resolveAiConfig } from '@/services/aiFormat'
import { diffLines, toHunks, type DiffHunk } from '@/utils/textDiff'
import { pickDocumentFile } from '../composables/useImport'
import { useSessionCountdown } from '@/composables/useSessionCountdown'
import { expiresAtFrom, isExpiredAt } from '@/utils/aiSession'
import { clearRecord, loadRecord, saveRecord } from '@/services/aiSessionStore'

const props = defineProps<{
  visible: boolean
  /** 编辑器当前内容 */
  markdown: string
}>()

const emit = defineEmits<{
  close: []
  /** 用户确认应用排版结果 */
  apply: [text: string]
  openSettings: []
}>()

const { colors } = useTheme()
/** 移动端 Web：双栏 diff 放不下，改单栏「逐行上下对照」 */
const isMobileWeb = useIsMobileWeb()

/**
 * 撤销提示里「可用 ⌘Z 撤销」这半句。
 * 移动端没有物理键盘（也没有撤销按钮），提示快捷键是无效信息，故返回空串由模板省略。
 */
const undoHint = computed(() => (isMobileWeb.value ? '' : `，可用 ${undoShortcutLabel()} 撤销`))

/** 二次确认弹窗的完整文案（移动端同样不提撤销快捷键） */
const confirmApplyMessage = computed(
  () =>
    `生成结果后，编辑器内容发生了变化。应用排版结果会覆盖当前内容${undoHint.value}。确定继续吗？`,
)

// ── 排版规范（模块级缓存，避免每次打开都重新解析）──
let specPromise: Promise<string> | null = null
function getSpec(): Promise<string> {
  if (!specPromise) specPromise = loadFormatSpec()
  return specPromise
}

type SourceTab = 'current' | 'paste'

const sourceTab = ref<SourceTab>('current')
const pasteText = ref('')
/** 文件导入的来源文件名，仅用于展示 */
const fileLabel = ref('')

const preset = ref<AiStylePreset>(getSetting<AiStylePreset>('aiStylePreset') || 'standard')
const extraInstruction = ref(getSetting<string>('aiExtraInstruction') || '')

/** 常用补充要求：勾选后每次自动拼进请求，且勾选状态持久化 */
const extraPresets = ref<ExtraPreset[]>(normalizePresets(getSetting<unknown>('aiExtraPresets')))
/** 展开/收起常用要求清单（条目多时占地方） */
const presetsExpanded = ref(true)

/** 正在双击编辑的条目 id（null 表示无）；编辑态下渲染输入框而非文本 */
const editingPresetId = ref<string | null>(null)
/** 编辑中的临时文本，确认后才写回条目 */
const editingPresetText = ref('')
/** 编辑输入框引用，进入编辑后自动聚焦 */
const presetEditInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

const enabledPresetCount = computed(() => extraPresets.value.filter((p) => p.enabled).length)
const allPresetsEnabled = computed(
  () => extraPresets.value.length > 0 && enabledPresetCount.value === extraPresets.value.length,
)
/** 最终随请求发出的补充要求（手填 + 勾选项） */
const effectiveExtra = computed(() =>
  composeExtraInstruction(extraInstruction.value, extraPresets.value),
)

function persistPresets() {
  setSetting('aiExtraPresets', extraPresets.value, true)
}

/**
 * 把当前输入的补充要求存为常用条目。
 *
 * 存入后清空输入框：该条已通过「勾选状态」进入本次请求，
 * 若同时留在手填框里会被重复拼接（手填 + 勾选各一次）。
 */
function addExtraPreset() {
  const text = extraInstruction.value.trim()
  if (!text) return
  // 已存在同名条目不重复添加，直接置为勾选
  const existing = extraPresets.value.find((p) => p.text === text)
  if (existing) {
    existing.enabled = true
  } else {
    extraPresets.value.push({ id: newPresetId(), text, enabled: true })
  }
  extraInstruction.value = ''
  presetsExpanded.value = true
  persistPresets()
}

function removeExtraPreset(id: string) {
  extraPresets.value = extraPresets.value.filter((p) => p.id !== id)
  persistPresets()
}

/** 全选 / 全不选：已全选则全部取消，否则全部勾选 */
function toggleAllPresets() {
  const next = !allPresetsEnabled.value
  for (const p of extraPresets.value) p.enabled = next
  persistPresets()
}

function togglePreset(id: string) {
  const item = extraPresets.value.find((p) => p.id === id)
  if (!item) return
  item.enabled = !item.enabled
  persistPresets()
}

/** 双击条目文字：进入编辑态并把该条文本装入临时变量 */
async function startPresetEdit(p: ExtraPreset) {
  if (generating.value) return
  editingPresetId.value = p.id
  editingPresetText.value = p.text
  await nextTick()
  const el = Array.isArray(presetEditInput.value) ? presetEditInput.value[0] : presetEditInput.value
  el?.focus()
  el?.select()
}

/**
 * 提交编辑。
 * 空文本视为放弃修改（不删条目，避免误清空）；与其它条目重名则放弃修改，
 * 防止出现两条一模一样的常用要求。
 */
function commitPresetEdit() {
  const id = editingPresetId.value
  if (!id) return
  const item = extraPresets.value.find((p) => p.id === id)
  const next = editingPresetText.value.trim()
  if (item) {
    const duplicated = extraPresets.value.some((p) => p.id !== id && p.text === next)
    if (next && !duplicated) {
      item.text = next
      persistPresets()
    }
  }
  cancelPresetEdit()
}

function cancelPresetEdit() {
  editingPresetId.value = null
  editingPresetText.value = ''
}

/** 生成中：流式累计的原始文本 */
const streamingText = ref('')
const generating = ref(false)
/** 生成耗时（秒），完成后展示 */
const elapsedSec = ref(0)

/** 流式输出的滚动容器（那个 <pre>） */
const streamRef = ref<HTMLElement>()
/** 结果区（diff 视图）的滚动容器，生成结束后复位用 */
const resultScrollRef = ref<HTMLElement>()

/**
 * 生成中跟随到底部。
 *
 * 不能只在 streamingText 变化后滚一次就完事：流式增量与 DOM 更新、布局重算是错拍的，
 * 拿到 nextTick 时 scrollHeight 可能还是旧值，滚过去会差几行。所以先 await nextTick
 * 让新内容落地，再按 scrollHeight 直接赋 scrollTop。
 * 这里刻意不用 scrollTo({behavior:'smooth'})：增量每 100ms 一次，平滑动画会互相打断，反而抖。
 */
async function stickStreamToBottom() {
  await nextTick()
  const el = streamRef.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 生成结束：把结果区复位到顶部——结果是要从头读的，停在末尾会先看到文章结尾 */
async function resetStreamScroll() {
  await nextTick()
  const el = resultScrollRef.value
  if (el) el.scrollTop = 0
}

/** 生成完成后的结果文本（可编辑） */
const resultText = ref('')
/** 本次生成实际送往模型的原文（diff 的基线，不随来源切换变化） */
const baseText = ref('')
/** 结果视图：diff 对比 | 编辑结果 */
const resultView = ref<'diff' | 'text'>('diff')
/** 警告信息（不阻断应用） */
const warnings = ref<string[]>([])
/** 严重错误 */
const errorMsg = ref('')

/** 结果保留倒计时（用排版面板自己的保留时长设置项） */
const { now, remainingText, currentHours, startTicker, stopTicker, syncText } =
  useSessionCountdown('aiFormatSessionHours')

/** 本次结果的过期时刻（null = 还没有结果）；倒计时与过期判定都读它 */
const resultExpiresAt = ref<number | null>(null)

/** 结果是否已过期（过期后本地记录已失效，重开面板会从空白开始） */
const resultExpired = computed(
  () => resultExpiresAt.value != null && isExpiredAt(resultExpiresAt.value, now.value),
)

/**
 * 配置状态必须走响应式 ref：
 * isAiConfigured() 只读 localStorage（非响应式），若直接放进 computed，
 * 该 computed 没有任何响应式依赖，Vue 会永久缓存结果 ——
 * 表现为「去设置填完 key 回来，面板仍显示待配置，必须刷新浏览器」。
 */
const aiBaseUrl = ref(getSetting<string>('aiBaseUrl') || '')
const aiApiKey = ref(getSetting<string>('aiApiKey') || '')
const aiModel = ref(getSetting<string>('aiModel') || '')

function refreshAiConfig() {
  aiBaseUrl.value = getSetting<string>('aiBaseUrl') || ''
  aiApiKey.value = getSetting<string>('aiApiKey') || ''
  aiModel.value = getSetting<string>('aiModel') || ''
}

function onAiSettingChanged(e: Event) {
  const key = (e as CustomEvent).detail?.key
  if (key === 'aiBaseUrl' || key === 'aiApiKey' || key === 'aiModel') refreshAiConfig()
}

onMounted(() => window.addEventListener('setting-changed', onAiSettingChanged))
onBeforeUnmount(() => window.removeEventListener('setting-changed', onAiSettingChanged))

const configured = computed(() => Boolean(aiBaseUrl.value && aiApiKey.value && aiModel.value))

const sourceText = computed(() => {
  if (sourceTab.value === 'current') return props.markdown
  return pasteText.value
})

const sourceStats = computed(() => countChars(sourceText.value))
const sourceTooLong = computed(() => sourceText.value.length > LONG_ARTICLE_CHARS)

// ── 请求中止 ──
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

function resetAll() {
  abort()
  streamingText.value = ''
  resultText.value = ''
  baseText.value = ''
  warnings.value = []
  errorMsg.value = ''
  elapsedSec.value = 0
  resultView.value = 'diff'
  fileLabel.value = ''
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      // 关闭时只中止进行中的请求；结果留在内存与本地，下次打开可继续用
      abort()
      stopTicker()
      return
    }
    preset.value = getSetting<AiStylePreset>('aiStylePreset') || 'standard'
    extraInstruction.value = getSetting<string>('aiExtraInstruction') || ''
    // 重新读取常用要求清单：可能被设置页或其他标签页改动
    extraPresets.value = normalizePresets(getSetting<unknown>('aiExtraPresets'))
    // 从设置面板返回后重新读取配置，避免仍显示上一次的「待配置」状态
    refreshAiConfig()
    errorMsg.value = ''
    // 预热规范：getSpec() 是模块级缓存，这里先发起加载，真正点「开始排版」时就不必再等
    await getSpec()

    // 没有内存态结果时，尝试恢复上次未过期的结果（关了面板再打开不该丢）
    if (!resultText.value) {
      const restored = await restoreResult()
      if (restored) await nextTick(() => recomputeDiff())
    }
    if (resultExpiresAt.value) {
      syncText(resultExpiresAt.value)
      startTicker(() => resultExpiresAt.value)
    }
  },
)

watch(preset, (v) => {
  setSetting('aiStylePreset', v, true)
})

function onSourceTab(tab: SourceTab) {
  if (sourceTab.value === tab) return
  sourceTab.value = tab
}

// ── 文件导入（复用侧栏「导入」的读取实现，不改动编辑器内容）──
async function onPickFile() {
  try {
    const picked = await pickDocumentFile()
    if (!picked) return
    pasteText.value = picked.text
    fileLabel.value = picked.name
    sourceTab.value = 'paste'
  } catch (e: unknown) {
    errorMsg.value = getErrorMessage(e, '读取文件失败')
  }
}

// ── 执行排版 ──
async function onGenerate() {
  errorMsg.value = ''
  warnings.value = []
  resultText.value = ''
  streamingText.value = ''
  elapsedSec.value = 0
  resultView.value = 'diff'

  // 发起请求即续期：保留时长按「最后一次请求」算，倒计时回满
  const lastActiveAt = Date.now()
  resultExpiresAt.value = expiresAtFrom(lastActiveAt, currentHours())
  syncText(resultExpiresAt.value)
  startTicker(() => resultExpiresAt.value)

  const cfg = resolveAiConfig()
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    errorMsg.value =
      '尚未配置 AI 文本：请先在「设置 → AI 设置 → AI 文本」填写接口地址、API Key 与模型名'
    return
  }

  const article = sourceText.value.trim()
  if (!article) {
    errorMsg.value = '请先提供要排版的文章内容'
    return
  }

  baseText.value = article
  // 本地图片（内置 base64 / IndexedDB / 磁盘相对路径）替换为占位符，
  // 避免把超长 base64 发给模型，也防止模型改写图片链接
  const masked = maskImageTokens(article)
  lastTokens = masked.tokens
  const articleForModel = masked.text
  generating.value = true
  const startedAt = Date.now()
  timer = setInterval(() => {
    elapsedSec.value = Math.round((Date.now() - startedAt) / 1000)
  }, 500)

  controller = new AbortController()
  try {
    const spec = await getSpec()
    const system = buildSystemPrompt(spec, preset.value)
    const user = buildUserMessage(articleForModel, effectiveExtra.value)

    const { text, finishReason } = await formatArticle(
      cfg,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        signal: controller.signal,
        onDelta: (d) => {
          streamingText.value += d
        },
      },
    )

    finalize(text, finishReason)
  } catch (e: unknown) {
    if (isAbort(e)) {
      // 用户主动停止或关闭：不当作错误
      return
    }
    errorMsg.value = getErrorMessage(e, '排版失败')
  } finally {
    generating.value = false
    controller = null
    stopTimer()
  }
}

/** 生成结束后的清洗、占位符还原与校验 */
function finalize(raw: string, finishReason: string) {
  const cleaned = cleanModelOutput(raw)
  const { text, missing, dropped } = unmaskImageTokens(cleaned, lastTokens)
  resultText.value = text

  const w: string[] = []
  const { warnings: formatWarnings } = validateFormat(text)
  w.push(...formatWarnings)
  if (missing.length > 0) {
    w.push(
      `有 ${missing.length} 张本地图片未能保留（模型改写了占位符 ${missing
        .map((n) => `{{RMIMG_${n}}}`)
        .join('、')}），应用后将缺失这些图片`,
    )
  }
  if (dropped > 0) {
    w.push(`已清除 ${dropped} 处模型生成的无效图片占位符（原文中并无对应图片）`)
  }
  if (finishReason === 'length') {
    w.push('输出达到最大长度上限，结果可能不完整；可在设置中调大「最大输出」后重试')
  }
  streamingText.value = ''
  warnings.value = w
  void persistResult()
}

// ── 结果保留（本地 IndexedDB + 滑动续期）──
/**
 * 排版结果是整篇长文，关掉面板就丢会很浪费（可能要重跑一次几十秒的请求）。
 * 所以把它连同「保留到什么时候」一起存本地，下次打开面板若还没过期就恢复。
 *
 * 存储形状：{ resultText, baseText, fileLabel, warnings }。
 * 不算「本次生成实际送出的原文」（baseText）就恢复不了 diff 视图。
 */
const RESULT_KEY = 'format'

async function persistResult() {
  if (!resultText.value) return
  const lastActiveAt = Date.now()
  try {
    await saveRecord(
      RESULT_KEY,
      {
        resultText: resultText.value,
        baseText: baseText.value,
        fileLabel: fileLabel.value,
        warnings: warnings.value,
        elapsedSec: elapsedSec.value,
      },
      lastActiveAt,
      currentHours(),
    )
    resultExpiresAt.value = expiresAtFrom(lastActiveAt, currentHours())
    syncText(resultExpiresAt.value)
  } catch {
    // 落盘失败只影响「下次打开能否恢复」，不打断本次生成
  }
}

/** 恢复上次未过期的结果；返回是否恢复成功 */
async function restoreResult(): Promise<boolean> {
  const rec = await loadRecord<{
    resultText?: string
    baseText?: string
    fileLabel?: string
    warnings?: string[]
    elapsedSec?: number
  }>(RESULT_KEY, Date.now())

  if (!rec?.payload?.resultText) return false
  resultText.value = rec.payload.resultText
  baseText.value = rec.payload.baseText || ''
  fileLabel.value = rec.payload.fileLabel || ''
  warnings.value = Array.isArray(rec.payload.warnings) ? rec.payload.warnings : []
  elapsedSec.value = Number(rec.payload.elapsedSec) || 0
  resultView.value = 'diff'
  resultExpiresAt.value = Number(rec.expiresAt)
  return true
}

/** 清空结果：内存 + 本地记录一起清掉 */
async function onClearResult() {
  if (!resultText.value && !streamingText.value) return
  clearConfirmVisible.value = true
}

async function doClearResult() {
  clearConfirmVisible.value = false
  abort()
  resetAll()
  resultExpiresAt.value = null
  remainingText.value = ''
  await clearRecord(RESULT_KEY)
}

const clearConfirmVisible = ref(false)

/** 本次生成使用的图片占位符表（原文中被替换掉的部分） */
let lastTokens: string[] = []

function isAbort(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'AbortError'
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('abort') || msg.includes('中止')
}

// ── diff 计算（结果文本变化时重算，带节流）──
const hunks = ref<DiffHunk[]>([])
const diffTruncated = ref(false)
const stats = ref({ added: 0, removed: 0, unchanged: 0 })
let diffTimer: ReturnType<typeof setTimeout> | null = null

function recomputeDiff() {
  if (!resultText.value) {
    hunks.value = []
    stats.value = { added: 0, removed: 0, unchanged: 0 }
    diffTruncated.value = false
    return
  }
  const r = diffLines(baseText.value, resultText.value)
  hunks.value = toHunks(r.lines, 2)
  stats.value = r.stats
  diffTruncated.value = r.truncated
}

watch(resultText, () => {
  if (diffTimer) clearTimeout(diffTimer)
  diffTimer = setTimeout(recomputeDiff, 300)
})

/**
 * 流式输出：每来一段增量就贴到底部。
 *
 * 跟的是 streamingText 而不是 generating——增量才是「内容变长了」的信号；
 * generating 只在开始/结束各变一次。
 */
watch(streamingText, () => {
  if (generating.value) void stickStreamToBottom()
})

/**
 * 生成结束：把结果区滚回顶部。
 *
 * 时机是 generating 由 true 转 false（而非 resultText 出现）——结果区要等下一次
 * DOM 更新才挂出来，再一个是「重新生成」也会重复走这一遭。放在这个边沿上，
 * 流式结束与结果呈现之间不会残留末尾的滚动位置。
 *
 * 编辑视图的 textarea 有原生滚动，且 textarea 换内容后 scrollTop 本来就会归零，
 * 不需要单独处理；这里只复位 diff 容器。
 */
watch(generating, (now, before) => {
  if (before && !now) void resetStreamScroll()
})

async function switchToDiff() {
  resultView.value = 'diff'
  await nextTick()
  recomputeDiff()
}

// ── 结果统计 ──
const resultStats = computed(() => countChars(resultText.value))

/** 结果中使用到的组件标签数 */
const componentCount = computed(() => {
  const tags = new Set(components.map((c) => c.tag))
  let n = 0
  for (const tag of tags) {
    n += (resultText.value.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length
  }
  return n
})

const hasResult = computed(() => resultText.value.trim().length > 0)
/** 生成期间编辑器内容是否已被改动（应用前需二次确认） */
const baseChanged = computed(() => {
  if (!baseText.value || sourceTab.value !== 'current') return false
  return props.markdown.trim() !== baseText.value.trim()
})

// ── 应用 ──
const confirmApplyVisible = ref(false)

function onApply() {
  if (!hasResult.value) return
  if (baseChanged.value) {
    confirmApplyVisible.value = true
    return
  }
  doApply()
}

function doApply() {
  confirmApplyVisible.value = false
  // 兜底：任何情况下都不允许占位符字面量进入编辑器
  emit('apply', resultText.value.replace(/\{\{RMIMG_\d+\}\}/g, ''))
  emit('close')
}

function onRegenerate() {
  resetAll()
  void onGenerate()
}

function onStop() {
  abort()
}

onBeforeUnmount(() => {
  abort()
  if (diffTimer) clearTimeout(diffTimer)
})
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="AI 排版"
    width="min(95vw, 1000px)"
    :show-footer="true"
    no-body-padding
    @close="emit('close')"
  >
    <!-- 头部：结果保留倒计时 + 清空结果 -->
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span
          v-if="resultText"
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
          v-if="resultText"
          class="ml-auto shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[#c0392b] hover:text-[#c0392b] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
          @click="onClearResult"
        >
          清空结果
        </button>
      </div>
    </template>
    <!--
      h-full + min-h-0：抽屉 body 有确定高度，这里撑满它，
      再让「结果容器」以 flex-1 吃掉剩余空间（内部各自滚动），
      避免用固定 46vh 导致下方留一截空白。
      p-3 / gap-2 与「我的素材」面板的紧凑留白保持一致（那边是 px-3 + pt-2 pb-2）。
    -->
    <div class="flex h-full min-h-0 flex-col gap-2 p-3">
      <!-- 未配置引导：抽屉内垂直居中，避免高高一条卡片下方留白 -->
      <div
        v-if="!configured"
        class="m-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-xl border border-[#f0f0f0] bg-white px-6 py-10 text-center dark:border-[#333] dark:bg-[#1e1e1e]"
      >
        <Settings2 :size="28" class="text-[var(--accent)]" />
        <p class="text-[13px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">还没有配置 AI 接口</p>
        <p class="max-w-[420px] text-[12px] leading-relaxed text-[#999] dark:text-[#666]">
          填入任意 OpenAI 兼容接口的地址、API Key 与模型名即可使用。Key
          加密后仅保存在本地设备，不会上传。
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
        <!-- 来源选择 -->
        <div
          class="shrink-0 rounded-xl border border-[#f0f0f0] bg-white p-2.5 dark:border-[#333] dark:bg-[#1e1e1e]"
        >
          <!--
            移动端：按钮行与字数统计拆成两行，避免按钮被压缩后文字折行。
            shrink-0 + whitespace-nowrap 保证按钮本身永不换行。
          -->
          <div class="mb-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            <button
              class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-[5px] text-xs transition-colors"
              :class="
                sourceTab === 'current'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                  : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
              "
              @click="onSourceTab('current')"
            >
              <FileText :size="13" />
              当前文档
            </button>
            <button
              class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-[5px] text-xs transition-colors"
              :class="
                sourceTab === 'paste'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                  : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
              "
              @click="onSourceTab('paste')"
            >
              <ClipboardPaste :size="13" />
              粘贴文本
            </button>
            <button
              class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e5e5e5] bg-white px-3 py-[5px] text-xs text-[#999] transition-colors hover:border-[#ccc] hover:text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]"
              @click="onPickFile"
            >
              <FileUp :size="13" />
              选择文件
            </button>
            <!-- 桌面端：字数统计跟在按钮同一行右侧 -->
            <span
              v-if="!isMobileWeb"
              class="ml-auto whitespace-nowrap text-[11px] text-[#999] dark:text-[#666]"
            >
              {{ sourceStats.chars }} 字 · 约 {{ sourceStats.minutes }} 分钟
            </span>
          </div>
          <!-- 移动端：字数统计单独一行 -->
          <p v-if="isMobileWeb" class="mb-2 text-[11px] text-[#999] dark:text-[#666]">
            {{ sourceStats.chars }} 字 · 约 {{ sourceStats.minutes }} 分钟
          </p>

          <div v-if="sourceTab === 'current'">
            <p class="text-[11px] text-[#999] dark:text-[#666]">
              将以编辑器当前内容为排版对象。排版结果确认后才会替换编辑器内容{{ undoHint }}。
            </p>
          </div>
          <textarea
            v-else
            v-model="pasteText"
            rows="6"
            placeholder="在此粘贴要排版的文章正文……"
            class="w-full resize-y rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
          ></textarea>
          <p
            v-if="sourceTab === 'paste' && fileLabel"
            class="mt-1 text-[11px] text-[#999] dark:text-[#666]"
          >
            已从文件导入：{{ fileLabel }}（不会修改编辑器内容）
          </p>
          <p v-if="sourceTooLong" class="mt-1.5 text-[11px] text-[#b7791f]">
            文章较长（{{ sourceText.length }} 字），可能出现输出截断或结构不够完整，建议分批排版。
          </p>
        </div>

        <!-- 参数 -->
        <div
          class="shrink-0 rounded-xl border border-[#f0f0f0] bg-white p-2.5 dark:border-[#333] dark:bg-[#1e1e1e]"
        >
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] text-[#666] dark:text-[#999]">力度</span>
              <div class="flex gap-1">
                <button
                  v-for="p in AI_STYLE_PRESETS"
                  :key="p.value"
                  class="cursor-pointer rounded-md border px-2.5 py-1 text-[11px] transition-colors"
                  :class="
                    preset === p.value
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                      : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
                  "
                  :title="p.hint"
                  :disabled="generating"
                  @click="preset = p.value"
                >
                  {{ p.label }}
                </button>
              </div>
            </div>
            <div
              class="flex flex-1 items-center gap-1.5"
              :class="isMobileWeb ? 'w-full min-w-0 basis-full' : 'min-w-[280px]'"
            >
              <input
                v-model="extraInstruction"
                placeholder="补充要求（本次有效），如：多强调操作步骤"
                class="w-full min-w-0 flex-1 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] disabled:opacity-60 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
                :disabled="generating"
              />
              <BaseTooltip text="把上面这条存为常用要求" placement="top">
                <button
                  class="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[var(--accent)]"
                  :disabled="!extraInstruction.trim()"
                  @click="addExtraPreset"
                >
                  <Plus :size="13" />
                  添加
                </button>
              </BaseTooltip>
            </div>
          </div>

          <!-- 常用补充要求：勾选后每次自动拼接，勾选状态已记住 -->
          <div
            v-if="extraPresets.length > 0"
            class="mt-2.5 border-t border-[#f0f0f0] pt-2.5 dark:border-[#333]"
          >
            <div class="mb-1.5 flex items-center gap-2">
              <button
                class="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium text-[#666] transition-colors hover:text-[var(--accent)] dark:text-[#999]"
                @click="presetsExpanded = !presetsExpanded"
              >
                <ChevronDown
                  :size="13"
                  class="transition-transform"
                  :class="{ '-rotate-90': !presetsExpanded }"
                />
                常用要求
                <span v-if="enabledPresetCount > 0" class="text-[var(--accent)]"
                  >（已勾选 {{ enabledPresetCount }}）</span
                >
              </button>
              <div class="ml-auto flex items-center gap-2">
                <button
                  class="cursor-pointer rounded-md border border-[#e5e5e5] bg-white px-2 py-0.5 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[var(--accent)]"
                  :disabled="generating"
                  @click="toggleAllPresets"
                >
                  {{ allPresetsEnabled ? '全不选' : '全选' }}
                </button>
              </div>
            </div>

            <div v-show="presetsExpanded" class="flex flex-wrap gap-1.5">
              <!--
                单条最宽 50%：扣掉 gap-1.5（6px）的一半，保证一行恰好放下两条且不溢出。
                文案过长时由内部 truncate 省略，全量内容见 title 提示。
              -->
              <span
                v-for="p in extraPresets"
                :key="p.id"
                class="group inline-flex max-w-[calc(50%-3px)] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                :class="
                  p.enabled
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[#e5e5e5] bg-white text-[#999] dark:border-[#444] dark:bg-[#2a2a2a]'
                "
              >
                <!--
                  勾选只由左侧 checkbox 触发（点文字不再切换），
                  双击文字进入编辑状态修改该条要求。
                -->
                <span class="inline-flex min-w-0 items-center gap-1.5">
                  <BaseCheckbox
                    size="sm"
                    :checked="p.enabled"
                    :disabled="generating"
                    @change="togglePreset(p.id)"
                  />
                  <input
                    v-if="editingPresetId === p.id"
                    ref="presetEditInput"
                    v-model="editingPresetText"
                    type="text"
                    class="min-w-0 flex-1 rounded border border-[var(--accent)] bg-white px-1 py-0 text-[11px] text-[#1a1a1a] outline-none dark:bg-[#2a2a2a] dark:text-[#e5e5e5]"
                    :style="{ width: `${Math.max(6, editingPresetText.length + 2)}ch` }"
                    @click.stop
                    @keydown.enter.prevent="commitPresetEdit"
                    @keydown.esc.prevent="cancelPresetEdit"
                    @blur="commitPresetEdit"
                  />
                  <span
                    v-else
                    class="min-w-0 cursor-text truncate select-none"
                    @dblclick.stop="startPresetEdit(p)"
                    >{{ p.text }}</span
                  >
                </span>
                <button
                  class="cursor-pointer border-0 bg-transparent p-0 text-[13px] leading-none text-[#bbb] opacity-0 transition-opacity hover:text-[#e74c3c] group-hover:opacity-100"
                  title="删除这条常用要求"
                  :disabled="generating"
                  @click="removeExtraPreset(p.id)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>
        </div>

        <!-- 错误 -->
        <div
          v-if="errorMsg"
          class="rounded-lg border border-[#fde2e2] bg-[#fef5f5] px-3 py-2 text-[12px] text-[#c0392b] dark:border-[#5a2a2a] dark:bg-[#2a1a1a]"
        >
          {{ errorMsg }}
        </div>

        <!-- 生成中：流式预览（撑满剩余高度，内部滚动） -->
        <div
          v-if="generating"
          class="flex min-h-0 flex-1 flex-col rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
        >
          <div
            class="flex shrink-0 items-center gap-2 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
          >
            <Loader2 :size="13" class="animate-spin text-[var(--accent)]" />
            <span class="text-[12px] text-[#666] dark:text-[#999]">排版中…</span>
            <span class="text-[11px] text-[#999] dark:text-[#666]">{{ elapsedSec }}s</span>
            <span class="ml-auto text-[11px] text-[#999] dark:text-[#666]">
              {{ estimateTokens(streamingText) }} tokens
            </span>
          </div>
          <pre
            ref="streamRef"
            class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-[#333] dark:text-[#ccc]"
            >{{ streamingText }}</pre
          >
        </div>

        <!-- 完成：警告 + 结果 -->
        <template v-else-if="hasResult">
          <div
            v-if="warnings.length > 0"
            class="shrink-0 rounded-lg border border-[#fdf0d5] bg-[#fffbf0] px-3 py-2 dark:border-[#4a3c1a] dark:bg-[#2a2416]"
          >
            <p class="mb-1 text-[12px] font-medium text-[#b7791f]">提醒（不影响应用）</p>
            <ul class="list-disc pl-4 text-[11px] leading-relaxed text-[#8a6d3b]">
              <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
            </ul>
          </div>

          <div
            class="flex min-h-0 flex-1 flex-col rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
          >
            <!-- 结果头部：统计 + 视图切换 -->
            <div
              class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
            >
              <span class="text-[12px] text-[#666] dark:text-[#999]">
                原文 {{ countChars(baseText).chars }} 字 → 结果 {{ resultStats.chars }} 字
              </span>
              <span class="text-[11px] text-[#2e9e5b]">+{{ stats.added }}</span>
              <span class="text-[11px] text-[#c0392b]">-{{ stats.removed }}</span>
              <span class="text-[11px] text-[#999] dark:text-[#666]"
                >组件 {{ componentCount }} 个</span
              >
              <span v-if="diffTruncated" class="text-[11px] text-[#b7791f]">
                差异过大，按整体替换展示
              </span>
              <div class="ml-auto flex gap-1">
                <button
                  class="cursor-pointer rounded-md border px-2.5 py-1 text-[11px] transition-colors"
                  :class="
                    resultView === 'diff'
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                      : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
                  "
                  @click="switchToDiff"
                >
                  对比
                </button>
                <button
                  class="cursor-pointer rounded-md border px-2.5 py-1 text-[11px] transition-colors"
                  :class="
                    resultView === 'text'
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                      : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
                  "
                  @click="resultView = 'text'"
                >
                  编辑结果
                </button>
              </div>
            </div>

            <!-- 对比视图 -->
            <div
              v-if="resultView === 'diff'"
              ref="resultScrollRef"
              class="min-h-0 flex-1 overflow-y-auto"
            >
              <!-- 移动端是单栏逐行对照（带 +/− 标记），表头只写一行说明 -->
              <div
                v-if="isMobileWeb"
                class="border-b border-[#f0f0f0] px-3 py-1.5 text-[11px] font-medium text-[#999] dark:border-[#333] dark:text-[#666]"
              >
                排版结果对比（<span class="text-[#1e7e46] dark:text-[#7fd8a0]">+ 新增</span> /
                <span class="text-[#a94442] dark:text-[#e8a0a0]">− 删除</span>）
              </div>
              <div v-else class="grid grid-cols-2 border-b border-[#f0f0f0] dark:border-[#333]">
                <div class="px-3 py-1.5 text-[11px] font-medium text-[#999] dark:text-[#666]">
                  原文
                </div>
                <div
                  class="border-l border-[#f0f0f0] px-3 py-1.5 text-[11px] font-medium text-[#999] dark:border-[#333] dark:text-[#666]"
                >
                  排版结果
                </div>
              </div>
              <template v-for="(hunk, hi) in hunks" :key="hi">
                <div
                  v-if="hunk.gapBefore > 0"
                  class="border-b border-[#f0f0f0] bg-[#fafafa] px-3 py-1 text-center text-[10px] text-[#bbb] dark:border-[#333] dark:bg-[#252525] dark:text-[#555]"
                >
                  ⋯ 折叠 {{ hunk.gapBefore }} 行未变化内容 ⋯
                </div>
                <div
                  v-for="(line, li) in hunk.lines"
                  :key="`${hi}-${li}`"
                  class="grid border-b border-[#f7f7f7] font-mono text-[11px] leading-relaxed dark:border-[#2a2a2a]"
                  :class="[
                    isMobileWeb ? 'grid-cols-1' : 'grid-cols-2',
                    {
                      'bg-[#f0fbf3] dark:bg-[#16281c]': line.type === 'add',
                      'bg-[#fdf2f2] dark:bg-[#2a1a1a]': line.type === 'remove',
                    },
                  ]"
                >
                  <!-- 移动端单栏：只显示一行，标注 +/− 便于区分增删 -->
                  <template v-if="isMobileWeb">
                    <div
                      class="whitespace-pre-wrap break-words px-3 py-0.5"
                      :class="
                        line.type === 'add'
                          ? 'text-[#1e7e46] dark:text-[#7fd8a0]'
                          : line.type === 'remove'
                            ? 'text-[#a94442] dark:text-[#e8a0a0]'
                            : 'text-[#666] dark:text-[#999]'
                      "
                    >
                      <span class="mr-1 select-none opacity-60">{{
                        line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '
                      }}</span
                      >{{ line.text || ' ' }}
                    </div>
                  </template>
                  <template v-else>
                    <div
                      class="whitespace-pre-wrap break-words px-3 py-0.5 text-[#666] dark:text-[#999]"
                    >
                      <template v-if="line.type !== 'add'">{{ line.text || ' ' }}</template>
                    </div>
                    <div
                      class="whitespace-pre-wrap break-words border-l border-[#f0f0f0] px-3 py-0.5 text-[#333] dark:border-[#333] dark:text-[#ccc]"
                    >
                      <template v-if="line.type !== 'remove'">{{ line.text || ' ' }}</template>
                    </div>
                  </template>
                </div>
              </template>
            </div>

            <!-- 编辑视图 -->
            <textarea
              v-else
              v-model="resultText"
              rows="18"
              class="min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 font-mono text-[12px] leading-relaxed text-[#1a1a1a] outline-none dark:text-[#e5e5e5]"
            ></textarea>
          </div>
        </template>

        <!-- 空态：同样撑满剩余高度，内容居中，不留半截空白 -->
        <div
          v-else
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e5e5e5] bg-white px-6 text-center dark:border-[#444] dark:bg-[#1e1e1e]"
        >
          <Sparkles :size="22" class="text-[#ccc]" />
          <p class="text-[12px] text-[#999] dark:text-[#666]">
            选择来源后点击「开始排版」，结果会以左右对比的形式展示，确认后再应用到编辑器。
          </p>
        </div>
      </template>
    </div>

    <template #footer>
      <template v-if="generating">
        <button
          class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-5 py-2 text-[13px] text-[#666] transition-colors hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:bg-[#333]"
          @click="onStop"
        >
          停止
        </button>
      </template>
      <template v-else>
        <button
          v-if="hasResult"
          class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-5 py-2 text-[13px] text-[#666] transition-colors hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:bg-[#333]"
          @click="onRegenerate"
        >
          重新生成
        </button>
        <button
          v-if="!hasResult"
          class="cursor-pointer rounded-lg border-0 px-5 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          :style="{ backgroundColor: colors.accent }"
          :disabled="!configured || !sourceText.trim()"
          @click="onGenerate"
        >
          开始排版
        </button>
        <button
          v-else
          class="cursor-pointer rounded-lg border-0 px-5 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          :style="{ backgroundColor: colors.accent }"
          @click="onApply"
        >
          应用并替换编辑器
        </button>
      </template>
    </template>
  </BaseDrawer>

  <ConfirmDialog
    v-model:visible="confirmApplyVisible"
    title="编辑器内容已改动"
    :message="confirmApplyMessage"
    cancel-text="取消"
    confirm-text="继续应用"
    @confirm="doApply"
    @cancel="confirmApplyVisible = false"
  />

  <!-- 清空结果确认 -->
  <ConfirmDialog
    v-model:visible="clearConfirmVisible"
    title="清空结果"
    message="清空后本次排版结果将不再保留（可从编辑器重新排版）。确定清空吗？"
    cancel-text="取消"
    confirm-text="清空"
    @confirm="doClearResult"
    @cancel="clearConfirmVisible = false"
  />
</template>
