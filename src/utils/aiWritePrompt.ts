/**
 * AI 写作的 prompt 组装与模型输出解析（纯逻辑，无网络、无 Vue 依赖）。
 *
 * 技能文本来自 src/data/ai/khazix/（khazix-writer skill 的内置副本，随应用发布，
 * 与 src/data/ai/r-markdown-formatter/format-spec.md 的做法一致：顶部注释块剥离、
 * 正文与源文件逐字节一致）。
 *
 * 与 AI 排版的关键差别：排版是「一次请求 → 一份结果」，写作是「多轮对话 → 逐步成稿」。
 * 因此这里除了 system prompt，还要负责把模型输出分类成「出稿」还是「追问」。
 */

import { cleanModelOutput } from '@/utils/aiFormatPrompt'

/** 稿件正文的定界标记；单独占一行，便于流式解析与残留清理 */
export const ARTICLE_OPEN = '<<<ARTICLE>>>'
export const ARTICLE_CLOSE = '<<<END_ARTICLE>>>'
/** 四层自检报告的定界标记 */
export const SELFCHECK_OPEN = '<<<SELFCHECK>>>'
export const SELFCHECK_CLOSE = '<<<END_SELFCHECK>>>'

/** 判定「这算一篇稿件」的最小字数：低于它且不含标记时，按追问处理 */
const DRAFT_MIN_CHARS = 800

/** 文章原型档位（取值与提示均来自 skill 的「文章原型」一节） */
export type WriteArchetype =
  | 'auto'
  | 'investigation'
  | 'product'
  | 'phenomenon'
  | 'tool'
  | 'methodology'

export const WRITE_ARCHETYPES: { value: WriteArchetype; label: string; hint: string }[] = [
  { value: 'auto', label: '自动判断', hint: '由模型根据素材自行判断属于哪种原型（推荐）' },
  {
    value: 'investigation',
    label: '调查实验型',
    hint: '亲自下场做一件事再报道发现。写法重心在过程叙事与发现的层层递进',
  },
  {
    value: 'product',
    label: '产品体验型',
    hint: '拿到产品实际使用，带读者一起体验。写法重心在场景演示与真实感受',
  },
  {
    value: 'phenomenon',
    label: '现象解读型',
    hint: '观察到一个现象后层层深入。写法重心在观察→好奇→研究→哲学升维',
  },
  {
    value: 'tool',
    label: '工具分享型',
    hint: '分享实用工具或 Prompt，但用个人故事包裹。写法重心在故事铺垫→展示→效果',
  },
  {
    value: 'methodology',
    label: '方法论分享型',
    hint: '系统性分享长期积累的经验。每节都要落到可执行动作，并坦诚说明学习成本',
  },
]

/**
 * 目标字数档位。
 *
 * 取值范围 1000–8000，每 1000 一档：短稿（1000–2000）适合单一观点或轻量分享，
 * 4000 以上才是公众号长文的常规区间。auto 交给 skill 自己的「4000-8000 字」口径。
 */
export type WriteLength =
  | 'auto'
  | '1000'
  | '2000'
  | '3000'
  | '4000'
  | '5000'
  | '6000'
  | '7000'
  | '8000'

export const WRITE_LENGTHS: { value: WriteLength; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '按 skill 的常规口径，公众号长文 4000-8000 字' },
  { value: '1000', label: '约 1000 字', hint: '短稿，一个观点讲透就好' },
  { value: '2000', label: '约 2000 字', hint: '轻量分享，适合单一事件或一个小工具' },
  { value: '3000', label: '约 3000 字', hint: '偏短的长文，两三个板块' },
  { value: '4000', label: '约 4000 字', hint: '短一些的长文，适合单一事件或轻量观点' },
  { value: '5000', label: '约 5000 字', hint: '中等长度，适合有三四个板块的稿子' },
  { value: '6000', label: '约 6000 字', hint: '常规长度，适合有多个板块的深度稿' },
  { value: '7000', label: '约 7000 字', hint: '偏长的深度稿，适合调查实验型' },
  { value: '8000', label: '约 8000 字', hint: '长稿，适合调查实验型与方法论分享型' },
]

/** 剥离顶部 `<!-- … -->` 来源注释块 */
export function stripSourceComment(text: string): string {
  return text.replace(/^\s*<!--[\s\S]*?-->\s*/, '')
}

/**
 * 剥离 YAML frontmatter。
 *
 * SKILL.md 顶部的 `name` / `description` 是 DSH 的 skill 路由元数据（决定「什么时候加载这个 skill」），
 * 对已经加载进来的模型来说是噪声——反而可能诱导它去描述这个 skill 本身而不是写文章。
 */
export function stripFrontMatter(text: string): string {
  return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
}

/** 技能里「固定尾部」那一节的起始标记 */
const FIXED_TAIL_MARKER = '【固定尾部】'

