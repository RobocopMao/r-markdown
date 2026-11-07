<script setup vapor lang="ts">
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { toPng } from 'html-to-image'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import type { ThemeColors } from '@/composables/useTheme'
import {
  extractXhs,
  buildCover,
  ASPECTS,
  PIXEL_RATIO,
  FONT_STACK,
  CONTENT_SCALE,
  XHS,
  DEFAULT_BRAND,
  type XhsAspect,
} from '@/utils/xhsCards'
import PromptDialog from '@/components/PromptDialog.vue'
import BoardHeader from './BoardHeader.vue'
import { useDarkMode } from '@/composables/useDarkMode'
import { Bolt, Download } from 'lucide-vue-next'

const isTauri = import.meta.env.VITE_TAURI === 'true'
const { isDark } = useDarkMode()

// 图片加载失败时的占位（透明 1px），避免一张坏图把整次渲染拖崩
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// html-to-image 失败常常抛的是一个 Event（图片加载错误），直接 String() 会变 [object Event]
function errText(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof Event !== 'undefined' && e instanceof Event) return '渲染失败（可能有图片加载不出来）'
  return String(e)
}

// 图片加载失败（含 dev server 把缺图当 index.html 返回、跨域等）时不让整张渲染崩，
// 把这张图换成透明占位，渲染照常进行，缺图位置留白。
function onImgError(e: Event | string) {
  if (typeof e === 'string') return
  const t = e.target as HTMLImageElement | null
  if (t && 'src' in t) t.src = TRANSPARENT_PX
}

// 小节标题块：原生 #~#### 渲染成 H1~H4；<p-title> 渲染成带 data-block="ptitle" 的 section
function isHeadingBlock(el: HTMLElement): boolean {
  return /^H[1-6]$/.test(el.tagName) || el.dataset?.block === 'ptitle'
}

const props = defineProps<{
  markdown: string
  colors: ThemeColors
}>()

const emit = defineEmits<{ close: []; toast: [msg: string] }>()

interface Card {
  id: string
  label: string
  kind: 'html' | 'image'
  html?: string // 首图：HTML，导出时 toPng
  src?: string // 内容图：已经切好的 PNG dataURL
}

const aspect = ref<XhsAspect>('3:4')
const cards = ref<Card[]>([])
const building = ref(false)
const busy = ref(false)
const status = ref('')

// 面板是 v-if 挂载的，每次打开都是新实例 —— 「打开即生成」等价于 onMounted
onMounted(() => {
  generate()
})

// 品牌名设置
const BRAND_KEY = 'r-markdown-xhs-brand'
const brand = ref(localStorage.getItem(BRAND_KEY) || DEFAULT_BRAND)
const showBrandInput = ref(false)

function openBrandSettings() {
  showBrandInput.value = true
}

function onBrandSave(val: string) {
  if (val) {
    brand.value = val
    localStorage.setItem(BRAND_KEY, val)
  } else {
    brand.value = DEFAULT_BRAND
    localStorage.removeItem(BRAND_KEY)
  }
  generate()
}

// 首图卡的外层 DOM（导出时读它第一个子元素，即卡片 section）
let cardEls: (HTMLElement | null)[] = []
function setRef(el: Element | null, idx: number) {
  cardEls[idx] = el as HTMLElement | null
}

/** 等容器里图片都加载完（带 4s 兜底），否则渲染会拿到错的高度。 */
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

/**
 * 内容图：和「保存图片」一样把正文渲染出来，但用一个卡片大小的取景窗，
 * 每次把正文上移一屏、单独导出一张（每张都小、稳，不会因整篇太长或坏图崩掉）。
 * 底部留一条 DOM 页脚带（@品牌 + 页码），盖住被切断的半行。
 */
