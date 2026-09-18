/**
 * 查找/替换的纯函数实现，供编辑器查找替换面板使用。
 *
 * 不依赖 @codemirror/search 的内部 API：该包的 `SearchQuery.getReplacement` 在类型
 * 定义里标记为 `@internal`，且其内置高亮只在自带面板打开时才渲染。这里把匹配与
 * 替换语义独立出来，既可单测，也便于按中文用户习惯调整（如全词匹配对 CJK 的处理）。
 */

export interface FindOptions {
  /** 区分大小写 */
  caseSensitive: boolean
  /** 全词匹配：匹配两侧不能是文字/数字/下划线 */
  wholeWord: boolean
  /** 把查找内容当作正则表达式 */
  regexp: boolean
}

export interface FindMatch {
  from: number
  to: number
  /** 正则模式的捕获组（[0] 为整体匹配），供替换串 $1/$& 展开 */
  groups: string[]
}

export interface FindResult {
  matches: FindMatch[]
  /** 正则语法非法 */
  invalid: boolean
}

/** 匹配数量上限，避免超大文档 + 宽泛正则导致卡顿 */
export const FIND_MATCH_LIMIT = 5000

/** 全词匹配时的「词字符」：字母（含 CJK）、数字、下划线 */
const WORD_CHAR = /[\p{L}\p{N}_]/u

/**
 * 把查找串里的 `\n` `\r` `\t` 还原成真实字符。
 * 仅在非正则模式下生效：用户在输入框里无法直接敲换行，
 * 需要靠这种转义写法查找跨行内容。
 */
export function unescapeLiteral(query: string): string {
  return query.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
}

/** 判断位置两侧是否都不构成「半个词」，用于全词匹配 */
function isWholeWord(text: string, from: number, to: number): boolean {
  const before = from > 0 ? text[from - 1] : ''
  const after = to < text.length ? text[to] : ''
  return !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))
}

/**
 * 在 text 中查找全部匹配。
 *
 * - 正则模式：非法语法返回 `invalid: true`（面板据此高亮输入框）
 * - 全词模式：对匹配结果再做一次边界校验，两种模式通用
 * - 零宽匹配（如 `a*`、`^`）会主动前移 lastIndex，避免死循环
 */
export function findMatches(
  text: string,
  query: string,
  opts: FindOptions,
  limit = FIND_MATCH_LIMIT,
): FindResult {
  if (!query) return { matches: [], invalid: false }

  const matches: FindMatch[] = []

  if (opts.regexp) {
    let re: RegExp
    try {
      // g 用于遍历；u 让 \p{L} 等 Unicode 转义与代理对正确工作
      re = new RegExp(query, opts.caseSensitive ? 'gu' : 'giu')
    } catch {
      return { matches: [], invalid: true }
    }
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const from = m.index
      const to = from + m[0].length
      if (!opts.wholeWord || isWholeWord(text, from, to)) {
        matches.push({ from, to, groups: [...m] })
        if (matches.length >= limit) break
      }
      // 零宽匹配：手动前进一格，否则 exec 会停在原地
      if (m[0].length === 0) re.lastIndex++
      if (re.lastIndex > text.length) break
    }
    return { matches, invalid: false }
  }

  const needleRaw = unescapeLiteral(query)
  if (!needleRaw) return { matches: [], invalid: false }
  const needle = opts.caseSensitive ? needleRaw : needleRaw.toLowerCase()
  const haystack = opts.caseSensitive ? text : text.toLowerCase()

  let pos = 0
  while (pos <= haystack.length - needle.length) {
    const from = haystack.indexOf(needle, pos)
    if (from < 0) break
    const to = from + needle.length
    if (!opts.wholeWord || isWholeWord(text, from, to)) {
      // 用原文切片作为 groups[0]，保证大小写与源文一致
      matches.push({ from, to, groups: [text.slice(from, to)] })
      if (matches.length >= limit) break
    }
    pos = from + needle.length
  }
  return { matches, invalid: false }
}

/**
 * 展开替换串：正则模式支持 `$&`（整体匹配）与 `$1`–`$99`（捕获组）。
 * 非正则模式原样返回（`\n` `\t` 仍按字面处理，方便插入真实换行）。
 */
export function expandReplacement(replacement: string, match: FindMatch, regexp: boolean): string {
  if (regexp) {
    return replacement.replace(/\$([$&]|\d{1,2})/g, (whole, token: string) => {
      if (token === '$') return '$'
      if (token === '&') return match.groups[0] ?? ''
      const n = Number(token)
      return match.groups[n] ?? whole
    })
  }
  return unescapeLiteral(replacement)
}
