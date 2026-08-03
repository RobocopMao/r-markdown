<script setup vapor lang="ts">
import { ref, watch, nextTick } from 'vue'
import { toPng } from 'html-to-image'
import type { ThemeColors } from '@/composables/useTheme'
import { useDarkMode } from '@/composables/useDarkMode'
import { parseMarkdownAsync, type ParagraphStyle } from '@/utils/markdownParser'
import { getSetting } from '@/config/settings'
import {
  paraFontSize,
  paraLineHeight,
  paraFontWeight,
  paraMargin,
  paraIndent,
} from '@/composables/useParagraphSettings'
import { useMermaid } from '@/composables/useMermaid'
import Toast from '@/components/Toast.vue'

const isTauri = import.meta.env.VITE_TAURI === 'true'
const { isDark } = useDarkMode()
const { renderAll } = useMermaid()

const props = defineProps<{
  markdown: string
  colors: ThemeColors
  isMobile: boolean
}>()

const emit = defineEmits<{
  'click-line': [lineNo: number]
}>()

const previewRef = ref<HTMLElement>()
const scrollContainerRef = ref<HTMLElement>()
const saving = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const hintVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let hintTimer: ReturnType<typeof setTimeout> | null = null
let scrollDebounce: ReturnType<typeof setTimeout> | null = null
let mermaidTimer: ReturnType<typeof setTimeout> | null = null

function onScroll() {
  if (!isDark.value) return
  hintVisible.value = false
  if (scrollDebounce) clearTimeout(scrollDebounce)
  scrollDebounce = setTimeout(() => {
    hintVisible.value = true
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      hintVisible.value = false
    }, 5000)
  }, 300)
}

function showToast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 1500)
}

function onPreviewClick(event: MouseEvent) {
  let el = event.target as HTMLElement | null
  while (el && el !== previewRef.value) {
    const line = el.getAttribute('data-source-line')
    if (line !== null) {
      const lineNo = parseInt(line, 10)
      if (!isNaN(lineNo)) {
        emit('click-line', lineNo)
        return
      }
    }
    el = el.parentElement
  }
}

async function updateContent() {
  const el = previewRef.value
  if (!el) return

  // 1. 保存已渲染的 mermaid 块 DOM（按 mermaid 源码 + 渲染属性为复合 key）
  const renderedCache = new Map<string, string>()
  const oldBlocks = el.querySelectorAll('.mermaid-block')
  oldBlocks.forEach((block) => {
    const b = block as HTMLElement
    const code = b.dataset.mermaidCode || ''
    if (!code.trim()) return
    const container = b.querySelector('.mermaid-svg-container') as HTMLElement | null
    if (!container || !container.querySelector('img')) return
    // 复合 key：代码正文 + render-width + theme，属性变化时 key 不同，不会被缓存误导
    const rw = b.dataset.mermaidRenderWidth || ''
    const theme = b.dataset.mermaidTheme || ''
    const key = `${code}|rw=${rw}|theme=${theme}`
    renderedCache.set(key, container.innerHTML)
  })

  // 2. 更新预览内容（此操作会销毁旧 DOM）
  const ps: ParagraphStyle = {
    fontSize: paraFontSize.value,
    lineHeight: paraLineHeight.value,
    fontWeight: paraFontWeight.value,
    margin: paraMargin.value,
    indent: paraIndent.value,
  }
  try {
    el.innerHTML = await parseMarkdownAsync(props.markdown, props.colors, ps)
  } catch {
    el.innerHTML = `<div style="color:var(--text-muted);padding:40px 20px;text-align:center;font-size:14px">预览渲染失败，请检查数学公式或刷新重试</div>`
    return
  }
  await nextTick()

  // 3. 恢复未变化的已渲染 mermaid 块，避免闪烁
  if (renderedCache.size > 0) {
    const newBlocks = el.querySelectorAll('.mermaid-block')
    newBlocks.forEach((block) => {
      const b = block as HTMLElement
      const code = b.dataset.mermaidCode || ''
      if (!code.trim()) return
      const rw = b.dataset.mermaidRenderWidth || ''
      const theme = b.dataset.mermaidTheme || ''
      const key = `${code}|rw=${rw}|theme=${theme}`
      const cached = renderedCache.get(key)
      if (cached) {
        const container = b.querySelector('.mermaid-svg-container') as HTMLElement | null
        if (container) container.innerHTML = cached
      }
    })
  }

  // 4. 延迟渲染新增/变化的 mermaid 块
  if (mermaidTimer) clearTimeout(mermaidTimer)
  mermaidTimer = setTimeout(async () => {
    await renderAll(el)
  }, 300)
  await nextTick()
}

watch(
  () => props.markdown,
  () => updateContent(),
)
watch(
  () => props.colors,
  () => updateContent(),
  { deep: true },
)
watch(previewRef, () => updateContent())
watch([paraFontSize, paraLineHeight, paraFontWeight, paraMargin], () => updateContent())

