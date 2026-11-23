/**
 * 素材边界注释。
 *
 * 一次插入的素材如果不是「单个成品组件」，就不知道从哪开始、到哪结束——用户手写的
 * 自由拼版（`container` + `row` + `column` + `text` 拼出来的）和纯 `<html>` 块尤其如此，
 * 里面每一块单独看都是合法组件，编辑器没法判断这一坨是一个整体还是三个独立组件。
 *
 * 所以在首尾包一对注释：
 * ```
 * <!-- 素材开始 -->
 * …素材内容…
 * <!-- 素材结束 -->
 * ```
 * 注释本身不进 Markdown 渲染（`markdownParser.ts` 主循环遇到 `<!--` 就整段跳过），
 * 也不进字数统计（`charCount.ts` 用 `<[^>]+>` 剥标签时会把整条注释吃掉），
 * 对排版和导出都是零影响，只作为「这一坨是一个素材」的标记。
 *
 * 与 `interactive-materials/gen.py` 生成片段时的写法保持一致（同样是首尾各一行注释）。
 */

import { COMPONENT_TAGS } from '@/utils/componentTags'

/** 边界注释（与 interactive-materials 的产物同一套标记，不要改字面量） */
export const MATERIAL_START = '<!-- 素材开始 -->'
export const MATERIAL_END = '<!-- 素材结束 -->'

/**
 * 布局零件 / 透传块：用来「搭」素材，本身不是一个成品组件。
 *
 * `html` 里装的是原生 HTML、`svg` 里是手写矢量图，都是零件而不是扩展组件。
 * （`interactive-materials` 生成的 `<svg>` 片段自带这对注释，会被 `hasMaterialBoundary()`
 * 提前放行，这里不会重复加。）
 */
const LAYOUT_TAGS = new Set([
  'container',
  'row',
  'column',
  'text',
  'stack',
  'positioned',
  'html',
  'svg',
])

/** 子标签：只可能出现在宿主组件内部，不该单独成素材 */
const SUB_TAGS = new Set(['left', 'right', 'slide', 'item'])

/**
 * 「一个成品组件」的标签集合 —— 命中这些才算单个扩展组件，才不需要边界注释。
 *
 * 从 `COMPONENT_TAGS` 里减掉布局零件和子标签，剩下的都是自带完整版式的卡片：
 * `steps` / `timeline` / `compare` / `cta` / `title` / `chart` …… 它们的开闭标签
 * 自己就把范围框死了，再加注释是噪音。新增组件时不用改这里，会自动算进来。
 */
const SOLO_TAGS = new Set([
  ...COMPONENT_TAGS.filter((tag) => !LAYOUT_TAGS.has(tag) && !SUB_TAGS.has(tag)),
  // `<img>` 不在 `COMPONENT_TAGS` 里（解析器走单行图片分支），但它自带完整外观，算一个组件
  'img',
])

interface FoundTag {
  tag: string
  closing: boolean
  selfClosing: boolean
  /** 标签起点（`<` 的位置） */
  start: number
  /** 开标签结束位置（`>` 之后），闭标签同样指向自己的 `>` 之后 */
  after: number
}

/** 从 `from` 开始找一个标签，跳过注释与 `<!…>` 声明；找不到返回 null */
function nextTag(text: string, from: number): FoundTag | null {
  let i = from
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) return null
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      i = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<!', lt) || text.startsWith('<?', lt)) {
      const end = text.indexOf('>', lt)
      i = end < 0 ? text.length : end + 1
      continue
    }
    const closing = text[lt + 1] === '/'
    const nameStart = closing ? lt + 2 : lt + 1
    const m = /^[a-zA-Z][\w-]*/.exec(text.slice(nameStart))
    if (!m) {
      i = lt + 1
      continue
    }
    // 从标签名之后扫到真正的 `>`：属性值引号里的 `>` 不算结束
    let j = nameStart + m[0].length
    let quote: string | null = null
    while (j < text.length) {
      const ch = text[j]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
      j += 1
    }
    if (j >= text.length) return null
    return {
      tag: m[0].toLowerCase(),
      closing,
      selfClosing: text[j - 1] === '/',
      start: lt,
      after: j + 1,
    }
  }
  return null
}

interface ElementSpan {
  tag: string
  /** 元素起点 */
  start: number
  /** 开标签结束后（正文起点） */
  openEnd: number
  /** 闭标签起点（正文终点） */
  closeStart: number
  /** 元素结束后 */
  end: number
}

/**
 * 取出一段文本的顶层元素。
 *
 * 用途只有一个——判断「整段是不是恰好一个元素」，所以遇到结构不成立（孤立闭标签、
 * 开标签没有配对）就直接返回 `ok: false`，交给调用方当成「不是单个组件」处理：
 * 宁可多加一对注释，也不要把拼出来的素材误判成单个组件。
 */
