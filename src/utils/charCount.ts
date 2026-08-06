/**
 * 统计 Markdown 正文纯文字字数与预估阅读时长。
 * 剥离 front-matter、全部标签、图片与 markdown 语法符号后再计数。
 */
export function countChars(
  raw: string,
  opts?: { excludeTitle?: boolean },
): { chars: number; minutes: number } {
  let text = raw
  if (opts?.excludeTitle) text = text.replace(/<title[\s\S]*?<\/title>\s*/, '')
  text = text
    .replace(/---[\s\S]*?---\s*/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[.*?\]\([^)]*\)/g, '')
    .replace(/[#*`>[\]!|_~=^:-]/g, '')
    .replace(/\s+/g, '')
  const chars = text.length
  return { chars, minutes: Math.max(1, Math.ceil(chars / 400)) }
}
