<script setup vapor lang="ts">
/**
 * 更新日志页。
 *
 * 数据来源：GitHub Releases API（`RobocopMao/r-markdown`），运行时拉取，不在仓库里存副本，
 * 这样发版以后不用再改代码。三点设计取舍：
 *   1. 先读 localStorage 缓存再请求 —— 二次进入不闪空白，也不浪费匿名配额（未登录 60 次/小时）；
 *   2. 缓存 6 小时过期后仍会先用旧值顶上，网络失败时页面就是「旧数据」而不是报错页；
 *   3. 只有「一点数据都没有 + 请求失败」才显示错误态，并给重试与 GitHub 兜底链接。
 *
 * 正文解析：Releases 的 body 是固定模板（`## 变更` + 编号条目 + `## 下载` 表格），
 * 这里只取「变更」段的列表项，丢掉下载表格（页面自己会给下载入口）。
 * 但模板以后可能变，所以解析逻辑是「优先变更段，退化为全文」而不是硬编码位置。
 */
import { computed, onMounted, ref } from 'vue'
import { ArrowUpRight, CircleAlert, Clock, Github, History, RefreshCw } from 'lucide-vue-next'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'

const REPO = 'RobocopMao/r-markdown'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=100`
const RELEASES_PAGE = `https://github.com/${REPO}/releases`
const DOWNLOAD_URL = 'https://pan.baidu.com/s/5XsUYe0ktlPMaNtqcfGunWg'

const CACHE_KEY = 'r-markdown-changelog'
const CACHE_TTL = 6 * 60 * 60 * 1000

interface ReleaseEntry {
  tag: string
  date: string
  url: string
  items: string[]
}

const entries = ref<ReleaseEntry[]>([])
const loading = ref(true)
const failed = ref(false)

/* ────────────────────────── 正文解析 ────────────────────────── */

/** 去掉行内的 Markdown 记号，时间轴里按纯文本渲染 */
function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .trim()
}

/** 把一条 Release 的 body 拆成若干「一条变更」 */
function parseItems(body: string): string[] {
  const lines = (body || '').split(/\r?\n/)

  // 按 `## 标题` 切段，段外的开头内容单独成一段
  const sections: Array<{ title: string; body: string[] }> = []
  let current: { title: string; body: string[] } = { title: '', body: [] }
  for (const raw of lines) {
    const line = raw.trim()
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      sections.push(current)
      current = { title: heading[1], body: [] }
      continue
    }
    current.body.push(line)
  }
  sections.push(current)

  const CHANGE_RE = /变更|更新|修复|新增|优化|changelog|what'?s changed|changes?/i
  const changeSections = sections.filter((s) => s.title && CHANGE_RE.test(s.title))
  // 有「变更」段就只取它；模板变了（没有这个标题）就退化为全文
  const pool = changeSections.length
    ? changeSections.flatMap((s) => s.body)
    : sections.flatMap((s) => s.body)

  const items: string[] = []
  for (const line of pool) {
    if (!line) continue
    if (line.startsWith('|')) continue // 下载表格
    if (/^[-=_]{3,}$/.test(line)) continue // 分隔线

    const bullet = line.match(/^[-*+]\s+(.*)$/) || line.match(/^\d+\s*[、.)]\s*(.*)$/)
    if (bullet) {
      const text = stripInline(bullet[1])
      if (text) items.push(text)
      continue
    }
    // 没有列表记号的段落：只有退化成全文时才收，避免把说明文字碎成一堆行
    if (!changeSections.length) {
      const text = stripInline(line)
      if (text) items.push(text)
    }
  }
  return items
}

/* ────────────────────────── 缓存 ────────────────────────── */

function isEntryList(value: unknown): value is ReleaseEntry[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as ReleaseEntry).tag === 'string' &&
        typeof (v as ReleaseEntry).date === 'string' &&
        Array.isArray((v as ReleaseEntry).items),
    )
  )
}

