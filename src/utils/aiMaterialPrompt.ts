/**
 * AI 素材的 prompt 组装与输出清洗（纯逻辑，无网络、无 Vue 依赖）。
 *
 * 规则正文不再是 TS 里拼的字符串，而是 src/data/ai/r-markdown-material/SKILL.md，
 * 与 AI 写作（khazix）、AI 排版（format-spec）的做法一致：顶部注释块与 frontmatter
 * 在读取时剥离，正文原样进 system prompt。改玩法改技能文件，不改代码。
 *
 * 与 AI 排版共用同一份组件属性参考（format-spec.md），但任务完全不同：
 * - 排版是「把已有全文重排」，边界是**不得增删内容**；
 * - 素材是「按需求凭空造一个可复用的组件片段」，所以必须**只产出一个片段**、
 *   不许写成整篇文章、不许留下需要用户自己补的空位。
 *
 * 因此这里单独一套 prompt，而不是给 buildSystemPrompt 加参数——两边的铁律互相冲突，
 * 混在一起写会让模型两头都做不好。
 */

import { componentCheatsheet } from '@/utils/aiFormatPrompt'
import { components } from '@/extension'
import { stripFrontMatter, stripSourceComment } from '@/utils/aiWritePrompt'
import { normalizePipe } from '@/utils/helpers'
import { isSingleComponent, hasTopLevelHtmlBlock } from '@/utils/materialBoundary'
import { convertDivToSection, scanHtmlBlock } from '@/utils/wechatHtmlRules'
import type { WechatHtmlIssue } from '@/utils/wechatHtmlRules'

/** 技能文件路径（改技能内容改这个文件即可，不改代码） */
const SKILL_PATH = '@/data/ai/r-markdown-material/SKILL.md'

let skillPromise: Promise<string> | null = null

/**
 * 动态导入技能全文并剥离来源注释与 frontmatter。单独成 chunk，不撑大主包。
 *
 * frontmatter 里的 name/description 是 skill 路由元数据（决定「什么时候加载这个 skill」），
 * 对已经加载进来的模型是噪声，还容易诱导它去描述技能本身而不是产出素材。
 */
export async function loadMaterialSkill(): Promise<string> {
  if (!skillPromise) {
    skillPromise = import('@/data/ai/r-markdown-material/SKILL.md?raw').then((mod) =>
      stripFrontMatter(stripSourceComment(mod.default as string)).trim(),
    )
  }
  return skillPromise
}

/** 仅供调试：确认真实下发的技能路径 */
export function materialSkillPath(): string {
  return SKILL_PATH
}

/**
 * 解析器层面的通用属性：它们不写在组件定义的 attrs 里，而是由 markdownParser 直接读。
 *
 * 目前只有 `type`——用来切换同一组件的第二套视觉（`<steps type="DA02">`、`<title type="DA02">`）。
 * 不并进来的话，这条检查会把所有合法的 `type="DA02"` 全判成非法属性。
 */
const PARSER_LEVEL_ATTRS = ['type']

/**
 * 只在其它组件内部出现的子标签，它们不是独立组件，但同样要检查属性。
 *
 * `<left>` / `<right>` 特别要紧：`Compare_DA01.parseSides` 用的是 `/<left>([\s\S]*?)<\/left>/`，
 * 标签带任何属性都匹配不上，左右两栏会**静默渲染成空白**（踩过：模型写了 `<left title="以前的写法">`）。
 * 标题要通过 `<compare left-title="…" right-title="…">` 的属性给。
 */
const INNER_TAG_ATTRS: Record<string, string[]> = {
  left: [],
  right: [],
}

/**
 * 每个组件标签允许的属性名，从 `src/extension` 注册表推导。
 *
 * 为什么不手写一份：属性表在组件定义里，手抄一份必然随版本漂移。
 * 同一 tag 可能有多套样式（如 `<steps>` 的 DA01 / DA02），这里按 tag 合并。
 */
export function allowedAttrsByTag(): Record<string, string[]> {
  const map: Record<string, Set<string>> = {}
  for (const [tag, attrs] of Object.entries(INNER_TAG_ATTRS)) {
    map[tag] = new Set(attrs)
  }
  for (const c of components) {
    const set = (map[c.tag] ??= new Set<string>(PARSER_LEVEL_ATTRS))
    for (const a of c.attrs ?? []) {
      if (!a.hidden) set.add(a.key)
    }
  }
  return Object.fromEntries(Object.entries(map).map(([tag, set]) => [tag, [...set].sort()]))
}

/** 把属性白名单渲染成 prompt 里的一小段（比速查表多一列：这个标签能写哪些属性） */
export function componentAttrReference(): string {
  return Object.entries(allowedAttrsByTag())
    .map(
      ([tag, attrs]) => `- \`<${tag}>\`：${attrs.map((a) => `\`${a}\``).join(' ') || '（无属性）'}`,
    )
    .join('\n')
}

/**
 * 用户点名的组件标签。
 *
 * 需求原话（用户 2026-11-19）：「如果用户指定了使用哪个组件，明确优先告诉AI使用指定组件，
 * 并明确组件的属性语法， 不要乱用」。
 *
 * 用户既然点了名，就没有「换个组件也能达到同样效果」的余地——他要的就是那一个。
 * 但只要需求里没点名，模型就会自由发挥，所以认「点名」要认得准：宁可漏判（退回自由选型），
 * 不能误判（把「做成三步流程」里的「步骤」当成点名了 `<steps>`，反而锁死了版式）。
 *
 * 认三种明确写法：
 * - 标签原文：`<steps>`、`</steps>`
 * - `/` 快捷插入：输入框打 `/steps` 插进去的就是 `<steps>`，但也允许用户说「/steps 那种」
 * - 动词 + 标签名：「用 steps 组件」「换成 badges」「用 mermaid 画」——
 *   **必须带动词或「组件」二字**，裸出现一个英文单词不算（"steps" 太容易是别的意思）。
 */
export function findNamedComponents(requirement: string): string[] {
  const known = new Set(components.map((c) => c.tag))
  // `svg` 不在组件注册表里（它是解析器整段透传的原生标签），但用户说「做个可点击的 svg」
  // 就是在点名，漏了它这条素材会退化成 `<details>` 折叠块——公众号里根本不生效。
  known.add('svg')
  const found: string[] = []

  /**
   * 否定语境里提到的标签不算点名。
   *
   * 最常见的真实说法是「用 badges 组件，不要用 html」——后半句里也出现了 `用 html`，
   * 直接按动词认会把它当成「点名了 `<html>`」，正好和用户的意思相反。
   * 中文否定几乎都落在「不 / 别 / 勿 / 禁」上，往匹配位置前面看两个字就够，
   * 窗口再放大容易把「不需要花哨，用 steps」误伤成否定。
   */
  const negated = (index: number) =>
    /[不别勿禁]/.test(requirement.slice(Math.max(0, index - 4), index))

  const push = (raw: string, index: number) => {
    const tag = raw.toLowerCase()
    if (!known.has(tag)) return
    if (negated(index)) return
    if (!found.includes(tag)) found.push(tag)
  }

  // `<steps>` / `</steps>` / `<steps/>`
  for (const m of requirement.matchAll(/<\/?([a-z][\w-]*)\s*\/?>/gi)) push(m[1], m.index ?? 0)
  // `/steps`（`/` 前面不能是字母数字，免得把 "and/or" 这类切出个 "or"）
  for (const m of requirement.matchAll(/(?:^|[^\w/])\/([a-z][a-z-]*)/gi)) {
    push(m[1], (m.index ?? 0) + m[0].length - m[1].length)
  }
  // 「用 steps 组件」「换成 badges」「用 mermaid 画」
  const verbs = '使用|改用|换成|要用|采用|调用|指定|走|用'
  for (const m of requirement.matchAll(new RegExp(`(?:${verbs})\\s*([a-z][a-z-]*)\\b`, 'gi'))) {
    push(m[1], (m.index ?? 0) + m[0].length - m[1].length)
  }
  // 「steps 组件」「mermaid 组件」
  for (const m of requirement.matchAll(/([a-z][a-z-]*)\s*组件/gi)) push(m[1], m.index ?? 0)
  // `svg` 单独放宽：它没有中文名，用户从不说「svg 组件」或「用 svg 组件」，
  // 常见说法是「做一个点击揭晓的 svg」「做成 svg 动画」——裸出现就是点名的意思。
  // 判据窄到只此一个标签，别把这条放宽到别的英文单词上。
  for (const m of requirement.matchAll(/\bsvg\b/gi)) push('svg', m.index ?? 0)

  return found
}

/**
 * 点名组件的写法说明：逐字示例 + 这个标签能写的每个属性（含可选值与含义）。
 *
 * 为什么要连示例一起给：属性表只说「有 `bg` 这个键」，模型照样会写成
 * `background="…"`；给一行能直接照抄的完整标签，属性名、引号、body 分隔形状
 * 全都对上了，才谈得上「明确组件的属性语法」。
 */
export function componentDeepReference(tag: string): string | null {
  const defs = components.filter((c) => c.tag === tag)
  if (defs.length === 0) {
    if (tag === 'svg') {
      return (
        '`<svg>`：手写矢量图（交互素材）。根标签写 `width="100%"` 加 `viewBox`，' +
        '图形属性全写在元素上，交互只能用 SMIL（`<animate>` / `<set>`）；' +
        '完整写法见技能里「交互 SVG」那一节。'
      )
    }
    return null
  }

  const names = [...new Set(defs.map((d) => d.name))].join(' / ')
  const attrs = allowedAttrsByTag()[tag] ?? []
  const detail: string[] = [`\`<${tag}>\`（${names}）能写的属性：`]

  for (const key of attrs) {
    // 同一 tag 有多个变体（`title` 有 DA01/DA02），属性取并集，说明取第一个非空的
    const meta = defs
      .flatMap((d) => d.attrs ?? [])
      .find((a) => a.key === key && (a.description || a.options?.length))
    const bits: string[] = [`\`${key}\``]
    const options = meta?.options?.filter(Boolean) ?? []
    if (options.length > 0) bits.push(`取值 ${options.map((o) => `\`${o}\``).join(' / ')}`)
    if (meta?.default) bits.push(`默认 \`${meta.default}\``)
    const desc = meta?.description?.replace(/\s+/g, ' ').trim()
    if (desc) bits.push(desc)
    detail.push(`  - ${bits.join('｜')}`)
  }
  if (attrs.length === 0) detail.push('  - （没有属性，只写正文）')

  const example = defs.find((d) => d.example)?.example
  if (example) {
    detail.push(`照这个形状写（示例逐字可抄）：`, '```text', example, '```')
  }
  return detail.join('\n')
}

