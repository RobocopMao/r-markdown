<script setup vapor lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { SquarePen, Home } from 'lucide-vue-next'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import { useTheme } from '@/composables/useTheme'
import { useDarkMode } from '@/composables/useDarkMode'
import { useMermaid } from '@/composables/useMermaid'
import DarkModeToggle from '@/components/DarkModeToggle.vue'
import SiteLogo from '@/components/SiteLogo.vue'
import NavCapsule from '@/components/NavCapsule.vue'
import MobileNavMenu from '@/components/mobile/MobileNavMenu.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import Toast from '@/components/Toast.vue'
import { components } from '@/extension'

const { mode: darkMode, setMode: setDarkMode } = useDarkMode()
const { colors } = useTheme()
const { renderAll } = useMermaid()
const visible = ref(false)

// 分类定义
const categories = [
  { key: 'all', label: '全部' },
  { key: 'title', label: '标题' },
  { key: 'content', label: '内容' },
  { key: 'layout', label: '布局' },
  { key: 'image', label: '图片' },
  { key: 'interactive', label: '互动' },
  { key: 'other', label: '其他' },
]
const activeCategory = ref('all')

// 组件 id → 分类映射
const componentCategoryMap: Record<string, string> = {
  Title_DA01: 'title',
  Title_DA02: 'title',
  PTitle_DA01: 'title',
  PTitle_DA02: 'title',
  Breaking_DA01: 'title',
  ReadingPath_DA01: 'content',
  Lead_DA01: 'content',
  Slider_DA01: 'image',
  Statement_DA01: 'content',
  Steps_DA01: 'layout',
  Steps_DA02: 'layout',
  CaseFlow_DA01: 'layout',
  Compare_DA01: 'layout',
  Compare_DA02: 'layout',
  Table_DA01: 'layout',
  Timeline_DA01: 'layout',
  Chart_DA01: 'other',
  Badges_DA01: 'other',
  CTA_DA01: 'interactive',
  Engage_DA01: 'interactive',
  Engage_DA02: 'interactive',
  Img_DA01: 'image',
  Mermaid_DA01: 'other',
}

const filteredComponents = computed(() => {
  if (activeCategory.value === 'all') return componentExamples.value
  return componentExamples.value.filter((c) => componentCategoryMap[c.id] === activeCategory.value)
})

const isTauri = import.meta.env.VITE_TAURI === 'true'

const showcaseNavItems = computed(() => {
  const items = [{ key: 'editor', label: '编辑器', to: '/editor', icon: SquarePen }]
  // Web 端首页和编辑器是不同页面，Tauri 客户端首页即编辑器，去除重复项
  if (!isTauri) {
    items.unshift({ key: 'home', label: '首页', to: '/', icon: Home })
  }
  return items
})

const componentExamples = ref<
  Array<{
    id: string
    name: string
    description: string
    example: string
    rendered: string
    idSuffix: string
    attrs: Array<{
      key: string
      label: string
      required?: boolean
      default?: string
      options?: string[]
    }>
  }>
>([])

onMounted(async () => {
  requestAnimationFrame(() => {
    visible.value = true
  })
  const colorsVal = colors.value
  const examples = await Promise.all(
    components
      .filter((comp) => comp.id !== 'ReadingPath_DA01')
      .map(async (comp) => ({
        id: comp.id,
        name: comp.name,
        description: comp.description || '',
        example: comp.example || '',
        rendered: await renderMermaidIfNeeded(comp, colorsVal),
        idSuffix: comp.id.split('_').slice(1).join('_'),
        attrs: (comp as any).attrs || [],
      })),
  )
  componentExamples.value = examples
})

// 主题色变化时重新渲染预览
watch(colors, async (c) => {
  const newExamples = await Promise.all(
    componentExamples.value.map(async (comp) => ({
      ...comp,
      rendered: await renderMermaidIfNeeded(comp, c),
    })),
  )
  componentExamples.value = newExamples
})

const showToast = ref(false)
const toastText = ref('')

async function renderMermaidIfNeeded(comp: any, colorsVal: any) {
  let rendered = comp.example ? await parseMarkdownAsync(comp.example, colorsVal) : ''
  if (comp.id === 'Mermaid_DA01' && rendered) {
    const tmp = document.createElement('div')
    tmp.style.position = 'absolute'
    tmp.style.visibility = 'hidden'
    tmp.style.pointerEvents = 'none'
    tmp.innerHTML = rendered
    document.body.appendChild(tmp)
    await renderAll(tmp)
    rendered = tmp.innerHTML
    document.body.removeChild(tmp)
  }
  return rendered
}