function topLevelElements(text: string): { elements: ElementSpan[]; ok: boolean } {
  const elements: ElementSpan[] = []
  let i = 0
  while (i < text.length) {
    const found = nextTag(text, i)
    if (!found) break
    if (found.closing) return { elements: [], ok: false }
    if (found.selfClosing) {
      elements.push({
        tag: found.tag,
        start: found.start,
        openEnd: found.after,
        closeStart: found.after,
        end: found.after,
      })
      i = found.after
      continue
    }
    let depth = 1
    let cursor = found.after
    let closeStart = -1
    let end = -1
    while (cursor < text.length) {
      const inner = nextTag(text, cursor)
      if (!inner) break
      if (inner.tag === found.tag && !inner.selfClosing) {
        if (inner.closing) {
          depth -= 1
          if (depth === 0) {
            closeStart = inner.start
            end = inner.after
            break
          }
        } else {
          depth += 1
        }
      }
      cursor = inner.after
    }
    if (end < 0) return { elements: [], ok: false }
    elements.push({ tag: found.tag, start: found.start, openEnd: found.after, closeStart, end })
    i = end
  }
  return { elements, ok: true }
}

/** 去掉元素占据的字符，剩下的是元素之间的文本 */
function textOutside(text: string, elements: ElementSpan[]): string {
  let out = ''
  let cursor = 0
  for (const el of elements) {
    out += text.slice(cursor, el.start)
    cursor = el.end
  }
  out += text.slice(cursor)
  return out
}

/** 是否已经带了这一对边界注释 */
export function hasMaterialBoundary(text: string): boolean {
  return text.includes(MATERIAL_START) && text.includes(MATERIAL_END)
}

/**
 * 这一行是不是「素材开始」注释（允许前后空白）。
 *
 * 给格式化用：注释要紧紧贴着素材代码，中间不留空行，
 * 所以需要按行识别这两条标记，不能只做全文 `includes`。
 */
export function isMaterialStartLine(line: string): boolean {
  return line.trim() === MATERIAL_START
}

/** 这一行是不是「素材结束」注释（允许前后空白） */
export function isMaterialEndLine(line: string): boolean {
  return line.trim() === MATERIAL_END
}

/**
 * 整段是否就是「单个成品组件」。
 *
 * 只有这种情况不加注释：素材本身是一个自带完整版式的组件（`<steps>`、`<compare>` …），
 * 它的开闭标签已经把范围圈住了。外层那层由 `wrapInContainer()` 自动补的
 * `<container display="block">` 要剥掉再看——否则所有 AI 素材都会被判成「不是单个组件」，
 * 规矩就失效了。
 */
export function isSingleComponent(text: string): boolean {
  let current = text.trim()
  if (!current) return false

  // 最多剥 5 层，防止异常输入把这里变成死循环
  for (let round = 0; round < 5; round += 1) {
    const { elements, ok } = topLevelElements(current)
    if (!ok) return false
    // 元素之外还有文字（Markdown 段落、纯文本），说明是拼出来的，不是单个组件
    if (textOutside(current, elements).trim()) return false
    if (elements.length !== 1) return false

    const only = elements[0]
    if (only.tag !== 'container') return SOLO_TAGS.has(only.tag)

    // 剥掉外层容器（AI 素材统一会包一层），看里面真正的内容
    const inner = current.slice(only.openEnd, only.closeStart).trim()
    if (!inner) return false
    current = inner
  }
  return false
}

/**
 * 整段里有没有顶层的 `<html>` 块（不管有没有别的东西在旁边）。
 *
 * 单独成一个判断，是因为它在两边的含义正好相反：
 * - 边界注释那边：`html` 在 `LAYOUT_TAGS` 里，不是成品组件，纯 `<html>` 素材要加注释；
 * - 容器那边：**`<html>` 块绝对不能套 `<container>`** —— 块内是按整宽写死的原生 HTML，
 *   再套一层带 `padding` / `bg` 的容器等于给它加了个壳，复制到公众号会多一层 section。
 *   只要出现顶层 `<html>`，这一段就整段不包（混写的情况也一样，宁可让用户自己补壳）。
 */
export function hasTopLevelHtmlBlock(text: string): boolean {
  const body = text.trim()
  if (!body) return false
  const { elements, ok } = topLevelElements(body)
  if (!ok) return false
  return elements.some((el) => el.tag === 'html')
}

/**
 * 插入文档前给素材加上边界注释；已经是单个成品组件、或已经带注释的，原样返回。
 */
export function wrapMaterialBoundary(text: string): string {
  const body = text.trim()
  if (!body) return text
  if (hasMaterialBoundary(body)) return body
  if (isSingleComponent(body)) return text
  return `${MATERIAL_START}\n${body}\n${MATERIAL_END}`
}
