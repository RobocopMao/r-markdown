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
} from '@codemirror/view'
import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Compartment,
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
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
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
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      markdown({ codeLanguages: languages }),
      warmEditorTheme,
      themeCompartment.of(themeExtension(editorTheme.value)),
      ph('在此输入 Markdown...'),
      updateListener,
      EditorView.lineWrapping,
      collapseBase64,
      highlightLineField,
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

function scrollToLineAndHighlight(lineNo: number) {
  if (!view) return
  const lines = view.state.doc.lines
  const targetLine = Math.min(Math.max(1, lineNo), lines)
  const line = view.state.doc.line(targetLine)

  isProgrammaticScroll = true
  view.dispatch({
    effects: [
      highlightLineEffect.of(targetLine),
      EditorView.scrollIntoView(line.from, { y: 'center' }),
    ],
  })

  // scrollIntoView 使用平滑滚动动画（约 120-150ms），动画结束后恢复标记
  setTimeout(() => {
    isProgrammaticScroll = false
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
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Microsoft YaHei', monospace !important;
}

.editor-container :deep(.cm-content) {
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Microsoft YaHei', monospace !important;
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