function copySyntax(code: string) {
  navigator.clipboard.writeText(code)
  toastText.value = '已复制到剪贴板'
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 1500)
}

function onMouseMove(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  const rect = card.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  card.style.setProperty('--mouse-x', `${x}px`)
  card.style.setProperty('--mouse-y', `${y}px`)
}

function onCardEnter(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  const overlay = card.querySelector('.card-overlay') as HTMLElement
  if (overlay) {
    requestAnimationFrame(() => {
      card.style.minHeight = overlay.scrollHeight + 'px'
    })
  }
}

function onCardLeave(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  card.style.minHeight = ''
}
</script>

<template>
  <div class="showcase-page" :class="{ 'opacity-100': visible, 'opacity-0': !visible }">
    <!-- Header -->
    <header class="header-blur sticky top-0 z-50 backdrop-blur-xl">
      <div class="mx-auto max-w-[1100px] flex items-center gap-1.5 px-4 sm:px-8 py-3.5">
        <SiteLogo />
        <NavCapsule :items="showcaseNavItems" active-key="editor" class="ml-auto" />
        <MobileNavMenu
          :items="showcaseNavItems"
          @click="
            (key: string) => {
              if (key === 'home') $router.push('/')
              else if (key === 'editor') $router.push('/editor')
            }
          "
          class="ml-auto sm:ml-0"
        />
        <DarkModeToggle :mode="darkMode" @select="setDarkMode" class="shrink-0" />
      </div>
    </header>

    <!-- Main Content -->
    <main class="px-4 sm:px-8 py-8 sm:py-12">
      <div class="mx-auto max-w-[1020px]">
        <div class="mb-4 sm:mb-6">
          <h1
            class="text-[28px] sm:text-[40px] font-extrabold tracking-tight m-0 mb-2"
            style="color: var(--text-primary)"
          >
            扩展组件
          </h1>
          <p class="text-base sm:text-[19px] m-0" style="color: var(--text-muted)">
            浏览和使用丰富的排版组件
          </p>
        </div>

        <!-- Category Filter -->
        <div class="category-filter">
          <button
            v-for="cat in categories"
            :key="cat.key"
            :class="['cat-btn', { active: activeCategory === cat.key }]"
            @click="activeCategory = cat.key"
          >
            {{ cat.label }}
          </button>
        </div>

        <!-- Components Waterfall -->
        <div class="waterfall">
          <div
            v-for="comp in filteredComponents"
            :key="comp.id"
            class="spotlight-card"
            @mousemove="onMouseMove"
            @mouseenter="onCardEnter"
            @mouseleave="onCardLeave"
          >
            <!-- 高光层 -->
            <div class="spotlight-glow"></div>

            <!-- 正面：渲染预览 -->
            <div class="card-front">
              <div class="p-6">
                <div v-if="comp.rendered" v-html="comp.rendered" class="preview-content"></div>
                <div v-else class="text-[13px] text-[#ccc] italic py-8 text-center">暂无示例</div>
              </div>
            </div>

            <!-- 悬浮层：语法用法 -->
            <div v-if="comp.example" class="card-overlay">
              <div class="overlay-content">
                <div class="overlay-header">
                  <span class="overlay-title"
                    >{{ comp.name }} <span class="overlay-id">{{ comp.idSuffix }}</span></span
                  >
                  <button class="copy-btn" @click.stop="copySyntax(comp.example)">
                    <svg
                      viewBox="0 0 16 16"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="5" y="5" width="9" height="9" rx="1.5" />
                      <path
                        d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"
                      />
                    </svg>
                    复制
                  </button>
                </div>
                <pre class="syntax-code"><code>{{ comp.example }}</code></pre>
                <!-- 属性说明表 -->
                <div v-if="comp.attrs && comp.attrs.length" class="attrs-table">
                  <div class="attrs-row attrs-label-row">
                    <span class="attr-col-key">属性</span>
                    <span class="attr-col-desc">说明</span>
                  </div>
                  <div v-for="attr in comp.attrs" :key="attr.key" class="attrs-row">
                    <span class="attr-col-key"
                      ><code>{{ attr.key }}</code
                      ><span v-if="attr.required" class="attr-required">必填</span></span
                    >
                    <span class="attr-col-desc">
                      {{ attr.label }}
                      <template v-if="attr.default"
                        >，默认
                        <code class="attr-default-inline">{{ attr.default }}</code></template
                      >
                      <template v-if="attr.options && attr.options.length">
                        ，可选
                        <code v-for="(opt, i) in attr.options" :key="opt" class="attr-option-inline"
                          >{{ opt
                          }}<template v-if="i < attr.options.length - 1"> / </template></code
                        >
                      </template>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <SiteFooter showExtra />

    <!-- Toast -->
    <Toast :visible="showToast" :message="toastText" />
  </div>
