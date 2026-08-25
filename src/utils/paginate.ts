/**
 * PDF 导出分页：DOM 测量装箱。
 *
 * 与 XhsExporter.renderSlices 同思路——按顶层块测量、贪心装箱、块绝不跨页、
 * 孤儿标题回退——但输出是真实 DOM 页（文字可选中、可复制），
 * 交给 window.print() 由系统打印对话框「另存为 PDF」。
 * window.print() 在 Tauri 桌面端全平台可用（WebView2 / WKWebView / WebKitGTK）。
 *
 * 防裁剪原理：打印引擎只会在「页面盒」之间断开，块内部由 break-inside:avoid
 * 兜底保护；装箱时每页内容总高不超过 A4 内容盒高度，因此任何组件都不会被腰斩。
 * 单块超过整页高度的超长元素（超长代码块/表格）才降级允许内部切分。
 */

/** A4 内容盒宽度：210mm - 2×15mm 页边距 ≈ 680px @96dpi */
export const PAGE_CONTENT_W = 680

/**
 * A4 内容盒高度：297mm - 2×13mm ≈ 1024px，再扣 8px 引擎取整安全余量。
 * 宁可页尾早收一点，也不能让最后一行溢出到下一页造成重复或裁剪。
 */
export const PAGE_CONTENT_H = 1016

const ROOT_ID = 'pdf-print-root'
const STYLE_ID = 'pdf-print-style'

const OVERLAY_CSS = `
@media screen {
  #${ROOT_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    background: #525659;
    overflow: auto;
    padding-bottom: 40px;
  }
  #${ROOT_ID} .pdf-page {
    background: #fff;
    margin: 20px auto;
    box-shadow: 0 2px 14px rgba(0, 0, 0, 0.4);
  }
}
@media print {
  /* 强制保留背景色/渐变等精确颜色：打印引擎默认丢弃 background，
     不勾选对话框里的「背景图形」也会导致丢色，这里按 W3C 标准覆盖 */
  #${ROOT_ID},
  #${ROOT_ID} * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* 只保留分页文档本身，隐藏整个应用与所有 teleport 弹层 */
  body > *:not(#${ROOT_ID}) {
    display: none !important;
  }
  body {
    background: #fff !important;
    margin: 0 !important;
  }
  #${ROOT_ID} {
    position: static !important;
    overflow: visible !important;
    background: #fff !important;
    padding: 0 !important;
  }
  #${ROOT_ID} .pdf-page {
    margin: 0 !important;
    box-shadow: none !important;
    break-after: page;
    page-break-after: always;
  }
  #${ROOT_ID} .pdf-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  #${ROOT_ID} .pdf-print-close {
    display: none !important;
  }
  @page {
    size: A4 portrait;
    margin: 13mm 15mm;
  }
}
`

/** 打印预览浮层的关闭按钮（仅屏幕显示），点击即取消导出 */
const CLOSE_BTN_HTML =
  '<button class="pdf-print-close" style="position:fixed;top:14px;right:16px;z-index:2147483001;' +
  'padding:8px 16px;border:none;border-radius:8px;background:#1f1f1f;color:#fff;font-size:14px;' +
  'cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35)">✕ 关闭打印预览</button>'

interface PageRange {
  start: number
  end: number
  /** 本页首块是否超过整页预算（需要允许内部切分） */
  oversized: boolean
}

function isHeadingBlock(el: Element): boolean {
  return /^H[1-4]$/.test(el.tagName)
}

/**
 * WebKit（macOS 客户端/Safari）的打印管线会丢弃渐变背景里的透明度：
 * rgba 色标被当作不透明实心输出，浅色底变成近实色色块，
 * 叠加同色系文字后「字和背景一个色」。
 * 把直接坐在白色纸面上的半透明颜色预合成成不透明纯色——
 * 白底上视觉完全等价，且不再依赖各引擎对 alpha 的打印支持。
 */
function flattenTransparentsOnSheet(pageEl: HTMLElement): void {
  const els = pageEl.querySelectorAll<HTMLElement>('[style]')
  els.forEach((el) => {
    const styleAttr = el.getAttribute('style') || ''
    if (!styleAttr.includes('rgba(')) return
    // 仅处理「直接铺在纸面上」的元素：祖先链上没有其他背景层，
    // 半透明色必然是与白纸混合，预合成才是无损等价变换
    let p: HTMLElement | null = el.parentElement
    while (p && p !== pageEl) {
      const bs = p.getAttribute('style') || ''
      if (/background(-image|-color)?\s*:/i.test(bs) && !/:\s*(none|transparent)/i.test(bs)) return
      p = p.parentElement
    }
    const flattened = styleAttr.replace(
      /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g,
      (_m, r: string, g: string, b: string, a: string) => {
        const alpha = Math.max(0, Math.min(1, parseFloat(a)))
        const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha))
        return `rgb(${mix(parseInt(r, 10))}, ${mix(parseInt(g, 10))}, ${mix(parseInt(b, 10))})`
      },
    )
    el.setAttribute('style', flattened)
  })
}

