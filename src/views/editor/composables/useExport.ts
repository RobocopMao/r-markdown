import { FileDown, FileText, Braces, Image } from 'lucide-vue-next'
import { type ComputedRef, type Ref } from 'vue'
import { buildPdfPages, type PdfPrintDoc } from '@/utils/paginate'

export const exportItems = [
  { label: '保存图片', icon: Image, action: 'saveImage' },
  { label: '小红书图', icon: FileText, action: 'xhs' },
  { label: 'PDF', icon: FileDown, action: 'export-pdf' },
  { label: 'HTML', icon: Braces, action: 'export-html' },
]

interface PreviewExposed {
  copyRichText: () => void
  copyHTML: () => void
  getHTML: () => string
  saveAsImage: () => void
}

export function useExport(
  extractedTitle: ComputedRef<string>,
  previewRef: Ref<PreviewExposed | undefined>,
  showToast: (msg: string) => void,
  xhsVisible: Ref<boolean>,
) {
  function handleCopyRichText() {
    previewRef.value?.copyRichText()
  }

  function handleCopyHTML() {
    previewRef.value?.copyHTML()
  }

  async function handleExportHTML() {
    const html = previewRef.value?.getHTML() || ''
    const fullDoc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extractedTitle.value || 'R-Markdown 导出'}</title>
  <style>
    body {
      max-width: 677px;
      margin: 0 auto;
      padding: 20px 0;
    }
  </style>
</head>
<body>
${html}
</body>
</html>`

    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const filePath = await save({
        defaultPath: (extractedTitle.value || 'export') + '.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (!filePath) return
      await writeTextFile(filePath, fullDoc)
      showToast('HTML已导出')
    } catch {
      const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (extractedTitle.value || 'export') + '.html'
      a.click()
      URL.revokeObjectURL(url)
      showToast('HTML已导出')
    }
  }

  function handleSaveImage() {
    previewRef.value?.saveAsImage()
  }

  /** 当前打开的打印预览文档，防止重复打开 */
  let activePdfDoc: PdfPrintDoc | null = null

  /**
   * 唤起系统打印。macOS 客户端里 Tauri 会把 window.print 重写为 IPC 调用
   * （plugin:webview|print）并返回 Promise——权限未放行或调用失败时
   * 必须把错误暴露出来，否则表现为「点了打印没反应」。
   * 打印对话框「另存为 PDF」的默认文件名取自 document.title，
   * 故打印期间临时替换为文章标题，结束后还原。
   */
  function triggerPrint(showToast: (msg: string) => void) {
    const originalTitle = document.title
    const safeName = (extractedTitle.value || 'R-Markdown 导出').replace(/[\\/:*?"<>|]/g, ' ').trim()
    document.title = safeName
    let restored = false
    const restoreTitle = () => {
      if (restored) return
      restored = true
      document.title = originalTitle
      window.removeEventListener('afterprint', restoreTitle)
    }
    window.addEventListener('afterprint', restoreTitle)
    setTimeout(restoreTitle, 60000) // 兜底：afterprint 未触发（如直接取消）也能还原

    try {
      const result = window.print() as unknown
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          restoreTitle()
          const msg = err instanceof Error ? err.message : String(err)
          showToast('打印失败：' + msg + '（需在客户端 capabilities 放行 core:webview:allow-print）')
        })
      }
    } catch (err: unknown) {
      restoreTitle()
      const msg = err instanceof Error ? err.message : String(err)
      showToast('打印失败：' + msg)
    }
  }

  /**
   * PDF 导出：DOM 测量装箱分页后唤起系统打印（打印对话框里「另存为 PDF」）。
   * window.print() 在 Tauri 桌面端全平台可用；Web 端走浏览器打印。
   */
  async function handleExportPDF() {
    const html = previewRef.value?.getHTML() || ''
    if (!html.trim()) {
      showToast('内容为空，无法导出')
      return
    }
    // 上一次打印预览还没关 → 先清掉再开新的
    activePdfDoc?.destroy()
    try {
      showToast('正在生成分页…')
      const doc = await buildPdfPages({ html })
      activePdfDoc = doc
      // 等两帧确保浮层布局与样式生效后再唤起打印
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          triggerPrint(showToast)
        })
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast('PDF 导出失败：' + msg)
      activePdfDoc = null
    }
  }

  function onDropdownSelect(groupId: string, action: string) {
    if (groupId === 'export') {
      if (action === 'saveImage') handleSaveImage()
      else if (action === 'export-pdf') void handleExportPDF()
      else if (action === 'xhs') xhsVisible.value = true
      else if (action === 'export-html') handleExportHTML()
    }
  }

  return {
    handleCopyRichText,
    handleCopyHTML,
    handleExportHTML,
    handleSaveImage,
    onDropdownSelect,
  }
}
