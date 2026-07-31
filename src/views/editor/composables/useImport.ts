import { type Ref } from 'vue'
import { STORAGE_KEY } from './useAutoSave'
import { extractTitle } from '@/utils/extractTitle'

export function useImport(
  markdown: Ref<string>,
  showToast: (msg: string) => void,
  currentDraftId: Ref<number | null>,
  matchExistingDraft: () => void,
  currentCloudArticleId: Ref<string | null>,
  matchCloudArticle?: (title: string | null) => boolean,
) {
  async function onImportClick() {
    const isTauri = import.meta.env.VITE_TAURI === 'true'

    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const filePath = await open({
          multiple: false,
          filters: [{ name: '文档', extensions: ['md', 'txt', 'docx'] }],
        })
        if (!filePath) return

        const fp = Array.isArray(filePath) ? filePath[0] : filePath
        if (fp.endsWith('.docx')) {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const buffer = await readFile(fp)
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer })
          markdown.value = result.value
        } else {
          const { readTextFile } = await import('@tauri-apps/plugin-fs')
          markdown.value = await readTextFile(fp)
        }
        localStorage.setItem(STORAGE_KEY, markdown.value)
        currentDraftId.value = null
        currentCloudArticleId.value = null
        setTimeout(() => {
          matchExistingDraft()
          matchCloudArticle?.(extractTitle(markdown.value))
        }, 300)
        showToast('导入成功')
      } catch (e: any) {
        showToast(e?.toString() || '导入失败')
        console.error('导入失败:', e)
      }
      return
    }

    // Web 端：浏览器文件选择
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt,.docx'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        if (file.name.endsWith('.docx')) {
          const buf = await file.arrayBuffer()
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ arrayBuffer: buf })
          markdown.value = result.value
        } else {
          markdown.value = await file.text()
        }
        localStorage.setItem(STORAGE_KEY, markdown.value)
        currentDraftId.value = null
        currentCloudArticleId.value = null
        setTimeout(() => {
          matchExistingDraft()
          matchCloudArticle?.(extractTitle(markdown.value))
        }, 300)
        showToast('导入成功')
      } catch (e: any) {
        showToast(e?.toString() || '导入失败')
        console.error('导入失败:', e)
      }
    })
    input.click()
  }

  return {
    onImportClick,
  }
}