function readCache(): ReleaseEntry[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { entries?: unknown; at?: unknown }
    if (typeof parsed?.at !== 'number') return null
    if (Date.now() - parsed.at > CACHE_TTL) return null
    return isEntryList(parsed.entries) ? parsed.entries : null
  } catch {
    return null
  }
}

function writeCache(list: ReleaseEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ entries: list, at: Date.now() }))
  } catch {
    /* 隐私模式 / 配额满：缓存写不进去不影响页面 */
  }
}

/* ────────────────────────── 拉取 ────────────────────────── */

interface RawRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
  prerelease?: boolean
  draft?: boolean
}

function toEntry(raw: RawRelease): ReleaseEntry | null {
  const tag = typeof raw.tag_name === 'string' ? raw.tag_name : ''
  if (!tag) return null
  return {
    tag,
    date: typeof raw.published_at === 'string' ? raw.published_at.slice(0, 10) : '',
    url: typeof raw.html_url === 'string' ? raw.html_url : `${RELEASES_PAGE}/tag/${tag}`,
    items: parseItems(raw.body ?? ''),
  }
}

let inflight = false

async function load(force = false) {
  if (inflight) return
  inflight = true

  if (!force) {
    const cached = readCache()
    if (cached) {
      entries.value = cached
      loading.value = false
      failed.value = false
      inflight = false
      return
    }
  }

  loading.value = !entries.value.length
  failed.value = false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = (await res.json()) as unknown
    if (!Array.isArray(raw)) throw new Error('payload')
    const list = (raw as RawRelease[])
      .filter((r) => !r.draft && !r.prerelease)
      .map(toEntry)
      .filter((e): e is ReleaseEntry => e !== null)
    if (!list.length) throw new Error('empty')
    entries.value = list
    writeCache(list)
  } catch {
    // 有旧数据就安静地留在旧数据上；一条都没有才算失败
    if (!entries.value.length) failed.value = true
  } finally {
    clearTimeout(timer)
    loading.value = false
    inflight = false
  }
}

const refreshing = ref(false)
async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  await load(true)
  refreshing.value = false
}

onMounted(() => void load())

/* ────────────────────────── 展示 ────────────────────────── */

const total = computed(() => entries.value.length)
const latestDate = computed(() => entries.value[0]?.date ?? '')
</script>

