<script setup vapor lang="ts">
/**
 * 瀑布流页面的通用装载骨架屏。
 *
 * 初衷：扩展组件页和素材库页都要先把数据渲染完才有第一张卡片，期间瀑布流是空的，
 * 页面一片白。两个页面各自写一套骨架会漂移，所以抽到这里统一外观与节奏。
 *
 * 为什么全用 Tailwind、不留样式块：骨架屏的每个形状都是一次性装饰，没有复用价值，
 * 写成 scoped CSS 只会让这套外观沉到文件底部，改个高度要跨半个文件去找。
 * 用工具类写，形状和它出现的位置就在同一行。
 *
 * 结构上用 CSS grid 模拟瀑布流（真实瀑布流由 JS 测高，加载期间拿不到高度），
 * 靠 nth-child 三档循环做出参差高度，视觉上更接近最终布局；
 * 列数、间距由调用方传入，保证骨架和真实卡片的列宽对得上，切换时不跳。
 */
const props = withDefaults(
  defineProps<{
    /** 骨架块数量 */
    blocks?: number
    /** 列数（与真实瀑布流保持一致） */
    cols?: number
    /** 列间距 px */
    gap?: number
    /** 提示文案 */
    hint?: string
    /**
     * 卡片形态：
     * - component：预览区 + 几行文字条（扩展组件页）
     * - material：预览区 + 底部信息栏（素材库页）
     */
    variant?: 'component' | 'material'
  }>(),
  {
    blocks: 6,
    cols: 2,
    gap: 24,
    hint: '加载中…',
    variant: 'component',
  },
)

/**
 * 参差高度：模仿真实内容的高低差，避免整屏像一排等高的砖。
 * 用 Tailwind 的 nth 变体写三档循环；素材卡多一条信息栏，整体比组件卡高一档。
 */
const CARD_HEIGHTS: Record<'component' | 'material', string> = {
  component: 'nth-[3n+1]:min-h-[208px] nth-[3n+2]:min-h-[264px] nth-[3n+3]:min-h-[232px]',
  material: 'nth-[3n+1]:min-h-[268px] nth-[3n+2]:min-h-[322px] nth-[3n+3]:min-h-[292px]',
}
</script>

<template>
  <div
    class="grid items-start"
    :class="props.cols === 2 ? 'grid-cols-2' : 'grid-cols-1'"
    :style="{ gap: `${props.gap}px` }"
    aria-busy="true"
    aria-live="polite"
  >
    <div
      v-for="(n, i) in props.blocks"
      :key="n"
      class="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-[var(--shadow-panel)] animate-pulse motion-reduce:animate-none"
      :class="[
        CARD_HEIGHTS[props.variant],
        // 两列时错开一拍的呼吸节奏，避免整屏一起闪
        props.cols === 2 && i % 2 === 1 ? '[animation-delay:0.45s]' : '',
      ]"
    >
      <!-- 预览区 -->
      <div class="flex flex-col gap-3 p-6">
        <span class="mb-1.5 block h-3.5 w-2/5 rounded-full bg-[var(--border-color)]"></span>
        <span class="block h-3 w-full rounded-full bg-[var(--border-color)]"></span>
        <span class="block h-3 w-3/4 rounded-full bg-[var(--border-color)]"></span>
        <span class="block h-3 w-1/2 rounded-full bg-[var(--border-color)]"></span>
      </div>

      <!-- 素材卡：底部信息栏（名称 / 描述 / 添加按钮位） -->
      <div
        v-if="props.variant === 'material'"
        class="flex items-center gap-3 border-t border-[var(--border-color)] px-5 py-4"
      >
        <span class="block h-3.5 w-1/3 shrink-0 rounded-full bg-[var(--border-color)]"></span>
        <span class="block h-3 flex-1 rounded-full bg-[var(--border-color)]"></span>
        <span class="block h-[26px] w-[60px] shrink-0 rounded-lg bg-[var(--border-color)]"></span>
      </div>
    </div>

    <p
      v-if="props.hint"
      class="col-span-full mt-1 text-center text-[13px] text-[var(--text-muted)]"
    >
      {{ props.hint }}
    </p>
  </div>
</template>
