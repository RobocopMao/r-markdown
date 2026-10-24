<script setup lang="ts">
/**
 * AI 写作面板（对话模式）。
 *
 * 职责边界：只负责「对话 + 出稿 + 应用到编辑器」，图片与排版各走各自的面板。
 *
 * 三个关键设计：
 * 1. **对话模式**：第一条用户消息就是素材，模型素材不够会先追问，聊够了再出稿。
 *    因此不存在「表单 → 生成」那种单向流程，一切都在消息流里。
 * 2. **输入框固定在抽屉底部**：用 BaseDrawer 的 #footer 插槽（天然 shrink-0 + border-t），
 *    不随对话流滚动，长对话时也能随时输入。
 * 3. **单会话 + 24 小时绝对有效期**：会话存 IndexedDB，到期或「新建会话」即清空。
 *
 * 稿件不另设数据结构：它就是一条 assistant 消息（kind='draft' + article），
 * 所以历次稿件天然留在对话里，可回看、可应用旧稿。
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Loader2,
  Feather,
  Settings2,
  FileText,
  FolderOpen,
  Sparkles,
  RefreshCw,
} from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import BaseCheckbox from '@/components/BaseCheckbox.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useTheme } from '@/composables/useTheme'
import { useIsMobileWeb } from '@/composables/useIsMobile'
import { useSessionCountdown } from '@/composables/useSessionCountdown'
import { getSetting, setSetting } from '@/config/settings'
import { getErrorMessage } from '@/utils/helpers'
import { undoShortcutLabel } from '@/utils/platform'
import { countChars } from '@/utils/charCount'
import { parseMarkdownAsync, type ParagraphStyle } from '@/utils/markdownParser'
import { paraFontSize, paraFontWeight, paraIndent } from '@/composables/useParagraphSettings'
import {
  buildReviseUserMessage,
  buildSelfCheckUserMessage,
  buildWriteSystemPrompt,
  buildWriteUserMessage,
  classifyAssistantTurn,
  extractSelfCheck,
  loadReferenceText,
  loadSkillText,
  normalizeArchetype,
  normalizeLength,
  stripMarkers,
  WRITE_ARCHETYPES,
  WRITE_LENGTHS,
  type WriteArchetype,
  type WriteLength,
} from '@/utils/aiWritePrompt'
import {
  appendMessage,
  createSession,
  isExpired,
  newId,
  normalizeSession,
  renewSession,
  replaceMessage,
  toHistory,
  type WriteMessage,
  type WriteSession,
} from '@/utils/aiWriteSession'
import {
  isWriteConfigured,
  missingWriteConfigFields,
  resolveWriteConfig,
  runWrite,
} from '@/services/aiWrite'
import { listTextModels } from '@/services/aiFormat'
import { clearSession, loadSession, saveSession } from '@/services/aiWriteSessionStore'
import { pickDocumentFile } from '../composables/useImport'
import type { ChatMessage } from '@/services/aiFormat'

const props = defineProps<{
  visible: boolean
  /** 编辑器当前内容（「用当前文档」把内容填进输入框，以及应用前比对用） */
  markdown: string
}>()

const emit = defineEmits<{
  close: []
  /** 用户确认应用稿件：替换编辑器内容 */
  apply: [text: string]
  /** 跳转设置（落到「AI 设置 → AI 文本」子页） */
  openSettings: []
}>()

const { colors } = useTheme()
const isMobileWeb = useIsMobileWeb()

/** 应用前的撤销提示；移动端没有物理键盘，省略这半句 */
const undoHint = computed(() => (isMobileWeb.value ? '' : `，可用 ${undoShortcutLabel()} 撤销`))

// ── 会话 ──
const session = ref<WriteSession | null>(null)
/** 面板打开时编辑器的内容快照，用于「应用前内容已变」的二次确认 */
let editorSnapshot = ''

/** 保留倒计时（用写作面板自己的保留时长设置项） */
const { now, remainingText, currentHours, startTicker, stopTicker, syncText } =
  useSessionCountdown('aiWriteSessionHours')

