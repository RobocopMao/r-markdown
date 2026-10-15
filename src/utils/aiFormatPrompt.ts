/**
 * AI 排版的 prompt 组装与模型输出清洗（纯逻辑，无网络、无 Vue 依赖）。
 *
 * 排版规范来自 src/data/ai/r-markdown-formatter/format-spec.md（与 r-markdown-formatter skill 同源），
 * 由 loadFormatSpec() 剥掉顶部来源注释后整篇作为 system prompt 的规范部分。
 */

import { components } from '@/extension'

export type AiStylePreset = 'minimal' | 'standard' | 'rich'

export const AI_STYLE_PRESETS: { value: AiStylePreset; label: string; hint: string }[] = [
  {
    value: 'minimal',
    label: '轻量',
    hint: '只搭骨架：标题卡片 + 章节分节，少量行内强调，正文尽量保持原样',
  },
  {
    value: 'standard',
    label: '标准',
    hint: '完整三层优先级：骨架 → 按语义填充组件 → 行内润色（推荐）',
  },
  {
    value: 'rich',
    label: '丰富',
    hint: '更积极使用步骤流、时间线、对比、行动号召等结构化组件',
  },
]

/** 图片来源注释块剥离（规范文件顶部说明不进入 prompt） */
export function stripSpecComment(spec: string): string {
  return spec.replace(/^\s*<!--[\s\S]*?-->\s*/, '')
}

/** 动态导入规范原文并剥离来源注释。单独成 chunk，不撑大主包。 */
export async function loadFormatSpec(): Promise<string> {
  const mod = await import('@/data/ai/r-markdown-formatter/format-spec.md?raw')
  return stripSpecComment(mod.default as string)
}

/** markdownParser 实际支持解析的扩展标签 + 通行内联标签 */
const LEGAL_TAGS = new Set<string>([
  // 扩展组件（与 src/utils/markdownParser.ts 的分支一致）
  'title',
  'reading-path',
  'p-title',
  'lead',
  'statement',
  'breaking',
  'cta',
  'engage',
  'steps',
  'case-flow',
  'timeline',
  'compare',
  'slider',
  'img',
  'badges',
  'table',
  'chart',
  'mermaid',
  'row',
  'column',
  'container',
  'text',
  'html',
  'stack',
  'positioned',
  'svg',
  // compare 内部的左右栏
  'left',
  'right',
  // 通行内联标签
  'sup',
  'sub',
  'u',
  'br',
  'b',
  'i',
  'strong',
  'em',
  'code',
  'span',
  'p',
  'div',
  'section',
  'a',
  'g',
  'center',
  'x',
])

/** 力度档位说明 */
function presetInstruction(preset: AiStylePreset): string {
  switch (preset) {
    case 'minimal':
      return [
        '## 本次排版力度：轻量',
        '只搭建最基本的骨架，正文尽量保持原样：',
        '- 仅使用 `<title>` 作文章标题、`<p-title level="1">` 划分章节，必要时用 `<p-title level="2">` 划分子节',
        '- 行内修饰全篇不超过 3 处',
        '- 不要使用 steps / timeline / compare / case-flow / cta / engage 等结构化组件',
        '- 除标题与分节外，段落文字保持原样，不要拆分或合并段落',
      ].join('\n')
    case 'rich':
      return [
        '## 本次排版力度：丰富',
        '在完整三层优先级的基础上，更积极地使用结构化组件：',
        '- 骨架：`<title>` → `<reading-path>` → `<p-title>` 分节',
        '- 只要内容具备「可枚举的步骤 / 有时间顺序 / 前后对比 / 并列清单」特征，就改用对应组件呈现',
        '- 优先考虑 `<steps>`、`<timeline>`、`<compare>`、`<case-flow>`、`<badges>`',
        '- 结尾酌情补 `<cta>` 或 `<engage>`',
        '- 行内修饰可以适度增加，但同一段落仍不超过 2-3 处',
      ].join('\n')
    default:
      return [
        '## 本次排版力度：标准',
        '严格按下面的三层优先级处理：',
        '1. 先搭骨架：`<title>` → `<reading-path>` → 用 `<p-title>` 划分章节',
        '2. 再填内容：按语义逐段选组件；结构化内容优先用专用组件，纯叙述保持普通段落或 `<lead>`',
        '3. 最后润色：对关键词施加行内修饰，结尾酌情添加 `<engage>`',
        '- 不为了用组件而用组件；同一段落行内修饰不超过 2-3 处',
      ].join('\n')
  }
}

/** 由组件注册表生成可用标签速查（随组件库变化自动保持同步） */
function componentCheatsheet(): string {
  const seen = new Set<string>()
  const rows: string[] = []
  for (const c of components) {
    if (!c.tag || seen.has(c.tag)) continue
    seen.add(c.tag)
    rows.push(`- \`<${c.tag}>\` — ${c.name}`)
  }
  return rows.join('\n')
}

