/**
 * 小红书图卡生成
 *
 * 把一篇 markdown 拆成：一张「大字报」首图 + 若干张自动分页的内容卡。
 * 风格统一到公众号配图：暖米底 + 橙色主题 + 暖黑 + 圆角胶囊徽章 + 黑色高亮条 +
 * 虚线圆角框 + 手写感橙色波浪下划线 + 小星点。
 *
 * 本模块只产出 HTML 字符串（纯函数）。真正按高度自动分页的测量逻辑在
 * components/XhsExporter.vue 里——那一步需要 DOM。
 */
import type { ThemeColors } from '@/composables/useTheme'
import { esc, parseAttrs } from './helpers'

// ── 设计令牌（对齐公众号配图）──
// 注意：强调色（accent）不写死，跟随 r-markdown 当前主题色（buildCover/内容图都用传入的 ThemeColors）。
export const XHS = {
  bg: '#F7F2E8', // 暖米底，纸感
  card: '#FFFDF8', // 卡片上更亮的米白
  ink: '#1F1A17', // 暖黑（标题）
  inkSoft: '#5C5346', // 暖灰（正文）
  inkFaint: '#A89A86', // 更浅（元信息）
  dash: '#D9C9AC', // 虚线边色
  dark: {
    bg: '#1F1A17', // 深棕底
    card: '#2A2420', // 卡片深色
    ink: '#F0EDE8', // 浅米白（标题）
    inkSoft: '#C0B8A8', // 浅暖灰（正文）
    inkFaint: '#8A8070', // 中暖灰（元信息）
    dash: '#5C5346', // 深色虚线
  },
}

export type XhsAspect = '3:4' | '1:1'

export const ASPECTS: Record<XhsAspect, { w: number; h: number }> = {
  '3:4': { w: 360, h: 480 },
  '1:1': { w: 360, h: 360 },
}

// 逻辑尺寸 360 宽，导出时 ×3 → 1080 宽（小红书原生尺寸）。
export const PIXEL_RATIO = 3
export const PAD_X = 30
export const PAD_TOP = 32
export const PAD_BOTTOM = 24
// 内容图底部页脚带的高度（逻辑像素），切片时给它留出空间。
export const FOOTER_BAND = 46

export const FONT_STACK = `-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif`

// 内容图密度旋钮：内容图默认按「实时预览的宽度」渲染，从而和「保存图片」完全同一套
// 排版比例（字号、换行、左右边距都对齐）。这个值是在预览宽度基础上的额外倍数：
//   1   = 和「保存图片」完全一致；
//   >1  = 用更宽的画布渲染 → 同一张图里字更小、一行更多字 → 更密（但会和保存图片略有出入）。
export const CONTENT_SCALE = 1

// 底部品牌名默认值：优先读环境变量 VITE_BRAND（在 .env / .env.development 里配），否则 FiilyAiLabs。
export const DEFAULT_BRAND: string =
  (import.meta.env?.VITE_BRAND as string | undefined) || 'FiilyAiLabs'

export interface XhsMeta {
  title: string
  badge: string
  summary: string
  teaser: string
  hook: string
  chips: string[]
  brand: string
  charCount: number
  readMin: number
}

/** 去掉行内修饰符号，给摘要取纯文本用。 */
function stripInline(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[=^!~`*_]/g, '')
    .replace(/::/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 抽正文里能当导语用的纯文本段落（跳过标题/标签/列表/引用/代码），拼到够长为止。 */
function bodyPreview(md: string, limit = 320): string {
  const out: string[] = []
  let total = 0
  for (const raw of md.split('\n')) {
    const t = raw.trim()
    if (!t || /^[#>\-*+:<`|!]/.test(t) || /^---+$/.test(t) || /^\d+\.\s/.test(t)) continue
    const text = stripInline(t)
    if (!text) continue
    out.push(text)
    total += text.length
    if (total >= limit) break
  }
  return out.join(' ')
}

/**
 * 从 markdown 抽出首图素材 + 去掉头部后的正文。
 * 支持两种头部写法：YAML frontmatter（--- ... ---）和 <title ...>标题</title> 标签。
 */