/** 会话是否已过期（倒计时归零时转为 true，输入与发送随之禁用） */
const expired = computed(() => {
  const s = session.value
  return !s || isExpired(s, now.value)
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

async function ensureSession() {
  const hours = currentHours()
  const raw = await loadSession()
  const restored = normalizeSession(raw, Date.now(), hours)
  if (restored) {
    session.value = restored
  } else {
    // raw 存在但被判定不可用 → 上一会话已过期，明确告诉用户为什么清空了
    if (raw) showNotice('上一会话已超过有效期，已为你开启新会话')
    session.value = createSession(Date.now(), hours)
    await persist()
  }
  now.value = Date.now()
  syncText(session.value.expiresAt)
}

/** 落盘；失败时只提示、不中断（会话降级为内存态，功能仍可用） */
/**
 * 发起请求前续期：把 expiresAt 推到「现在 + 保留时长」并落盘。
 *
 * 这就是「按最后一次请求开始算」的落点——用户每发一次请求，倒计时就回满。
 * 只在新请求开始时调用一次（三个入口：对话、自检、改稿），不在流式过程中反复续期。
 */
async function renewOnRequest() {
  const s = session.value
  if (!s) return
  session.value = renewSession(s, Date.now(), currentHours())
  now.value = Date.now()
  syncText(session.value.expiresAt)
  await persist()
}

async function persist() {
  const s = session.value
  if (!s) return
  try {
    await saveSession(s)
  } catch {
    showNotice('会话未能保存到本地，关闭面板后本次对话会丢失')
  }
}

const newSessionVisible = ref(false)

function onNewSession() {
  newSessionVisible.value = true
}

/**
 * 清空当前会话并开一个新的：点「新建会话」确认后走这里。
 * 新会话的保留时长从此刻开始算。
 */
async function doNewSession() {
  newSessionVisible.value = false
  abort()
  await clearSession()
  const hours = currentHours()
  session.value = createSession(Date.now(), hours)
  now.value = Date.now()
  syncText(session.value.expiresAt)
  streamRaw.value = ''
  renderedHtml.value = {}
  errorMsg.value = ''
  input.value = ''
  await persist()
  await nextTick()
  focusInput()
}

// ── 配置 ──
/**
 * 本次使用的模型。
 *
 * 选项来自设置页「AI 文本」勾选的常用模型清单。面板里只列具体模型、不提供
 * 「默认」这种伪选项，所以这里的值始终是一个真实模型名。
 * 没有单独的「默认模型」设置：**清单首项即默认**，没在面板选过时就用它。
 * 写作与排版各存一份（aiWriteModel / aiFormatModel），因为它们常挑不同的模型：
 * 写作要发散、排版要稳定，共用一个的话每次切换都得回设置页改。
 */
const model = ref(getSetting<string>('aiWriteModel') || '')
/** 可选模型清单；只有一项时不渲染下拉 */
const modelOptions = ref(listTextModels())
// 没记录过（或记录的不在清单里）时落到清单首项，保证下拉显示的值
// 就是请求里真正发出去的那个。
if (!modelOptions.value.includes(model.value)) model.value = modelOptions.value[0] || ''

function refreshModelOptions() {
  modelOptions.value = listTextModels()
  // 当前值失效（设置页把它从清单里删了、或整份清单换了）时落到首项，
  // 而不是留空——空值配上没有空选项的 select，会显示清单首项却发另一条出去。
  if (!modelOptions.value.includes(model.value)) model.value = modelOptions.value[0] || ''
}

watch(model, (v) => setSetting('aiWriteModel', v, true))

const configured = ref(isWriteConfigured(model.value))
const configMissing = ref('')

function refreshConfig() {
  // 传当前选中值而不是让它去读 aiWriteModel：watch 落盘是异步的，
  // 刚在面板换完模型就点生成时，设置里可能还是上一条。
  configured.value = isWriteConfigured(model.value)
  const missing = missingWriteConfigFields(model.value)
  configMissing.value = missing.length > 0 ? missing.join('、') : ''
}

function onSettingChanged(e: Event) {
  const key = (e as CustomEvent).detail?.key
  // 写作与排版共用接口地址 / Key / 模型名（「AI 文本」子页），任一项变了都要重新判定是否可用
  if (key === 'aiBaseUrl' || key === 'aiApiKey' || key === 'aiModel' || key === 'aiModels') {
    // 先刷清单再判配置：清单变了可能把 model 挪到新的首项，
    // 反过来会让 refreshConfig 拿旧模型去判定。
    refreshModelOptions()
    refreshConfig()
  }
}

const archetype = ref<WriteArchetype>(normalizeArchetype(getSetting<string>('aiWriteArchetype')))
const length = ref<WriteLength>(normalizeLength(getSetting<string>('aiWriteLength')))
/**
 * 卡兹克写作技能（默认开启）。
 *
 * 一个开关管三件事，因为它们本来就是同一套技能的组成部分：
 * 1. 载入技能本体 `src/data/ai/khazix/SKILL.md`；
 * 2. 连参考资料一起载入（同目录 `references/`，约 +6900 tokens）；
 * 3. 出稿后按技能第四节「四层自检体系」再跑一次质检。
 *
 * 关掉即整篇技能都不进 prompt，模型自由发挥（输出格式约定仍保留）。
 */
const useSkill = ref(getSetting<boolean>('aiWriteUseSkill') !== false)

watch(archetype, (v) => setSetting('aiWriteArchetype', v, true))
watch(length, (v) => setSetting('aiWriteLength', v, true))
watch(useSkill, (v) => setSetting('aiWriteUseSkill', v, true))

/** 技能全文与参考资料按需加载并缓存（模块级 Promise，多个面板实例共享） */
let skillPromise: Promise<string> | null = null
function getSkill(): Promise<string> {
  if (!skillPromise) skillPromise = loadSkillText()
  return skillPromise
}
let refsPromise: Promise<string> | null = null
function getRefs(): Promise<string> {
  if (!refsPromise) refsPromise = loadReferenceText()
  return refsPromise
}

async function buildSystem(): Promise<string> {
  // 关掉技能时两者都不进 prompt：技能本体与参考资料同属一套技能，不拆开
  const [skill, references] = useSkill.value ? await Promise.all([getSkill(), getRefs()]) : ['', '']
  return buildWriteSystemPrompt({
    skill,
    references,
    archetype: archetype.value,
    length: length.value,
    extraInstruction: getSetting<string>('aiWriteExtraInstruction') || '',
  })
}

// ── 对话 ──
const input = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

const generating = ref(false)
/**
 * 四层自检进行中。
 *
 * 自检是在出稿之后紧接着跑的，此时 generating 仍为 true（它包着整个 runTurn），
 * 所以输入区本来就是禁用的、不会有并发请求。这个标记只用来区分「正在写字」与「正在质检」，
 * 避免自检期间在稿件卡下面多出一个空的「写作中」流式框。
 */
const selfChecking = ref(false)
/** 当前轮次的流式原始文本（含标记）；展示时经 stripMarkers 处理 */
const streamRaw = ref('')
const elapsedSec = ref(0)
const errorMsg = ref('')

let controller: AbortController | null = null
let timer: ReturnType<typeof setInterval> | null = null

function abort() {
  controller?.abort()
  controller = null
  generating.value = false
  stopElapsed()
}

function stopElapsed() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const messages = computed(() => session.value?.messages ?? [])
const hasMessages = computed(() => messages.value.length > 0)

// ── Markdown 渲染（只在稿件完成时算一次，结果按消息 id 缓存） ──
const renderedHtml = ref<Record<string, string>>({})

/**
 * 稿件预览的行高与段间距——**固定值，不跟「设置 → 段落格式」走**。
 *
 * 为什么不复用那两个设置：它们服务的是「成稿在编辑器里的最终观感」，
 * 按公众号排版的习惯偏松（行高默认 1.85、段间距默认 24）。但 AI 回复区是
 * **一屏里连续读**的对话流，松排版会让同屏能读到的内容变少、视线跳跃变多。
 * 两者诉求不同，所以这里定死。
 *
 * 曾经的做法是「用户行高 − 0.35」（下限 1.2），但那样 AI 回复的松紧会随设置漂移，
 * 打开面板前得先知道自己在设置里调过什么，不直观。
 *
 * 字号仍不在这里收：标题、列表、引用、代码的字号都写死在解析器里（段落才走这段设置），
 * 只有整体缩放才能把它们一起缩小，所以字号交给 CSS 里 `.ai-write-preview` 的 zoom。
 *
 * 两个值的口径不同，别混：行高是**倍数**（相对字号），段间距是**像素**。
 */
const PREVIEW_LINE_HEIGHT = 1.4
/** 段间距（px）：与 1.4 行高配合，段落之间留出清晰但不松垮的间距 */
const PREVIEW_PARAGRAPH_MARGIN = 18

function paragraphStyle(): ParagraphStyle {
  return {
    fontSize: paraFontSize.value,
    lineHeight: PREVIEW_LINE_HEIGHT,
    fontWeight: paraFontWeight.value,
    margin: PREVIEW_PARAGRAPH_MARGIN,
    indent: paraIndent.value,
  }
}

async function renderDraft(msg: WriteMessage) {
  if (!msg.article || renderedHtml.value[msg.id]) return
  try {
    const html = await parseMarkdownAsync(msg.article, colors.value, paragraphStyle())
    renderedHtml.value = { ...renderedHtml.value, [msg.id]: html }
  } catch {
    // 渲染失败时退回纯文本展示（模板里用 article 兜底）
  }
}

/**
 * 缓存的失效键。
 *
 * 除了稿件本身，还必须带上段落设置：预览用的行距是被改过的（见 paragraphStyle），
 * 用户在设置里调字号 / 行距后返回面板，若只按稿件长度做键就会一直吃旧缓存，
 * 看到的是上一套排版。
 */
function renderKey(): string {
  const ps = paragraphStyle()
  return `${ps.fontSize}|${ps.lineHeight}|${ps.fontWeight}|${ps.margin}|${ps.indent}`
}

/** 稿件列表变化：只为还没有 HTML 的稿子补渲染，已有缓存不动（新消息不该让旧稿重排一遍） */
watch(
  () => messages.value.map((m) => `${m.id}:${m.article ? m.article.length : 0}`).join('|'),
  () => {
    for (const m of messages.value) {
      if (m.role === 'assistant' && m.kind === 'draft' && m.article) void renderDraft(m)
    }
  },
  { immediate: true },
)

/** 段落设置变化：所有缓存的 HTML 都用旧排版算的，整体作废重渲染 */
watch(renderKey, () => {
  renderedHtml.value = {}
  for (const m of messages.value) {
    if (m.role === 'assistant' && m.kind === 'draft' && m.article) void renderDraft(m)
  }
})

// ── 自动滚动：用户上滑回看时不打断 ──
const stickToBottom = ref(true)

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
 * 打开面板时不是「设一次 scrollTop」就够的：正文异步渲染、输入框自动增高（1→N 行）
 * 都会改变可滚动区域，晚一拍落下的 reflow 会让上次设的值作废，表现就是「差一点点没到底」。
 * 这里在若干帧内反复重设，任何原因导致的高度变化都会被最后几帧兜住。
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
 * 内容或可滚动区域变化时贴住底部。
 *
 * 单靠 scrollToBottom() 是不够的：它只在调用那一刻量一次高度，而
 * 1. 稿件正文里的 Markdown 是**异步**渲染的（renderDraft → parseMarkdownAsync）；
 * 2. 输入框自动增高会改变滚动容器的 clientHeight；
 * 两者都会让刚设好的 scrollTop 落在半空——表现就是「打开面板没滚到最底」。
 * 图片加载、展开自检报告同理。
 *
 * 所以两处都要盯：contentRef（内容长高）与 scrollRef（容器变矮）。
 */
const contentRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
let contentObserver: ResizeObserver | null = null

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
watch(streamRaw, () => {
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

// ── 输入框 ──
/** 单行高度（与 textarea 的 leading-[22px] 对应） */
const INPUT_LINE_HEIGHT = 22
/** 上下内边距合计（py-2 = 8px × 2），与 textarea 的 class 对应 */
const INPUT_PADDING_Y = 16
/** 原始高度：1–6 行 */
const INPUT_BASE_MIN = INPUT_LINE_HEIGHT + INPUT_PADDING_Y
const INPUT_BASE_MAX = INPUT_LINE_HEIGHT * 6 + INPUT_PADDING_Y
/**
 * 整体高度倍率。
 *
 * 用户要求输入框比原来高一倍，所以最小/最大高度都按 2 倍（38→76px、148→296px）。
 * 这里不改成「行数翻倍」——那样最小高度只有 60px（含内边距不足 2 倍），
 * 与「两倍高」对不上；直接用倍率乘高度最直白，日后想再调也只改这一个数。
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

/**
 * 回车发送、Shift+回车换行。
 * isComposing 用来挡住中文输入法组词期间的回车（keyCode 229 是旧内核的兜底写法）。
 */
function onInputKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  void onSend()
}

/** 空态 chip：把内容填进输入框（不直接发送，用户可再删改补充） */
function fillInput(text: string) {
  input.value = input.value.trim() ? `${input.value.trim()}\n\n${text}` : text
  void nextTick(() => {
    autoGrow()
    focusInput()
  })
}

function useCurrentDoc() {
  const doc = props.markdown.trim()
  if (!doc) {
    showNotice('编辑器当前没有内容')
    return
  }
  fillInput(doc)
}

async function useFile() {
  try {
    const picked = await pickDocumentFile()
    if (!picked) return
    fillInput(picked.text)
    showNotice(`已读入 ${picked.name}`)
  } catch (e: unknown) {
    errorMsg.value = getErrorMessage(e, '读取文件失败')
  }
}

const EXPERIENCE_TEMPLATE = [
  '我的经历与核心观点：',
  '',
  '1. 我实际做过/遇到的事（越具体越好，比如「花了 499 找人上门装」）：',
  '2. 我踩过的坑、让我意外的地方：',
  '3. 我最想表达的那个判断：',
].join('\n')

// ── 发送 ──
async function onSend() {
  const text = input.value.trim()
  if (!text || generating.value || expired.value || !configured.value) return
  input.value = ''
  void nextTick(autoGrow)
  stickToBottom.value = true

  const userMsg: WriteMessage = {
    id: newId(),
    role: 'user',
    content: text,
    at: Date.now(),
  }
  session.value = appendMessage(session.value!, userMsg)
  void scrollToBottom(true)

  await runTurn()
}

/**
 * 跑一轮 assistant 回复。
 *
 * 历史用 toHistory() 组装（assistant 取稿件正文而非带标记的原文）。
 * 用户消息统一经 buildWriteUserMessage() 包一层 <用户消息> 标签：
 * 素材本身可能包含看起来像指令或像 system 的内容（比如粘贴进来的一整篇带 frontmatter 的文章），
 * 包一层边界能让模型分清「这是用户给的材料」而不是「新的规则」。
 */
async function runTurn() {
  const s = session.value
  if (!s) return

  await renewOnRequest()
  errorMsg.value = ''
  streamRaw.value = ''
  generating.value = true
  const startedAt = Date.now()
  elapsedSec.value = 0
  stopElapsed()
  timer = setInterval(() => {
    elapsedSec.value = Math.round((Date.now() - startedAt) / 1000)
  }, 500)

  controller = new AbortController()
  try {
    const system = await buildSystem()
    const history: ChatMessage[] = toHistory(s).map((m) =>
      m.role === 'user' ? { role: 'user' as const, content: buildWriteUserMessage(m.content) } : m,
    )
    const { text, finishReason } = await runWrite(
      resolveWriteConfig(model.value),
      [{ role: 'system', content: system }, ...history],
      {
        signal: controller.signal,
        onDelta: (d) => {
          streamRaw.value += d
        },
      },
    )
    await commitAssistantTurn(text, finishReason)
  } catch (e: unknown) {
    if (isAbort(e)) return
    errorMsg.value = getErrorMessage(e, '写作失败')
  } finally {
    generating.value = false
    controller = null
    stopElapsed()
  }
}

/** 把一轮模型输出分类、落库、按需触发自检 */
async function commitAssistantTurn(raw: string, finishReason: string) {
  const classified = classifyAssistantTurn(raw)
  const msg: WriteMessage = {
    id: newId(),
    role: 'assistant',
    content: classified.content,
    kind: classified.kind,
    article: classified.kind === 'draft' ? classified.article : undefined,
    at: Date.now(),
  }
  session.value = appendMessage(session.value!, msg)
  streamRaw.value = ''
  await persist()
  await scrollToBottom(true)

  if (finishReason === 'length') {
    errorMsg.value =
      '输出达到最大长度上限，稿件可能不完整；可在「设置 → AI 设置 → AI 文本 → AI 写作」调大「最大输出」后重新生成'
  }

  // 启用技能且这一轮确实是出稿 → 按技能第四节的四层自检体系自动追一次质检
  if (classified.kind === 'draft' && useSkill.value) {
    await runSelfCheck(msg.id, classified.article)
  }
}

/** 四层自检：只出报告，不改稿；报告回填到产生它的那条稿件消息上 */
async function runSelfCheck(messageId: string, article: string) {
  const s = session.value
  if (!s) return
  session.value = replaceMessage(s, messageId, { reportStatus: 'running' })
  await renewOnRequest()

  selfChecking.value = true
  const ctrl = new AbortController()
  const prev = controller
  controller = ctrl
  try {
    const system = await buildSystem()
    const { text } = await runWrite(
      resolveWriteConfig(model.value),
      [
        { role: 'system', content: system },
        { role: 'user', content: buildSelfCheckUserMessage(article) },
      ],
      { signal: ctrl.signal },
    )
    const report = extractSelfCheck(text)
    session.value = replaceMessage(session.value!, messageId, {
      report: report || '（自检未返回内容）',
      reportStatus: 'done',
    })
  } catch (e: unknown) {
    if (isAbort(e)) {
      session.value = replaceMessage(session.value!, messageId, { reportStatus: 'failed' })
    } else {
      session.value = replaceMessage(session.value!, messageId, {
        report: getErrorMessage(e, '自检失败'),
        reportStatus: 'failed',
      })
    }
  } finally {
    controller = prev
    selfChecking.value = false
    await persist()
  }
}

/** 手动重试自检（自检失败时出现） */
async function retrySelfCheck(msg: WriteMessage) {
  if (!msg.article || generating.value) return
  await runSelfCheck(msg.id, msg.article)
}

// ── 稿件操作 ──
/**
 * 待二次确认的应用目标。
 *
 * 存 **id 而不是消息对象**：确认弹窗弹出后用户可能又点了「重新生成」或继续对话，
 * 那时这条消息在 session 里的内容已经被替换/移除，拿着旧对象去 apply 会写进过期正文。
 * 确认时按 id 回到当前 session 里重新取一次，取到哪一版就应用哪一版。
 */
const pendingApplyId = ref('')
const confirmApplyVisible = ref(false)

/** 按 id 取当前最新的那条稿件消息（找不到返回 null，避免用陈旧对象兜底） */
function currentDraft(id: string): WriteMessage | null {
  return session.value?.messages.find((m) => m.id === id) ?? null
}

function onApply(msg: WriteMessage) {
  if (!msg.article) return
  // 编辑器被改过才需要确认；空编辑器直接覆盖（没什么可丢的）
  if (props.markdown.trim() && props.markdown.trim() !== editorSnapshot) {
    pendingApplyId.value = msg.id
    confirmApplyVisible.value = true
    return
  }
  doApply(msg.id)
}

function doApply(id: string) {
  confirmApplyVisible.value = false
  pendingApplyId.value = ''
  // 以 id 为准回查：即使入参是旧对象，也只会应用当前 session 里这一条的最新正文
  const msg = currentDraft(id)
  if (!msg?.article) return
  emit('apply', msg.article)
}

function onConfirmApply() {
  const id = pendingApplyId.value
  if (id) doApply(id)
  else confirmApplyVisible.value = false
}

/**
 * 重新生成：把这条稿件之前的历史重跑一遍。
 *
 * 不能直接 runTurn()——那样历史会以一条 assistant 消息结尾，模型会「接着自己往下写」。
 * 正确做法是丢掉这条稿件及其之后的全部消息，让历史重新以用户消息结尾，再发一次请求。
 */
async function onRegenerate(msg: WriteMessage) {
  const s = session.value
  if (!s || generating.value) return
  const idx = s.messages.findIndex((m) => m.id === msg.id)
  if (idx < 0) return
  session.value = { ...s, messages: s.messages.slice(0, idx) }
  await persist()
  streamRaw.value = ''
  await runTurn()
}

/** 按自检意见改稿：报告与正文都显式写进请求，不依赖历史里是否还留着它们 */
async function onRevise(msg: WriteMessage) {
  if (!msg.article || !msg.report || generating.value) return
  const userMsg: WriteMessage = {
    id: newId(),
    role: 'user',
    content: '请按上面那份自检报告改稿，输出改好之后的完整正文。',
    at: Date.now(),
  }
  session.value = appendMessage(session.value!, userMsg)
  await renewOnRequest()
  await scrollToBottom(true)

  errorMsg.value = ''
  streamRaw.value = ''
  generating.value = true
  const startedAt = Date.now()
  elapsedSec.value = 0
  stopElapsed()
  timer = setInterval(() => {
    elapsedSec.value = Math.round((Date.now() - startedAt) / 1000)
  }, 500)

  controller = new AbortController()
  try {
    const system = await buildSystem()
    const { text, finishReason } = await runWrite(
      resolveWriteConfig(model.value),
      [
        { role: 'system', content: system },
        { role: 'user', content: buildReviseUserMessage(msg.report, msg.article) },
      ],
      {
        signal: controller.signal,
        onDelta: (d) => {
          streamRaw.value += d
        },
      },
    )
    await commitAssistantTurn(text, finishReason)
  } catch (e: unknown) {
    if (isAbort(e)) return
    errorMsg.value = getErrorMessage(e, '改稿失败')
  } finally {
    generating.value = false
    controller = null
    stopElapsed()
  }
}

function isAbort(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'AbortError'
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('abort') || msg.includes('中止')
}

// ── 消息展示辅助 ──
function displayStream(): string {
  return stripMarkers(streamRaw.value)
}

function draftStats(article: string) {
  return countChars(article)
}

/** 报告是否展开（默认收起，长报告不占地方） */
const expandedReports = ref<Record<string, boolean>>({})
function toggleReport(id: string) {
  expandedReports.value = { ...expandedReports.value, [id]: !expandedReports.value[id] }
}

// ── 生命周期 ──
watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      // 关闭时中止在途请求（已完成轮次与稿件保留），并停掉倒计时
      abort()
      stopTicker()
      return
    }
    editorSnapshot = props.markdown.trim()
    errorMsg.value = ''
    refreshConfig()
    refreshModelOptions()
    // 参数可能被设置页或其他窗口改过，重新读一遍（本面板的勾选要与设置保持一致）
    archetype.value = normalizeArchetype(getSetting<string>('aiWriteArchetype'))
    length.value = normalizeLength(getSetting<string>('aiWriteLength'))
    useSkill.value = getSetting<boolean>('aiWriteUseSkill') !== false
    await ensureSession()
    startTicker(() => session.value?.expiresAt ?? null)
    // 先让输入框恢复正确高度：它会影响滚动容器的高度，反过来影响「底部」在哪
    await nextTick()
    autoGrow()
    // 打开面板一律回到最新一轮（pinToBottom 里会重置 stickToBottom，
    // 否则用户上次上滑过就一直贴着旧位置）
    pinToBottom()
    if (configured.value) focusInput()
  },
)

