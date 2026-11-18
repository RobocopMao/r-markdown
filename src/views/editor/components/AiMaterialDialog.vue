<script setup vapor lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Loader2,
  Sparkles,
  Settings2,
  Eye,
  Code,
  Plus,
  Copy,
  Check,
  ArrowUp,
  Square,
  HelpCircle,
} from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useTheme } from '@/composables/useTheme'
import { getSetting, setSetting } from '@/config/settings'
import { getErrorMessage } from '@/utils/helpers'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import { resolveIdbImages } from '@/utils/imageDB'
import { resolveDiskImages } from '@/services/localImageDisk'
import { useMermaid } from '@/composables/useMermaid'
import { loadFormatSpec, validateFormat } from '@/utils/aiFormatPrompt'
import {
  buildMaterialSystemPrompt,
  buildMaterialUserMessage,
  buildMaterialFollowUpMessage,
  buildMaterialRetryMessage,
  checkMaterialOutput,
  checkMaterialIntent,
  cleanMaterialOutput,
  findClassStyledTags,
  findForbiddenHtmlTags,
  findIllegalAttrs,
  findShapeProblems,
  findWechatHtmlIssues,
  loadMaterialSkill,
  looksLikeQuestion,
  repairMaterialOutput,
} from '@/utils/aiMaterialPrompt'
import {
  appendMaterialMessage,
  createMaterialSession,
  isMaterialExpired,
  newMaterialId,
  normalizeMaterialSession,
  renewMaterialSession,
  replaceMaterialMessage,
  toMaterialHistory,
  truncateBefore,
  type MaterialMessage,
  type MaterialSession,
} from '@/utils/aiMaterialSession'
import {
  formatArticle,
  listTextModels,
  resolveAiConfig,
  type ChatMessage,
} from '@/services/aiFormat'
import { useSessionCountdown } from '@/composables/useSessionCountdown'
import { clearRecord, loadRecord, saveRecord } from '@/services/aiSessionStore'
import {
  applyMaterialCommand,
  filterMaterialCommands,
  findSlashQuery,
  type MaterialCommand,
} from '@/utils/materialCommands'

const props = defineProps<{
  /**
   * 内嵌模式：由 AiBoard.vue 使用——不再作为抽屉弹出，而是铺在编辑区面板里。
   * 「打开时初始化」仍由 visible 驱动（挂载那刻 visible 已是 true，故必须 immediate）。
   */
  embedded?: boolean
  visible: boolean
  /** 编辑器当前内容（只看是否为空，给「清空再插入」一个更准的文案） */
  markdown: string
}>()

const emit = defineEmits<{
  close: []
  /** 插入到光标位置（不覆盖已有内容） */
  insert: [text: string]
  /** 清空编辑器全文后插入 */
  replace: [text: string]
  openSettings: []
}>()

const { colors } = useTheme()
const { renderAll } = useMermaid()

/** 规范原文按需加载并缓存：单独成 chunk，不撑大主包；面板多次打开只读一次 */
let specPromise: Promise<string> | null = null
function getSpec(): Promise<string> {
  if (!specPromise) specPromise = loadFormatSpec()
  return specPromise
}

/** 技能全文（玩法标准）按需加载并缓存，理由同上 */
let skillPromise: Promise<string> | null = null
function getSkill(): Promise<string> {
  if (!skillPromise) skillPromise = loadMaterialSkill()
  return skillPromise
}

// ── 配置态 ──
/**
 * 配置状态必须是响应式的：isAiConfigured() 只读 localStorage，
 * 放进 computed 会被永久缓存，表现为「去设置填完 Key 回来仍显示未配置」。
 */
const aiBaseUrl = ref(getSetting<string>('aiBaseUrl') || '')
const aiApiKey = ref(getSetting<string>('aiApiKey') || '')
const materialModel = ref(getSetting<string>('aiMaterialModel') || '')
const modelOptions = ref(listTextModels())
if (!modelOptions.value.includes(materialModel.value)) {
  materialModel.value = modelOptions.value[0] || ''
}
watch(materialModel, (v) => setSetting('aiMaterialModel', v, true))

function refreshAiConfig() {
  aiBaseUrl.value = getSetting<string>('aiBaseUrl') || ''
  aiApiKey.value = getSetting<string>('aiApiKey') || ''
  modelOptions.value = listTextModels()
  const saved = getSetting<string>('aiMaterialModel') || ''
  materialModel.value = modelOptions.value.includes(saved) ? saved : modelOptions.value[0] || ''
}

function onAiSettingChanged(e: Event) {
  const key = (e as CustomEvent).detail?.key as string | undefined
  if (key === 'aiBaseUrl' || key === 'aiApiKey' || key === 'aiModels' || key === 'aiModel') {
    refreshAiConfig()
  }
}

const configured = computed(() =>
  Boolean(aiBaseUrl.value && aiApiKey.value && (materialModel.value || modelOptions.value[0])),
)

// ── 会话 ──
const session = ref<MaterialSession | null>(null)
/** 会话内容（模板里用；session 为 null 时是空数组） */
const messages = computed<MaterialMessage[]>(() => session.value?.messages ?? [])
const hasMessages = computed(() => messages.value.length > 0)
const { now, remainingText, currentHours, startTicker, stopTicker, syncText } =
  useSessionCountdown('aiMaterialSessionHours')

/** 会话是否已过期（倒计时归零时转为 true，输入与发送随之禁用） */
const expired = computed(() => {
  const s = session.value
  return !s || isMaterialExpired(s, now.value)
})

/** 一次性提示（会话过期、落盘失败等），2.5 秒后自动消失 */
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(msg: string) {
  notice.value = msg
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
  }, 2500)
}

const STORE_KEY = 'material'

async function ensureSession() {
  const hours = currentHours()
  const rec = await loadRecord<unknown>(STORE_KEY, Date.now())
  const restored = rec ? normalizeMaterialSession(rec.payload, Date.now(), hours) : null
  if (restored) {
    session.value = restored
  } else {
    // 有记录但被判不可用 → 上一会话已过期，明确告诉用户为什么清空了
    if (rec) showNotice('上一会话已超过有效期，已为你开启新会话')
    session.value = createMaterialSession(Date.now(), hours)
    await persist()
  }
  now.value = Date.now()
  syncText(session.value.expiresAt)
  await nextTick()
  for (const m of messages.value) {
    if (m.role === 'assistant' && m.kind === 'draft' && m.material) void renderDraft(m)
  }
  pinToBottom()
}

