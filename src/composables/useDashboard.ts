/**
 * 统计面板的状态与派生指标。
 *
 * 数据获取只做一次（进页面 / 主动刷新），派生指标全部用 computed 从快照算出来，
 * 这样切换时间范围、排序方式都不再触发 IO。
 *
 * 缓存策略：sessionStorage 存 5 分钟快照，防止来回切路由反复拉 GitHub。
 * 只缓存「聚合后的快照」，不缓存原始正文，避免把整篇文章塞进 sessionStorage（配额通常 5MB）。
 */
import { computed, ref } from 'vue'
import {
  collectDashboardData,
  currentStorageLabel,
  toDayKey,
  type ArticleStat,
  type DashboardData,
  type DraftStat,
} from '@/services/metricsCollector'
import { scoreBand } from '@/services/articleHealth'

const CACHE_KEY = 'r-markdown-dashboard-cache'
const CACHE_TTL = 5 * 60 * 1000

export type RangeKey = '30d' | '90d' | '365d'

export const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
  { key: '30d', label: '近 30 天', days: 30 },
  { key: '90d', label: '近 90 天', days: 90 },
  { key: '365d', label: '近一年', days: 365 },
]

/** 超过这个天数没动过的草稿算「僵尸稿」 */
export const STALE_DRAFT_DAYS = 14

interface CachePayload {
  at: number
  data: DashboardData
}

function readCache(): DashboardData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachePayload
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL) return null
    if (!parsed.data || !Array.isArray(parsed.data.drafts)) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(data: DashboardData): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch {
    /* 超配额就放弃缓存，不影响使用 */
  }
}

/** 24 小时毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000

/** 本地时区今天 0 点的毫秒数 */
export function startOfToday(): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.getTime()
}