onMounted(() => {
  window.addEventListener('setting-changed', onSettingChanged)
  window.addEventListener('setting-changed', onSkillChanged)
})

onBeforeUnmount(() => {
  abort()
  stopTicker()
  if (noticeTimer) clearTimeout(noticeTimer)
  window.removeEventListener('setting-changed', onSettingChanged)
  window.removeEventListener('setting-changed', onSkillChanged)
})

/**
 * 「卡兹克写作技能」开关变了要同步本地勾选。
 *
 * 开关就在本面板里，但设置页/其他窗口写入时也会派发事件，
 * 不跟上的话面板显示的选择会与实际拼进 prompt 的值不一致。
 */
function onSkillChanged(e: Event) {
  if ((e as CustomEvent).detail?.key !== 'aiWriteUseSkill') return
  const v = getSetting<boolean>('aiWriteUseSkill') !== false
  if (v !== useSkill.value) useSkill.value = v
}
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="AI 写作"
    width="min(95vw, 1000px)"
    :show-footer="configured"
    no-body-padding
    @close="emit('close')"
  >
    <!--
      头部：会话剩余时间 / 模型 / 新建会话。
      - 整体跟着 configured：没配接口就没有会话、没有模型可言，显示出来只会是
        「会话剩余 undefined」「未设置模型」这类无效信息，与正文里的「还没有配置
        AI 接口」引导自相矛盾。
      - 倒计时与模型名额外跟着 hasMessages：打开面板时 ensureSession() 会先建一个
        **空会话**占位，此时它里面什么都没有，倒计时却显示「会话剩余 23 小时 59 分」，
        模型名也早早挂在那里——看着像有个东西正在倒计时，实际无内容可保。
        这两样都是「会话已经在跑」的旁证，发出第一条消息后再显示才名副其实。
      - 「新建会话」不跟着 hasMessages：空会话时它仍有意义（万一恢复出的会话有内容
        想重来），且它本身不暗示任何「进行中」的状态。
    -->
    <template #header>
      <div v-if="configured" class="flex min-w-0 flex-1 items-center gap-2">
        <span
          v-if="hasMessages"
          class="shrink-0 rounded-full px-2 py-[3px] text-[11px]"
          :class="
            expired
              ? 'bg-[#fdecec] text-[#c0392b] dark:bg-[#3a1f1f] dark:text-[#e57373]'
              : 'bg-[#f0f0f0] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]'
          "
        >
          {{ expired ? '会话已过期' : `会话保留 ${remainingText}` }}
        </span>
        <button
          class="ml-auto shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
          @click="onNewSession"
        >
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
          AI 写作复用「AI 设置 → AI 文本」里配好的接口，可直接使用。若还没填，请先补上{{
            configMissing || '接口地址、API Key、模型名'
          }}。
        </p>
        <button
          class="cursor-pointer rounded-lg border-0 px-4 py-1.5 text-[12px] font-medium text-white"
          :style="{ backgroundColor: colors.accent }"
          @click="emit('openSettings')"
        >
          去设置
        </button>
      </div>

      <!-- 对话流（内部滚动，输入框在页脚固定） -->
      <div
        v-else
        ref="scrollRef"
        class="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin"
        @scroll.passive="onScroll"
      >
        <!-- 空态 -->
        <div
          v-if="!hasMessages"
          class="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
        >
          <Feather :size="26" class="text-[var(--accent)]" />
          <p class="text-[13px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">
            第一条消息就是素材
          </p>
          <p class="max-w-[460px] text-[12px] leading-relaxed text-[#999] dark:text-[#666]">
            brief、新闻链接、语音转文字、零散想法都行。顺手说说你自己的经历、踩过的坑、情绪节点，技能里这些是
            AI 替不了的部分，写出来才像人写的。
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              class="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3 py-[5px] text-[12px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              @click="useCurrentDoc"
            >
              <FileText :size="13" />
              用当前文档
            </button>
            <button
              class="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3 py-[5px] text-[12px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              @click="useFile"
            >
              <FolderOpen :size="13" />
              选择文件
            </button>
            <button
              class="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3 py-[5px] text-[12px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              @click="fillInput(EXPERIENCE_TEMPLATE)"
            >
              <Sparkles :size="13" />
              填经历模板
            </button>
          </div>
        </div>

        <template v-else>
          <!-- 消息流；contentRef 供 ResizeObserver 观察内容长高后贴底 -->
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

              <!-- 追问：左对齐气泡（行距与稿件预览一致，AI 的话统一收紧一档） -->
              <div v-else-if="msg.kind === 'question'" class="flex justify-start">
                <div
                  class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-[#f0f0f0] bg-white px-3.5 py-2 text-[13px] leading-[1.4] text-[#333] dark:border-[#333] dark:bg-[#1e1e1e] dark:text-[#ccc]"
                >
                  {{ msg.content }}
                </div>
              </div>

              <!-- 稿件卡：全宽 -->
              <div
                v-else
                class="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
              >
                <div
                  class="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
                >
                  <Feather :size="13" class="shrink-0 text-[var(--accent)]" />
                  <span class="text-[12px] font-medium text-[#1a1a1a] dark:text-[#e5e5e5]">
                    稿件
                  </span>
                  <span v-if="msg.article" class="text-[11px] text-[#999] dark:text-[#666]">
                    {{ draftStats(msg.article).chars }} 字 · 约
                    {{ draftStats(msg.article).minutes }} 分钟
                  </span>
                </div>

                <!-- 正文：优先 Markdown 渲染，未渲染完时退回纯文本 -->
                <div class="px-3 py-3">
                  <div
                    v-if="renderedHtml[msg.id]"
                    class="markdown-body ai-write-preview"
                    v-html="renderedHtml[msg.id]"
                  ></div>
                  <!--
                    流式中的纯文本兜底。
                    这里**不能**加 font-sans：Tailwind v4 的 --font-sans 栈里没有
                    system-ui（是 -apple-system / BlinkMacSystemFont / 'Segoe UI' /
                    Roboto / 'Noto Sans' / Arial / sans-serif / emoji 那一串），
                    中文在 Windows 上会一路落到 sans-serif 兜底的**宋体**；
                    而渲染完成后走的 .markdown-body 继承 body 的字栈（含 system-ui，
                    Windows 上即微软雅黑）。两处不一致，就表现为「流式时宋体、
                    完成后变微软雅黑」的字形跳变。
                    去掉 font-sans 让它继承 body，两阶段字体才一致。
                    行高同样对齐定稿的 1.4（见 PREVIEW_LINE_HEIGHT），避免完成瞬间跳一下。
                  -->
                  <pre
                    v-else
                    class="ai-write-stream text-[13px] leading-[1.4] text-[#333] dark:text-[#ccc]"
                    >{{ msg.article }}</pre
                  >
                </div>

                <!-- 自检报告：挂在正文之后，读起来是「先看稿，再看质检意见」 -->
                <div
                  v-if="msg.reportStatus"
                  class="border-t border-[#f0f0f0] bg-[#fffbf0] px-3 py-2 dark:border-[#333] dark:bg-[#2a2416]"
                >
                  <div class="flex items-center gap-2">
                    <Loader2
                      v-if="msg.reportStatus === 'running'"
                      :size="12"
                      class="animate-spin text-[#b7791f]"
                    />
                    <span class="text-[11px] font-medium text-[#b7791f]">
                      {{
                        msg.reportStatus === 'running'
                          ? '四层自检中…'
                          : msg.reportStatus === 'failed'
                            ? '自检失败'
                            : '四层自检报告'
                      }}
                    </span>
                    <button
                      v-if="msg.report"
                      class="ml-auto cursor-pointer border-0 bg-transparent text-[11px] text-[#8a6d3b] underline"
                      @click="toggleReport(msg.id)"
                    >
                      {{ expandedReports[msg.id] ? '收起' : '展开' }}
                    </button>
                  </div>
                  <pre
                    v-if="msg.report && expandedReports[msg.id]"
                    class="mt-1.5 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#8a6d3b]"
                    >{{ msg.report }}</pre
                  >
                </div>

                <!--
                  操作行：放在这条回复的**最下面**。
                  放卡片顶部时会与上一条回复贴在一起，用户很容易把它当成上一条的操作，
                  点「应用到编辑器」就会以为「填进去的是上一条」。
                  内容 → 报告 → 操作 的顺序，让每个按钮都明确属于它上面那份稿子。
                -->
                <div
                  class="flex flex-wrap items-center gap-1 border-t border-[#f0f0f0] bg-[#fcfcfc] px-3 py-2 dark:border-[#333] dark:bg-[#232323]"
                >
                  <!-- 字数在顶部与底部各出现一次：卡片很长时顶部那行早就滚出视野，
                       底部这份负责让「应用前」也能直接看到篇幅 -->
                  <span
                    v-if="msg.article"
                    class="mr-1 shrink-0 text-[11px] tabular-nums text-[#999] dark:text-[#666]"
                  >
                    {{ draftStats(msg.article).chars }} 字
                  </span>
                  <!-- 按钮整体右对齐：字数留在左侧，其余全部靠右 -->
                  <div class="ml-auto flex flex-wrap items-center justify-end gap-1">
                    <button
                      v-if="msg.reportStatus === 'failed'"
                      class="flex cursor-pointer items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                      :disabled="generating"
                      @click="retrySelfCheck(msg)"
                    >
                      <RefreshCw :size="12" />
                      重试自检
                    </button>
                    <button
                      v-if="msg.report"
                      class="cursor-pointer rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                      :disabled="generating"
                      @click="onRevise(msg)"
                    >
                      按自检意见改稿
                    </button>
                    <button
                      class="cursor-pointer rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
                      :disabled="generating"
                      @click="onRegenerate(msg)"
                    >
                      重新生成
                    </button>
                    <button
                      class="cursor-pointer rounded-md border-0 px-2.5 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      :style="{ backgroundColor: colors.accent }"
                      :disabled="generating"
                      @click="onApply(msg)"
                    >
                      应用到编辑器
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- 流式输出中（自检期间不显示：那时正在质检，没有正文在写） -->
            <div
              v-if="generating && !selfChecking"
              class="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white dark:border-[#333] dark:bg-[#1e1e1e]"
            >
              <div
                class="flex items-center gap-2 border-b border-[#f0f0f0] px-3 py-2 dark:border-[#333]"
              >
                <Loader2 :size="13" class="animate-spin text-[var(--accent)]" />
                <span class="text-[12px] text-[#666] dark:text-[#999]">写作中…</span>
                <span class="text-[11px] text-[#999] dark:text-[#666]">{{ elapsedSec }}s</span>
              </div>
              <pre
                class="ai-write-stream px-3 py-2 text-[13px] leading-[1.4] text-[#333] dark:text-[#ccc]"
                >{{ displayStream() }}</pre
              >
            </div>
          </div>
        </template>
      </div>

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
        <!-- 参数行 -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <!-- 模型：只在设置页勾了多个时才出现，只有一个模型时显示下拉没有意义 -->
          <label v-if="modelOptions.length > 1" class="flex items-center gap-1.5">
            <span class="shrink-0 text-[11px] text-[#999] dark:text-[#666]">模型</span>
            <select
              v-model="model"
              class="cursor-pointer appearance-none rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] outline-none transition-colors focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              :disabled="generating"
            >
              <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="shrink-0 text-[11px] text-[#999] dark:text-[#666]">类型</span>
            <select
              v-model="archetype"
              class="cursor-pointer appearance-none rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] outline-none transition-colors focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              :disabled="generating"
            >
              <option v-for="a in WRITE_ARCHETYPES" :key="a.value" :value="a.value">
                {{ a.label }}
              </option>
            </select>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="shrink-0 text-[11px] text-[#999] dark:text-[#666]">字数</span>
            <select
              v-model="length"
              class="cursor-pointer appearance-none rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] text-[#666] outline-none transition-colors focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]"
              :disabled="generating"
            >
              <option v-for="l in WRITE_LENGTHS" :key="l.value" :value="l.value">
                {{ l.label }}
              </option>
            </select>
          </label>
          <!--
            一个勾选框管三件事：技能本体（SKILL.md）+ 参考资料（references/）+ 出稿后的四层自检。
            它们本来就同属这套技能（四层自检写在 SKILL.md 第四节里），拆成两个开关反而让人以为
            参考资料是外挂的东西。关掉即整套技能不进 prompt。
          -->
          <BaseCheckbox
            :checked="useSkill"
            size="sm"
            label="卡兹克写作技能"
            :disabled="generating"
            @change="useSkill = $event"
          />
        </div>

        <!-- 输入行 -->
        <div class="flex items-end gap-2">
          <textarea
            ref="inputRef"
            v-model="input"
            rows="1"
            :disabled="generating || expired || !configured"
            :placeholder="
              expired
                ? '会话已过期，请点「新建会话」继续'
                : hasMessages
                  ? '接着说，比如：第二段换成我自己的例子 / 整体再短一点 / 开头重写'
                  : '第一条消息就是素材，直接粘贴或写下你的想法…（Enter 发送，Shift+Enter 换行）'
            "
            class="min-w-0 flex-1 resize-none rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] leading-[22px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[#fafafa] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555] dark:disabled:bg-[#222]"
            @input="autoGrow"
            @keydown="onInputKeydown"
          />
          <button
            v-if="generating"
            class="shrink-0 cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-[13px] text-[#666] transition-colors hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:bg-[#333]"
            @click="abort"
          >
            停止
          </button>
          <button
            v-else
            class="shrink-0 cursor-pointer rounded-lg border-0 px-4 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            :style="{ backgroundColor: colors.accent }"
            :disabled="!configured || !input.trim() || expired"
            @click="onSend"
          >
            发送
          </button>
        </div>
      </div>
    </template>
  </BaseDrawer>

  <!-- 新建会话确认 -->
  <ConfirmDialog
    v-model:visible="newSessionVisible"
    title="新建会话"
    message="新建会话会清空当前会话的全部对话与稿件，确定继续吗？"
    cancel-text="取消"
    confirm-text="新建会话"
    @confirm="doNewSession"
    @cancel="newSessionVisible = false"
  />

  <!-- 应用前二次确认（编辑器内容已改动） -->
  <ConfirmDialog
    v-model:visible="confirmApplyVisible"
    title="编辑器内容已改动"
    :message="`应用稿件会覆盖编辑器当前内容${undoHint}。确定继续吗？`"
    cancel-text="取消"
    confirm-text="继续应用"
    @confirm="onConfirmApply"
    @cancel="confirmApplyVisible = false"
  />
</template>

<style scoped>
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: #e0e0e0 transparent;
}
.scrollbar-thin::-webkit-scrollbar {
  width: 5px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #e0e0e0;
  border-radius: 3px;
}
:global(.dark) .scrollbar-thin {
  scrollbar-color: #444 transparent;
}
:global(.dark) .scrollbar-thin::-webkit-scrollbar-thumb {
  background: #444;
}
</style>

