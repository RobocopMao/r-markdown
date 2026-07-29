<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import { useTheme } from '@/composables/useTheme'
import { useDarkMode } from '@/composables/useDarkMode'
import DarkModeToggle from '@/components/DarkModeToggle.vue'
import SiteLogo from '@/components/SiteLogo.vue'
import NavCapsule from '@/components/NavCapsule.vue'
import MobileNavMenu from '@/components/mobile/MobileNavMenu.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import type { NavItem } from '@/components/NavCapsule.vue'
import type { ThemeColors } from '@/composables/useTheme'
import {
  FileCode2,
  ClipboardPaste,
  Palette,
  Puzzle,
  SlidersHorizontal,
  ImageDown,
  HardDrive,
  Braces,
  BookOpenText,
  NotebookPen,
  ArrowLeftRight,
  Monitor,
  LayoutGrid,
  Puzzle as PuzzleIcon,
  Download,
  ArrowRight,
} from 'lucide-vue-next'

const { mode: darkMode, setMode: setDarkMode } = useDarkMode()
const { colors } = useTheme()

const visible = ref(false)
const featuresVisible = ref(false)

// ── 预览卡片 3D 倾斜 ──
const previewCardRef = ref<HTMLElement>()
const cardRotate = ref({ x: 0, y: 0 })
const cardGlow = ref({ x: 50, y: 50, opacity: 0 })
const cardSmooth = ref(true) // 进入和首次移动用过渡，之后去掉
let cardRaf = 0

function onCardMouseMove(e: MouseEvent) {
  const card = previewCardRef.value
  if (!card) return
  const rect = card.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const tiltX = (y - 0.5) * -16
  const tiltY = (x - 0.5) * 16
  cardRotate.value = { x: tiltX, y: tiltY }
  cardGlow.value = { x: x * 100, y: y * 100, opacity: 1 }
  // 首次移动后关闭过渡，后续实时跟随
  if (cardSmooth.value) cardSmooth.value = false
}

function onCardMouseEnter() {
  cardSmooth.value = true
}

function onCardMouseLeave() {
  if (cardRaf) cancelAnimationFrame(cardRaf)
  cardRaf = requestAnimationFrame(() => {
    cardRotate.value = { x: 0, y: 0 }
    cardGlow.value = { ...cardGlow.value, opacity: 0 }
    cardSmooth.value = true
  })
}

// ── 打字动画 ──
const demoMd = `<title badge="成长感悟" subtitle="不是所有关系都值得维护" chips="成熟|减法|社交">三十几岁以后，我学会了一件事</title>

我慢慢学会了一件事：
不是所有关系都值得你拼命维护。
那些让你觉得 ::累:: 的社交，其实早该放下了。
==真正的成熟，是懂得给自己做减法。==`

const typedMd = ref('')
const typingDone = ref(false)
const previewRef = ref<HTMLElement>()
let typingTimer: ReturnType<typeof setTimeout> | null = null
let charIndex = 0
let typingPaused = false

const demoColors = computed<ThemeColors>(() => ({
  accent: colors.value.accent,
  dark: colors.value.dark,
  light: colors.value.light,
  border: colors.value.border,
  rgb: colors.value.rgb,
}))

function typeNextChar() {
  if (typingPaused) return
  if (charIndex < demoMd.length) {
    typedMd.value += demoMd[charIndex]
    charIndex++
    // 换行稍慢，模拟真实输入节奏
    const delay = demoMd[charIndex - 1] === '\n' ? 80 : 30
    typingTimer = setTimeout(typeNextChar, delay)
  } else {
    typingDone.value = true
    // 打完后停顿，然后重新开始
    typingTimer = setTimeout(() => {
      if (typingPaused) {
        typingTimer = null
        return
      }
      typedMd.value = ''
      charIndex = 0
      typingDone.value = false
      typingTimer = setTimeout(typeNextChar, 800)
    }, 3000)
  }
}

async function updatePreview() {
  if (previewRef.value) {
    previewRef.value.innerHTML = await parseMarkdownAsync(typedMd.value, demoColors.value)
  }
}