/**
 * 剥掉技能里的「【固定尾部】」模板块。
 *
 * 技能原文在「结构模板」的末尾写了一段固定尾部：求三连、求星标、署名「作者：卡兹克」、
 * 以及卡兹克本人的投稿邮箱。那是**他本人公众号**的模板——用户用这个功能写的是自己的号，
 * 照抄过去就是替别人署名、留别人的邮箱，所以整块不进 prompt。
 *
 * 这里只做「读取时剥离」，**不改动 src/data/ai/khazix/SKILL.md 本身**：
 * 那个文件要求与源技能逐字节一致（顶部注释块记录基线 sha256），改文件会破坏校验。
 * 做法与 stripSourceComment / stripFrontMatter 一致。
 *
 * 注意：正则只把模板本身拿掉，`【收尾】` 那一节的几种收法（引用收尾、哲思余韵等）保留，
 * 文章仍然要正常结尾，只是不再带账号尾部。
 */
export function stripFixedTail(text: string): string {
  const i = text.indexOf(FIXED_TAIL_MARKER)
  if (i === -1) return text

  // 起点：连「↓」连接符（及其整行）一起吃掉，否则结构模板会以悬空的箭头收尾
  let start = i
  const before = text.slice(0, i)
  const arrow = before.match(/\n[ \t]*↓[ \t]*\n[ \t]*$/)
  if (arrow) start = before.length - arrow[0].length

  // 终点：停在代码块围栏（或标题）之前，避免把后面的正文一起吞掉。
  // 只切到那个换行符的位置、不把它吃掉，否则收尾的 ``` 会黏到最后一行文字后面。
  const rest = text.slice(i)
  const endMatch = rest.match(/\n(?=[ \t]*(?:```|#{1,6}\s|$))/m)
  const end = endMatch && endMatch.index !== undefined ? i + endMatch.index : text.length

  return text.slice(0, start) + text.slice(end)
}

/** 归一化档位取值：非法值一律回退 auto，防手改配置把 prompt 拼出 undefined */
export function normalizeArchetype(v: unknown): WriteArchetype {
  return WRITE_ARCHETYPES.some((a) => a.value === v) ? (v as WriteArchetype) : 'auto'
}

export function normalizeLength(v: unknown): WriteLength {
  return WRITE_LENGTHS.some((l) => l.value === v) ? (v as WriteLength) : 'auto'
}

/** 动态导入技能全文并剥离注释块、frontmatter 与固定尾部模板。单独成 chunk，不撑大主包。 */
export async function loadSkillText(): Promise<string> {
  const mod = await import('@/data/ai/khazix/SKILL.md?raw')
  return stripFixedTail(stripFrontMatter(stripSourceComment(mod.default as string))).trim()
}

/**
 * 动态导入参考资料（风格示例 + 内容方法论）并拼接。
 * 仅在设置里开启「附带参考资料」时调用——这两篇约 +6900 tokens，默认不进 prompt。
 */
export async function loadReferenceText(): Promise<string> {
  const [style, method] = await Promise.all([
    import('@/data/ai/khazix/references/style_examples.md?raw'),
    import('@/data/ai/khazix/references/content_methodology.md?raw'),
  ])
  const clean = (m: { default: string }) =>
    stripFrontMatter(stripSourceComment(m.default as string)).trim()
  return [
    '# 参考资料一：风格示例库',
    '',
    clean(style as { default: string }),
    '',
    '# 参考资料二：内容方法论',
    '',
    clean(method as { default: string }),
  ].join('\n')
}

/** 原型档位说明 */
function archetypeInstruction(archetype: WriteArchetype): string {
  if (archetype === 'auto') {
    return [
      '## 本次文章原型',
      '先判断素材属于哪种原型（调查实验型 / 产品体验型 / 现象解读型 / 工具分享型 / 方法论分享型），',
      '再按该原型对应的写法重心来组织文章。判断结论不必单独说明，直接体现在文章结构里。',
    ].join('\n')
  }
  const def = WRITE_ARCHETYPES.find((a) => a.value === archetype)!
  return ['## 本次文章原型', `按「${def.label}」来写。${def.hint}。`].join('\n')
}

/** 字数档位说明 */
function lengthInstruction(length: WriteLength): string {
  if (length === 'auto') return ''
  return [
    '## 本次目标字数',
    `正文控制在 ${length} 字左右（不含文末的固定尾部）。`,
    '宁可把某个板块写透，也不要用空话把字数凑上去。',
  ].join('\n')
}

export interface WriteSystemOptions {
  /** 技能全文（loadSkillText 的返回值）；空串表示**不启用技能**（关掉勾选框时） */
  skill: string
  /** 参考资料全文（loadReferenceText 的返回值）；空串表示不附带 */
  references?: string
  archetype: WriteArchetype
  length: WriteLength
  /** 设置里的长期补充要求 */
  extraInstruction?: string
}

/**
 * 构造 system prompt。
 *
 * 两种形态：
 * - **启用技能**（默认）：身份 → 输出契约 → 技能全文 → 参考资料 → 档位 → 补充要求。
 * - **不启用技能**：身份改成中性说明，并去掉「唯一写作标准」「按技能收尾」这类指向技能的措辞。
 *   否则 prompt 里会出现「请严格按下面这份写作技能来写」却什么都没跟，模型会困惑甚至瞎编。
 *
 * 大段稳定内容放前面，便于供应商侧前缀缓存命中（与 AI 排版的 buildSystemPrompt 同思路）。
 */
export function buildWriteSystemPrompt(opts: WriteSystemOptions): string {
  const skill = opts.skill.trim()
  const useSkill = Boolean(skill)

  const parts: string[] = useSkill
    ? [
        '你正在以「数字生命卡兹克」的身份写一篇微信公众号长文。',
        '用户会陆续给你素材、自己的经历与要求。请严格按下面这份写作技能来写。',
      ]
    : [
        '你是一位擅长写微信公众号长文的中文作者。',
        '用户会陆续给你素材、自己的经历与要求，请据此写出结构完整、读起来自然的长文。',
        '（本次没有加载具体的写作技能规范，按你自己的判断与用户的要求来写。）',
      ]

  parts.push(
    '',
    '# 输出契约（最高优先级，任何情况下不得违反）',
    '',
    '你每一轮的回复只有两种形态，必须严格区分：',
    '',
    '1. **出稿**：当你已经可以写出完整成稿时，输出完整正文，',
    `   并在正文前后各用一行标记包住：第一行是 \`${ARTICLE_OPEN}\`，最后一行是 \`${ARTICLE_CLOSE}\`。`,
    '   标记必须独占一行，标记与正文之间不要空行，标记之外不要写任何别的话。',
    '2. **追问**：当素材还不足以支撑一篇长文时（比如只有一个主题、缺少具体要点、缺少第一手经历），',
    '   先用普通对话的方式向用户追问，**不要输出任何标记**，也不要硬写一篇。',
    '   追问要具体，一次问清最关键的几点，并说明为什么需要。',
    '',
    '其他硬性要求：',
    '- 不要写任何解释、寒暄、前言或后记（例如「好的，以下是文章」）。',
    '- 不要把整篇正文包进 ``` 代码围栏。',
    '- 不要输出「质检报告」——自检是另一件事，会在需要时单独要求。',
    '',
    '## 结尾必须干净（这条经常被忽略，务必遵守）',
    '',
    '用户写的是**自己的**公众号，不是卡兹克的号。因此正文结尾不要加任何账号运营类内容：',
    '- 不要写署名或落款，不要出现任何作者名；',
    '- 不要写求点赞 / 求在看 / 求转发这类引导关注的号召；',
    '- 不要写任何邮箱、联系方式、投稿或爆料渠道；',
    '- 不要写「以上」这类总起词，也不要写告别式客套收尾。',
  )

  // 「用技能里的收尾方式」这句只在真的给了技能时才说得通
  parts.push(
    useSkill
      ? '文章用技能里的收尾方式自然结束（引用收尾、哲思余韵、行动呼吁、信念宣言、回环呼应），'
      : '文章要有一个自然的收尾，不要戛然而止，也不要硬塞行动号召。',
    '正文最后一句话写完后直接跟结束标记，后面不加任何东西。',
  )

  if (useSkill) {
    parts.push('', '# 写作技能全文（唯一写作标准）', '', skill)
  }

  const refs = (opts.references || '').trim()
  if (refs) {
    parts.push('', '# 参考资料（风格示例与方法论，供你模仿语感与选题判断，不必逐条引用）', '', refs)
  }

  parts.push('', archetypeInstruction(opts.archetype))

  const lengthPart = lengthInstruction(opts.length)
  if (lengthPart) parts.push('', lengthPart)

  const extra = (opts.extraInstruction || '').trim()
  if (extra) {
    parts.push('', '## 用户的长期补充要求（每次写作都要遵守）', extra)
  }

  return parts.join('\n')
}

/** 构造一条用户消息（对话模式下用户输入直接透传，包一层避免与 system 混淆） */
export function buildWriteUserMessage(text: string): string {
  return ['<用户消息>', text.trim(), '</用户消息>'].join('\n')
}

/** 构造四层自检请求：只出报告，不改稿 */
export function buildSelfCheckUserMessage(article: string): string {
  return [
    '现在停止写作，切换到质检模式。',
    '',
    '请对下面这篇已经写好的文章，完整跑一遍技能里的四层自检体系（L1 硬性规则 / L2 风格一致性 /',
    'L3 内容质量 / L4 活人感终审），并按技能里给出的「自检输出格式」输出质检报告。',
    '',
    '硬性要求：',
    '- **只输出质检报告，不要改写、不要重写、不要输出文章正文**。',
    '- 报告要指出具体位置（哪一段、哪句话），不要只说「某处」；',
    '  如果没有问题就如实写「无」，不要为了凑内容编造问题。',
    `- 把报告用标记包住：第一行是 \`${SELFCHECK_OPEN}\`，最后一行是 \`${SELFCHECK_CLOSE}\`，标记独占一行。`,
    '',
    '<待检文章>',
    article.trim(),
    '</待检文章>',
  ].join('\n')
}

/** 构造「按自检意见改稿」请求：自带正文与报告，不依赖对话历史里是否还留着它们 */
export function buildReviseUserMessage(report: string, article: string): string {
  return [
    '下面是这篇文章和它的四层自检报告。请按报告里的修复意见改稿，',
    '输出改好之后的**完整正文**（不是差异、不是片段、不是修改说明）。',
    '',
    '改稿时注意：',
    '- 报告里标为通过的部分不要动，只修不通过的地方；',
    '- 改稿后仍然要满足技能的全部硬性规则（尤其是标点禁令与禁用词）；',
    `- 正文前后各用一行 \`${ARTICLE_OPEN}\` 与 \`${ARTICLE_CLOSE}\` 包住，标记独占一行。`,
    '',
    '<质检报告>',
    report.trim(),
    '</质检报告>',
    '',
    '<原文>',
    article.trim(),
    '</原文>',
  ].join('\n')
}

/** 删除残留的定界标记行（模型有时会把标记写到正文中间或重复输出） */
export function stripMarkers(text: string): string {
  return text
    .replace(new RegExp(`^[ \\t]*${ARTICLE_OPEN}[ \\t]*$`, 'gm'), '')
    .replace(new RegExp(`^[ \\t]*${ARTICLE_CLOSE}[ \\t]*$`, 'gm'), '')
    .replace(new RegExp(`^[ \\t]*${SELFCHECK_OPEN}[ \\t]*$`, 'gm'), '')
    .replace(new RegExp(`^[ \\t]*${SELFCHECK_CLOSE}[ \\t]*$`, 'gm'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 清洗模型输出：剥掉整篇 ``` 围栏、首尾空白、结尾客套话，并清掉残留标记。
 * 复用 AI 排版的 cleanModelOutput（同一套围栏/客套/空行处理），再补一步标记清理。
 */
export function cleanWriteOutput(raw: string): string {
  return stripMarkers(cleanModelOutput(raw))
}

/** 按标记切出区间内容；标记缺失返回 null */
function sliceBetween(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  if (start === -1) return null
  const bodyStart = start + open.length
  const end = text.indexOf(close, bodyStart)
  const body = end === -1 ? text.slice(bodyStart) : text.slice(bodyStart, end)
  return stripMarkers(body)
}

/** 判断一段文字是否像「追问」：以问号结尾、或明显偏短 */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[？?]\s*$/.test(t)) return true
  return false
}

export interface ClassifiedTurn {
  kind: 'draft' | 'question'
  /** kind==='draft' 时为稿件正文；question 时为空串 */
  article: string
  /** 清洗后的完整输出（含标记剥离），用于落库与展示 */
  content: string
}

/**
 * 把一轮 assistant 输出分类成「出稿」或「追问」。
 *
 * 判定顺序：
 * 1. 有 `<<<ARTICLE>>>` 标记 → 出稿（标记是 system prompt 里明确要求的，最可信）
 * 2. 没有标记，但正文够长（≥ 800 字）且不以问句结尾 → 兜底当出稿
 *    （模型偶尔会忘记加标记，此时若一律当追问，用户会看到一篇好文章被塞进气泡里）
 * 3. 其余 → 追问
 */
export function classifyAssistantTurn(raw: string): ClassifiedTurn {
  const content = cleanWriteOutput(raw)
  const marked = sliceBetween(raw, ARTICLE_OPEN, ARTICLE_CLOSE)
  if (marked !== null && marked.trim()) {
    return { kind: 'draft', article: marked.trim(), content }
  }
  const plain = stripMarkers(content)
  if (plain.length >= DRAFT_MIN_CHARS && !looksLikeQuestion(plain)) {
    return { kind: 'draft', article: plain, content }
  }
  return { kind: 'question', article: '', content: plain }
}

/** 从自检回复里取报告；标记缺失时整段兜底（报告本来就是纯文本） */
export function extractSelfCheck(raw: string): string {
  const marked = sliceBetween(raw, SELFCHECK_OPEN, SELFCHECK_CLOSE)
  const text = (marked ?? cleanWriteOutput(raw)).trim()
  return text
}