/**
 * 发起请求前续期：把 expiresAt 推到「现在 + 保留时长」并落盘。
 *
 * 这就是「按最后一次请求开始算」的落点——用户每发一次请求，倒计时就回满。
 * 只在新请求开始时调用一次，不在流式过程中反复续期。
 */
async function renewOnRequest() {
  const s = session.value
  if (!s) return
  session.value = renewMaterialSession(s, Date.now(), currentHours())
  now.value = Date.now()
  syncText(session.value.expiresAt)
  await persist()
}

async function persist() {
  const s = session.value
  if (!s) return
  try {
    await saveRecord(STORE_KEY, s, Date.now(), currentHours())
  } catch {
    showNotice('会话未能保存到本地，关闭面板后本次对话会丢失')
  }
}

const newSessionVisible = ref(false)

function onNewSession() {
  if (!hasMessages.value && !streamingText.value) return
  newSessionVisible.value = true
}

async function doNewSession() {
  newSessionVisible.value = false
  abort()
  await clearRecord(STORE_KEY)
  session.value = createMaterialSession(Date.now(), currentHours())
  now.value = Date.now()
  syncText(session.value.expiresAt)
  streamingText.value = ''
  renderedHtml.value = {}
  errorMsg.value = ''
  input.value = ''
  await persist()
  await nextTick()
  autoGrow()
  focusInput()
}

// ── 输入框 ──
const input = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

/** 单行高度（与 textarea 的 leading-[22px] 对应） */
const INPUT_LINE_HEIGHT = 22
/** 上下内边距合计（py-2 = 8px × 2） */
const INPUT_PADDING_Y = 16
const INPUT_BASE_MIN = INPUT_LINE_HEIGHT + INPUT_PADDING_Y
const INPUT_BASE_MAX = INPUT_LINE_HEIGHT * 6 + INPUT_PADDING_Y
/**
 * 整体高度倍率，与 AI 写作面板保持一致（用户要求「输入框高度大一点，同 AI 写作」）。
 * 不改成「行数翻倍」——那样最小高度只有 60px（含内边距不足 2 倍），与 AI 写作对不上；
 * 用倍率乘高度最直白，日后两个面板要一起调也只改各自的这一个数。
 */
const INPUT_HEIGHT_SCALE = 2

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  const min = INPUT_BASE_MIN * INPUT_HEIGHT_SCALE
  const max = INPUT_BASE_MAX * INPUT_HEIGHT_SCALE
  el.style.height = `${Math.min(max, Math.max(min, el.scrollHeight))}px`
}

function focusInput() {
  inputRef.value?.focus()
}

// ── / 快捷插入组件名 ──
/**
 * 输入 `/` 时在输入框上方弹组件清单（需求原话「类似 DSH 的 / 功能」）。
 *
 * 三样东西都记在「这次快捷输入被识别的那一刻」，而不是选中条目那一刻现取：
 * - `slashStart`：`/` 在正文里的下标，替换的起点；
 * - `slashQuery`：`/` 后面已经敲进去的字母，用来过滤清单；
 * - `slashCaret`：光标当时所在的终点，替换的终点。
 *
 * 鼠标点条目时 textarea 会失焦，某些浏览器会把 selectionStart 归到别处
 * （实测点下去之后再读 selectionStart 会漂），所以终点必须用记下来的值。
 */
const slashOpen = ref(false)
const slashQuery = ref('')
const slashStart = ref(0)
const slashCaret = ref(0)
const slashIndex = ref(0)
const slashCommands = computed(() => filterMaterialCommands(slashQuery.value))

/** 输入 / 光标移动后重算：光标前是不是还在「/ 查询词」里 */
function refreshSlashMenu() {
  const el = inputRef.value
  if (!el) {
    slashOpen.value = false
    return
  }
  const caret = el.selectionStart ?? input.value.length
  const hit = findSlashQuery(input.value, caret)
  if (!hit) {
    slashOpen.value = false
    return
  }
  const list = filterMaterialCommands(hit.query)
  if (!list.length) {
    slashOpen.value = false
    return
  }
  slashQuery.value = hit.query
  slashStart.value = hit.start
  slashCaret.value = caret
  slashOpen.value = true
  if (slashIndex.value >= list.length) slashIndex.value = 0
}

/** 选中第 i 项（键盘回车与鼠标点击共用一个入口） */
function chooseCommand(cmd: MaterialCommand) {
  const el = inputRef.value
  const { text, caret: next } = applyMaterialCommand(
    input.value,
    slashCaret.value,
    slashStart.value,
    cmd.tag,
  )
  input.value = text
  slashOpen.value = false
  slashIndex.value = 0
  void nextTick(() => {
    el?.focus()
    el?.setSelectionRange(next, next)
    autoGrow()
  })
}

function onInputChange() {
  autoGrow()
  refreshSlashMenu()
}

/** 回车发送、Shift+回车换行。isComposing 挡住中文输入法组词期间的回车 */
function onInputKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return

  // 快捷菜单开着时，上下键选、回车确认、Esc 关掉——比继续输入组件名再手打尖括号快
  if (slashOpen.value) {
    const list = slashCommands.value
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashIndex.value = list.length ? (slashIndex.value + 1) % list.length : 0
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashIndex.value = list.length ? (slashIndex.value - 1 + list.length) % list.length : 0
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      slashOpen.value = false
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const cmd = list[slashIndex.value]
      if (cmd) chooseCommand(cmd)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const cmd = list[slashIndex.value]
      if (cmd) chooseCommand(cmd)
      return
    }
  }

  if (e.key !== 'Enter' || e.shiftKey) return
  e.preventDefault()
  void onSend()
}

