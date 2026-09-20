<script setup vapor lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useSetting } from '@/composables/useSetting'
import { tagMap } from '@/extension'
import {
  EditorView,
  keymap,
  placeholder as ph,
  Decoration,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view'
import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Compartment,
  Prec,
} from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
  foldGutter,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import {
  highlightSelectionMatches,
  selectNextOccurrence,
  selectSelectionMatches,
  gotoLine,
} from '@codemirror/search'
import {
  findMatches,
  expandReplacement,
  FIND_MATCH_LIMIT,
  type FindMatch,
} from '@/utils/findReplace'
import type { FindSpec } from './FindReplacePanel.vue'
import { autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { rectangularSelection } from '@codemirror/view'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { githubLightStyle, githubDarkStyle } from '@uiw/codemirror-theme-github'
import { solarizedLightStyle, solarizedDarkStyle } from '@uiw/codemirror-theme-solarized'
import { materialLightStyle, materialDarkStyle } from '@uiw/codemirror-theme-material'
import { draculaDarkStyle } from '@uiw/codemirror-theme-dracula'
import { monokaiDarkStyle } from '@uiw/codemirror-theme-monokai'

// ── 预览点击定位高亮 ──
const highlightLineEffect = StateEffect.define<number>()
const highlightLineMark = Decoration.mark({ class: 'cm-locate-flash' })

const highlightLineField = StateField.define({
  create() {
    return Decoration.none
  },
  update(decos, tr) {
    for (const e of tr.effects) {
      if (e.is(highlightLineEffect)) {
        const lineNo = e.value
        if (lineNo <= 0) return Decoration.none
        const doc = tr.state.doc
        if (lineNo > doc.lines) return Decoration.none
        const line = doc.line(lineNo)
        return Decoration.set([highlightLineMark.range(line.from, line.to)])
      }
    }
    return decos.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ── 查找替换 ──
/**
 * CodeMirror 自带高亮只在它自己的搜索面板打开时渲染（源码里 `if (!panel) return
 * Decoration.none`）。我们用自定义面板，所以匹配高亮要自己维护。
 *
 * 这里只把匹配区间存进 StateField，装饰通过 Facet.compute 依赖 selection 派生，
 * 这样移动光标/切换命中项时无需重新派发事务即可刷新「当前项」样式。
 */
const setFindMatches = StateEffect.define<{ from: number; to: number }[]>()
const findMatchMark = Decoration.mark({ class: 'cm-find-match' })
const findMatchActiveMark = Decoration.mark({ class: 'cm-find-match cm-find-match-active' })

/** 全部匹配区间（升序），由 setFindMatches 写入 */
const findMatchesField = StateField.define<{ from: number; to: number }[]>({
  create() {
    return []
  },
  update(matches, tr) {
    for (const e of tr.effects) {
      if (e.is(setFindMatches)) return e.value
    }
    return matches
  },
})

/** 由匹配集合 + 当前选区派生高亮，当前命中项用更醒目的样式 */
const findHighlight = EditorView.decorations.compute([findMatchesField, 'selection'], (state) => {
  const matches = state.field(findMatchesField)
  if (matches.length === 0) return Decoration.none
  const sel = state.selection.main
  const builder = new RangeSetBuilder<Decoration>()
  for (const m of matches) {
    const isActive = m.from === sel.from && m.to === sel.to
    builder.add(m.from, m.to, isActive ? findMatchActiveMark : findMatchMark)
  }
  return builder.finish()
})

// 查找状态：供父组件读取匹配数与当前序号
const findTotal = ref(0)
const findCurrent = ref(0)
const findInvalid = ref(false)

/** 最近一次查找条件（含替换串），next/prev/替换复用 */
let findSpec: FindSpec & { replace: string } = {
  search: '',
  replace: '',
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
}

/** 按当前条件算出全部匹配 */
function computeMatches(text: string): FindMatch[] {
  return findMatches(
    text,
    findSpec.search,
    {
      caseSensitive: findSpec.caseSensitive,
      wholeWord: findSpec.wholeWord,
      regexp: findSpec.regexp,
    },
    FIND_MATCH_LIMIT,
  ).matches
}

/** 查找条件变化：重算匹配、更新高亮与计数 */
function applyFindSpec(spec: FindSpec & { replace: string }) {
  if (!view) return
  findSpec = spec

  const doc = view.state.doc.toString()
  const res = findMatches(
    doc,
    spec.search,
    {
      caseSensitive: spec.caseSensitive,
      wholeWord: spec.wholeWord,
      regexp: spec.regexp,
    },
    FIND_MATCH_LIMIT,
  )
  findInvalid.value = res.invalid
  const matches = res.matches
  findTotal.value = matches.length

  const sel = view.state.selection.main
  const idx = matches.findIndex((m) => m.from === sel.from && m.to === sel.to)
  findCurrent.value = idx >= 0 ? idx + 1 : 0

  view.dispatch({ effects: setFindMatches.of(matches) })
}

/** 跳到第 index 个匹配（0-based，自动环绕），并把选区移过去 */
function gotoMatch(index: number) {
  if (!view || findTotal.value === 0) return
  const matches = computeMatches(view.state.doc.toString())
  if (matches.length === 0) return
  const wrapped = ((index % matches.length) + matches.length) % matches.length
  const target = matches[wrapped]

  findCurrent.value = wrapped + 1
  view.dispatch({
    selection: { anchor: target.from, head: target.to },
    effects: [EditorView.scrollIntoView(target.from, { y: 'center' })],
  })
}

function findNext() {
  if (!view || findTotal.value === 0) return
  if (findCurrent.value === 0) {
    // 还没落在任何匹配上：从光标处往后找第一个
    const matches = computeMatches(view.state.doc.toString())
    const cur = view.state.selection.main.from
    const i = matches.findIndex((m) => m.from >= cur)
    gotoMatch(i < 0 ? 0 : i)
    return
  }
  gotoMatch(findCurrent.value)
}

function findPrevious() {
  if (!view || findTotal.value === 0) return
  if (findCurrent.value === 0) {
    const matches = computeMatches(view.state.doc.toString())
    const cur = view.state.selection.main.from
    let i = -1
    for (let k = matches.length - 1; k >= 0; k--) {
      if (matches[k].to <= cur) {
        i = k
        break
      }
    }
    gotoMatch(i < 0 ? matches.length - 1 : i)
    return
  }
  gotoMatch(findCurrent.value - 2)
}

/** 替换当前命中项，然后跳到下一个。返回是否发生了替换 */
function replaceCurrent(): boolean {
  if (!view || findTotal.value === 0) return false
  const sel = view.state.selection.main
  const matches = computeMatches(view.state.doc.toString())
  const hit = matches.find((m) => m.from === sel.from && m.to === sel.to)
  if (!hit) {
    // 当前光标不在匹配上：先跳到下一个，避免误替换
    findNext()
    return false
  }
  const text = expandReplacement(findSpec.replace, hit, findSpec.regexp)
  // 记录替换起点，替换后从这里往后找下一个匹配（与常见编辑器一致：替换即前进）
  const resumeAt = hit.from + text.length
  view.dispatch({
    changes: { from: hit.from, to: hit.to, insert: text },
    selection: { anchor: resumeAt },
  })

  // 文档已变，重算匹配与计数；并把光标停到下一个匹配上，方便连续点击「替换」
  const rest = computeMatches(view.state.doc.toString())
  findTotal.value = rest.length
  const nextIdx = rest.findIndex((m) => m.from >= resumeAt)
  findCurrent.value = nextIdx >= 0 ? nextIdx + 1 : 0
  view.dispatch({ effects: setFindMatches.of(rest) })
  if (nextIdx >= 0) {
    const n = rest[nextIdx]
    view.dispatch({
      selection: { anchor: n.from, head: n.to },
      effects: EditorView.scrollIntoView(n.from, { y: 'center' }),
    })
  }
  return true
}

/** 全部替换，返回替换次数 */
function replaceAllMatches(): number {
  if (!view || findTotal.value === 0) return 0
  const docText = view.state.doc.toString()
  const matches = computeMatches(docText)
  if (matches.length === 0) return 0

  // 正则模式下要按原文重新取捕获组，这里 matches 已带 groups，直接展开
  const changes = matches.map((m) => ({
    from: m.from,
    to: m.to,
    insert: expandReplacement(findSpec.replace, m, findSpec.regexp),
  }))
  view.dispatch({ changes })
  const n = matches.length

  // 替换后原匹配已失效，清空高亮并重算（替换文本可能又构成新匹配）
  findTotal.value = 0
  findCurrent.value = 0
  view.dispatch({ effects: setFindMatches.of([]) })
  return n
}

/** 把编辑器当前选中的文字作为查找词回传给面板 */
function getSelectedText(): string {
  if (!view) return ''
  const sel = view.state.selection.main
  if (sel.empty) return ''
  const t = view.state.sliceDoc(sel.from, sel.to)
  // 单行且不太长时才有意义
  return t.includes('\n') || t.length > 100 ? '' : t
}

/** 快捷键：打开查找面板（CursorMove 命令要求返回 boolean） */
function openFindPanel(): boolean {
  emit('openFind', false)
  return true
}

/** 快捷键：打开查找面板并展开替换行 */
function openReplacePanel(): boolean {
  emit('openFind', true)
  return true
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  scroll: [ratio: number]
  'tag-selected': [
    info: {
      tagName: string
      attrs: Record<string, string>
      selfClose: boolean
      from: number
      to: number
    } | null,
  ]
  pasteImage: [file: File]
  pasteMultipleImages: []
  pasteText: []
  undoRedo: []
  dropImage: [file: File, from: number]
  dropMultipleImages: []
  dropNonImage: []
  /** 请求打开查找替换面板（快捷键触发），参数为是否展开替换行 */
  openFind: [withReplace: boolean]
}>()

const editorRef = ref<HTMLDivElement>()
const { colors } = useTheme()
const editorTheme = useSetting<string>('editorTheme')
const themeCompartment = new Compartment()

// ── 第三方主题 HighlightStyle ──
const githubLightHighlight = HighlightStyle.define(githubLightStyle)
const githubDarkHighlight = HighlightStyle.define(githubDarkStyle)
const solarizedLightHighlight = HighlightStyle.define(solarizedLightStyle)
const solarizedDarkHighlight = HighlightStyle.define(solarizedDarkStyle)
const materialLightHighlight = HighlightStyle.define(materialLightStyle)
const materialDarkHighlight = HighlightStyle.define(materialDarkStyle)
const draculaHighlight = HighlightStyle.define(draculaDarkStyle)
const monokaiHighlight = HighlightStyle.define(monokaiDarkStyle)

function themeExtension(theme: string) {
  switch (theme) {
    case 'one-dark':
      return syntaxHighlighting(oneDarkHighlightStyle)
    case 'github-light':
      return syntaxHighlighting(githubLightHighlight)
    case 'github-dark':
      return syntaxHighlighting(githubDarkHighlight)
    case 'solarized-light':
      return syntaxHighlighting(solarizedLightHighlight)
    case 'solarized-dark':
      return syntaxHighlighting(solarizedDarkHighlight)
    case 'material-light':
      return syntaxHighlighting(materialLightHighlight)
    case 'material-dark':
      return syntaxHighlighting(materialDarkHighlight)
    case 'dracula':
      return syntaxHighlighting(draculaHighlight)
    case 'monokai':
      return syntaxHighlighting(monokaiHighlight)
    case 'default':
    default:
      return [warmSyntaxTheme, syntaxHighlighting(warmHighlight)]
  }
}

let view: EditorView | null = null

// 程序化滚动标记：scrollToLineAndHighlight 等主动滚动时置 true，避免触发双向同步
let isProgrammaticScroll = false

// ── 光标位置状态 ──
const isAtLineStart = ref(false)
const cursorLine = ref(1)
const cursorCol = ref(1)
const selectedChars = ref(0)

// ── 行内样式选中检测 ──
const hasInlineSelection = ref(false)

// ── 标签内检测 ──
const isInsideTag = ref(false)

function checkCursorInTag(state: EditorState): boolean {
  const pos = state.selection.main.head
  const doc = state.doc.toString()
  let i = pos - 1
  while (i >= 0) {
    const ch = doc[i]
    if (ch === '>') return false
    if (ch === '<') return doc.indexOf('>', pos) !== -1
    i--
  }
  return false
}

function checkInlineSelection(state: EditorState) {
  const sel = state.selection.main
  if (sel.empty) {
    hasInlineSelection.value = false
    return
  }
  const doc = state.doc.toString()
  // 如果已经是组件标签选中，不触发行内样式
  const selectedText = doc.slice(sel.from, sel.to)
  // 多行选中不触发
  if (selectedText.includes('\n')) {
    hasInlineSelection.value = false
    return
  }
  // 选区在未闭合的标签内部不触发（如属性值内）
  const line = state.doc.lineAt(sel.from)
  const posInLine = sel.from - line.from
  const before = line.text.slice(0, posInLine)
  const lastLt = before.lastIndexOf('<')
  if (lastLt !== -1 && !before.slice(lastLt + 1).includes('>')) {
    hasInlineSelection.value = false
    return
  }
  const tagMatch = selectedText.match(tagRegex)
  if (tagMatch && tagMatch[1] in tagMap) {
    hasInlineSelection.value = false
    return
  }
  // 检查是否已被行内修饰语法包裹
  const twoCharDelims = ['==', '::', '!!', '^^', '__', '~~', '**']
  for (const delim of twoCharDelims) {
    if (
      sel.from >= delim.length &&
      sel.to + delim.length <= doc.length &&
      doc.slice(sel.from - delim.length, sel.from) === delim &&
      doc.slice(sel.to, sel.to + delim.length) === delim
    ) {
      hasInlineSelection.value = false
      return
    }
  }
  // 斜体 *（排除粗体 **）
  if (
    sel.from >= 1 &&
    sel.to + 1 <= doc.length &&
    doc[sel.from - 1] === '*' &&
    doc[sel.to] === '*' &&
    !(sel.from >= 2 && doc[sel.from - 2] === '*') &&
    !(sel.to + 2 <= doc.length && doc[sel.to + 1] === '*')
  ) {
    hasInlineSelection.value = false
    return
  }
  // 行内代码
  if (
    sel.from >= 1 &&
    sel.to + 1 <= doc.length &&
    doc[sel.from - 1] === '`' &&
    doc[sel.to] === '`'
  ) {
    hasInlineSelection.value = false
    return
  }
  // HTML 标签包裹：<tag>...</tag>
  const tagWrappers = ['u', 'sub', 'sup']
  for (const tag of tagWrappers) {
    const openTag = `<${tag}>`
    const closeTag = `</${tag}>`
    if (
      sel.from >= openTag.length &&
      sel.to + closeTag.length <= doc.length &&
      doc.slice(sel.from - openTag.length, sel.from) === openTag &&
      doc.slice(sel.to, sel.to + closeTag.length) === closeTag
    ) {
      hasInlineSelection.value = false
      return
    }
  }
  hasInlineSelection.value = true
}

function applyInlineFormat(syntax: string, wrapType: 'delim' | 'tag' = 'delim') {
  if (!view) return
  const sel = view.state.selection.main
  if (sel.empty) return
  const selectedText = view.state.sliceDoc(sel.from, sel.to)
  const wrapped =
    wrapType === 'tag' ? `<${syntax}>${selectedText}</${syntax}>` : syntax + selectedText + syntax
  const anchorShift = wrapType === 'tag' ? syntax.length + 2 : syntax.length
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: wrapped },
    selection: {
      anchor: sel.from + anchorShift,
      head: sel.from + anchorShift + selectedText.length,
    },
  })
}

// ── 标签选中检测 ──
const tagRegex = /^<(\w[\w-]*)((?:\s+[^>]*?)?)(\/?)>/s
type TagInfo = {
  tagName: string
  attrs: Record<string, string>
  selfClose: boolean
  from: number
  to: number
}
let lastTagSelection: TagInfo | null = null

function parseAttrString(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (attrStr) {
    const attrRegex = /(\w[\w-]*)="([^"]*)"/g
    let am
    while ((am = attrRegex.exec(attrStr)) !== null) {
      attrs[am[1]] = am[2]
    }
  }
  return attrs
}

