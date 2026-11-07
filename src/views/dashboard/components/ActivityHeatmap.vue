<script setup vapor lang="ts">
/**
 * 活跃日历热力图。
 *
 * 用 CSS Grid 排（7 行 × N 列），行对应周一~周日，列对应自然周。
 * 每格的颜色由 --accent 叠加不同透明度得到，所以换主题色会整体跟着变。
 * 不用 SVG 是因为格子要 hover 出 tooltip，DOM 元素上做交互更省事。
 *
 * 格子边长不写死：容器宽就放大铺满，窄到一定程度才退回最小尺寸并出横向滚动条。
 * 写死 13px 的话，一年 53 列只占 870px，卡片通栏一千多像素时右边会空一大块。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface HeatCell {
  day: string | null
  count: number
  level: number
}

const props = defineProps<{
  cells: HeatCell[]
  activeDays: number
  longestStreak: number
  coverage: number
}>()

/** 格子最小值：再小就点不中、也看不清 */
const CELL_MIN = 13
/** 格子最大值：再大就变成色块墙，不好扫读 */
const CELL_MAX = 22
/** 列间距 / 行间距的基准值 */
const GAP = 3
/** 左侧星期标尺占的宽度（标尺 18px + 右边距 4px） */
const RULER_WIDTH = 22
/**
 * 滚动容器上、下、右三边留的余量（左边不留，见下）。
 *
 * 格子悬停时会 scale-125 往四周探出去（22px 的格子单边约 2.75px），
 * 滚动容器是 overflow-x-auto，探出去的部分会被裁掉——最右一列尤其明显。
 * 留 4px 让放大的方块完整露出来，同时下面的 measure() 要把这 4px 减掉，
 * 否则内容会比容器宽，白白多出一条横向滚动条。
 *
 * 左边故意不留：格子都在星期标尺右侧，左侧没有需要露出的悬停内容；
 * 而一旦留了左边距，sticky 标尺只贴内容盒左沿，滑过去的格子会从那 4px 缝里
 * 露出半截边角（实测最右一列有 7 个格子漏出来）。去掉左边距就彻底没缝了。
 */
const HOVER_PAD = 4

/** 把线性排列的格子切成「每周一列」的分组 */
const columns = computed(() => {
  const result: HeatCell[][] = []
  for (let i = 0; i < props.cells.length; i += 7) {
    result.push(props.cells.slice(i, i + 7))
  }
  return result
})

/** 七行只标行号为偶数的四个：一 / 三 / 五 / 日 */
const WEEK_ROWS = ['一', '', '三', '', '五', '', '日']

/** 月份标签：某列第一天所在月份，避免重复显示同一个月 */
const monthLabels = computed(() => {
  const labels: (string | null)[] = []
  let last = ''
  for (const column of columns.value) {
    const firstDay = column.find((c) => c.day)?.day
    if (!firstDay) {
      labels.push(null)
      continue
    }
    const month = `${Number(firstDay.slice(5, 7))}月`
    if (month !== last) {
      labels.push(month)
      last = month
    } else {
      labels.push(null)
    }
  }
  return labels
})

const LEVEL_CLASS: Record<number, string> = {
  0: 'bg-[var(--bg-secondary)]',
  1: 'bg-[rgba(var(--accent-rgb),0.25)]',
  2: 'bg-[rgba(var(--accent-rgb),0.45)]',
  3: 'bg-[rgba(var(--accent-rgb),0.7)]',
  4: 'bg-[var(--accent)]',
}

function titleOf(cell: HeatCell): string {
  if (!cell.day) return ''
  return cell.count > 0 ? `${cell.day} · ${cell.count} 项动过` : `${cell.day} · 没动`
}

/* ── 自适应格子尺寸 ── */

const rootRef = ref<HTMLElement | null>(null)
const scrollerRef = ref<HTMLElement | null>(null)
const cellSize = ref(CELL_MIN)
const gapSize = ref(GAP)
let observer: ResizeObserver | null = null

/**
 * 是否「贴着最右边」。
 *
 * 一年 53 列在窄屏（尤其移动端）放不下，而人最想看的是最近几天，
 * 所以初始化时直接把滚动条拉到最右。之后如果用户自己往左滑走了，
 * 就不能再把他拽回来——只有还贴着右边时，尺寸变化才继续跟着滚到底。
 */
let pinnedToRight = true

function scrollToRight(): void {
  const el = scrollerRef.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  if (max > 0) el.scrollLeft = max
}

function onScroll(): void {
  const el = scrollerRef.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  pinnedToRight = max <= 0 ? true : max - el.scrollLeft < 2
}

