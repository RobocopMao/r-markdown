/**
 * 行级文本差异（纯逻辑，无依赖）。
 *
 * 供 AI 排版面板的「原文 vs 结果」对照视图使用：
 * 先剥离公共前后缀行，中间部分用 LCS 动态规划求最短编辑脚本，
 * 再按上下文行折叠为 hunk 供渲染。
 *
 * 规模保护：DP 表格 cell 数超过 MAX_CELLS 时降级为「整体替换」，
 * 并把 truncated 置为 true，由调用方提示用户。
 */

export type DiffLineType = 'equal' | 'add' | 'remove'

export interface DiffLine {
  type: DiffLineType
  /** 行内容（不含换行符） */
  text: string
  /** 原文行号（1-based，add 行为 null） */
  oldLine: number | null
  /** 新文本行号（1-based，remove 行为 null） */
  newLine: number | null
}

export interface DiffHunk {
  /** 该 hunk 之前的未变区域行数（0 表示紧邻上一 hunk 或文件开头） */
  gapBefore: number
  lines: DiffLine[]
}

export interface DiffStats {
  added: number
  removed: number
  /** 未变化行数 */
  unchanged: number
}

export interface DiffResult {
  lines: DiffLine[]
  stats: DiffStats
  /** DP 规模超上限，已降级为整体替换 */
  truncated: boolean
}

/** DP 表格 cell 上限（约 1000×1000 行），超出即降级 */
const MAX_CELLS = 1_000_000

function splitLines(text: string): string[] {
  if (text === '') return []
  // 统一换行符，避免 CRLF 与 LF 之间产生纯属噪声的差异
  return text.replace(/\r\n?/g, '\n').split('\n')
}

function eqLine(a: string, b: string): boolean {
  // 忽略行尾空白：编辑器自动清理或模型偶发尾随空格不应算作改动
  return a.trimEnd() === b.trimEnd()
}

/**
 * 计算 oldText → newText 的行级差异。
 */
export function diffLines(oldText: string, newText: string): DiffResult {
  const oldArr = splitLines(oldText)
  const newArr = splitLines(newText)

  // 剥离公共前缀
  let prefix = 0
  while (
    prefix < oldArr.length &&
    prefix < newArr.length &&
    eqLine(oldArr[prefix], newArr[prefix])
  ) {
    prefix++
  }

  // 剥离公共后缀（不与前缀重叠）
  let suffix = 0
  while (
    suffix < oldArr.length - prefix &&
    suffix < newArr.length - prefix &&
    eqLine(oldArr[oldArr.length - 1 - suffix], newArr[newArr.length - 1 - suffix])
  ) {
    suffix++
  }

  const oldMid = oldArr.slice(prefix, oldArr.length - suffix)
  const newMid = newArr.slice(prefix, newArr.length - suffix)

  const lines: DiffLine[] = []

  for (let i = 0; i < prefix; i++) {
    lines.push({ type: 'equal', text: oldArr[i], oldLine: i + 1, newLine: i + 1 })
  }

  let truncated = false
  if (oldMid.length === 0) {
    for (let i = 0; i < newMid.length; i++) {
      lines.push({ type: 'add', text: newMid[i], oldLine: null, newLine: prefix + i + 1 })
    }
  } else if (newMid.length === 0) {
    for (let i = 0; i < oldMid.length; i++) {
      lines.push({ type: 'remove', text: oldMid[i], oldLine: prefix + i + 1, newLine: null })
    }
  } else if ((oldMid.length + 1) * (newMid.length + 1) > MAX_CELLS) {
    // 规模超限：全删 + 全增，不做精细对齐
    truncated = true
    for (let i = 0; i < oldMid.length; i++) {
      lines.push({ type: 'remove', text: oldMid[i], oldLine: prefix + i + 1, newLine: null })
    }
    for (let i = 0; i < newMid.length; i++) {
      lines.push({ type: 'add', text: newMid[i], oldLine: null, newLine: prefix + i + 1 })
    }
  } else {
    lines.push(...lcsDiff(oldMid, newMid, prefix))
  }

  for (let i = 0; i < suffix; i++) {
    const oldIdx = oldArr.length - suffix + i
    const newIdx = newArr.length - suffix + i
    lines.push({
      type: 'equal',
      text: oldArr[oldIdx],
      oldLine: oldIdx + 1,
      newLine: newIdx + 1,
    })
  }

  return { lines, stats: diffStats(lines), truncated }
}

/**
 * LCS 动态规划求最短编辑脚本。
 * 表格用 Uint32Array 扁平化存储，避免上万个数组对象带来的 GC 压力。
 */
function lcsDiff(oldMid: string[], newMid: string[], offset: number): DiffLine[] {
  const n = oldMid.length
  const m = newMid.length
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = eqLine(oldMid[i], newMid[j])
        ? dp[(i + 1) * width + (j + 1)] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (eqLine(oldMid[i], newMid[j])) {
      out.push({
        type: 'equal',
        text: oldMid[i],
        oldLine: offset + i + 1,
        newLine: offset + j + 1,
      })
      i++
      j++
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      out.push({ type: 'remove', text: oldMid[i], oldLine: offset + i + 1, newLine: null })
      i++
    } else {
      out.push({ type: 'add', text: newMid[j], oldLine: null, newLine: offset + j + 1 })
      j++
    }
  }
  while (i < n) {
    out.push({ type: 'remove', text: oldMid[i], oldLine: offset + i + 1, newLine: null })
    i++
  }
  while (j < m) {
    out.push({ type: 'add', text: newMid[j], oldLine: null, newLine: offset + j + 1 })
    j++
  }
  return out
}

/**
 * 把差异行折叠为 hunk：连续的未变区域只保留上下文行，其余折叠。
 *
 * @param context 每个改动块前后保留的上下文行数，默认 2
 */
export function toHunks(lines: DiffLine[], context = 2): DiffHunk[] {
  // 标记需要展示的行
  const keep = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type === 'equal') continue
    const from = Math.max(0, i - context)
    const to = Math.min(lines.length - 1, i + context)
    for (let k = from; k <= to; k++) keep[k] = true
  }

  const hunks: DiffHunk[] = []
  let i = 0
  while (i < lines.length) {
    if (!keep[i]) {
      i++
      continue
    }
    // 统计本 hunk 之前被折叠的行数
    let gap = 0
    for (let k = i - 1; k >= 0 && !keep[k]; k--) gap++
    const start = i
    while (i < lines.length && keep[i]) i++
    hunks.push({ gapBefore: gap, lines: lines.slice(start, i) })
  }

  return hunks
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  let unchanged = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'remove') removed++
    else unchanged++
  }
  return { added, removed, unchanged }
}
