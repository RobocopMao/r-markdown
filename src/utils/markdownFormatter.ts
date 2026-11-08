/**
 * 编辑器「格式化文档」的纯逻辑实现（不依赖 Vue / DOM / CodeMirror）。
 *
 * 只做**有明确收益**的整理，不做任何会改变语义的改写：
 *
 * 1. 组件标签行去缩进 —— 解析器主循环和 `parseCompare()` 用列 0 锚定正则判态，
 *    标签一旦带前导空格就匹配不到：轻则组件退化成段落、源码漏进正文，
 *    重则闭标签永远等不到、后文整段静默消失（`<steps>` / `<compare>` / `<timeline>` /
 *    `<case-flow>` / `<slider>` 都是这个毛病）。这是手写时最容易踩的坑。
 * 2. 顶层块级组件前后各留一个空行 —— 紧贴正文会让组件黏在上一段文字后面。
 * 3. 行尾空白、连续空行收敛 —— 纯噪声。
 * 4. 标题补空格、层级夹取到 1–4 —— 解析器只认 `#{1,4}`，`#####` 会退化成普通段落。
 * 5. 列表标记统一为 `-`、缩进对齐到 2 空格的偶数倍 —— 相对层级保持不变。
 * 6. 未闭合的代码围栏补上闭合行 —— 否则围栏后面的全文都成了代码。
 * 7. `>正文` 补成 `> 正文` —— 解析器的引用与 callout body 都要求 `> ` 带空格。
 * 8. 引用块之前补一个空行 —— 上一行不是引用行就补，连续引用行（callout）保持紧贴。
 * 9. 独占一行的图片、图集后面补一个空行 —— 否则它和后面的正文读起来像同一块。
 *    第 8、9 条都跳过「组件内部的结构行」：组件的开闭标签前不补，
 *    否则 `<compare>` 的 `<left>` 底下、图片与 `</left>` 之间会凭空多出空行。
 * 10. `<steps>` / `<case-flow>` / `<timeline>` 内一行写了多个条目时拆成多行 ——
 *    这类组件逐行取一个条目，`(.+)` 会把同一行后面的条目一起吞进描述字段。
 *
 * 明确不碰的地方：
 * - 代码围栏内部（缩进与行尾空白都是代码内容）
 * - `<html>` / `<mermaid>` / `<svg>` 块内部（原样透传是它们的契约）
 * - 块级组件内部（`<container>` / `<row>` 里的空白与缩进是布局的一部分，只做去缩进）
 */

import { BLOCK_COMPONENT_TAGS, COMPONENT_TAGS, VERBATIM_TAGS } from './componentTags'
import { isFenceClose, matchFenceOpen } from './helpers'
import { HEADING_LEVEL_MAX } from './headingLevels'

const TAG_ALT = COMPONENT_TAGS.join('|')
const BLOCK_ALT = BLOCK_COMPONENT_TAGS.join('|')
const VERBATIM_ALT = VERBATIM_TAGS.join('|')

/** 行首（允许前导空白）是组件开/闭标签 */
const INDENTED_TAG_RE = new RegExp(`^[ \\t]+(?:<\\/?)(?:${TAG_ALT})\\b`)
/**
 * 这一行是「组件内部的结构行」：子标签（`<left>` / `<right>` / `<text>` / `<slide>` / `<item>`）
 * 或任意组件的闭标签（`</left>`、`</container>`…）。
 *
 * 补空行规则要避开它们：`<compare>` 两栏里图片后面紧跟 `</left>`，
 * 那不是「图片和后面的内容黏在一起」，在图片与闭标签之间插空行只是噪声；
 * 同理 `<left>` 底下紧跟的引用也无须先空一行。
 */
