/**
 * 导出前把 CSS 变量落成字面量颜色。
 *
 * 为什么必须做这一步：
 *
 * 2026-06 的 `882f9a1 feat: 多个功能改进` 为了让**编辑器自己的深色预览**好看，把正文与标题的
 * 硬编码颜色全换成了 `var(--text-primary)` 这类 CSS 变量（普通段落原来是 `rgb(51,65,85)`）。
 * 但公众号里没有编辑器的样式表，`var()` 取不到值只会掉到兜底值 `#0d0d0d`——那几乎是纯黑，
 * 微信深色模式下背景是深色，于是正文变成黑底黑字，看不见了。
 *
 * 2026-11 的 `a69e8ae` 只是把「纯黑」补成「近黑」，没解决根本问题：只要颜色还是 `var()`，
 * 微信那套深色模式算法就处理不了它。
 *
 * 所以要换回 `882f9a1` 之前那些「微信深色模式能正常反色」的值——那时候的文章是正常的。
 * 但**不能**直接在 `markdownParser.ts` 里改回硬编码：编辑器预览的深色模式要靠这些变量，
 * 写死颜色会让深色预览变成一堆黑字。所以只在导出那一刻做替换，编辑器内部照旧。
 */

/** `882f9a1` 之前各标题级别的原始色值（当时每一级都不同，后来被压成同一个变量） */
const TEXT_PRIMARY_BY_TAG: Record<string, string> = {
  h1: 'rgb(17,24,39)',
  h2: 'rgb(17,24,39)',
  h3: 'rgb(31,41,55)',
  h4: 'rgb(55,65,81)',
  h5: 'rgb(55,65,81)',
  h6: 'rgb(55,65,81)',
}

/** 正文（`<p>` / 公式外层 `<section>` / 行内公式 `<span>` 等）的原始色值 */
const TEXT_PRIMARY_BODY = 'rgb(51,65,85)'

/**
 * 其余变量还原成 `882f9a1` 之前的字面量。
 *
 * 刻意**不**照抄 `style.css` 亮色主题的值：那里 `--text-primary` 是 `rgba(0,0,0,0.95)`、
 * `--hl-code-bg` 是 `rgba(0,0,0,0.04)`，带 alpha 的近黑底色在微信深色模式下处理不好，
 * 用当时那套实色更稳。
 */
const FIXED_VALUES: Record<string, string> = {
  '--text-secondary': 'rgb(100,116,139)',
  '--text-muted': '#a39e98',
  '--border-color': '#e5e7eb',
  '--bg-primary': '#ffffff',
  '--bg-secondary': '#f6f5f4',
  '--hl-code-bg': '#f3f4f6',
  '--hl-str': '#e83e8c',
}

/**
 * 不能直接用的兜底参数：这些值不是「`882f9a1` 之前那版原始色」，而是**照抄了亮色主题变量**，
 * 在深色背景下同样不可读，见到就当「没有兜底」，改查上面的还原表。
 *
 * - `#0d0d0d` / `#615d59` / `rgba(0,0,0,0.04)` / `#dd5b00` —— `markdownParser.ts` 与
 *   `inlineFormat.ts` 里那 10 处用的就是主题值（`a69e8ae` 补的），其中 `#0d0d0d` 近黑。
 * - 组件（`src/extension/*.ts`）的兜底走的是另一套：`#e5e7eb` / `#111827` / `#6b7280`、
 *   `#ffffff`，那些确实是 `498e729` 之前的原始硬编码色，可以直接用。
 */
const THEME_FALLBACKS = new Set(['#0d0d0d', '#615d59', '#dd5b00', 'rgba(0,0,0,0.04)'])

/** 比对前把空白去掉，避免 `rgba(0, 0, 0, 0.04)` 与 `rgba(0,0,0,0.04)` 被当成两个值 */
function isThemeFallback(value: string): boolean {
  return THEME_FALLBACKS.has(value.replace(/\s+/g, ''))
}

/** 兜底参数里可能带一层括号（`rgba(0,0,0,0.04)`），所以要显式吃掉一组 */
const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/gi

const TAG_RE = /<([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi

/**
 * 决定一个 `var(--x, 兜底)` 该换成什么。
 *
 * 顺序：`--text-primary` 按标签查表 → 组件自己的兜底参数 → 通用还原表 → 原样保留。
 *
 * 兜底参数排在还原表**前面**，是因为组件里的兜底是上一轮 `a69e8ae` 逐处挑的「`498e729`
 * 之前的原始硬编码色」（`Chart_DA01` 的图例 `#6b7280`、`ReadingPath` 的正文 `#111827`），
 * 比一张全局表准；只有 `markdownParser.ts` / `inlineFormat.ts` 里那几个照抄主题变量的坏值
 * 要走表（见 `THEME_FALLBACKS`）。
 */
function resolveVar(name: string, tag: string, fallback: string | undefined): string | null {
  const fb = fallback?.trim()
  const usable = fb && !isThemeFallback(fb) ? fb : undefined

  if (name === '--text-primary') {
    // 标题和正文原本是不同色，兜底却统一成了 `#0d0d0d`，只有查表才能还原
    if (!usable) return TEXT_PRIMARY_BY_TAG[tag] ?? TEXT_PRIMARY_BODY
  }
  if (usable) return usable

  const fixed = FIXED_VALUES[name]
  if (fixed) return fixed
  // 既没登记、也没可用兜底：原样留着，让问题在导出结果里暴露出来，而不是悄悄变黑
  return null
}

/**
 * 把 HTML 里所有 `var(--x, 兜底)` 换成字面量颜色。
 *
 * 只替换标签**属性**里的 var()（内联样式全在属性里），不会动到正文文字。
 */
export function resolveExportColors(html: string): string {
  if (!html.includes('var(--')) return html

  return html.replace(TAG_RE, (whole, tagName: string) => {
    if (!whole.includes('var(--')) return whole
    const tag = tagName.toLowerCase()
    return whole.replace(VAR_RE, (match, name: string, fallback?: string) => {
      const value = resolveVar(name, tag, fallback)
      return value === null ? match : value
    })
  })
}
