import type { ThemeColors } from '@/composables/useTheme'
import hljs from 'highlight.js/lib/common'
import { leaf, esc, parseAttrs, parseAlignment, type Alignment } from './helpers'
import { inlineFormat } from './inlineFormat'
import { renderMath, preloadMathJax } from './mathRenderer'
import { parseCtaInline, parseCtaTag, parseCompare, parseCallout, parseGallery } from './components'
import { Title_DA01 } from '@/extension/Title_DA01'
import { Title_DA02 } from '@/extension/Title_DA02'
import { PTitle } from '@/extension/PTitle_DA01'
import { PTitle_DA02 } from '@/extension/PTitle_DA02'
import { Breaking_DA01 } from '@/extension/Breaking_DA01'
import { Steps_DA01 } from '@/extension/Steps_DA01'
import { Steps_DA02 } from '@/extension/Steps_DA02'
import { CaseFlow_DA01 } from '@/extension/CaseFlow_DA01'
import { Badges_DA01 } from '@/extension/Badges_DA01'
import { ReadingPath_DA01 } from '@/extension/ReadingPath_DA01'
import { Statement_DA01 } from '@/extension/Statement_DA01'
import { Lead_DA01 } from '@/extension/Lead_DA01'
import { Engage_DA01 } from '@/extension/Engage_DA01'
import { Engage_DA02 } from '@/extension/Engage_DA02'
import { Timeline_DA01 } from '@/extension/Timeline_DA01'
import { Slider_DA01 } from '@/extension/Slider_DA01'
import { Img_DA01 } from '@/extension/Img_DA01'
import { Chart_DA01 } from '@/extension/Chart_DA01'
import { Mermaid_DA01 } from '@/extension/Mermaid_DA01'
import { Table_DA01 } from '@/extension/Table_DA01'
import { Row_DA01 } from '@/extension/Row_DA01'
import { Column_DA01 } from '@/extension/Column_DA01'
import { Container_DA01 } from '@/extension/Container_DA01'
import { Text_DA01 } from '@/extension/Text_DA01'
import { Html_DA01 } from '@/extension/Html_DA01'
import { Stack_DA01 } from '@/extension/Stack_DA01'
import { Positioned_DA01 } from '@/extension/Positioned_DA01'

// 语法高亮配色（one-dark 风，配深色代码块底）。把 highlight.js 的 class 转成内联颜色，
// 这样预览和粘贴到公众号都能直接显示（不依赖外部样式表）。
const HL_COLORS: Record<string, string> = {
  keyword: '#c678dd',
  built_in: '#56b6c2',
  type: '#e5c07b',
  literal: '#56b6c2',
  number: '#d19a66',
  string: '#98c379',
  regexp: '#98c379',
  comment: '#7f848e',
  doctag: '#7f848e',
  meta: '#7f848e',
  title: '#61afef',
  attr: '#d19a66',
  attribute: '#d19a66',
  variable: '#e06c75',
  tag: '#e06c75',
  name: '#e06c75',
  params: '#abb2bf',
  property: '#e06c75',
  operator: '#56b6c2',
  symbol: '#56b6c2',
  selector: '#e06c75',
  bullet: '#61afef',
  link: '#98c379',
  quote: '#98c379',
  addition: '#98c379',
  deletion: '#e06c75',
  section: '#61afef',
  function: '#61afef',
}

// 单行高亮：highlight.js 出 class 标记，再把 class 换成内联 color（自包含，不依赖外部样式表）。
function highlightLine(rest: string, lang: string): string {
  let out: string
  try {
    out =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(rest, { language: lang }).value
        : hljs.highlightAuto(rest).value
  } catch {
    out = esc(rest)
  }
  return out.replace(/class="hljs-([a-z_]+)[^"]*"/g, (_m, c: string) =>
    HL_COLORS[c] ? `style="color:${HL_COLORS[c]}"` : '',
  )
}

/**
 * 收集 md 中所有公式（去重），按 inline/block 分类返回，用于预渲染。
 */
