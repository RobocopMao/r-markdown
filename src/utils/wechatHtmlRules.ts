/**
 * 微信公众号编辑器会「静默删掉」的 HTML / CSS 清单。
 *
 * AI 素材放开写原生 HTML 之后，模型最爱写的那套写法（绝对定位、CSS 变量、外链图、
 * `!important`）恰好都是公众号服务器保存时直接抹掉的——编辑器里看着好好的，粘进
 * 公众号就散了版，而且**不报错**，用户只会觉得「AI 生成的东西不能用」。
 *
 * 所以把这些规则从提示词里的口头叮嘱，变成可以在质检里跑的判断。
 *
 * 依据两份公开规范（2026-11 核对）：
 * - 微信官方《微信公众平台编辑器插件开发规范》 https://developers.weixin.qq.com/doc/subscription/guide/product/plugin_spec.html
 *   （CSS 属性一节：opacity / caret-color / line-height / width / height / text-align / begin / pre）
 * - 归零数媒 ZER0N Studio《WeChat Article Code 白名单 2026 Q4》 https://zer0n.cn/whitelist
 *   （756 个 CSS 属性里服务器只删 `position` 与 `filter`；`--` 变量、`id`、`on*`、`class` 全删）
 *
 * 分级是有意的：`blocking` 的会真的把版式搞散，质检直接驳回重写；其余只是「不推荐」，
 * 只在面板上提示一句，不逼模型重来——否则为了一条 `font-family` 白烧两次重试。
 */

export interface WechatHtmlIssue {
  /** 给用户 / 模型看的说明，写清「会怎样」和「该怎么改」 */
  text: string
  /** true = 微信会直接删掉或破坏版式，必须拦住；false = 只是不推荐 */
  blocking: boolean
}

/** 公众号 `url()` 只认的图床域名（外链图会连元素一起被删） */
const IMAGE_HOSTS = ['mmbiz.qpic.cn', 'mmecoa.qpic.cn', 'wx.qlogo.cn', 'res.wx.qq.com']

/** `style="…"` 声明：单双引号都要认，模型两种都写 */
const STYLE_ATTR_RE = /<([a-z][\w-]*)\b[^>]*?\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

/** 开标签（用来扫属性） */
const TAG_RE = /<([a-z][\w-]*)\b([^>]*)>/gi

/** 被公众号「拆除、只留内容」的标签：留在里面不会报错，但功能没了 */
const WEAKENED_TAGS: Array<{ tag: string; why: string }> = [
  { tag: 'button', why: '按钮会被拆掉只剩文字，可点击的样式也一起没——要按钮就用 `<cta>` 组件' },
  { tag: 'details', why: '折叠会被拆开、内容全部平铺显示，做不出「点开看」的效果' },
  { tag: 'marquee', why: '滚动标签会被拆掉；要滚动用 R-Markdown 的 `<slider>` 组件' },
  { tag: 'math', why: '数学公式标签会被拆掉；公式请用文字或 SVG 表达' },
]

/**
 * 扫一个 `<html>` 块里所有微信不支持或会降级的写法。
 *
 * 只扫 `<html>` 块：块外是我们自己的组件，样式由扩展生成，不归这里管。
 */
