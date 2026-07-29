import { ref, nextTick, type Ref } from 'vue'
import { getSetting } from '@/config/settings'
import { putImage } from '@/utils/imageDB'
import { uploadToGitHub } from '@/services/githubUploader'
import { uploadToLeta } from '@/services/letaUploader'

// base64 图片数据存储，避免长字符串撑大编辑器
const IMG_STORE_KEY = 'r-markdown-editorImgs'
const base64Store = new Map<string, string>()

// 初始化时从 localStorage 恢复图片数据
;(() => {
  try {
    const raw = localStorage.getItem(IMG_STORE_KEY)
    if (raw) {
      const entries: [string, string][] = JSON.parse(raw)
      for (const [token, b64] of entries) {
        base64Store.set(token, b64)
      }
    }
  } catch {
    /* ignore corrupt data */
  }
})()

export function saveBase64Store() {
  if (base64Store.size === 0) {
    localStorage.removeItem(IMG_STORE_KEY)
    return
  }
  const entries = Array.from(base64Store.entries())
  localStorage.setItem(IMG_STORE_KEY, JSON.stringify(entries))
}

export function clearBase64Store() {
  base64Store.clear()
  localStorage.removeItem(IMG_STORE_KEY)
}

function compactBase64(dataUrl: string): string {
  const m = dataUrl.match(/^(data:image\/[\w+]+);base64,(.+)$/)
  if (!m) return dataUrl
  const [, prefix, b64] = m
  if (b64.length <= 100) return dataUrl
  for (const [existingToken, existingB64] of base64Store) {
    if (existingB64 === b64) {
      return `${prefix};base64,${existingToken}`
    }
  }
  const token = `IMG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  base64Store.set(token, b64)
  return `${prefix};base64,${token}`
}

export function resolveBase64(text: string): string {
  if (base64Store.size === 0) return text
  let result = text
  for (const [token, b64] of base64Store) {
    result = result.split(token).join(b64)
  }
  return result
}

function cleanupUnusedBase64() {
  const tokensInUse = new Set(markdownInComposable.value.match(/IMG_\d+_[a-z0-9]{6}/g) ?? [])
  let removed = false
  for (const token of base64Store.keys()) {
    if (!tokensInUse.has(token)) {
      base64Store.delete(token)
      removed = true
    }
  }
  if (removed) saveBase64Store()
}

// ── 图片压缩（Canvas） ──
const MAX_DIMENSION = 1920

async function compressImage(file: File, maxSizeKB: number, maxQuality: number): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })

  const canvas = document.createElement('canvas')
  let { width, height } = img
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / Math.max(width, height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  const maxBytes = maxSizeKB * 1024
  let low = 0.1
  let high = maxQuality
  let best: Blob | null = null

  for (let i = 0; i < 6; i++) {
    const mid = (low + high) / 2
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', mid)
    })
    if (blob.size <= maxBytes) {
      best = blob
      low = mid
    } else {
      high = mid
    }
  }

  if (!best) {
    best = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', low)
    })
  }

  const newName = file.name.replace(/\.[^.]+$/, '.jpg')
  return new File([best], newName, { type: 'image/jpeg' })
}

interface EditorExposed {
  insertAtCursor: (text: string) => void
  replaceRange: (from: number, to: number, text: string) => void
  isInsideTag: boolean
}

let markdownInComposable: Ref<string>

export function useImageInsert(
  editorRef: Ref<EditorExposed | undefined>,
  showToast: (msg: string) => void,
  markdown: Ref<string>,
) {
  markdownInComposable = markdown

  const imageInputRef = ref<HTMLInputElement>()
  const persistImageInputRef = ref<HTMLInputElement>()
  const githubImageInputRef = ref<HTMLInputElement>()
  const githubUploading = ref(false)
  const githubUploadProgress = ref(0)
  const uploadHostingLabel = ref('图床')

  function handleInsertImage() {
    imageInputRef.value?.click()
  }

  function onImageSelected(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      input.value = ''
      return
    }

    const quality = (getSetting<number>('compressQuality') || 100) / 100
    if (quality >= 1.0 && file.size > 2 * 1024 * 1024) {
      showToast('图片不能超过 2MB')
      input.value = ''
      return
    }

    doInsertLocalImage(file, input)
  }

  async function doInsertLocalImage(file: File, input: HTMLInputElement) {
    const quality = (getSetting<number>('compressQuality') || 100) / 100
    let finalFile = file
    if (quality < 1.0) {
      showToast('正在压缩图片...')
      finalFile = await compressImage(file, 2000, quality)
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const compacted = compactBase64(dataUrl)
      editorRef.value?.insertAtCursor(
        `<img src="${compacted}" width="100%" height="auto" radius="8px" fit="cover" />`,
      )
      const cleanup = window.requestIdleCallback || ((fn) => setTimeout(fn, 200))
      cleanup(() => cleanupUnusedBase64())
      input.value = ''
    }
    reader.onerror = () => {
      showToast('图片读取失败')
      input.value = ''
    }
    reader.readAsDataURL(finalFile)
  }

  function handleInsertImagePersist() {
    persistImageInputRef.value?.click()
  }

  async function onImagePersistSelected(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      input.value = ''
      return
    }

    const quality = (getSetting<number>('compressQuality') || 100) / 100
    let finalFile = file
    if (quality < 1.0) {
      showToast('正在压缩图片...')
      finalFile = await compressImage(file, 5000, quality)
      if (finalFile.size > 5 * 1024 * 1024) {
        showToast('图片压缩后仍超过 5MB')
        input.value = ''
        return
      }
    } else if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB')
      input.value = ''
      return
    }

    try {
      const token = await putImage(finalFile)
      editorRef.value?.insertAtCursor(
        `<img src="idb:${token}" width="100%" height="auto" radius="8px" fit="cover" />`,
      )
      await nextTick()
    } catch {
      showToast('存储图片失败')
    }
    input.value = ''
  }

  async function processImageInsert(file: File, insertAt: number | null = null) {
    if (editorRef.value?.isInsideTag) {
      showToast('不能在组件标签内插入图片')
      return
    }

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      return
    }

    const mode = getSetting<string>('pasteDropMode') || 'local'

    if (mode === 'github') {
      const repo = getSetting<string>('githubRepo')
      const token = getSetting<string>('githubToken')
      if (!repo || !token) {
        showToast('请先在设置中配置 GitHub 图床')
        return
      }
      let uploadFile = file
      const quality = (getSetting<number>('compressQuality') || 100) / 100
      if (quality < 1.0) {
        showToast('正在压缩图片...')
        uploadFile = await compressImage(file, 5000, quality)
        if (uploadFile.size > 5 * 1024 * 1024) {
          showToast('图片压缩后仍超过 5MB')
          return
        }
      } else if (file.size > 5 * 1024 * 1024) {
        showToast('图片不能超过 5MB')
        return
      }
      githubUploading.value = true
      githubUploadProgress.value = 0
      uploadToGitHub(
        uploadFile,
        { repo, token, branch: getSetting<string>('githubBranch') || 'main' },
        (percent) => {
          githubUploadProgress.value = percent
        },
      )
        .then((result) => {
          const tag = `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`
          if (insertAt !== null) {
            editorRef.value?.replaceRange(insertAt, insertAt, tag)
          } else {
            editorRef.value?.insertAtCursor(tag)
          }
          showToast('上传成功')
        })
        .catch((e: any) => {
          showToast(e.message || '上传失败')
        })
        .finally(() => {
          githubUploading.value = false
          githubUploadProgress.value = 0
        })
      return
    }

    if (mode === 'leta') {
      const token = getSetting<string>('letaToken')
      const storageId = getSetting<string>('letaStorageId') || '1'
      if (!token) {
        showToast('请先在设置中配置乐塔图床 Token')
        return
      }
      let uploadFile = file
      const quality = (getSetting<number>('compressQuality') || 100) / 100
      if (quality < 1.0) {
        showToast('正在压缩图片...')
        uploadFile = await compressImage(file, 10000, quality)
        if (uploadFile.size > 10 * 1024 * 1024) {
          showToast('图片压缩后仍超过 10MB')
          return
        }
      } else if (file.size > 10 * 1024 * 1024) {
        showToast('图片不能超过 10MB')
        return
      }
      githubUploading.value = true
      githubUploadProgress.value = 0
      uploadToLeta(uploadFile, { token, storageId }, (percent) => {
        githubUploadProgress.value = percent
      })
        .then((result) => {
          const tag = `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`
          if (insertAt !== null) {
            editorRef.value?.replaceRange(insertAt, insertAt, tag)
          } else {
            editorRef.value?.insertAtCursor(tag)
          }
          showToast('上传成功')
        })
        .catch((e: any) => {
          showToast(e.message || '上传失败')
        })
        .finally(() => {
          githubUploading.value = false
          githubUploadProgress.value = 0
        })
      return
    }

    // 本地模式 → IndexedDB 存储
    const quality = (getSetting<number>('compressQuality') || 100) / 100
    let finalFile = file
    if (quality < 1.0) {
      showToast('正在压缩图片...')
      finalFile = await compressImage(file, 5000, quality)
      if (finalFile.size > 5 * 1024 * 1024) {
        showToast('图片压缩后仍超过 5MB')
        return
      }
    } else if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB')
      return
    }
    try {
      const token = await putImage(finalFile)
      const tag = `<img src="idb:${token}" width="100%" height="auto" radius="8px" fit="cover" />`
      if (insertAt !== null) {
        editorRef.value?.replaceRange(insertAt, insertAt, tag)
      } else {
        editorRef.value?.insertAtCursor(tag)
      }
      await nextTick()
    } catch {
      showToast('存储图片失败')
    }
  }

  function handlePasteImage(file: File) {
    processImageInsert(file)
  }

  function handlePasteMultipleImages() {
    showToast('一次只能粘贴一张图片')
  }

  function handleDropImage(file: File, from: number) {
    processImageInsert(file, from)
  }

  function handleDropMultipleImages() {
    showToast('一次只能拖入一张图片')
  }

  function handleDropNonImage() {
    showToast('请拖入图片文件')
  }

  function handleUploadToGitHub() {
    githubImageInputRef.value?.click()
  }

  async function onGithubImageSelected(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      input.value = ''
      return
    }

    const hosting = getSetting<string>('defaultHosting') || 'github'
    uploadHostingLabel.value = hosting === 'leta' ? '乐塔图床' : 'GitHub 图床'
    const maxSize = hosting === 'leta' ? 10 : 5

    const quality = (getSetting<number>('compressQuality') || 100) / 100
    let finalFile = file
    if (quality < 1.0) {
      showToast('正在压缩图片...')
      finalFile = await compressImage(file, maxSize * 1000, quality)
      if (finalFile.size > maxSize * 1024 * 1024) {
        showToast(`图片压缩后仍超过 ${maxSize}MB`)
        input.value = ''
        return
      }
    } else if (file.size > maxSize * 1024 * 1024) {
      showToast(`图片不能超过 ${maxSize}MB`)
      input.value = ''
      return
    }

    if (hosting === 'leta') {
      const letaToken = getSetting<string>('letaToken')
      const storageId = getSetting<string>('letaStorageId') || '1'
      if (!letaToken) {
        showToast('请先在设置中配置乐塔图床 Token')
        input.value = ''
        return
      }
      githubUploading.value = true
      githubUploadProgress.value = 0
      try {
        const result = await uploadToLeta(finalFile, { token: letaToken, storageId }, (percent) => {
          githubUploadProgress.value = percent
        })
        editorRef.value?.insertAtCursor(
          `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`,
        )
        showToast('上传成功')
      } catch (e: any) {
        showToast(e.message || '上传失败')
      }
      githubUploading.value = false
      githubUploadProgress.value = 0
      input.value = ''
      return
    }

    const repo = getSetting<string>('githubRepo')
    const token = getSetting<string>('githubToken')
    const branch = getSetting<string>('githubBranch') || 'main'

    if (!repo || !token) {
      showToast('请先在设置中配置 GitHub 图床')
      input.value = ''
      return
    }

    githubUploading.value = true
    githubUploadProgress.value = 0
    try {
      const result = await uploadToGitHub(finalFile, { repo, token, branch }, (percent) => {
        githubUploadProgress.value = percent
      })
      editorRef.value?.insertAtCursor(
        `<img src="${result.url}" width="100%" height="auto" radius="8px" fit="cover" />`,
      )
      showToast('上传成功')
    } catch (e: any) {
      showToast(e.message || '上传失败')
    }
    githubUploading.value = false
    githubUploadProgress.value = 0
    input.value = ''
  }

  return {
    imageInputRef,
    persistImageInputRef,
    githubImageInputRef,
    githubUploading,
    githubUploadProgress,
    uploadHostingLabel,
    handleInsertImage,
    onImageSelected,
    handleInsertImagePersist,
    onImagePersistSelected,
    handlePasteImage,
    handlePasteMultipleImages,
    handleDropImage,
    handleDropMultipleImages,
    handleDropNonImage,
    handleUploadToGitHub,
    onGithubImageSelected,
  }
}
