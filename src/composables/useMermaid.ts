import { getErrorMessage } from '@/utils/helpers'

let mermaidModule: typeof import('mermaid').default | null = null
let mermaidInitialized = false

async function getMermaid() {
  if (!mermaidModule) {
    const mod = await import('mermaid')
    mermaidModule = mod.default
  }
  if (!mermaidInitialized) {
    mermaidModule.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    })
    mermaidInitialized = true
  }
  return mermaidModule
}

function decodeHtmlEntities(encoded: string): string {
  return encoded
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function parsePixelValue(val: string): number | null {
  if (!val) return null
  const match = val.match(/^(\d+(?:\.\d+)?)\s*px$/i)
  return match ? parseFloat(match[1]) : null
}

async function svgToPng(svg: string, width?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgBase64 = btoa(unescape(encodeURIComponent(svg)))
    const src = 'data:image/svg+xml;base64,' + svgBase64
    img.onload = () => {
      const dpr = window.devicePixelRatio || 2
      const canvas = document.createElement('canvas')
      const naturalW = img.naturalWidth
      const naturalH = img.naturalHeight
      if (!naturalW || !naturalH) {
        reject(new Error('SVG has no intrinsic size'))
        return
      }
      const targetW = width || naturalW
      const targetH = Math.round(targetW * (naturalH / naturalW))
      canvas.width = targetW * dpr
      canvas.height = targetH * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.drawImage(img, 0, 0, targetW, targetH)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = (e) => {
      reject(e)
    }
    img.src = src
  })
}

/**
 * 这段 HTML 里有待渲染的 mermaid 块吗？
 *
 * 判断依据是 `Mermaid_DA01.render()` 真实产出的 `.mermaid-block`。
 *
 * 别把这个判断写回调用点——预览面板、素材卡、素材库原先各自写了一句
 * `html.includes('class="mermaid"')`，那是更早版本的类名，条件永远不成立，
 * 于是 `renderAll()` 从没被调用过，前端预览里 mermaid 一直是空白；而编辑器
 * 右侧的 `Preview.vue` 是无条件调 `renderAll()` 的，所以「插进编辑器就好了」。
 * 类名只留在这一个文件里，以后组件改名时不会又漂掉。
 */
export function hasMermaidBlock(html: string): boolean {
  return html.includes('mermaid-block')
}

/**
 * 把一段已经 `parseMarkdownAsync()` 过的 HTML 里的 mermaid 块渲染好再还回来。
 *
 * mermaid 要量真实尺寸，必须挂到 document 上才能画；挂载期间用
 * `position:absolute; visibility:hidden` 让它不参与布局也不闪一下。
 */
export async function renderMermaidInHtml(html: string): Promise<string> {
  if (!hasMermaidBlock(html)) return html
  const tmp = document.createElement('div')
  tmp.style.position = 'absolute'
  tmp.style.visibility = 'hidden'
  tmp.style.pointerEvents = 'none'
  tmp.innerHTML = html
  document.body.appendChild(tmp)
  try {
    await useMermaid().renderAll(tmp)
    return tmp.innerHTML
  } finally {
    document.body.removeChild(tmp)
  }
}

export function useMermaid() {
  async function renderBlock(el: HTMLElement): Promise<boolean> {
    const svgContainer = el.querySelector('.mermaid-svg-container') as HTMLElement | null
    if (!svgContainer) return false
    // 已渲染过则跳过
    if (svgContainer.querySelector('img')) return true

    const code = el.dataset.mermaidCode || ''
    const renderWidth = el.dataset.mermaidRenderWidth || ''
    const theme = el.dataset.mermaidTheme || 'default'
    if (!code.trim()) return false
    try {
      const mermaid = await getMermaid()
      mermaid.initialize({ startOnLoad: false, theme: theme as any })
      await mermaid.parse(code)
      const { svg } = await mermaid.render(
        'mermaid-' + Math.random().toString(36).slice(2, 8),
        code,
      )
      const pxWidth = parsePixelValue(renderWidth)
      const pngDataUri = await svgToPng(svg, pxWidth || undefined)
      const widthStyle = renderWidth ? `width:${renderWidth};` : ''
      svgContainer.innerHTML = `<img src="${pngDataUri}" style="display:block;max-width:1000%!important;${widthStyle}" />`
      return true
    } catch (e: unknown) {
      console.error('[Mermaid] render failed:', e)
      svgContainer.innerHTML = `<pre style="color:#e74c3c;font-size:12px;white-space:pre-wrap">${getErrorMessage(e, String(e))}\n\n${code}</pre>`
      return false
    }
  }

  async function renderAll(container: HTMLElement): Promise<number> {
    const blocks = container.querySelectorAll('.mermaid-block')
    let count = 0
    for (const block of blocks) {
      const ok = await renderBlock(block as HTMLElement)
      if (ok) count++
    }
    return count
  }

  return { renderBlock, renderAll }
}
