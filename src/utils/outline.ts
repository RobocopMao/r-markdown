/**
 * 从 Markdown 原文提取文档大纲：H1–H4 标题、<title> 主标题、<p-title> 段落标题。
 * 条目带 1-based 行号，供大纲面板点击后 scrollToLineAndHighlight 跳转。
 * 代码围栏内的 # 不参与解析；<title> 正文支持跨行。
 */

export interface OutlineItem {
  /** 层级：1 主标题，2 小节，3 子小节，4 次子小节 */
  level: 1 | 2 | 3 | 4
  /** 显示文本（已剥离行内修饰语法） */
  text: string
  /** 1-based 行号 */
  line: number
  /** 来源类型：heading = # 标题，title = <title> 组件，ptitle = <p-title> 组件 */
  kind: 'heading' | 'title' | 'ptitle'
  /** <p-title> 的 num 属性（如 "01"），非组件条目无此字段 */
  num?: string
}

/** 剥离图片/链接/标签/行内修饰语法，得到纯文本 */
function cleanInlineText(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/(\*\*|__|~~|==|::|!!|\^\^|`|\*)/g, '')
    .trim()
}

export function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const lines = markdown.split('\n')
  let inFence = false
  let fenceChar = ''

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // 代码围栏开关（``` 或 ~~~），围栏内内容不参与大纲
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      const ch = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = ch
      } else if (ch === fenceChar) {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    // <title> 主标题组件，正文可能跨行
    if (/^<title\b/.test(trimmed)) {
      const openEnd = trimmed.indexOf('>')
      let body = openEnd >= 0 ? trimmed.slice(openEnd + 1) : ''
      if (body.includes('</title>')) {
        body = body.slice(0, body.indexOf('</title>'))
      } else {
        let j = i + 1
        while (j < lines.length && !lines[j].includes('</title>')) j++
        if (j < lines.length) {
          body += '\n' + lines.slice(i + 1, j).join('\n')
          i = j
        }
      }
      const text = cleanInlineText(body)
      if (text) items.push({ level: 1, text, line: i + 1, kind: 'title' })
      continue
    }

    // <p-title> 段落标题组件（兼容旧写法 <ptitle>），title 属性为标题文本
    const ptMatch = trimmed.match(/^<(p-title|ptitle)\b([^>]*)>/)
    if (ptMatch) {
      const attrs = ptMatch[2]
      const titleAttr = attrs.match(/\btitle="([^"]*)"/)
      const numAttr = attrs.match(/\bnum="([^"]*)"/)
      const levelAttr = attrs.match(/\blevel="([^"]*)"/)
      const text = cleanInlineText(titleAttr?.[1] ?? '')
      if (text) {
        // 与 PTitle_DA01/DA02 的默认值保持一致：未写 level 时按一级标题处理
        const lv = parseInt(levelAttr?.[1] ?? '1', 10)
        const level = (Number.isFinite(lv) ? Math.min(Math.max(lv, 1), 4) : 1) as 1 | 2 | 3 | 4
        items.push({ level, text, line: i + 1, kind: 'ptitle', num: numAttr?.[1] })
      }
      continue
    }

    // Markdown 标题（仅 H1–H4）
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (hMatch) {
      const text = cleanInlineText(hMatch[2].replace(/\s+#+\s*$/, ''))
      if (text) {
        items.push({ level: hMatch[1].length as 1 | 2 | 3 | 4, text, line: i + 1, kind: 'heading' })
      }
    }
  }
  return items
}