// 监听 typedMd 变化，实时更新右侧预览
watch(typedMd, () => {
  updatePreview()
})

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true
  })
  initCloudCanvas()
  preloadEditor()

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          featuresVisible.value = true
          observer.disconnect()
        }
      })
    },
    { threshold: 0.1 },
  )

  setTimeout(() => {
    const el = document.getElementById('features')
    if (el) observer.observe(el)
  }, 100)

  // 预览区域可见时启动打字动画
  const previewObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && charIndex === 0) {
          typingTimer = setTimeout(typeNextChar, 600)
          previewObserver.disconnect()
        }
      })
    },
    { threshold: 0.2 },
  )
  setTimeout(() => {
    const el = document.getElementById('demo-preview')
    if (el) previewObserver.observe(el)
  }, 100)

  // 预览卡片滚出可视区域时暂停打字，滚回来时恢复
  const typingPauseObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (charIndex === 0) return // 还没开始打字，不管
        if (entry.isIntersecting) {
          // 滚回来了，恢复打字
          if (typingPaused) {
            typingPaused = false
            if (!typingTimer) typingTimer = setTimeout(typeNextChar, 100)
          }
        } else {
          // 滚出去了，暂停打字
          typingPaused = true
          if (typingTimer) {
            clearTimeout(typingTimer)
            typingTimer = null
          }
        }
      })
    },
    { threshold: 0 },
  )
  setTimeout(() => {
    const el = document.getElementById('demo-preview')
    if (el) typingPauseObserver.observe(el)
  }, 100)
})

onBeforeUnmount(() => {
  if (typingTimer) clearTimeout(typingTimer)
  cloudCleanup?.()
})

// ── 预加载编辑器页面 ──
let editorPreloaded = false
function preloadEditor() {
  if (editorPreloaded) return
  editorPreloaded = true
  import('../editor/EditorPage.vue')
}

const scrollToFeatures = () => {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
}

const scrollToDownload = () => {
  document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })
}

// ── Canvas 云朵光晕 ──
const cloudCanvasRef = ref<HTMLCanvasElement | null>(null)
let cloudRaf = 0
let cloudCleanup: (() => void) | null = null

interface CloudOrb {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  color: string
}

const accentRgb = computed(() => colors.value.rgb)
const lightenRgb = computed(() => {
  const [r, g, b] = colors.value.rgb.split(',').map(Number)
  return `${Math.round(r + (255 - r) * 0.35)},${Math.round(g + (255 - g) * 0.35)},${Math.round(b + (255 - b) * 0.35)}`
})

function getCloudColors(isDark: boolean): string[] {
  const accent = accentRgb.value
  const lighten = lightenRgb.value
  return isDark
    ? [
        `rgba(${accent},0.18)`,
        `rgba(${lighten},0.15)`,
        `rgba(${accent},0.12)`,
        `rgba(${lighten},0.10)`,
      ]
    : [
        `rgba(${accent},0.22)`,
        `rgba(${lighten},0.18)`,
        `rgba(${accent},0.15)`,
        `rgba(${lighten},0.12)`,
      ]
}