/** 等容器里图片都加载完（带 4s 兜底），否则测量会拿到错的高度。 */
function waitImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'))
  if (!imgs.length) return Promise.resolve()
  return new Promise((resolve) => {
    let done = 0
    const tick = () => {
      done += 1
      if (done >= imgs.length) resolve()
    }
    setTimeout(resolve, 4000)
    imgs.forEach((img) => {
      if (img.complete) tick()
      else {
        img.onload = tick
        img.onerror = tick
      }
    })
  })
}

export interface BuildPdfPagesOptions {
  /** 预览区渲染完成的 HTML（previewRef.innerHTML） */
  html: string
  /** 内容盒宽度 px，默认 A4 内容宽 */
  width?: number
  /** 单页内容盒高度预算 px */
  pageHeight?: number
}

export interface PdfPrintDoc {
  /** 已挂到 body 的打印预览浮层 */
  root: HTMLDivElement
  pageCount: number
  /** 移除浮层、样式与事件监听 */
  destroy: () => void
}

/**
 * 把渲染好的 HTML 装箱成若干 A4 页并挂载打印预览浮层。
 * 之后调用方触发 window.print() 即可；afterprint 或关闭按钮会清理现场。
 */
export async function buildPdfPages(opts: BuildPdfPagesOptions): Promise<PdfPrintDoc> {
  const width = opts.width ?? PAGE_CONTENT_W
  const budget = opts.pageHeight ?? PAGE_CONTENT_H
  const html = opts.html.trim()
  if (!html) throw new Error('内容为空')

  // —— 全局打印样式（幂等注入）——
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = OVERLAY_CSS
    document.head.appendChild(style)
  }

  // —— 隐藏测量器：0×0 + overflow 裁切，不干扰现有布局但保留真实盒模型 ——
  const hider = document.createElement('div')
  hider.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;z-index:-1'
  const measurer = document.createElement('div')
  measurer.style.cssText =
    `position:relative;width:${width}px;box-sizing:border-box;` +
    'color:#333;font-size:15px;line-height:1.8;word-wrap:break-word;overflow-wrap:break-word'
  measurer.innerHTML = html
  hider.appendChild(measurer)
  document.body.appendChild(hider)

  try {
    await waitImages(measurer)

    // —— 块级贪心装箱：offsetTop/offsetHeight 连续分组，孤儿标题回退 ——
    const blocks = Array.from(measurer.children) as HTMLElement[]
    const ranges: PageRange[] = []
    let k = 0
    while (k < blocks.length) {
      const pageTop = blocks[k].offsetTop
      let j = k
      while (j < blocks.length) {
        const bottom = blocks[j].offsetTop + blocks[j].offsetHeight
        // j 放不下且本页已有块 → 收尾；本页第一个块再高也先放进来（避免死循环）
        if (j > k && bottom - pageTop > budget) break
        j++
      }
      // 孤儿标题：本页最后一个块是小节标题且本页不止一个块 → 标题跟着正文挪去下一页
      while (j - k > 1 && isHeadingBlock(blocks[j - 1])) j--
      ranges.push({ start: k, end: j, oversized: j - k === 1 && blocks[k].offsetHeight > budget })
      k = j
    }

    if (!ranges.length) throw new Error('无可分页内容')

    // —— 构建打印浮层并把块按顺序移入各页（移动而非克隆，保持节点唯一）——
    const root = document.createElement('div')
    root.id = ROOT_ID
    root.innerHTML = CLOSE_BTN_HTML

    for (const range of ranges) {
      const page = document.createElement('div')
      page.className = 'pdf-page'
      page.style.width = `${width}px`
      page.style.boxSizing = 'content-box'
      for (let i = range.start; i < range.end; i++) {
        const block = blocks[i]
        block.classList.add('pdf-block')
        if (range.oversized) {
          // 超过整页高的单块：降级为允许浏览器在内部断开（否则必然溢出）
          ;(block.style as CSSStyleDeclaration & { breakInside: string }).breakInside = 'auto'
        } else {
          ;(block.style as CSSStyleDeclaration & { breakInside: string }).breakInside = 'avoid'
        }
        page.appendChild(block)
      }
      root.appendChild(page)
    }

    document.body.appendChild(root)
    root.querySelectorAll<HTMLElement>('.pdf-page').forEach(flattenTransparentsOnSheet)
    // —— 清理逻辑：afterprint / 关闭按钮 / Esc 三通道兜底 ——
    let destroyed = false
    const destroy = () => {
      if (destroyed) return
      destroyed = true
      root.remove()
      window.removeEventListener('afterprint', destroy)
      window.removeEventListener('keydown', onKeydown)
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') destroy()
    }
    root.querySelector('.pdf-print-close')?.addEventListener('click', destroy)
    window.addEventListener('afterprint', destroy)
    window.addEventListener('keydown', onKeydown)

    return { root, pageCount: ranges.length, destroy }
  } finally {
    hider.remove()
  }
}
