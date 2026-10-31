/**
 * 文章体检：纯本地计算，不联网、不落库。
 *
 * 统计面板只需要一个「这篇稿子有没有明显毛病」的信号，所以这里不做文学评价，
 * 只量六个客观指标：篇幅、段落长度、标题层级、图片、组件、违禁词，
 * 再把它们折算成 0–100 的结构分（扣分制，起始 100）。
 *
 * 逐项口径：
 * - 段落：按空行切块，跳过 front-matter、围栏代码、标题行、组件单行标签；
 * - 标题层级：用 extractOutline 的 heading 条目（`#` 系列），允许从 1 起，出现跨级即记一次；
 * - 组件：统计已知单行/双行标签的出现次数，标签表与 src/extension 保持同一份（硬编码，
 *   避免为了统计把整个渲染层打进这条路由的 chunk）；
 * - 违禁词：复用编辑器同一个扫描器，含用户自定义词库与白名单。
 */
import { countChars } from '@/utils/charCount'
import { extractOutline } from '@/utils/outline'
import { scanBannedWords } from '@/utils/bannedWords'

/** 与 src/extension/*.ts 的 `tag` 字段保持一致 */
export const KNOWN_COMPONENT_TAGS = [
  'badges',
  'breaking',
  'case-flow',
  'chart',
  'column',
  'compare',
  'container',
  'cta',
  'engage',
  'html',
  'img',
  'lead',
  'mermaid',
  'p-title',
  'positioned',
  'reading-path',
  'row',
  'slider',
  'stack',
  'statement',
  'steps',
  'table',
  'text',
  'timeline',
  'title',
] as const

const COMPONENT_TAG_RE = new RegExp(`<(${KNOWN_COMPONENT_TAGS.join('|')})(?=[\\s/>])`, 'gi')

/** 单个段落超过这个字数就算「超长段」，手机上一屏读不完 */
export const LONG_PARAGRAPH_CHARS = 200

const FRONT_MATTER_RE = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/

export interface HealthIssue {
  /** warn = 建议改，info = 知道一下 */
  level: 'warn' | 'info'
  text: string
}

export interface ArticleHealth {
  /** 纯文字字数（与编辑器口径一致） */
  chars: number
  /** 预估阅读分钟数 */
  minutes: number
  /** 正文段落数 */
  paragraphs: number
  /** 平均段长（字） */
  avgParagraphChars: number
  /** 超过 LONG_PARAGRAPH_CHARS 的段落数 */
  longParagraphs: number
  /** `#` 标题与 <title> 总数 */
  headings: number
  /** 标题层级跳级次数 */
  headingJumps: number
  /** 图片数（Markdown 图片 + <img> 组件） */
  images: number
  /** 每千字图片数，保留 1 位小数 */
  imageDensity: number
  /** 组件调用次数 */
  components: number
  /** 用到的组件种类数 */
  componentKinds: number
  /** 违禁词命中数 */
  bannedCount: number
  /** 违禁词样例（最多 3 个，去重） */
  bannedSample: string[]
  /** 结构分 0–100 */
  score: number
  issues: HealthIssue[]
}

export interface AnalyzeOptions {
  customWords?: string[]
  whitelist?: string[]
}

/** 剥掉 front-matter（只在文件首行是 --- 且能配对时生效） */
function stripFrontMatter(text: string): string {
  const matched = text.match(FRONT_MATTER_RE)
  return matched ? text.slice(matched[0].length) : text
}

/**
 * 切段落：空行分段，围栏代码整块跳过，标题行与组件标签行不计入。
 * 返回每段的纯文本（尚未计字）。
 */
