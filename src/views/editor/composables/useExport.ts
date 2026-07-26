import { Image, FileText, Braces } from 'lucide-vue-next'
import { type ComputedRef, type Ref } from 'vue'

export const exportItems = [
  { label: '保存图片', icon: Image, action: 'saveImage' },
  { label: '小红书图', icon: FileText, action: 'xhs' },
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

  function onDropdownSelect(groupId: string, action: string) {
    if (groupId === 'export') {
      if (action === 'saveImage') handleSaveImage()
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
