/**
 * 平台判断与快捷键文案的唯一权威定义。
 *
 * 背景：界面上原来把快捷键硬编码成「Ctrl/Cmd+F」这种写法，对用户是噪音 ——
 * Windows 用户看到 Cmd 会困惑，macOS 用户看到 Ctrl 也会困惑。
 * 同一个快捷键在不同平台上应该显示成对应的名字，且只在一处判断，避免各写各的。
 *
 * 注意：这里判断的是「怎么显示」，不是「怎么响应按键」。
 * 快捷键注册一律继续用 CodeMirror 的 `Mod-` 前缀（它自己会按平台解析），
 * 不要在 keymap 里用这里的函数去分支，否则又会漂移。
 */

/** 是否 macOS / iOS 系（这类平台用 ⌘ 而不是 Ctrl） */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  // userAgentData 是新的标准位，但只有 Chromium 系有；拿不到就退回老字段
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = uaData?.platform || navigator.platform || navigator.userAgent || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** 主修饰键的显示名：macOS 是 ⌘，其余平台是 Ctrl */
export function modKeyLabel(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

/** 备用修饰键的显示名：macOS 是 ⌥，其余平台是 Alt */
export function altKeyLabel(): string {
  return isMac() ? '⌥' : 'Alt'
}

/** Control 键的显示名：macOS 是 ⌃，其余平台是 Ctrl */
export function ctrlKeyLabel(): string {
  return isMac() ? '⌃' : 'Ctrl'
}

/**
 * 「需包含…之一」这类提示里列出的修饰键。
 *
 * Windows 上 Ctrl 就是主修饰键，所以不重复列出；macOS 的 ⌘ / ⌃ / ⌥ 三个都可单独用。
 */
export function modifierKeyList(): string {
  return isMac() ? '⌘ / ⌃ / ⌥' : 'Ctrl / Alt'
}

/** Shift 键的显示名：macOS 是 ⇧，其余平台是 Shift */
export function shiftKeyLabel(): string {
  return isMac() ? '⇧' : 'Shift'
}

/**
 * 快捷键里可用的键位标记。
 * `mod`/`alt`/`shift` 会按平台替换成对应名字，其他字符串原样显示。
 */
export type KeyToken = 'mod' | 'alt' | 'shift' | (string & {})

/**
 * 按当前平台习惯拼出快捷键文案。
 *
 * macOS 惯例不写分隔符（⌘⌥F、⇧Enter），Windows/Linux 惯例用 `+`（Ctrl+Alt+F）。
 *
 * @example macOS   — shortcut('mod', 'F')           // '⌘F'
 * @example Windows — shortcut('mod', 'F')           // 'Ctrl+F'
 * @example macOS   — shortcut('mod', 'alt', 'F')    // '⌘⌥F'
 * @example Windows — shortcut('mod', 'alt', 'F')    // 'Ctrl+Alt+F'
 * @example macOS   — shortcut('shift', 'Enter')     // '⇧Enter'
 * @example Windows — shortcut('shift', 'Enter')     // 'Shift+Enter'
 */
export function shortcut(...keys: KeyToken[]): string {
  const mapped = keys.map((k) =>
    k === 'mod' ? modKeyLabel() : k === 'alt' ? altKeyLabel() : k === 'shift' ? shiftKeyLabel() : k,
  )
  return isMac() ? mapped.join('') : mapped.join('+')
}

/** 查找（打开查找面板）的快捷键文案 */
export function findShortcutLabel(): string {
  return shortcut('mod', 'F')
}

/** 展开替换行的快捷键文案 */
export function replaceShortcutLabel(): string {
  return shortcut('mod', 'alt', 'F')
}