export function scanHtmlBlock(block: string): WechatHtmlIssue[] {
  const issues: WechatHtmlIssue[] = []
  const seen = new Set<string>()
  const push = (text: string, blocking: boolean) => {
    if (seen.has(text)) return
    seen.add(text)
    issues.push({ text, blocking })
  }

  for (const m of block.matchAll(STYLE_ATTR_RE)) {
    const tag = `<${(m[1] ?? '').toLowerCase()}>`
    const style = m[2] ?? m[3] ?? ''
    for (const decl of splitDeclarations(style)) {
      const at = decl.indexOf(':')
      if (at < 0) continue
      const prop = decl.slice(0, at).trim().toLowerCase()
      const value = decl.slice(at + 1).trim()
      scanDeclaration(tag, prop, value, push)
    }
  }

  // `id` 只在**被别处引用**时才致命，所以不能见 `id` 就拦：
  // - `url(#grad)` / `clip-path:url(#c)` 这种引用：`id` 被删后引用指不到，渐变和裁剪整块失效
  //   ——这是真正要拦的，下面单独查 `url(#…)`；
  // - SMIL 触发锚点（`<g id="reveal">` + `begin="reveal.click"`）：**`id` 恰恰是交互本体**，
  //   公众号里唯一能做的点击交互就靠它。见 `id` 就报，等于把交互素材全废掉；
  // - 剩下那些没被引用的 `id`（模型爱随手给每个 `<g>` 起名）：微信删了也没有任何影响。
  // 折中：被 `url(#x)` 引用的 id 交给下面那条 blocking 检查；其余 `id` 只留一句软提示。
  const urlRefIds = new Set<string>()
  for (const m of block.matchAll(/url\(\s*#([\w:.-]+)\s*\)/gi)) urlRefIds.add(m[1] ?? '')

  for (const m of block.matchAll(TAG_RE)) {
    const tag = (m[1] ?? '').toLowerCase()
    const attrs = m[2] ?? ''
    const idMatch = /\bid\s*=\s*["']([^"']*)["']/i.exec(attrs)
    if (idMatch && !urlRefIds.has(idMatch[1] ?? '')) {
      push(
        '`id` 属性会被微信删掉：被 `url(#x)` 引用的（渐变、裁剪）会失效，其余 `id` 删了没影响——别拿它做定位或样式锚点',
        false,
      )
    }
    if (/\son[a-z]+\s*=/i.test(attrs)) {
      push('`on*` 事件属性会被删掉（公众号正文不允许脚本），要交互只能用 SVG 的 `animate`', true)
    }
    // div 在公众号里更容易被合并层级，section 是编辑器自己产出的形状
    if (tag === 'div') {
      push(
        '`<div>` 请改成 `<section>`：微信编辑器自己产出的就是 section，div 更容易被合并或丢层级',
        true,
      )
    }
    const weakened = WEAKENED_TAGS.find((x) => x.tag === tag)
    if (weakened) push(`\`<${tag}>\` ${weakened.why}`, false)
  }

  // `url(#x)` 引用（渐变填充、clip-path、mask）：`id` 会被删，引用一律指不到
  if (/url\(\s*#[\w:.-]+\s*\)/i.test(block)) {
    push(
      'SVG 里用 `url(#x)` 引用渐变 / 裁剪会被微信删掉 `id`，引用指不到、效果失效——渐变改写成纯色填充，裁剪改用固定尺寸',
      true,
    )
  }

  // 官方 1.8：`<pre>` 默认 white-space: pre，普通正文放进去手机上会被横向截断
  for (const m of block.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)) {
    const inner = m[1] ?? ''
    if (!/<code\b/i.test(inner) && /[\u4e00-\u9fa5]{10,}/.test(inner)) {
      push(
        '普通正文不要包在 `<pre>` 里：它不自动换行，手机上会被横向截断；代码以外的内容用 `<section>`',
        true,
      )
      break
    }
  }

  // 官方 1.4.2：表格列宽写死 px，窄屏会溢出到屏幕外
  if (/<t[hd]\b[^>]*style\s*=\s*["'][^"']*width\s*:\s*\d{2,}px/i.test(block)) {
    push('表格单元格别写死 px 宽度：手机上会撑出屏幕，改成百分比或干脆不写宽度', false)
  }

  return issues
}

/** 把 `style="a:b;c:d"` 拆成声明（跳过 `url(data:...)` 里可能出现的分号） */
function splitDeclarations(style: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of style) {
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0) {
      out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function scanDeclaration(
  tag: string,
  prop: string,
  value: string,
  push: (text: string, blocking: boolean) => void,
) {
  const lower = value.toLowerCase()

  // 服务器直接删的两个属性（756 个属性里只有这两个）
  if (prop === 'position') {
    push(
      '`position` 会被微信服务器删掉，`top` / `left` / `right` / `bottom` / `inset` 跟着一起失效——叠放请用 `display:flex` 加 `margin` 摆位置',
      true,
    )
    return
  }
  if (prop === 'filter') {
    push('`filter` 会被删（要滤镜效果写 `-webkit-filter`，这个能留下）', true)
    return
  }
  if (prop.startsWith('--')) {
    push(
      `CSS 变量（\`${prop}\`）整条会被删，` + '`var()` 也就取不到值——值直接写死在每个标签上',
      true,
    )
    return
  }

  if (prop === 'font-family') {
    push(
      '不要设 `font-family`：公众号有统一字体栈，自定义字体在 iOS 上字号和字距会明显不一致',
      false,
    )
  }
  if (prop === 'text-align' && /^(start|end)$/.test(lower)) {
    push(
      '`text-align: start/end` 各端兼容不一致（有的居中有的靠左），写 `left` / `right` / `center`',
      true,
    )
  }
  if (prop === 'opacity' && lower === '0' && tag === '<img>') {
    push('`opacity: 0` 的图片发布后无法在公众号后台再编辑，不要用它叠背景图', false)
  }
  if (lower.includes('!important')) {
    push('不要用 `!important`：会让平台公共样式失效，深色模式算法也覆盖不了', false)
  }

  // `calc()` 的写法坑：乘号、带空格的加减号都会让整条声明被删
  if (lower.includes('calc(')) {
    const inner = lower.slice(lower.indexOf('calc('))
    if (/[*×]/.test(inner) || /\s[+-]\s/.test(inner)) {
      push(
        '`calc()` 里出现乘号或带空格的加减号，整条声明会被删——写成 `calc(100%-10px)`，或直接把数值算好',
        true,
      )
    }
  }

  // `url()` 只认公众号图床；外链 / data: 会把整个元素删掉
  for (const u of value.matchAll(/url\(\s*['"]?([^'")]+)/gi)) {
    const raw = (u[1] ?? '').trim()
    if (!raw || raw.startsWith('#')) continue
    if (raw.toLowerCase().startsWith('data:')) {
      push('`url()` 不能用 `data:` 内联图，整个元素会被删——图片请交给用户自己在编辑器里上传', true)
      continue
    }
    const host = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase()
    if (!IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      push(
        `\`url()\` 只认公众号图床（${IMAGE_HOSTS.join(' / ')}），\`${host}\` 这种外链会让整个元素被删`,
        true,
      )
    }
  }
}

/**
 * `<div>` 一律改成 `<section>`。
 *
 * 微信编辑器自己产出的结构就是 `<section>`，`<div>` 在保存时更容易被合并层级、
 * 和其它样式混在一起。两者在公众号里行为一致，所以这步是**无损改名**，不用问模型。
 */
export function convertDivToSection(text: string, notes: string[]): string {
  if (!/<(\/?)div\b/i.test(text)) return text
  const note =
    '`<div>` 全部换成了 `<section>`：微信编辑器自己产出的就是 section，div 更容易被合并或丢层级'
  if (!notes.includes(note)) notes.push(note)
  return text.replace(/<(\/?)div\b/gi, '<$1section')
}

/** 这批规则里「绝对不能出现」的那些，写进提示词时按这个顺序列 */
export const WECHAT_BANNED_SUMMARY =
  '`position` / `filter` / CSS 变量（`--x`）/ `!important` / `font-family` / `text-align:start|end` / `id` / `on*`'