/** 生成从 start 到今天的连续日期序列（含两端），用于热力图补齐空白天 */
function buildDayRange(startMs: number, endMs: number): string[] {
  const days: string[] = []
  const cursor = new Date(startMs)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(endMs)
  end.setHours(0, 0, 0, 0)
  let guard = 0
  while (cursor.getTime() <= end.getTime() && guard++ < 800) {
    days.push(toDayKey(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function useDashboard() {
  const data = ref<DashboardData | null>(null)
  const loading = ref(false)
  const error = ref('')
  const range = ref<RangeKey>('90d')
  const storageLabel = ref('')
  const refreshing = ref(false)

  const rangeDays = computed(() => RANGE_OPTIONS.find((o) => o.key === range.value)?.days ?? 90)

  async function load(force = false): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      if (!force) {
        const cached = readCache()
        if (cached) {
          data.value = cached
          storageLabel.value = await currentStorageLabel().catch(() => '')
          loading.value = false
          return
        }
      }
      const snapshot = await collectDashboardData()
      data.value = snapshot
      writeCache(snapshot)
      storageLabel.value = await currentStorageLabel().catch(() => '')
    } catch (e) {
      error.value = e instanceof Error ? e.message : '统计数据加载失败'
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  async function refresh(): Promise<void> {
    if (refreshing.value) return
    refreshing.value = true
    try {
      sessionStorage.removeItem(CACHE_KEY)
    } catch {
      /* ignore */
    }
    await load(true)
  }

  /* ── 基础集合 ── */

  const articles = computed<ArticleStat[]>(() => data.value?.articles ?? [])
  const drafts = computed<DraftStat[]>(() => data.value?.drafts ?? [])

  const rangeStart = computed(() => startOfToday() - (rangeDays.value - 1) * DAY_MS)

  /** 时间范围内有过动作的文章（用于「本期产出」等） */
  const recentArticles = computed(() =>
    articles.value.filter((a) => {
      const stamps = [a.updatedAt, a.fileMtime, ...a.commitDates].filter(
        (v): v is number => typeof v === 'number',
      )
      return stamps.some((ms) => ms >= rangeStart.value)
    }),
  )

  const recentDrafts = computed(() => drafts.value.filter((d) => d.updatedAt >= rangeStart.value))

  /* ── 概览 KPI ── */

  const kpi = computed(() => {
    const all = articles.value
    const chars = all.reduce((sum, a) => sum + a.chars, 0)
    const draftChars = drafts.value.reduce((sum, d) => sum + d.chars, 0)

    const thisMonthStart = new Date()
    thisMonthStart.setDate(1)
    thisMonthStart.setHours(0, 0, 0, 0)
    const monthArticles = all.filter((a) => (a.createdAt ?? 0) >= thisMonthStart.getTime())
    const monthDrafts = drafts.value.filter((d) => d.createdAt >= thisMonthStart.getTime())

    const stale = drafts.value.filter((d) => Date.now() - d.updatedAt > STALE_DRAFT_DAYS * DAY_MS)

    // 结构均分算「所有有正文的稿子」：文章 + 草稿
    const scored: number[] = [
      ...all.filter((a) => (a.health?.chars ?? 0) > 0).map((a) => a.health!.score),
      ...drafts.value.filter((d) => d.health.chars > 0).map((d) => d.health.score),
    ]
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
      : 0

    const published = drafts.value.filter((d) => d.published).length

    return {
      articleCount: all.length,
      draftCount: drafts.value.length,
      totalChars: chars,
      draftChars,
      totalWords: chars + draftChars,
      monthNew: monthArticles.length + monthDrafts.length,
      staleCount: stale.length,
      staleChars: stale.reduce((sum, d) => sum + d.chars, 0),
      avgScore,
      published,
      unpublishedDrafts: drafts.value.length - published,
      /** 篇均字数：文章 + 草稿一起算，浏览器版也有意义 */
      avgChars:
        all.length + drafts.value.length > 0
          ? Math.round((chars + draftChars) / (all.length + drafts.value.length))
          : 0,
    }
  })

  /* ── 活跃度 ── */

  /** 热力图格子：从范围起点到今天，按周对齐（周一起始） */
  const heatmap = computed(() => {
    const counts = new Map<string, number>()
    for (const item of data.value?.activity ?? []) counts.set(item.day, item.count)

    const days = buildDayRange(rangeStart.value, Date.now())
    // 补齐到整周，前面空出来的位置留空，SVG 网格才不会错位
    const first = new Date(`${days[0]}T00:00:00`)
    const lead = (first.getDay() + 6) % 7

    const cells: { day: string | null; count: number; level: number }[] = []
    for (let i = 0; i < lead; i++) cells.push({ day: null, count: 0, level: 0 })
    for (const day of days) {
      const count = counts.get(day) ?? 0
      cells.push({ day, count, level: levelOf(count) })
    }
    return cells
  })

  /** 分档：0 / 1 / 2-3 / 4-6 / 7+ */
  function levelOf(count: number): number {
    if (count <= 0) return 0
    if (count === 1) return 1
    if (count <= 3) return 2
    if (count <= 6) return 3
    return 4
  }

  const activityStats = computed(() => {
    const map = new Map<string, number>()
    for (const item of data.value?.activity ?? []) map.set(item.day, item.count)
    const days = buildDayRange(rangeStart.value, Date.now())
    const activeDays = days.filter((d) => (map.get(d) ?? 0) > 0)
    const total = days.reduce((sum, d) => sum + (map.get(d) ?? 0), 0)

    // 最长连续活跃天数
    let best = 0
    let run = 0
    for (const d of days) {
      if ((map.get(d) ?? 0) > 0) {
        run++
        if (run > best) best = run
      } else {
        run = 0
      }
    }

    // 当前连续（从今天往回数，今天没动就断）
    let streak = 0
    for (let i = days.length - 1; i >= 0; i--) {
      if ((map.get(days[i]) ?? 0) > 0) streak++
      else break
    }

    // 最活跃的一天
    let bestDay = ''
    let bestCount = 0
    for (const [day, count] of map) {
      if (count > bestCount) {
        bestCount = count
        bestDay = day
      }
    }

    return {
      activeDays: activeDays.length,
      totalEvents: total,
      longestStreak: best,
      streak,
      bestDay,
      bestCount,
      coverage: days.length ? Math.round((activeDays.length / days.length) * 100) : 0,
    }
  })

  /* ── 体检表 ── */

  /**
   * 体检范围 = 已入库文章 + 草稿。
   * 草稿也一起体检：刚写完还没归档的稿子恰恰最需要看结构，
   * 而且浏览器版没有文章树，只算文章的话这个表会永远空着。
   */
  const healthRows = computed(() => {
    const fromArticles = articles.value
      .filter((a) => a.health !== null)
      .map((a) => {
        const health = a.health!
        return {
          key: a.key,
          id: a.id,
          title: a.title,
          folder: a.folder,
          source: a.source as 'local' | 'github' | 'draft',
          chars: health.chars,
          minutes: health.minutes,
          paragraphs: health.paragraphs,
          avgParagraphChars: health.avgParagraphChars,
          longParagraphs: health.longParagraphs,
          headings: health.headings,
          headingJumps: health.headingJumps,
          images: health.images,
          components: health.components,
          bannedCount: health.bannedCount,
          bannedSample: health.bannedSample,
          issues: health.issues,
          score: health.score,
          band: scoreBand(health.score),
          updatedAt: a.updatedAt ?? a.fileMtime,
        }
      })

    const fromDrafts = drafts.value.map((d) => ({
      key: `draft:${d.id}`,
      id: String(d.id),
      title: d.title,
      folder: '',
      source: 'draft' as const,
      chars: d.health.chars,
      minutes: d.health.minutes,
      paragraphs: d.health.paragraphs,
      avgParagraphChars: d.health.avgParagraphChars,
      longParagraphs: d.health.longParagraphs,
      headings: d.health.headings,
      headingJumps: d.health.headingJumps,
      images: d.health.images,
      components: d.health.components,
      bannedCount: d.health.bannedCount,
      bannedSample: d.health.bannedSample,
      issues: d.health.issues,
      score: d.health.score,
      band: scoreBand(d.health.score),
      updatedAt: d.updatedAt,
    }))

    return [...fromArticles, ...fromDrafts].sort((a, b) => a.score - b.score)
  })

  /** 有问题的篇数（结构分 < 85） */
  const problemCount = computed(() => healthRows.value.filter((r) => r.score < 85).length)

  /* ── 产量分布 ── */

  /**
   * 按栏目统计。
   * 草稿单独算一栏「草稿箱」：浏览器版没有文章树时这里也不会全空。
   */
  const byFolder = computed(() => {
    const map = new Map<string, { folder: string; count: number; chars: number }>()
    const add = (folder: string, chars: number) => {
      const item = map.get(folder) ?? { folder, count: 0, chars: 0 }
      item.count++
      item.chars += chars
      map.set(folder, item)
    }
    for (const article of articles.value) add(article.folder, article.chars)
    for (const draft of drafts.value) add('草稿箱', draft.chars)
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  })

  /** 所有写过的稿子（文章 + 草稿），字数分布用这个 */
  const works = computed(() => [
    ...articles.value.map((a) => a.chars),
    ...drafts.value.map((d) => d.chars),
  ])

  /** 字数直方图分箱 */
  const charBuckets = computed(() => {
    const edges = [
      { label: '<500', min: 0, max: 500 },
      { label: '500–1k', min: 500, max: 1000 },
      { label: '1k–2k', min: 1000, max: 2000 },
      { label: '2k–4k', min: 2000, max: 4000 },
      { label: '4k+', min: 4000, max: Infinity },
    ]
    const all = works.value.filter((chars) => chars > 0)
    return edges.map((edge) => ({
      label: edge.label,
      count: all.filter((chars) => chars >= edge.min && chars < edge.max).length,
    }))
  })

  const distribution = computed(() => {
    const values = works.value.filter((n) => n > 0).sort((a, b) => a - b)
    if (!values.length) return { median: 0, total: 0, avg: 0, max: 0, min: 0 }
    const mid = Math.floor(values.length / 2)
    const median =
      values.length % 2 === 0 ? Math.round((values[mid - 1] + values[mid]) / 2) : values[mid]
    const total = values.reduce((sum, n) => sum + n, 0)
    return {
      median,
      total,
      avg: Math.round(total / values.length),
      max: values[values.length - 1],
      min: values[0],
    }
  })

  /* ── 存活流转 ── */

  const staleDrafts = computed(() =>
    drafts.value
      .filter((d) => Date.now() - d.updatedAt > STALE_DRAFT_DAYS * DAY_MS)
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .map((d) => ({
        ...d,
        idleDays: Math.floor((Date.now() - d.updatedAt) / DAY_MS),
      })),
  )

  const draftAging = computed(() => {
    const buckets = [
      { label: '今天动过', min: 0, max: 1 },
      { label: '2–7 天', min: 1, max: 7 },
      { label: '8–14 天', min: 7, max: 14 },
      { label: '14 天以上', min: 14, max: Infinity },
    ]
    return buckets.map((b) => ({
      label: b.label,
      count: drafts.value.filter((d) => {
        const days = (Date.now() - d.updatedAt) / DAY_MS
        return days >= b.min && days < b.max
      }).length,
    }))
  })

  /* ── 洞察（纯规则句式） ── */

  const insights = computed(() => {
    const list: { tone: 'good' | 'warn' | 'info'; text: string }[] = []
    const k = kpi.value
    const act = activityStats.value

    if (k.articleCount === 0 && k.draftCount === 0) {
      list.push({ tone: 'info', text: '还没有任何文章或草稿，先在编辑器里写点什么吧。' })
      return list
    }

    if (act.streak >= 3) {
      list.push({ tone: 'good', text: `已经连续活跃 ${act.streak} 天，节奏稳住了。` })
    } else if (act.activeDays > 0) {
      list.push({
        tone: 'info',
        text: `${RANGE_OPTIONS.find((o) => o.key === range.value)?.label}内有 ${act.activeDays} 天动过稿子，占 ${act.coverage}%。`,
      })
    }

    if (k.staleCount > 0) {
      list.push({
        tone: 'warn',
        text: `有 ${k.staleCount} 篇草稿超过 ${STALE_DRAFT_DAYS} 天没动，合计 ${k.staleChars} 字，可以挑一篇续上或归档。`,
      })
    }

    if (problemCount.value > 0) {
      const worst = healthRows.value[0]
      list.push({
        tone: 'warn',
        text: `${problemCount.value} 篇有可改的体检问题，最需要处理的是《${worst.title}》（${worst.score} 分，${worst.issues[0]?.text ?? '待检查'}）。`,
      })
    }

    if (k.avgScore >= 90) {
      list.push({ tone: 'good', text: `文章结构平均 ${k.avgScore} 分，排版习惯很稳。` })
    }

    if (distribution.value.median > 0) {
      list.push({
        tone: 'info',
        text: `稿子字数中位数 ${distribution.value.median} 字，最长 ${distribution.value.max} 字，最短 ${distribution.value.min} 字。`,
      })
    }

    if (byFolder.value.length > 1) {
      const top = byFolder.value[0]
      list.push({
        tone: 'info',
        text: `栏目「${top.folder}」文章最多（${top.count} 篇）。`,
      })
    }

    if (k.unpublishedDrafts > 0) {
      list.push({
        tone: 'info',
        text: `${k.unpublishedDrafts} 篇草稿还没推过公众号。`,
      })
    }

    return list.slice(0, 6)
  })

  return {
    data,
    loading,
    refreshing,
    error,
    range,
    rangeDays,
    storageLabel,
    load,
    refresh,
    articles,
    drafts,
    recentArticles,
    recentDrafts,
    kpi,
    heatmap,
    activityStats,
    healthRows,
    problemCount,
    byFolder,
    charBuckets,
    distribution,
    staleDrafts,
    draftAging,
    insights,
  }
}
