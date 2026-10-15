/**
 * 把文件保存到本地磁盘。
 *
 * 为什么不能只用 `<a download>`：桌面端（Tauri）的 WebView 对 blob URL 的
 * `a.download` 不生效——点了没有任何反应，也不报错。项目里 HTML 导出、定稿
 * 保存、小红书导出都是「桌面端走原生保存对话框，浏览器端才用 a.download」，
 * 这里把那套写法收敛成一份，避免各处再抄一遍（抄漏了就会出现「下载失败」）。
 */

const isTauri = import.meta.env.VITE_TAURI === 'true'

export interface SaveFileFilter {
  name: string
  extensions: string[]
}

/** 保存结果：saved = 已写入；cancelled = 用户在保存对话框里点了取消 */
export type SaveResult = 'saved' | 'cancelled'

/**
 * 保存二进制内容（图片、ZIP 等）。
 * 桌面端弹原生保存对话框；浏览器端触发下载。真实失败会抛错，交调用方提示。
 */
export async function saveBinaryFile(
  bytes: Uint8Array,
  defaultName: string,
  filters: SaveFileFilter[],
): Promise<SaveResult> {
  if (isTauri) {
    try {
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ])
      const filePath = await save({ defaultPath: defaultName, filters })
      // 用户取消：直接返回，绝不能继续走浏览器下载兜底
      if (!filePath) return 'cancelled'
      await writeFile(filePath, bytes)
      return 'saved'
    } catch (e) {
      // 原生通道不可用（权限/插件异常）才降级为浏览器下载
      console.error('[saveFile] 桌面端保存失败，降级为浏览器下载:', e)
    }
  }

  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeFromName(defaultName) })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // 立即 revoke 在部分浏览器会打断已排队的下载，延后释放
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  return 'saved'
}

/** 保存文本内容（Markdown、HTML 等） */
export async function saveTextFile(
  text: string,
  defaultName: string,
  filters: SaveFileFilter[],
): Promise<SaveResult> {
  return saveBinaryFile(new TextEncoder().encode(text), defaultName, filters)
}

/** Blob → Uint8Array，便于交给 saveBinaryFile */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/** 由扩展名粗略推断 MIME，仅用于浏览器下载兜底 */
function mimeFromName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'zip':
      return 'application/zip'
    case 'html':
      return 'text/html;charset=utf-8'
    case 'md':
      return 'text/markdown;charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}