async function renderSlices(
  contentHtml: string,
  brand: string,
  colors: ThemeColors,
): Promise<string[]> {
  // 在「放大的逻辑画布」上渲染正文：边距/页脚等比放大、正文字号不变 → 输出（仍 1080 宽）
  // 里正文相对更小、更密，而边距和页脚跟首图保持一致。
  const base = ASPECTS[aspect.value]
  const NATIVE_W = base.w * PIXEL_RATIO // 输出宽度（1080）
  // 关键：用「实时预览」的内容宽度当基准，让内容图和「保存图片」共用同一套排版比例
  // （字号、换行、左右边距都一致）。CONTENT_SCALE 是在此基础上的密度倍数（1 = 完全对齐）。
  const previewInner = document.querySelector('.phone-frame > div') as HTMLElement | null
  const refW = previewInner && previewInner.clientWidth > 80 ? previewInner.clientWidth : 450
  const w = Math.round(refW * CONTENT_SCALE)
  const h = Math.round((w * base.h) / base.w) // 保持比例（3:4 / 1:1）
  const ratio = NATIVE_W / w // 缩放到 1080 宽输出
  // 正文与「保存图片」一致：白底 + 同样的左右/上边距 + 同样的基础字号/行距。
  const bg = isDark.value ? '#1a1a1a' : '#ffffff'
  const padX = 16 // 对齐「保存图片」的左右边距
  const padTop = 20 // 对齐「保存图片」的上边距
  const footerBand = 44
  const fBrand = 14
  const fPage = 13
  const dash = '1.5'

  // 隐藏器：0×0 + overflow 裁切，把取景窗藏起来但保留布局尺寸。
  // 注意不能用 position:fixed;left:-99999px 来藏取景窗——那样在 html-to-image 生成的
  // SVG foreignObject 里会被定位到画布外，导出就是空白。取景窗本身必须是 relative。
  const hider = document.createElement('div')
  hider.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;z-index:-1'

  // 取景窗：定宽定高 + overflow 裁切（relative，作为内部绝对定位正文的包含块）
  const frame = document.createElement('div')
  frame.style.cssText =
    `position:relative;width:${w}px;height:${h}px;overflow:hidden;` +
    `box-sizing:border-box;background:${bg};font-family:${FONT_STACK}`

  // 正文层：绝对定位，靠改 top 往上滚
  const wrap = document.createElement('div')
  // 基础字号/行距/颜色对齐 Preview 的 previewRef（15px / 1.8 / #333），
  // 这样列表、零散文本等没单独设字号的内容也跟「保存图片」一致。
  wrap.style.cssText =
    `position:absolute;left:0;top:0;width:${w}px;box-sizing:border-box;` +
    `padding:${padTop}px ${padX}px 0;font-size:15px;line-height:1.8;color:rgb(51,51,51)`
  wrap.innerHTML = contentHtml

  // 页脚带：整条不透明底色，盖住正文被切断处；内部虚线 + @品牌 + 页码
  const footer = document.createElement('div')
  footer.style.cssText =
    `position:absolute;left:0;right:0;bottom:0;height:${footerBand}px;background:${bg};` +
    `box-sizing:border-box;padding:0 ${padX}px;z-index:2`
  const inner = document.createElement('div')
  inner.style.cssText =
    `height:100%;display:flex;align-items:center;justify-content:space-between;` +
    `border-top:${dash}px dashed ${XHS.dash}`
  const brandEl = document.createElement('span')
  brandEl.style.cssText = `font-size:${fBrand}px;color:${colors.dark};font-weight:800`
  brandEl.textContent = '@' + brand
  const pageEl = document.createElement('span')
  pageEl.style.cssText = `font-size:${fPage}px;color:${XHS.inkFaint};font-weight:800;letter-spacing:0.5px`
  inner.append(brandEl, pageEl)
  footer.append(inner)

  frame.append(wrap, footer)
  hider.appendChild(frame)
  document.body.appendChild(hider)
  await waitImages(frame)

  // 按「块」分页：parseMarkdown 把每段 / 标题 / 引用 / 图片都包成顶层块。
  // 每页放整数个块、块绝不跨页；把不属于本页的块设成 visibility:hidden
  // （占位不变、偏移稳定，但不显示），这样下一块不会从底部露出来 → 不切断、不重复、不丢。
  const topInset = padTop // 每页顶部留白
  const budget = h - footerBand - topInset // 每页可用正文高度（页脚以上、扣掉顶部留白）
  const blocks = Array.from(wrap.children) as HTMLElement[]

  // 把块连续切成若干页 [startIdx, endIdx)
  const pages: { startIdx: number; endIdx: number; top: number }[] = []
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
    // 孤儿标题：本页最后一个块是小节标题、且本页不止它一个 → 让标题跟着正文挪到下一页
    while (j - k > 1 && isHeadingBlock(blocks[j - 1])) j--
    pages.push({ startIdx: k, endIdx: j, top: pageTop })
    k = j
  }
  if (!pages.length) pages.push({ startIdx: 0, endIdx: 0, top: 0 })

  const n = pages.length
  const slices: string[] = []
  try {
    for (let i = 0; i < n; i++) {
      const { startIdx, endIdx, top } = pages[i]
      blocks.forEach((b, idx) => {
        b.style.visibility = idx >= startIdx && idx < endIdx ? 'visible' : 'hidden'
      })
      wrap.style.top = `${topInset - top}px`
      pageEl.textContent = `${i + 1} / ${n}`
      slices.push(
        await toPng(frame, {
          pixelRatio: ratio,
          width: w,
          height: h,
          backgroundColor: bg,
          skipFonts: true,
          imagePlaceholder: TRANSPARENT_PX,
          onImageErrorHandler: onImgError,
        }),
      )
    }
  } finally {
    document.body.removeChild(hider)
  }
  return slices
}