function copyRichText() {
  const el = previewRef.value
  if (!el) return
  const html = `<section style="background-color:#fff;color:#333;padding:0">${el.innerHTML}</section>`
  const blob = new Blob([html], { type: 'text/html' })
  const item = new ClipboardItem({
    'text/html': blob,
    'text/plain': new Blob([el.innerText], { type: 'text/plain; charset=utf-8' }),
  })
  navigator.clipboard
    .write([item])
    .then(() => {
      showToast('已复制富文本，可直接粘贴到公众号后台')
    })
    .catch(() => {
      const tmp = document.createElement('div')
      tmp.innerHTML = html
      tmp.style.position = 'fixed'
      tmp.style.left = '-9999px'
      document.body.appendChild(tmp)
      const range = document.createRange()
      range.selectNodeContents(tmp)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.execCommand('copy')
      sel?.removeAllRanges()
      document.body.removeChild(tmp)
      showToast('已复制富文本（降级模式）')
    })
}

function copyHTML() {
  const el = previewRef.value
  if (!el) return
  navigator.clipboard
    .writeText(el.innerHTML)
    .then(() => {
      showToast('已复制 HTML 源码（全部内联样式）')
    })
    .catch(() => {
      const ta = document.createElement('textarea')
      ta.value = el.innerHTML
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showToast('已复制 HTML 源码')
    })
}

async function saveAsImage() {
  const el = previewRef.value
  if (!el || saving.value) return

  saving.value = true

  try {
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      skipFonts: true,
      cacheBust: true,
      backgroundColor: '#ffffff',
      // 文章里有加载不出来的图（404、本地相对路径被 dev server 当 index.html 返回、跨域等）时，
      // 用透明占位顶上、并跳过出错的图，而不是让整张导出失败抛出 [object Event]
      imagePlaceholder:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      onImageErrorHandler: (e: Event | string) => {
        if (typeof e === 'string') return
        const t = e.target as HTMLImageElement | null
        if (t && 'src' in t) {
          t.src =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
        }
      },
      style: {
        padding: '20px 16px 40px',
      },
      filter: (node: HTMLElement) => {
        if (
          node.classList &&
          (node.classList.contains('CodeMirror') || node.classList.contains('CodeMirror-line'))
        )
          return false
        return true
      },
    })

    const dateStr = new Date().toISOString().slice(0, 10)

    // 桌面端（Tauri）：使用原生 save dialog 让用户选择保存路径
    if (isTauri) {
      try {
        const [{ save }, { writeFile }] = await Promise.all([
          import('@tauri-apps/plugin-dialog'),
          import('@tauri-apps/plugin-fs'),
        ])
        const filePath = await save({
          defaultPath: `公众号预览_${dateStr}.png`,
          filters: [{ name: 'PNG图片', extensions: ['png'] }],
        })
        if (!filePath) {
          saving.value = false
          return
        }
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        await writeFile(filePath, bytes)
        showToast('已保存')
        return
      } catch {
        // 降级为浏览器 a.click()
      }
    }

    // 浏览器端：a.click()
    const link = document.createElement('a')
    link.download = `公众号预览_${dateStr}.png`
    link.href = dataUrl
    link.click()
    showToast('图片已保存')
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof Event !== 'undefined' && err instanceof Event
          ? '渲染失败（可能有图片加载不出来）'
          : String(err)
    showToast('生成失败：' + msg)
  } finally {
    saving.value = false
  }
}

function getHTML(): string {
  return previewRef.value?.innerHTML || ''
}

defineExpose({ copyRichText, copyHTML, saveAsImage, getHTML })
</script>

<template>
  <div style="position: relative; height: 100%">
    <div
      ref="scrollContainerRef"
      class="preview-scroll"
      style="
        height: 100%;
        overflow-y: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      "
      @scroll="onScroll"
    >
      <div
        class="phone-frame"
        :style="{
          width: '100%',
          maxWidth: '700px',
          flexShrink: 0,
          background: 'transparent',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
          overflow: 'hidden',
          margin: '0 auto',
        }"
      >
        <div
          ref="previewRef"
          style="
            padding: 18px;
            color: #333;
            font-size: 15px;
            line-height: 1.8;
            word-wrap: break-word;
            overflow-wrap: break-word;
            background-color: transparent;
          "
          @click="onPreviewClick"
        ></div>
      </div>
    </div>
    <Transition name="hint-fade">
      <div
        v-show="hintVisible"
        :style="{
          position: 'absolute',
          top: isMobile ? '0' : undefined,
          bottom: isMobile ? undefined : '0',
          left: '0',
          right: '0',
          padding: '10px 16px',
          background: 'var(--bg-primary)',
          [isMobile ? 'borderBottom' : 'borderTop']: '1px solid var(--border-color)',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }"
      >
        深色模式下，请以微信实际预览结果为准
      </div>
    </Transition>
  </div>
  <Toast :visible="toastVisible" :message="toastMessage" />
</template>

<style scoped>
.preview-scroll::-webkit-scrollbar {
  display: none;
}
.hint-fade-enter-active {
  transition: opacity 0.4s ease;
}
.hint-fade-leave-active {
  transition: opacity 0.6s ease;
}
.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
}
@media (max-width: 767px) {
  .preview-scroll {
    padding: 0;
  }
}
</style>
