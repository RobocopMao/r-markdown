<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useTheme } from '@/composables/useTheme'
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
import { EditorState, RangeSetBuilder } from '@codemirror/state'
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
let view: EditorView | null = null

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
  const wrapped = wrapType === 'tag'
    ? `<${syntax}>${selectedText}</${syntax}>`
    : syntax + selectedText + syntax
  const anchorShift = wrapType === 'tag' ? syntax.length + 2 : syntax.length
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: wrapped },
    selection: {
      anchor: sel.from + anchorShift,
      head: sel.from + anchorShift + selectedText.length,
    },
  })
}

function setOpeningTagDirection(openTag: string, dir: 'ltr' | 'rtl'): string {
  if (/\sdir="[^"]*"/.test(openTag)) {
    return openTag.replace(/\sdir="[^"]*"/, ` dir="${dir}"`)
  }
  if (/\/>$/.test(openTag)) {
    return openTag.replace(/\s*\/>$/, ` dir="${dir}" />`)
  }
  return openTag.replace(/\s*>$/, ` dir="${dir}">`)
}

function applyTextDirection(dir: 'ltr' | 'rtl') {
  if (!view) return
  const sel = view.state.selection.main
  if (sel.empty) {
    const open = `<direction dir="${dir}">\n`
    const close = '\n</direction>'
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: open + close },
      selection: { anchor: sel.from + open.length },
    })
    return
  }

  const selectedText = view.state.sliceDoc(sel.from, sel.to)
  const leading = selectedText.match(/^\s*/)?.[0] || ''
  const trailing = selectedText.match(/\s*$/)?.[0] || ''
  const core = selectedText.slice(leading.length, selectedText.length - trailing.length)
  const openMatch = core.match(/^<(\w[\w-]*)([^>]*)>/s)

  if (openMatch && (openMatch[1] === 'direction' || openMatch[1] in tagMap)) {
    const updated = core.replace(openMatch[0], setOpeningTagDirection(openMatch[0], dir))
    const insert = leading + updated + trailing
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from, head: sel.from + insert.length },
    })
    return
  }

  const open = `<direction dir="${dir}">\n`
  const close = '\n</direction>'
  const insert = open + selectedText + close
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: {
      anchor: sel.from + open.length,
      head: sel.from + open.length + selectedText.length,
    },
  })
}

// ── 标签选中检测 ──
const tagRegex = /^<(\w[\w-]*)((?:\s+[^>]*?)?)(\/?)>/s
let lastTagSelection: {
  tagName: string
  attrs: Record<string, string>
  selfClose: boolean
  from: number
  to: number
} | null = null

function checkTagSelection(state: EditorState) {
  const sel = state.selection.main
  if (sel.empty) {
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
  // 仅当标签是已知扩展组件时才触发选中逻辑
  if (!(tagName in tagMap)) {
    isAtLineStart.value = false
    if (lastTagSelection) {
      lastTagSelection = null
      emit('tag-selected', null)
    }
    return
  }
  const attrs: Record<string, string> = {}
  if (attrStr) {
    const attrRegex = /(\w[\w-]*)="([^"]*)"/g
    let am
    while ((am = attrRegex.exec(attrStr)) !== null) {
      attrs[am[1]] = am[2]
    }
  }
  const newTag = {
    tagName,
    attrs,
    selfClose: selfClose === '/',
    from: sel.from,
    to: sel.from + match[0].length,
  }
  if (
    !lastTagSelection ||
    lastTagSelection.tagName !== newTag.tagName ||
    lastTagSelection.from !== newTag.from ||
    lastTagSelection.to !== newTag.to
  ) {
    lastTagSelection = newTag
    isAtLineStart.value = false
    emit('tag-selected', newTag)
  }
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

// 自定义暖色调主题 — 匹配 Notion 风格
const warmTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-primary)',
      fontSize: '13px',
      fontFamily:
        'ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
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
    // 语法高亮色 — 暖色调
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
    // 滚动条隐藏
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
      syntaxHighlighting(warmHighlight),
      warmTheme,
      ph('在此输入 Markdown...'),
      updateListener,
      EditorView.lineWrapping,
      collapseBase64,
    ],
  })

  view = new EditorView({
    state,
    parent: editorRef.value,
  })

  // 滚动同步
  view.scrollDOM.addEventListener('scroll', () => {
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
      const pos = view!.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view!.state.selection.main.head
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

defineExpose({ scrollTo, replaceRange, insertAtCursor, isAtLineStart, hasInlineSelection, isInsideTag, applyInlineFormat, applyTextDirection })
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
</style>