function initCloudCanvas() {
  const rawCanvas = cloudCanvasRef.value
  if (!rawCanvas) return
  const rawCtx = rawCanvas.getContext('2d')
  if (!rawCtx) return
  // 闭包内使用非空引用，避免 TS 严格模式报错
  const canvas = rawCanvas
  const ctx = rawCtx

  const CANVAS_H = 1320 // 固定高度，覆盖 header + hero 区域

  function resize() {
    const dpr = window.devicePixelRatio || 1
    const w = canvas.parentElement?.getBoundingClientRect().width || window.innerWidth
    canvas.width = w * dpr
    canvas.height = CANVAS_H * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = CANVAS_H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const W = () => canvas.width / (window.devicePixelRatio || 1)
  const H = () => CANVAS_H

  const colors = () => getCloudColors(darkMode.value === 'dark')

  // 简易多层 sin 噪声 —— 每次页面加载种子不同，轨迹就不同
  const seed = Math.random() * 1000
  function noise(t: number, i: number, axis: 'x' | 'y') {
    const s = axis === 'x' ? seed : seed + 500
    return (
      Math.sin(t * 0.0007 + i * 1.7 + s) * 0.4 +
      Math.sin(t * 0.0013 + i * 2.3 + s * 0.7) * 0.3 +
      Math.sin(t * 0.0003 + i * 3.1 + s * 1.3) * 0.3
    )
  }

  // 每次随机初始位置
  const orbs: CloudOrb[] = Array.from({ length: 4 }, (_, i) => ({
    x: 0.15 + Math.random() * 0.7,
    y: 0.1 + Math.random() * 0.55,
    r: 240 + Math.random() * 80,
    vx: (Math.random() - 0.5) * 0.12,
    vy: (Math.random() - 0.5) * 0.08,
    color: '',
  }))

  let t = 0
  function draw() {
    const w = W(),
      h = H()
    if (w === 0 || h === 0) {
      cloudRaf = requestAnimationFrame(draw)
      return
    }

    ctx.clearRect(0, 0, w, h)
    const c = colors()

    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]
      // 噪声驱动漂移
      o.x += noise(t, i, 'x') * 0.0004
      o.y += noise(t, i, 'y') * 0.0003
      // 边界回弹（底部保留 250px 不进入）
      const yMax = (CANVAS_H - 250) / CANVAS_H
      if (o.x < -0.15) o.x = -0.15
      if (o.x > 1.15) o.x = 1.15
      if (o.y < -0.15) o.y = -0.15
      if (o.y > yMax) o.y = yMax

      const cx = o.x * w,
        cy = o.y * h
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r)
      grad.addColorStop(0, c[i])
      grad.addColorStop(0.6, c[i].replace(/[\d.]+\)$/, '0.04)'))
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }

    t++
    cloudRaf = requestAnimationFrame(draw)
  }
  draw()

  // 存储清理函数
  cloudCleanup = () => {
    cancelAnimationFrame(cloudRaf)
    window.removeEventListener('resize', resize)
  }
}

// ── 导航栏数据 ──
const homeNavItems: NavItem[] = [
  {
    key: 'features',
    label: '功能',
    icon: LayoutGrid,
  },
  {
    key: 'components',
    label: '扩展组件',
    icon: PuzzleIcon,
    to: '/components',
  },
  {
    key: 'download',
    label: '客户端下载',
    icon: Download,
  },
]

// ── 左侧语法高亮 ──
function renderMdLine(line: string): Array<{ type: string; text: string }> {
  const segments: Array<{ type: string; text: string }> = []
  // frontmatter key: value
  const fmMatch = line.match(/^(\w+):\s*(.*)/)
  if (fmMatch && !line.startsWith('---')) {
    segments.push({ type: 'key', text: fmMatch[1] + ': ' })
    segments.push({ type: 'normal', text: fmMatch[2] })
    return segments
  }
  if (line.trim() === '---') {
    segments.push({ type: 'accent', text: line })
    return segments
  }
  // bold **text**
  let remaining = line
  const boldRe = /\*\*(.+?)\*\*/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = boldRe.exec(remaining)) !== null) {
    if (m.index > lastIdx)
      segments.push({ type: 'normal', text: remaining.slice(lastIdx, m.index) })
    segments.push({ type: 'bold', text: m[1] })
    lastIdx = m.index + m[0].length
  }
  if (segments.length > 0) {
    if (lastIdx < remaining.length)
      segments.push({ type: 'normal', text: remaining.slice(lastIdx) })
    return segments
  }
  // ::accent:: and ==gradient==
  if (line.includes('::') || line.includes('==')) {
    const parts = line.split(/(::.*?::|==.*?==)/g)
    for (const p of parts) {
      if (p.startsWith('::') && p.endsWith('::')) {
        segments.push({ type: 'accentText', text: p })
      } else if (p.startsWith('==') && p.endsWith('==')) {
        segments.push({ type: 'gradient', text: p })
      } else {
        segments.push({ type: 'normal', text: p })
      }
    }
    return segments
  }
  segments.push({ type: 'normal', text: line })
  return segments
}