export function collectFormulas(md: string): Array<{ formula: string; display: boolean }> {
  const seen = new Set<string>()
  const result: Array<{ formula: string; display: boolean }> = []

  // 先删围栏代码块（行首锚定），再删行内代码（支持多重反引号嵌套）
  const cleaned = md.replace(/^```[\s\S]*?\n```/gm, '').replace(/(`+)(.*?)\1/gs, '')

  // 行内公式 $...$
  const inlineRe = /(?<!\$)(?<!\d)\$([^\$]+?)\$(?!\$|[\w])/g
  const pureNumberRe = /^\d+(\.\d+)?$/
  let m: RegExpExecArray | null
  while ((m = inlineRe.exec(cleaned)) !== null) {
    const f = m[1].trim()
    // 过滤纯数字（如 $100），避免误匹配货币金额
    if (pureNumberRe.test(f)) continue
    const key = `i:${f}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ formula: f, display: false })
    }
  }

  // 块级公式 $$...$$ （单行和多行）
  const blockRe = /\$\$([\s\S]+?)\$\$/g
  while ((m = blockRe.exec(cleaned)) !== null) {
    // 跳过空行 $$ $$ 前面的 $$
    if (m[0] === '$$') continue
    const f = m[1].trim()
    if (!f) continue
    const key = `b:${f}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ formula: f, display: true })
    }
  }

  return result
}

/**
 * 批量预渲染公式为 SVG。
 */
export async function preRenderFormulas(
  formulas: Array<{ formula: string; display: boolean }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const results = await Promise.all(
    formulas.map(async (f) => {
      const prefix = f.display ? 'b' : 'i'
      const svg = await renderMath(f.formula, f.display)
      return { key: `${prefix}:${f.formula}`, svg }
    }),
  )
  for (const { key, svg } of results) {
    map.set(key, svg)
  }
  return map
}

export interface ParagraphStyle {
  fontSize: number
  lineHeight: number
  fontWeight: string
  margin: number
  indent: string
}

/**
 * 一步完成：收集公式 → 预渲染 → 解析。
 * 推荐所有 caller 使用这个入口。
 */
export async function parseMarkdownAsync(
  md: string,
  t: ThemeColors,
  paragraphStyle?: ParagraphStyle,
): Promise<string> {
  const formulas = collectFormulas(md)
  const formulaMap = formulas.length > 0 ? await preRenderFormulas(formulas) : undefined
  return parseMarkdown(md, t, formulaMap, paragraphStyle)
}

export function parseMarkdown(
  md: string,
  t: ThemeColors,
  formulaMap?: Map<string, string>,
  paragraphStyle?: ParagraphStyle,
  depth = 0,
  lineOffset = 0,
): string {
  function withSourceLine(lineNo: number, html: string): string {
    // trimStart 后再匹配：render 返回的 HTML 往往以 \n 或缩进开头（模板字符串的格式空白），
    // 这些前导空白会让 /^<(\w+)/ 静默失败。分离 → 替换 → 拼回，确保 data-source-line 注入到第一个 HTML 标签。
    const trimmed = html.trimStart()
    const leadingWs = html.slice(0, html.length - trimmed.length)
    return (
      leadingWs + trimmed.replace(/^<(\w+)/, `<$1 data-source-line="${lineNo + lineOffset + 1}"`)
    )
  }

  /**
   * 解析一段列表（支持多级嵌套缩进）。
   * 返回 { html, next }：html 为整段列表（含外层包裹 section）的 HTML，next 为消费结束的下标。
   */
  function parseListBlock(
    i: number,
    indent: number,
    ordered: boolean,
    isTopLevel: boolean,
  ): { html: string; next: number } {
    const itemRe = ordered
      ? /^([ \t]*)(\d+)\.\s+(.*)$/
      : /^([ \t]*)[-*+]\s+(.*)$/
    let html = ''
    let num = 0
    while (i < lines.length) {
      const line = lines[i]
      const m = line.match(itemRe)
      if (!m) break
      const lineIndent = m[1].replace(/\t/g, '  ').length
      if (lineIndent !== indent) break
      const content = ordered ? m[3] : m[2]
      i++

      let itemHtml: string
      const cb = content.match(/^\[([ x])\]\s*(.*)/)
      if (cb) {
        const isChecked = cb[1] === 'x'
        const boxStyle = isChecked
          ? `background:${t.accent};border-color:${t.accent}`
          : `border-color:${t.border}`
        const uncheckedBorder = t.border === '#e2e8f0' ? '#94a3b8' : t.border
        const checkSvg = isChecked
          ? '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 9l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="16" rx="3" stroke="${uncheckedBorder}" stroke-width="1.5" fill="none"/></svg>`
        itemHtml = `<section style="margin:5px 0px"><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;${isChecked ? `background:${t.accent};border-radius:4px` : ''}">${checkSvg}</span><span>${inlineFormat(cb[2], t, formulaMap)}</span></span></section>`
      } else if (ordered) {
        num = num === 0 ? (m[2] ? parseInt(m[2], 10) : 1) : num + 1
        itemHtml = `<section style="margin:5px 0px;display:flex;align-items:flex-start;gap:6px"><span style="color:${t.accent};font-weight:700;flex-shrink:0;">${num}.</span><span style="word-break:break-all;overflow-wrap:break-word;min-width:0">${inlineFormat(content, t, formulaMap)}</span></section>`
      } else {
        itemHtml = `<section style="margin:5px 0px;display:flex;align-items:flex-start;gap:6px"><span style="color:${t.accent};font-size:15px;line-height:1.8;flex-shrink:0;transform:scale(0.6)">●</span><span style="word-break:break-all;overflow-wrap:break-word;min-width:0">${inlineFormat(content, t, formulaMap)}</span></section>`
      }
      html += itemHtml

      // 嵌套子列表：下一行缩进更深且为列表项时递归解析
      if (i < lines.length) {
        const nm = lines[i].match(/^([ \t]*)([-*+]|\d+\.)\s/)
        if (nm) {
          const ni = nm[1].replace(/\t/g, '  ').length
          if (ni > indent) {
            const nestedOrdered = /^\d+\./.test(nm[2])
            const nested = parseListBlock(i, ni, nestedOrdered, false)
            html += nested.html
            i = nested.next
          }
        }
      }
    }
    const style = isTopLevel
      ? `margin:${ordered ? '10px' : '24px'} 0px;padding-left:24px`
      : `margin:5px 0px 0px;padding-left:24px`
    return { html: `<section style="${style}">${html}</section>`, next: i }
  }

  // 收集脚注：[text](url "desc") 带引号标题的链接 → 脚注
  const footnotes: { label: string; url: string; desc: string }[] = []
  const footnoteRegex = /\[([^\]]+)\]\(([^)\s]+)\s+"([^"]+)"\)/g
  const processedMd = md.replace(footnoteRegex, (_match, label, url, desc) => {
    // 检查是否已存在相同的脚注（根据 url 和 desc 判断）
    const existing = footnotes.findIndex((f) => f.url === url && f.desc === desc)
    let num: number
    if (existing >= 0) {
      // 已存在，复用序号
      num = existing + 1
    } else {
      // 新脚注，分配新序号
      num = footnotes.length + 1
      footnotes.push({ label, url, desc })
    }
    return `__FN_${num - 1}__|${label}|`
  })

  const lines = processedMd.split('\n')
  let html = ''
  let i = 0

  // 收集 p-title level1（用于 <reading-path> 标签）
  const pTitleLevel1List: { num: string; title: string; subtitle: string }[] = []
  for (let j = 0; j < lines.length; j++) {
    // 匹配 <p-title ...> 标签
    const ptMatch = lines[j].match(/^<p-title\b([^>]*)>([\s\S]*?)<\/p-title>/)
    if (ptMatch) {
      const attrs = parseAttrs(ptMatch[1])
      const level = parseInt(attrs.level || '1', 10)
      if (level === 1) {
        const num = attrs.num || ''
        const title = attrs.title || ptMatch[2].trim()
        const subtitle = attrs.subtitle || ''
        pTitleLevel1List.push({ num, title, subtitle })
      }
    }
  }

  /**
   * 通用块级标签 body 收集器。
   *
   * 单行模式：开标签同行有闭标签 → 直接取中间内容。
   * 多行模式：从 startIdx+1 开始收集，按 tagName 追踪嵌套深度，直到匹配的闭标签。
   *
   * @param lines       行数组
   * @param startIdx    开标签所在行索引
   * @param tagName     标签名（不含 < >），如 'row'、'column'
   * @param openLineRest 开标签同行可能存在的剩余内容（单行模式用，多行模式下作为 body 第一行）
   * @param allowSingle 是否支持单行模式（开标签同行闭标签）。false 表示开标签必须独占一行（如 <row>）
   * @returns { bodyText, next } bodyText 已 trim，next 指向闭标签后的下一行
   */
  function collectBlockBody(
    startIdx: number,
    tagName: string,
    openLineRest: string | null,
    allowSingle: boolean,
  ): { bodyText: string; next: number } {
    // 单行模式：<tag ...>content</tag>
    if (
      allowSingle &&
      openLineRest !== null &&
      new RegExp(`</${tagName}>\\s*$`).test(openLineRest)
    ) {
      const bodyText = openLineRest.replace(new RegExp(`</${tagName}>\\s*$`), '').trim()
      return { bodyText, next: startIdx + 1 }
    }

    // 多行模式：追踪嵌套深度
    const openRe = new RegExp(`<\\s*${tagName}\\b`, 'g')
    const closeRe = new RegExp(`</${tagName}>`, 'g')
    let j = startIdx + 1
    let body = openLineRest !== null ? openLineRest + '\n' : ''
    let depth = 1
    while (j < lines.length && depth > 0) {
      const openCount = (lines[j].match(openRe) || []).length
      const closeCount = (lines[j].match(closeRe) || []).length
      if (openCount > 0 || closeCount > 0) {
        depth += openCount - closeCount
        if (depth > 0) body += lines[j] + '\n'
      } else {
        body += lines[j] + '\n'
      }
      j++
    }
    return { bodyText: body.trim(), next: j }
  }

  /**
   * 递归解析 <row> 标签及其内部的 <column> 子标签。
   * Column 的 body 通过递归调用 parseMarkdown 支持完整 Markdown 及嵌套 <row>。
   */
  function parseRowTag(startIdx: number): { html: string; next: number } {
    const openMatch = lines[startIdx].match(/^<row\b([^>]*)>/)
    const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}

    const { bodyText, next } = collectBlockBody(startIdx, 'row', null, false)
    const innerHtml = bodyText
      ? parseMarkdown(bodyText, t, formulaMap, paragraphStyle, depth + 1, startIdx + 1 + lineOffset)
      : ''

    return { html: Row_DA01.render(attrs, innerHtml, t), next }
  }

  /**
   * 递归解析 <column> 标签及其内部的 <row> 子标签。
   * Body 通过递归调用 parseMarkdown 支持完整 Markdown 及嵌套 <row>/<column>。
   */
  function parseColumnTag(startIdx: number): { html: string; next: number } {
    const openMatch = lines[startIdx].match(/^<column\b([^>]*)>(.*)$/)
    const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
    const rest = openMatch?.[2] ?? null

    const { bodyText, next } = collectBlockBody(startIdx, 'column', rest, true)
    const bodyHtml = bodyText
      ? parseMarkdown(bodyText, t, formulaMap, paragraphStyle, depth + 1, startIdx + lineOffset)
      : ''
    return { html: Column_DA01.render(attrs, bodyHtml, t), next }
  }

  /**
   * 递归解析 <container> 标签，不含深度限制。
   */
  function parseContainerTag(startIdx: number): { html: string; next: number } {
    const openMatch = lines[startIdx].match(/^<container\b([^>]*)>(.*)$/)
    const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
    const rest = openMatch?.[2] ?? null

    const { bodyText, next } = collectBlockBody(startIdx, 'container', rest, true)
    const bodyHtml = bodyText
      ? parseMarkdown(bodyText, t, formulaMap, paragraphStyle, depth, startIdx + lineOffset)
      : ''
    return { html: Container_DA01.render(attrs, bodyHtml, t), next }
  }

  /**
   * 解析 <text> 行内标签（单行）。
   */
  function parseTextTag(startIdx: number): { html: string; next: number } {
    const line = lines[startIdx]
    const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g
    let html = line
    let m
    while ((m = re.exec(line)) !== null) {
      const attrs = parseAttrs(m[1])
      const body = m[2]
      html = html.replace(m[0], Text_DA01.render(attrs, body, t))
    }
    return { html, next: startIdx + 1 }
  }

  /**
   * 解析 <html> 标签，直接透出 body 内容，不做任何解析转义。
   */
  function parseHtmlTag(startIdx: number): { html: string; next: number } {
    const openMatch = lines[startIdx].match(/^<html\b([^>]*)>(.*)$/)
    const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}

    // 单行模式：<html>content</html>
    if (openMatch && openMatch[2] && /<\/html>\s*$/.test(openMatch[2])) {
      const body = openMatch[2].replace(/<\/html>\s*$/, '')
      return { html: Html_DA01.render(attrs, body, t), next: startIdx + 1 }
    }

    // 多行模式：收集直到 </html>
    let j = startIdx + 1
    const bodyLines: string[] = []
    while (j < lines.length && !/^<\/html>/.test(lines[j])) {
      bodyLines.push(lines[j])
      j++
    }
    j++ // skip </html>
    const body = bodyLines.join('\n')
    return { html: Html_DA01.render(attrs, body, t), next: j }
  }

  /**
   * <stack> — 层叠舞台容器，递归解析内部 Markdown
   * 自身可嵌套（depth<4），内部 Positioned 表达式随后由主循环匹配
   */
  function parseStackTag(startIdx: number): { html: string; next: number } {
    const openMatch = lines[startIdx].match(/^<stack\b([^>]*)>(.*)$/)
    if (!openMatch) return { html: lines[startIdx], next: startIdx + 1 }
    const attrs = parseAttrs(openMatch[1])
    const rest = openMatch[2] ?? null

    const { bodyText, next } = collectBlockBody(startIdx, 'stack', rest, true)
    const bodyHtml = bodyText
      ? parseMarkdown(bodyText, t, formulaMap, paragraphStyle, depth + 1, startIdx + 1 + lineOffset)
      : ''
    return { html: Stack_DA01.render(attrs, bodyHtml, t), next }
  }

  /**
   * <positioned> — 定位子层（只能在 Stack 内使用）
   * content 递归解析 Markdown
   */
  function parsePositionedTag(startIdx: number): { html: string; next: number } {
    const openMatch = lines[startIdx].match(/^<positioned\b([^>]*)>(.*)$/)
    if (!openMatch) return { html: lines[startIdx], next: startIdx + 1 }
    const attrs = parseAttrs(openMatch[1])
    const rest = openMatch[2] ?? null

    const { bodyText, next } = collectBlockBody(startIdx, 'positioned', rest, true)
    const bodyHtml = bodyText
      ? parseMarkdown(bodyText, t, formulaMap, paragraphStyle, depth + 1, startIdx + 1 + lineOffset)
      : ''
    return { html: Positioned_DA01.render(attrs, bodyHtml, t), next }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }
    // 跳过 HTML 注释：支持单行注释和跨行注释
    if (/^\s*<!--/.test(line)) {
      if (/^\s*<!--.*-->\s*$/.test(line)) {
        // 单行注释：<!-- ... -->
        i++
        continue
      }
      // 多行注释：跳过直到找到 -->
      let commentDepth = 1
      i++
      while (i < lines.length && commentDepth > 0) {
        if (/^\s*<!--/.test(lines[i])) commentDepth++
        if (/-->\s*$/.test(lines[i])) commentDepth--
        if (commentDepth > 0) i++
      }
      if (i < lines.length && /-->\s*$/.test(lines[i])) i++
      continue
    }
    if (/^---+\s*$/.test(line.trim())) {
      html += withSourceLine(
        i,
        `<section style="border:none;height:1px;background:linear-gradient(90deg,transparent,rgb(221,221,221),transparent);margin:24px 0px"></section>`,
      )
      i++
      continue
    }

    // <container> — 通用容器
    if (/^<container\b/.test(line)) {
      const containerStartLine = i
      const r = parseContainerTag(i)
      html += withSourceLine(containerStartLine, r.html)
      i = r.next
      continue
    }

    // <text> — 行内文本样式
    if (/^<text\b/.test(line)) {
      const textStartLine = i
      const r = parseTextTag(i)
      html += withSourceLine(textStartLine, r.html)
      i = r.next
      continue
    }

    // <html> — 原生 HTML 透传
    if (/^<html\b/.test(line)) {
      const htmlStartLine = i
      const r = parseHtmlTag(i)
      html += withSourceLine(htmlStartLine, r.html)
      i = r.next
      continue
    }

    // <stack> — 层叠舞台容器
    if (/^<stack\b/.test(line)) {
      const stackStartLine = i
      const r = parseStackTag(i)
      html += withSourceLine(stackStartLine, r.html)
      i = r.next
      continue
    }

    // <positioned> — 定位子层（需在 stack 内）
    if (/^<positioned\b/.test(line)) {
      const posStartLine = i
      const r = parsePositionedTag(i)
      html += withSourceLine(posStartLine, r.html)
      i = r.next
      continue
    }

    // <row> — 行布局容器（递归解析，支持嵌套，最多四层）
    if (depth < 4 && /^<row\b/.test(line)) {
      const rowStartLine = i
      const r = parseRowTag(i)
      html += withSourceLine(rowStartLine, r.html)
      i = r.next
      continue
    }

    // <column> — 列布局容器（递归解析，支持嵌套 <row>，最多四层）
    if (depth < 4 && /^<column\b/.test(line)) {
      const columnStartLine = i
      const r = parseColumnTag(i)
      html += withSourceLine(columnStartLine, r.html)
      i = r.next
      continue
    }

    // <steps>
    if (/^<steps\b/.test(line)) {
      const stepsStartLine = i
      const openMatch = line.match(/^<steps\b([^>]*)>/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      i++
      let body = ''
      while (i < lines.length && !/^<\/steps>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // skip </steps>
      const stepsRenderer = attrs.type === 'DA02' ? Steps_DA02 : Steps_DA01
      html += withSourceLine(stepsStartLine, stepsRenderer.render(attrs, body.trim(), t))
      continue
    }
    // <statement> ... </statement>
    if (/^<statement\b/.test(line)) {
      const statementStartLine = i
      const openMatch = line.match(/^<statement\b([^>]*)>(.*)$/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      // 单行模式
      if (openMatch && openMatch[2] && /<\/statement>\s*$/.test(openMatch[2])) {
        const text = openMatch[2].replace(/<\/statement>\s*$/, '').trim()
        html += withSourceLine(statementStartLine, Statement_DA01.render(attrs, text, t))
        i++
        continue
      }
      // 多行模式
      let text = openMatch && openMatch[2] ? openMatch[2] + '\n' : ''
      i++
      while (i < lines.length && !/^<\/statement>/.test(lines[i])) {
        text += lines[i]
        i++
      }
      i++
      html += withSourceLine(statementStartLine, Statement_DA01.render(attrs, text.trim(), t))
      continue
    }
    // <badges> ... </badges> (支持单行和多行)
    if (/^<badges\b/.test(line)) {
      const badgesStartLine = i
      const openMatch = line.match(/^<badges\b([^>]*)>(.*)$/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      // 单行模式：<badges ...>content</badges>
      if (openMatch && openMatch[2] && /<\/badges>\s*$/.test(openMatch[2])) {
        const body = openMatch[2].replace(/<\/badges>\s*$/, '').trim()
        html += withSourceLine(badgesStartLine, Badges_DA01.render(attrs, body, t))
        i++
        continue
      }
      // 多行模式：内容在后续行
      let body = openMatch && openMatch[2] ? openMatch[2] + '\n' : ''
      i++
      while (i < lines.length && !/^<\/badges>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // skip </badges>
      html += withSourceLine(badgesStartLine, Badges_DA01.render(attrs, body.trim(), t))
      continue
    }
    // <lead> ... </lead>
    if (/^<lead\b/.test(line)) {
      const leadStartLine = i
      const openMatch = line.match(/^<lead\b([^>]*)>(.*)$/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      // 单行模式
      if (openMatch && openMatch[2] && /<\/lead>\s*$/.test(openMatch[2])) {
        const text = openMatch[2].replace(/<\/lead>\s*$/, '').trim()
        html += withSourceLine(leadStartLine, Lead_DA01.render(attrs, text, t))
        i++
        continue
      }
      // 多行模式
      let text = openMatch && openMatch[2] ? openMatch[2] + '\n' : ''
      i++
      while (i < lines.length && !/^<\/lead>/.test(lines[i])) {
        text += lines[i]
        i++
      }
      i++
      html += withSourceLine(leadStartLine, Lead_DA01.render(attrs, text.trim(), t))
      continue
    }
    // <breaking>
    if (/^<breaking\b/.test(line)) {
      const breakingStartLine = i
      const openMatch = line.match(/^<breaking\b([^>]*)>/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      i++
      let body = ''
      while (i < lines.length && !/^<\/breaking>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // skip </breaking>
      html += withSourceLine(breakingStartLine, Breaking_DA01.render(attrs, body.trim(), t))
      continue
    }
    // <cta>
    if (/^<cta\b/.test(line)) {
      const ctaStartLine = i
      if (/\/>\s*$/.test(line)) {
        // 自闭合行内形式：<cta .../>
        const r = parseCtaInline(lines, i, t)
        html += withSourceLine(ctaStartLine, r.html)
        i = r.next
      } else {
        // 前窥后续是否存在 </cta> 关闭标签，有则走标签形式，否则按行内处理
        let hasClosingCta = false
        for (let peek = i + 1; peek < lines.length && peek <= i + 3; peek++) {
          if (/^<\/cta>/.test(lines[peek])) {
            hasClosingCta = true
            break
          }
        }
        if (hasClosingCta) {
          const r = parseCtaTag(lines, i, t)
          html += withSourceLine(ctaStartLine, r.html)
          i = r.next
        } else {
          const r = parseCtaInline(lines, i, t)
          html += withSourceLine(ctaStartLine, r.html)
          i = r.next
        }
      }
      continue
    }
    // <compare>
    if (/^<compare\b/.test(line)) {
      const compareStartLine = i
      const r = parseCompare(lines, i, t)
      html += withSourceLine(compareStartLine, r.html)
      i = r.next
      continue
    }
    // <reading-path> 或 <reading-path />（支持属性如 margin="10px"）
    if (/^<reading-path\b/.test(line)) {
      const attrsStr = line.match(/^<reading-path\b([^>]*)>?/)?.[1] || ''
      const attrs = parseAttrs(attrsStr)
      const rendered = ReadingPath_DA01.render(attrs, pTitleLevel1List, t)
      html += withSourceLine(i, rendered)
      // 跳过闭合标签（如果有）
      if (
        /^<reading-path>/.test(line) &&
        i + 1 < lines.length &&
        /^<\/reading-path>/.test(lines[i + 1])
      ) {
        i += 2
      } else {
        i++
      }
      continue
    }
    // <title> 标签（通过 type 属性选择样式：DA01/DA02/...）
    if (/^<title\b/.test(line)) {
      const titleMatch = line.match(/^<title\b([^>]*)>([\s\S]*?)<\/title>/)
      if (titleMatch) {
        const attrs = parseAttrs(titleMatch[1])
        const body = titleMatch[2].trim()
        const type = (attrs.type || 'DA01').toUpperCase()
        if (type === 'DA02') {
          html += withSourceLine(i, Title_DA02.render(attrs, body, t, md))
        } else {
          html += withSourceLine(i, Title_DA01.render(attrs, body, t, md))
        }
      }
      i++
      continue
    }

    // <p-title> 段落标题标签
    if (/^<p-title\b/.test(line)) {
      const ptMatch = line.match(/^<p-title\b([^>]*)>([\s\S]*?)<\/p-title>/)
      if (ptMatch) {
        const attrs = parseAttrs(ptMatch[1])
        const body = ptMatch[2].trim()
        // 给根节点打个标记（不影响样式），分页时用它避免小节标题落在页底跟正文分家
        const pTitleRenderer = attrs.type === 'DA02' ? PTitle_DA02 : PTitle
        html += withSourceLine(
          i,
          pTitleRenderer.render(attrs, body, t).replace('<section', '<section data-block="ptitle"'),
        )
      }
      i++
      continue
    }

    // < ![
    if (/^<\s*!\[/.test(line)) {
      const galleryStartLine = i
      const r = parseGallery(lines, i)
      html += withSourceLine(galleryStartLine, r.html)
      i = r.next
      continue
    }
    // > [TIP] etc
    if (/^>\s*\[(TIP|NOTE|WARNING|CAUTION|IMPORTANT)\]/.test(line)) {
      const calloutStartLine = i
      const r = parseCallout(lines, i, t)
      html += withSourceLine(calloutStartLine, r.html)
      i = r.next
      continue
    }
    // > quote
    if (/^>\s/.test(line)) {
      const quoteStartLine = i
      const ql: string[] = []
      while (i < lines.length && /^>\s/.test(lines[i])) {
        ql.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      html += withSourceLine(
        quoteStartLine,
        `<section style="margin:14px 0px;padding:12px 16px;background:rgb(247,248,252);border-left:3px solid ${t.accent};border-radius:0px 6px 6px 0px;color:rgb(85,85,85);font-size:14px">`,
      )
      ql.forEach((l) => {
        html += `<section><p style="margin:4px 0px">${inlineFormat(l, t, formulaMap)}</p></section>`
      })
      html += `</section>`
      continue
    }
    // <case-flow> 标签
    if (/^<case-flow\b/.test(line)) {
      const caseFlowStartLine = i
      const openMatch = line.match(/^<case-flow\b([^>]*)>/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      i++
      let body = ''
      while (i < lines.length && !/^<\/case-flow>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // skip </case-flow>
      html += withSourceLine(caseFlowStartLine, CaseFlow_DA01.render(attrs, body.trim(), t))
      continue
    }
    // 案例流（行内语法，无标签包裹时）
    if (/^-\s*\[案例\s*\d+\]/.test(line)) {
      const caseFlowInlineStartLine = i
      const caseLines: string[] = []
      while (i < lines.length && /^-\s*\[案例\s*\d+\]/.test(lines[i])) {
        caseLines.push(lines[i])
        i++
      }
      html += withSourceLine(
        caseFlowInlineStartLine,
        CaseFlow_DA01.render({}, caseLines.join('\n'), t),
      )
      continue
    }
    // <timeline> 标签
    if (/^<timeline\b/.test(line)) {
      const timelineStartLine = i
      const openMatch = line.match(/^<timeline\b([^>]*)>/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      i++
      let body = ''
      while (i < lines.length && !/^<\/timeline>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // skip </timeline>
      html += withSourceLine(timelineStartLine, Timeline_DA01.render(attrs, body.trim(), t))
      continue
    }
    // <slider> 标签
    if (/^<slider\b/.test(line)) {
      const sliderStartLine = i
      const openMatch = line.match(/^<slider\b([^>]*)>(.*)$/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}
      // 单行模式：<slider ...>content</slider>
      if (openMatch && openMatch[2] && /<\/slider>\s*$/.test(openMatch[2])) {
        const body = openMatch[2].replace(/<\/slider>\s*$/, '').trim()
        html += withSourceLine(sliderStartLine, Slider_DA01.render(attrs, body, t))
        i++
        continue
      }
      // 多行模式：内容在后续行
      let body = openMatch && openMatch[2] ? openMatch[2] + '\n' : ''
      i++
      while (i < lines.length && !/^<\/slider>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // skip </slider>
      html += withSourceLine(sliderStartLine, Slider_DA01.render(attrs, body.trim(), t))
      continue
    }
    // <engage>
    if (/^<engage\b/.test(line)) {
      const engageStartLine = i
      const attrs = parseAttrs(line)
      // type="DA02" 使用彩色图标版，否则默认 DA01
      if (attrs.type && attrs.type.toUpperCase() === 'DA02') {
        html += withSourceLine(engageStartLine, Engage_DA02.render(attrs, '', t))
      } else {
        html += withSourceLine(engageStartLine, Engage_DA01.render(attrs, '', t))
      }
      i++
      continue
    }

    // 标题 — Markdown 原生语法，不走 PTitle
    const h1m = line.match(/^#\s+(.+)/)
    if (h1m) {
      html += withSourceLine(
        i,
        `<h1 style="margin:0px 0px 16px;font-size:24px;font-weight:700;color:var(--text-primary);line-height:1.4">${inlineFormat(h1m[1], t, formulaMap)}</h1>`,
      )
      i++
      continue
    }

    const h2m = line.match(/^##\s+(.+)/)
    if (h2m) {
      html += withSourceLine(
        i,
        `<h2 style="margin:28px 0px 12px;font-size:20px;font-weight:700;color:var(--text-primary);line-height:1.4">${inlineFormat(h2m[1], t, formulaMap)}</h2>`,
      )
      i++
      continue
    }

    const h3m = line.match(/^###\s+(.+)/)
    if (h3m) {
      html += withSourceLine(
        i,
        `<h3 style="margin:24px 0px 10px;font-size:17px;font-weight:700;color:var(--text-primary);line-height:1.4">${inlineFormat(h3m[1], t, formulaMap)}</h3>`,
      )
      i++
      continue
    }

    const h4m = line.match(/^####\s+(.+)/)
    if (h4m) {
      html += withSourceLine(
        i,
        `<h4 style="margin:20px 0px 8px;font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.4">${inlineFormat(h4m[1], t, formulaMap)}</h4>`,
      )
      i++
      continue
    }

    // 块级公式 $$...$$ — 优先取 formulaMap 中的预渲染 SVG
    if (/^\$\$/.test(line)) {
      // 辅助函数：获取 SVG 或降级为公式原文
      const resolveSvg = (f: string) => {
        const svg = formulaMap?.get(`b:${f}`)
        if (svg) return svg
        // 降级：显示公式原文，方便排查 formulaMap 缺失的情况
        return `<code style="display:inline-block;background:var(--hl-code-bg);padding:6px 12px;border-radius:6px;font-size:14px;font-family:SF Mono,Consolas,monospace;color:var(--hl-str);max-width:100%;overflow-x:auto;white-space:nowrap">$${esc(f)}$$</code>`
      }
      // 单行模式：$$formula$$
      const singleMatch = line.match(/^\$\$(.+?)\$\$/)
      if (singleMatch) {
        const formula = singleMatch[1].trim()
        html += withSourceLine(
          i,
          `<section style="overflow-x:auto;margin:24px 0;color:var(--text-primary)"><section style="display:inline-block;white-space:nowrap;text-align:center;max-width:none!important">${resolveSvg(formula)}</section></section>`,
        )
        i++
        continue
      }
      // 多行模式：$$ 独占一行开头 → 收集行直到闭合 $$
      const formulaStartLine = i
      i++
      const formulaLines: string[] = []
      while (i < lines.length && !/^\$\$/.test(lines[i])) {
        formulaLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // 跳过闭合的 $$
      const formula = formulaLines.join('\n').trim()
      html += withSourceLine(
        formulaStartLine,
        `<section style="overflow-x:auto;margin:24px 0;color:var(--text-primary)"><section style="display:inline-block;white-space:nowrap;text-align:center;max-width:none!important">${resolveSvg(formula)}</section></section>`,
      )
      continue
    }

    // 代码块：用微信自带的 code-snippet 结构（外层 <section> + <pre class="…code-snippet_nowrap">
    // + 每行一个 block <code>）。微信 code-snippet 会合并 <code> 内所有 <span>，因此 highlight
    // token 改用 <section> 标签（微信不合并 section），同时设 display:inline 保持同行排列。

    // <mermaid> 标签语法（支持自定义宽高对齐，优先于代码块语法）
    if (/^<mermaid\b/.test(line)) {
      const mermaidStartLine = i
      const openMatch = line.match(/^<mermaid\b([^>]*)>(.*)$/)
      const attrs = openMatch && openMatch[1] ? parseAttrs(openMatch[1]) : {}

      // 单行模式：<mermaid ...>code</mermaid>
      if (openMatch && openMatch[2]) {
        const closeIdx = openMatch[2].indexOf('</mermaid>')
        if (closeIdx >= 0) {
          const body = openMatch[2].slice(0, closeIdx)
          html += withSourceLine(mermaidStartLine, Mermaid_DA01.render(attrs, body))
          i++
          continue
        }
      }

      // 多行模式：收集行直到 </mermaid>
      i++
      const bodyLines: string[] = []
      while (i < lines.length) {
        const ci = lines[i].indexOf('</mermaid>')
        if (ci >= 0) {
          bodyLines.push(lines[i].slice(0, ci))
          i++
          break
        }
        bodyLines.push(lines[i])
        i++
      }
      html += withSourceLine(mermaidStartLine, Mermaid_DA01.render(attrs, bodyLines.join('\n')))
      continue
    }

    if (/^```/.test(line)) {
      const lang = line.replace(/^`+/, '').trim() || 'text'
      const codeStartLine = i
      i++
      const codeLines: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // 跳过结尾的 ```

      let codeInner = ''
      for (const ln of codeLines) {
        const lead = (ln.match(/^[ \t]*/) || [''])[0]
        const indent = lead.replace(/\t/g, '  ').replace(/ /g, '&nbsp;')
        const rest = ln.slice(lead.length)
        const hl = rest
          ? highlightLine(rest, lang).replace(/<\/span> <span/g, '</span>&nbsp;<span')
          : ''
        const body = indent + hl || '&nbsp;'
        codeInner += `<section leaf="" style="white-space:nowrap">${body}</section>`
      }
      html += withSourceLine(
        codeStartLine,
        `<section data-lang="${esc(lang)}" style="white-space:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;background:rgb(30,30,46);color:rgb(205,214,244);padding:14px 16px;border-radius:8px;margin:24px 0;font-size:12.5px;line-height:1.6;font-family:SFMono-Regular,Consolas,Monaco,monospace">${codeInner}</section>`,
      )
      continue
    }

    // <table> 扩展标签（优先于原生表格解析）
    if (/^<table\b/.test(line)) {
      const tableExtStartLine = i
      const openMatch = line.match(/^<table\b([^>]*)>/)
      const attrs = parseAttrs(openMatch ? openMatch[1] : '')
      i++
      // 收集 body 直到 </table>
      let body = ''
      while (i < lines.length && !/^<\/table>/.test(lines[i])) {
        body += lines[i] + '\n'
        i++
      }
      i++ // 跳过 </table>
      html += withSourceLine(tableExtStartLine, Table_DA01.render(attrs, body.trim(), t))
      continue
    }

    // 表格
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && /\|[\s-:]+\|/.test(lines[i + 1])) {
      const tableStartLine = i
      // 先掐掉首尾装饰性管道再 split，这样中间的空格会原样保留为 ''
      let headerLine = line.trim()
      if (headerLine.startsWith('|')) headerLine = headerLine.slice(1)
      if (headerLine.endsWith('|')) headerLine = headerLine.slice(0, -1)
      const headers = headerLine.split('|').map((s) => s.trim())

      // 解析分隔行 → 提取列对齐
      let sepLine = lines[i + 1].trim()
      if (sepLine.startsWith('|')) sepLine = sepLine.slice(1)
      if (sepLine.endsWith('|')) sepLine = sepLine.slice(0, -1)
      const alignments: Alignment[] = sepLine.split('|').map(parseAlignment)

      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim() !== '') {
        let cellLine = lines[i].trim()
        if (cellLine.startsWith('|')) cellLine = cellLine.slice(1)
        if (cellLine.endsWith('|')) cellLine = cellLine.slice(0, -1)
        const cells = cellLine.split('|').map((s) => s.trim())
        rows.push(cells)
        i++
      }
      html += withSourceLine(
        tableStartLine,
        `<section style="margin:24px 0px;box-shadow:rgba(15,23,42,0.05) 0px 10px 24px;border-radius:14px;border:1px solid rgba(229,231,235,0.9);overflow:hidden;background:linear-gradient(135deg,rgb(248,250,252) 0%,rgb(238,244,251) 100%)"><section style="padding:20px 20px;background:rgba(255,255,255,0.92)"><section class="tableWrapper" style="width:100%"><table style="border:0px;border-collapse:collapse;table-layout:fixed;min-width:115px;width:100%"><thead><tr>`,
      )
      headers.forEach((h, hi) => {
        const al: Alignment = alignments[hi] || 'left'
        html += `<td valign="top" align="${al === 'center' ? 'center' : al === 'right' ? 'right' : 'left'}" style="vertical-align:top;border:0px;padding:0px;text-align:${al};font-size:13px;font-weight:700;color:rgb(51,65,85)">${inlineFormat(h, t, formulaMap)}</td>`
      })
      html += `</tr></thead><tbody>`
      rows.forEach((r) => {
        html += `<tr>`
        r.forEach((c, ci) => {
          const al: Alignment = alignments[ci] || 'left'
          html += `<td valign="top" align="${al === 'center' ? 'center' : al === 'right' ? 'right' : 'left'}" style="vertical-align:top;border:0px;padding:0px;text-align:${al};font-size:13px;color:rgb(51,65,85)">${inlineFormat(c, t, formulaMap)}</td>`
        })
        html += `</tr>`
      })
      html += `</tbody></table></section></section></section>`
      continue
    }

    // 无序列表
    if (/^[-*+]\s/.test(line)) {
      const listStartLine = i
      const parsed = parseListBlock(i, 0, false, true)
      html += withSourceLine(listStartLine, parsed.html)
      i = parsed.next
      continue
    }

    // 有序列表
    if (/^\d+\.\s/.test(line)) {
      const listStartLine = i
      const parsed = parseListBlock(i, 0, true, true)
      html += withSourceLine(listStartLine, parsed.html)
      i = parsed.next
      continue
    }

    // 图片
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\[([^\]]+)\])?/)
    if (imgMatch) {
      const [, alt, src, size] = imgMatch
      if (size) {
        const parts = size.split(/\s+/)
        html += withSourceLine(
          i,
          `<section style="max-height:${parts[1] || '250px'};overflow-y:auto;border-radius:8px;margin:24px 0px"><img src="${esc(src)}" alt="${esc(alt)}" style="width:${parts[0] || '100%'};display:block"></section>`,
        )
      } else {
        html += withSourceLine(
          i,
          `<img src="${esc(src)}" alt="${esc(alt)}" style="max-width:100%;border-radius:6px;margin:24px 0px;display:block">`,
        )
      }
      i++
      continue
    }

    // <chart>
    if (/^<chart\b/.test(line.trim())) {
      const attrs = parseAttrs(line.trim())
      html += withSourceLine(i, Chart_DA01.render(attrs, '', t))
      i++
      continue
    }

    // <img>
    if (/^<img\s/.test(line.trim())) {
      const attrs = parseAttrs(line)
      html += withSourceLine(i, Img_DA01.render(attrs, '', t))
      i++
      continue
    }

    // <svg> — 原生 SVG 透传，不做任何解析转义
    if (/^<svg\b/.test(line.trimStart())) {
      const svgLines: string[] = [line]
      let svgDepth = 1
      i++
      while (i < lines.length && svgDepth > 0) {
        const l = lines[i]
        // 统计开闭标签深度
        const openCount = (l.match(/<svg\b/g) || []).length
        const closeCount = (l.match(/<\/svg>/g) || []).length
        svgDepth += openCount - closeCount
        svgLines.push(l)
        i++
      }
      html += svgLines.join('\n')
      continue
    }

    // 普通段落
    const ps = paragraphStyle ?? {
      fontSize: 16,
      lineHeight: 1.85,
      fontWeight: '400',
      margin: 24,
      indent: '',
    }
    html += withSourceLine(
      i,
      `<section style="margin:0px 0px ${ps.margin}px"><p style="margin:0px;font-size:${ps.fontSize}px;color:var(--text-primary);line-height:${ps.lineHeight};font-weight:${ps.fontWeight};text-align:justify;overflow-wrap:break-word;word-break:break-all;text-indent:${ps.indent || '0'}">${inlineFormat(line, t, formulaMap)}</p></section>`,
    )
    i++
  }

  // 添加脚注参考资料
  if (footnotes.length > 0) {
    html += `<section style="margin:32px 0px 0px;padding-top:20px;border-top:1px solid ${t.border}">`
    html += `<h2 style="margin:0px 0px 16px;font-size:18px;font-weight:700;color:var(--text-primary);line-height:1.4">参考资料</h2>`
    html += `<section style="font-size:14px;color:var(--text-secondary);line-height:1.8">`
    footnotes.forEach((fn, idx) => {
      html += `<p style="margin:6px 0px"><span style="color:${t.accent};font-weight:600">[${idx + 1}]</span> ${leaf(fn.desc)}：<a href="${esc(fn.url)}" style="color:${t.accent};word-break:break-all">${esc(fn.url)}</a></p>`
    })
    html += `</section></section>`
  }

  return html
}
