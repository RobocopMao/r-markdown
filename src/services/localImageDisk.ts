/**
 * 本地磁盘图片存储（仅桌面端 Tauri）
 *
 * 将图片保存到 <自定义根目录>/images/ 下，文件名保持原样
 * （重名时追加序号如 photo(1).png）。文章中以相对路径 `images/文件名` 引用。
 *
 * 预览渲染时通过 resolveDiskImages() 读取磁盘文件为 base64 dataURL 替换。
 */

import { getImagesDir } from './localArticlePath'

/** 确保目录存在 */
async function ensureDir(dir: string): Promise<void> {
  const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}

/** 检查文件是否存在 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(path)
  } catch {
    return false
  }
}

/**
 * 处理重名：若文件名已存在，追加 (1)、(2)... 直到不冲突。
 * 保留原扩展名，如 photo.png → photo(1).png
 */
async function resolveUniqueName(dir: string, filename: string): Promise<string> {
  if (!(await fileExists(`${dir}/${filename}`))) return filename
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.substring(0, dot) : filename
  const ext = dot > 0 ? filename.substring(dot) : ''
  let i = 1
  while (true) {
    const candidate = `${base}(${i})${ext}`
    if (!(await fileExists(`${dir}/${candidate}`))) return candidate
    i++
  }
}

/** 磁盘图片条目（images 目录下的一个图片文件） */
export interface DiskImageEntry {
  name: string
  relPath: string
  size: number
  modified: number
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'])

/** 跳过系统/编辑器生成的隐藏文件 */
function isJunkEntry(name: string): boolean {
  if (!name) return true
  if (name === '.DS_Store' || name === 'Thumbs.db' || name === 'desktop.ini') return true
  if (name.startsWith('._')) return true
  return false
}

export const LocalImageDisk = {
  /**
   * 列出 images 目录下所有图片文件，按修改时间倒序。
   * 目录不存在或非桌面端时返回空数组。
   */
  async listImages(): Promise<DiskImageEntry[]> {
    try {
      const { exists, readDir, stat } = await import('@tauri-apps/plugin-fs')
      const dir = await getImagesDir()
      if (!(await exists(dir))) return []
      const entries = await readDir(dir)
      const items: DiskImageEntry[] = []
      for (const entry of entries) {
        const name = entry.name ?? ''
        if (!entry.isFile || isJunkEntry(name)) continue
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) continue
        let size = 0
        let modified = 0
        try {
          const info = await stat(`${dir}/${name}`)
          size = info.size
          modified = info.mtime?.getTime() ?? 0
        } catch {
          /* 忽略单个文件读取失败 */
        }
        items.push({ name, relPath: `images/${name}`, size, modified })
      }
      return items.sort((a, b) => b.modified - a.modified)
    } catch {
      return []
    }
  },
  /**
   * 保存图片到本地磁盘，返回用于文章引用的相对路径（如 `images/photo.png`）
   * 不修改原始文件名，重名时追加序号。
   */
  async saveImage(file: File): Promise<string> {
    const dir = await getImagesDir()
    await ensureDir(dir)
    const uniqueName = await resolveUniqueName(dir, file.name)
    const absPath = `${dir}/${uniqueName}`

    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const buffer = await file.arrayBuffer()
    await writeFile(absPath, new Uint8Array(buffer))

    return `images/${uniqueName}`
  },

  /**
   * 根据相对路径（如 `images/photo.png`）读取磁盘图片为 base64 dataURL。
   * 失败时返回 null。
   */
  async readAsDataURL(relPath: string): Promise<string | null> {
    try {
      const dir = await getImagesDir()
      // relPath 形如 "images/photo.png"，取末段拼到 articles/images/ 下
      const filename = relPath.startsWith('images/') ? relPath.slice(7) : relPath
      const absPath = `${dir}/${filename}`
      const { exists, readFile } = await import('@tauri-apps/plugin-fs')
      if (!(await exists(absPath))) return null
      const bytes = await readFile(absPath)
      const blob = new Blob([bytes], { type: guessMime(filename) })
      return new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  },
}

/** 根据扩展名猜测 MIME */
function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
  }
  return map[ext] || 'application/octet-stream'
}

/**
 * 解析 markdown 文本中的本地磁盘图片引用，替换为 base64 dataURL。
 * 仅匹配 `src="images/..."` 形式的引用（避免误伤完整 URL）。
 *
 * 文件名允许：字母、数字、_-(). 以及中文等 Unicode 字符，扩展名限常见图片类型。
 */
export async function resolveDiskImages(text: string): Promise<string> {
  // 匹配 src="images/xxx.png" 形式
  const pattern = /src="(images\/[^"<>|*?\\]+\.(?:png|jpe?g|gif|webp|bmp|svg|ico))"/gi
  const matches = [...text.matchAll(pattern)]
  if (matches.length === 0) return text

  let result = text
  for (const match of matches) {
    const relPath = match[1]
    const dataUrl = await LocalImageDisk.readAsDataURL(relPath)
    if (dataUrl) {
      result = result.split(`src="${relPath}"`).join(`src="${dataUrl}"`)
    }
  }
  return result
}