/** 把点名的组件拼成 prompt 里的一段；没点名返回空串 */
export function renderNamedComponents(requirement: string): string {
  const tags = findNamedComponents(requirement)
  if (tags.length === 0) return ''
  const blocks = tags.map((tag) => componentDeepReference(tag)).filter((x): x is string => !!x)
  if (blocks.length === 0) return ''
  return [
    '用户点名了下面的组件，**这一版必须用它们，不要换成别的标签，也不要绕成手写 `<html>`**。',
    '属性名、取值、正文分隔形状按下面这份写（这是从组件定义里取出来的，不是举例）：',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}

/**
 * 点名质检：用户点名了组件，输出里却没有。
 *
 * 与 `checkMaterialIntent()` 的区别是**判据来源不同**：那个靠内置词表猜用户想要什么，
 * 这个只认用户白纸黑字写下的标签名，所以命中就是硬错，不看 `HAND_BUILT_TAGS` 放行。
 */
export function checkNamedComponents(requirement: string, text: string): string | null {
  const tags = findNamedComponents(requirement)
  if (tags.length === 0) return null
  const body = text.replace(/\{\{RMIMG_\d+\}\}/g, '')
  const missing = tags.filter((tag) => {
    if (tag === 'svg') return !/<svg\b/i.test(body)
    return !new RegExp(`<${tag}\\b`, 'i').test(body)
  })
  if (missing.length === 0) return null
  const list = missing.map((t) => `\`<${t}>\``).join('、')
  const hint = missing
    .map((t) => componentDeepReference(t))
    .filter((x): x is string => !!x)
    .join('\n\n')
  return `用户点名要用 ${list}，但输出里没有这个标签。点了名就必须用，不要换成别的组件或手写 \`<html>\`。写法：\n${hint}`
}

/**
 * 需求里出现这些词，说明用户希望点名组件之外**再**有点别的
 * （「用 badges 做标签，下面再配一段 steps 流程」）。
 *
 * 只用于豁免 `checkNamedOnly()`，所以放宽是安全方向：宁可少拦一次，
 * 也不要把「我就是要两块」的需求驳回成一块。
 */
const ADDITIVE_HINTS = ['再', '加', '配', '附带', '同时', '顺便', '以及', '还有', '接着', '跟着']

/**
 * 点名质检（范围）：点了名就**只输出点名的那一块**，别自作主张多配一个组件、别再套容器。
 *
 * 实测（用户 2026-11-19）：需求「使用 `<mermaid>` 组件 画一个 A 到 B，B 到 C 的流程图」，
 * 模型交回来的是 `<container display="block">` 里塞着 `<mermaid>` **加**一段 `<steps>`
 * 把同样的流程又用文字讲了一遍，外面还多一层容器。用户的原话是「要限定非常小才可以」——
 * 点名组件就等于把范围说到最小了，多出来的每一步都是噪音：占版面、抢注意力、还要用户手动删。
 *
 * 豁免：需求里有 `ADDITIVE_HINTS` 的词（明确要「再配一段」），就不拦。
 */
export function checkNamedOnly(requirement: string, text: string): string | null {
  const named = findNamedComponents(requirement)
  if (named.length === 0) return null
  if (ADDITIVE_HINTS.some((w) => requirement.includes(w))) return null

  const body = text.replace(/\{\{RMIMG_\d+\}\}/g, '')
  const known = new Set(components.map((c) => c.tag))
  known.add('svg')
  const used = [...body.matchAll(/<([a-z][\w-]*)\b(?=[\s/>])/gi)].map((m) => m[1].toLowerCase())
  const extras = [...new Set(used)].filter((t) => known.has(t) && !named.includes(t))
  if (extras.length === 0) return null

  const namedText = named.map((t) => `\`<${t}>\``).join('、')
  const extraText = extras.map((t) => `\`<${t}>\``).join('、')
  return (
    `用户点名只要 ${namedText}，输出里却多了 ${extraText}。点了名就把范围说到了最小：` +
    `这一版只输出 ${namedText} 本身，不要另配组件把同样的内容再讲一遍，` +
    '也不要外套 `<container>`（单个组件自己就有完整版式）。' +
    '确实想加第二个组件时，等用户自己说「再配一个……」'
  )
}

/**
 * 正文会被整个丢弃的组件：数据全在属性上，标签内写了什么都渲染不出来。
 *
 * 实测清单（`render(attrs, _body, …)` 签名里 body 是下划线参数，说明实现根本不读它）：
 * `<chart>`（数据在 labels / values）、`<slider>`（图片在 images）、`<engage>`（文案全在属性）、
 * `<img>`（自闭合，本来就没有正文）。
 *
 * 反例正是模型最常犯的错——把 `<chart>` 当成 Markdown 表格来写：
 * ```
 * <chart type="bar" title="近五年用户规模">
 * - 2020 | 6.4
 * - 2021 | 7.2
 * </chart>
 * ```
 * 这样写不报错、不警告，图直接是空的。**改组件实现后如果开始用 body，要同步从这个清单里删掉。**
 */
const BODY_IGNORED_TAGS = ['chart', 'slider', 'engage']

/**
 * `<html>` 原始块：内部写的是微信编辑器直接支持的裸 HTML，不参与 R-Markdown 的语法修复与质检。
 *
 * 实测依据：`Html_DA01.render()` 就是 `return body`，解析器（`markdownParser.ts` 的 `parseHtmlTag()`）
 * 原样透出、不解析不转义。所以块内的 `<h3>` / `<ul>` / `<table style="…">` 都是合法原生 HTML。
 * 而我们的修复链、质检链全是照着「组件标签」写的，不隔离会出现三类误伤（都实测过）：
 * 1. `findUnknownTags()` 把 `<h3>` / `<ul>` / `<li>` / `<tr>` 当成自造组件驳回；
 * 2. `findIllegalAttrs()` 把原生 `<table style="…">` 的 `style` 当成我们 table 组件的非法属性；
 * 3. `splitInlineBlocks()` 把原生 `<table>…</table>` 当成我们的块级组件，硬拆成三行、改坏排版。
 *
 * 做法是置换成一串不会被任何正则命中的占位符，处理完原样换回来。
 */
const HTML_BLOCK_RE = /<html\b[^>]*>[\s\S]*?<\/html\s*>/gi

/** 把 `<html>…</html>` 抽出来换成占位符；返回的 `blocks` 按索引对应 */
export function splitHtmlBlocks(text: string): { masked: string; blocks: string[] } {
  const blocks: string[] = []
  const masked = text.replace(HTML_BLOCK_RE, (whole) => {
    blocks.push(whole)
    return `\u0000rmhtml${blocks.length - 1}\u0000`
  })
  return { masked, blocks }
}

/** 把占位符换回原始 `<html>` 块 */
function restoreHtmlBlocks(text: string, blocks: string[]): string {
  if (blocks.length === 0) return text
  return text.replace(/\u0000rmhtml(\d+)\u0000/g, (whole, i: string) => blocks[Number(i)] ?? whole)
}

/**
 * `<svg>…</svg>` 原始块：内部是手写矢量图，**不是** R-Markdown 组件。
 *
 * 和 `<html>` 块同一个道理，但 `<html>` 那套遮罩管不到它，需要单独一层：
 * 1. `findUnknownTags()` 会把 `<svg>` / `<rect>` / `<circle>` / `<path>` 当成「自造组件」驳回
 *    （实测：一段完全合法的 SVG 直接报「用了不存在的标签：`<svg>`、`<rect>`」，
 *    重试两次也过不了，用户会说「AI 生成的 SVG 从来出不来」）；
 * 2. `findIllegalAttrs()` 会拿组件属性表去查 SVG 的 `viewBox` / `fill` / `stroke-dasharray`；
 * 3. `splitInlineBlocks()` 会把紧凑写在一行里的 `<svg>…</svg>` 当成块级组件硬拆三行。
 *
 * 所以凡是「按组件语法判断」的地方（自造标签、非法属性、形状、修复链）都要先把它遮起来；
 * 而「按微信规则判断」的那几处（`findForbiddenHtmlTags` / `findClassStyledTags` /
 * `findWechatHtmlIssues`）**故意只用 `splitHtmlBlocks()`**，不遮 SVG——
 * SVG 不在 `<html>` 块里就完全不归微信规则管，写在块里则照旧要检查。
 */
const SVG_BLOCK_RE = /<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi

/**
 * 遮住 `<html>` 块与 `<svg>` 块（先 html 后 svg，所以写在 `<html>` 里的 svg 由 html 那一层带走）。
 *
 * 单独一个函数是为了两边各取所需：这条链剩下的地方都要「组件视角的正文」，
 * 而微信规则那几处只要 `<html>` 块原文。
 */
function splitVerbatimBlocks(text: string): { masked: string; html: string[]; svg: string[] } {
  const htmlBlocks: string[] = []
  const svgBlocks: string[] = []
  const maskedHtml = text.replace(HTML_BLOCK_RE, (whole) => {
    htmlBlocks.push(whole)
    return `\u0000rmhtml${htmlBlocks.length - 1}\u0000`
  })
  const masked = maskedHtml.replace(SVG_BLOCK_RE, (whole) => {
    svgBlocks.push(whole)
    return `\u0000rmsvg${svgBlocks.length - 1}\u0000`
  })
  return { masked, html: htmlBlocks, svg: svgBlocks }
}

/** 把两层占位符按原文换回去（顺序无所谓，两种占位符前缀不重叠） */
function restoreVerbatimBlocks(text: string, htmlBlocks: string[], svgBlocks: string[]): string {
  let out = restoreHtmlBlocks(text, htmlBlocks)
  if (svgBlocks.length > 0) {
    out = out.replace(
      /\u0000rmsvg(\d+)\u0000/g,
      (whole, i: string) => svgBlocks[Number(i)] ?? whole,
    )
  }
  return out
}

/**
 * 微信编辑器不支持的标签：脚本、样式表、外链媒体。
 *
 * 这些在 `<html>` 块里也**不能**放行——块内是原样透传的，写进去就会被粘进公众号，
 * 轻则被微信过滤掉留下空白，重则整段内容被判定含脚本而发不出去。
 * 所以哪怕其它原生 HTML 标签都放行，这几个仍要单独检查。
 */
const FORBIDDEN_HTML_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'video',
  'audio',
  'canvas',
]

/** `<html>` 块内的危险标签（其余原生 HTML 标签都允许） */
export function findForbiddenHtmlTags(md: string): string[] {
  const { blocks } = splitHtmlBlocks(md)
  if (blocks.length === 0) return []
  const found: string[] = []
  for (const block of blocks) {
    for (const tag of FORBIDDEN_HTML_TAGS) {
      if (new RegExp(`<${tag}\\b`, 'i').test(block) && !found.includes(tag)) found.push(tag)
    }
  }
  return found
}

/**
 * `<html>` 块里靠 `class` 挂样式的标签。
 *
 * 微信编辑器会把 `class` 丢掉，也不认任何外部样式表——`<div class="card">` 粘进公众号
 * 就是一块没有任何样式的裸 div。所以 `<html>` 里的视觉规则**必须写成行内 `style="…"`**。
 * 这里只报不改：模型写的 class 名字对应什么样式，代码侧猜不出来。
 */
export function findClassStyledTags(md: string): string[] {
  const { blocks } = splitHtmlBlocks(md)
  if (blocks.length === 0) return []
  const found: string[] = []
  for (const block of blocks) {
    for (const m of block.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
      const tag = m[1].toLowerCase()
      if (/\bclass\s*=/i.test(m[2]) && !found.includes(tag)) found.push(tag)
    }
  }
  return found
}

/**
 * `<html>` 块里那些「粘进公众号就没了」的写法（`position` / `filter` / CSS 变量 / 外链图…）。
 *
 * 分开返回两档：`blocking` 的会让版式直接散掉，质检驳回重写；其余只在面板提示一句。
 * 规则来源见 `src/utils/wechatHtmlRules.ts` 顶部注释。
 */
export function findWechatHtmlIssues(md: string): WechatHtmlIssue[] {
  const { blocks } = splitHtmlBlocks(md)
  if (blocks.length === 0) return []
  const out: WechatHtmlIssue[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    for (const issue of scanHtmlBlock(block)) {
      if (seen.has(issue.text)) continue
      seen.add(issue.text)
      out.push(issue)
    }
  }
  return out
}

/** `<html>` 块里可以直接出现的组件标签（原生 `<img>` 也算） */
const HTML_INLINE_OK = new Set(['img'])

/**
 * 扫块内组件时一律跳过这些 tag：
 *
 * - `html`：包裹块自己的外层壳，`splitHtmlBlocks()` 取出的块首尾就是它；
 * - `table`：既是我们的组件又是标准 HTML，块里写 `<tr><td>` 是正常用法，
 *   报它会把每一张原生表格都误伤成「混进了组件」。
 */
const HTML_NATIVE_OVERLAP = new Set(['html', 'table'])

/**
 * `<html>` 块里混进来的 R-Markdown 组件。
 *
 * 用户口径（2026-11-18）：「html 组件内部不要出现自定义组件，除了 img 和 svg 标签，
 * 因为 html 里面的内容直接按 html 解析」。
 *
 * `<html>` 组件的 `render()` 就是 `return body`，块内不会再走一遍组件解析——
 * 塞进去的 `<steps>` / `<title>` 不会被渲染，读者看到的是 `<steps title="三步">` 这行源码本身。
 * 实测模型很爱「在 HTML 版式里顺手加一张成品卡片」，结果整块变成代码。
 */
export function findComponentsInHtml(md: string): string[] {
  const { blocks } = splitHtmlBlocks(md)
  if (blocks.length === 0) return []
  const componentTags = new Set(components.map((c) => c.tag))
  const found: string[] = []
  for (const block of blocks) {
    // `<svg>` 整块是透传的矢量图，里面的 `<text>` 是 SVG 自己的标签（我们的 `<text>` 组件
    // 与它同名），不能算「混进了组件」，所以先整块剥掉再扫。
    const content = block.replace(SVG_BLOCK_RE, '')
    for (const m of content.matchAll(/<([a-z][\w-]*)\b(?=[\s/>])/gi)) {
      const tag = m[1].toLowerCase()
      if (!componentTags.has(tag)) continue
      if (HTML_INLINE_OK.has(tag) || HTML_NATIVE_OVERLAP.has(tag)) continue
      if (!found.includes(tag)) found.push(tag)
    }
  }
  return found
}

/** 块级原生 HTML 标签：绝不是 R-Markdown 组件，写在 `<html>` 外会被解析器塞进 `<p>` 里 */
const NATIVE_HTML_BLOCK_RE =
  /^[\t ]*<(h[1-6]|ul|ol|dl|dt|dd|blockquote|pre|figure|figcaption|details|summary|address|hr|div|section|p|table)\b/im

/**
 * 整篇都是原生 HTML、但忘了写 `<html>` 包裹的，替它补上。
 *
 * 实测（`parseMarkdownAsync`）：裸 `<div style="…">文字</div>` 会被塞进 `<p>` 里，
 * `<ul><li>` 的 `<p><ul></p>` 结构直接被拆坏——**内容还在，版式全错**。
 * `<h3>` 之类还会被 `findUnknownTags()` 当自造组件驳回。补一层 `<html>` 就都正常了。
 *
 * 只在「一个组件标签都没有」时动手：`<html>` 的 body 不参与 Markdown 解析，
 * 组件混在里面的会被当死文本原样印出来，所以混写的情况一律不碰。
 */
function wrapBareHtml(text: string, notes: string[]): string {
  const body = text.trim()
  if (!body) return text
  if (!NATIVE_HTML_BLOCK_RE.test(body)) return text
  // `<table>` 与我们的 table 组件撞名：组件只认 `- 甲 | 乙` 这种数据行，写原生
  // `<tr><td>` 会渲染成一张空表。所以带 `<tr>` / `<thead>` 的一律算原生 HTML。
  const nativeTable = /<table\b[^>]*>[\s\S]*?<(?:tr|thead|tbody|td|th)\b/i.test(body)
  const componentTags = components
    .map((c) => c.tag)
    .filter((t) => t !== 'container' && t !== 'html' && !(t === 'table' && nativeTable))
  const hasComponent = componentTags.some((tag) => new RegExp(`<${tag}\\b`, 'i').test(body))
  if (hasComponent) return text
  notes.push(
    '原生 HTML 没有包在 `<html>` 里（会被塞进 `<p>`、列表和表格版式会散掉），已自动补上 `<html>` 包裹',
  )
  return `<html>\n${body}\n</html>`
}

/**
 * 把写错位置的数据搬回属性上（确定性修复，不靠模型）。
 *
 * 实测最顽固的一类错误：模型把 `<chart>` 当成 Markdown 表格来写——
 * ```
 * <chart type="bar" title="近五年用户规模">
 * - 2020 | 6.4
 * - 2021 | 7.2
 * </chart>
 * ```
 * 提示词讲了三遍、带理由重试两次，它还是会这么写（因为「图表 + 数据行」在训练语料里
 * 几乎都是表格形状）。但这类错误**是可逆的**：正文结构固定为 `- 标签 | 数值`，
 * 直接解析出来塞进 `labels` / `values`，比重试更可靠，也不会把用户的等待时间耗光。
 *
 * 只做信息无损的搬迁：解析不出成对的「标签 | 数值」就原样返回，交给下面的质检去驳回。
 */
export function repairMaterialOutput(text: string): { text: string; notes: string[] } {
  const notes: string[] = []
  // `<html>` 块和 `<svg>` 块先抽出来：里面是原生 HTML / 手写矢量图，不是组件，
  // 不能过下面这套照组件语法写的修复链（否则 `splitInlineBlocks` 会把单行 SVG 硬拆三行）
  const { masked, html, svg } = splitVerbatimBlocks(text)
  const repaired = repairMarkup(masked, notes)
  // `<div>` → `<section>`：无损改名，排在还原之前逐块处理，不影响块外的组件语法
  const sections = html.map((block) => convertDivToSection(block, notes))
  // 容器包裹放最后：前面那些修复都按组件的 body 认形状，先包一层不影响，但排在最后
  // 可以保证不管前面怎么改，最终产出的最外层一定是容器。`<html>` / `<svg>` 块不包。
  const restored = restoreVerbatimBlocks(repaired, sections, svg)
  return { text: wrapInContainer(restored, notes), notes }
}

/** 修复链本体：只处理 R-Markdown 组件语法，`<html>` 块已被换成占位符 */
function repairMarkup(text: string, notes: string[]): string {
  // 裸原生 HTML 要先包起来，后面的修复与质检才认得出这是「合法的纯 HTML 素材」
  const wrapped = wrapBareHtml(text, notes)
  const repaired = wrapped.replace(
    /<chart\b([^>]*)>([\s\S]*?)<\/chart>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      if (!rawBody.trim()) return whole
      // 已有 labels + values 的，正文本来就该是空的，保持不动（交给质检）
      const hasLabels = /\blabels\s*=/.test(rawAttrs)
      const hasValues = /\bvalues\s*=/.test(rawAttrs)
      if (hasLabels && hasValues) return whole

      const pairs: Array<[string, string]> = []
      for (const line of rawBody.split('\n')) {
        const m = line.trim().match(/^[-*]\s*(.+?)\s*[|｜]\s*(.+?)\s*$/)
        if (m) pairs.push([m[1].trim(), m[2].trim()])
      }
      if (pairs.length === 0) return whole

      const labels = pairs.map((p) => p[0]).join(',')
      const values = pairs.map((p) => p[1]).join(',')
      let attrs = rawAttrs
      if (!/\btype\s*=/.test(attrs)) attrs = ` type="bar"${attrs}`
      if (!hasLabels) attrs += ` labels="${labels}"`
      if (!hasValues) attrs += ` values="${values}"`
      notes.push(`图表数据原本写在标签内部（会被丢弃），已自动挪到 labels / values 属性上`)
      return `<chart${attrs}></chart>`
    },
  )

  // 拆行要最早做：后面那些按 body 认形状的修复（compare 两栏标题、cta 属性）
  // 都要求正文已经独占行，否则 `<cta …>文字</cta>` 的正文在正则里根本抓不到。
  const lined = splitInlineBlocks(repaired, notes)
  // 换标签要排在 `moveMisplacedTitle()` 之前：`<title title="…" btn="…">` 的标题本来在属性上，
  // 先搬进正文的话，换成 `<cta>` 之后就没有 `title` 属性了。
  const upgraded = upgradeCardToCta(lined, notes)
  // 属性改名要早于按 body 认形状的修复：`<title main="…">` 得先变成正常标题，
  // 后面的 `moveMisplacedTitle()` / `mergeBadgesIntoCard()` 才认得出来。
  const aliased = fixAliasAttrs(upgraded, notes)
  const piped = fixFullwidthPipes(aliased, notes)
  const titled = splitTitleSubtitle(
    moveMisplacedTitle(mergeBadgesIntoCard(piped, notes), notes),
    notes,
  )
  const quoted = fixAttributeQuotes(fixBadgesSeparator(titled, notes), notes)
  const ctaed = fixCtaAttrs(quoted, notes)
  const expanded = expandSelfClosingTags(ctaed, notes)
  const sided = moveCompareSideTitle(expanded, notes)
  const numbered = fixTitleWithNum(sided, notes)
  return movePtitleNumIntoAttr(numbered, notes)
}