// 每次生成拿一个序号：生成是异步且耗时的（几十张图），期间可能又被触发一次
// （切比例、切深浅色），旧的那次跑完不能把新结果盖掉。
let genToken = 0

async function generate() {
  const token = ++genToken
  building.value = true
  status.value = ''
  try {
    const { meta, contentMd } = extractXhs(props.markdown)
    // 优先使用用户设置的品牌名
    meta.brand = brand.value || DEFAULT_BRAND
    const cover: Card = {
      id: 'cover',
      label: '首图（大字报）',
      kind: 'html',
      html: buildCover(meta, aspect.value, props.colors, isDark.value),
    }
    const contentHtml = await parseMarkdownAsync(contentMd, props.colors)
    const slices = contentHtml.trim()
      ? await renderSlices(contentHtml, meta.brand, props.colors)
      : []

    if (token !== genToken) return // 已经有更新的一次生成在跑，丢掉这次结果
    cardEls = []
    cards.value = [
      cover,
      ...slices.map((src, i) => ({
        id: 'p' + i,
        label: `内容 ${i + 1}`,
        kind: 'image' as const,
        src,
      })),
    ]
    await nextTick()
  } catch (e) {
    if (token === genToken) status.value = '生成失败：' + errText(e)
  } finally {
    if (token === genToken) building.value = false
  }
}

/**
 * 深浅色切换后必须重新生成：
 * 首图是 buildCover(...isDark) 拼出来的 HTML，内容图是已经烘焙好背景色（深色 #1a1a1a /
 * 亮色 #ffffff）与文字色的 PNG dataURL —— 两者都把「生成那一刻」的主题固化在里面了，
 * 只靠 CSS 变量切不过来，不重新生成就会一直停在旧主题，非得刷新页面才变。
 * 加一点防抖：连点主题切换时不至于每次点击都起一轮生成。
 */
let regenTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRegen() {
  if (regenTimer) clearTimeout(regenTimer)
  regenTimer = setTimeout(() => {
    regenTimer = null
    generate()
  }, 150)
}

// 深浅色同样烘焙在卡片里（首图 HTML 的配色、内容图 PNG 的背景与文字色），必须重新生成。
// 主题色（accent）也是一样的道理——徽章、波浪线、页码高亮都用它。
watch(isDark, scheduleRegen)
watch(() => props.colors.accent, scheduleRegen)

async function cardDataUrl(idx: number): Promise<string> {
  const card = cards.value[idx]
  if (card.kind === 'image') return card.src as string
  const node = cardEls[idx]?.firstElementChild as HTMLElement | undefined
  if (!node) throw new Error('卡片节点丢失')
  const { w, h } = ASPECTS[aspect.value]
  return toPng(node, {
    pixelRatio: PIXEL_RATIO,
    width: w,
    height: h,
    backgroundColor: isDark.value ? XHS.dark.bg : XHS.bg,
    skipFonts: true,
    imagePlaceholder: TRANSPARENT_PX,
    onImageErrorHandler: onImgError,
  })
}

function fileName(idx: number): string {
  const date = new Date().toISOString().slice(0, 10)
  const tag = idx === 0 ? '00_cover' : String(idx).padStart(2, '0')
  return `xhs_${date}_${tag}.png`
}

