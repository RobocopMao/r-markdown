/**
 * 命令面板（⌘K / Ctrl+K）的纯逻辑层：标题检索与快捷键解析。
 *
 * 这里不依赖 Vue、DOM 与任何 service，方便单独测试；
 * 组件只负责渲染与键盘导航，数据获取由调用方（EditorPage）注入。
 */

/** 命令面板可检索的结果类别 */
export type PaletteKind = 'draft' | 'cloud' | 'local' | 'material'

/** 一条检索结果。id 用于回传给调用方执行动作 */
export interface PaletteItem {
  kind: PaletteKind
  id: string
  /** 展示用标题 */
  title: string
  /** 右上角次要信息，如所属文件夹/分类 */
  meta?: string
  /** 最后编辑时间（ISO 或时间戳），用于排序与展示 */
  updatedAt?: string | number
}

/** 类别的中文名与动作按钮文案 */
export const KIND_META: Record<PaletteKind, { label: string; action: string }> = {
  draft: { label: '草稿', action: '编辑' },
  cloud: { label: '云文章', action: '编辑' },
  local: { label: '本地文章', action: '编辑' },
  material: { label: '素材', action: '插入' },
}

/** 分组展示顺序 */
export const KIND_ORDER: PaletteKind[] = ['draft', 'cloud', 'local', 'material']

/**
 * 分类筛选按钮的定义。
 * `kinds: []` 表示「全部」，不限定类别。
 */
export const KIND_FILTERS: { key: string; label: string; kinds: PaletteKind[] }[] = [
  { key: 'all', label: '全部', kinds: [] },
  ...KIND_ORDER.map((kind) => ({
    key: kind as string,
    label: KIND_META[kind].label,
    kinds: [kind],
  })),
]

/** 命令面板默认快捷键（与 config/defaults.ts 保持一致） */
export const DEFAULT_PALETTE_SHORTCUT = 'Mod+K'

/** 按标题做大小写不敏感的子串匹配。
 * 空查询返回全部（面板刚打开时应能看到内容，而不是空白）。
 */
export function filterByTitle(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((it) => it.title.toLowerCase().includes(q))
}

/**
 * 排序：命中的排前面已由 filter 处理，这里按类别顺序再按更新时间倒序，
 * 保证同类内最近编辑的在最上面。
 */
export function sortItems(items: PaletteItem[]): PaletteItem[] {
  return [...items].sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind)
    const kb = KIND_ORDER.indexOf(b.kind)
    if (ka !== kb) return ka - kb
    return toTime(b.updatedAt) - toTime(a.updatedAt)
  })
}

function toTime(v: string | number | undefined): number {
  if (v === undefined) return 0
  if (typeof v === 'number') return v
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

/** 检索入口：过滤 + 排序。kinds 为空表示不限定类别 */
export function searchPalette(
  items: PaletteItem[],
  query: string,
  kinds: PaletteKind[] = [],
): PaletteItem[] {
  return sortItems(filterByTitle(filterByKinds(items, kinds), query))
}

/** 按类别筛选；kinds 为空数组时返回全部（表示「全部」这一类） */
export function filterByKinds(items: PaletteItem[], kinds: PaletteKind[]): PaletteItem[] {
  if (!kinds.length) return items
  const set = new Set(kinds)
  return items.filter((it) => set.has(it.kind))
}

// ── 最近搜索历史 ──

/** 历史记录上限，超出后丢弃最旧的 */
export const PALETTE_HISTORY_LIMIT = 6

/**
 * 把一次搜索词推入历史：去重（忽略大小写）、置顶、截断。
 * 返回新数组，不修改入参。
 */
export function pushHistory(list: string[], query: string): string[] {
  const q = query.trim()
  if (!q) return list
  const lower = q.toLowerCase()
  const rest = list.filter((h) => h.toLowerCase() !== lower)
  return [q, ...rest].slice(0, PALETTE_HISTORY_LIMIT)
}

/** 按类别分组，保持 KIND_ORDER 的顺序，空组不返回 */
export function groupByKind(items: PaletteItem[]): { kind: PaletteKind; items: PaletteItem[] }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((it) => it.kind === kind),
  })).filter((g) => g.items.length > 0)
}

// ── 快捷键：解析 / 匹配 / 录制 / 显示 ──

/** 规范化后的快捷键描述 */
export interface ShortcutSpec {
  mod: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** 主键，统一小写；字母键存 'k' 这种单字符 */
  key: string
}

/**
 * 解析 'Mod+K' / 'Ctrl+K' / 'Cmd+Shift+P' 这类字符串。
 *
 * 关键词说明：Mod / Cmd / Meta → 平台主修饰键；Ctrl、Alt、Shift 照常。
 * 解析失败（无主键）返回 null。
 */
export function parseShortcut(input: string): ShortcutSpec | null {
  const parts = input
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return null

  const spec: ShortcutSpec = { mod: false, ctrl: false, alt: false, shift: false, key: '' }
  for (const raw of parts) {
    const p = raw.toLowerCase()
    if (p === 'mod' || p === 'cmd' || p === 'meta' || p === 'command') spec.mod = true
    else if (p === 'ctrl' || p === 'control') spec.ctrl = true
    else if (p === 'alt' || p === 'option') spec.alt = true
    else if (p === 'shift') spec.shift = true
    else spec.key = p
  }
  if (!spec.key) return null
  // 早期版本在 macOS 上用 e.key 录 Option 组合键，会把 `˚`、`π` 这类
  // 组合字符存进配置，导致显示成乱码且无法触发。含非 ASCII 视为无效，
  // 让调用方回退到默认快捷键。
  if (!/^[\x20-\x7e]+$/.test(spec.key)) return null
  return spec
}