function emitTagInfo(info: TagInfo | null) {
  if (!info) {
    if (lastTagSelection) {
      lastTagSelection = null
      emit('tag-selected', null)
    }
    return
  }
  // 只要检测到组件标签，就禁止行首工具栏按钮（基础语法/临时/长期/图床/组件）
  isAtLineStart.value = false
  if (
    !lastTagSelection ||
    lastTagSelection.tagName !== info.tagName ||
    lastTagSelection.from !== info.from ||
    lastTagSelection.to !== info.to
  ) {
    lastTagSelection = info
    emit('tag-selected', info)
  }
}

/** 光标在标签后面时（如 /> 或 </tagName> 后），向前查找组件标签 */
function detectTagAtCursor(pos: number, text: string): TagInfo | null {
  if (pos === 0 || text[pos - 1] !== '>') return null
  let depth = 0
  for (let i = pos - 2; i >= 0; i--) {
    if (text[i] === '>') {
      depth++
    } else if (text[i] === '<') {
      if (depth > 0) {
        depth--
        continue
      }
      const raw = text.slice(i, pos)
      // </tagName> 闭合标签：向前查找对应的开始标签
      const closeMatch = raw.match(/^<\/(\w[\w-]*)>$/)
      if (closeMatch && closeMatch[1] in tagMap) {
        return findOpeningTag(text, i, closeMatch[1])
      }
      // <tagName ... > 或 <tagName ... />
      const match = raw.match(tagRegex)
      if (match && match[1] in tagMap) {
        return {
          tagName: match[1],
          attrs: parseAttrString(match[2]),
          selfClose: match[3] === '/',
          from: i,
          to: i + match[0].length,
        }
      }
      return null
    }
  }
  return null
}

