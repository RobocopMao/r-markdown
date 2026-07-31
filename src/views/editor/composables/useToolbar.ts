import { ref, watch, type Ref } from 'vue'
import {
  Highlighter,
  Sparkles,
  Pill,
  TriangleAlert,
  Baseline,
  Strikethrough,
  Bold,
  Italic,
  Code2,
  Superscript,
  Subscript,
  RemoveFormatting,
  Underline,
  Minus,
  ListOrdered,
  List,
  Quote,
  Link,
  StickyNote,
  ListChecks,
  Braces,
  Crop,
  Images,
  Table,
} from 'lucide-vue-next'

export const formatIcons: Record<string, any> = {
  '==': Highlighter,
  '::': Sparkles,
  '!!': Pill,
  '^^': TriangleAlert,
  __: Baseline,
  '~~': Strikethrough,
  '**': Bold,
  '*': Italic,
  '***': RemoveFormatting,
  '`': Code2,
  sup: Superscript,
  sub: Subscript,
  u: Underline,
}

export const markdownInsertOptions = [
  { label: '分割线', display: '---', syntax: '\n---\n', icon: Minus },
  { label: '有序列表', display: '1. 2. 3.', syntax: '1. \n2. \n3. \n', icon: ListOrdered },
  { label: '无序列表', display: '-  -  -', syntax: '- \n- \n- ', icon: List },
  { label: '引用', display: '> 引用文字', syntax: '> ', icon: Quote },
  { label: '链接', display: '[文字](url)', syntax: '[链接文字](url)', icon: Link },
  {
    label: '脚注',
    display: '[文字](url "标题")',
    syntax: '[脚注文字](url "脚注描述")',
    icon: StickyNote,
  },
  {
    label: '任务列表',
    display: '☑ 任务1  ☐ 任务2',
    syntax: '- [x] 任务1\n- [ ] 任务2',
    icon: ListChecks,
  },
  { label: '行内代码', display: '`code`', syntax: '``', icon: Code2 },
  { label: '代码块', display: '``` ... ```', syntax: '```\n\n```', icon: Braces },
  {
    label: '限高图',
    display: '![图](url)[w h]',
    syntax: '![图片描述](https://robocopmao.github.io/r-markdown/empty.webp)[100% 100%]',
    icon: Crop,
  },
  {
    label: '横向多图',
    display: '<图1, 图2>',
    syntax:
      '<![图1描述](https://robocopmao.github.io/r-markdown/empty.webp),![图2描述](https://robocopmao.github.io/r-markdown/empty.webp)>',
    icon: Images,
  },
  { label: '表格', display: '', syntax: '', icon: Table, table: true },
]

export const MAX_GRID_COLS = 10
export const MAX_GRID_ROWS = 10
export const MAX_COLS = 6
export const MAX_ROWS = 3

export interface EditorExposed {
  insertAtCursor: (text: string) => void
  scrollToLineAndHighlight: (lineNo: number) => void
  isAtLineStart: boolean
  hasInlineSelection: boolean
  isInsideTag: boolean
  applyInlineFormat: (syntax: string, wrapType?: 'delim' | 'tag') => void
  replaceRange: (from: number, to: number, text: string) => void
}

export interface TagInfo {
  tagName: string
  attrs: Record<string, string>
  selfClose: boolean
  from: number
  to: number
}

