import type { ThemeColors } from '@/composables/useTheme'
import { esc, leaf, lightenHex } from './helpers'

type InlineOption = {
  label: string
  syntax: string
  hint: string
  wrapType?: 'delim' | 'tag'
}

export const inlineFormatOptions: InlineOption[] = [
  { label: '渐变背景', syntax: '==', hint: '==文字==' },
  { label: '柔光重点', syntax: '::', hint: '::文字::' },
  { label: '胶囊文字', syntax: '!!', hint: '!!文字!!' },
  { label: '加重强调', syntax: '^^', hint: '^^文字^^' },
  { label: '下划线', syntax: '__', hint: '__文字__' },
  { label: '删除线', syntax: '~~', hint: '~~文字~~' },
  { label: '加粗', syntax: '**', hint: '**文字**' },
  { label: '斜体', syntax: '*', hint: '*文字*' },
  { label: '加粗+斜体', syntax: '***', hint: '***文字***' },
  { label: '行内代码', syntax: '`', hint: '`文字`' },
  { label: '上标', syntax: 'sup', hint: '<sup>文字</sup>', wrapType: 'tag' },
  { label: '下标', syntax: 'sub', hint: '<sub>文字</sub>', wrapType: 'tag' },
  { label: 'HTML下划线', syntax: 'u', hint: '<u>文字</u>', wrapType: 'tag' },
]

