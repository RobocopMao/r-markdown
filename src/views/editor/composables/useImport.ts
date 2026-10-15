import { type Ref } from 'vue'
import { STORAGE_KEY } from './useAutoSave'
import { extractTitle } from '@/utils/extractTitle'
import { getErrorMessage } from '@/utils/helpers'

export interface PickedDocument {
  /** 文件内容（docx 已提取为纯文本） */
  text: string
  /** 文件名，用于界面展示来源 */
  name: string
}

/**
 * 选择并读取一个文档文件（.md / .txt / .docx），只负责取内容，
 * 不修改编辑器状态 —— 供侧栏「导入」与 AI 排版面板共用。
 *
 * 用户取消选择时返回 null。
 */
export async function pickDocumentFile(): Promise<PickedDocument | null> {
  const isTauri = import.meta.env.VITE_TAURI === 'true'

  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const filePath = await open({
      multiple: false,
      filters: [{ name: '文档', extensions: ['md', 'txt', 'docx'] }],
    })
    if (!filePath) return null

    const fp = Array.isArray(filePath) ? filePath[0] : filePath
    const name = fp.split(/[/\\]/).pop() || fp
    if (fp.endsWith('.docx')) {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const buffer = await readFile(fp)
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer })
      return { text: result.value, name }
    }
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return { text: await readTextFile(fp), name }
  }

  // Web 端：浏览器文件选择
  return new Promise<PickedDocument | null>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt,.docx'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      try {
        if (file.name.endsWith('.docx')) {
          const buf = await file.arrayBuffer()
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ arrayBuffer: buf })
          resolve({ text: result.value, name: file.name })
        } else {
          resolve({ text: await file.text(), name: file.name })
        }
      } catch (e: unknown) {
        reject(e)
      }
    })
    // 用户直接关闭文件选择框时不会触发 change，交给调用方超时兜底
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export function useImport(
  markdown: Ref<string>,
  showToast: (msg: string) => void,
  currentDraftId: Ref<number | null>,
  matchExistingDraft: () => void,
  currentCloudArticleId: Ref<string | null>,
  matchCloudArticle?: (title: string | null) => boolean,
) {
  async function onImportClick() {
    try {
      const picked = await pickDocumentFile()
      if (!picked) return

      markdown.value = picked.text
      localStorage.setItem(STORAGE_KEY, markdown.value)
      currentDraftId.value = null
      currentCloudArticleId.value = null
      setTimeout(() => {
        matchExistingDraft()
        matchCloudArticle?.(extractTitle(markdown.value))
      }, 300)
      showToast('导入成功')
    } catch (e: unknown) {
      showToast(getErrorMessage(e) || '导入失败')
      console.error('导入失败:', e)
    }
  }

  return {
    onImportClick,
  }
}