/** 从关闭标签位置向前查找对应的开始标签 */
function findOpeningTag(text: string, closeTagStart: number, tagName: string): TagInfo | null {
  const beforeClose = text.slice(0, closeTagStart)
  const openTagRegex = new RegExp(`<${tagName}((?:\\s+[^>]*?)?)\\s*(/?)>`, 'g')
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = openTagRegex.exec(beforeClose)) !== null) {
    lastMatch = m
  }
  if (lastMatch) {
    return {
      tagName,
      attrs: parseAttrString(lastMatch[1]),
      selfClose: lastMatch[2] === '/',
      from: lastMatch.index,
      to: lastMatch.index + lastMatch[0].length,
    }
  }
  return null
}

function checkTagSelection(state: EditorState) {
  const sel = state.selection.main
  if (sel.empty) {
    const tagAtCursor = detectTagAtCursor(sel.from, state.doc.toString())
    if (tagAtCursor) {
      emitTagInfo(tagAtCursor)
      return
    }
    if (lastTagSelection) {
      lastTagSelection = null
      emit('tag-selected', null)
    }
    return
  }
  const text = state.sliceDoc(sel.from, sel.to)
  const match = text.match(tagRegex)
  if (!match) {
    isAtLineStart.value = false
    if (lastTagSelection) {
      lastTagSelection = null
      emit('tag-selected', null)
    }
    return
  }
  const [, tagName, attrStr, selfClose] = match
  if (!(tagName in tagMap)) {
    isAtLineStart.value = false
    if (lastTagSelection) {
      lastTagSelection = null
      emit('tag-selected', null)
    }
    return
  }
  emitTagInfo({
    tagName,
    attrs: parseAttrString(attrStr),
    selfClose: selfClose === '/',
    from: sel.from,
    to: sel.from + match[0].length,
  })
}