<style>
/*
  AI 回复区的正文段落（流式中的纯文本兜底）。

  为什么不能留 <pre> 的默认字体：浏览器给 pre 的默认 font-family 是
  `monospace`（Chromium 系展开成 ui-monospace / Menlo / Consolas… 那一串），
  **其中不含任何中文字体**。于是中文只能落到 monospace 的兜底字形上——
  Windows 是宋体，而渲染完成后的 .markdown-body 继承 body（含 system-ui →
  微软雅黑）。两阶段字体不同，用户就会看到「流式时宋体、完成瞬间变微软雅黑」
  的字形跳变。

  这里显式继承正文字体，让流式与定稿两阶段始终一致。
  （代码块、自检报告那些确实该用等宽的，各自显式写了 font-mono，不受影响。）
*/
.ai-write-stream {
  font-family: inherit;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
</style>

<style>
/*
  稿件预览：markdownParser 产出的 HTML 直接挂在面板里，
  这里只做「限制在卡片内、不溢出、暗色可读」的收敛，视觉细节沿用全局 markdown-body 样式。
*/
.ai-write-preview {
  overflow-x: auto;
  word-break: break-word;
  /*
    稿件卡片里的正文比编辑器预览小一号。

    解析器把标题、列表、引用、代码的字号都写成了内联 px（只有段落走段落设置），
    想逐类覆盖就得给每种元素写一条 !important，既脆弱又容易漏。
    这里用 zoom 整体缩一档：层级关系保持，改一个数字就能调，也不必重新解析。
    （zoom 已被 Chrome / Safari / Firefox 126+ / WebView2 / WKWebView 支持。）
    行距的进一步收紧在 paragraphStyle() 里做——那部分本来就由段落设置驱动。
  */
  zoom: var(--ai-write-preview-zoom, 0.94);
}
.ai-write-preview img {
  max-width: 100%;
  height: auto;
}
</style>