<template>
  <div
    class="min-h-screen bg-[var(--page)] font-sans text-[var(--ink)] [--ease:cubic-bezier(0.22,1,0.36,1)] [--ink:#111214] [--ink-2:#5b5f66] [--ink-3:#8a8f98] [--line:rgba(17,18,20,0.08)] [--page:#f5f5f7] [--surface:#ffffff] [--font-sans:'Manrope',-apple-system,BlinkMacSystemFont,'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif] dark:[--ink:#f2f3f5] dark:[--ink-2:#a8adb5] dark:[--ink-3:#7b818a] dark:[--line:rgba(255,255,255,0.1)] dark:[--page:#181818] dark:[--surface:#1f1f1f]"
  >
    <SiteHeader :show-nav-links="false" />

    <main class="mx-auto w-full max-w-[820px] px-4 pt-[104px] pb-20 sm:px-6 sm:pt-[124px]">
      <!-- ── 页头 ── -->
      <header>
        <p
          class="mb-3 flex items-center gap-2 text-[14px] font-semibold tracking-[0.04em] text-[var(--ink-3)]"
        >
          <History :size="15" aria-hidden="true" />
          <span>更新日志</span>
        </p>
        <h1
          class="m-0 text-[34px] leading-[1.15] font-bold tracking-[-0.02em] text-balance sm:text-[44px]"
        >
          每个版本改了什么
        </h1>
        <p class="mt-4 text-[16px] leading-6 text-[var(--ink-2)] text-pretty">
          从 GitHub Releases
          实时拉取，按时间从新到旧排列。桌面客户端可以在应用内直接升级，也可以随时来这里看改了哪些地方。
        </p>

        <div
          class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] pb-5 text-[13px] text-[var(--ink-3)]"
        >
          <span v-if="total" class="flex items-center gap-1.5">
            <Clock :size="14" aria-hidden="true" />
            共 {{ total }} 个版本 · 最近更新 {{ latestDate }}
          </span>
          <a
            class="flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 font-semibold text-[var(--ink-3)] no-underline [transition:color_.25s_var(--ease),background_.25s_var(--ease)] hover:bg-[rgba(var(--accent-rgb),0.08)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            :href="RELEASES_PAGE"
            target="_blank"
            rel="noopener"
          >
            <Github :size="14" aria-hidden="true" />
            GitHub Releases
            <ArrowUpRight :size="12" aria-hidden="true" />
          </a>
          <button
            class="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-semibold text-[var(--ink-2)] [transition:color_.25s_var(--ease),border-color_.25s_var(--ease)] hover:border-[rgba(var(--accent-rgb),0.4)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-60"
            :disabled="refreshing || loading"
            @click="refresh"
          >
            <RefreshCw :size="13" :class="refreshing ? 'animate-spin' : ''" aria-hidden="true" />
            刷新
          </button>
        </div>
      </header>

      <!-- ── 加载中：骨架屏，占位与真实卡片同宽同高节奏 ── -->
      <div v-if="loading" class="mt-8 space-y-6" aria-busy="true" aria-label="正在加载更新日志">
        <div
          v-for="n in 3"
          :key="n"
          class="animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div
            class="h-4 w-24 rounded-full bg-[rgba(17,18,20,0.08)] dark:bg-[rgba(255,255,255,0.08)]"
          ></div>
          <div class="mt-4 space-y-2.5">
            <div
              class="h-3 w-full rounded-full bg-[rgba(17,18,20,0.06)] dark:bg-[rgba(255,255,255,0.06)]"
            ></div>
            <div
              class="h-3 w-4/5 rounded-full bg-[rgba(17,18,20,0.06)] dark:bg-[rgba(255,255,255,0.06)]"
            ></div>
          </div>
        </div>
      </div>

      <!-- ── 失败且没有任何数据 ── -->
      <div
        v-else-if="failed"
        class="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center"
      >
        <CircleAlert class="mx-auto text-[var(--ink-3)]" :size="28" aria-hidden="true" />
        <p class="mt-3 text-[15px] font-semibold text-[var(--ink)]">更新日志暂时拉取不到</p>
        <p class="mt-1.5 text-[14px] leading-6 text-[var(--ink-3)]">
          GitHub 接口可能被网络拦住了，也可能刚好用完了匿名访问额度。可以直接去 Releases 页面看。
        </p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-transparent bg-[var(--accent)] px-4 py-2 text-[14px] font-semibold whitespace-nowrap text-white shadow-[0_2px_8px_rgba(var(--accent-rgb),0.24)] [transition:background_.3s_var(--ease),translate_.5s_var(--ease)] hover:-translate-y-0.5 hover:bg-[var(--accent-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            @click="refresh"
          >
            <RefreshCw :size="14" aria-hidden="true" />
            重试
          </button>
          <a
            class="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-[14px] font-semibold whitespace-nowrap text-[var(--ink)] no-underline [transition:border-color_.3s_var(--ease),background_.3s_var(--ease)] hover:border-[var(--ink-3)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            :href="RELEASES_PAGE"
            target="_blank"
            rel="noopener"
          >
            去 GitHub 看
            <ArrowUpRight :size="13" aria-hidden="true" />
          </a>
        </div>
      </div>

      <!-- ── 时间轴 ── -->
      <ol v-else class="mt-8 list-none p-0">
        <li
          v-for="(entry, index) in entries"
          :key="entry.tag"
          class="relative pb-7 pl-7 last:pb-0 sm:pb-9 sm:pl-9"
        >
          <!-- 竖线：最后一条不画，避免尾巴悬空 -->
          <span
            v-if="index < entries.length - 1"
            class="absolute top-5 bottom-0 left-[5px] w-px bg-[var(--line)] sm:left-[6px]"
            aria-hidden="true"
          ></span>
          <!-- 节点：最新一版实心高亮，其余留空 -->
          <span
            class="absolute top-[6px] left-0 size-2.5 rounded-full sm:top-[7px]"
            :class="
              index === 0
                ? 'bg-[var(--accent)] shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.18)]'
                : 'border-2 border-[var(--ink-3)] bg-[var(--page)] opacity-60'
            "
            aria-hidden="true"
          ></span>

          <article
            class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 [transition:border-color_.3s_var(--ease),box-shadow_.3s_var(--ease)] hover:border-[rgba(var(--accent-rgb),0.28)] hover:shadow-[0_12px_32px_rgba(17,18,20,0.08)] dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <h2 class="m-0 font-mono text-[16px] font-bold tracking-[-0.01em] text-[var(--ink)]">
                {{ entry.tag }}
              </h2>
              <span
                v-if="index === 0"
                class="rounded-full bg-[rgba(var(--accent-rgb),0.12)] px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] text-[var(--accent)]"
                >最新</span
              >
              <time
                v-if="entry.date"
                class="ml-auto font-mono text-[12px] tracking-[-0.01em] text-[var(--ink-3)]"
                >{{ entry.date }}</time
              >
            </div>

            <ul v-if="entry.items.length" class="mt-3.5 space-y-2.5">
              <li
                v-for="(item, i) in entry.items"
                :key="i"
                class="flex gap-2.5 text-[14px] leading-6 text-[var(--ink-2)]"
              >
                <span
                  class="mt-[9px] size-1.5 shrink-0 rounded-full bg-[rgba(var(--accent-rgb),0.5)]"
                  aria-hidden="true"
                ></span>
                <span class="min-w-0 break-words text-pretty">{{ item }}</span>
              </li>
            </ul>
            <p v-else class="mt-3.5 text-[14px] leading-6 text-[var(--ink-3)]">
              这个版本没有写变更说明，可以去 GitHub 看提交记录。
            </p>

            <a
              class="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--ink-3)] no-underline [transition:color_.25s_var(--ease)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              :href="entry.url"
              target="_blank"
              rel="noopener"
            >
              在 GitHub 查看
              <ArrowUpRight :size="13" aria-hidden="true" />
            </a>
          </article>
        </li>
      </ol>

      <!-- ── 收尾：想装客户端的话，入口就在这儿 ── -->
      <section class="mt-12 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 class="m-0 text-[18px] font-bold text-[var(--ink)]">想要桌面客户端？</h2>
        <p class="mt-2 text-[14px] leading-6 text-[var(--ink-2)]">
          客户端的更新提示会直接读取这里的说明，装一次就不用再手动换了。
        </p>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <a
            class="inline-flex items-center gap-2 rounded-full border border-transparent bg-[var(--accent)] px-4 py-2 text-[14px] font-semibold whitespace-nowrap text-white no-underline shadow-[0_2px_8px_rgba(var(--accent-rgb),0.24)] [transition:background_.3s_var(--ease),translate_.5s_var(--ease)] hover:-translate-y-0.5 hover:bg-[var(--accent-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            :href="DOWNLOAD_URL"
            target="_blank"
            rel="noopener"
          >
            去百度网盘下载
            <ArrowUpRight :size="13" aria-hidden="true" />
          </a>
          <router-link
            class="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-[14px] font-semibold whitespace-nowrap text-[var(--ink)] no-underline [transition:border-color_.3s_var(--ease),background_.3s_var(--ease)] hover:border-[var(--ink-3)] hover:bg-[var(--page)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            to="/"
          >
            回首页
          </router-link>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
