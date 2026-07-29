/**
 * MathJax SVG 渲染器 —— 本地加载 tex-svg，输出自包含 SVG（微信编辑器兼容）
 */

let mathJaxReady: Promise<void> | null = null

function loadMathJax(): Promise<void> {
  if (mathJaxReady)
    return mathJaxReady

    // 在加载 MathJax 前注入配置：fontCache='none' 让路径直接内联，
    // 避免 <use xlink:href> 引用（微信编辑器不支持）
  ;(window as any).MathJax = {
    svg: {
      fontCache: 'none',
    },
    startup: {
      typeset: false,
    },
  }

  mathJaxReady = new Promise<void>((resolve, reject) => {
    if ((window as any).MathJax?.startup?.adaptor) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = import.meta.env.BASE_URL + 'mathjax/tex-svg.js'
    script.onload = () => {
      const check = setInterval(() => {
        if ((window as any).MathJax?.startup?.adaptor) {
          clearInterval(check)
          resolve()
        }
      }, 50)
    }
    script.onerror = () => {
      mathJaxReady = null
      reject(new Error('MathJax CDN load failed'))
    }
    document.head.appendChild(script)
  })

  return mathJaxReady
}

export function preloadMathJax(): void {
  loadMathJax().catch(() => {})
}

/**
 * 使用 MathJax 将 LaTeX 公式渲染为自包含 SVG。
 * - fontCache='none' 确保路径直接内联（无 <use> 引用）
 * - 保留 currentColor 让 SVG 继承父级文字颜色（亮色/暗色自适应）
 */
export async function renderMath(formula: string, displayMode: boolean = false): Promise<string> {
  try {
    await loadMathJax()
    const MathJax = (window as any).MathJax
    const node = MathJax.tex2svg(formula, { display: displayMode })
    const adaptor = MathJax.startup.adaptor

    const assistive = node.querySelector('mjx-assistive-mml')
    if (assistive) adaptor.remove(assistive)

    return (
      adaptor
        .outerHTML(node)
        // 微信不兼容 xlink 命名空间，统一改为现代 SVG
        .replace(/xlink:href/g, 'href')
        // 强行设 display:inline（MathJax 可能通过样式表注入 display:block）
        .replace(
          /(<svg\b[^>]*style=")([^"]*)(")/i,
          (_m: string, before: string, styles: string, after: string) => {
            const cleaned = styles.replace(/display:\s*block\s*;?/gi, '')
            return `${before}display:inline;max-width:none!important;${cleaned}${after}`
          },
        )
        .replace(/<svg\b(?![^>]*style=")/i, '<svg style="display:inline;max-width:none!important"')
    )
  } catch {
    return ''
  }
}