// ── 生成态 ──
/** 最多重试几次（模型废稿的几类：JSX、YAML、退回普通 Markdown、属性名瞎编） */
const MAX_RETRY = 2
const retrying = ref(false)
const retryCount = ref(0)
const generating = ref(false)
const streamingText = ref('')
const errorMsg = ref('')
const elapsedSec = ref(0)

let controller: AbortController | null = null
let timer: ReturnType<typeof setInterval> | null = null
/** 自动修复（把写错位置的数据搬回属性）的记录，随本轮素材一起存下来 */
let repairNotes: string[] = []

/**
 * 清洗 + 确定性修复。
 *
 * 为什么要在重试之前修：`<chart>` 把数据写成 `- 2020 | 6.4` 这种错法，提示词讲了三遍、
 * 带理由重试两次模型还是会犯（「图表 + 数据行」在它的训练语料里几乎都是表格形状）。
 * 但这类错误可逆——正文结构固定，解析出来塞进属性即可，不必再消耗一次往返。
 * 修不了的（比如纯 JSX）才落到下面的重试逻辑。
 */
function prepareMaterial(raw: string): string {
  const cleaned = cleanMaterialOutput(raw)
  const { text, notes } = repairMaterialOutput(cleaned)
  for (const note of notes) {
    if (!repairNotes.includes(note)) repairNotes.push(note)
  }
  return text
}

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
  retrying.value = false
  retryCount.value = 0
  streamingText.value = ''
}

function isAbort(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'AbortError'
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('abort') || msg.includes('中止')
}

// ── 预览渲染：按消息 id 缓存 ──
const renderedHtml = ref<Record<string, string>>({})

/**
 * 把一条素材按编辑器语法渲染成预览。
 *
 * 每条消息各自一份 HTML（而不是只有一个全局预览）：对话里可能留着好几版素材，
 * 用户要能一眼分清「第一版长什么样、改完之后长什么样」再决定插入哪一版。
 */
async function renderDraft(msg: MaterialMessage) {
  const src = (msg.material || '').trim()
  if (!src) return
  try {
    let md = await resolveIdbImages(src)
    if (import.meta.env.VITE_TAURI === 'true') md = await resolveDiskImages(md)
    let html = await parseMarkdownAsync(md, colors.value)
    if (html.includes('class="mermaid"')) {
      const tmp = document.createElement('div')
      tmp.style.position = 'absolute'
      tmp.style.visibility = 'hidden'
      tmp.style.pointerEvents = 'none'
      tmp.innerHTML = html
      document.body.appendChild(tmp)
      await renderAll(tmp)
      html = tmp.innerHTML
      document.body.removeChild(tmp)
    }
    renderedHtml.value = { ...renderedHtml.value, [msg.id]: html }
  } catch {
    renderedHtml.value = { ...renderedHtml.value, [msg.id]: '' }
  }
}

// ── 每条素材的视图（预览 / 源码）──
type DraftView = 'preview' | 'code'
const draftViews = ref<Record<string, DraftView>>({})
/** 默认预览；用户切成源码后按消息 id 记住 */
function draftView(msg: MaterialMessage): DraftView {
  return draftViews.value[msg.id] ?? 'preview'
}
function setDraftView(id: string, view: DraftView) {
  draftViews.value = { ...draftViews.value, [id]: view }
}

// ── 素材卡头部的问号说明（悬停展开）──
/** 当前展开的是哪条消息的说明 */
const hintOpenId = ref('')
/** 浮层的 fixed 坐标。卡片外壳是 overflow-hidden，absolute 会被裁掉，只能 Teleport 到 body */
const hintPos = ref({ left: 0, top: 0 })
const hintWidth = 246
/** 移开问号后不立刻关，留一点时间给鼠标挪进浮层（两者之间隔着 6px） */
let hintCloseTimer: ReturnType<typeof setTimeout> | null = null

function cancelHintClose() {
  if (hintCloseTimer) {
    clearTimeout(hintCloseTimer)
    hintCloseTimer = null
  }
}

function openHint(id: string, e: MouseEvent) {
  cancelHintClose()
  if (hintOpenId.value === id) return
  const anchor = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  if (anchor) {
    // 贴着问号右下角展开；右侧越界时往左收，下方空间不够就翻到问号上面
    const left = Math.min(anchor.left - 8, window.innerWidth - hintWidth - 12)
    const below = anchor.bottom + 6
    const top = below + 120 > window.innerHeight ? Math.max(12, anchor.top - 126) : below
    hintPos.value = { left: Math.max(12, left), top }
  }
  hintOpenId.value = id
}

function scheduleHintClose() {
  cancelHintClose()
  hintCloseTimer = setTimeout(() => {
    hintOpenId.value = ''
  }, 160)
}

function closeHint() {
  cancelHintClose()
  hintOpenId.value = ''
}

/** 源码视图里手改：改完即存，预览跟着更新（用户可改两笔再插入） */
let codeTimer: ReturnType<typeof setTimeout> | null = null
function onCodeEdit(id: string, value: string) {
  const s = session.value
  if (!s) return
  session.value = replaceMaterialMessage(s, id, { material: value, content: value })
  if (codeTimer) clearTimeout(codeTimer)
  codeTimer = setTimeout(() => {
    const msg = session.value?.messages.find((m) => m.id === id)
    if (msg) void renderDraft(msg)
    void persist()
  }, 400)
}

// ── 复制 ──
const copiedId = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function onCopy(msg: MaterialMessage) {
  const text = msg.material || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 不支持剪贴板 API 的环境（http 非 localhost / 旧内核）退回选中复制
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copiedId.value = msg.id
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedId.value = ''
  }, 1600)
}

// ── 组装这一轮的请求消息 ──
/**
 * 历史里的 user 消息要分别包装：第一句是「需求」，之后是「在上一版基础上改」。
 *
 * 为什么不直接把原文丢给模型：模型的训练语料里「改了」和「再做一份」分不清，
 * 不点明「这是同一段素材的下一版」它就会从头另做一段，用户前三轮的调整全白费。
 * 判据用 id 而不是下标：历史会被裁剪，下标会漂，id 不会。
 */