/**
 * 构造 system prompt。
 *
 * 段落顺序固定：规范全文 → 标签速查 → 保真铁律 → 输出格式 → 力度档位。
 * 把大段稳定内容放前面，便于供应商侧前缀缓存命中。
 */
export function buildSystemPrompt(spec: string, preset: AiStylePreset = 'standard'): string {
  return [
    '你是一位资深的微信公众号排版师，精通 R-Markdown 扩展语法。',
    '你的唯一任务：把用户提供的文章正文，转换成符合下面《R-Markdown 组件参数参考》的排版稿。',
    '',
    '# R-Markdown 组件参数参考（唯一排版标准）',
    '',
    spec.trim(),
    '',
    '# 可用组件标签速查',
    '',
    componentCheatsheet(),
    '',
    '# 保真铁律（最高优先级，任何情况下不得违反）',
    '',
    '1. **只调整呈现形式**：可以插入组件标签、拆分或归并段落、调整标题层级，但不得改写正文措辞与语义。',
    '2. **不得增删内容**：不新增原文没有的事实、数据、结论、图片或链接；不删除原文的任何信息点。',
    '3. **不得编造**：绝不编造图片 URL、数据、日期、人名。原文没有的内容一律不写。',
    '4. **不得使用规范外的标签**：只能使用上面列出的标签，禁止自造组件或使用未列出的标签。',
    '5. **保留原有链接与图片**：原文中已有的链接、图片、公式、代码块必须原样保留在语义合理的位置。',
    '6. **图片占位符必须原样保留**：正文中形如 `{{RMIMG_1}}`、`{{RMIMG_2}}` 的占位符代表一张本地图片，',
    '   必须原样照抄、单独占一行、保持在原本的位置附近；不要改写、不要删除、不要移动、不要用 `![](…)` 包裹它们。',
    '',
    '# 输出格式要求（严格遵守）',
    '',
    '- 只输出排版后的 Markdown 正文本身：不要任何解释、寒暄、前言或后记。',
    '- 不要把整篇输出包在 ``` 代码围栏里；只有原文本身是代码块时才使用围栏。',
    '- 直接以 `<title>…</title>` 开始，不要写「好的，以下是排版结果」之类的话。',
    '- 组件之间、段落之间最多保留 1 个空行，禁止连续 2 个及以上空行。',
    '- 组件标签的属性只使用规范中列出的属性名与取值。',
    '',
    presetInstruction(preset),
  ].join('\n')
}

/** 构造 user message：正文 + 可选补充指令 */
export function buildUserMessage(article: string, extra = ''): string {
  const parts = ['请排版下面这篇文章：', '', '<article>', article.trim(), '</article>']
  const trimmedExtra = extra.trim()
  if (trimmedExtra) {
    parts.push('', '<额外要求>', trimmedExtra, '</额外要求>')
  }
  return parts.join('\n')
}

/**
 * 一条常用补充要求。
 * enabled 表示勾选状态；勾选状态与条目一起持久化，下次打开面板自动沿用。
 */
export interface ExtraPreset {
  id: string
  text: string
  enabled: boolean
}

