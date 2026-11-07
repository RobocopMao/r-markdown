<script setup lang="ts">
/**
 * 编辑区内嵌面板的统一头部。
 *
 * 统计 / 草稿箱 / 图库 / 我的素材 / 违禁词检测 / 设置 六块面板共用这一份，保证版式一致：
 *   · 左上角是返回图标（点它回编辑区），标题紧随图标之后，
 *     原本写在标题下面那行描述改成跟标题同一行、接在标题后面；
 *   · 搜索框放在这一行的正中间——左右两列等宽（grid 的 1fr / auto / 1fr），
 *     所以搜索框是真正居中，不会因为左右内容宽度不同而偏；
 *   · 动作按钮（插入 / 删除选中 / 发布 / 刷新…）靠右；
 *   · 标签页按钮统一放在标题下面一行、靠左对齐。
 *
 * 插槽：#search（中间搜索框）、#actions（右侧动作）、#tabs（标题下面那排标签页）。
 * 没有传的插槽不占位：左右两列依旧等宽，标题也不会被挤偏。
 * 三列都显式写了 col-start，否则没有搜索框时网格自动放置会把动作按钮塞进中间那列。
 */
import { useSlots } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    /** 面板标题 */
    title: string
    /** 跟标题同一行、接在标题后面的说明文字 */
    description?: string
    /** 是否显示左上角返回图标（独立页面没有「返回编辑」的概念，传 false） */
    showBack?: boolean
    /** 标题字号类：内嵌面板 18px，独立页面可传 text-[22px] */
    titleClass?: string
    /**
     * 头部与下方内容的间距类。
     *
     * 默认 `mb-4`，给「头部 → 卡片网格」这种需要明显分隔的面板用。
     * 内容区自己已经有内边距、再留 16px 会显得空的面板（如 AI）传 `mb-0` 收掉。
     */
    marginClass?: string
  }>(),
  {
    description: '',
    showBack: true,
    titleClass: 'text-[18px]',
    marginClass: 'mb-4',
  },
)

const emit = defineEmits<{
  close: []
}>()

const slots = useSlots()
</script>

<template>
  <div :class="props.marginClass">
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-2 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <!-- 左：返回图标 + 标题 + 描述（同一行） -->
      <div class="flex min-w-0 items-center gap-2 md:col-start-1 md:justify-self-start">
        <button
          v-if="props.showBack"
          type="button"
          class="board-back-btn"
          title="返回编辑"
          aria-label="返回编辑"
          @click="emit('close')"
        >
          <ArrowLeft :size="16" />
        </button>
        <h1 :class="props.titleClass" class="shrink-0 font-semibold tracking-tight">
          {{ props.title }}
        </h1>
        <span
          v-if="props.description"
          class="min-w-0 truncate text-[12px] text-[var(--text-secondary)]"
        >
          {{ props.description }}
        </span>
      </div>

      <!-- 中：搜索框（窄屏落到下一行、占满宽度） -->
      <div
        v-if="slots.search"
        class="order-last w-full md:col-start-2 md:order-none md:w-auto md:justify-self-center"
      >
        <slot name="search" />
      </div>

      <!-- 右：动作按钮（没有搜索框时也固定在第三列，不会被自动放置挤到中间） -->
      <div
        v-if="slots.actions"
        class="ml-auto flex flex-wrap items-center gap-2 md:col-start-3 md:order-none md:ml-0 md:justify-self-end"
      >
        <slot name="actions" />
      </div>
    </div>

    <!-- 标签页：标题下面一行、靠左 -->
    <div v-if="slots.tabs" class="mt-2.5 flex flex-wrap items-center gap-1.5">
      <slot name="tabs" />
    </div>
  </div>
</template>

<style scoped>
/* 返回图标：与「返回编辑」文字按钮同色系，但收成标题前面的一颗小方块图标 */
.board-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s,
    border-color 0.2s;
}

.board-back-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
</style>