function buildHistory(s: MaterialSession): ChatMessage[] {
  const firstUserId = s.messages.find((m) => m.role === 'user')?.id ?? ''
  return toMaterialHistory(s).map((m, i) => {
    if (m.role !== 'user') return m
    const src = s.messages.filter((x) => x.role === 'user')[i] ?? s.messages[0]
    const isFirst = src?.id === firstUserId
    return {
      role: 'user' as const,
      content: isFirst
        ? buildMaterialUserMessage(m.content)
        : buildMaterialFollowUpMessage(m.content),
    }
  })
}

async function onSend() {
  const text = input.value.trim()
  if (!text || generating.value || expired.value || !configured.value) return
  input.value = ''
  void nextTick(autoGrow)
  stickToBottom.value = true

  const userMsg: MaterialMessage = {
    id: newMaterialId(),
    role: 'user',
    content: text,
    at: Date.now(),
  }
  session.value = appendMaterialMessage(session.value!, userMsg)
  void scrollToBottom(true)

  await runTurn()
}

/** 跑一轮 assistant 回复 */
async function runTurn() {
  const s = session.value
  if (!s) return

  await renewOnRequest()
  errorMsg.value = ''
  streamingText.value = ''
  repairNotes = []
  retrying.value = false
  retryCount.value = 0

  const cfg = resolveAiConfig(materialModel.value)
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    errorMsg.value =
      '尚未配置 AI 文本：请先在「设置 → AI 设置 → AI 文本」填写接口地址、API Key 与模型名'
    return
  }

  generating.value = true
  const startedAt = Date.now()
  elapsedSec.value = 0
  stopTimer()
  timer = setInterval(() => {
    elapsedSec.value = Math.round((Date.now() - startedAt) / 500)
  }, 500)

  controller = new AbortController()
  try {
    const [skill, spec] = await Promise.all([getSkill(), getSpec()])
    const system = buildMaterialSystemPrompt({ skill, spec })
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...buildHistory(session.value!),
    ]

    let { text, finishReason } = await formatArticle(cfg, messages, {
      signal: controller.signal,
      onDelta: (d) => {
        streamingText.value += d
      },
    })

    // 模型会稳定地在几种废稿之间摇摆：JSX、YAML 伪代码、退回普通 Markdown、
    // 用了组件但属性名瞎编、子内容形状不对。提示词层面写死了也没用（实测），
    // 所以这里统一质检，不合格就带着「上一版错在哪」再要一次。
    // 最多重试 2 次：第 1 次通常能救回来，第 2 次兜住偶发；再不合格就把结果交用户 + warning，不无限循环。
    // 两类质检缺一不可：语法（checkMaterialOutput）+ 选型（checkMaterialIntent）。
    // 只查语法会漏掉「要小节标题却写成了 steps」——那是完全合法的 steps，语法挑不出错。
    // 判据取「最后一条用户消息」而不是第一句：改稿轮里用户说的才是这一轮的要求。
    const lastUser = [...session.value!.messages].reverse().find((m) => m.role === 'user')
    const requirement = lastUser?.content ?? ''
    const judge = (t: string) =>
      looksLikeQuestion(t) ? null : (checkMaterialOutput(t) ?? checkMaterialIntent(requirement, t))
    let cleaned = prepareMaterial(text)
    for (let attempt = 0; attempt < MAX_RETRY && judge(cleaned); attempt += 1) {
      streamingText.value = ''
      retrying.value = true
      retryCount.value = attempt + 1
      const retry = await formatArticle(
        cfg,
        [
          ...messages,
          { role: 'user', content: buildMaterialRetryMessage(cleaned, judge(cleaned) ?? '') },
        ],
        {
          signal: controller.signal,
          onDelta: (d) => {
            streamingText.value += d
          },
        },
      )
      text = retry.text
      finishReason = retry.finishReason
      cleaned = prepareMaterial(text)
    }

    await commitAssistantTurn(text, finishReason)
  } catch (e: unknown) {
    if (isAbort(e)) return
    errorMsg.value = getErrorMessage(e, '生成失败')
  } finally {
    generating.value = false
    retrying.value = false
    retryCount.value = 0
    controller = null
    stopTimer()
  }
}

/**
 * 把一轮输出落成一条消息。
 *
 * 分两类：`draft`（这一轮出了可插入的素材）与 `question`（模型追问，没有可插入内容）。
 * 追问是对话模式才有的东西——需求太模糊时让模型问一句，比它硬猜一版跑偏强。
 */
async function commitAssistantTurn(raw: string, finishReason: string) {
  const s = session.value
  if (!s) return
  const text = prepareMaterial(raw)
  const question = looksLikeQuestion(text)

  const msg: MaterialMessage = question
    ? {
        id: newMaterialId(),
        role: 'assistant',
        content: text,
        kind: 'question',
        at: Date.now(),
      }
    : {
        id: newMaterialId(),
        role: 'assistant',
        content: text,
        kind: 'draft',
        material: text,
        warnings: collectWarnings(text, finishReason),
        at: Date.now(),
      }

  session.value = appendMaterialMessage(s, msg)
  streamingText.value = ''
  if (question) {
    errorMsg.value = ''
  } else if (finishReason === 'length') {
    errorMsg.value = '输出达到最大长度上限，素材可能被截断；可缩短改动要求后重新生成'
  }
  await persist()
  if (msg.material) void renderDraft(msg)
  await scrollToBottom(true)
}