// 自定义语法高亮 — 去掉 defaultHighlightStyle 的 heading 下划线
const warmHighlight = HighlightStyle.define([
  { tag: tags.heading, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.heading1, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.heading2, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.heading3, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.heading4, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.heading5, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.heading6, textDecoration: 'none', fontWeight: '700', color: '#E06C75' },
  { tag: tags.strong, fontWeight: '700', color: '#C678DD' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#C678DD' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#56B6C2' },
  { tag: tags.link, color: '#61AFEF' },
  { tag: tags.url, color: '#61AFEF' },
  { tag: tags.meta, color: '#5C6370' },
  { tag: tags.comment, color: '#5C6370' },
  { tag: tags.string, color: '#98C379' },
  { tag: tags.number, color: '#D19A66' },
  { tag: tags.monospace, color: '#E06C75' },
  { tag: tags.quote, color: '#5C6370', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#ABB2BF' },
  { tag: tags.keyword, color: '#C678DD' },
  { tag: tags.atom, color: '#D19A66' },
  { tag: tags.operator, color: '#56B6C2' },
  { tag: tags.special(tags.string), color: '#98C379' },
])

// 编辑器基础 UI 主题 — 始终生效，不受主题切换影响
const warmEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-primary)',
      fontSize: '13px',
      fontFamily:
        'ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Microsoft YaHei", monospace',
      lineHeight: '1.6',
      height: '100%',
    },
    '.cm-content': {
      padding: '16px',
      caretColor: 'var(--accent)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-muted)',
      borderRight: '1px solid var(--border-color)',
      minWidth: '40px',
      fontFamily:
        'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Microsoft YaHei", monospace',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-editor)',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(var(--accent-rgb), 0.15) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(var(--accent-rgb), 0.2) !important',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(var(--accent-rgb), 0.15)',
      outline: '1px solid rgba(var(--accent-rgb), 0.3)',
    },
    '.cm-foldGutter': {
      color: 'var(--text-muted)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      scrollbarWidth: 'none',
    },
    '.cm-scroller::-webkit-scrollbar': {
      display: 'none',
    },
  },
  { dark: false },
)