/**
 * 序列化回字符串，用于持久化。
 *
 * 主键存小写原名（`k` / `escape` / `f1`），展示时再由 shortcutDisplay 美化；
 * 早期版本存的是大写，parseShortcut 会统一转小写，故两者都能读。
 */
export function formatShortcutSpec(spec: ShortcutSpec): string {
  const parts: string[] = []
  if (spec.mod) parts.push('Mod')
  if (spec.ctrl) parts.push('Ctrl')
  if (spec.alt) parts.push('Alt')
  if (spec.shift) parts.push('Shift')
  parts.push(spec.key)
  return parts.join('+')
}

/**
 * 从键盘事件取出主键标记，供录制与匹配共用。
 *
 * 为什么不能直接用 `e.key`：macOS 上按住 Option 会改变 `e.key` ——
 * `Option+K` 得到的是组合字符 `˚`、`Option+P` 是 `π`，于是快捷键会被
 * 录成那个字符，既显示成乱码（⌘⌥°），也难以再次触发。
 * `e.code` 是物理键位（`KeyK` / `Digit1` / `F1`…），不受修饰键组合影响。
 *
 * 但仍优先采信单个 ASCII 字母/数字的 `e.key`：在非 US 布局（如 AZERTY）下
 * 那才是用户看到的键，用 `e.code` 会录成相邻键位。
 */
export function keyTokenFromEvent(e: KeyboardEvent): string {
  const k = e?.key ?? ''
  // 普通字母/数字：直接用，保证非 US 布局下录到的是用户眼中那个键
  if (/^[a-zA-Z0-9]$/.test(k)) return k.toLowerCase()

  // 其余情况（Option 组合字符、符号键、功能键）改用物理键位
  const code = e?.code ?? ''
  if (code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase() // KeyK → k
    if (/^Digit[0-9]$/.test(code)) return code.slice(5) // Digit1 → 1
    return code.toLowerCase() // Escape → escape、F1 → f1、Numpad1 → numpad1
  }
  return k.toLowerCase()
}

/** 常见非单字符主键的展示名，避免显示成 ESCAPE / ARROWUP */
const KEY_DISPLAY: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  comma: ',',
  period: '.',
  slash: '/',
  semicolon: ';',
  quote: "'",
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
  minus: '-',
  equal: '=',
  backquote: '`',
}

/** 主键的展示文案：单字符转大写（k → K），具名键查表 */
function keyDisplay(key: string): string {
  return KEY_DISPLAY[key] ?? key.toUpperCase()
}

/**
 * 判断键盘事件是否匹配该快捷键。
 *
 * 关键点：`mod` 在 macOS 上指 Cmd(metaKey)、其余平台指 Ctrl，
 * 与 CodeMirror 的 `Mod-` 语义保持一致，避免出现两套平台判断。
 */
export function matchShortcut(
  spec: ShortcutSpec,
  e: KeyboardEvent,
  isMacPlatform: boolean,
): boolean {
  // Windows 上 mod 就是 Ctrl，两者视为同一个键
  const wantCtrl = spec.ctrl || (!isMacPlatform && spec.mod)
  const wantMeta = isMacPlatform && spec.mod

  if (e.ctrlKey !== wantCtrl) return false
  if (e.metaKey !== wantMeta) return false
  if (e.altKey !== spec.alt) return false
  if (e.shiftKey !== spec.shift) return false
  return keyTokenFromEvent(e) === spec.key
}

/** 把键盘事件转成快捷键描述，供设置页录制使用；无主键或缺少修饰键时返回 null */
export function specFromEvent(e: KeyboardEvent, isMacPlatform: boolean): ShortcutSpec | null {
  const key = e.key
  // 单独按下修饰键不算一个完整快捷键
  if (['Control', 'Meta', 'Alt', 'Shift', 'CapsLock', 'Dead'].includes(key)) return null

  const spec: ShortcutSpec = {
    mod: isMacPlatform ? e.metaKey : e.ctrlKey,
    // 非 macOS 上 Ctrl 即 mod，不再重复记录，避免显示成 Ctrl+Ctrl
    ctrl: isMacPlatform ? e.ctrlKey : false,
    alt: e.altKey,
    shift: e.shiftKey,
    key: keyTokenFromEvent(e),
  }
  // 至少一个修饰键，否则会跟正常打字冲突
  if (!spec.mod && !spec.ctrl && !spec.alt) return null
  return spec
}

/**
 * 生成展示文案，格式与 src/utils/platform.ts 保持一致：
 * macOS 连写（⌘K），Windows 带加号（Ctrl+K）。
 *
 * 各修饰键的名字都由调用方从 platform.ts 传入，这里不硬编码任何平台符号。
 */
export function shortcutDisplay(
  spec: ShortcutSpec,
  isMacPlatform: boolean,
  modLabel: string,
  ctrlLabel: string,
  altLabel: string,
  shiftLabel: string,
): string {
  const key = keyDisplay(spec.key)
  if (isMacPlatform) {
    const parts = [
      spec.mod ? modLabel : '',
      spec.ctrl ? ctrlLabel : '',
      spec.alt ? altLabel : '',
      spec.shift ? shiftLabel : '',
      key,
    ]
    return parts.join('')
  }
  const parts: string[] = []
  if (spec.mod) parts.push(modLabel)
  if (spec.ctrl && !spec.mod) parts.push(ctrlLabel)
  if (spec.alt) parts.push(altLabel)
  if (spec.shift) parts.push(shiftLabel)
  parts.push(key)
  return parts.join('+')
}
