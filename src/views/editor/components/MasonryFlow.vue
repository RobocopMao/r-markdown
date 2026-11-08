<script lang="ts">
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  type VNode,
} from 'vue'

/**
 * 瀑布流容器：把默认插槽里的子节点按「当前最矮的一列」往下排，列本身用 flex 布局。
 *
 * 为什么不用 CSS 多列（`column-count`）：
 * Safari 在多列布局里会把「上一列最后一项的 margin-bottom」挪到「下一列第一项的上面」，
 * 于是右列第一张卡比左列第一张低一截、两列顶部对不齐（Chrome 下正常，本地很难发现）。
 * 换成「flex 列 + JS 测高」就绕开了这条 Safari 的 bug，原理与「我的素材」用的
 * @yeger/vue-masonry-wall 一致，只是那边是数据驱动，这里是插槽驱动（设置页的卡片是
 * 静态模板，塞不进 items 数组）。
 */
export default defineComponent({
  name: 'MasonryFlow',
  props: {
    /** 列间距、行间距 */
    gap: { type: Number, default: 20 },
    /** 每列的最小宽度，用来算列数 */
    minColumnWidth: { type: Number, default: 320 },
    /** 最多几列 */
    maxColumns: { type: Number, default: 2 },
  },
  setup(props, { slots }) {
    const rootRef = ref<HTMLElement | null>(null)
    const columnCount = ref(props.maxColumns)
    /** 每个子节点被分到第几列 */
    const assign = ref<number[]>([])

    let observer: ResizeObserver | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    /** 摊平插槽里的 Fragment，丢掉注释和纯空白文本 */
    function collect(vnodes: VNode[], out: VNode[]): VNode[] {
      for (const vn of vnodes) {
        if (vn.type === Comment) continue
        if (vn.type === Text) {
          if (String(vn.children ?? '').trim()) out.push(vn)
          continue
        }
        if (vn.type === Fragment) {
          if (Array.isArray(vn.children)) collect(vn.children as VNode[], out)
          continue
        }
        out.push(vn)
      }
      return out
    }

    /** 量一遍每张卡的高度，再贪心塞进当前最矮的那一列 */
    function measure() {
      const root = rootRef.value
      if (!root) return
      // 卡片里可能有输入框正在输入：这时重排会把节点挪到另一列、焦点当场丢掉，
      // 所以有焦点落在本容器内就跳过这次重排（失焦后 onUpdated 会再补一次）。
      if (root.contains(document.activeElement)) return
      const nodes = [...root.querySelectorAll<HTMLElement>('.masonry-item')]
      if (!nodes.length) return
      const cols = columnCount.value
      const heights = new Array<number>(nodes.length).fill(0)
      for (const el of nodes) {
        const index = Number(el.dataset.index)
        if (Number.isFinite(index)) heights[index] = el.getBoundingClientRect().height
      }
      const totals = new Array<number>(cols).fill(0)
      const next = new Array<number>(heights.length).fill(0)
      heights.forEach((height, index) => {
        let target = 0
        for (let c = 1; c < cols; c += 1) if (totals[c] < totals[target]) target = c
        next[index] = target
        totals[target] += height + props.gap
      })
      const changed =
        next.length !== assign.value.length || next.some((v, i) => v !== assign.value[i])
      if (changed) assign.value = next
    }

    function scheduleMeasure() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        measure()
      }, 50)
    }

    /** 逐卡监听高度：卡片内容变高变矮（展开说明、切换存储方式）时立刻重排 */
    let itemObserver: ResizeObserver | null = null
    function observeItems() {
      if (typeof ResizeObserver === 'undefined') return
      if (!itemObserver) itemObserver = new ResizeObserver(() => scheduleMeasure())
      itemObserver.disconnect()
      const root = rootRef.value
      if (!root) return
      for (const el of root.querySelectorAll('.masonry-item')) itemObserver.observe(el)
    }

    function syncColumns() {
      const root = rootRef.value
      if (!root) return
      const width = root.clientWidth
      if (width <= 0) return
      const fit = Math.floor((width + props.gap) / (props.minColumnWidth + props.gap))
      const next = Math.max(1, Math.min(props.maxColumns, fit))
      if (next !== columnCount.value) {
        columnCount.value = next
        assign.value = []
      }
    }

    onMounted(async () => {
      syncColumns()
      await nextTick()
      measure()
      observeItems()
      // 有焦点时 measure() 会主动跳过（避免输入中途卡片换列、焦点丢失），
      // 所以失焦后要补排一次，否则停在旧分列上
      rootRef.value?.addEventListener('focusout', scheduleMeasure)
      if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
        observer = new ResizeObserver(() => {
          syncColumns()
          scheduleMeasure()
        })
        observer.observe(rootRef.value)
      }
    })

    // 子卡内容变化（例如切换存储方式后多出几行）会让高度变，重新排一次；
    // 重排可能改变列内节点顺序，所以要重新登记逐卡观察
    onUpdated(() => {
      scheduleMeasure()
      observeItems()
    })

    onBeforeUnmount(() => {
      observer?.disconnect()
      observer = null
      itemObserver?.disconnect()
      itemObserver = null
      rootRef.value?.removeEventListener('focusout', scheduleMeasure)
      if (timer) clearTimeout(timer)
    })

    return () => {
      const kids = collect(slots.default?.() ?? [], [])
      const cols = columnCount.value
      const buckets: Array<Array<{ index: number; vnode: VNode }>> = Array.from(
        { length: cols },
        () => [],
      )
      kids.forEach((vnode, index) => {
        const column = Math.min(assign.value[index] ?? index % cols, cols - 1)
        buckets[column].push({ index, vnode: cloneVNode(vnode, { key: `k${index}` }) })
      })
      return h(
        'div',
        {
          ref: rootRef,
          class: 'masonry-flow',
          style: { display: 'flex', alignItems: 'flex-start', gap: `${props.gap}px` },
        },
        buckets.map((bucket, columnIndex) =>
          h(
            'div',
            {
              key: `col${columnIndex}`,
              class: 'masonry-column',
              style: {
                display: 'flex',
                flex: '1 1 0',
                minWidth: '0',
                flexDirection: 'column',
                gap: `${props.gap}px`,
              },
            },
            bucket.map(({ index, vnode }) =>
              h('div', { key: `item${index}`, class: 'masonry-item', 'data-index': index }, [
                vnode,
              ]),
            ),
          ),
        ),
      )
    }
  },
})
</script>