async function triggerDownload(dataUrl: string, name: string): Promise<boolean> {
  // 桌面端（Tauri）：使用原生 save dialog
  if (isTauri) {
    try {
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ])
      const filePath = await save({
        defaultPath: name,
        filters: [{ name: 'PNG图片', extensions: ['png'] }],
      })
      if (!filePath) return false
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      await writeFile(filePath, bytes)
      return true
    } catch (e) {
      // atob / writeFile 失败时降级为浏览器 a.click()
      console.error('[XhsExporter] 桌面端保存失败，降级为浏览器下载:', e)
    }
  }

  // 浏览器端
  const a = document.createElement('a')
  a.download = name
  a.href = dataUrl
  a.click()
  return true
}

async function downloadOne(idx: number) {
  if (busy.value) return
  busy.value = true
  try {
    const ok = await triggerDownload(await cardDataUrl(idx), fileName(idx))
    if (ok) emit('toast', '已保存')
  } catch (e) {
    status.value = '导出失败：' + errText(e)
  } finally {
    busy.value = false
  }
}

async function downloadAll() {
  if (busy.value || !cards.value.length) return
  busy.value = true
  try {
    // 桌面端（Tauri）：JSZip 打包 → 单次原生 save dialog
    if (isTauri) {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (let i = 0; i < cards.value.length; i++) {
        status.value = `打包中 ${i + 1}/${cards.value.length}…`
        const dataUrl = await cardDataUrl(i)
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
        zip.file(fileName(i), base64, { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ])
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const filePath = await save({
        defaultPath: `小红书图片_${dateStr}.zip`,
        filters: [{ name: 'ZIP压缩包', extensions: ['zip'] }],
      })
      if (!filePath) {
        status.value = '已取消'
        return
      }
      const arrayBuffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      await writeFile(filePath, bytes)
      status.value = `已导出 ${cards.value.length} 张 → ZIP`
      return
    }

    // 浏览器端：逐张 a.click() 下载
    let done = 0
    for (let i = 0; i < cards.value.length; i++) {
      status.value = `导出中 ${i + 1}/${cards.value.length}…`
      const ok = await triggerDownload(await cardDataUrl(i), fileName(i))
      if (ok) done++
      await new Promise((r) => setTimeout(r, 180))
    }
    if (done > 0) status.value = `已导出 ${done} 张`
  } catch (e) {
    status.value = '导出失败：' + errText(e)
  } finally {
    busy.value = false
  }
}

function setAspect(a: XhsAspect) {
  if (aspect.value === a) return
  aspect.value = a
  generate()
}

/**
 * 首图是固定 360px 宽的 HTML（导出按 360×480 的逻辑尺寸渲染），
 * 而卡片列宽会随窗口变化，所以这里按容器实际宽度等比缩放它——
 * 缩放只加在外层容器上，导出读的是里面的第一个子元素，不受影响。
 */
const COVER_W = 360
const coverBoxRef = ref<HTMLElement | null>(null)
const coverScale = ref(1)
let coverObserver: ResizeObserver | null = null

function measureCover() {
  const el = coverBoxRef.value
  if (!el || !el.clientWidth) return
  coverScale.value = el.clientWidth / COVER_W
}

/** 首图容器是 v-for 里的元素，用函数式 ref 拿到真实节点（模板 ref 在 v-for 里会变成数组） */
function setCoverBox(el: Element | null) {
  coverBoxRef.value = el as HTMLElement | null
  if (!el) return
  measureCover()
  if (typeof ResizeObserver !== 'undefined') {
    coverObserver?.disconnect()
    coverObserver = new ResizeObserver(() => measureCover())
    coverObserver.observe(el as HTMLElement)
  }
}

onBeforeUnmount(() => {
  coverObserver?.disconnect()
  coverObserver = null
  if (regenTimer) {
    clearTimeout(regenTimer)
    regenTimer = null
  }
  genToken += 1 // 让在途的生成结果作废，别再往已卸载的组件里写
})

/** 头部副标题：生成中显示进度，生成完显示张数，失败显示错误 */
const subtitleText = computed(() => {
  if (building.value) return '正在生成…'
  if (status.value) return status.value
  if (!cards.value.length) return '正文为空，没有可导出的内容'
  return `共 ${cards.value.length} 张，点单张的「下载」单独保存`
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-4">
      <BoardHeader title="小红书图" :description="subtitleText" @close="emit('close')">
        <!-- 标签页：比例（与其余面板的标签页同一套 .board-tab 样式） -->
        <template #tabs>
          <button class="board-tab" :class="{ active: aspect === '3:4' }" @click="setAspect('3:4')">
            3:4 竖版
          </button>
          <button class="board-tab" :class="{ active: aspect === '1:1' }" @click="setAspect('1:1')">
            1:1 方版
          </button>
        </template>

        <template #actions>
          <span v-if="isDark" class="text-[12px] text-[var(--text-secondary)]">
            建议切换到亮色模式导出
          </span>
          <button
            class="gallery-tool-btn"
            title="设置品牌名"
            aria-label="设置品牌名"
            @click="openBrandSettings"
          >
            <Bolt :size="16" />
          </button>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busy || building || !cards.length"
            @click="downloadAll"
          >
            <Download :size="14" />
            下载全部（{{ cards.length }}）
          </button>
        </template>
      </BoardHeader>

      <!-- 内容区 -->
      <!-- 只有第一次生成才占位；重新生成（切比例 / 切深浅色）时保留旧卡片，
           否则整块会闪成「生成中…」，而重新渲染要几十秒 -->
      <p
        v-if="building && !cards.length"
        class="px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
      >
        生成中…
      </p>
      <!-- 卡片固定 360px：与原来弹窗里的预览宽度一致，首图正好按 1:1 显示，不缩放、不裁切 -->
      <!-- 卡片沿用原弹窗里的样式：图本身带圆角和投影，标题与「下载」在图片下方 -->
      <div v-else-if="cards.length" class="flex flex-wrap justify-center gap-5">
        <div v-for="(c, idx) in cards" :key="c.id" class="flex w-[360px] max-w-full flex-col gap-2">
          <div
            v-if="c.kind === 'html'"
            :ref="(el) => setCoverBox(el as Element | null)"
            class="xhs-shot relative w-full overflow-hidden rounded-[10px] leading-none"
            :style="{ aspectRatio: aspect === '3:4' ? '3 / 4' : '1 / 1' }"
          >
            <div
              :ref="(el) => setRef(el as Element | null, idx)"
              class="absolute left-0 top-0 origin-top-left leading-none"
              :style="{
                width: COVER_W + 'px',
                height: (aspect === '3:4' ? 480 : 360) + 'px',
                transform: `scale(${coverScale})`,
              }"
              v-html="c.html"
            ></div>
          </div>
          <img
            v-else
            class="xhs-shot block h-auto w-full overflow-hidden rounded-[10px] leading-none"
            :src="c.src"
            alt=""
          />
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-[#8a8175] dark:text-[#888]">{{ c.label }}</span>
            <button
              class="cursor-pointer rounded-lg border border-[var(--accent)] bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a]"
              :disabled="busy || building"
              @click="downloadOne(idx)"
            >
              下载
            </button>
          </div>
        </div>
      </div>
      <div
        v-else
        class="rounded-xl border border-[var(--border-color)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
      >
        正文为空，没有可导出的内容
      </div>
    </div>

    <!-- 品牌名设置弹窗 -->
    <PromptDialog
      v-model:visible="showBrandInput"
      :value="brand"
      title="设置品牌名"
      description="设置后将显示在小红书图片底部"
      placeholder="请输入品牌名"
      @save="onBrandSave"
    />
  </div>
</template>

<style scoped>
/* 卡片预览的投影。深色模式下卡片底（XHS.dark.bg #1F1A17）和面板底（#1a1a1a）
   几乎同色，只靠投影根本压不出边界，所以换成「一圈浅色描边 + 更深的投影」把卡片框出来。
   注意导出时 toPng 只截卡片内部节点，这些样式只影响屏幕预览，不会进图片。 */
.xhs-shot {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

[data-theme='dark'] .xhs-shot {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.22),
    0 8px 24px rgba(0, 0, 0, 0.55);
}

.gallery-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s,
    border-color 0.2s;
}

.gallery-tool-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
</style>