function splitParagraphs(content: string): string[] {
  const lines = stripFrontMatter(content).split(/\r?\n/)
  const paragraphs: string[] = []
  let buf: string[] = []
  let inFence = false
  let fenceChar = ''

  const flush = () => {
    const text = buf.join('\n').trim()
    if (text) paragraphs.push(text)
    buf = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    const fence = line.match(/^(`{3,}|~{3,})/)
    if (fence) {
      const ch = fence[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = ch
      } else if (ch === fenceChar) {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    if (!line) {
      flush()
      continue
    }
    // Markdown 标题自成一段，不计入段落长度
    if (/^#{1,6}\s+/.test(line)) {
      flush()
      continue
    }
    // 组件单行标签（<cta ...> / </row> 之类）不参与段落
    if (/^<\/?[a-zA-Z][\w-]*[^>]*>\s*$/.test(line)) continue
    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush()
      continue
    }
    buf.push(line)
  }
  flush()
  return paragraphs
}

/** 统计标题层级跨级次数（只算 `#` 系列与 <title>） */
function countHeadingJumps(content: string): { headings: number; jumps: number } {
  const outline = extractOutline(content)
  const levels: number[] = []
  for (const item of outline) {
    if (item.kind === 'ptitle') continue
    levels.push(item.kind === 'title' ? 1 : item.level)
  }
  let jumps = 0
  let prev = 0
  for (const level of levels) {
    if (prev > 0 && level > prev + 1) jumps++
    prev = level
  }
  return { headings: levels.length, jumps }
}

function countImages(content: string): number {
  const md = content.match(/!\[[^\]]*\]\([^)]*\)/g)?.length ?? 0
  const tag = content.match(/<img(?=[\s/>])/gi)?.length ?? 0
  // <img> 组件内部常带 <img src>，md/img 二者取大，避免同一张图算两次
  return Math.max(md, tag)
}

/** 逐项体检一篇文章正文 */
export function analyzeArticle(content: string, opts: AnalyzeOptions = {}): ArticleHealth {
  const { chars, minutes } = countChars(content)

  const paragraphs = splitParagraphs(content)
  const lengths = paragraphs.map((p) => countChars(p).chars).filter((n) => n > 0)
  const total = lengths.reduce((sum, n) => sum + n, 0)
  const longParagraphs = lengths.filter((n) => n > LONG_PARAGRAPH_CHARS).length
  const avgParagraphChars = lengths.length ? Math.round(total / lengths.length) : 0

  const { headings, jumps } = countHeadingJumps(content)

  const images = countImages(content)
  const imageDensity = chars > 0 ? Math.round((images / chars) * 1000 * 10) / 10 : 0

  const tagMatches = content.match(COMPONENT_TAG_RE) ?? []
  const components = tagMatches.length
  const componentKinds = new Set(tagMatches.map((t) => t.slice(1).toLowerCase())).size

  const banned = scanBannedWords(content, {
    customWords: opts.customWords ?? [],
    whitelist: opts.whitelist ?? [],
  })
  const bannedSample = Array.from(new Set(banned.map((b) => b.word))).slice(0, 3)

  const issues: HealthIssue[] = []
  let score = 100

  if (chars === 0) {
    score = 0
    issues.push({ level: 'warn', text: '读不到正文内容' })
  } else {
    if (chars < 300) {
      score -= 12
      issues.push({ level: 'warn', text: `篇幅偏短（${chars} 字）` })
    }
    if (longParagraphs > 0) {
      score -= Math.min(20, longParagraphs * 5)
      issues.push({
        level: 'warn',
        text: `${longParagraphs} 个段落超过 ${LONG_PARAGRAPH_CHARS} 字`,
      })
    }
    if (jumps > 0) {
      score -= Math.min(15, jumps * 5)
      issues.push({ level: 'warn', text: `标题层级跳级 ${jumps} 次` })
    }
    if (banned.length > 0) {
      score -= Math.min(24, banned.length * 6)
      issues.push({
        level: 'warn',
        text: `违禁词 ${banned.length} 处：${bannedSample.join('、')}`,
      })
    }
    if (chars > 800 && headings === 0) {
      score -= 10
      issues.push({ level: 'warn', text: '长文没有小标题' })
    }
    if (chars > 1200 && images === 0 && components === 0) {
      score -= 6
      issues.push({ level: 'info', text: '通篇纯文字，没有图片或组件' })
    }
    if (chars > 2000 && images === 0) {
      issues.push({ level: 'info', text: '2000 字以上无配图' })
    }
  }

  return {
    chars,
    minutes,
    paragraphs: lengths.length,
    avgParagraphChars,
    longParagraphs,
    headings,
    headingJumps: jumps,
    images,
    imageDensity,
    components,
    componentKinds,
    bannedCount: banned.length,
    bannedSample,
    score: Math.max(0, Math.min(100, score)),
    issues,
  }
}

/** 结构分档位标签，供 UI 上色 */
export function scoreBand(score: number): 'good' | 'fair' | 'poor' {
  if (score >= 85) return 'good'
  if (score >= 65) return 'fair'
  return 'poor'
}