/** 质检提醒：只提示、不拦插入（除了彻底失败的重试循环，这里一律交给用户判断） */
function collectWarnings(text: string, finishReason: string): string[] {
  const w: string[] = []
  const { warnings: tagWarnings } = validateFormat(text)
  w.push(...tagWarnings)
  // 没用到任何组件：语法没错但没起到「素材」的作用，提示一句让用户决定要不要重来
  if (text && !/<[a-z][a-z-]*[\s/>]/i.test(text.replace(/\{\{RMIMG_\d+\}\}/g, ''))) {
    w.push('这次没有用上任何组件，只是普通 Markdown；想要排好版的片段可以把需求说得更具体些')
  }
  // 用了组件没声明的属性：编辑器会静默忽略，用户看不出问题但信息丢了
  const illegal = findIllegalAttrs(text)
  if (illegal.length > 0) {
    const list = illegal.map((x) => `<${x.tag}> 的 ${x.attr}`).join('、')
    w.push(`这些属性不存在，已被忽略：${list}；把内容挪进子内容或改用合法属性即可`)
  }
  // `<html>` 块里的样式必须行内：微信会丢 class，写 class 等于没写样式
  const classed = findClassStyledTags(text)
  if (classed.length > 0) {
    w.push(
      `<html> 块里用了 class（${classed.map((x) => `<${x}>`).join('、')}），微信编辑器会丢掉 class，样式要写成行内 style`,
    )
  }
  // `<html>` 块里塞了脚本/外链媒体：微信不支持，粘过去会被过滤
  const forbidden = findForbiddenHtmlTags(text)
  if (forbidden.length > 0) {
    w.push(
      `<html> 块里用了 ${forbidden.map((x) => `<${x}>`).join('、')}，微信编辑器不支持，会被过滤或整段失效`,
    )
  }
  // `<html>` 块里有微信会删掉的写法（position / filter / 外链图…）：不拦，但要告诉用户
  // 「编辑器里看着正常、粘进公众号会散版」这件事，否则用户以为已经好了
  const wechatSoft = findWechatHtmlIssues(text).filter((x) => !x.blocking)
  if (wechatSoft.length > 0) {
    w.push(...wechatSoft.map((x) => `${x.text}（编辑器里会照常显示，粘进公众号才失效）`))
  }
  // 子内容形状不对：组件会照常渲染但内容可能整块为空，比报错更隐蔽
  w.push(...findShapeProblems(text))
  // 自动修复过的项：告诉用户「这里我替你搬过位置了」，不要静默改内容
  w.push(...repairNotes)
  if (finishReason === 'length') {
    w.push('输出达到最大长度上限，结果可能被截断；可缩短需求后重试')
  }
  return w
}

/**
 * 重新生成某一版：把这条之前的历史重跑一遍。
 *
 * 不能直接 runTurn()——那样历史会以一条 assistant 消息结尾，模型会「接着自己往下写」。
 * 正确做法是丢掉这条及其之后的全部消息，让历史重新以用户消息结尾，再发一次请求。
 */
async function onRegenerate(msg: MaterialMessage) {
  const s = session.value
  if (!s || generating.value) return
  session.value = truncateBefore(s, msg.id)
  await persist()
  streamingText.value = ''
  await runTurn()
}

function onStop() {
  abort()
}

// ── 落地动作（交给父级执行，见 DEVELOPMENT.md 第 32 条）──
const replaceConfirmVisible = ref(false)
const pendingReplaceId = ref('')
const replaceMessage = computed(() =>
  props.markdown.trim()
    ? '编辑器里已有内容，清空后会被这一版素材整篇替换。原内容可以用撤销找回。'
    : '编辑器当前是空的，将直接把这一版素材写入。',
)

/** 按 id 回查：确认弹窗期间用户可能又改了源码，插入的应当是那之后的最新内容 */
function findDraft(id: string): MaterialMessage | null {
  return session.value?.messages.find((m) => m.id === id) ?? null
}

function onInsert(msg: MaterialMessage) {
  const latest = findDraft(msg.id)
  if (!latest?.material) return
  emit('insert', latest.material)
}

function onReplace(msg: MaterialMessage) {
  if (!msg.material) return
  pendingReplaceId.value = msg.id
  replaceConfirmVisible.value = true
}

function doReplace() {
  replaceConfirmVisible.value = false
  const latest = findDraft(pendingReplaceId.value)
  pendingReplaceId.value = ''
  if (!latest?.material) return
  emit('replace', latest.material)
}

// ── 自动滚动：用户上滑回看时不打断 ──
const stickToBottom = ref(true)
const contentRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
let contentObserver: ResizeObserver | null = null