const features = [
  {
    icon: FileCode2,
    title: 'Markdown 实时编辑',
    desc: '左侧编写 Markdown，右侧即时预览公众号排版效果，所见即所得。',
  },
  {
    icon: ClipboardPaste,
    title: '一键复制到公众号',
    desc: '富文本一键复制，直接粘贴到公众号编辑器，排版零损耗。',
  },
  {
    icon: Palette,
    title: '多主题切换',
    desc: '内置多套配色主题，支持自定义强调色，打造专属公众号风格。',
  },
  {
    icon: Puzzle,
    title: '自研扩展组件',
    desc: '标题卡片、步骤流、时间线、对比卡片、行动号召、轮播图等自研扩展组件。',
  },
  {
    icon: SlidersHorizontal,
    title: '属性编辑器',
    desc: '选中扩展组件即可通过侧栏表单编辑所有属性，实时预览，所见即所得。',
  },
  {
    icon: ImageDown,
    title: '保存为图片',
    desc: '一键将排版好的文章导出为高清长图、小红书图，方便分享到朋友圈或其他平台。',
  },
  {
    icon: HardDrive,
    title: '本地存储',
    desc: '所有内容自动保存在浏览器本地，无需登录注册，打开即用。',
  },
  {
    icon: Braces,
    title: '复制 HTML',
    desc: '一键复制排版后的 HTML 源码，方便嵌入网页、博客或其他平台使用。',
  },
  {
    icon: BookOpenText,
    title: '语法示例',
    desc: '语法简单易上手，编辑器内置示例一键加载，边写边学零门槛。',
  },
  {
    icon: NotebookPen,
    title: '草稿箱',
    desc: '支持多草稿管理，随时保存、加载和删除，灵感不丢失。',
  },
  {
    icon: ArrowLeftRight,
    title: '导入 & 导出',
    desc: '支持导入 .md / .txt / .docx 文件，导出 Markdown 格式，跨平台无缝衔接。',
  },
  {
    icon: Monitor,
    title: '桌面客户端',
    desc: '支持 macOS 和 Windows，独立窗口沉浸写作，本地文件管理更便捷。',
  },
]
</script>