/**
 * 按容器宽度算格子边长。
 *
 * 关键是不取整：一年 53 列，若把每格取整到整数或两位小数，误差会累积成
 * 几像素的余量，看起来就是右边空了一条。直接用小数像素，交给浏览器排版，
 * 恰好铺满。宽度不够（算出来小于 CELL_MIN）时才退回最小尺寸，由外层出滚动条。
 *
 * 注意 flex 里星期标尺也是一个子元素，所以间距数量是「列数」而不是「列数 - 1」，
 * 少算一个 gap 就会比容器宽出 3px。
 */
function measure(): void {
  const el = rootRef.value
  if (!el) return
  const count = columns.value.length
  if (!count) return

  const available = el.clientWidth - RULER_WIDTH - HOVER_PAD
  let size = (available - GAP * count) / count

  if (size > CELL_MAX) {
    // 格子到顶了，剩下的宽度摊给列间距
    size = CELL_MAX
    gapSize.value = (available - size * count) / count
  } else {
    gapSize.value = GAP
  }
  if (size < CELL_MIN) size = CELL_MIN

  cellSize.value = size

  // 尺寸变了可滚动范围也会变，贴着右边时跟着滚到新的最右
  if (pinnedToRight) {
    requestAnimationFrame(() => {
      if (pinnedToRight) scrollToRight()
    })
  }
}

onMounted(() => {
  measure()
  scrollToRight()
  // 首屏字体/布局稳定后再对一次，避免量出来的宽度比实际小、滚不到底
  requestAnimationFrame(() => scrollToRight())
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

// 数据刷新（比如换了一批稿子）导致列数变化时重算一次
watch(
  () => columns.value.length,
  () => measure(),
)
</script>

<template>
  <div ref="rootRef" class="min-w-0">
    <div
      class="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px] text-[var(--text-secondary)]"
    >
      <span>
        <b class="text-[15px] font-semibold text-[var(--text-primary)]">{{ activeDays }}</b>
        天动过稿
      </span>
      <span>
        最长连续
        <b class="text-[15px] font-semibold text-[var(--text-primary)]">{{ longestStreak }}</b>
        天
      </span>
      <span>覆盖率 {{ coverage }}%</span>
    </div>

    <!--
      卡片够宽时格子跟着放大铺满整行；窄到 13px 还放不下时，
      只有这一块出横向滚动条，不把外层页面撑出横向滚动。
      上下右各留 4px 给悬停放大（见 HOVER_PAD），左边不留 —— 否则 sticky 标尺
      和格子之间会有一条 4px 缝，滑到中间时格子从缝里露出边角。
      窄屏默认滚到最右（最近的日子），星期标尺 sticky 在左边一直看得见。
    -->
    <div ref="scrollerRef" class="w-full overflow-x-auto pt-1 pr-1 pb-1" @scroll.passive="onScroll">
      <div class="w-max">
        <!-- 月份标尺 -->
        <div class="mb-1 flex" :style="{ gap: `${gapSize}px`, paddingLeft: `${RULER_WIDTH}px` }">
          <div
            v-for="(label, index) in monthLabels"
            :key="index"
            class="shrink-0 text-[10px] leading-none whitespace-nowrap text-[var(--text-muted)]"
            :style="{ width: `${cellSize}px` }"
          >
            {{ label ?? '' }}
          </div>
        </div>

        <div class="flex" :style="{ gap: `${gapSize}px` }">
          <!--
            星期标尺：隔行标注，避免挤成一片。
            sticky 是为了横向滑到右边时它还在——否则一年 53 列在移动端一滚，星期就没了，
            看到的是一排不知星期几的方块。底色必须不透明，否则格子会从字底下穿过去。
          -->
          <div
            class="sticky left-0 z-10 flex shrink-0 flex-col bg-[var(--bg-primary)]"
            :style="{
              width: `${RULER_WIDTH - 4}px`,
              marginRight: '4px',
              gap: `${gapSize}px`,
            }"
          >
            <div
              v-for="(label, index) in WEEK_ROWS"
              :key="index"
              class="text-[10px] leading-none text-[var(--text-muted)]"
              :style="{ height: `${cellSize}px`, lineHeight: `${cellSize}px` }"
            >
              {{ label }}
            </div>
          </div>

          <div
            v-for="(column, colIndex) in columns"
            :key="colIndex"
            class="flex shrink-0 flex-col"
            :style="{ gap: `${gapSize}px` }"
          >
            <div
              v-for="(cell, rowIndex) in column"
              :key="rowIndex"
              class="rounded-[3px] transition-transform duration-150"
              :style="{ width: `${cellSize}px`, height: `${cellSize}px` }"
              :class="[
                cell.day ? LEVEL_CLASS[cell.level] : 'bg-transparent',
                cell.day ? 'hover:scale-125' : '',
              ]"
              :title="titleOf(cell)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
      <span>少</span>
      <span
        v-for="level in [0, 1, 2, 3, 4]"
        :key="level"
        class="h-[11px] w-[11px] rounded-[2px]"
        :class="LEVEL_CLASS[level]"
      />
      <span>多</span>
    </div>
  </div>
</template>