export function inlineFormat(
  text: string,
  t: ThemeColors,
  formulaMap?: Map<string, string>,
): string {
  // 脚注占位符 __FN_N__（渲染为带下划线的文字 + 上标数字）
  // 格式：__FN_N__|显示文字，其中显示文字由 markdownParser 传入
  text = text.replace(
    /__FN_(\d+)__\|([^|]+)\|/g,
    (_m, p1: string, label: string) =>
      `<span style="color:${t.accent};text-decoration:underline;text-decoration-style:dashed;text-underline-offset:3px;cursor:pointer">${leaf(label)}</span><sup style="color:${t.accent};font-size:0.75em;font-weight:600">[${parseInt(p1) + 1}]</sup>`,
  )
  // 兼容没有显示文字的格式
  text = text.replace(
    /__FN_(\d+)__/g,
    (_m, p1: string) =>
      `<sup style="color:${t.accent};font-weight:600;cursor:pointer">[${parseInt(p1) + 1}]</sup>`,
  )
  // `行内代码` — 先用占位符隔离，避免内部 $...$ / ** 等被后续正则误匹配
  const codeStore: string[] = []
  text = text.replace(/`([^`]+)`/g, (_m, p1: string) => {
    const idx = codeStore.length
    codeStore.push(
      `<code style="background:#f0f0f5;padding:2px 6px;border-radius:4px;font-size:13px;font-family:SF Mono,Consolas,monospace;color:#e83e8c;word-break:break-all">${esc(p1)}</code>`,
    )
    return `\x00CODE_${idx}\x00`
  })
  // $行内公式$ — 优先取 formulaMap 中的预渲染 SVG；无可用时显示公式原文
  text = text.replace(/(?<!\$)(?<!\d)\$([^\$]+?)\$(?!\$|[\w])/g, (_m, formula: string) => {
    if (formulaMap) {
      const svg = formulaMap.get(`i:${formula}`)
      if (svg) return `<span style="color:var(--text-primary)">${svg}</span>`
    }
    // 降级：显示公式原文
    return `<code style="font-style:italic;background:var(--hl-code-bg);padding:1px 4px;border-radius:3px">${esc(formula)}</code>`
  })
  // ==渐变背景==
  text = text.replace(
    /==([^=]+)==/g,
    (_m, p1: string) =>
      `<span style="background:linear-gradient(120deg,rgba(${t.rgb},0.1) 0%,rgba(${t.rgb},0.16) 100%);padding:0px 6px;border-radius:4px;font-weight:700;color:${t.accent}">${leaf(p1)}</span>`,
  )
  // !!胶囊文字!!
  text = text.replace(
    /!!([^!]+)!!/g,
    (_m, p1: string) =>
      `<span style="background:linear-gradient(90deg,color-mix(in srgb,${t.accent} 70%,#000 30%) 0%,${t.accent} 100%);padding:0px 6px;border-radius:4px;font-weight:700;color:#fff">${leaf(p1)}</span>`,
  )
  // ^^加重强调^^
  text = text.replace(
    /\^\^([^^]+)\^\^/g,
    (_m, p1: string) => `<strong style="color:${t.accent}">${leaf(p1)}</strong>`,
  )
  // ::柔光重点::
  text = text.replace(/::([^:]+)::/g, (_m, p1: string) => {
    const light = lightenHex(t.accent, 0.15)
    return `<span style="color:${light};font-weight:700">${leaf(p1)}</span>`
  })
  // __下划线__
  text = text.replace(
    /__([^_]+)__/g,
    (_m, p1: string) =>
      `<span style="text-decoration:underline;text-decoration-color:${t.accent};text-underline-offset:3px">${leaf(p1)}</span>`,
  )
  // ~~删除线~~
  text = text.replace(
    /~~([^~]+)~~/g,
    (_m, p1: string) => `<del style="color:#9ca3af">${leaf(p1)}</del>`,
  )
  // **粗体**
  text = text.replace(/\*\*([^*]+)\*\*/g, (_m, p1: string) => `<strong>${leaf(p1)}</strong>`)
  // *斜体*
  text = text.replace(/\*([^*]+)\*/g, (_m, p1: string) => `<em>${leaf(p1)}</em>`)
  // 图片 ![alt](src)[size]
  text = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)(?:\[([^\]]+)\])?/g,
    (_m, alt: string, src: string, size?: string) => {
      if (size) {
        const parts = size.split(/\s+/)
        const w = parts[0] || '100%'
        const h = parts[1] || '250px'
        return `<img src="${esc(src)}" alt="${esc(alt)}" style="width:${w};max-height:${h};border-radius:6px;display:block">`
      }
      return `<img src="${esc(src)}" alt="${esc(alt)}" style="max-width:100%;border-radius:6px;display:block">`
    },
  )
  // 链接 [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, p1: string, p2: string) => `<a href="${p2}" style="color:${t.accent}">${leaf(p1)}</a>`,
  )
  // <text ...>content</text> — 行内文本样式
  text = text.replace(
    /<text\b([^>]*)>([\s\S]*?)<\/text>/g,
    (_m, attrsStr: string, body: string) => {
      const parseAttrs = (s: string): Record<string, string> => {
        const result: Record<string, string> = {}
        const re = /([\w-]+)\s*=\s*"([^"]*)"/g
        let m
        while ((m = re.exec(s)) !== null) {
          result[m[1]] = m[2]
        }
        return result
      }
      const attrs = parseAttrs(attrsStr)
      const cssMap: [string, string][] = [
        ['color', 'color'],
        ['size', 'font-size'],
        ['weight', 'font-weight'],
        ['style', 'font-style'],
        ['height', 'line-height'],
        ['align', 'text-align'],
        ['decoration', 'text-decoration'],
        ['spacing', 'letter-spacing'],
        ['transform', 'text-transform'],
        ['bg', 'background'],
      ]
      const styles: string[] = []
      let hasBlock = false
      for (const [attrKey, cssKey] of cssMap) {
        const val = attrs[attrKey]
        if (val) {
          styles.push(`${cssKey}:${val}`)
          if (attrKey === 'align') hasBlock = true
        }
      }
      if (hasBlock) {
        styles.push('display:block', 'width:100%')
      }
      const styleStr = styles.length ? ` style="${styles.join(';')}"` : ''
      return `<span${styleStr}>${body}</span>`
    },
  )
  // 还原行内代码占位符
  text = text.replace(/\x00CODE_(\d+)\x00/g, (_m, p1: string) => codeStore[parseInt(p1)] || _m)
  return text
}
