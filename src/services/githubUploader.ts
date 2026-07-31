/**
 * GitHub 图床上传服务
 *
 * 将图片上传到 GitHub 仓库，返回 jsDelivr CDN 链接。
 * 原生 fetch 实现，无需额外依赖。
 */

export interface GitHubUploadConfig {
  repo: string // 格式 "用户名/仓库名"
  token: string
  branch: string // 默认 "main"
}

export interface UploadResult {
  url: string
}

/**
 * File → Data URL → 纯 base64（去除 data URI 前缀）
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      if (!base64) {
        reject(new Error('文件格式不支持'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 获取文件扩展名
 */
function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx > 0 ? filename.substring(idx) : '.png'
}

/**
 * 生成上传路径：r-markdown/YYYY/MM/DD/时间戳.后缀
 */
function generatePath(filename: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const ts = Date.now()
  const ext = getExtension(filename)
  return `r-markdown/${year}/${month}/${day}/${ts}${ext}`
}

/**
 * 上传图片到 GitHub 仓库，返回 jsDelivr CDN 链接
 */
export async function uploadToGitHub(
  file: File,
  config: GitHubUploadConfig,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const [owner, repo] = config.repo.split('/')
  if (!owner || !repo) {
    throw new Error('仓库格式错误，应为 用户名/仓库名')
  }

  const path = generatePath(file.name)
  const content = await fileToBase64(file)

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`

  const body = JSON.stringify({
    message: 'Upload via R-Markdown',
    content,
    branch: config.branch,
  })

  const result = await new Promise<XMLHttpRequest>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', apiUrl)

    xhr.setRequestHeader('Authorization', `token ${config.token}`)
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr)
      } else {
        let message = `HTTP ${xhr.status}`
        try {
          const errBody = JSON.parse(xhr.responseText)
          message = (errBody as any).message || message
        } catch {}
        if (xhr.status === 401) reject(new Error('Token 无效或无权限'))
        else if (xhr.status === 404) reject(new Error('仓库不存在，请检查 用户名/仓库名'))
        else if (xhr.status === 422) reject(new Error(`上传失败: ${message}`))
        else reject(new Error(`上传失败 (${xhr.status}): ${message}`))
      }
    }

    xhr.onerror = () => reject(new Error('网络请求失败'))
    xhr.ontimeout = () => reject(new Error('上传超时'))
    xhr.timeout = 60000

    xhr.send(body)
  })

  const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${config.branch}/${path}`

  return { url: jsdelivrUrl }
}

/**
 * 测试图床连接：尝试获取仓库信息
 */
export async function testConnection(config: GitHubUploadConfig): Promise<boolean> {
  const [owner, repo] = config.repo.split('/')
  if (!owner || !repo) {
    throw new Error('仓库格式错误，应为 用户名/仓库名')
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token 无效或无权限')
    }
    if (response.status === 404) {
      throw new Error('仓库不存在')
    }
    throw new Error(`连接失败 (${response.status})`)
  }

  return true
}