// 暖色调语法高亮 CSS（.cm-* 类名兜底）
const warmSyntaxTheme = EditorView.theme(
  {
    '.cm-formatting': { color: '#b0a4c8' },
    '.cm-keyword': { color: '#c084fc' },
    '.cm-heading': { color: '#e879f9', fontWeight: '700', textDecoration: 'none' },
    '.cm-strong': { color: '#f0abfc', fontWeight: '700' },
    '.cm-emphasis': { color: '#f0abfc', fontStyle: 'italic' },
    '.cm-strikethrough': { color: '#9ca3af', textDecoration: 'line-through' },
    '.cm-link': { color: '#67e8f9' },
    '.cm-url': { color: '#67e8f9' },
    '.cm-meta': { color: '#9ca3af' },
    '.cm-comment': { color: '#9ca3af' },
    '.cm-string': { color: '#86efac' },
    '.cm-number': { color: '#fbbf24' },
    '.cm-monospace': {
      backgroundColor: 'rgba(var(--accent-rgb), 0.08)',
      color: '#f472b6',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '13px',
    },
    '.cm-blockquote': {
      color: '#9ca3af',
      fontStyle: 'italic',
    },
    '.cm-horizontalRule': {
      color: '#d1d5db',
    },
    '.cm-list': {
      color: '#c084fc',
    },
  },
  { dark: false },
)

