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