export function useToolbar(editorRef: Ref<EditorExposed | undefined>) {
  // ── 表格快速插入 ──
  const tableGridHovered = ref({ rows: 0, cols: 0 })

  function insertTable(rows: number, cols: number) {
    if (!editorRef.value || rows < 1 || cols < 1) return
    const header = '| ' + Array(cols).fill('表头').join(' | ') + ' |'
    const sep = '| ' + Array(cols).fill('---').join(' | ') + ' |'
    const row = '| ' + Array(cols).fill('单元格').join(' | ') + ' |'
    const body = Array(rows).fill(row).join('\n')
    editorRef.value.insertAtCursor('\n' + header + '\n' + sep + '\n' + body + '\n')
  }

  function getGridCellClass(i: number) {
    const rows = Math.ceil(i / MAX_GRID_COLS)
    const cols = ((i - 1) % MAX_GRID_COLS) + 1
    const active = rows <= tableGridHovered.value.rows && cols <= tableGridHovered.value.cols
    return {
      'border-[#d0d0d0] dark:border-white/15 bg-transparent': !active,
    }
  }

  function isGridCellActive(i: number) {
    const rows = Math.ceil(i / MAX_GRID_COLS)
    const cols = ((i - 1) % MAX_GRID_COLS) + 1
    return rows <= tableGridHovered.value.rows && cols <= tableGridHovered.value.cols
  }

  // ── 布局快速插入（Row/Column）──
  const colGridHovered = ref(0)
  const rowGridHovered = ref(0)

  function isColCellActive(i: number) {
    return i <= colGridHovered.value
  }

  function isRowCellActive(i: number) {
    return i <= rowGridHovered.value
  }

  function insertColumnLayout(cols: number) {
    if (!editorRef.value || cols < 1 || cols > MAX_COLS) return
    const colBlocks = Array.from({ length: cols }, () => '<column flex="1">\n内容\n</column>').join(
      '\n',
    )
    const template = `<row gap="16px">\n${colBlocks}\n</row>`
    editorRef.value.insertAtCursor('\n' + template + '\n')
  }

  function insertColumnStack(cols: number) {
    if (!editorRef.value || cols < 1 || cols > MAX_COLS) return
    const colBlocks = Array.from(
      { length: cols },
      (_, i) => `<column flex="1">\n第 ${i + 1} 列内容\n</column>`,
    ).join('\n')
    editorRef.value.insertAtCursor('\n' + colBlocks + '\n')
  }

  function insertRowStack(rows: number) {
    if (!editorRef.value || rows < 1 || rows > MAX_ROWS) return
    const rowBlocks = Array.from(
      { length: rows },
      (_, i) => `<row gap="16px">\n第 ${i + 1} 行内容\n</row>`,
    ).join('\n')
    editorRef.value.insertAtCursor('\n' + rowBlocks + '\n')
  }

  function insertContainer() {
    if (!editorRef.value) return
    const template = `<container>
内容
</container>`
    editorRef.value.insertAtCursor('\n' + template + '\n')
  }

  function insertHtmlContainer() {
    if (!editorRef.value) return
    const template = `<html>
符合微信公众号编辑器的html
</html>`
    editorRef.value.insertAtCursor('\n' + template + '\n')
  }

  function insertText() {
    if (!editorRef.value) return
    editorRef.value.insertAtCursor('<text>文字</text>')
  }

  function insertStack() {
    if (!editorRef.value) return
    const template = `<stack width="750px" ratio="16/9">
<positioned top="0" left="0" width="100%" height="100%" z-index="0">背景层</positioned>
<positioned top="40px" left="5%" width="90%" z-index="1">前景层</positioned>
</stack>`
    editorRef.value.insertAtCursor('\n' + template + '\n')
  }

  // ── 插入扩展组件 ──
  const componentDialogVisible = ref(false)

  // ── 标签解析表单 ──
  const tagInfo = ref<TagInfo | null>(null)
  const showTagDialog = ref(false)

  function onTagSelected(info: TagInfo | null) {
    tagInfo.value = info
  }

  // 光标离开标签时自动关闭侧栏
  watch(tagInfo, (val) => {
    if (!val) showTagDialog.value = false
  })

  function onTagDialogUpdate(attrs: Record<string, string>) {
    if (!tagInfo.value) return
    const prev = tagInfo.value
    const attrParts = Object.entries(attrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
    const attrsStr = attrParts ? ` ${attrParts}` : ''
    const newTag = prev.selfClose
      ? `<${prev.tagName}${attrsStr} />`
      : `<${prev.tagName}${attrsStr}>`
    editorRef.value?.replaceRange(prev.from, prev.to, newTag)
  }

  return {
    tableGridHovered,
    insertTable,
    getGridCellClass,
    isGridCellActive,
    colGridHovered,
    rowGridHovered,
    isColCellActive,
    isRowCellActive,
    insertColumnLayout,
    insertColumnStack,
    insertRowStack,
    insertContainer,
    insertHtmlContainer,
    insertText,
    insertStack,
    componentDialogVisible,
    tagInfo,
    showTagDialog,
    onTagSelected,
    onTagDialogUpdate,
  }
}