/**
 * 全角竖线归一化。
 *
 * 中文输入法下 `|` 很容易打成 `｜`（U+FF5C），两者看起来几乎一样。
 * 但 `<steps>` / `<timeline>` / `<badges>` 的解析只认半角竖线：
 * `<timeline>` 一行都解析不出来时直接返回空字符串，预览区**整块空白、控制台也不报错**。
 * 这类错法提示词讲不清（模型看不出两个符号的差别），改起来又是纯机械替换，
 * 所以直接修。只动这几个按竖线切分的组件正文与 chips / bg 属性，
 * 别的正文里出现全角竖线可能是用户有意写的，不碰。
 */
const PIPE_LIST_TAGS = ['steps', 'timeline', 'badges']

function fixFullwidthPipes(text: string, notes: string[]): string {
  let fixed = false
  const swap = (s: string): string =>
    s.replace(/[｜丨︱]/g, () => {
      fixed = true
      return '|'
    })

  let out = text
  for (const tag of PIPE_LIST_TAGS) {
    out = out.replace(
      new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`, 'gi'),
      (_w, open: string, body: string, close: string) => open + swap(body) + close,
    )
  }
  // chips / bg 这类属性值本身就用 `|` 分组
  out = out.replace(
    /(\b(?:chips|bg)\s*=\s*")([^"]*)(")/gi,
    (_w, a: string, v: string, b: string) => a + swap(v) + b,
  )

  if (fixed) {
    notes.push('竖线原本是中文全角「｜」（解析器只认半角 `|`，会导致整块渲染空白），已自动换成半角')
  }
  return out
}

/**
 * `<compare>` 的两栏标题要写成 `left-title` / `right-title` **属性**，
 * 不能作为 `<left>` / `<right>` 的正文首行。
 *
 * 实测模型会写成：
 *   <compare>
 *   <left>
 *   以前的写法（缺点）
 *
 *   - 想到哪写到哪
 *   </left>
 *   ...
 * 首行没有 `-` 会被 `render` 当成普通文字行，用 14px 灰字渲染——
 * 看着像标题、其实是正文，和右边的「现在的写法（优点）」对不齐；
 * 而写进属性是 14px 加粗深色，两栏才对称。
 *
 * 另一种错法更严重：`<left title="以前的写法">` —— `parseSides()` 用的是
 * `/<left>([\s\S]*?)<\/left>/`，带任何属性都**整块匹配不上，两栏内容全部消失**。
 * 所以遇到带 `title` / `label` 属性的，也把值搬进 `left-title` / `left-label` 并去掉属性。
 *
 * 只在「`<compare>` 自己还没有对应属性」且「首行确实像标题」时动手：
 * 标题行得是不以 `-` / `*` / `![` / `<` 开头、长度 ≤ 24、且下面还有列表行的短句。
 */
function moveCompareSideTitle(text: string, notes: string[]): string {
  const collected: Array<{ fromAttr: string[]; fromLine: string[]; moved: string[] }> = []
  const out = text.replace(
    /<compare\b([^>]*)>([\s\S]*?)<\/compare>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      let attrs = rawAttrs
      let body = rawBody
      const fromAttr: string[] = []
      const fromLine: string[] = []
      const moved: string[] = []

      for (const side of ['left', 'right'] as const) {
        const sideRe = new RegExp(`<${side}\\b([^>]*)>([\\s\\S]*?)<\/${side}>`, 'i')
        const m = body.match(sideRe)
        if (!m) continue

        const sideAttrs = m[1] || ''
        const sideBody = m[2] || ''
        const titleKey = `${side}-title`
        // 已经有标题属性就不动（重复搬会盖掉作者手写的值）
        if (new RegExp(`\\s${titleKey}\\s*=`).test(attrs)) continue

        let title = ''
        let rest = sideBody

        // ① `<left title="以前的写法">`：属性整个作废，把值搬上 `<compare>`
        const attrHit = sideAttrs.match(/\s(?:title|label)\s*=\s*"([^"]*)"/)
        if (attrHit && attrHit[1].trim()) {
          title = attrHit[1].trim()
        } else {
          // ② 正文首行是标题：搬走首行，剩下的正文原样保留
          const lines = sideBody.split('\n')
          const firstIdx = lines.findIndex((l) => l.trim())
          if (firstIdx < 0) continue
          const first = lines[firstIdx].trim()
          const looksHeading =
            !/^[-*+]\s/.test(first) &&
            !/^!\[/.test(first) &&
            !/^</.test(first) &&
            first.replace(/\*\*/g, '').length <= 24
          const hasListAfter = lines.slice(firstIdx + 1).some((l) => /^\s*([-*+]\s|!\[|<)/.test(l))
          if (!looksHeading || !hasListAfter) continue
          title = first
            .replace(/^\*\*(.*)\*\*$/, '$1')
            .replace(/^__(.*)__$/, '$1')
            .trim()
          lines.splice(firstIdx, 1)
          rest = lines.join('\n')
        }

        if (!title) continue
        if (attrHit) fromAttr.push(side)
        else fromLine.push(side)
        attrs += ` ${titleKey}="${title.replace(/"/g, '&quot;')}"`
        const trimmedRest = rest.replace(/^\s*\n+/, '').replace(/\s+$/, '')
        // 重建这一栏时不带任何属性：<left>/<right> 一旦带属性就整块匹配不上
        body = body.replace(sideRe, `<${side}>\n${trimmedRest}\n</${side}>`)
        moved.push(`${titleKey}="${title}"`)
      }

      if (moved.length === 0) return whole
      collected.push({ fromAttr, fromLine, moved })
      return `<compare${attrs}>${body}</compare>`
    },
  )
  for (const item of collected) {
    if (item.fromAttr.length > 0) {
      notes.push(
        `${item.fromAttr.map((x) => `\`<${x}>\``).join('、')} 带了属性（编辑器解析时整块匹配不上，两栏内容会全部消失），已把标题挪到 \`<compare>\` 的 ${item.moved.join('、')} 属性、标签本身去掉属性`,
      )
    }
    if (item.fromLine.length > 0) {
      notes.push(
        `${item.fromLine.map((x) => `\`<${x}>\``).join('、')} 的第一行是标题（会被当成 14px 灰字正文渲染），已挪到 \`<compare>\` 的 ${item.moved.join('、')} 属性`,
      )
    }
  }
  return out
}

/** 序号属性在模型笔下的各种写法 */
const NUMBER_ATTRS = ['num', 'index', 'number', 'no', 'order', 'seq', 'idx']

/**
 * `<title num="01">为什么</title>` 其实是把 `<p-title>` 写成了 `<title>`。
 *
 * 这是「小节标题」需求上最高频的一种错法：`num` 是 `<p-title>` 独有的属性，`<title>`（文章开头
 * 那张大标题卡）没有它。实测模型想到「编号标题」时先摸到 `title` 这个词，就把 `num` 一起写上去，
 * 渲染出来是一张 28px 的封面大标题卡，完全不是用户要的分节小节。
 *
 * 只凭 `num` 就足以判定意图：`<title>` 的合法属性里没有 `num`，写了必然是想要分节标题。
 * 属性原样保留（`num` / `subtitle` / `level` 两个组件通用），只把标签名换掉。
 */
function fixTitleWithNum(text: string, notes: string[]): string {
  const out = text.replace(
    /<title\b([^>]*)>([\s\S]*?)<\/title>/gi,
    (whole, rawAttrs: string, body: string) => {
      // 序号属性模型会换着名字写：num / index / number / no / order / seq。
      // `<title>` 的合法属性里一个数字类属性都没有，命中哪个都说明它想写分节标题。
      const hit = NUMBER_ATTRS.find((k) => new RegExp(`\\s${k}\\s*=`).test(rawAttrs))
      if (!hit) return whole
      const attrs = rawAttrs.replace(new RegExp(`\\s${hit}\\s*=`), ' num=')
      return `<p-title${attrs}>${body}</p-title>`
    },
  )
  if (out !== text) {
    notes.push(
      '带序号的标题写成了 `<title>`（那是文章开头的封面大标题卡），已改成分节标题 `<p-title>`',
    )
  }
  return out
}

/**
 * 组件被写成自闭合（`<p-title num="01" title="…" />`）时补上闭合标签。
 *
 * 实测最隐蔽的一类错误：解析器走的是「找开标签 → 往后收集到闭合标签」这条路径，
 * 遇到 `<p-title … />` 找不到 `</p-title>`，**整块直接消失**——预览空白、插进编辑器也是空白，
 * 而且不报错、质检也查不出来（标签名合法、属性也合法）。
 *
 * 只有 `<img>` 是天生自闭合的，其余组件一律要成对写。这是纯语法补齐、信息无损，直接修。
 */
function expandSelfClosingTags(text: string, notes: string[]): string {
  const legal = legalTags()
  const fixedTags: string[] = []
  const out = text.replace(
    /<([a-z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*\/>/g,
    (whole, tag: string, attrs: string) => {
      if (!legal.has(tag)) return whole
      if (INLINE_TAGS.includes(tag)) return whole
      if (SELF_CLOSING_OK_TAGS.includes(tag)) return whole
      if (!fixedTags.includes(tag)) fixedTags.push(tag)
      return `<${tag}${attrs}></${tag}>`
    },
  )
  if (fixedTags.length > 0) {
    const list = fixedTags.map((t) => `<${t}>`).join('、')
    notes.push(
      `${list} 写成了自闭合（结尾是 \`/>\`），编辑器找不到闭合标签会整块丢掉，已自动补上闭合标签`,
    )
  }
  return out
}

/**
 * 素材最外层包一层 `<container display="block">`——**但只对「松散拼起来的」素材**。
 *
 * 需求（用户 2026-11-18）：生成的素材要用 R-Markdown 的容器组件来生成。
 * 随后修正（同一天，用户第二条）：不是所有素材都需要容器包裹，**`<html>` 明确不要**。
 *
 * 所以现在是「按需包裹」，而不是统一外包：
 * - 单个成品组件（`<steps>` / `<cta>` / `<title>` / `<img>` …）**不包**——它自己就是完整版式，
 *   再套一层容器等于给它加了一圈内边距和底色，和直接用组件的样子不一样。
 * - 纯 `<html>` 块**绝不包**——块内是按整宽写死的原生 HTML，套壳会多一层 section，
 *   复制到公众号也会多一层嵌套。
 * - 其余情况（多个块拼一起、`row`/`column`/`text` 自由拼版、混着段落文字）才包，
 *   这时候容器起的是「一个整体」的作用。
 *
 * 为什么必须是 `display="block"`：`<container>` 的默认 `display` 是 `flex`、
 * `direction` 是 `row`。实测在 660px 宽的预览里放 `<p-title>` + `<steps>`，
 * 两个子组件各被压到 108px / 137px 宽，挤在同一行；改成 `direction="column"`
 * 只解决方向，子元素仍按内容收缩；只有 `display="block"` 才让每个子组件各占整宽
 * （660 / 660），和它们直接放在文章里的宽度一致。
 *
 * 已经包过的不重复包：只在最外层缺 `display` 时补上 `display="block"`
 * （模型自己写了 `display="flex"` 之类说明它是有意的横向排版，保留）。
 */
function wrapInContainer(text: string, notes: string[]): string {
  const body = text.trim()
  if (!body) return body

  const wrapped = /^<container\b([^>]*)>([\s\S]*)<\/container>$/i.exec(body)
  if (wrapped) {
    const attrs: string = wrapped[1]
    if (/\bdisplay\s*=/.test(attrs)) return body
    notes.push(
      '`<container>` 没写 `display`（默认是 flex-row，多个子组件会被挤成一行），已补上 `display="block"`',
    )
    return `<container display="block"${attrs}>${wrapped[2]}</container>`
  }

  // 单个成品组件 / 纯 `<html>` / 整块 SVG：它自己有完整版式，套容器只会破坏原貌
  if (hasTopLevelHtmlBlock(body) || isSingleComponent(body) || isWholeSvg(body)) return body

  return `<container display="block">\n${body}\n</container>`
}

/**
 * 整段素材就是一个 `<svg>`（矢量图自带尺寸与版式）。
 *
 * 和纯 `<html>` 同样处理：不套 `<container>`。套上去不会立刻报错，但容器默认那套
 * flex 布局会去改 SVG 的宽度表现，等于给一张有自己 viewBox 的图外面再套一层盒子。
 */
function isWholeSvg(body: string): boolean {
  // 素材边界注释（`<!-- 素材开始 -->`…）不算内容，先剥掉再判断，
  // 否则「带注释的一整段 SVG」会被当成松散组合又包一层容器
  const bare = body.replace(/<!--[\s\S]*?-->/g, '').trim()
  return /^<svg\b[\s\S]*<\/svg>$/i.test(bare)
}

/**
 * `<p-title>` 的序号必须写在 `num` 属性上，不能混在正文里。
 *
 * 实测：模型会把序号当成标题文字的一部分，写成 `<p-title>01 为什么</p-title>`。
 * `render` 里 `num` 为空就不画那个大号序号，于是「01」变成标题文字的一部分，
 * 和标题一样用 30px 大字渲染——版式整个歪掉，但预览「看起来有内容」，很容易被忽略。
 *
 * 只在「没有 num 也没有 title 属性」「正文单行且以 1–2 位数字开头」时动手，其余不动。
 */
function movePtitleNumIntoAttr(text: string, notes: string[]): string {
  return text.replace(
    /<p-title\b([^>]*)>([\s\S]*?)<\/p-title>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      if (/\snum\s*=/.test(rawAttrs) || /\stitle\s*=/.test(rawAttrs)) return whole
      const body = rawBody.trim()
      if (!body || body.includes('\n')) return whole
      const m = body.match(/^(\d{1,2})\s*[、.．,，:：|｜\-—]?\s*(\S.*)$/)
      if (!m) return whole
      notes.push(
        '序号原本写在 `<p-title>` 正文里（会和标题一起用大字渲染），已挪到 `num` 属性、正文只留标题文字',
      )
      return `<p-title${rawAttrs} num="${m[1]}">${m[2].trim()}</p-title>`
    },
  )
}

/**
 * `<title>主标题 | 副标题</title>` → `<title subtitle="副标题">主标题</title>`。
 *
 * 实测：模型会把主副标题用 `|` 拼在正文里，结果副标题被当成标题的一部分，
 * 用 28px 大字一起渲染出来。主标题是正文、副标题是 `subtitle` 属性，
 * 这种错位纯属位置问题，直接拆开。
 *
 * 只在「写法里没有 subtitle 属性」且「正好切出两段」时动手，多段或已有 subtitle 就不碰。
 */
function splitTitleSubtitle(text: string, notes: string[]): string {
  return text.replace(
    /<title\b([^>]*)>([\s\S]*?)<\/title>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      if (/\ssubtitle\s*=/.test(rawAttrs)) return whole
      const parts = rawBody
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
      if (parts.length !== 2) return whole
      notes.push(
        '主副标题原本用 `|` 拼在一起（副标题会被当成标题正文渲染），已拆成标题文字 + `subtitle` 属性',
      )
      return `<title${rawAttrs} subtitle="${parts[1]}">${parts[0]}</title>`
    },
  )
}