// ── base64 折叠插件：将长 base64 字符串折叠为短占位符 ──
const base64Regex = /data:image\/([^;"]+);base64,([A-Za-z0-9+\/=]+)/g

class Base64Placeholder extends WidgetType {
  constructor(readonly mime: string) {
    super()
  }
  eq(other: Base64Placeholder) {
    return this.mime === other.mime
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-base64-fold'
    span.textContent = `image/${this.mime} [base64]`
    return span
  }
}

const collapseBase64 = ViewPlugin.fromClass(
  class {
    decorations: any
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view)
      }
    }
    build(view: EditorView) {
      const builder = new RangeSetBuilder<any>()
      const text = view.state.doc.toString()
      let match
      while ((match = base64Regex.exec(text)) !== null) {
        const dataLen = match[2].length
        if (dataLen <= 100) continue
        const base64Start = match.index + match[0].indexOf('base64,') + 7
        const base64End = match.index + match[0].length
        builder.add(
          base64Start,
          base64End,
          Decoration.replace({ widget: new Base64Placeholder(match[1]) }),
        )
      }
      return builder.finish()
    }
  },
  { decorations: (v) => v.decorations },
)

onMounted(async () => {
  await nextTick()
  if (!editorRef.value) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      emit('update:modelValue', update.state.doc.toString())
      // 检测撤销/重做
      const isUndoRedo = update.transactions.some(
        (tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo'),
      )
      if (isUndoRedo) {
        emit('undoRedo')
      }
    }
    if (update.selectionSet || update.docChanged) {
      // 先更新行首状态，再让 checkTagSelection 覆盖（组件标签选中时置 false）
      const sel = update.state.selection.main
      const line = update.state.doc.lineAt(sel.from)
      isAtLineStart.value = sel.from === line.from
      cursorLine.value = line.number
      cursorCol.value = sel.from - line.from + 1
      selectedChars.value = sel.empty ? 0 : sel.to - sel.from
      isInsideTag.value = checkCursorInTag(update.state)
      checkTagSelection(update.state)
      checkInlineSelection(update.state)
    }
  })

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),

      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      highlightSelectionMatches(),
      history(),
      // 查找相关快捷键交给自定义面板（Prec.high 覆盖 CodeMirror 自带的英文面板）
      Prec.high(
        keymap.of([
          { key: 'Mod-f', run: openFindPanel },
          // Cmd/Ctrl+Alt+F 展开替换行（不用 Mod-h：macOS 上 Cmd+H 被系统「隐藏应用」占用）
          { key: 'Mod-Alt-f', run: openReplacePanel },
          // 保留 CodeMirror 好用的多选/跳行能力
          { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
          { key: 'Mod-Shift-l', run: selectSelectionMatches },
          { key: 'Mod-Alt-g', run: gotoLine },
        ]),
      ),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown({ codeLanguages: languages }),
      warmEditorTheme,
      themeCompartment.of(themeExtension(editorTheme.value)),
      ph('在此输入 Markdown...'),
      updateListener,
      EditorView.lineWrapping,
      collapseBase64,
      highlightLineField,
      findMatchesField,
      findHighlight,
    ],
  })

  view = new EditorView({
    state,
    parent: editorRef.value,
  })

  // 监听主题切换
  watch(editorTheme, (newTheme) => {
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(newTheme)),
    })
  })

  // 滚动同步
  view.scrollDOM.addEventListener('scroll', () => {
    if (isProgrammaticScroll) return
    const el = view!.scrollDOM
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 0) {
      emit('scroll', el.scrollTop / maxScroll)
    }
  })

  // 粘贴图片
  view.dom.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    let imageFile: File | null = null
    let imageCount = 0
    let hasText = false
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageCount++
        imageFile = items[i].getAsFile()
      } else if (items[i].type === 'text/plain') {
        hasText = true
      }
    }
    if (imageCount > 0) {
      e.preventDefault()
      if (imageCount > 1) {
        emit('pasteMultipleImages')
      } else if (imageFile) {
        emit('pasteImage', imageFile)
      }
      return
    }
    // 纯文本粘贴：让 CodeMirror 默认处理，异步通知父组件匹配草稿
    if (hasText) {
      setTimeout(() => emit('pasteText'), 0)
    }
  })

  // 拖拽图片
  view.dom.addEventListener('dragover', (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  })

  view.dom.addEventListener('drop', (e: DragEvent) => {
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    const imgFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imgFiles.length === 0) {
      emit('dropNonImage')
      return
    }
    e.preventDefault()
    if (imgFiles.length > 1) {
      emit('dropMultipleImages')
    } else {
      const pos =
        view!.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view!.state.selection.main.head
      emit('dropImage', imgFiles[0], pos)
    }
  })
})