<template>
  <div
    class="home relative"
    :class="{ 'opacity-100 translate-y-0': visible, 'opacity-0 translate-y-3': !visible }"
  >
    <!-- Cloud canvas – spans header + hero for seamless transition -->
    <canvas
      ref="cloudCanvasRef"
      class="absolute top-0 left-0 w-full pointer-events-none"
      style="z-index: 0; height: 1320px"
    ></canvas>

    <!-- Header -->
    <header class="header-blur sticky top-0 z-50 backdrop-blur-xl">
      <div class="mx-auto max-w-[1100px] flex items-center gap-1.5 px-4 sm:px-8 py-3.5">
        <SiteLogo />
        <NavCapsule
          :items="homeNavItems"
          @click="
            (key: string) => {
              if (key === 'features') scrollToFeatures()
              else if (key === 'components') $router.push('/components')
              else if (key === 'download') scrollToDownload()
            }
          "
        />
        <MobileNavMenu
          :items="homeNavItems"
          @click="
            (key: string) => {
              if (key === 'features') scrollToFeatures()
              else if (key === 'components') $router.push('/components')
              else if (key === 'download') scrollToDownload()
            }
          "
          class="ml-auto sm:ml-0"
        />
        <DarkModeToggle :mode="darkMode" @select="setDarkMode" class="shrink-0" />
      </div>
    </header>

    <!-- Hero -->
    <section
      class="hero-section relative px-4 sm:px-8 pt-16 sm:pt-[100px] pb-12 sm:pb-20 overflow-hidden"
    >
      <div class="mx-auto max-w-[1100px] relative" style="z-index: 1">
        <h1
          class="hero-title text-[clamp(36px,8vw,92px)] font-black leading-[1.1] tracking-[-2px] text-[#111] m-0 mb-6 sm:mb-8"
        >
          写 Markdown，<br />
          发<span class="text-[var(--accent)]">公众号</span>。
        </h1>
        <p
          class="hero-subtitle text-lg sm:text-2xl font-semibold text-black/80 m-0 mb-4 sm:mb-5 tracking-tight"
        >
          R-Markdown — 一款简洁的公众号 Markdown 扩展排版工具
        </p>
        <p class="hero-desc text-base sm:text-[19px] leading-relaxed text-black/[0.55] m-0">
          左侧写 Markdown，右侧实时预览排版效果，<br class="hidden sm:block" />
          一键复制粘贴到公众号编辑器，告别繁琐排版。<br class="hidden sm:block" />
          <span class="text-[var(--accent)]">为你，也为每一个认真写内容的人。</span>
        </p>
        <router-link
          to="/editor"
          class="cta-btn inline-flex items-center gap-2 mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 bg-[var(--accent)] text-white text-base sm:text-lg font-semibold rounded-xl no-underline transition-all hover:bg-[var(--accent-dark)] hover:-translate-y-px active:scale-[0.97]"
          @mouseenter="preloadEditor"
        >
          <ArrowRight :size="18" class="cta-arrow" />
          打开编辑器
        </router-link>
        <p class="hero-hint mt-3 sm:mt-4 ml-4 text-[13px] sm:text-[15px] text-black/[0.55]">
          开源免费，点击即用
        </p>
      </div>
    </section>

    <!-- Preview -->
    <section id="demo-preview" class="px-4 sm:px-8 pb-12 sm:pb-20">
      <div class="mx-auto max-w-[1100px]">
        <div
          ref="previewCardRef"
          class="preview-card relative rounded-2xl border border-black/[0.06] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.08)] overflow-hidden"
          style="transform-style: preserve-3d; perspective: 1000px; will-change: transform"
          :style="{
            transform: `rotateX(${cardRotate.x}deg) rotateY(${cardRotate.y}deg) scale(${cardRotate.x || cardRotate.y ? 1.02 : 1})`,
            transition: cardSmooth ? 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          }"
          @mouseenter="onCardMouseEnter"
          @mousemove="onCardMouseMove"
          @mouseleave="onCardMouseLeave"
        >
          <!-- Mouse-follow glow -->
          <div
            class="pointer-events-none absolute inset-0 z-50 transition-opacity duration-300"
            :style="{
              background: `radial-gradient(circle 300px at ${cardGlow.x}% ${cardGlow.y}%, rgba(${accentRgb},0.12), transparent)`,
              opacity: cardGlow.opacity,
            }"
          ></div>
          <!-- Title bar -->
          <div
            class="preview-titlebar hidden sm:flex items-center gap-2 px-5 py-3 bg-[#f5f5f7] border-b border-black/[0.06]"
          >
            <span class="w-3 h-3 rounded-full bg-[#ff5f57]"></span>
            <span class="w-3 h-3 rounded-full bg-[#febc2e]"></span>
            <span class="w-3 h-3 rounded-full bg-[#28c840]"></span>
            <span class="ml-3 text-[13px] text-[#999] font-medium">R-Markdown Editor</span>
          </div>
          <!-- Editor body -->
          <div class="preview-body flex flex-col sm:flex-row h-auto sm:h-[530px]">
            <!-- Left: Markdown source (typing animation) -->
            <div
              class="preview-editor flex-[5] sm:border-r border-b sm:border-b-0 border-black/[0.06] bg-[#fafafa] p-4 sm:p-8 font-mono text-[13px] sm:text-[15px] leading-[1.9] text-[#444] overflow-hidden"
            >
              <div class="text-[#999] text-[12px] mb-3 select-none">Markdown</div>
              <pre
                class="whitespace-pre-wrap break-words m-0 font-inherit text-inherit"
              ><span v-for="(line, i) in typedMd.split('\n')" :key="i"><template v-for="(segment, j) in renderMdLine(line)" :key="j"><span v-if="segment.type === 'key'" class="text-[var(--accent)]">{{ segment.text }}</span><span v-else-if="segment.type === 'bold'" class="font-bold text-[#111]">{{ segment.text }}</span><span v-else-if="segment.type === 'accent'" class="text-[var(--accent)]">{{ segment.text }}</span><span v-else-if="segment.type === 'accentText'" class="text-[#444]">{{ segment.text }}</span><span v-else-if="segment.type === 'gradient'" class="text-[#333]">{{ segment.text }}</span><span v-else class="text-[#666]">{{ segment.text }}</span></template><span v-if="!typingDone && i === typedMd.split('\n').length - 1" class="inline-block w-[2px] h-[1.1em] bg-[var(--accent)] align-middle ml-[1px] animate-blink"></span>