/**
 * 块级组件的开标签、正文、闭标签被挤在同一行。
 *
 * 解析器对 `<cta>` / `<steps>` / `<timeline>` / `<table>` 这一族走的是「先找到开标签，
 * 再往后**逐行**找闭标签」的路径：闭标签不在开标签所在行之后的新行上，就退回单行内联分支
 * （`render(attrs, '', t)`，正文整段丢弃）；`<timeline>` / `<table>` / `<case-flow>`
 * 更糟，一行都解析不出时直接返回空字符串，**整块消失**，还会把后面的段落一起吞掉。
 *
 * 提示词里已经写明「块级组件要三行写」，但模型仍会压成一行（它在别处见到的
 * `<div>文字</div>` 都是一行）。这是纯换行调整、内容一字不动，直接修比让模型重写可靠。
 *
 * 只处理「开标签 → 同一行内的正文 → 匹配的闭标签」这种确定的形状；
 * 正文为空（`<cta …></cta>`）或正文里已经换行的不动。
 */
const NEED_OWN_LINE_TAGS = [
  'cta',
  'breaking',
  'steps',
  'timeline',
  'case-flow',
  'table',
  'row',
  'compare',
  'left',
  'right',
  'column',
  'container',
  'stack',
]

function splitInlineBlocks(text: string, notes: string[]): string {
  const touched: string[] = []
  let out = text

  for (const tag of NEED_OWN_LINE_TAGS) {
    const before = out
    // ① 开标签后面紧跟着正文 → 补换行。空组件（`<tag></tag>`）本来就合法，跳过。
    out = out.replace(
      new RegExp(
        `(<${tag}\\b(?:[^<>"']|"[^"]*"|'[^']*')*>)(?![\\s]*\\n)(?!\\s*</${tag}\\s*>)`,
        'gi',
      ),
      (_m, open: string) => `${open}\n`,
    )
    // ② 闭标签前面紧贴着正文 → 补换行
    out = out.replace(
      new RegExp(`([^\\s>])(</${tag}\\s*>)`, 'gi'),
      (_m, prev: string, close: string) => `${prev}\n${close}`,
    )
    // ②b 闭标签前面紧贴着**另一个闭标签**（`…</text></column>`）。
    // 上一条的 `[^\s>]` 排除了 `>`，这类写法会漏掉：实测
    // `<column flex="1">\n<text …>点设置</text></column>` 的整个 column 正文
    // 渲染成 `""`（collectBlockBody 的单行闭合分支把 body 取成 `</text>` 之前的
    // 空串），必须单独补一条。
    out = out.replace(
      new RegExp(`(</[a-z][\\w-]*\\s*>)[ \\t]*(</${tag}\\s*>)`, 'gi'),
      (_m, prev: string, close: string) => `${prev}\n${close}`,
    )
    // ③ 闭标签后面紧跟另一个标签（`</left><right>`）→ 补换行
    out = out.replace(
      new RegExp(`(</${tag}\\s*>)(?=[^\\s<])`, 'gi'),
      (_m, close: string) => `${close}\n`,
    )
    if (out !== before && !touched.includes(tag)) touched.push(tag)
  }

  if (touched.length === 0) return text
  const list = touched.map((t) => `<${t}>`).join('、')
  notes.push(
    `块级组件的正文原本和标签挤在同一行（${list}），解析器会把正文丢掉甚至吃掉后面的段落，已自动拆成三行`,
  )
  return out
}

/**
 * `<cta>` 的属性写错位置。
 *
 * 实测模型给 `<cta>` 写 `subtitle`（这个属性不存在，会被静默忽略），
 * 又把按钮文字写进正文、说明文字塞进属性。`CTA_DA01` 的合法属性只有
 * `label` / `title` / `button` / `color` / `light` / `margin`，其中：
 * - `title` 是主标题
 * - `button` 是按钮文字
 * - 正文是标题下方那行补充说明（14px 小字）
 *
 * 于是做两件事，都是纯位置转移：
 * 1. `subtitle` / `desc` / `description` / `text` 这些不存在的属性 → 值搬进正文；
 * 2. 没有 `button` 但有正文时，把正文最后一行（短、像按钮文案）搬进 `button`。
 */
const CTA_GHOST_ATTRS = ['subtitle', 'desc', 'description', 'text', 'content']

/**
 * 别的组件被当成行动号召写（带上了按钮属性）。
 *
 * 实测两种：
 *   <engage title="…" desc="关注后回复关键词…" btn="立即关注领取"></engage>
 *   <title title="…" desc="关注后回复关键词…" btn="立即关注领取"></title>
 * `btn` / `button` 只有 `<cta>` 才有——`<engage>` 是纯文字互动卡片、`<title>` 是封面大标题卡，
 * 都没有按钮位，把按钮属性留给它们渲染出来就是一张没有按钮的卡片。
 * 带了按钮属性就说明用户要的是「一句话 + 一个按钮」，只可能是想写 `<cta>`，
 * 所以整块换成 `<cta>`，剩下的属性搬家交给 `fixCtaAttrs()`。
 *
 * 只在带按钮属性时才换——`<engage title subtitle>`、`<title badge subtitle>` 都是合法写法，不能动。
 */
const CARD_NO_BUTTON_TAGS = [
  'engage',
  'title',
  'breaking',
  'statement',
  'lead',
  'badges',
  'p-title',
]

function upgradeCardToCta(text: string, notes: string[]): string {
  let out = text
  for (const tag of CARD_NO_BUTTON_TAGS) {
    out = out.replace(
      new RegExp(`<${tag}\\b((?:[^<>"']|"[^"]*"|'[^']*')*)>([\\s\\S]*?)</${tag}>`, 'gi'),
      (whole, rawAttrs: string, rawBody: string) => {
        if (!/\s(?:btn|button)\s*=/i.test(rawAttrs)) return whole
        const attrs = rawAttrs.replace(/\s+btn\s*=/i, ' button=')
        notes.push(
          `\`<${tag}>\` 没有按钮位；这张卡写了按钮，已换成支持按钮的 \`<cta>\`（要纯文字卡片就不要写按钮）`,
        )
        return `<cta${attrs}>${rawBody}</cta>`
      },
    )
  }
  return out
}

function fixCtaAttrs(text: string, notes: string[]): string {
  let movedToBody = false
  let movedToButton = false

  const out = text.replace(
    /<cta\b((?:[^<>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/cta>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      let attrs = rawAttrs
      const extra: string[] = []
      for (const key of CTA_GHOST_ATTRS) {
        const m = attrs.match(new RegExp(`\\s+${key}\\s*=\\s*"([^"]*)"`))
        if (!m) continue
        const val = m[1].trim()
        attrs = attrs.replace(m[0], '')
        if (val && !extra.includes(val)) extra.push(val)
      }
      if (extra.length > 0) movedToBody = true

      const bodyLines = rawBody
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const hasButton = /\sbutton\s*=/.test(attrs)

      // 没有 button 时，判断末行是不是「按钮文案」：短、不带句末标点、且以号召动词开头。
      // 判定要严——「只要一段说明」的卡片，末行也是一句短话，不能一律当按钮搬走。
      let buttonLine = ''
      if (!hasButton && bodyLines.length > 0) {
        const last = bodyLines[bodyLines.length - 1]
        const short = last.length <= 14 && !/[。，,；;：:]$/.test(last)
        const looksButton =
          /^(立即|马上|现在|点击|点此|点这|关注|领取|获取|下载|报名|加入|扫码|回复|查看|前往)/.test(
            last,
          )
        if (short && looksButton) {
          buttonLine = last
          bodyLines.pop()
          movedToButton = true
        }
      }

      const bodyParts = [...extra, ...bodyLines]
      const rebuiltAttrs = buttonLine ? `${attrs} button="${buttonLine}"` : attrs
      const rebuiltBody = bodyParts.length > 0 ? `\n${bodyParts.join('\n')}\n` : ''
      return `<cta${rebuiltAttrs}>${rebuiltBody}</cta>`
    },
  )

  if (movedToBody) {
    notes.push('`<cta>` 上的 subtitle / description 等属性不存在（会被忽略），已把内容搬进标签正文')
  }
  if (movedToButton) {
    notes.push('`<cta>` 的按钮文字原本写在正文里，已搬进 `button` 属性')
  }
  return out
}

/**
 * 属性值的引号被写成了中文弯引号，例如 `<steps type=“DA02”>`。
 *
 * 实测：模型在中文语境里很容易把 `"` 打成 `“ ”`。解析器只认直引号，于是这个属性
 * **整个读不到**——`type="DA02"` 失效后 `<steps>` 会静默退回 A01 样式，不报错、
 * 界面上也看不出问题，只是样式莫名其妙的变成了另一套。属于纯字符级错误，直接换成直引号。
 */
function fixAttributeQuotes(text: string, notes: string[]): string {
  let fixed = false
  const out = text.replace(/(<[a-z][\w-]*\b[^<>]*>)/gi, (tag) =>
    tag.replace(/=\s*[“”]([^“”<>]*)[“”]/g, (_m, val: string) => {
      fixed = true
      return `="${val}"`
    }),
  )
  if (fixed) {
    notes.push('属性值的引号原本是中文引号（解析器读不到这个属性），已自动换成英文双引号')
  }
  return out
}

/**
 * `<badges>` 的子内容必须一行写完、用 `|` 分隔。两种错法都要修：
 *
 * 1. 逐行写：`<badges>\n拆解\n类比\n说人话\n</badges>`——`render` 只按 `|` 切，
 *    整段（含换行）会变成**一个**长标签。
 * 2. 逗号写：`<badges>结构化表达,去术语化,场景化讲解</badges>`——同上，三个标签变一个。
 *
 * 两种都是纯位置/分隔符问题、信息无损，直接修。
 */
function fixBadgesSeparator(text: string, notes: string[]): string {
  return text.replace(
    /<badges\b([^>]*)>([\s\S]*?)<\/badges>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      const body = rawBody.trim()
      if (!body || body.includes('|')) return whole

      // 逐行写的形状最明确：一行一个标签，只要每行是短词就直接并成一行
      const lines = body
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
      if (lines.length > 1) {
        if (lines.some((x) => x.length > 12)) return whole
        notes.push('标签原本逐行写（会渲染成一个长标签），已自动并成一行、用 `|` 分隔')
        return `<badges${rawAttrs}>${lines.join('|')}</badges>`
      }

      // 单行逗号分隔：只有「明显是标签列表」时才动手（至少三个短条目，每个不超过 8 字）。
      // 两个条目的句子（「这是一句话，别拆」）跟二元素标签列表长得一模一样，
      // 分不出来就不修——交给质检报警 + 重试，交给用户判断，绝不擅自改内容。
      if (!/[,，、]/.test(body)) return whole
      const items = body
        .split(/[,，、]/)
        .map((x) => x.trim())
        .filter(Boolean)
      if (items.length < 3) return whole
      if (items.some((x) => x.length > 8)) return whole
      notes.push('标签之间原本用逗号分隔（会渲染成一个长标签），已自动改成 `|` 分隔')
      return `<badges${rawAttrs}>${items.join('|')}</badges>`
    },
  )
}

/**
 * `<title>` / `<breaking>` 的关键词标签要用 `chips` 属性，不能另起一个 `<badges>`。
 *
 * 实测模型会写成：
 *   <title subtitle="讲清楚，才是真的懂。">把复杂的事讲简单</title>
 *
 *   <badges>说人话|拆结构|给例子</badges>
 * `<badges>` 本身能渲染，但它是**独立的一个块**——排在标签卡外面，视觉上是卡片下方
 * 又飘出一行标签，跟卡片里的 `#关键词` 完全不是一回事。这两个组件都自带 `chips`，
 * 那才是「卡片内部的关键词」的正确位置。
 *
 * 只在两个条件同时成立时才合并：卡片紧跟（中间只有空白）一个 `<badges>`，且卡片自己没写 `chips`。
 * 卡片已经有 `chips` 时两个都留着——用户可能真的想要卡片 + 下方标签组两处都有。
 */
const CHIP_CARD_TAGS = ['title', 'breaking']

function mergeBadgesIntoCard(text: string, notes: string[]): string {
  let out = text
  for (const tag of CHIP_CARD_TAGS) {
    const re = new RegExp(
      `(<${tag}\\b((?:[^<>"']|"[^"]*"|'[^']*')*)>[\\s\\S]*?</${tag}>)\\s*(<badges\\b[^>]*>([\\s\\S]*?)</badges>)`,
      'gi',
    )
    out = out.replace(
      re,
      (whole, card: string, attrs: string, _badges: string, badgesBody: string) => {
        if (/\schips\s*=/.test(attrs)) return whole
        const chips = normalizePipe(badgesBody)
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
          .join('|')
        if (!chips) return whole
        notes.push(
          `\`<${tag}>\` 的关键词原本写成了独立的一整块 \`<badges>\`（会掉到卡片外面），已并进 \`chips\` 属性`,
        )
        return card.replace(
          new RegExp(`^(<${tag}\\b[^>]*)>`),
          (_m, head: string) => `${head} chips="${chips}">`,
        )
      },
    )
  }
  return out
}

/**
 * 属性名被模型按语义改写过：`main` / `sub` / `items` 这类词编辑器一个都不认。
 *
 * 实测真实生成：
 *   <title main="把复杂的事讲简单" sub="讲清楚，才是真的懂。"></title>
 *
 *   <badges items="说人话,拆结构,给例子"></badges>
 * 三个属性全部静默失效，渲染出来是一张空白标题卡 + 一块空标签组。这不是「内容写错」，
 * 而是「同一个东西换了个名字」，能一一对应回来，所以直接改名而不是重试。
 */
const TITLE_BODY_ALIASES = ['main', 'headline', 'heading', 'text', 'content']
const SUBTITLE_ALIASES = ['sub', 'subheading', 'subTitle', 'desc', 'description', 'lead', 'slogan']
const CHIPS_ALIASES = ['tags', 'tag', 'keywords', 'keyword', 'labels', 'label', 'chipsList']
const BADGES_BODY_ALIASES = ['items', 'item', 'list', 'tags', 'tag', 'keywords', 'labels', 'values']

function readAttr(attrs: string, names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const m = attrs.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))
    if (m) return { name, value: m[1].trim() }
  }
  return null
}

function dropAttr(attrs: string, name: string): string {
  return attrs.replace(new RegExp(`\\s+${name}\\s*=\\s*"[^"]*"`, 'i'), '')
}

