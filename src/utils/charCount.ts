/**
 * 统计 Markdown 正文纯文字字数与预估阅读时长。
 * 剥离 front-matter、全部标签、图片与 markdown 语法符号后再计数。
 */

/**
 * 仅当首个非空行就是 `---` 时，才把它当作 front-matter 的开头，
 * 剥离到与之配对的结束 `---` 为止。
 *
 * 不能用 /---[\s\S]*?---/：正文里的水平分割线（工具栏「分割线」插入 `\n---\n`）
 * 也是 `---`，那样会把两条分割线之间的正文一并吞掉。
 */
function stripFrontMatter(text: string): string {
  const lines = text.split('\n')
  let first = 0
  while (first < lines.length && lines[first].trim() === '') first++
  if (first >= lines.length || lines[first].trim() !== '---') return text
  for (let i = first + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n')
  }
  // 只有开头一个 --- 没有配对，视为普通分割线，不做剥离
  return text
}

export function countChars(
  raw: string,
  opts?: { excludeTitle?: boolean },
): { chars: number; minutes: number } {
  let text = stripFrontMatter(raw)
  if (opts?.excludeTitle) text = text.replace(/<title[\s\S]*?<\/title>\s*/, '')
  text = text
    .replace(/<[^>]+>/g, '')
    .replace(/!\[.*?\]\([^)]*\)/g, '')
    .replace(/[#*`>[\]!|_~=^:-]/g, '')
    .replace(/\s+/g, '')
  const chars = text.length
  return { chars, minutes: Math.max(1, Math.ceil(chars / 400)) }
}
