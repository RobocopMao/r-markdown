import { ref, type Ref } from 'vue'

export const STORAGE_KEY = 'r-markdown-editorContent'
export const SAVE_TIME_KEY = 'r-markdown-editorSaveTime'

export function useAutoSave(
  markdown: Ref<string>,
  autoSaveEnabled: Ref<boolean>,
  autoSaveInterval: Ref<number>,
  isMobile: Ref<boolean>,
  saveBase64Store: () => void,
) {
  const savedTime = localStorage.getItem(SAVE_TIME_KEY)

  function formatTime(full: string) {
    let s = full
    if (s.length >= 5 && s[4] === '-') s = s.slice(5)
    if (isMobile.value) {
      const lastColon = s.lastIndexOf(':')
      if (lastColon > 0) s = s.slice(0, lastColon)
    }
    return s
  }

  const saveMode = ref<'自动' | '手动' | ''>(
    savedTime ? (autoSaveEnabled.value ? '自动' : '手动') : '',
  )
  const saveHint = ref(
    savedTime ? saveMode.value + '保存于 ' + formatTime(savedTime) : '',
  )

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function saveContent(value: string, isManual = false) {
    localStorage.setItem(STORAGE_KEY, value)
    saveBase64Store()
    const now = new Date()
    const timeStr =
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0') +
      ' ' +
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes()).padStart(2, '0') +
      ':' +
      String(now.getSeconds()).padStart(2, '0')
    localStorage.setItem(SAVE_TIME_KEY, timeStr)
    saveMode.value = isManual ? '手动' : '自动'
    saveHint.value = saveMode.value + '保存于 ' + formatTime(timeStr)
  }

  function onInput(value: string) {
    markdown.value = value
    if (!autoSaveEnabled.value) {
      saveHint.value = '未保存'
      return
    }
    saveHint.value = '输入中…'
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveContent(value)
    }, autoSaveInterval.value * 1000)
  }

  return {
    savedTime,
    saveMode,
    saveHint,
    saveContent,
    formatTime,
    onInput,
  }
}
