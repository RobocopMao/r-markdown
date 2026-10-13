/**
 * 文章文件命名规则（工作区文章存储专用，GitHub 仓库 / 本地磁盘共用）。
 *
 * 背景：tree.json 里的 node.id 既充当唯一索引，又直接是文件名（articles/{id}.md）。
 * 本模块提供「用菜单树文章名命名文件」所需的纯函数，命名形如：
 *
 *   公众号排版技巧-k3f9a2b1.md
 *
 * 设计要点：
 * - 哈希取自 node.id（不是标题）：id 唯一且稳定，改名/改内容/换设备都不会变，
 *   同名文章也不会撞车；标题本身会重复、会变，不能作为唯一性来源。
 * - node.id 始终是唯一索引，文件名只是它的可读表示（可选字段 TreeNode.file）。
 * - 所有函数都是纯函数（除 isTitleNamingEnabled 读设置），便于两端复用与验证。
 */

import { getSetting } from '@/config/settings'

/** 设置值：沿用内部 id 命名（默认，art-xxxx.md） */
export const ARTICLE_NAMING_ID = 'id'
/** 设置值：用「文章名-短哈希」命名 */
export const ARTICLE_NAMING_TITLE = 'title'

/** 标题部分按 UTF-8 字节截断的上限，避免超出文件系统/仓库路径长度限制 */
const MAX_SLUG_BYTES = 100

/**
 * 文件名非法字符（Windows/macOS 通用）与控制字符。
 * 控制字符用 eslint-disable 显式放行：这里就是要匹配它们。
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f]/g

/** 净化后为空时的兜底名称 */
const FALLBACK_SLUG = 'untitled'

/**
 * 当前是否启用「用文章名命名文件」。
 * 读取设置 articleFileNaming，未开启（默认 'id'）时返回 false。
 */
export function isTitleNamingEnabled(): boolean {
  return getSetting<string>('articleFileNaming') === ARTICLE_NAMING_TITLE
}

/** 按 UTF-8 字节数截断字符串，不切断代理对（emoji）与多字节字符 */
function truncateByBytes(input: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(input).length <= maxBytes) return input
  let result = ''
  let used = 0
  // for...of 按码点遍历，不会把一个码点切成半个
  for (const ch of input) {
    const size = encoder.encode(ch).length
    if (used + size > maxBytes) break
    result += ch
    used += size
  }
  return result
}

/**
 * 标题 → 文件名安全片段。
 *
 * 依次处理：NFC 归一化 → 去首尾空白 → 去 `.md` 尾缀 → 去非法/控制字符 →
 * 折叠空白 → 去首尾的点与空格（Windows 不允许结尾为点或空格）→
 * 按字节截断 → 兜底 untitled。
 *
 * 注意 `.md` 尾缀必须先去掉：新建文章弹窗会把标题自动补成 `标题.md`，
 * 若不去掉会拼出 `标题.md-k3f9a2b1.md`。
 */
export function slugifyArticleTitle(title: string): string {
  let s = (title ?? '').normalize('NFC').trim()
  s = s.replace(/\.md$/i, '')
  s = s.replace(ILLEGAL_CHARS, ' ')
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  s = truncateByBytes(s, MAX_SLUG_BYTES)
  // 截断后可能又出现结尾的点/空格，再清一次
  s = s.replace(/[.\s]+$/, '')
  return s || FALLBACK_SLUG
}

/** FNV-1a 64 位哈希（按 UTF-8 字节遍历），同步实现、无依赖、两端一致 */
function fnv1a64(input: string): bigint {
  const bytes = new TextEncoder().encode(input)
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  let hash = 0xcbf29ce484222325n
  for (const b of bytes) {
    hash = ((hash ^ BigInt(b)) * prime) & mask
  }
  return hash
}

/** BigInt → base36 字符串（小写字母数字，天然不含文件系统非法字符） */
function toBase36(value: bigint): string {
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz'
  if (value <= 0n) return '0'
  let n = value
  let out = ''
  while (n > 0n) {
    out = digits[Number(n % 36n)] + out
    n /= 36n
  }
  return out
}

/**
 * 稳定短哈希：同一 seed 永远得到同一结果，不同 seed 结果不同。
 * 默认取 8 位（base36 空间约 2.8e12，万篇量级碰撞概率可忽略），
 * 冲突时调用方可用更长的位数重试。
 */
export function shortHash(seed: string, length = 8): string {
  const size = Math.max(4, Math.min(13, length))
  const raw = toBase36(fnv1a64(seed))
  return raw.padStart(size, '0').slice(0, size)
}

/** 组装文件基名（不含 .md 扩展名）：`{净化标题}-{短哈希}` */
export function buildArticleFileBase(title: string, seed: string): string {
  return `${slugifyArticleTitle(title)}-${shortHash(seed)}`
}

/**
 * 解析节点实际使用的文件基名（不含 .md）。
 *
 * 优先用节点上的 file 字段（新命名方案写入的实际文件名）；
 * 没有则回退到 node.id（旧命名，art-xxxx）。
 * 因此老文章零迁移即可读取，且「开启后关闭开关」也不会让已重命名的文章失联。
 */
export function resolveArticleFileBase(node: { type: string; id: string; file?: string }): string {
  const file = node.file?.trim()
  return file ? file : node.id
}

/**
 * 生成不与 taken 冲突的文件基名。
 *
 * 先按默认 8 位哈希；若撞车（不同 id 哈希相同、或目录里存在同名孤儿文件）
 * 则依次加长哈希；仍冲突则追加 -2、-3 序号兜底。
 */
export function uniqueArticleFileBase(title: string, seed: string, taken: Set<string>): string {
  const slug = slugifyArticleTitle(title)
  for (const size of [8, 12, 16]) {
    const candidate = `${slug}-${shortHash(seed, size)}`
    if (!taken.has(candidate)) return candidate
  }
  const base = `${slug}-${shortHash(seed, 16)}`
  let index = 2
  while (taken.has(`${base}-${index}`)) index++
  return `${base}-${index}`
}