const INNER_TAG_LINE_RE = new RegExp(
  `^[ \\t]*(?:</(?:${TAG_ALT})\\b|<(?:left|right|text|slide|item)\\b)`,
)
/** 行首（允许前导空白）是任意组件开标签（含 `<left>` 这类子标签） */
const ANY_TAG_OPEN_RE = new RegExp(`^[ \\t]*<(?:${TAG_ALT})\\b`)
/** 行首（允许前导空白）是图集语法 `<![ … ]` */
const INDENTED_GALLERY_RE = /^[ \t]+<\s*!\[/
/** 原样透传块的开标签 */
const VERBATIM_OPEN_RE = new RegExp(`^<(?:${VERBATIM_ALT})\\b`)
/** 顶层块级组件的开标签 */
const BLOCK_OPEN_RE = new RegExp(`^<(?:${BLOCK_ALT})\\b`)
/** 块级组件的闭标签独占一行 */
const BLOCK_CLOSE_RE = new RegExp(`^</(?:${BLOCK_ALT})>\\s*$`)
/**
 * 独占一行的图片块：单张图 `![alt](url)[100% 250px]`，或图集 `< ![a](u1), ![b](u2) >`。
 *
 * 这类行后面紧跟别的块（引用、列表、段落…）时解析器本来就会拆成两块，
 * 但源码里贴着写读起来像是同一段；格式化时在它后面补一个空行。
 */
const STANDALONE_IMAGE_RE = /^!\[[^\]]*\]\([^)]+\)(?:\[[^\]]*\])?\s*$/
const GALLERY_LINE_RE = /^<\s*!\[[\s\S]*>\s*$/

/** 标题行：一个以上 `#` 后跟文字 */
const HEADING_RE = /^(#+)\s*(.*)$/
/** 列表行：缩进 + 标记 + 空白 + 内容 */
const LIST_RE = /^([ \t]*)([-*+]|\d+\.)[ \t]+(.*)$/
/**
 * 引用行：`>` 后面紧跟非空白、非 `>` 的字符。
 *
 * 解析器的引用分支用 `/^>\s/` 判行，`>正文` 匹配不上就会漏成普通段落；
 * callout（`> [TIP] 标题` + `> 正文`）的 body 收集同样要求 `> ` 带空格，
 * 标题行能认出来、正文却被当成段落吐到提示框外面。这里统一补一个空格。
 *
 * 只处理单个 `>`，而且要求后面紧跟非空白字符：`> > 嵌套` 这种本解析器不支持，
 * 不去猜它的意图。
 */
const TIGHT_QUOTE_RE = /^>(?=[^ \t>])/
/** 任意引用行（`>` 开头，含 `>正文` / `> 正文` / `>【callout 标题】` / 空引用行） */
const ANY_QUOTE_RE = /^>[ \t]?/
/**
 * 空的引用标记行（`>` 或 `> `）。
 *
 * 解析器用 `/^>\s/` 判行：`>` 之后必须有一个空白才算引用行。
 * 行尾空白清理会把 `> ` 削成 `>`，于是 callout 的 body 收集在这里断链，
 * 后面的正文被当成普通段落吐到提示框外面。这类行必须保住那个空格。
 */
const BARE_QUOTE_RE = /^>[ \t]*$/

/** 一次格式化做了哪些事，用于提示文案 */
export interface FormatStats {
  /** 去掉前导空白的组件标签行数 */
  deindented: number
  /** 为块级组件补的空行数 */
  blankInserted: number
  /** 收敛掉的连续空行数 */
  blankCollapsed: number
  /** 清掉行尾空白的行数 */
  trailingSpaces: number
  /** 规范化过的标题行数 */
  headings: number
  /** 规范化过的列表行数 */
  lists: number
  /** 补齐 `>` 后空格的引用行数 */
  quotes: number
  /** `<steps>` / `<case-flow>` 内部拆开的一行多条目数 */
  itemsSplit: number
  /** 图片块（单图 / 图集）之后补的空行数 */
  imageGaps: number
  /** 引用块之前补的空行数 */
  quoteGaps: number
  /** 自动补上的围栏闭合行数 */
  fencesClosed: number
}

export interface FormatResult {
  text: string
  stats: FormatStats
  /** 内容是否真的变了；false 表示本来就已经是规范格式 */
  changed: boolean
}

function emptyStats(): FormatStats {
  return {
    deindented: 0,
    blankInserted: 0,
    blankCollapsed: 0,
    trailingSpaces: 0,
    headings: 0,
    lists: 0,
    quotes: 0,
    itemsSplit: 0,
    imageGaps: 0,
    quoteGaps: 0,
    fencesClosed: 0,
  }
}

/** 标题行规范化：层级夹取到 1–4，`#` 与文字之间保证一个空格 */
function normalizeHeading(line: string, stats: FormatStats): string {
  const m = line.match(HEADING_RE)
  if (!m) return line
  // 只有井号、没有文字：不当作标题（避免把分隔线改成一个空标题）
  if (!m[2].trim()) return line
  const level = Math.min(m[1].length, HEADING_LEVEL_MAX)
  const next = '#'.repeat(level) + ' ' + m[2].trim()
  if (next !== line) stats.headings++
  return next
}

/** 列表行规范化：无序标记统一 `-`，缩进对齐到 2 空格的偶数倍（相对层级不变） */
function normalizeList(line: string, stats: FormatStats): string {
  const m = line.match(LIST_RE)
  if (!m) return line
  const indent = Math.floor(m[1].replace(/\t/g, '  ').length / 2) * 2
  const marker = m[2] === '*' || m[2] === '+' ? '-' : m[2]
  const next = ' '.repeat(indent) + marker + ' ' + m[3]
  if (next !== line) stats.lists++
  return next
}

/** 引用行规范化：`>正文` → `> 正文` */
function normalizeQuote(line: string, stats: FormatStats): string {
  if (!TIGHT_QUOTE_RE.test(line)) return line
  stats.quotes++
  return '> ' + line.slice(1)
}

/**
 * 列表型组件里「一行写了多个条目」的分隔点。
 *
 * 这类组件都是逐行取一个条目，`(.+)` 会把同一行后面的条目一起吞进描述字段：
 * - `<steps>`：`- 输入 | 喂东西 - 管理 | 让知识库有序运转` → 第 1 项的 desc 变成
 *   `让知识库有序运转`，项数从 2 掉到 1。
 * - `<case-flow>`：`- [案例 01] 甲 - [案例 02] 乙` → 第 2 项被吞进第 1 项的正文。
 *
 * 只在**明确的边界**上拆，宁可少拆也不误拆：
 * - steps：` - ` 后面紧跟的「名称」必须是不含空白的短词（≤12 字）且后面马上是 `|`。
 *   这样 `- 输入 | 喂东西 - 包括文档和网页`（破折号是描述的一部分）不会被拆。
 * - case-flow：` - ` 后面紧跟 `[标签 数字]`，且方括号后面还有正文。
 *   这样 `- [案例 01] 参考 - [文档 2]`（后面没正文）不会被拆出半截条目。
 * - timeline：` - ` 后面紧跟**像日期的开头**（`2024年01月` / `2024-01` / `01/2024`）
 *   并且后面还有至少两个 `|` 字段。日期是第一字段是它的固定语法，
 *   描述里出现 ` - 3 步 | 说明` 这类文字不会被当成新条目。
 */
const LIST_ITEM_SEP_RES: Record<string, RegExp> = {
  steps: /\s+-\s+(?=[^|\s]{1,12}\s*\|)/,
  'case-flow': /\s+-\s+(?=\[[^\]\n]{1,20}\s*\d+\]\s+\S)/,
  // 日期必须是 4 位年份（可带月）或「X 月」，` - 2 周 | 培训 | 上线` 这种不会被误拆
  timeline:
    /\s+-\s+(?=(?:(?:19|20)\d{2}(?:[-/年.]\d{1,2})?|\d{1,2}\s*月)[^|\n]{0,10}\s*\|[^|\n]+\|)/,
}

/** 把一行里的多个条目拆成多行；只有一个条目时原样返回 */
function splitListItems(line: string, tag: string): string[] {
  const sep = LIST_ITEM_SEP_RES[tag]
  if (!sep || !/^-\s/.test(line)) return [line]
  const indent = line.match(/^[ \t]*/)?.[0] ?? ''
  const parts: string[] = []
  let rest = line.slice(indent.length).replace(/^-\s*/, '')
  let guard = 0
  while (guard++ < 50) {
    const m = rest.match(sep)
    if (!m || m.index === undefined) break
    parts.push(rest.slice(0, m.index).trim())
    rest = rest.slice(m.index + m[0].length)
  }
  parts.push(rest.trim())
  if (parts.length < 2) return [line]
  return parts.map((p) => `${indent}- ${p}`)
}

/** 开标签是否在同一行就闭合（`<p-title …></p-title>`、`<slider … />`） */
function closesOnSameLine(line: string): boolean {
  if (/^<\//.test(line)) return false
  if (/\/>\s*$/.test(line)) return true
  return /<\/[a-zA-Z][\w-]*>\s*$/.test(line)
}

/**
 * 格式化 Markdown 全文。
 *
 * 幂等：对已经规范的内容再跑一次返回 `changed: false`。
 */
export function formatMarkdown(md: string): FormatResult {
  const stats = emptyStats()
  const out: string[] = []

  let fence: { char: string; len: number } | null = null
  let verbatimTag: string | null = null
  /** 块级组件嵌套深度。只有 0→1 / 1→0 的跃迁才管空行 */
  let blockDepth = 0
  /** 块级组件刚闭合，下一个非空行之前要补一个空行 */
  let pendingBlank = false
  /** 当前所在的列表型组件（`steps` / `case-flow` / `timeline`），只有它们要拆一行多条目 */
  let listContainer: string | null = null
  /** 上一个非空行是图片块 */
  let lastWasImage = false
  /** 上一个非空行是引用行 */
  let lastWasQuote = false

  /** 末尾是否是空行 */
  const lastIsBlank = () => out.length > 0 && out[out.length - 1] === ''

  const ensureBlankBefore = () => {
    if (out.length === 0) return
    if (lastIsBlank()) return
    out.push('')
    stats.blankInserted++
  }

  /**
   * 上一行是任意组件的开标签（`<container>`、`<left>`、`<text>`…），别在它下面再插空行。
   *
   * 用 `ANY_TAG_OPEN_RE` 而不是 `BLOCK_OPEN_RE`：`<compare>` 的 `<left>` 不在块级清单里，
   * 但它下面紧跟的引用同样不该被空行隔开。
   */
  const isEmptyBlockStart = () => {
    const last = out.length > 0 ? out[out.length - 1] : ''
    return last !== '' && ANY_TAG_OPEN_RE.test(last)
  }

  /** 补上「块级组件之后要空行」的欠账 */
  const settlePendingBlank = () => {
    if (!pendingBlank) return
    pendingBlank = false
    if (lastIsBlank()) return
    out.push('')
    stats.blankInserted++
  }

  for (const rawLine of md.split(/\r?\n/)) {
    // ── 围栏内部：原样保留（缩进、行尾空白都是代码内容） ──
    if (fence) {
      if (isFenceClose(rawLine, fence.char, fence.len)) fence = null
      out.push(rawLine)
      continue
    }

    // ── 原样透传块内部：原样保留 ──
    if (verbatimTag) {
      if (rawLine.includes(`</${verbatimTag}>`)) verbatimTag = null
      out.push(rawLine)
      continue
    }

    let line = rawLine
    const trimmedEnd = line.replace(/[ \t]+$/, '')
    if (trimmedEnd !== line && !BARE_QUOTE_RE.test(line)) stats.trailingSpaces++
    line = trimmedEnd
    // 引用标记行补回一个空格，否则 `> ` 变成 `>` 会让引用/callout 链在解析器那里断掉
    if (BARE_QUOTE_RE.test(line)) line += ' '

    // ── 围栏开标签（顶格才是代码块，与解析器一致） ──
    const topFence = matchFenceOpen(line, false)
    if (topFence) {
      settlePendingBlank()
      if (blockDepth === 0) ensureBlankBefore()
      fence = topFence
      out.push(line)
      continue
    }

    // ── 缩进围栏：不构成代码块，但内部同样是代码，不能被格式化 ──
    const indentedFence = matchFenceOpen(line, true)
    if (indentedFence) {
      settlePendingBlank()
      fence = indentedFence
      out.push(line)
      continue
    }

    // ── 组件标签行去缩进 ──
    if (INDENTED_TAG_RE.test(line) || INDENTED_GALLERY_RE.test(line)) {
      line = line.replace(/^[ \t]+/, '')
      stats.deindented++
    }

    const trimmed = line.trim()

    // ── 空行 ──
    if (trimmed === '') {
      if (blockDepth > 0) {
        // 组件内部空白原样保留，不做收敛
        out.push('')
        continue
      }
      if (lastIsBlank()) {
        stats.blankCollapsed++
        continue
      }
      pendingBlank = false
      lastWasImage = false
      lastWasQuote = false
      out.push('')
      continue
    }

    settlePendingBlank()

    const isBlockClose = BLOCK_CLOSE_RE.test(line)
    const isBlockOpen = !isBlockClose && BLOCK_OPEN_RE.test(line)

    // ── 块级组件开标签 ──
    if (isBlockOpen) {
      if (blockDepth === 0) ensureBlankBefore()
      lastWasImage = false
      lastWasQuote = false
      out.push(line)
      if (!closesOnSameLine(line)) {
        blockDepth++
        const container = line.match(/^<(steps|case-flow|timeline)\b/)
        if (container) listContainer = container[1]
      } else if (blockDepth === 0) {
        // 单行组件（`<p-title …></p-title>`）：自己也构成一整块
        pendingBlank = true
      }
      openVerbatim(line, (tag) => (verbatimTag = tag))
      continue
    }

    // ── 块级组件闭标签 ──
    if (isBlockClose) {
      lastWasImage = false
      lastWasQuote = false
      out.push(line)
      if (/^<\/(steps|case-flow|timeline)>/.test(line)) listContainer = null
      if (blockDepth > 0) blockDepth--
      if (blockDepth === 0) pendingBlank = true
      continue
    }

    // ── 普通行：标题 / 列表规范化 ──
    const heading = HEADING_RE.exec(line)
    if (heading && heading[2].trim()) {
      line = normalizeHeading(line, stats)
    } else if (TIGHT_QUOTE_RE.test(line)) {
      line = normalizeQuote(line, stats)
    } else if (!VERBATIM_OPEN_RE.test(line)) {
      line = normalizeList(line, stats)
    }
    // 列表型组件内一行写了多个条目：拆成多行，否则组件只会认第一个
    if (listContainer) {
      const parts = splitListItems(line, listContainer)
      if (parts.length > 1) {
        stats.itemsSplit++
        out.push(...parts)
        lastWasImage = false
        continue
      }
    }
    const isImageLine = STANDALONE_IMAGE_RE.test(line)
    const isFigureLine = isImageLine || GALLERY_LINE_RE.test(line)
    const isQuoteLine = ANY_QUOTE_RE.test(line)
    const isInnerTagLine = INNER_TAG_LINE_RE.test(line)
    // 引用块之前补空行：上一行不是引用行就补。
    // 引用与上一行贴着写时解析器不会粘在一起，但源码读起来像是同一段；
    // 连续的引用行（callout 的标题 + 正文）必须保持紧贴，所以只在「块开头」补。
    // 子标签/闭标签之前不补（`<left>` 下第一行、`</left>` 上一行）。
    if (isQuoteLine && !lastWasQuote && !isEmptyBlockStart() && !isInnerTagLine) {
      ensureBlankBefore()
      stats.quoteGaps++
    } else if (lastWasImage && !isFigureLine && !isInnerTagLine) {
      // 上一行是图片块、这一行又不是图片：补一个空行把它们分开
      ensureBlankBefore()
      stats.imageGaps++
    }
    lastWasImage = isFigureLine
    lastWasQuote = isQuoteLine
    out.push(line)
    openVerbatim(line, (tag) => (verbatimTag = tag))
  }

  // ── 围栏没闭合：补一行闭合标签，否则后面全被当成代码 ──
  if (fence) {
    out.push(fence.char.repeat(fence.len))
    stats.fencesClosed++
  }

  // ── 首尾空行清理，保证结尾恰好一个换行 ──
  while (out.length > 0 && out[0] === '') out.shift()
  while (out.length > 0 && out[out.length - 1] === '') out.pop()

  const text = out.length > 0 ? out.join('\n') + '\n' : ''
  return { text, stats, changed: text !== md }
}

/** 原样透传块：多行写法要把后续行一起跳过；单行写法立刻结束 */
function openVerbatim(line: string, set: (tag: string | null) => void) {
  const m = line.match(VERBATIM_OPEN_RE)
  if (!m) return
  const tag = m[0].slice(1)
  if (!line.includes(`</${tag}>`)) set(tag)
}

/** 把统计结果压成一句提示文案；什么都没做时返回空串 */
export function describeFormatStats(stats: FormatStats): string {
  const parts: string[] = []
  if (stats.deindented) parts.push(`标签去缩进 ${stats.deindented}`)
  if (stats.blankInserted) parts.push(`补空行 ${stats.blankInserted}`)
  if (stats.blankCollapsed) parts.push(`收敛空行 ${stats.blankCollapsed}`)
  if (stats.trailingSpaces) parts.push(`清行尾空白 ${stats.trailingSpaces}`)
  if (stats.headings) parts.push(`标题 ${stats.headings}`)
  if (stats.lists) parts.push(`列表 ${stats.lists}`)
  if (stats.quotes) parts.push(`引用 ${stats.quotes}`)
  if (stats.itemsSplit) parts.push(`拆多条目 ${stats.itemsSplit}`)
  if (stats.imageGaps) parts.push(`图片后空行 ${stats.imageGaps}`)
  if (stats.quoteGaps) parts.push(`引用前空行 ${stats.quoteGaps}`)
  if (stats.fencesClosed) parts.push(`补围栏闭合 ${stats.fencesClosed}`)
  return parts.join(' · ')
}