function fixAliasAttrs(text: string, notes: string[]): string {
  const renamed: string[] = []

  // <badges items="a,b,c"></badges> → <badges>a|b|c</badges>
  let out = text.replace(
    /<badges\b([^>]*)>([\s\S]*?)<\/badges>/gi,
    (whole, attrs: string, body: string) => {
      if (body.trim()) return whole
      const hit = readAttr(attrs, BADGES_BODY_ALIASES)
      if (!hit || !hit.value) return whole
      const value = normalizePipe(hit.value)
        .split(/[,，、]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .join('|')
      if (!value) return whole
      renamed.push(`<badges> 的 ${hit.name}`)
      return `<badges${dropAttr(attrs, hit.name)}>${value}</badges>`
    },
  )

  out = out.replace(
    /<title\b([^>]*)>([\s\S]*?)<\/title>/gi,
    (whole, attrs: string, body: string) => {
      let next = attrs
      let changed = false

      const sub = readAttr(next, SUBTITLE_ALIASES)
      if (sub && !/\ssubtitle\s*=/i.test(next)) {
        next = `${dropAttr(next, sub.name)} subtitle="${sub.value}"`
        renamed.push(`<title> 的 ${sub.name}`)
        changed = true
      }

      const chips = readAttr(next, CHIPS_ALIASES)
      if (chips && !/\schips\s*=/i.test(next)) {
        const value = normalizePipe(chips.value)
          .split(/[,，、]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .join('|')
        next = `${dropAttr(next, chips.name)} chips="${value}"`
        renamed.push(`<title> 的 ${chips.name}`)
        changed = true
      }

      // 标题正文：正文为空时才搬，防丢正文
      let nextBody = body
      if (!body.trim()) {
        const main = readAttr(next, [...TITLE_BODY_ALIASES, 'title'])
        if (main && main.value) {
          nextBody = main.value
          next = dropAttr(next, main.name)
          renamed.push(`<title> 的 ${main.name}`)
          changed = true
        }
      }

      if (!changed) return whole
      return `<title${next}>${nextBody}</title>`
    },
  )

  if (renamed.length) {
    notes.push(
      `${renamed.join('、')} 这几个属性名编辑器不认识（内容会整块消失），已改回组件支持的属性名`,
    )
  }
  return out
}

/**
 * `<title>` 的标题文字必须写在正文里，不能写在 `title` 属性上。
 *
 * 实测：模型经常写 `<title title="把复杂的事讲简单" subtitle="…"></title>`——它把「标题」
 * 理解成一个 `title` 属性（这很像它见过的其它卡片组件）。但 `<title>` 的 `render` 读的是 body，
 * 属性里那个 `title` 不存在，会被静默忽略：标题区直接空白，只剩右侧的阅读时长统计。
 *
 * 这是纯位置转移、无信息丢失，所以直接修。
 */
function moveMisplacedTitle(text: string, notes: string[]): string {
  return text.replace(
    /<title\b([^>]*)>([\s\S]*?)<\/title>/gi,
    (whole, rawAttrs: string, rawBody: string) => {
      const m = rawAttrs.match(/\stitle\s*=\s*"([^"]*)"/)
      if (!m) return whole
      const titleText = m[1].trim()
      const bodyText = rawBody.trim()
      // 正文已经有内容就不动（模型的写法可能是对的，重复搬会丢正文）
      if (!titleText || bodyText) return whole
      const attrs = rawAttrs.replace(/\s*\stitle\s*=\s*"[^"]*"/, '')
      notes.push('标题文字原本写在 `title` 属性上（不会显示），已自动挪到 `<title>` 标签中间')
      return `<title${attrs}>${titleText}</title>`
    },
  )
}

/**
 * 找出用了未声明属性的地方。
 *
 * 实测：模型会凭语义给组件加属性（给 `<steps>` 写 `description`、给 `<title>` 写 `desc`），
 * 编辑器不认识这些属性，直接忽略——不报错、也不显示，用户以为成功了其实丢了一层信息。
 * 所以这里做一次检查，在面板上提示，同时把结论喂回重试请求。
 */
export function findIllegalAttrs(md: string): Array<{ tag: string; attr: string }> {
  const allowed = allowedAttrsByTag()
  // `<html>` 块里是原生 HTML（`<table style="…">` 的 style 就合法），`<svg>` 块里是手写矢量图
  // （`viewBox` / `fill` / `stroke-dasharray` 都是它自己的属性），都不能按组件属性表查
  const withoutCode = splitVerbatimBlocks(md)
    .masked.replace(/^[\t ]*(```|~~~)[\s\S]*?^[\t ]*\1[\t ]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')

  const found: Array<{ tag: string; attr: string }> = []
  const seen = new Set<string>()
  const tagRe = /<([a-z][\w-]*)((?:\s+[a-z][\w-]*(?:\s*=\s*"[^"]*")?)*)\s*\/?>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(withoutCode)) !== null) {
    const tag = m[1]
    const attrs = allowed[tag]
    if (!attrs) continue
    const attrRe = /([a-z][\w-]*)\s*=/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(m[2])) !== null) {
      const key = a[1]
      if (attrs.includes(key)) continue
      const id = `${tag}:${key}`
      if (seen.has(id)) continue
      seen.add(id)
      found.push({ tag, attr: key })
    }
  }
  return found
}

/**
 * 判断模型是否写成了 JSX / React 外形（`<Steps>`、`<Step ... />`、`current={0}`）。
 *
 * 实测：只靠 system prompt 里的「禁止 JSX」拦不住——模型看到「步骤流」就联想 Steps 组件，
 * 而它在训练里见到的 Steps 几乎都是 Ant Design 的 JSX 写法。所以这里做一次检测，
 * 命中就让面板带着「上一版错在哪」再要一次，而不是把废稿直接给用户。
 */
export function looksLikeJsx(text: string): boolean {
  // 注意：**必须连代码围栏里的内容一起看**。模型经常是「先一段选型说明 + 一个 ```jsx 围栏」，
  // 只扫围栏外的话就会漏判，废稿照样上屏（踩过一次）。
  // 大写的组件标签：R-Markdown 的标签全是小写，大写必然不是我们的语法
  if (/<\/?[A-Z][A-Za-z0-9]*[\s/>]/.test(text)) return true
  // 花括号表达式属性：current={0}
  if (/\b[a-zA-Z-]+\s*=\s*\{[^}]*\}/.test(text)) return true
  return false
}

/** 剥掉源码前面的散文（模型爱先讲一遍选型理由再给代码） */
function stripPreamble(text: string): string {
  // 首行就是标签或空行 → 没有前言
  if (/^<[a-z]/.test(text)) return text

  // 有 ``` 围栏时，围栏里的才是源码；把围栏外的前言连同围栏一起换成围栏内容
  const block = text.match(/^[\s\S]*?```[a-zA-Z]*\s*\n([\s\S]*?)\n?```/)
  if (block && block[1].trim()) return block[1].trim()

  // 没有围栏：从第一个「像源码的行」开始截。标签行、或纯中文/正文行都可能，
  // 因此只切掉明显的说明行（以「需求 / 分析 / 思路 / 选择 / 说明 / 类型 / 方案」开头且带冒号或箭头）
  const lines = text.split('\n')
  let start = 0
  while (start < lines.length) {
    const line = lines[start].trim()
    if (!line) {
      start += 1
      continue
    }
    const isExplain = /^(需求|分析|思路|选择|说明|类型|方案|建议)[^\n]{0,120}(?:：|:|→)/.test(line)
    if (!isExplain) break
    start += 1
  }
  return lines.slice(start).join('\n').trim()
}

/** 模型输出的清洗：剥前言、围栏、整页 HTML、外层包裹与结尾客套 */
export function cleanMaterialOutput(raw: string): string {
  let text = stripPreamble(raw.trim())

  // 整篇被代码围栏包裹（``` 或 ```markdown / ```jsx）
  const fence = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/)
  if (fence) text = fence[1].trim()

  // 偶尔会把整页 HTML 文档吐出来（<!DOCTYPE html> + <style> + <body>）。
  // 编辑器不认识这些，插进去就是一坨源码，所以只保留 <body> 里的内容。
  // 注意：<html> 组件本身是合法语法，但它不写文档结构，所以只在出现 html 根节点时才判断。
  if (/^<!DOCTYPE html>|^<html[\s\S]*<body|<head[\s>]/i.test(text)) {
    const body = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    text = (body ? body[1] : text.replace(/<style[\s\S]*?<\/style>/gi, '')).trim()
  }

  // 模型有时会自作主张包一层 <article> / <material>，那不是编辑器认识的标签
  const wrapper = text.match(/^<(article|material|output|result)>\s*\n?([\s\S]*?)\n?<\/\1>$/i)
  if (wrapper) text = wrapper[2].trim()

  // 结尾「如需…可以…」「希望…」这类补充说明
  const tail =
    /\n{2,}(?:如果|如需|若需|需要的话|希望|以上|如有)[^\n]{0,120}(?:可以|请|告诉我|调整|修改)[^\n]{0,120}[。！]?$/
  const trimmedTail = text.replace(tail, '')
  if (trimmedTail !== text) text = trimmedTail.trim()

  // 连续空行收敛为 1 个
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export interface MaterialSystemOptions {
  /** 技能全文（loadMaterialSkill 的返回值） */
  skill: string
  /**
   * 组件属性参考全文（loadFormatSpec 的返回值）。
   *
   * 技能里已经给了每个组件的完整写法，这份是「属性还有哪些取值」的词典，
   * 用来兜住技能没展开的属性（比如 `<title>` 的 style 档位）。空串表示不附带。
   */
  spec?: string
}

/**
 * 构造 system prompt。
 *
 * 段落顺序与另外两个 AI 面板一致：**稳定大段在前**（技能全文、属性参考），
 * 易变指令在后，便于供应商侧前缀缓存命中。
 *
 * 但和排版那边有个关键差别：这段 prompt 里的「输出契约」只写框架（身份、边界、
 * 输出格式），具体玩法全在技能里。以后要调玩法只改 SKILL.md，别往这里加规则——
 * 否则两处各说一套，模型会挑好写的那个遵守。
 */
export function buildMaterialSystemPrompt(opts: MaterialSystemOptions): string {
  const skill = opts.skill.trim()

  const parts: string[] = [
    '你是 R-Markdown 编辑器里的素材设计师。',
    '用户会用一句话描述他想要的一段素材，你直接产出这段素材的 R-Markdown 源码，',
    '供他插入文章，或存进素材库反复使用。',
    '',
    '# 输出契约（最高优先级，任何情况下不得违反）',
    '',
    '1. **只输出素材源码本身**。不要解释、不要寒暄、不要「以下是……」，不要前言后记。',
    '2. **不要用 ``` 围栏包住输出**。',
    '3. **第一行就是素材源码**，不要先写选型说明（「需求 → 组件：……」这类）。',
    '4. **只产出一段素材**，不写成完整文章。需求没提到的章节、开头、总结一律不要补。',
    '5. **必须有版式**。普通 Markdown 的 `##` 标题加 `-` 列表不算完成——' +
      '要么用现成的卡片组件（`<title>` `<steps>` `<compare>` 等），要么用布局组件' +
      '（`<container>` `<row>` `<column>` `<text>` `<stack>` `<positioned>`）像写 HTML 一样自己搭，' +
      '要么把整段写成 `<html>` 包裹的原生 HTML。**不强制套成品卡片组件**，怎么好看怎么来。' +
      '**没点名组件时，默认优先自己搭**：需求能对上技能映射表里的专有组件才用那个组件；' +
      '对不上的版式一律优先用布局组件（`<container>` `<row>` `<column>` `<text>`）拼，' +
      '或者整段交给 `<html>`——**不要为了「用上组件」把内容硬塞进不相干的卡片**' +
      '（一段普通说明塞进 `<steps>`、一句总结塞进 `<case-flow>`，都是版式与内容对不上，比手搭更差）。',
    '6. **只用技能里列出的标签与属性**；在 `<html>` 块里可以直接写微信编辑器支持的原生 HTML' +
      '（`<h2>` `<p>` `<ul>` `<li>` `<table>` 等），在 `<svg>` 块里可以写完整的 SVG 标签与属性' +
      '（`<rect>` `<circle>` `<path>` `<text>` 等），块外不许自造组件、不许编造图片地址与外链。' +
      '**`<html>` 里的所有样式必须写成行内 `style="…"`**：不许用 `class`、不许写 `<style>` 标签、' +
      '不许引用任何外部样式表——微信编辑器会丢掉 class，只认元素上的行内样式。' +
      '**`<svg>` 里同理**：图形属性写元素上，不要 `<style>` 标签、不要 `class`。' +
      '**`<html>` 块内部按原生 HTML 直接输出，组件不会被解析**——块里只能出现原生 HTML 标签、' +
      '`<img>` 与 `<svg>`，不许把 `<steps>` `<title>` `<badges>` 这类组件塞进去（读者会看到源码本身）；' +
      '要放组件就放到 `<html>` 外面。' +
      '**要做「点一下就动」只能用 `<svg>` + SMIL**（`<animate>` / `<set>`，`begin="click"` 或' +
      ' `begin="触发区id.click"`）：`<details>` `<summary>` `<button>` 在公众号里会被拆开、' +
      '只剩平铺的文字，做不出折叠或切换的效果。',
    '7. **要不要包 `<container>` 看内容**：① 单个成品组件（`<steps>` `<cta>` `<title>` `<compare>` `<img>` 这类）' +
      '**直接输出组件本身，不要外套 `<container>`**；② 写成 `<html>` 块的原生 HTML、或整块 `<svg>` 矢量图' +
      '**都不要包**，它们自己就带完整版式；③ 只有「多个块拼在一起」「用 `<row>` `<column>` `<text>` 自由拼版」' +
      '这种松散组合，才在最外层包一层 `<container display="block">` 把它们收成一个整体（只包一层，不要嵌套）。',
    '8. **`<html>` 块里只用 `<section>`，不要用 `<div>`**。微信编辑器自己产出的结构就是 `<section>`，' +
      '`<div>` 保存时更容易被合并层级、和相邻样式串在一起。两者在公众号里表现一致，' +
      '所以 `<section style="…">文字</section>` 是安全写法，`<div style="…">` 不是。',
    '9. **这些写进 `<html>` 块等于白写，微信服务器保存时会直接删掉**：' +
      '`position`（连带 `top` / `left` / `inset` 一起失效）、`filter`、CSS 变量（`--x` 与 `var()`）、' +
      '`!important`、`font-family`、`text-align: start|end`、`id`、`on*` 事件属性。' +
      '抠版式只能靠 `display` / `flex` / `gap` / `margin` / `padding` / `transform` 这些，' +
      '叠放用 flex 排位，不要绝对定位。**图片一律不写 `url()`**（外链和 `data:` 会让整个元素被删）——' +
      '需要配图时留空 `src` 交给用户自己上传。',
    '10. **用户点名了组件，就必须用点名的那一个**。需求里出现 `<steps>`、`/steps`、' +
      '「用 steps 组件」「换成 badges」「用 mermaid 画」这类写法时，就是点名的意思：' +
      '不许换成性质相近的别的组件（点名 `<steps>` 却给 `<case-flow>`），也不许绕成手写 `<html>` ' +
      '画一个「效果差不多」的版式。点名组件的**完整属性清单与逐字示例**会随这一轮的需求一起给你，' +
      '照那份写：属性名不许换近义词（`bg` 不写成 `background`）、取值不许超范围、' +
      '正文分隔形状按示例来（`<badges>` 用 `|` 分隔写一行、`<steps>` 每行 `- 名称 | 说明`）。' +
      '**点名就等于把范围说到了最小：只输出点名的那一块，不要另配一个组件把同样的内容再讲一遍，' +
      '也不要外套 `<container>`**。需求是「用 mermaid 画一个 A 到 B 的流程图」，就只给一张图；' +
      '再补一段 `<steps>` 把同样的流程用文字重述一遍，是画蛇添足——占版面、抢注意力，用户还得手动删。' +
      '只有用户自己说「再配一个……」「顺便加上……」时，才可以多给一块。' +
      '需求里没点名任何组件时，才按第 5 条自由选型。',
  ]

  if (skill) {
    parts.push('', '# 素材生成技能（唯一玩法标准）', '', skill)
  }

  const spec = (opts.spec || '').trim()
  if (spec) {
    parts.push(
      '',
      '# 附录：组件属性参考（**每个标签的完整属性清单以这里为准**）',
      '',
      '技能正文按用途挑常用属性展开，**没在技能里提到的属性不代表不能写**——',
      '要自定义颜色、渐变底色、内外边距、圆角、字号这类，先到这里查有没有对应属性，',
      '有就照附录写，别因为技能没举例就改去手写 `<html>` 或干脆不做。',
      '',
      spec,
    )
  }

  parts.push('', '# 可用组件标签速查（除这些之外一个都不能用）', '', componentCheatsheet())

  parts.push('', '# 每个标签能写哪些属性（凭感觉加属性会被静默忽略）', '', componentAttrReference())

  return parts.join('\n')
}

/**
 * 检查子内容形状。
 *
 * 实测最顽固的一类错误：模型知道该用 `<compare>`，但把左右两栏写成
 * `- 左边一条 | 右边一条`，而不是规范要求的 `<left>` / `<right>` 两个块。
 * 这类错误不会报错——组件照样渲染，只是内容全空，属于「看起来成功其实没做」。
 *
 * 只查形状固定、误判成本低的几个组件；查不准的一律不报，宁可漏检不可误报。
 */
export function findShapeProblems(md: string): string[] {
  const problems: string[] = []
  // `<html>` / `<svg>` 块里是原生 HTML / 矢量图，形状规则（三行写法、`|` 分隔等）只管组件语法
  const withoutCode = splitVerbatimBlocks(md)
    .masked.replace(/^[\t ]*(```|~~~)[\s\S]*?^[\t ]*\1[\t ]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')

  const blockOf = (tag: string): string[] => {
    const out: string[] = []
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) out.push(m[1])
    return out
  }

  // <compare> 内部必须是 <left> + <right>；写成 `- 左 | 右` 行会渲染成空白
  for (const body of blockOf('compare')) {
    const hasLeft = /<left\b/i.test(body)
    const hasRight = /<right\b/i.test(body)
    if (!hasLeft || !hasRight) {
      problems.push('<compare> 里没写 <left> / <right> 两个块，左右两栏会渲染成空白')
    }
  }

  // <compare> 的两栏标题要写成 <compare> 的属性，写成 <left> 首行会被当 14px 灰字正文
  for (const body of blockOf('compare')) {
    for (const side of ['left', 'right']) {
      const m = body.match(new RegExp(`<${side}\\b[^>]*>([\\s\\S]*?)<\\/${side}>`, 'i'))
      if (!m) continue
      const lines = m[1].split('\n')
      const firstIdx = lines.findIndex((l) => l.trim())
      if (firstIdx < 0) continue
      const first = lines[firstIdx].trim()
      const looksHeading = !/^[-*+]\s/.test(first) && !/^!\[/.test(first) && !/^</.test(first)
      const hasListAfter = lines.slice(firstIdx + 1).some((l) => /^\s*([-*+]\s|!\[|<)/.test(l))
      if (looksHeading && hasListAfter) {
        problems.push(
          `<${side}> 的第一行「${first.slice(0, 12)}」像是标题，会被当成 14px 灰字正文；两栏标题要写成 <compare> 的 \`${side}-title="…"\` 属性`,
        )
      }
    }
  }

  // <steps> 每步必须是 `- 名称 | 说明`；缺 `|` 的行会被整行忽略
  // （先归一化全角竖线，否则 `- 名称 ｜ 说明` 会被误报成「缺分隔符」）
  for (const body of blockOf('steps')) {
    const lines = normalizePipe(body)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-'))
    if (lines.length > 0 && lines.some((l) => !l.includes('|'))) {
      problems.push('<steps> 有步骤行缺 `|` 分隔符，应该写成 `- 名称 | 说明`')
    }
    if (lines.length === 0) {
      problems.push('<steps> 里没有 `- 名称 | 说明` 步骤行，步骤会全部丢失')
    }
  }

  // <timeline> 每行至少三段：时间 | 标题 | 描述
  for (const body of blockOf('timeline')) {
    const lines = normalizePipe(body)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-'))
    if (lines.some((l) => l.split('|').length < 3)) {
      problems.push('<timeline> 有节点行少于三段，应该写成 `- 时间 | 标题 | 描述`')
    }
  }

  // <badges> 子内容应该一行写完、`|` 分隔；换行后每行一个字会渲染成一堆断行标签
  for (const body of blockOf('badges')) {
    const lines = normalizePipe(body)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length > 1) {
      problems.push('<badges> 子内容应写成一行、用 `|` 分隔，不要逐行写')
    }
  }

  // <case-flow> 每行必须是 `- [短标签] 标题`；缺方括号的行整行被丢弃（实测 render 只认这个形状）
  for (const body of blockOf('case-flow')) {
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-'))
    if (lines.length === 0) {
      problems.push('<case-flow> 里没有 `- [标签] 标题` 行，案例会全部丢失')
    } else if (lines.some((l) => !/^-\s*\[[^\]]+\]/.test(l))) {
      problems.push('<case-flow> 有案例行缺 `[标签]`，应该写成 `- [案例 01] 标题`，否则整行被丢弃')
    }
  }

  // <badges> 必须用 `|` 分隔，写逗号会渲染成一个长标签
  for (const body of blockOf('badges')) {
    if (normalizePipe(body).includes('|')) continue
    if (/[,，、]/.test(body)) {
      problems.push('<badges> 的子内容要用 `|` 分隔，逗号会被当成一个标签里的文字')
    }
  }

  // 数据型组件：标签内不能有任何正文，数据必须写在属性上
  for (const tag of BODY_IGNORED_TAGS) {
    for (const body of blockOf(tag)) {
      if (!body.trim()) continue
      const hint =
        tag === 'chart'
          ? '数据要写进 `labels="2020,2021,2022"` 和 `values="6.4,7.2,8.5"` 两个属性，例如 ' +
            '`<chart type="bar" labels="2020,2021,2022" values="6.4,7.2,8.5" title="标题"></chart>`'
          : tag === 'slider'
            ? '图片地址要写进 `images="url1,url2,url3"` 属性'
            : '文案要写成 `title` / `subtitle` / `label` 属性'
      problems.push(`<${tag}> 标签内不能有正文，${hint}（写在标签里会被整段丢弃）`)
    }
  }

  // 必填属性漏了：这些组件没有它们是空壳，但不会报错
  const requiredOf: Record<string, string[]> = {
    chart: ['type', 'labels', 'values'],
    slider: ['images'],
    img: ['src'],
  }
  for (const [tag, keys] of Object.entries(requiredOf)) {
    const re = new RegExp(`<${tag}\\b([^>]*)>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) {
      const raw = m[1]
      const missing = keys.filter((k) => !new RegExp(`\\b${k}\\s*=`).test(raw))
      if (missing.length > 0) {
        problems.push(`<${tag}> 缺必填属性：${missing.join('、')}，渲染出来是空壳`)
      }
    }
  }

  // 全角竖线：<steps> / <timeline> / <badges> 只认半角 `|`，一个全角就可能让整块渲染成空白
  for (const tag of PIPE_LIST_TAGS) {
    for (const body of blockOf(tag)) {
      if (/[｜丨︱]/.test(body)) {
        problems.push(
          `<${tag}> 里用了中文全角竖线「｜」，解析器只认半角 \`|\`，会导致这行（严重时整块）渲染成空白`,
        )
      }
    }
  }

  // 块级组件的正文和标签挤在同一行：解析器只往后逐行找闭标签，找不到就退回单行分支，
  // 正文整段丢弃；<timeline> / <table> / <case-flow> 更会直接返回空字符串、吞掉后续段落。
  {
    for (const tag of NEED_OWN_LINE_TAGS) {
      const re = new RegExp(
        `<${tag}\\b((?:[^<>"']|"[^"]*"|'[^']*')*)>([^\\n]*?)</${tag}\\s*>`,
        'gi',
      )
      let m: RegExpExecArray | null
      while ((m = re.exec(withoutCode)) !== null) {
        const body = m[2]
        if (!body.trim()) continue
        problems.push(
          `<${tag}> 的正文和标签写在同一行了，解析器会丢掉这段正文；` +
            `要写成三行：开标签一行、正文一行、\`</${tag}>\` 一行`,
        )
        break
      }
    }
    // 正文本行、但闭标签紧跟在子组件的闭标签后面（`…</text></column>`）：
    // 上面那条正则要求 `</tag>` 与开标签同行，查不到这种跨标签的连写。
    for (const tag of NEED_OWN_LINE_TAGS) {
      const re = new RegExp(`</[a-z][\\w-]*\\s*>[ \\t]*</${tag}\\s*>`, 'gi')
      if (re.test(withoutCode)) {
        problems.push(
          `\`</${tag}>\` 紧跟在上一行末尾了，解析器会把 \`<${tag}>\` 的整段正文丢掉；` +
            `\`</${tag}>\` 要单独占一行`,
        )
        break
      }
    }
  }

  // <cta> 没写 button：按钮区整块不渲染。只在正文末行明显是按钮文案（短、以号召动词开头）时才报，
  // 避免把「确实只要一张纯文字卡片」的写法误判成错误（`button` 本身不是必填属性）。
  {
    const re = /<cta\b((?:[^<>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/cta>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) {
      const [, rawAttrs, rawBody] = m
      if (/\sbutton\s*=/.test(rawAttrs)) continue
      const lines = rawBody
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length === 0) continue
      const last = lines[lines.length - 1]
      const short = last.length <= 14 && !/[。，,；;：:]$/.test(last)
      const looksButton =
        /^(立即|马上|现在|点击|点此|点这|关注|领取|获取|下载|报名|加入|扫码|回复|查看|前往)/.test(
          last,
        )
      if (short && looksButton) {
        problems.push(
          '`<cta>` 没写 `button` 属性，按钮整块不会显示；按钮文字要写成 `button="立即领取"`，' +
            '不要放进正文',
        )
        break
      }
    }
  }

  // 属性值用中文弯引号：解析器整个读不到这个属性，样式静默退回默认值
  {
    const re = /<[a-z][\w-]*\b[^<>]*=\s*[“”][^“”<>]*[“”][^<>]*>/gi
    if (re.test(withoutCode)) {
      problems.push('属性值的引号被写成了中文引号（“ ”），解析器读不到这个属性，请改用英文双引号')
    }
  }

  // 自闭合写法：除 <img> 外，组件写成 `<p-title … />` 会被解析器整块丢掉（找不到闭合标签就跳过）
  {
    const componentTags = new Set(components.map((c) => c.tag))
    const re = /<([a-z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*\/>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) {
      const tag = m[1]
      if (!componentTags.has(tag)) continue
      if (SELF_CLOSING_OK_TAGS.includes(tag)) continue
      problems.push(
        `<${tag}> 写成了自闭合（结尾是 \`/>\`），编辑器找不到闭合标签会整块丢掉、预览是空白。` +
          `要写成 \`<${tag} …></${tag}>\``,
      )
    }
  }

  // 开闭数量对不上：少写闭合标签和写成自闭合一样，整块被解析器丢掉
  {
    const componentTags = components.map((c) => c.tag)
    for (const tag of componentTags) {
      if (SELF_CLOSING_OK_TAGS.includes(tag)) continue
      const opens = (
        withoutCode.match(new RegExp(`<${tag}\\b(?:[^<>"']|"[^"]*"|'[^']*')*>`, 'g')) ?? []
      ).filter((t) => !/\/>$/.test(t)).length
      const closes = (withoutCode.match(new RegExp(`</${tag}\\s*>`, 'g')) ?? []).length
      if (opens > closes) {
        problems.push(
          `<${tag}> 少了 ${opens - closes} 个闭合标签（\`</${tag}>\`），编辑器会整块丢掉、预览是空白`,
        )
      }
    }
  }

  // <title> 上出现 num：那是 <p-title> 的属性，说明把小节标题写成了封面大标题卡
  {
    const re = /<title\b([^>]*)>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) {
      if (new RegExp(`\\s(?:${NUMBER_ATTRS.join('|')})\\s*=`).test(m[1])) {
        problems.push(
          '带序号的标题要用 `<p-title>`；`<title>` 是文章开头的封面大标题卡，没有序号属性',
        )
        break
      }
    }
  }

  // <p-title> 的序号必须放 num 属性；写进正文会和标题一样用大字渲染
  {
    const re = /<p-title\b([^>]*)>([\s\S]*?)<\/p-title>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) {
      const [, rawAttrs, rawBody] = m
      if (/\snum\s*=/.test(rawAttrs) || /\stitle\s*=/.test(rawAttrs)) continue
      const body = rawBody.trim()
      if (!body || body.includes('\n')) continue
      if (/^\d{1,2}\s*[、.．,，:：|｜\-—]?\s*\S/.test(body)) {
        problems.push(
          '<p-title> 的序号不能写在正文里（会和标题一起用大字渲染），要用 `num="01"` 属性给',
        )
      }
    }
  }

  // <title> / <breaking> 的关键词要写 chips 属性；另起一个 <badges> 会掉到卡片外面
  for (const tag of CHIP_CARD_TAGS) {
    const re = new RegExp(
      `<${tag}\\b((?:[^<>"']|"[^"]*"|'[^']*')*)>[\\s\\S]*?</${tag}>\\s*<badges\\b`,
      'gi',
    )
    let m: RegExpExecArray | null
    while ((m = re.exec(withoutCode)) !== null) {
      if (/\schips\s*=/.test(m[1])) continue
      problems.push(
        `<${tag}> 的关键词标签要写成 \`chips="关键词一|关键词二"\` 属性；` +
          `另起一整块 <badges> 会掉到卡片外面，和卡片里的关键词不是一回事`,
      )
      break
    }
  }

  return problems
}