// 监听外部内容变化（如撤销/重做或程序化更新）
let ignoreUpdate = false
watch(
  () => props.modelValue,
  (newVal) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (newVal === current) return
    ignoreUpdate = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newVal },
    })
    ignoreUpdate = false
  },
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// 暴露 scrollTo 方法给父组件
function scrollTo(ratio: number) {
  if (!view) return
  const el = view.scrollDOM
  const maxScroll = el.scrollHeight - el.clientHeight
  el.scrollTop = ratio * maxScroll
}

function replaceRange(from: number, to: number, text: string) {
  if (!view) return
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from, head: from + text.length },
  })
}

function insertAtCursor(text: string) {
  if (!view) return
  const sel = view.state.selection.main
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
  })
}

function scrollToLineAndHighlight(
  lineNo: number,
  opts?: { syncPreview?: boolean; moveCursor?: boolean },
) {
  if (!view) return
  const lines = view.state.doc.lines
  const targetLine = Math.min(Math.max(1, lineNo), lines)
  const line = view.state.doc.line(targetLine)

  isProgrammaticScroll = true
  view.dispatch({
    ...(opts?.moveCursor ? { selection: { anchor: line.from } } : {}),
    effects: [
      highlightLineEffect.of(targetLine),
      EditorView.scrollIntoView(line.from, { y: 'center' }),
    ],
  })

  // scrollIntoView 使用平滑滚动动画（约 120-150ms），动画结束后恢复标记；
  // 大纲等跳转场景在动画结束后上报滚动比例，供父组件同步预览位置
  setTimeout(() => {
    isProgrammaticScroll = false
    if (opts?.syncPreview && view) {
      const el = view.scrollDOM
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 0) emit('scroll', el.scrollTop / maxScroll)
    }
  }, 200)

  setTimeout(() => {
    if (view) {
      view.dispatch({ effects: highlightLineEffect.of(-1) })
    }
  }, 3000)
}