</template>

<style scoped>
.showcase-page {
  min-height: 100vh;
  background: var(--bg-secondary);
  transition: opacity 0.3s ease;
}

/* ── 分类筛选 ── */
.category-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}
.cat-btn {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.cat-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-color);
}
.cat-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* ── 瀑布流 ── */
.waterfall {
  columns: 2;
  column-gap: 1.5rem;
}

@media (max-width: 1023px) {
  .waterfall {
    columns: 1;
  }
}

/* ── 聚光灯卡片 ── */
.spotlight-card {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  /* Safari 多列布局中 backdrop-filter/gradient 元素会触发列分裂，
     display:inline-block + width:100% 强制将卡片作为不可分割的原子块 */
  display: inline-block;
  width: 100%;
  margin-bottom: 1.5rem;
  position: relative;
  border-radius: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-panel);
  cursor: default;
  --mouse-x: 50%;
  --mouse-y: 50%;
}

/* 高光层：从鼠标位置扩散的径向渐变 */
.spotlight-glow {
  position: absolute;
  inset: 0;
  z-index: 3;
  opacity: 0;
  transition: opacity 0.35s ease;
  background: radial-gradient(
    350px circle at var(--mouse-x) var(--mouse-y),
    rgba(var(--accent-rgb), 0.15),
    rgba(var(--accent-rgb), 0.05) 40%,
    transparent 70%
  );
  pointer-events: none;
}

.spotlight-card:hover .spotlight-glow {
  opacity: 1;
}

/* 正面渲染预览 */
.card-front {
  position: relative;
  z-index: 1;
  overflow: hidden;
  /* Safari CSS columns 会破坏 linear-gradient 背景渲染，
     translateZ(0) 强制 GPU 合成层隔离来自列布局的 paint 干扰 */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}

/* 说明层 */
.card-overlay {
  position: relative;
  z-index: 4;
  padding: 1rem 1.25rem;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.overlay-content {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.overlay-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.overlay-id {
  color: var(--accent);
  font-weight: 500;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--accent-light);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.syntax-code {
  flex: 1;
  margin: 0;
  padding: 1rem;
  background: #1e1e2e;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #e0e0e0;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.7;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ── 属性说明表 ── */
.attrs-table {
  margin-top: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  overflow: hidden;
  font-size: 11px;
  flex-shrink: 0;
}

.attrs-header {
  padding: 6px 10px;
  font-weight: 600;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-light);
  border-bottom: 1px solid var(--border-color);
}

.attrs-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 0;
  border-bottom: 1px solid var(--border-color);
}

.attrs-row:last-child {
  border-bottom: none;
}

.attrs-label-row {
  background: var(--accent-light);
  font-weight: 600;
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.attrs-row span {
  padding: 5px 10px;
  display: flex;
  align-items: center;
  color: var(--text-secondary);
}

.attr-col-key code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  padding: 1px 5px;
  border-radius: 3px;
}

.attr-required {
  font-size: 9px;
  color: #e74c3c;
  margin-left: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.attr-col-desc {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
  flex-wrap: wrap;
}

.attr-default-inline {
  font-family: 'SF Mono', monospace;
  font-size: 10px;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.08);
  padding: 1px 4px;
  border-radius: 3px;
}

.attr-option-inline {
  font-family: 'SF Mono', monospace;
  font-size: 10px;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.08);
  padding: 1px 4px;
  border-radius: 3px;
}

.preview-content {
  overflow: hidden;
  max-width: 100%;
}

.preview-content :deep(section) {
  transition: opacity 0.15s ease;
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}
</style>