/**
 * 原生 HTML 标签：出现在 `<html>` 块里、或当成行内修饰，都算合法。
 *
 * 为什么不加会出事：用户明确要求「可以纯 html，只要微信编辑器支持范围内都行」，
 * 而 `<html>` 块（`Html_DA01` 的 `render` 原样透出 body）里写的 `<h3>` `<ul>` `<table>`
 * 会被 `findUnknownTags()` 当成「模型自造的组件」驳回，纯 HTML 根本过不了质检。
 *
 * 只收微信编辑器排版会用到的标签：结构性（h1–h6 / ul / ol / li / dl / table 家族 /
 * blockquote / hr / pre / figure）与行内（strong / em / small / mark / s / del / ins /
 * label / abbr / time / kbd / var / samp / q / cite / dfn / bdo / ruby / rt / rp）。
 * 不收 `<script>` `<style>` `<iframe>` `<video>` 这类——微信编辑器不支持内嵌脚本和外链媒体，
 * 它们仍然会被当成非法标签报出来。
 */
const NATIVE_HTML_TAGS = [
  // 结构性
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  'blockquote',
  'hr',
  'pre',
  'figure',
  'figcaption',
  'details',
  'summary',
  'address',
  // 行内
  'abbr',
  'cite',
  'q',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'big',
  'label',
  'time',
  'kbd',
  'var',
  'samp',
  'dfn',
  'bdo',
  'ruby',
  'rt',
  'rp',
  'wbr',
  'font',
]

