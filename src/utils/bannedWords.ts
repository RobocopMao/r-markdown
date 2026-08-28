/**
 * 违禁词检测：内置公众号高风险词库（广告法极限词、权威背书、医疗功效、
 * 金融理财、诱导互动五类），扫描 Markdown 正文并返回带行号定位的命中列表。
 *
 * 设计要点：
 * - 扫描前先「遮罩」代码块 / 行内代码 / URL / HTML 标签，避免代码与链接误报，
 *   遮罩用等长空白替换，保持行号与原始源码一致；
 * - 命中记录 1-based 行号，配合 Editor 暴露的 scrollToLineAndHighlight 跳转；
 * - 支持调用方传入自定义词库与白名单（持久化在 settings 中）。
 */

export interface BannedCategory {
  id: string
  label: string
  /** 徽章主色（hex），弹窗内以 alpha 底色 + 前景使用 */
  color: string
  words: string[]
}

/** 内置分类词库 */
export const BANNED_CATEGORIES: BannedCategory[] = [
  {
    id: 'extreme',
    label: '极限用语',
    color: '#ef4444',
    words: [
      '最佳', '最好', '最强', '最优', '最大', '最高级', '最高档', '最低价', '最便宜',
      '最先进', '最优秀', '最著名', '最流行', '最时尚', '最聚财', '最受欢迎', '最新科技',
      '史上最', '史上仅', '全网第一', '全网最低', '全国第一', '全球第一', '世界第一',
      '行业第一', '销量第一', '第一品牌', 'NO.1', 'TOP1', 'TOP 1',
      '顶级', '顶尖', '极品', '极致体验', '绝对', '绝无仅有', '独一无二', '空前绝后',
      '史无前例', '万能', '百分之百', '100%', '纯天然', '无敌', '冠军', '王牌',
      '独家', '首个', '首款', '首创', '全国首家', '领导品牌', '领军品牌', '领军者',
      '开创者', '缔造者', '始祖', '鼻祖', '开天辟地', '空前', '绝后', '永久',
      '彻底', '终极', '完美', '百分百',
    ],
  },
  {
    id: 'authority',
    label: '权威背书',
    color: '#f97316',
    words: [
      '国家级', '世界级', '国家认证', '国家推荐', '国家机关推荐', '质量免检', '免检产品',
      '特供', '专供', '国家专供', '军队特供', '驰名商标', '著名商标', '中国名牌',
      '名牌商品', '国际认证', '官方认证', '官方推荐', '权威认证', '专家推荐',
      '医生推荐', '明星推荐', '获奖产品', '金奖', '银奖', '质检合格首选',
    ],
  },
  {
    id: 'medical',
    label: '医疗功效',
    color: '#8b5cf6',
    words: [
      '根治', '治愈', '治愈率', '包治百病', '药到病除', '立竿见影', '无副作用',
      '安全无副作用', '无依赖', '彻底根治', '根治顽疾', '消炎', '杀菌', '抗菌',
      '祛疤', '祛斑', '瘦身', '减肥', '燃脂', '刮油', '排毒', '抗癌', '防癌',
      '降血压', '降血糖', '降血脂', '提高免疫力', '增强免疫力', '延缓衰老',
      '返老还童', '延年益寿', '生发', '助眠', '壮阳', '补肾', '调理体质',
    ],
  },
  {
    id: 'finance',
    label: '金融风险',
    color: '#ec4899',
    words: [
      '稳赚不赔', '稳赚', '保本保息', '保本', '零风险', '无风险', '躺赚',
      '翻倍收益', '收益翻倍', '暴富', '一夜暴富', '内部消息', '高回报',
      '超高回报', '日赚', '日入过千', '月入过万', '月赚', '财务自由',
      '复利奇迹', '钱生钱', '睡后收入过万', '包赚',
    ],
  },
  {
    id: 'induce',
    label: '诱导互动',
    color: '#f59e0b',
    words: [
      '求点赞', '求转发', '求关注', '求在看', '求分享', '关注后领取', '关注后回复',
      '关注公众号领取', '转发朋友圈', '转发到朋友圈', '转发本文', '分享朋友圈',
      '分享到朋友圈', '集赞', '集齐赞', '点赞过万', '点赞破万', '阅读原文领取',
      '点击关注', '扫码关注', '扫码进群', '加微信群', '加微信领取', '进群领取',
      '私信领取', '私信我', '评论区领取', '评论区扣', '在看过百', '点个在看',
      '素质三连', '一键三连', '不转不是', '转发这条', '截图领取',
    ],
  },
]

const CATEGORY_MAP = new Map(BANNED_CATEGORIES.map((c) => [c.id, c]))

