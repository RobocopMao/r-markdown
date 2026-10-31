<script setup vapor lang="ts">
/**
 * 站点公共头部导航（悬浮胶囊 + 移动端抽屉）。
 *
 * 从首页 HomePageV2.vue 提取，供其他页面复用同一套外观。
 * 几个设计取舍：
 * - 组件自带配色令牌（--ink / --ink-2 / --ink-3 / --surface / --line / --ease），
 *   不依赖页面根元素，所以任何页面直接塞进去就能正常显示和跟随深色模式。
 * - 导航项支持两种：`href` 走页内锚点滚动（会自动避开固定头部），`to` 走路由跳转。
 * - 中间的文字按钮由 `showNavLinks` 控制，默认显示；传 false 时收起，只剩 logo / 深色切换 /
 *   三点菜单 —— 给不需要分区导航的页面用。传 false 且没传 `items` 时，桌面端会把站点级
 *   导航（首页 / 扩展组件 / 素材库 / 帮助文档）铺到 logo 后面，保证 PC 上也有站内入口。
 * - 移动端统一用「三点」下拉菜单（与编辑器页面操作菜单同一套样式）：
 *   · 传了 `items`（首页那种页内锚点）→ 菜单里就是这些锚点项，点了平滑滚到对应区块；
 *   · 没传 `items`（其他页面）→ 菜单里是站点级导航：首页 / 扩展组件 / 素材库 / 帮助文档 / 编辑器。
 *   · 传了 `items` 的页面（首页）→ 锚点项之后补一个「编辑器」入口，手机上才跳得出去；
 *     扩展组件 / 素材库不补（首页锚点里已经有等价入口，用户明确只留编辑器）。
 *     PC 端那排文字导航仍然只按传入的 items 渲染。
 * - 深浅色切换复用编辑器顶栏的 ThemeModeToggle，外观与编辑器完全一致。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  BookOpenText,
  Bot,
  ChartColumn,
  Download,
  EllipsisVertical,
  HelpCircle,
  Home,
  LayoutGrid,
  Library,
  PenLine,
  PlayCircle,
  Sparkles,
} from 'lucide-vue-next'
import SiteLogo from '@/components/SiteLogo.vue'
import { useDropdownGroup } from '@/composables/useDropdownGroup'
import ThemeModeToggle from '@/views/editor/components/ThemeModeToggle.vue'

export interface SiteNavItem {
  label: string
  /** 页内锚点，例如 #features */
  href?: string
  /** 路由地址，例如 /components */
  to?: string
}

const props = withDefaults(
  defineProps<{
    /** 中间的文字导航项 */
    items?: SiteNavItem[]
    /** 是否显示中间的文字按钮，默认显示 */
    showNavLinks?: boolean
    /** 是否显示右侧「打开编辑器」 */
    showEditorCta?: boolean
    /** 「打开编辑器」跳转目标 */
    editorTo?: string
    /** logo 悬停打字机效果；默认关闭，保持克制 */
    logoTyping?: boolean
    /** 当前高亮的导航项 label */
    active?: string
  }>(),
  {
    items: () => [],
    showNavLinks: true,
    showEditorCta: true,
    editorTo: '/editor',
    logoTyping: false,
    active: '',
  },
)

const emit = defineEmits<{
  /** 点击任意导航项后触发，参数是该导航项 */
  'nav-click': [item: SiteNavItem]
  /** 点击「打开编辑器」时触发（随后仍会按 editorTo 跳转） */
  editor: []
}>()

const router = useRouter()

/** 用户要求减少动效时，滚动与位移都退化为直接到位 */
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const hasLinks = () => props.showNavLinks && props.items.length > 0

/* ── 滚动后加一层投影 ── */
const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 8
}

/* ── 移动端三点菜单（与编辑器页面操作菜单同一套样式） ── */
const route = useRoute()

interface MenuEntry {
  label: string
  /** 页内锚点 */
  href?: string
  /** 路由地址 */
  to?: string
  icon: unknown
}

