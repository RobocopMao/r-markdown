<script setup vapor lang="ts">
/**
 * 「Beta」角标：标在还在打磨的功能名后面。
 *
 * 抽成一个组件，是因为 AI 素材这个名字在四处分头出现——侧栏 AI 子菜单、移动端更多菜单、
 * AI 面板的标签页、设置的「AI 素材」卡片。四处各写一遍 `<span class="…">Beta</span>`，
 * 迟早会写歪（字号、圆角、深浅各不相同），改文案时也会漏掉一两处。
 *
 * 配色用 `currentColor` 混出淡底，所以放在灰字菜单、主题色选中的标签页、深色标题旁边
 * 都不用额外调，跟着所在元素的文字颜色走。
 */
const props = withDefaults(
  defineProps<{
    /** 角标文字 */
    label?: string
  }>(),
  { label: 'Beta' },
)
</script>

<template>
  <span class="beta-badge">{{ props.label }}</span>
</template>

<style scoped>
.beta-badge {
  display: inline-block;
  flex-shrink: 0;
  padding: 0 4px;
  border-radius: 4px;
  /* 跟着所在元素的文字色走：灰字菜单是浅灰底，主题色选中的标签页是浅白底 */
  background: color-mix(in srgb, currentColor 14%, transparent);
  font-size: 9px;
  font-weight: 700;
  line-height: 1.6;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  vertical-align: middle;
}
</style>