/** 行内标签：出现在正文里是合法的（加粗、颜色、换行等），不参与「规范外标签」判定 */
const INLINE_TAGS = [
  'b',
  'i',
  'u',
  'em',
  'strong',
  'span',
  'br',
  'sup',
  'sub',
  'code',
  'a',
  'g',
  'center',
  'p',
  'div',
  'section',
  'x',
  ...NATIVE_HTML_TAGS,
]

/**
 * 「模型爱用的组件名」→ 我们的真实标签。
 *
 * 用来在驳回时给出具体建议：只说「标签不存在」它不知道该换成什么，
 * 重试两次还是原样拼一个新词（实测）。这些小写词根覆盖了实测见过的拼接标签。
 */
const TAG_SYNONYMS: Record<string, string> = {
  step: 'steps',
  stage: 'steps',
  process: 'case-flow',
  case: 'case-flow',
  timeline: 'timeline',
  history: 'timeline',
  milestone: 'timeline',
  compare: 'compare',
  versus: 'compare',
  quote: 'statement',
  statement: 'statement',
  callout: 'breaking',
  highlight: 'breaking',
  notice: 'breaking',
  banner: 'breaking',
  alert: 'breaking',
  card: 'title',
  title: 'title',
  header: 'title',
  hero: 'title',
  headline: 'title',
  lead: 'lead',
  intro: 'lead',
  cta: 'cta',
  action: 'cta',
  button: 'cta',
  engage: 'engage',
  thanks: 'engage',
  interact: 'engage',
  badge: 'badges',
  tag: 'badges',
  label: 'badges',
  chip: 'badges',
  keyword: 'badges',
  chart: 'chart',
  graph: 'chart',
  plot: 'chart',
  data: 'chart',
  slider: 'slider',
  carousel: 'slider',
  gallery: 'slider',
  image: 'img',
  img: 'img',
  photo: 'img',
  picture: 'img',
  figure: 'img',
  mermaid: 'mermaid',
  flow: 'mermaid',
  diagram: 'mermaid',
  table: 'table',
  grid: 'table',
  row: 'row',
  column: 'column',
  col: 'column',
  container: 'container',
  box: 'container',
  wrapper: 'container',
  text: 'text',
  html: 'html',
  stack: 'stack',
  positioned: 'positioned',
  'p-title': 'p-title',
  section: 'p-title',
  subtitle: 'p-title',
  heading: 'p-title',
  sectiontitle: 'p-title',
  sectionheading: 'p-title',
  pagetitle: 'p-title',
  chapter: 'p-title',
  part: 'p-title',
}

/**
 * 天生自闭合、必须保持自闭合的标签。
 *
 * 除了 `<img>`，其余组件都是成对的；写成自闭合会被解析器整块丢掉（见 `expandSelfClosingTags`）。
 */
const SELF_CLOSING_OK_TAGS = ['img']

/** 中文标签名里出现这些词时，猜它其实想用哪个组件 */
const CHINESE_TAG_HINTS: Array<{ words: string[]; tag: string }> = [
  { words: ['小节', '标题', '章节', '段落'], tag: 'p-title' },
  { words: ['步骤', '流程', '步'], tag: 'steps' },
  { words: ['对比', '比较'], tag: 'compare' },
  { words: ['时间线', '发展', '历程'], tag: 'timeline' },
  { words: ['图表', '柱状', '折线', '数据'], tag: 'chart' },
  { words: ['导语', '引言', '开头'], tag: 'lead' },
  { words: ['徽章', '标签', '关键词'], tag: 'badges' },
  { words: ['号召', '行动'], tag: 'cta' },
  { words: ['互动', '结尾', '感谢'], tag: 'engage' },
  { words: ['金句', '引用'], tag: 'statement' },
  { words: ['案例'], tag: 'case-flow' },
  { words: ['卡片', '封面'], tag: 'title' },
]

/**
 * 扫出中文标签名（`<并列小节标题>` 这种）。
 *
 * 实测模型偶尔整段用中文标签拼结构：`findUnknownTags` 的正则只认 ASCII 小写开头，
 * 这些标签一个都扫不到，最后落到「一个组件都没用」——那条提示会让模型把内容改得更像
 * 普通 Markdown，方向完全错。所以必须单独拎出来，并给出对应的真实标签。
 */
export function findChineseTags(md: string): Array<{ tag: string; suggestion?: string }> {
  const withoutCode = md
    .replace(/^[\t ]*(```|~~~)[\s\S]*?^[\t ]*\1[\t ]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
  const found: Array<{ tag: string; suggestion?: string }> = []
  const seen = new Set<string>()
  const re = /<\/?([\u4e00-\u9fa5][^<>/\s]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(withoutCode)) !== null) {
    const tag = m[1]
    if (seen.has(tag)) continue
    seen.add(tag)
    const hit = CHINESE_TAG_HINTS.find((h) => h.words.some((w) => tag.includes(w)))
    found.push({ tag, suggestion: hit?.tag })
  }
  return found
}

/**
 * 全部合法标签：组件注册表里的 tag + 行内标签 + 组件内部的子标签。
 *
 * `left` / `right` 必须算合法——它们是 `<compare>` 的子块，不在 `components` 注册表里。
 * 漏掉的话合法写法会被判成「用了不存在的标签」，白驳回一次。
 */
export function legalTags(): Set<string> {
  const set = new Set<string>(INLINE_TAGS)
  for (const c of components) set.add(c.tag)
  for (const tag of Object.keys(INNER_TAG_ATTRS)) set.add(tag)
  return set
}

/**
 * 找出规范外的标签名，并猜一个最接近的合法标签。
 *
 * 实测：模型会造出 `<title-card>`、`<chart-card>`、`<step-list>` 这种「组件名 + 用途」的拼接标签——
 * 它见过的卡片组件叫 TitleCard，于是照着拼了一个。这类废稿**必须带着正确的标签名驳回**，
 * 只说「一个组件都没用」它不知道该改哪里，重试两次还是原样。
 *
 * 猜测规则：未知标签如果以某个合法标签开头（`title-card` → `title`），就建议它。
 */
export function findUnknownTags(md: string): Array<{ tag: string; suggestion?: string }> {
  const legal = legalTags()
  // `<html>` 块里允许写任意原生 HTML 标签（`<h3>` / `<ul>` / `<table>`…），
  // `<svg>` 块里允许写任意 SVG 标签（`<rect>` / `<circle>` / `<path>`…），都不算自造组件
  const withoutCode = splitVerbatimBlocks(md)
    .masked.replace(/^[\t ]*(```|~~~)[\s\S]*?^[\t ]*\1[\t ]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')

  const found: Array<{ tag: string; suggestion?: string }> = []
  const seen = new Set<string>()
  const re = /<\/?([a-z][\w-]*)(?=[\s/>])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(withoutCode)) !== null) {
    const tag = m[1]
    if (legal.has(tag) || seen.has(tag)) continue
    seen.add(tag)
    // 先按「组件标签名 + 连字符」猜：title-card → title。
    // 两个坑都要避开：
    // ① 不能写成 tag.startsWith(t)——短标签（i / a / p / u）会把 image-card 猜成 i；
    // ② 只能拿**组件**标签当候选，不能拿行内标签——`section` 是合法的行内标签，
    //    放进来后 `section-title` 会被猜成 `section`（实测，模型照这个建议改只会更离谱）。
    let suggestion = [...components.map((c) => c.tag)]
      .filter((t) => t.length >= 3 && tag.startsWith(`${t}-`))
      .sort((a, b) => b.length - a.length)[0]
    // 再按词根猜：step-list 猜不出 steps（steps 不是它的前缀），要查同义词表。
    // 取**最长的**匹配词根——`image-card` 同时命中 image 和 card，应该算图片不是标题卡。
    if (!suggestion) {
      const hit = Object.keys(TAG_SYNONYMS)
        .filter((root) => tag.includes(root))
        .sort((a, b) => b.length - a.length)[0]
      if (hit) suggestion = TAG_SYNONYMS[hit]
    }
    found.push({ tag, suggestion })
  }
  return found
}

/**
 * 需求 → 必须出现的组件。需求里点名了这些词，输出里就必须有对应标签。
 *
 * 为什么要在代码里卡这一条：提示词里那句「章节分节标题 → `<p-title>`」实测压不住。
 * 用户说「做三个小节标题」，模型会选 `<steps>`（「三件事并列」的语义把它带走了）或
 * `<title>`（「标题」这个词把它带走了），两种都渲染成完全不同的版式，而且语法全合法、
 * 质检挑不出错。只有在「需求提到 X 却没出现 X 的标签」时才能发现选型错了。
 *
 * 词表只放**用户真会说的说法**，且只在需求明确点了名时才触发，避免误伤。
 */
const INTENT_EXPECTATIONS: Array<{
  words: string[]
  tag: string
  label: string
  /** 命中这条就跳过不报：需求提到「标签」但本来就是在做卡片内的 `chips` */
  unless?: RegExp
  /** 连「手写 `<html>`」也不放行——标签组是唯一一条，见下面 `strict` 的用法 */
  strict?: boolean
  /** 驳回时附带的正确写法，比只说「应该用 X」更容易一次改对 */
  hint?: string
  /** 需求里出现这些词说明标签只是配角（做卡片顺带几个关键词），不按这条约束 */
  avoid?: string[]
}> = [
  {
    words: ['小节标题', '章节标题', '段落标题', '分节标题', '编号标题', '小标题'],
    tag: 'p-title',
    label: '分节标题',
  },
  { words: ['步骤', '分步', '流程'], tag: 'steps', label: '步骤流' },
  { words: ['对比', '比较'], tag: 'compare', label: '前后对比' },
  { words: ['时间线', '发展历程', '里程碑'], tag: 'timeline', label: '时间线' },
  { words: ['图表', '柱状图', '折线图'], tag: 'chart', label: '图表' },
  { words: ['案例'], tag: 'case-flow', label: '案例列表' },
  {
    // 「标签」这个词必须收：实测用户说「做一排关键词标签，要渐变底」时，
    // 模型从没主动想到 `<badges>`，一律用 `<html>` 手画一堆圆角 `<span>`。
    // 那时术语表里只有「标签组 / 徽章」，而用户根本不说这两个词——词表漏了就等于没这条规则。
    // 「关键词」也要收（用户常说「做一排关键词，渐变底」），但光收词会误伤——
    // 「封面标题卡，关键词是 A、B」「三步流程，每步配个关键词」里标签只是配角，
    // 靠下面的 `avoid` 把这类需求排除掉。
    words: ['标签', '徽章', '徽标', '关键词'],
    tag: 'badges',
    label: '标签组',
    // 需求里同时点名了别的成品卡片，说明标签只是顺带提的一句
    avoid: [
      '卡片',
      '卡',
      '标题',
      '导语',
      '引言',
      '流程',
      '步骤',
      '对比',
      '时间线',
      '图表',
      '案例',
      '按钮',
    ],
    // `<title>` / `<breaking>` 卡片自己的 `chips` 也是标签，那是正解，不算选错
    unless: /<(?:title|breaking)\b[^>]*\bchips\s*=/i,
    strict: true,
    hint:
      '`<badges color="#ffffff" bg="#ff6b6b|#6c5ce7">增长|复利|长期主义</badges>`——' +
      '标签用 `|` 分隔写一行，`bg` 里放两个以上颜色就是横向渐变，' +
      '不要用 `<html>` 手画一排带 `border-radius` 的 `<span>`',
  },
  { words: ['导语', '引言'], tag: 'lead', label: '导语' },
  { words: ['行动号召', '行动按钮'], tag: 'cta', label: '行动号召' },
]

/**
 * 结构型布局组件：用它们拼版属于「像写 HTML 一样自由搭」，不受选型规则约束。
 *
 * 需求（用户 2026-11-18）：允许用 `container` / `row` / `column` / `text` / `stack` /
 * `positioned` / `html` 像写 HTML 一样构建素材，不再强制套成品卡片组件。
 * 所以只要输出里出现这些布局组件之一，就说明模型是**有意识地**手工排版，
 * `checkMaterialIntent()` 不再拿「必须出现 `<steps>`」去驳回它。
 */
const HAND_BUILT_TAGS = ['row', 'column', 'text', 'stack', 'positioned', 'html', 'svg']

/**
 * 选型质检：需求点名了某类素材，输出里却没有对应组件。
 *
 * 只管「点名了但没用」，不管「用了额外的」——用户要三个小节标题顺带配一句导语是合理的。
 * 用布局组件手工搭出同类版式的，不算违规（见 `HAND_BUILT_TAGS`）。
 */
export function checkMaterialIntent(requirement: string, text: string): string | null {
  const body = text.replace(/\{\{RMIMG_\d+\}\}/g, '')
  // 手工排版：不强制套成品组件
  const handBuilt = HAND_BUILT_TAGS.some((tag) => new RegExp(`<${tag}\\b`, 'i').test(body))
  for (const rule of INTENT_EXPECTATIONS) {
    if (!rule.words.some((w) => requirement.includes(w))) continue
    if (rule.unless && rule.unless.test(body)) continue
    if (rule.avoid?.some((w) => requirement.includes(w))) continue
    // 手工排版放行，但 `strict` 的规则除外：`<badges>` 的渐变底 / 彩色底
    // 是组件原生能力（`bg` 写多个颜色即是横向渐变），用 `<html>` 手画一排 `<span>`
    // 得到的是一模一样的画面，却把「以后改文案要改三个地方」留给了用户。
    // 实测这类需求模型 100% 走 `<html>`，不在这里拦住它永远不会选 `<badges>`。
    if (handBuilt && !rule.strict) continue
    if (new RegExp(`<${rule.tag}\\b`, 'i').test(body)) continue
    const used = [...body.matchAll(/<([a-z][\w-]*)[\s/>]/gi)]
      .map((m) => m[1])
      .filter((t) => components.some((c) => c.tag === t))
    const usedText =
      used.length > 0
        ? `（你用的是 ${[...new Set(used)].map((t) => `\`<${t}>\``).join('、')}）`
        : ''
    const hint = rule.hint ? `。正确写法：${rule.hint}` : ''
    return `需求要的是${rule.label}，应该用 \`<${rule.tag}>\`，但输出里没有${usedText}${hint}`
  }
  return null
}

/**
 * 需求里要了「渐变 / 彩色」，输出却把颜色丢了。
 *
 * 实测（用户 2026-11-18）：用户说「三个词，每个都要渐变背景」，模型终于改用
 * `<badges>增长|复利|长期主义</badges>` 之后，**属性一个都没写**——画面从渐变变成了灰底小标签，
 * 等于把用户最在意的那件事丢了。语法完全合法、选型也对，只有「说了颜色却没有颜色属性」能发现。
 *
 * 只查 `<badges>` / `<title>` / `<breaking>` 这三个带配色属性的容器：
 * 颜色诉求挂在这些组件上时，正解是 `bg` / `color` / `chips`，不是另起 `<html>`。
 */
const COLOR_WORDS = ['渐变', '彩色', '配色', '颜色', '底色', '色底']