/**
 * 站点级导航：没有页内锚点的页面（扩展组件 / 素材库 / 帮助文档）用的那套。
 * 编辑器放最后：PC 上右侧有「打开编辑器」按钮会把这一项过滤掉，
 * 只有移动端（按钮被 max-xl:hidden 收起）才靠这一项进编辑器。
 */
const SITE_MENU: MenuEntry[] = [
  { label: '首页', to: '/', icon: Home },
  { label: '编辑器', to: props.editorTo, icon: PenLine },
  { label: '扩展组件', to: '/components', icon: LayoutGrid },
  { label: '素材库', to: '/materials', icon: Library },
  { label: '统计', to: '/dashboard', icon: ChartColumn },
  { label: '帮助文档', to: '/help', icon: HelpCircle },
]

/** 首页那种页内锚点的图标，按 label 对齐；没登记的用通用图标兜底 */
const ANCHOR_ICONS: Record<string, unknown> = {
  功能简介: Sparkles,
  'AI 能力': Bot,
  效果演示: PlayCircle,
  下载客户端: Download,
  常见问题: HelpCircle,
  帮助文档: BookOpenText,
}

/**
 * 菜单内容随页面走：
 * - 传了带 href 的 items（首页）→ 就是首页自己的分区导航，点了平滑滚过去；
 * - 没传（其他页面）→ 站点级导航。
 */
/**
 * 首页这种「传了 items」的页面，导航是页内锚点，天然没有站点其他页面的入口。
 * 移动端那颗「打开编辑器」又被 max-xl:hidden 收起来了，所以菜单末尾补上
 * 传进来的项里没有的站点入口，保证手机上任何一个页面都能跳到其他页面。
 * PC 端不用管：首页那排文字导航直接用传入的 items，不读这个 computed。
 */
const SITE_ONLY: MenuEntry[] = [{ label: '编辑器', to: props.editorTo, icon: PenLine }]

const menuItems = computed<MenuEntry[]>(() => {
  if (!props.items.length) return SITE_MENU
  const mapped: MenuEntry[] = props.items.map((i) => ({
    label: i.label,
    href: i.href,
    to: i.to,
    icon: ANCHOR_ICONS[i.label] ?? Sparkles,
  }))
  const extra = SITE_ONLY.filter((e) => !mapped.some((m) => m.to === e.to))
  return [...mapped, ...extra]
})

/**
 * PC 端铺在 logo 后面的那排文字导航：只取路由项，
 * 排除编辑器（右侧已有 CTA 按钮）和统计面板（统计入口只在编辑器侧栏 / 移动端菜单里）。
 */
const PC_HIDDEN_PATHS: string[] = ['/dashboard']
const desktopLinks = computed(() =>
  menuItems.value.filter((i) => i.to && i.to !== props.editorTo && !PC_HIDDEN_PATHS.includes(i.to)),
)

/** 与编辑器一致：同一时刻只允许一个下拉展开，所以走共享的 useDropdownGroup */
const { toggle: groupToggle, isVisible: menuOpen } = useDropdownGroup('site-menu')

function toggleMenu() {
  groupToggle(!menuOpen.value)
}

function closeMenu() {
  groupToggle(false)
}

function isCurrent(path: string) {
  return route.path === path || (path !== '/' && route.path.startsWith(path))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu()
}

/** 点到菜单外面就收起来 */
function onDocPointerDown(e: PointerEvent) {
  if (!menuOpen.value) return
  const el = e.target as HTMLElement | null
  if (!el || !el.closest('.site-menu')) closeMenu()
}

/** 页内锚点滚动：先关菜单，再滚到目标（区块自带 scroll-margin-top 避开头部） */
function goTo(href: string) {
  closeMenu()
  const el = document.querySelector(href)
  if (!el) return
  el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
}

function onNavClick(item: SiteNavItem) {
  emit('nav-click', item)
  if (item.href) goTo(item.href)
}

