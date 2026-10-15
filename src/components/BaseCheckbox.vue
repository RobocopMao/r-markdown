<script setup lang="ts">
/**
 * 统一的勾选框。
 *
 * 项目里不用浏览器原生 <input type="checkbox">：素材卡片（MaterialCard）与图库
 * （ImageCacheDialog）一直都是「圆角方块 + 白色对勾、选中变主题色」的自绘样式。
 * 这里把该样式收敛成一个组件，新增勾选场景一律用它，避免各处长相不一致。
 *
 * 用法：`<BaseCheckbox :checked="x" @change="x = !x" />`，
 * 也可用 `label` 直接带文字（点击整块切换）。
 */
import { Check } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    checked: boolean
    /** 尺寸：sm=18px（表单内）/ md=20px（卡片，与素材卡片一致） */
    size?: 'sm' | 'md'
    /** 禁用（例如生成中） */
    disabled?: boolean
    /** 可选文字；提供后整块可点 */
    label?: string
  }>(),
  {
    size: 'md',
    disabled: false,
    label: '',
  },
)

const emit = defineEmits<{
  change: [checked: boolean]
}>()

function onToggle() {
  if (props.disabled) return
  emit('change', !props.checked)
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onToggle()
  }
}
</script>

<template>
  <!-- 只给方块（无 label）：调用方自行控制布局 -->
  <span
    v-if="!label"
    role="checkbox"
    :aria-checked="checked ? 'true' : 'false'"
    :tabindex="disabled ? -1 : 0"
    class="inline-flex shrink-0 items-center justify-center rounded border-2 transition-colors"
    :class="[
      size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5',
      checked
        ? 'border-[var(--accent)] bg-[var(--accent)]'
        : 'border-[#ccc] bg-white dark:border-[#555] dark:bg-[#2a2a2a]',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ]"
    @click.stop="onToggle"
    @keydown="onInputKeydown"
  >
    <Check v-if="checked" :size="size === 'sm' ? 12 : 13" class="text-white" />
  </span>

  <!-- 带文字：整块可点，配合胶囊/列表项使用 -->
  <span
    v-else
    role="checkbox"
    :aria-checked="checked ? 'true' : 'false'"
    :tabindex="disabled ? -1 : 0"
    class="inline-flex items-center gap-1.5"
    :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
    @click.stop="onToggle"
    @keydown="onInputKeydown"
  >
    <span
      class="inline-flex shrink-0 items-center justify-center rounded border-2 transition-colors"
      :class="[
        size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5',
        checked
          ? 'border-[var(--accent)] bg-[var(--accent)]'
          : 'border-[#ccc] bg-white dark:border-[#555] dark:bg-[#2a2a2a]',
      ]"
    >
      <Check v-if="checked" :size="size === 'sm' ? 12 : 13" class="text-white" />
    </span>
    <span class="truncate text-[12px] text-[#666] dark:text-[#999]"
      ><slot>{{ label }}</slot></span
    >
  </span>
</template>