function onScroll() {
  const el = scrollRef.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

async function scrollToBottom(force = false) {
  await nextTick()
  const el = scrollRef.value
  if (!el) return
  if (force || stickToBottom.value) el.scrollTop = el.scrollHeight
}

/**
 * 连续几帧把滚动条按到底。
 *
 * 打开面板时不是「设一次 scrollTop」就够的：素材预览是异步渲染的、输入框自动增高
 * 也会改变可滚动区域，晚一拍落下的 reflow 会让上次设的值作废，表现就是「差一点点没到底」。
 * 只在用户没有主动上滑（stickToBottom）时生效，所以不会干扰回看旧内容。
 */
function pinToBottom(frames = 8) {
  stickToBottom.value = true
  let left = frames
  const step = () => {
    if (!stickToBottom.value) return
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
    if (--left > 0) requestAnimationFrame(step)
  }
  void nextTick(step)
}

/**
 * 内容或可滚动区域变化时贴住底部（理由同 AiWriteDialog：异步渲染 + 输入框增高）。
 * 两处都要盯：contentRef（内容长高）与 scrollRef（容器变矮）。
 */
watch([contentRef, scrollRef], ([content, scroller]) => {
  if (contentObserver) {
    contentObserver.disconnect()
    contentObserver = null
  }
  if (!content && !scroller) return
  contentObserver = new ResizeObserver(() => {
    if (stickToBottom.value) void scrollToBottom()
  })
  if (content) contentObserver.observe(content)
  if (scroller) contentObserver.observe(scroller)
})

// 流式增量时跟随到底（仅在用户没有上滑时）
watch(streamingText, () => {
  if (stickToBottom.value) void scrollToBottom()
})

// 新消息进来时先吸附到底，再允许用户自由滚动
watch(
  () => messages.value.length,
  () => {
    stickToBottom.value = true
    void scrollToBottom(true)
  },
)

// 主题换色后重渲染所有素材预览（组件里的颜色来自主题）
watch(colors, () => {
  for (const m of messages.value) {
    if (m.role === 'assistant' && m.kind === 'draft' && m.material) void renderDraft(m)
  }
})

// ── 打开 / 关闭 ──
watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      abort()
      stopTicker()
      return
    }
    refreshAiConfig()
    errorMsg.value = ''
    // 预热技能与规范：打开面板时就开始拉 chunk，等用户写完第一句基本已就绪
    await Promise.all([getSkill(), getSpec()])
    await ensureSession()
    if (session.value) {
      syncText(session.value.expiresAt)
      startTicker(() => session.value?.expiresAt ?? null)
    }
    await nextTick()
    autoGrow()
    pinToBottom()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('setting-changed', onAiSettingChanged)
  // 悬停展开的浮层是 fixed 定位，滚动/resize 后坐标会飘，直接收掉；点击不需要管（鼠标移开就会关）
  window.addEventListener('scroll', closeHint, true)
  window.addEventListener('resize', closeHint)
})
onBeforeUnmount(() => {
  window.removeEventListener('setting-changed', onAiSettingChanged)
  window.removeEventListener('scroll', closeHint, true)
  window.removeEventListener('resize', closeHint)
  if (hintCloseTimer) clearTimeout(hintCloseTimer)
  hintCloseTimer = null
  abort()
  stopTicker()
  if (noticeTimer) clearTimeout(noticeTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
  if (codeTimer) clearTimeout(codeTimer)
  if (contentObserver) contentObserver.disconnect()
})
</script>

<template>
  <BaseDrawer
    :visible="props.visible"
    :embedded="props.embedded"
    title="AI 素材"
    width="min(95vw, 880px)"
    :show-footer="configured"
    no-body-padding
    @close="emit('close')"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span
          v-if="hasMessages"
          class="shrink-0 rounded-full px-2 py-[3px] text-[11px]"
          :class="
            expired
              ? 'bg-[#fdecec] text-[#c0392b] dark:bg-[#3a1f1f] dark:text-[#e57373]'
              : 'bg-[#f0f0f0] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]'
          "
        >
          {{ expired ? '会话已过期' : `保留 ${remainingText}` }}
        </span>
        <button
          v-if="hasMessages"
          class="ml-auto flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
          :disabled="generating"
          @click="onNewSession"
        >
          <Plus :size="12" />
          新建会话
        </button>
      </div>
    </template>

    <div class="flex h-full min-h-0 flex-col">
      <!-- 未配置引导 -->
      <div
        v-if="!configured"
        class="m-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-xl border border-[#f0f0f0] bg-white px-6 py-10 text-center dark:border-[#333] dark:bg-[#1e1e1e]"
      >
        <Settings2 :size="28" class="text-[var(--accent)]" />
        <p class="text-[13px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">还没有配置 AI 接口</p>
        <p class="max-w-[420px] text-[12px] leading-relaxed text-[#999] dark:text-[#666]">
          AI 素材和 AI 排版、AI 写作共用同一套「AI 文本」配置。填好接口地址、API Key
          和模型名，就能按编辑器语法直接生成素材了。
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
        <!-- 消息流；contentRef 供 ResizeObserver 观察内容长高后贴底 -->
        <div
          ref="scrollRef"
          class="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          @scroll.passive="onScroll"
        >
          <!--
            空态：没有对话时占满可视高度、垂直居中，样式与 AI 写作一致（不带边框和卡片底）。
            这里也承担「页脚那行提示」的职责——用户要求把模型后面的说明挪到空态里。
          -->
          <div
            v-if="!hasMessages && !generating"
            class="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
          >
            <Sparkles :size="26" class="text-[var(--accent)]" />
            <p class="text-[13px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">说出你要的素材</p>
            <p class="max-w-[460px] text-[12px] leading-relaxed text-[#999] dark:text-[#666]">
              AI 会按编辑器语法直接生成组件片段，插入后编辑器立即渲染。
            </p>
            <p class="max-w-[460px] text-[11px] leading-relaxed text-[#bbb] dark:text-[#555]">
              一次不满意就接着说：第二张卡片换成蓝色、标题短一点、别用 steps 了改成两栏
            </p>
            <p class="max-w-[460px] text-[11px] leading-relaxed text-[#bbb] dark:text-[#555]">
              想指定组件就打个
              <kbd class="rounded bg-[#f0f0f0] px-1 font-mono dark:bg-[#333]">/</kbd>，比如
              <kbd class="rounded bg-[#f0f0f0] px-1 font-mono dark:bg-[#333]">/steps</kbd>
              直接插进输入框
            </p>
          </div>

          <div ref="contentRef" class="flex flex-col gap-3">
            <template v-for="msg in messages" :key="msg.id">
              <!-- 用户消息：右对齐气泡 -->
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div
                  class="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--accent-light)] px-3.5 py-2 text-[13px] leading-relaxed text-[#1a1a1a] dark:text-[#e5e5e5]"
                >
                  {{ msg.content }}
                </div>
              </div>

              <!-- 追问：左对齐气泡（模型觉得需求还不够清楚时的提问，没有可插入内容） -->
              <div v-else-if="msg.kind === 'question'" class="flex justify-start">
                <div
                  class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-[#f0f0f0] bg-white px-3.5 py-2 text-[13px] leading-[1.5] text-[#333] dark:border-[#333] dark:bg-[#1e1e1e] dark:text-[#ccc]"
                >
                  {{ msg.content }}
                </div>
              </div>

              <!-- 素材卡：全宽 -->
              <div
                v-else
                class="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
              >
                <div
                  class="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
                >
                  <Sparkles :size="13" class="shrink-0 text-[var(--accent)]" />
                  <span class="text-[12px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">
                    素材
                  </span>
                  <!--
                    提示收进问号里，悬停才显示（用户要求「所有提示都加到这个位置，hover 的时候显示」）。
                    两条都在这一处：显示效果提醒 + 复用路径。
                  -->
                  <span
                    data-material-hint
                    class="flex cursor-help items-center rounded-full p-[2px] transition-colors"
                    :class="
                      hintOpenId === msg.id
                        ? 'text-[var(--accent)]'
                        : 'text-[#c4c4c4] hover:text-[var(--accent)] dark:text-[#555]'
                    "
                    @mouseenter="openHint(msg.id, $event)"
                    @mouseleave="scheduleHintClose"
                  >
                    <HelpCircle :size="13" />
                  </span>
                  <div class="ml-auto flex gap-1">
                    <button
                      class="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors"
                      :class="
                        draftView(msg) === 'preview'
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                          : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
                      "
                      @click="setDraftView(msg.id, 'preview')"
                    >
                      <Eye :size="12" />
                      预览
                    </button>
                    <button
                      class="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors"
                      :class="
                        draftView(msg) === 'code'
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                          : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
                      "
                      @click="setDraftView(msg.id, 'code')"
                    >
                      <Code :size="12" />
                      源码
                    </button>
                  </div>
                </div>

                <!-- 预览：直接按编辑器语法渲染，所见即所得 -->
                <div
                  v-if="draftView(msg) === 'preview'"
                  class="material-preview max-h-[46vh] overflow-y-auto px-3 py-3 text-[15px] text-[var(--text-secondary,#666)]"
                  v-html="renderedHtml[msg.id] || ''"
                ></div>
                <!-- 源码：可直接改两笔再插入 -->
                <textarea
                  v-else
                  :value="msg.material"
                  rows="10"
                  spellcheck="false"
                  class="block max-h-[46vh] min-h-[160px] w-full resize-y overflow-y-auto border-0 bg-transparent px-3 py-2 font-mono text-[12px] leading-relaxed text-[#1a1a1a] outline-none dark:text-[#e5e5e5]"
                  @input="onCodeEdit(msg.id, ($event.target as HTMLTextAreaElement).value)"
                ></textarea>

                <!-- 提醒 -->
                <div
                  v-if="msg.warnings && msg.warnings.length > 0"
                  class="border-t border-[#fdf0d5] bg-[#fffbf0] px-3 py-2 dark:border-[#4a3c1a] dark:bg-[#2a2416]"
                >
                  <p class="mb-1 text-[12px] font-medium text-[#b7791f]">提醒（不影响插入）</p>
                  <ul class="list-disc pl-4 text-[11px] leading-relaxed text-[#8a6d3b]">
                    <li v-for="(w, i) in msg.warnings" :key="i">{{ w }}</li>
                  </ul>
                </div>

                <!--
                  操作行：放在这版素材的**最下面**。
                  放卡片顶部时会与上一条回复贴在一起，用户很容易把它当成上一条的操作，
                  点「插入」就会以为插进去的是上一版。
                -->
                <div
                  class="flex flex-wrap items-center gap-1 border-t border-[#f0f0f0] bg-[#fcfcfc] px-3 py-2 dark:border-[#333] dark:bg-[#232323]"
                >
                  <button
                    class="flex cursor-pointer items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                    :disabled="generating"
                    @click="onCopy(msg)"
                  >
                    <Check v-if="copiedId === msg.id" :size="12" class="text-[var(--accent)]" />
                    {{ copiedId === msg.id ? '已复制' : '复制' }}
                  </button>
                  <button
                    class="cursor-pointer rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                    :disabled="generating"
                    @click="onRegenerate(msg)"
                  >
                    重新生成
                  </button>
                  <div class="ml-auto flex flex-wrap items-center justify-end gap-1">
                    <button
                      class="flex cursor-pointer items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[#c0392b] hover:text-[#c0392b] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                      :disabled="generating"
                      @click="onReplace(msg)"
                    >
                      清空再插入
                    </button>
                    <button
                      class="cursor-pointer rounded-md border-0 px-2.5 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      :style="{ backgroundColor: colors.accent }"
                      :disabled="generating"
                      @click="onInsert(msg)"
                    >
                      插入到编辑器
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- 流式输出中 -->
            <div
              v-if="generating"
              class="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
            >
              <div
                class="flex items-center gap-2 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
              >
                <Loader2 :size="13" class="animate-spin text-[var(--accent)]" />
                <span class="text-[12px] text-[#666] dark:text-[#999]">{{
                  retrying
                    ? retryCount > 1
                      ? '还是不对，再按编辑器语法重写一次…'
                      : '格式不对，正在按编辑器语法重写…'
                    : '生成中…'
                }}</span>
                <span class="text-[11px] text-[#999] dark:text-[#666]">{{ elapsedSec }}s</span>
              </div>
              <pre
                class="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-[#333] dark:text-[#ccc]"
                >{{ streamingText }}</pre
              >
            </div>
          </div>
        </div>
      </template>

      <!-- 错误 / 提示 -->
      <div
        v-if="errorMsg"
        class="mx-3 mb-2 shrink-0 rounded-lg border border-[#fde2e2] bg-[#fef5f5] px-3 py-2 text-[12px] text-[#c0392b] dark:border-[#5a2a2a] dark:bg-[#2a1a1a]"
      >
        {{ errorMsg }}
      </div>
      <div
        v-if="notice"
        class="mx-3 mb-2 shrink-0 rounded-lg border border-[#fdf0d5] bg-[#fffbf0] px-3 py-2 text-[12px] text-[#b7791f] dark:border-[#4a3c1a] dark:bg-[#2a2416]"
      >
        {{ notice }}
      </div>
    </div>

    <!--
      页脚 = 固定输入区。
      BaseDrawer 的 footer 是 flex shrink-0 justify-end gap-3 border-t px-5 py-3，
      这里用单个 w-full 子元素承载两行（justify-end 对唯一子元素无影响）。
    -->
    <template #footer>
      <div class="flex w-full flex-col gap-2">
        <!--
          模型后面的说明文字已挪进空态（用户要求「模型后面的提示放到没有内容的时候的提示里面」）。
          这里只有模型下拉——插入动作一律在各版素材卡底部，页脚不再留快捷插入。
        -->
        <div v-if="modelOptions.length > 1" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <!-- 模型：只在设置页勾了多个时才出现，只有一个模型时显示下拉没有意义 -->
          <label class="flex items-center gap-1.5">
            <span class="shrink-0 text-[11px] text-[#999] dark:text-[#666]">模型</span>
            <select
              v-model="materialModel"
              class="cursor-pointer appearance-none rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] outline-none transition-colors focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              :disabled="generating"
            >
              <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>
        </div>

        <!-- 输入行 -->
        <div class="relative flex items-end gap-2">
          <!--
            / 快捷插入浮层：贴在输入框上沿之上（bottom-full），不挤占输入框高度。
            用 absolute + z-10，滚动区里也能盖住内容。
          -->
          <div
            v-if="slashOpen"
            class="absolute bottom-full left-0 z-20 mb-1 max-h-[220px] w-full max-w-[420px] overflow-y-auto rounded-lg border border-[#e5e5e5] bg-white py-1 shadow-[0_6px_20px_rgba(0,0,0,0.10)] scrollbar-thin dark:border-[#444] dark:bg-[#2a2a2a]"
          >
            <div class="px-3 py-1 text-[11px] text-[#bbb] dark:text-[#555]">
              选一个组件插入，↑↓ 选择 · Enter 确认 · Esc 关闭
            </div>
            <button
              v-for="(cmd, i) in slashCommands"
              :key="cmd.tag"
              class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors"
              :class="
                i === slashIndex
                  ? 'bg-[var(--accent-light)]'
                  : 'hover:bg-[#f7f7f7] dark:hover:bg-[#333]'
              "
              @mousedown.prevent
              @click="chooseCommand(cmd)"
              @mouseenter="slashIndex = i"
            >
              <span class="shrink-0 font-mono text-[12px] text-[var(--accent)]"
                >&lt;{{ cmd.tag }}&gt;</span
              >
              <span class="shrink-0 text-[12px] text-[#333] dark:text-[#ccc]">{{ cmd.name }}</span>
              <span class="ml-auto truncate text-[11px] text-[#bbb] dark:text-[#555]">{{
                cmd.hint
              }}</span>
            </button>
          </div>
          <div class="relative min-w-0 flex-1">
            <textarea
              ref="inputRef"
              v-model="input"
              rows="1"
              :disabled="generating || expired || !configured"
              :placeholder="
                expired
                  ? '会话已过期，请点「新建会话」继续'
                  : hasMessages
                    ? '接着说怎么改，比如：第二张卡片换成蓝色、标题再短一点；打 / 插入组件名'
                    : '说出你要的素材，例如：做一个三步操作流程，讲怎么把公众号文章导出成 PDF；打 / 插入组件名'
              "
              class="block w-full resize-none rounded-lg border border-[#e5e5e5] bg-white py-2 pl-3 pr-11 text-[13px] leading-[22px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[#fafafa] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555] dark:disabled:bg-[#222]"
              @input="onInputChange"
              @click="refreshSlashMenu"
              @keyup="refreshSlashMenu"
              @keydown="onInputKeydown"
            />
            <!--
              发送 / 停止按钮贴在输入框右下角，用图标不用文字（用户要求「放到输入框右下角，
              类似 DSH 的发送，直接使用图标」）。textarea 的 pr-11 就是给它让的位置——
              没有那段右内边距，文字会压到图标底下，长句看起来像被截断。
            -->
            <button
              v-if="generating"
              class="absolute right-1.5 bottom-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#e5e5e5] bg-white text-[#666] transition-colors hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:bg-[#333]"
              title="停止生成"
              @click="onStop"
            >
              <Square :size="11" fill="currentColor" />
            </button>
            <button
              v-else
              class="absolute right-1.5 bottom-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              :style="{ backgroundColor: colors.accent }"
              :disabled="!configured || !input.trim() || expired"
              title="发送（Enter）"
              @click="onSend"
            >
              <ArrowUp :size="15" :stroke-width="2.5" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </BaseDrawer>

  <!--
    素材说明浮层：卡片外壳有 overflow-hidden，浮层放进去会被裁掉，
    所以 Teleport 到 body 并用悬停那一刻算出的 fixed 坐标定位。
    鼠标从问号移进浮层时不能关，两个元素各自管自己的 leave。
  -->
  <Teleport to="body">
    <div
      v-if="hintOpenId"
      class="pointer-events-auto fixed z-[70] rounded-lg border border-[#e5e5e5] bg-white p-2.5 text-[11px] leading-relaxed text-[#666] shadow-[0_6px_20px_rgba(0,0,0,0.10)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
      :style="{ left: `${hintPos.left}px`, top: `${hintPos.top}px`, width: `${hintWidth}px` }"
      @mouseenter="cancelHintClose"
      @mouseleave="scheduleHintClose"
    >
      <p>生成的素材不一定在微信编辑器里正确显示，插入后请自行预览、按需调整。</p>
      <p class="mt-1.5">
        可复用的素材可以点「清空编辑器再插入」，再点顶部的「保存素材」存进素材库。
      </p>
    </div>
  </Teleport>

  <!-- 新建会话确认 -->
  <ConfirmDialog
    v-model:visible="newSessionVisible"
    title="新建会话"
    message="新建会话会清空当前会话的全部对话与素材，确定继续吗？"
    cancel-text="取消"
    confirm-text="新建会话"
    @confirm="doNewSession"
    @cancel="newSessionVisible = false"
  />

  <!-- 清空编辑器再插入 -->
  <ConfirmDialog
    v-model:visible="replaceConfirmVisible"
    title="清空编辑器再插入"
    :message="replaceMessage"
    cancel-text="取消"
    confirm-text="清空并插入"
    confirm-type="danger"
    @confirm="doReplace"
    @cancel="replaceConfirmVisible = false"
  />
</template>

<style scoped>
/*
 * 行高只能给容器，不能落在 span 上。
 *
 * 组件内部大量用「大号装饰数字 + 负 margin-top 顶回去」的排版（`<p-title>` 的
 * 60px 序号 + 标题 -60px 上移），它自己给 <strong> 写了 line-height:1；
 * 一旦这里用 `.material-preview :deep(span) { line-height: 1.8 }`，
 * 号数那个 span 会被撑成 108px 高，标题被顶到 114px，序号和标题叠在一起。
 * 容器级 line-height 只作默认值，组件自己的 inline 行高照样生效，与编辑器预览一致。
 * 字号也跟右侧预览对齐成 15px，否则同一段素材在两处看到的正文大小不一样。
 */
.material-preview {
  line-height: 1.8;
}
</style>