</span></pre>
            </div>
            <!-- Right: Live preview -->
            <div class="preview-panel flex-[3] bg-white p-4 sm:p-8">
              <div class="text-[#999] text-[12px] mb-4 select-none">预览</div>
              <div ref="previewRef" class="preview-content"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section
      id="features"
      class="px-4 sm:px-8 py-12 sm:py-20 transition-all duration-800"
      :class="featuresVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'"
    >
      <div class="mx-auto max-w-[1100px]">
        <h2
          class="features-title text-[28px] sm:text-[40px] font-extrabold tracking-tight text-[#111] m-0 mb-2"
        >
          功能
        </h2>
        <p class="features-subtitle text-base sm:text-[19px] text-[#888] m-0 mb-8 sm:mb-12">
          一切为了更专注的写作体验
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <div
            v-for="(f, i) in features"
            :key="i"
            class="feature-card group bg-white rounded-2xl px-5 sm:px-8 pt-7 sm:pt-9 pb-6 sm:pb-8 border border-black/[0.04] opacity-0 translate-y-8 scale-95 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:shadow-[0_8px_30px_rgba(var(--accent-rgb),0.1)] hover:-translate-y-1 hover:scale-[1.02] hover:border-[var(--accent)]/20"
            :class="featuresVisible ? '!opacity-100 !translate-y-0 !scale-100' : ''"
            :style="{ transitionDelay: `${i * 0.12}s` }"
          >
            <component
              :is="f.icon"
              class="w-10 h-10 text-[var(--accent)] mb-4.5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
            />
            <h3
              class="text-lg font-bold text-[#111] m-0 mb-2 transition-colors duration-300 group-hover:text-[var(--accent)]"
            >
              {{ f.title }}
            </h3>
            <p
              class="text-base leading-[1.65] text-[#888] m-0 transition-colors duration-300 group-hover:text-[#666]"
            >
              {{ f.desc }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA + 下载 横向排列 -->
    <div
      class="cta-section flex flex-col md:flex-row items-center justify-center gap-10 sm:gap-12 px-4 sm:px-8 pt-12 sm:pt-20 pb-16 sm:pb-[100px]"
    >
      <!-- CTA -->
      <div class="text-center md:flex-1 max-w-[400px]">
        <h2 class="text-[26px] sm:text-[36px] font-extrabold tracking-tight text-[#111] m-0 mb-2">
          开始写作
        </h2>
        <p class="text-[12px] text-[#aaa] dark:text-[#666] mb-4">无需注册，打开即用</p>
        <router-link
          to="/editor"
          class="cta-btn inline-flex items-center gap-2 bg-[var(--accent)] text-white no-underline px-9 py-3.5 rounded-xl text-base font-semibold transition-all hover:bg-[var(--accent-dark)] hover:-translate-y-px"
        >
          打开编辑器
          <ArrowRight :size="18" class="cta-arrow" />
        </router-link>
      </div>

      <!-- 客户端下载 -->
      <div id="download" class="text-center md:flex-1 max-w-[400px]">
        <h2 class="text-[26px] sm:text-[36px] font-extrabold tracking-tight text-[#111] m-0 mb-2">
          桌面客户端下载
        </h2>
        <p class="text-[12px] text-[#aaa] dark:text-[#666] mb-4">
          支持 macOS（M芯片） / Windows 64位
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/RobocopMao/r-markdown/releases/latest"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-white w-44 px-0 py-3.5 text-base font-semibold text-[var(--accent)] no-underline transition-all hover:bg-white hover:-translate-y-px justify-center"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            GitHub 下载
          </a>
          <a
            href="https://pan.baidu.com/s/5XsUYe0ktlPMaNtqcfGunWg"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-white w-44 px-0 py-3.5 text-base font-semibold text-[var(--accent)] no-underline transition-all hover:bg-white hover:-translate-y-px justify-center"
          >
            <Download :size="16" />
            百度网盘下载
          </a>
        </div>
      </div>
    </div>

    <!-- 公众号反馈 -->
    <section class="px-4 sm:px-8 pb-12 sm:pb-20">
      <div
        class="feedback-card mx-auto max-w-[600px] bg-white rounded-2xl border border-black/[0.06] px-6 sm:px-10 py-8 sm:py-10 flex flex-col items-center text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      >
        <p class="text-[17px] text-[#555] m-0 mb-2">编辑器为个人公众号写作自用，可能会不定期更新</p>
        <p class="text-[17px] text-[#555] m-0 mb-6">使用中遇到问题或有建议？欢迎关注公众号反馈</p>
        <img
          src="/wechat-qr.jpg"
          alt="微信公众号二维码"
          class="qr-light w-[200px] sm:w-[280px] rounded-xl"
        />
        <img
          src="/wechat-qr-dark.jpg"
          alt="微信公众号二维码"
          class="qr-dark w-[200px] sm:w-[280px] rounded-xl"
        />
        <p class="text-[13px] text-[#999] mt-4 m-0">
          微信搜索「<span class="text-[var(--accent)] font-medium">五味杂陈杂货铺</span>」
        </p>
      </div>
    </section>

    <!-- Footer -->
    <SiteFooter showExtra />
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: #f5f5f7;
  --cloud-bg: #f5f5f7;
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}