export function checkColorIntent(requirement: string, text: string): string | null {
  if (!COLOR_WORDS.some((w) => requirement.includes(w))) return null
  const body = text.replace(/\{\{RMIMG_\d+\}\}/g, '')
  // `<html>` 手写版式里颜色是直接写 `style` 的，不在这条规则的射程内
  if (/<html\b/i.test(body) || /<svg\b/i.test(body)) return null

  const badges = /<badges\b([^>]*)>/i.exec(body)
  if (badges && !/\b(?:bg|color)\s*=/i.test(badges[1])) {
    return (
      '需求里要了颜色 / 渐变，但 `<badges>` 没写配色属性，渲染出来是默认的灰底标签。' +
      '正确写法：`<badges color="#ffffff" bg="#ff6b6b|#6c5ce7">增长|复利|长期主义</badges>`' +
      '——`bg` 放两个以上颜色用 `|` 分隔就是横向渐变，`color` 配浅色文字'
    )
  }
  return null
}

/**
 * 一次投递前的质检：这一版能不能直接给用户。
 *
 * 返回 null 表示合格；返回字符串表示不合格的原因（会喂回重试请求）。
 *
 * 判据来自实测踩过的坑，每一类都真实上过屏：
 * - JSX / React 写法（`<Steps current={0}>`）；
 * - 一个组件都没用（`##` 标题 + 列表，或干脆是 YAML 伪代码 `CompareCard: layout: split`）；
 * - 用了组件但属性名不存在（`<steps description="…">`，静默失效）。
 */
export function checkMaterialOutput(text: string): string | null {
  const body = text.replace(/\{\{RMIMG_\d+\}\}/g, '').trim()
  if (!body) return '输出是空的'

  if (looksLikeJsx(body)) {
    return '写成了 JSX / React 外形：大写标签、花括号属性或自闭合子步骤'
  }

  // 规范外的标签名要第一个报：它是最具体、最容易修的错误，
  // 落到下面「一个组件都没用」那条会变成误导（模型不知道该改标签名，重试也白搭）。
  const unknown = findUnknownTags(body)
  if (unknown.length > 0) {
    const list = unknown
      .map((x) => `<${x.tag}>${x.suggestion ? `（应该是 \`<${x.suggestion}>\`）` : ''}`)
      .join('、')
    return `用了不存在的标签：${list}`
  }

  // `<html>` 块里原生 HTML 都放行，唯独脚本/样式/外链媒体不行（微信编辑器不支持）
  const forbidden = findForbiddenHtmlTags(body)
  if (forbidden.length > 0) {
    return `\`<html>\` 块里不能用这些标签：${forbidden.map((x) => `\`<${x}>\``).join('、')}（微信编辑器不支持，会被过滤或整段失效）`
  }

  // `<html>` 块内是原样透传，组件不会被解析——塞进去就是一段字面源码（用户口径：只允许 img / svg）。
  const inHtml = findComponentsInHtml(body)
  if (inHtml.length > 0) {
    return `\`<html>\` 块里混进了 R-Markdown 组件：${inHtml.map((x) => `\`<${x}>\``).join('、')}——\`<html>\` 里的内容按原生 HTML 直接输出，组件不会渲染，读者看到的是源码本身。块内只能用原生 HTML 标签、\`<img>\` 和 \`<svg>\`；要放组件请把它们移到 \`<html>\` 外面`
  }

  // 微信不认 class 也不加载任何样式表，`<div class="card">` 粘过去就是裸 div。
  // 这条必须报出来：模型很爱写 class，光在提示词里说「用行内样式」压不住（用户实测）。
  const classed = findClassStyledTags(body)
  if (classed.length > 0) {
    return `\`<html>\` 块里用了 \`class\`：${classed.map((x) => `\`<${x}>\``).join('、')}——微信编辑器会丢掉 class，样式必须写成行内 \`style="…"\``
  }

  // `<details>` / `<summary>` 是模型最容易想到的「点开看」写法，但微信会把它们拆成平铺的
  // 文字和内容——折叠关系没了，`<summary>` 的三角也没了，读者看到的是「标题 + 正文全部摊开」。
  // 这属于「用户明确要交互、结果交互不存在」，必须驳回让它改用 SVG + SMIL，只在面板提示没用。
  if (/<details\b/i.test(body) || /<summary\b/i.test(body)) {
    return '`<details>` / `<summary>` 在公众号里会被拆开、内容全部平铺，「点开看」的效果做不出来。要做点击揭晓这类交互只能用 `<svg>` + SMIL：`<animate>` / `<set>` 配 `begin="click"` 或 `begin="触发区id.click"`'
  }

  // 微信服务器保存时会直接删掉的 CSS / 属性（position、filter、CSS 变量、外链图…）。
  // 这类写法在编辑器里看着完全正常，粘进公众号才散版，所以必须驳回重写。
  const wechat = findWechatHtmlIssues(body).filter((x) => x.blocking)
  if (wechat.length > 0) {
    return `\`<html>\` 块里有微信不支持的写法：${wechat.map((x) => x.text).join('；')}`
  }

  // 中文标签名（`<并列小节标题>`）：ASCII 正则一个都扫不到，不单独报就会掉进
  // 下面「一个组件都没用」——模型会以为是自己 Markdown 不够像，越改越远。
  const chinese = findChineseTags(body)
  if (chinese.length > 0) {
    const list = chinese
      .map((x) => `<${x.tag}>${x.suggestion ? `（应该是 \`<${x.suggestion}>\`）` : ''}`)
      .join('、')
    return `标签名不能写中文：${list}`
  }

  // 有组件标签才算「用了组件」；行内标签（b/i/strong/span）不算数
  const blockTags = new Set(
    components
      .map((c) => c.tag)
      .filter(
        (t) =>
          ![
            'b',
            'i',
            'u',
            'em',
            'strong',
            'span',
            'br',
            'sup',
            'sub',
            'code',
            'a',
            'g',
            'center',
            'p',
            'div',
            'section',
          ].includes(t),
      ),
  )
  const used = [...body.matchAll(/<([a-z][\w-]*)[\s/>]/g)].map((m) => m[1])
  // `container` 是外面统一包的那一层（见 `wrapInContainer`），不算「用了组件」：
  // 否则把一段纯 Markdown 包进容器后，这条检查就再也不会命中。
  // `svg` 是手写矢量图素材（和 `<html>` 一样自带版式），用户点名要 SVG 时它就是这次的成品。
  if (!used.some((t) => (blockTags.has(t) || t === 'svg') && t !== 'container')) {
    return '一个组件都没用：通篇是普通 Markdown、YAML 或伪代码'
  }

  // `<title num="01">` 是先于「属性不存在」要报的：它其实是组件选错（该用 <p-title>），
  // 只报「<title> 的 num 不存在」模型会去删属性，把 num 删了照样不是分节标题。
  if (new RegExp(`<title\\b[^>]*\\s(?:${NUMBER_ATTRS.join('|')})\\s*=`, 'i').test(body)) {
    return '带序号的标题要用 `<p-title>`；`<title>` 是文章开头的封面大标题卡，没有序号属性'
  }

  const illegal = findIllegalAttrs(body)
  if (illegal.length > 0) {
    return `用了不存在的属性：${illegal.map((x) => `<${x.tag}> 的 ${x.attr}`).join('、')}`
  }

  const shape = findShapeProblems(body)
  if (shape.length > 0) return shape[0]

  return null
}

/**
 * 构造 user message：需求 + 可选补充要求。
 *
 * 用户点名了组件就把「用哪个 + 怎么写」直接推进这一轮（`renderNamedComponents`）——
 * 写进 user message 而不是 system prompt，是因为它是**这一轮**的约束：
 * 上一轮可能点名了 `<steps>`，这一轮改口要 `<compare>`，只有按轮次投递才跟得上。
 */
export function buildMaterialUserMessage(requirement: string, extra = ''): string {
  const named = renderNamedComponents(requirement)
  const lead = named
    ? '请生成下面这段素材。**用户已经点名了组件，就按点名的那几个写**：'
    : '请生成下面这段素材（按技能里的「第一步：先判断用哪个组件」选型：' +
      '能对上映射表里的专有组件就用它；对不上的版式**默认优先**用布局组件' +
      '（`<container>` `<row>` `<column>` `<text>`）自己搭，或者整段写成 `<html>` 包裹的原生 HTML，' +
      '不要硬塞进不相干的成品卡片）：'
  const parts = [lead, '', '<需求>', requirement.trim(), '</需求>']
  if (named) {
    parts.push('', '<点名组件与写法>', named, '</点名组件与写法>')
  }
  const trimmedExtra = extra.trim()
  if (trimmedExtra) {
    parts.push('', '<额外要求>', trimmedExtra, '</额外要求>')
  }
  return parts.join('\n')
}

/**
 * 重试用的 user message：把上一版的错误原样贴回去，让它照着改。
 *
 * 比在 system prompt 里多写十行「不要 JSX」有效得多——模型看到自己刚写的
 * `<Steps current={0}>` 被指出来，下一版基本就改成 `<steps>` 了。
 */
/**
 * 后续轮次（接着聊）的 user message。
 *
 * 第一轮用 `buildMaterialUserMessage()`，从第二轮起走这里：用户在上一版素材的基础上
 * 提改动（「第二张卡片换成蓝色」「标题短一点」「别用 steps 了」），所以措辞是「改这一版」
 * 而不是「新做一段」。历史里已经带着上一版源码，这里只需说清要改什么，
 * 但必须强调**输出完整源码**——只给 diff 用户没法直接插入。
 */
export function buildMaterialFollowUpMessage(instruction: string): string {
  const named = renderNamedComponents(instruction)
  const parts = [
    named
      ? '在上一条素材的基础上改（这是同一段素材的下一版，不是另做一段）。**这一轮点名了组件，改用点名的**：'
      : '在上一条素材的基础上改（这是同一段素材的下一版，不是另做一段）：',
    '',
    '<改动要求>',
    instruction.trim(),
    '</改动要求>',
  ]
  if (named) {
    parts.push('', '<点名组件与写法>', named, '</点名组件与写法>')
  }
  parts.push('', '输出改好之后的**完整素材源码**，不要只写改动的部分、不要解释改了什么。')
  return parts.join('\n')
}

/**
 * 这一轮模型输出是不是「问一句」而不是「出素材」。
 *
 * 对话模式下要允许模型追问（需求太模糊时问一句比瞎猜有用），但提示词里写死了
 * 「只输出源码」，所以它只在真的没法下手时才会问。判据刻意窄——**没有一个组件标签
 * 且明显是疑问句**才算，避免把一段正常素材误判成追问（那样就永远出不来稿了）。
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // 有组件标签就一定是出稿，不管语气
  if (/<[a-z][a-z-]*[\s/>]/i.test(t)) return false
  // 追问都很短；长文本更可能是说明文字，不该被当成追问吞掉
  if (t.length > 400) return false
  return (
    /[？?]\s*$/.test(t) || /(请问|能不能|能否|是否|需要我|要我|想先|先告诉我|可以告诉我)/.test(t)
  )
}

export function buildMaterialRetryMessage(badOutput: string, reason = ''): string {
  const excerpt = badOutput.length > 1200 ? `${badOutput.slice(0, 1200)}\n……（后略）` : badOutput
  const trimmedReason = reason.trim()
  return [
    '<上一版输出（不合格）>',
    excerpt,
    '</上一版输出（不合格）>',
    '',
    ...(trimmedReason
      ? [
          `**这次必须先改掉这一处：${trimmedReason}**`,
          '照上一版那样照抄标签名/属性名，还会再被驳回一次。',
          '',
        ]
      : []),
    '上面这一版被驳回了，常见问题在于：',
    '- 造了不存在的标签名（`<title-card>`、`<chart-card>`、`<step-list>`）。技能「组件写法手册」里没有的标签，一个都不能用——',
    '  想要「一张带标题和副标题的卡片」就用 `<title>`，不要按语义拼一个新标签出来；',
    '  真要自己写原生 HTML，**必须整段包在 `<html>` 里**，包外的原生标签会被当成自造组件；',
    '- **在 `<html>` 里用 `class` 挂样式**：微信编辑器会丢掉 class，写 `class="card"` 等于没写样式。',
    '  样式一律写成元素上的行内 `style="…"`；',
    '- **把 R-Markdown 组件塞进了 `<html>` 里**（`<steps>` `<title>` `<badges>` 这些）：`<html>` 内部',
    '  按原生 HTML 原样输出，组件根本不会渲染，读者看到的是 `<steps title="三步">` 这行源码。',
    '  块内只能用原生 HTML 标签、`<img>` 和 `<svg>`；要放组件就移到 `<html>` 外面；',
    '- **在 `<html>` 里用 `<div>`**：改成 `<section>`。微信编辑器自己产出的就是 section，',
    '  div 保存时更容易被合并层级；',
    '- **在 `<html>` 里用微信用不了的 CSS**：`position`（连带 top/left 全失效）、`filter`、',
    '  CSS 变量 `--x` 与 `var()`、`!important`、`font-family`、`text-align:start|end`、`id`、`on*`',
    '  ——这些微信服务器保存时直接删掉，在编辑器里看着正常，粘进公众号就散版。',
    '  摆位只能用 `display:flex` + `gap` / `margin` / `padding` / `transform`；图片不要写 `url()`；',
    '- 用了 JSX / React 写法：大写标签（`<Steps>`、`<Step>`、`<Alert>`）、花括号属性（`current={0}`）、`<Step ... />` 自闭合；',
    '- 或者拆出了不存在的子标签（`<step>`），而技能里 `<steps>` 的子内容应该写成每行 `- 名称 | 说明`；',
    '- 或者属性名/取值不在技能范围内（例如给 `<steps>` 写 `direction`，正确是 `type="DA02"`）；',
    '- 或者根本不是 Markdown，写成 YAML / JSON / 伪代码（`CompareCard:` `layout: split` 这种）；',
    '- 或者子内容形状不对：`<compare>` 没写 `<left>` `<right>`、`<steps>` 缺 `|` 分隔、`<badges>` 逐行写；',
    '- **或者要了颜色却没写配色属性**：用户说「渐变底 / 彩色标签」时，正解是给 `<badges>` 写',
    '  `bg="#ff6b6b|#6c5ce7"`（多个颜色用 `|` 分隔即横向渐变）+ `color="#ffffff"`，',
    '  不是另起 `<html>` 手画一排带 `border-radius` 的 `<span>`；',
    '- 或者把数据写进了标签内部：`<chart>` / `<slider>` / `<engage>` 的标签内正文**会被整段丢弃**，',
    '  数据只能写在属性上（`<chart type="bar" labels="2020,2021" values="6.4,7.2" title="…"></chart>`）；',
    '- 或者开头先写了一段「需求 → 组件：……」的选型说明；',
    '- **或者点名之外多给了东西**：点名 `<mermaid>` 就只要那一张图，别额外配一段 `<steps>` ',
    '  把同样的流程用文字再讲一遍，也别在外面套 `<container>`——单个组件自己就有完整版式；',
    '- **或者无视了用户点名的组件**：需求里写明了 `<steps>` / `/steps` / 「用 badges 组件」这类点名，',
    '  就必须用那一个标签，不能换成性质相近的别的组件，也不能绕成手写 `<html>` 画个差不多的版式；',
    '  点名组件的完整属性清单与逐字示例在需求的「点名组件与写法」里，照那份写；',
    '- 或者退回了普通 Markdown（`##` 标题 + `-` 列表），一个组件都没用。',
    '',
    '请严格照技能里「✅ 正例」的形状重写一版：标签全小写、属性全用双引号、',
    '子内容按技能指定的分隔形状写，只输出源码，第一行就是标签或正文。',
  ].join('\n')
}
