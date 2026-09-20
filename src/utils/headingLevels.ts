/**
 * 标题层级（Markdown `#` 与 `<p-title level="N">`）的唯一权威定义。
 *
 * 此前该上限与默认值散落在多处独立硬编码，且已经真实漂移过一次：
 * `outline.ts` 默认 2、`PTitle_DA01/DA02` 默认 1、大纲夹取上限 3 而组件支持 4，
 * 导致「未写 level 的 p-title」在正文里是一级、在大纲里却是二级。
 *
 * 新增或调整标题层级时只改这个文件；其余位置一律从此导入。
 */

/** 最外层标题层级（对应 `#`） */
export const HEADING_LEVEL_MIN = 1

/**
 * 最深层标题层级（对应 `####`）。
 * 提高此值后需同步：`HEADING_STYLE` 增补条目、`OutlinePanel.vue` 的 `.outline-lvN` 样式。
 */
export const HEADING_LEVEL_MAX = 4

/** 未显式声明 level 时的默认层级 */
export const DEFAULT_HEADING_LEVEL = 1

/** 合法标题层级（1–4） */
export type HeadingLevel = 1 | 2 | 3 | 4

/**
 * Markdown `#` 标题渲染成 `<hN>` 时的内联样式（每个层级一份）。
 * 与解析器里 `#{1,HEADING_LEVEL_MAX}` 的匹配范围配合使用。
 */
export const HEADING_STYLE: Record<number, { margin: string; fontSize: string }> = {
  1: { margin: '0px 0px 16px', fontSize: '24px' },
  2: { margin: '28px 0px 12px', fontSize: '20px' },
  3: { margin: '24px 0px 10px', fontSize: '17px' },
  4: { margin: '20px 0px 8px', fontSize: '15px' },
}

/** `<p-title>` 的 level 属性可选项（字符串形式，供组件属性面板使用） */
export const HEADING_LEVEL_OPTIONS: string[] = Array.from(
  { length: HEADING_LEVEL_MAX - HEADING_LEVEL_MIN + 1 },
  (_, i) => String(HEADING_LEVEL_MIN + i),
)

/**
 * 把任意数值夹取到合法层级区间。
 * 非有限值（`parseInt` 失败得到的 NaN）回落默认层级。
 */
export function clampHeadingLevel(value: number): HeadingLevel {
  if (!Number.isFinite(value)) return DEFAULT_HEADING_LEVEL as HeadingLevel
  return Math.min(Math.max(Math.trunc(value), HEADING_LEVEL_MIN), HEADING_LEVEL_MAX) as HeadingLevel
}

/**
 * 解析 `<p-title>` 的 level 属性：缺失、空串或非法值一律回落默认层级。
 */
export function parseHeadingLevel(raw: string | undefined | null): HeadingLevel {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return DEFAULT_HEADING_LEVEL as HeadingLevel
  }
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? clampHeadingLevel(n) : (DEFAULT_HEADING_LEVEL as HeadingLevel)
}