defineExpose({
  scrollTo,
  replaceRange,
  insertAtCursor,
  isAtLineStart,
  hasInlineSelection,
  isInsideTag,
  applyInlineFormat,
  scrollToLineAndHighlight,
  cursorLine,
  cursorCol,
  selectedChars,
  // 查找替换
  applyFindSpec,
  findNext,
  findPrevious,
  replaceCurrent,
  replaceAllMatches,
  getSelectedText,
  findTotal,
  findCurrent,
  findInvalid,
  focusEditor: () => view?.focus(),
})
</script>

<template>
  <div class="editor-wrap flex h-full overflow-hidden">
    <div ref="editorRef" class="editor-container flex-1 h-full overflow-hidden"></div>
  </div>
</template>

<style scoped>
.editor-container {
  width: 100%;
}

.editor-container :deep(.cm-editor) {
  height: 100%;
  font-family:
    ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Microsoft YaHei',
    monospace !important;
}

.editor-container :deep(.cm-content) {
  font-family:
    ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Microsoft YaHei',
    monospace !important;
}

.editor-container :deep(.cm-scroller) {
  overflow: auto;
  scrollbar-width: none;
}

.editor-container :deep(.cm-scroller::-webkit-scrollbar) {
  display: none;
}

.editor-container :deep(.cm-base64-fold) {
  display: inline;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  background: var(--bg-secondary);
  white-space: nowrap;
  cursor: default;
}

.editor-container :deep(.cm-locate-flash) {
  animation: locate-flash-light 3s ease-out;
}

/* ── 查找替换高亮 ── */
.editor-container :deep(.cm-find-match) {
  background: rgba(255, 196, 0, 0.35);
  border-radius: 2px;
}

.editor-container :deep(.cm-find-match-active) {
  background: rgba(255, 145, 0, 0.72);
  outline: 1px solid rgba(255, 145, 0, 0.9);
}

[data-theme='dark'] .editor-container :deep(.cm-find-match) {
  background: rgba(255, 196, 0, 0.28);
}

[data-theme='dark'] .editor-container :deep(.cm-find-match-active) {
  background: rgba(255, 145, 0, 0.6);
}

[data-theme='dark'] .editor-container :deep(.cm-locate-flash) {
  animation: locate-flash-dark 3s ease-out;
}

@keyframes locate-flash-light {
  from {
    background-color: rgba(59, 130, 246, 0.15);
  }
  to {
    background-color: rgba(59, 130, 246, 0.35);
  }
}

@keyframes locate-flash-dark {
  from {
    background-color: rgba(253, 244, 227, 0.2);
  }
  to {
    background-color: rgba(253, 244, 227, 0.4);
  }
}
</style>