.cta-btn {
  box-shadow: 0 0 20px 2px rgba(var(--accent-rgb), 0.15);
  transition: all 0.3s ease;
}
.cta-btn:hover {
  box-shadow: 0 0 30px 6px rgba(var(--accent-rgb), 0.3);
}

@keyframes blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}
.animate-blink {
  animation: blink 1s step-end infinite;
}

/* CTA arrow animation */
.cta-arrow {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cta-btn:hover .cta-arrow {
  transform: translateX(4px);
}

/* Header blur with gradient fade */
/* .header-blur 已移至 App.vue 全局样式 */

/* Hero canvas cloud – rendered via <canvas>, no CSS needed */

.preview-content :deep(section) {
  transition: opacity 0.15s ease;
}

/* Feature cards – light mode */
.feature-card {
  position: relative;
  overflow: hidden;
}
.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.04), transparent);
  transition: left 0.6s ease;
  pointer-events: none;
  z-index: 0;
}
.feature-card:hover::before {
  left: 100%;
}
.feature-card > * {
  position: relative;
  z-index: 1;
}
</style>

<style>
/* ── 深色模式（非 scoped，确保优先级） ── */
[data-theme='dark'] .home {
  background: #111114;
  --cloud-bg: #111114;
}
[data-theme='dark'] header {
  background: rgba(17, 17, 20, 0.8) !important;
}
[data-theme='dark'] .hero-title {
  color: #f0f0f0;
}
[data-theme='dark'] .hero-subtitle {
  color: rgba(255, 255, 255, 0.8);
}
[data-theme='dark'] .hero-desc {
  color: rgba(255, 255, 255, 0.55);
}
[data-theme='dark'] .hero-hint {
  color: rgba(255, 255, 255, 0.55);
}

/* Preview card */
[data-theme='dark'] .preview-card {
  background: #1a1a1e;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
[data-theme='dark'] .preview-titlebar {
  background: #222226 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
[data-theme='dark'] .preview-editor {
  background: #1e1e22 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #ccc;
}
[data-theme='dark'] .preview-panel {
  background: #1a1a1e !important;
}

/* Features */
[data-theme='dark'] .features-title {
  color: #f0f0f0;
}
[data-theme='dark'] .features-subtitle {
  color: #666;
}
[data-theme='dark'] .feature-card {
  background: #1a1a1e;
  border-color: rgba(255, 255, 255, 0.06);
}
[data-theme='dark'] .feature-card:hover {
  border-color: rgba(var(--accent-rgb), 0.3);
  box-shadow: 0 8px 30px rgba(var(--accent-rgb), 0.08);
}
[data-theme='dark'] .feature-card::before {
  background: linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.06), transparent);
}
[data-theme='dark'] .feature-card h3 {
  color: #f0f0f0;
}
[data-theme='dark'] .feature-card p {
  color: #999;
}

/* CTA */
[data-theme='dark'] .cta-section h2 {
  color: #f0f0f0;
}
[data-theme='dark'] .cta-section p {
  color: #666;
}

/* Feedback */
[data-theme='dark'] .feedback-card {
  background: #1a1a1e;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-theme='dark'] .feedback-card p {
  color: #aaa;
}

/* QR code image switch */
.qr-dark {
  display: none;
}
[data-theme='dark'] .qr-light {
  display: none;
}
[data-theme='dark'] .qr-dark {
  display: block;
}
</style>