export function extractXhs(md: string): { meta: XhsMeta; contentMd: string } {
  const meta: XhsMeta = {
    title: '',
    badge: '',
    summary: '',
    teaser: '',
    hook: '',
    chips: [],
    brand: DEFAULT_BRAND,
    charCount: 0,
    readMin: 1,
  }
  let contentMd = md
  const lines = md.split('\n')

  if (lines[0] && lines[0].trim() === '---') {
    let i = 1
    const fm: Record<string, string> = {}
    while (i < lines.length && lines[i].trim() !== '---') {
      const m = lines[i].match(/^(\w+):\s*(.+)/)
      if (m) fm[m[1]] = m[2].trim()
      i++
    }
    contentMd = lines.slice(i + 1).join('\n')
    meta.title = fm.title || ''
    meta.badge = fm.badge || ''
    meta.summary = fm.summary || fm.subtitle || ''
    meta.hook = fm.hook || ''
    meta.brand = fm.brand || fm.author || meta.brand
    meta.chips = (fm.chips || '')
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
  } else {
    const tm = md.match(/<title\b([^>]*)>([\s\S]*?)<\/title>/)
    if (tm) {
      const attrs = parseAttrs(tm[1])
      meta.title = (attrs.title || tm[2] || '').trim()
      meta.badge = attrs.badge || ''
      meta.summary = attrs.summary || attrs.subtitle || ''
      meta.hook = attrs.hook || ''
      meta.brand = attrs.brand || meta.brand
      meta.chips = (attrs.chips || '')
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      // 不剥掉 <title>：它既喂给大字报首图，也保留在正文里照常渲染成标题卡
    }
  }

  // 摘要兜底：frontmatter 没给，就抓第一个 <lead> 或第一段正文
  if (!meta.summary) {
    const lead = contentMd.match(/<lead\b[^>]*>([\s\S]*?)<\/lead>/)
    if (lead) {
      meta.summary = stripInline(lead[1])
    } else {
      for (const l of contentMd.split('\n')) {
        const t = l.trim()
        if (!t || /^[#>\-*+:<`|!]/.test(t) || /^---+$/.test(t)) continue
        meta.summary = stripInline(t)
        break
      }
    }
  }

  // 首图用的「摘要」：以摘要/副标题打头，接上正文开头，凑长一点，末尾让它渐隐掉。
  const body = bodyPreview(contentMd)
  if (!meta.summary) {
    meta.teaser = body
  } else if (body && !body.startsWith(meta.summary)) {
    meta.teaser = meta.summary + ' ' + body
  } else {
    meta.teaser = body || meta.summary
  }
  meta.teaser = meta.teaser.slice(0, 300)

  // 字数 / 阅读时长（沿用 renderFrontMatter 的口径）
  const clean = md
    .replace(/---[\s\S]*?---\s*/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*`>[\]!|_~=^:-]/g, '')
    .replace(/\s+/g, '')
  meta.charCount = clean.length
  meta.readMin = Math.max(1, Math.ceil(meta.charCount / 400))

  return { meta, contentMd }
}

// ── 装饰件 ──

/** 手写感波浪下划线（标题下方），颜色用主题色。 */
function swoosh(width: number, accent: string): string {
  const w = width
  return `<svg width="${w}" height="14" viewBox="0 0 ${w} 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M2 9 C ${w * 0.2} 2, ${w * 0.4} 13, ${w * 0.6} 7 S ${w * 0.85} 2, ${w - 3} 8" stroke="${accent}" stroke-width="4" stroke-linecap="round"/></svg>`
}

/** 四角星点（主题色）。 */
function star(size: number, accent: string): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${accent}" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0Z"/></svg>`
}

/** 标题里用 ==xx== 标记的部分渲染成主题色，其余用 inkColor。 */
function titleHtml(title: string, accent: string, inkColor: string): string {
  const parts = title.split(/(==[^=]+==)/)
  let out = ''
  for (const p of parts) {
    if (!p) continue
    const m = p.match(/^==([^=]+)==$/)
    if (m) out += `<span style="color:${accent}">${esc(m[1])}</span>`
    else out += `<span style="color:${inkColor}">${esc(p)}</span>`
  }
  return out
}

function chipsHtml(chips: string[], t: ThemeColors): string {
  if (!chips.length) return ''
  let html = `<section style="margin:0px;font-size:0px;line-height:1.9">`
  chips.forEach((c) => {
    html += `<span style="display:inline-block;margin:0px 8px 0px 0px;padding:3px 12px;border-radius:999px;border:1.5px solid ${t.border};background:${t.light};font-size:12px;font-weight:700;color:${t.dark};white-space:nowrap">${esc('#' + c)}</span>`
  })
  html += `</section>`
  return html
}

/**
 * 大字报首图（flex 纵向铺满）。
 * 结构：橙色徽章 → 大标题(==橙==+暖黑) + 波浪线 → 摘要(撑满、末尾渐隐) →
 * 可选黑色高亮条 → 话题标签 → 页脚(字数·分钟 + 品牌)。右上 / 左下点缀星点。
 */
export function buildCover(
  meta: XhsMeta,
  aspect: XhsAspect,
  t: ThemeColors,
  isDark = false,
): string {
  const { w, h } = ASPECTS[aspect]
  const contentW = w - PAD_X * 2
  const c = isDark ? XHS.dark : XHS

  let html = `<section style="position:relative;box-sizing:border-box;width:${w}px;height:${h}px;background:${c.bg};padding:${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px;overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif">`

  // 角标星点
  html += `<section style="position:absolute;top:20px;right:24px">${star(22, t.accent)}</section>`
  html += `<section style="position:absolute;bottom:74px;left:16px;opacity:0.75">${star(13, t.accent)}</section>`

  // 徽章（line-height + nowrap 确保圆角把 Day N 整个包住）
  if (meta.badge) {
    html += `<section style="flex-shrink:0;margin:0px 0px 16px"><span style="display:inline-block;padding:6px 16px;border-radius:11px;background:${t.accent};color:#fff;font-size:15px;font-weight:800;line-height:1.3;letter-spacing:0.5px;white-space:nowrap;box-shadow:0 4px 12px ${t.accent}55">${esc(meta.badge)}</span></section>`
  }

  // 标题 + 波浪线
  html += `<h1 style="flex-shrink:0;margin:0px;font-size:34px;line-height:1.18;font-weight:900;letter-spacing:-0.5px;word-break:break-word">${titleHtml(meta.title, t.accent, c.ink)}</h1>`
  html += `<section style="flex-shrink:0;margin:8px 0px 14px">${swoosh(Math.min(contentW, 220), t.accent)}</section>`

  // 摘要：占满中间剩余空间，超出部分用底部渐变淡出（到最后消失）
  const teaser = meta.teaser || meta.summary
  if (teaser) {
    html += `<section style="position:relative;flex:1 1 auto;min-height:0;overflow:hidden;margin:0px 0px 14px">`
    html += `<p style="margin:0px;font-size:15.5px;line-height:1.75;color:${c.inkSoft};font-weight:500">${esc(teaser)}</p>`
    html += `<section style="position:absolute;left:0px;right:0px;bottom:0px;height:56px;background:linear-gradient(to bottom,${c.bg}00,${c.bg})"></section>`
    html += `</section>`
  }

  // 黑色高亮条（可选 hook）
  if (meta.hook) {
    html += `<section style="flex-shrink:0;margin:0px 0px 12px"><span style="display:inline-block;padding:8px 16px;border-radius:12px;background:${c.ink};color:${isDark ? c.bg : '#fff'};font-size:15px;font-weight:800;line-height:1.45">${esc(meta.hook)}</span></section>`
  }

  // 话题标签
  if (meta.chips.length) {
    html += `<section style="flex-shrink:0;margin:0px 0px 14px">${chipsHtml(meta.chips, t)}</section>`
  }

  // 页脚：字数 / 阅读时长 + 品牌
  html += `<section style="flex-shrink:0;display:flex;align-items:flex-end;justify-content:space-between;border-top:1.5px dashed ${c.dash};padding-top:12px">`
  html += `<span style="font-size:12px;color:${c.inkFaint};font-weight:700;letter-spacing:0.3px">${esc('共 ' + meta.charCount + ' 字 · 约 ' + meta.readMin + ' 分钟')}</span>`
  html += `<span style="font-size:13px;color:${t.dark};font-weight:800">${esc('@' + meta.brand)}</span>`
  html += `</section>`

  html += `</section>`
  return html
}