/** 生成条目 id（时间戳 + 随机后缀，足够本地唯一） */
export function newPresetId(): string {
  return `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 把「手填的补充要求 + 勾选的常用项」合并成最终随请求发出的文本。
 * 手填那一行排在最前（保持临时补充优先的直觉），勾选项按清单顺序依次追加，每行一条。
 */
export function composeExtraInstruction(manual: string, presets: ExtraPreset[]): string {
  const lines: string[] = []
  const manualText = manual.trim()
  if (manualText) lines.push(manualText)
  for (const p of presets) {
    if (!p.enabled) continue
    const t = p.text.trim()
    if (t) lines.push(t)
  }
  return lines.join('\n')
}

/**
 * 归一化从磁盘 / localStorage 读到的预设清单。
 * 只保留结构合法的条目（防手改配置或旧数据导致渲染报错），并去重、丢弃空文本。
 */
export function normalizePresets(raw: unknown): ExtraPreset[] {
  if (!Array.isArray(raw)) return []
  const out: ExtraPreset[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text.trim() : ''
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : newPresetId(),
      text,
      enabled: o.enabled === true,
    })
  }
  return out
}

/** 图片引用：`<img src="…" …>` 标签，src 为本地形式 */
const IMG_TAG_RE =
  /<img\b[^>]*\bsrc\s*=\s*"(?:data:image\/[^"]*|idb:[^"]*|images\/[^"]*)"[^>]*\/?>/gi
/** 裸露的本地图片引用（无 img 标签包裹时兜底）。收紧字符集，避免吞掉后续属性 */
const BARE_LOCAL_REF_RE = /data:image\/[\w+]+;base64,[A-Za-z0-9+/=]+|idb:DBI_\d+_[a-z0-9]{6}/g

export function maskImageTokens(md: string): { text: string; tokens: string[] } {
  const tokens: string[] = []
  /** 先定编号再入栈，保证 {{RMIMG_n}} 的 n 与 tokens[n-1] 严格对应 */
  const mask = (raw: string) => {
    const idx = tokens.length + 1
    tokens.push(raw)
    return `{{RMIMG_${idx}}}`
  }

  let text = md.replace(IMG_TAG_RE, (tag) => mask(tag))
  text = text.replace(BARE_LOCAL_REF_RE, (ref) => mask(ref))

  return { text, tokens }
}

/**
 * 还原占位符，并清除模型臆造的多余占位符。
 *
 * 返回实际还原数与未被模型保留的占位符序号（供提示「有 N 张图片未能保留」）。
 * 模型有时会凭空写出正文里不存在的 `{{RMIMG_n}}`；这类孤立占位符必须删除，
 * 否则会把 `{{RMIMG_1}}` 这样的字面量留在文章里。
 */
export function unmaskImageTokens(
  text: string,
  tokens: string[],
): { text: string; restored: number; missing: number[]; dropped: number } {
  let out = text
  let restored = 0
  const missing: number[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = `{{RMIMG_${i + 1}}}`
    if (!out.includes(token)) {
      missing.push(i + 1)
      continue
    }
    out = out.split(token).join(tokens[i])
    restored++
  }

  // 清掉剩余的所有占位符（越界编号、模型臆造的编号）
  const leftovers = out.match(/\{\{RMIMG_\d+\}\}/g) || []
  if (leftovers.length > 0) {
    out = out.replace(/^[ \t]*\{\{RMIMG_\d+\}\}[ \t]*$/gm, '')
    out = out.replace(/\{\{RMIMG_\d+\}\}/g, '')
    out = out.replace(/\n{3,}/g, '\n\n')
  }

  return { text: out, restored, missing, dropped: leftovers.length }
}

/**
 * 清洗模型输出：剥掉整篇 ``` 围栏、首尾空白、结尾的客套话。
 */
export function cleanModelOutput(raw: string): string {
  let text = raw.trim()

  // 整篇被代码围栏包裹（``` 或 ```markdown）
  const fence = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/)
  if (fence) text = fence[1].trim()

  // 去掉结尾「如需…可以…」「希望…帮助」这类补充说明段落
  const tailPatterns = [
    /\n{2,}(?:如果|如需|若需|需要的话|希望|以上|如有)[^\n]{0,120}(?:可以|请|告诉我|调整|修改)[^\n]{0,120}[。！]?$/,
  ]
  for (const re of tailPatterns) {
    const next = text.replace(re, '')
    if (next !== text) {
      text = next.trim()
      break
    }
  }

  // 压缩 2 个以上连续空行为 1 个
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/** 供错误提示使用的标签合法性校验：只警告，不阻断 */
export function validateFormat(md: string): { unknownTags: string[]; warnings: string[] } {
  // 代码块与行内代码里的标签不算
  const withoutCode = md
    .replace(/^[\t ]*(```|~~~)[\s\S]*?^[\t ]*\1[\t ]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')

  const found = new Set<string>()
  const re = /<\/?([a-zA-Z][\w-]*)(?=[\s/>])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(withoutCode)) !== null) {
    found.add(m[1].toLowerCase())
  }

  const unknownTags = [...found].filter((t) => !LEGAL_TAGS.has(t)).sort()

  const warnings: string[] = []
  if (unknownTags.length > 0) {
    warnings.push(`出现规范外的标签：${unknownTags.map((t) => `<${t}>`).join('、')}`)
  }

  // 未闭合的组件标签粗略检查（仅统计常见块级组件）
  for (const tag of ['title', 'p-title', 'steps', 'timeline', 'compare', 'cta', 'engage']) {
    const open = (withoutCode.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length
    const close = (withoutCode.match(new RegExp(`</${tag}>`, 'gi')) || []).length
    const selfClosed = (withoutCode.match(new RegExp(`<${tag}\\b[^>]*/>`, 'gi')) || []).length
    if (open - selfClosed !== close) {
      warnings.push(`<${tag}> 标签数量不匹配（开 ${open - selfClosed} / 闭 ${close}）`)
    }
  }

  return { unknownTags, warnings }
}

/** 粗略估算 token 数：中文按 1 字 ≈ 1 token，其余按 4 字符 ≈ 1 token */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  const rest = text.length - cjk
  return Math.ceil(cjk + rest / 4)
}

/** 长文提示阈值（字符数） */
export const LONG_ARTICLE_CHARS = 12000