function openEditor() {
  emit('editor')
  closeMenu()
  router.push(props.editorTo)
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onDocPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <div
    class="[--ink:#111214] [--ink-2:#5b5f66] [--ink-3:#8a8f98] [--surface:#ffffff] [--line:rgba(17,18,20,0.08)] [--ease:cubic-bezier(0.22,1,0.36,1)] dark:[--ink:#f2f3f5] dark:[--ink-2:#a8adb5] dark:[--ink-3:#7b818a] dark:[--surface:#1f1f1f] dark:[--line:rgba(255,255,255,0.1)]"
  >
    <!-- ── 悬浮胶囊导航 ── -->
    <header class="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        class="flex w-full max-w-[1100px] items-center gap-2 rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.6)] py-2 pl-4 pr-2 backdrop-blur-[16px] backdrop-saturate-[1.4] shadow-[0_2px_8px_rgba(17,18,20,0.04)] [transition:box-shadow_.5s_var(--ease),background_.5s_var(--ease)] dark:bg-[rgba(31,31,31,0.6)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] [&.nav-bar--scrolled]:shadow-[0_8px_32px_rgba(17,18,20,0.1)] dark:[&.nav-bar--scrolled]:shadow-[0_8px_32px_rgba(0,0,0,0.55)] dark:[&.nav-bar--scrolled]:bg-[rgba(31,31,31,0.6)]"
        :class="{ 'nav-bar--scrolled': scrolled }"
      >
        <SiteLogo :typing="logoTyping" class="shrink-0" />

        <nav v-if="hasLinks()" class="hidden items-center gap-1 xl:flex" aria-label="主导航">
          <button
            v-for="item in items.filter((i) => i.href)"
            :key="item.label"
            class="shrink-0 cursor-pointer rounded-full border-0 bg-transparent px-3 py-2 text-[14px] font-semibold whitespace-nowrap text-[var(--ink-2)] no-underline [transition:color_.3s_var(--ease),background_.3s_var(--ease)] hover:bg-[rgba(17,18,20,0.05)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:bg-[rgba(255,255,255,0.08)]"
            :class="active && active === item.label ? 'text-[var(--ink)]' : ''"
            @click="onNavClick(item)"
          >
            {{ item.label }}
          </button>
          <router-link
            v-for="item in items.filter((i) => i.to)"
            :key="item.label"
            :to="item.to!"
            class="shrink-0 cursor-pointer rounded-full border-0 bg-transparent px-3 py-2 text-[14px] font-semibold whitespace-nowrap text-[var(--ink-2)] no-underline [transition:color_.3s_var(--ease),background_.3s_var(--ease)] hover:bg-[rgba(17,18,20,0.05)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:bg-[rgba(255,255,255,0.08)]"
            :class="active && active === item.label ? 'text-[var(--ink)]' : ''"
            @click="emit('nav-click', item)"
          >
            {{ item.label }}
          </router-link>
        </nav>

        <!-- 没有页内锚点的页面（扩展组件 / 素材库 / 帮助文档）：把这套站点菜单
             在 PC 端铺开到 logo 后面，样式与首页的文字导航一致。
             编辑器不进这排导航（右侧已有「打开编辑器」按钮），统计面板也不进
             （入口只在编辑器侧栏与移动端菜单里），两者都不做选中态高亮。
             拆成两段渲染（锚点项 / 路由项），和首页导航同一套写法，顺序稳定。 -->
        <nav
          v-else-if="menuItems.length"
          class="hidden items-center gap-1 xl:flex"
          aria-label="站点导航"
        >
          <button
            v-for="item in menuItems.filter((i) => i.href)"
            :key="item.label"
            class="shrink-0 cursor-pointer rounded-full border-0 bg-transparent px-3 py-2 text-[14px] font-semibold whitespace-nowrap text-[var(--ink-2)] no-underline [transition:color_.3s_var(--ease),background_.3s_var(--ease)] hover:bg-[rgba(17,18,20,0.05)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:bg-[rgba(255,255,255,0.08)]"
            @click="goTo(item.href!)"
          >
            {{ item.label }}
          </button>
          <router-link
            v-for="item in desktopLinks"
            :key="item.label"
            :to="item.to!"
            class="shrink-0 cursor-pointer rounded-full border-0 bg-transparent px-3 py-2 text-[14px] font-semibold whitespace-nowrap text-[var(--ink-2)] no-underline [transition:color_.3s_var(--ease),background_.3s_var(--ease)] hover:bg-[rgba(17,18,20,0.05)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:bg-[rgba(255,255,255,0.08)]"
            @click="emit('nav-click', item)"
          >
            {{ item.label }}
          </router-link>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <!-- 页面可以在这里塞自己的按钮（会出现在深色切换左侧） -->
          <slot name="actions" />

          <!-- 三点菜单：与编辑器页面的操作菜单同一套样式，只在移动端出现 -->
          <div class="site-menu relative xl:hidden">
            <button
              class="toolbar-round-btn flex"
              title="站点菜单"
              :aria-expanded="menuOpen"
              aria-haspopup="menu"
              :aria-label="menuOpen ? '关闭站点菜单' : '打开站点菜单'"
              @click="toggleMenu"
            >
              <EllipsisVertical :size="15" />
            </button>

            <div
              v-if="menuOpen"
              class="absolute top-full right-0 z-50 mt-2 w-32 rounded-xl bg-white p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:bg-[#2a2a2e] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
              role="menu"
            >
              <template v-for="item in menuItems" :key="item.label">
                <button
                  v-if="item.href"
                  role="menuitem"
                  class="flex w-full cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent px-3 py-2 text-[13px] whitespace-nowrap text-black/80 transition-colors duration-150 hover:bg-black/5 dark:text-[#ccc] dark:hover:bg-white/[0.08]"
                  @click="goTo(item.href)"
                >
                  <component :is="item.icon" :size="14" class="shrink-0" />
                  {{ item.label }}
                </button>
                <router-link
                  v-else
                  :to="item.to!"
                  role="menuitem"
                  class="flex w-full cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent px-3 py-2 text-[13px] whitespace-nowrap text-black/80 no-underline transition-colors duration-150 hover:bg-black/5 dark:text-[#ccc] dark:hover:bg-white/[0.08]"
                  :class="isCurrent(item.to!) ? 'bg-black/5! dark:bg-white/[0.08]!' : ''"
                  @click="closeMenu"
                >
                  <component :is="item.icon" :size="14" class="shrink-0" />
                  {{ item.label }}
                </router-link>
              </template>
            </div>
          </div>

          <!-- 深浅色切换：直接用编辑器顶栏那颗，外观与编辑器一致 -->
          <ThemeModeToggle class="shrink-0" />
          <button
            v-if="showEditorCta"
            class="inline-flex shrink-0 cursor-pointer px-3 py-2 text-[14px] items-center gap-2 rounded-full border font-semibold whitespace-nowrap no-underline [transition:translate_.5s_var(--ease),scale_.5s_var(--ease),background_.3s_var(--ease),box-shadow_.5s_var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.98] motion-reduce:hover:translate-y-0 [&:hover_.cta-arrow]:translate-x-1 border-transparent bg-[var(--accent)] text-white leading-6 shadow-[0_2px_8px_rgba(var(--accent-rgb),0.24)] hover:-translate-y-0.5 hover:bg-[var(--accent-dark)] hover:shadow-[0_8px_24px_rgba(var(--accent-rgb),0.32)] max-xl:hidden"
            @click="openEditor"
          >
            打开编辑器
            <ArrowRight
              :size="16"
              class="cta-arrow transition-transform duration-500 ease-[var(--ease)]"
            />
          </button>
        </div>
      </div>
    </header>
  </div>
</template>