export interface BannedMatch {
  word: string
  categoryId: string
  categoryLabel: string
  color: string
  /** 1-based 行号（对应编辑器源码行） */
  line: number
  /** 行内 1-based 列号 */
  col: number
  /** 命中词上下文片段（含省略号） */
  context: string
}

export interface ScanOptions {
  /** 用户自定义补充词 */
  customWords?: string[]
  /** 白名单（命中时忽略） */
  whitelist?: string[]
}

/** 单次扫描命中上限，防止极端长文卡顿 */
export const MAX_MATCHES = 999

function mask(s: string): string {
  return s.replace(/[^\n]/g, ' ')
}

/** 将不需要检测的区域替换为等长空白（保留换行，行号不变） */
function maskIgnoredRegions(src: string): string {
  let out = src
  // 围栏代码块 ``` ... ``` 与 ~~~ ... ~~~
  out = out.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*(?=\n|$)/gm, (m) => mask(m))
  // HTML 标签（含扩展组件标签与其属性）
  out = out.replace(/<[^>\n]*>/g, (m) => mask(m))
  // 行内代码
  out = out.replace(/`[^`\n]+`/g, (m) => mask(m))
  // URL（markdown 链接/图片地址）与 idb:/data: 协议地址
  out = out.replace(/\b(?:https?:)?\/\/[^\s)"'<>]+/gi, (m) => mask(m))
  out = out.replace(/\b(?:idb|data):[^\s)"'<>]+/gi, (m) => mask(m))
  // markdown 限高图尺寸后缀 ![alt](url)[宽 高]，如 [100% 120px]，仅遮罩尺寸块
  out = out.replace(/(!\[[^\]]*\]\([^)]*\))(\[[^\]]*\])/g, (_m, head, dim) => head + mask(dim))
  return out
}

interface LineInfo {
  start: number
  text: string
}

function buildLineInfos(src: string): LineInfo[] {
  const infos: LineInfo[] = []
  let start = 0
  for (const line of src.split('\n')) {
    infos.push({ start, text: line })
    start += line.length + 1
  }
  return infos
}

function findLine(infos: LineInfo[], offset: number): number {
  let lo = 0
  let hi = infos.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (infos[mid].start <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** 构建上下文片段：命中词前后各保留约 16 字符，超出部分省略 */
function buildContext(lineText: string, colStart: number, colEnd: number): string {
  const radius = 16
  const from = Math.max(0, colStart - radius)
  const to = Math.min(lineText.length, colEnd + radius)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < lineText.length ? '…' : ''
  return prefix + lineText.slice(from, to) + suffix
}

/**
 * 扫描违禁词。
 * 返回按文中位置排序的命中列表（含自定义词，跳过白名单）。
 */
export function scanBannedWords(source: string, options: ScanOptions = {}): BannedMatch[] {
  if (!source.trim()) return []

  const whitelist = new Set((options.whitelist ?? []).map((w) => w.trim()).filter(Boolean))

  type Term = { word: string; lower: string; categoryId: string }
  const terms: Term[] = []
  for (const cat of BANNED_CATEGORIES) {
    for (const word of cat.words) {
      if (!whitelist.has(word)) terms.push({ word, lower: word.toLowerCase(), categoryId: cat.id })
    }
  }
  for (const word of options.customWords ?? []) {
    const w = word.trim()
    if (!w || whitelist.has(w)) continue
    terms.push({ word: w, lower: w.toLowerCase(), categoryId: 'custom' })
  }
  if (terms.length === 0) return []

  const original = source
  const masked = maskIgnoredRegions(source)
  const lowered = masked.toLowerCase()
  const lines = buildLineInfos(original)

  const occupied: Array<[number, number]> = []
  const overlaps = (s: number, e: number) => occupied.some(([a, b]) => s < b && e > a)

  const matches: BannedMatch[] = []
  for (const term of terms) {
    let idx = lowered.indexOf(term.lower)
    while (idx !== -1 && matches.length < MAX_MATCHES) {
      const end = idx + term.word.length
      if (!overlaps(idx, end)) {
        occupied.push([idx, end])
        const lineIdx = findLine(lines, idx)
        const info = lines[lineIdx]
        const colInLine = idx - info.start
        matches.push({
          word: original.slice(idx, end),
          categoryId: term.categoryId,
          categoryLabel:
            term.categoryId === 'custom' ? '自定义' : CATEGORY_MAP.get(term.categoryId)?.label ?? '',
          color:
            term.categoryId === 'custom' ? '#64748b' : CATEGORY_MAP.get(term.categoryId)?.color ?? '',
          line: lineIdx + 1,
          col: colInLine + 1,
          context: buildContext(info.text, colInLine, end - info.start),
        })
      }
      idx = lowered.indexOf(term.lower, idx + Math.max(1, term.word.length))
    }
  }

  matches.sort((a, b) => a.line - b.line || a.col - b.col)
  return matches
}
