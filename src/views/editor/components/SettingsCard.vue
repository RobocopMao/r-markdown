<script setup vapor lang="ts">
/**
 * 设置面板里的一张设置卡。
 *
 * 版式：左侧圆角图标块 + 标题 / 副标题，右上角放开关、下拉或按钮，正文放滑杆、
 * 输入框等控件，底部一行灰色说明。设计稿里每个设置项都是一张这样的卡，
 * 所以抽成组件，避免十几处重复写同样的 class。
 */
import type { Component } from 'vue'

const props = defineProps<{
  /** 卡片标题 */
  title: string
  /** 标题下面那行小字 */
  description?: string
  /** 左侧图标（lucide 组件） */
  icon?: Component
  /** 没有合适图标时用文字代替（如「A」「Tt」） */
  iconText?: string
}>()
</script>

<template>
  <section class="settings-card">
    <div class="flex items-start gap-3">
      <div v-if="props.icon || props.iconText" class="settings-card-icon">
        <component :is="props.icon" v-if="props.icon" :size="20" :stroke-width="1.9" />
        <span v-else class="settings-card-icon-text">{{ props.iconText }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="settings-card-title">{{ props.title }}</h3>
        <p v-if="props.description" class="settings-card-desc">{{ props.description }}</p>
      </div>
      <div v-if="$slots.action" class="shrink-0 pl-2">
        <slot name="action" />
      </div>
    </div>
    <div v-if="$slots.default" class="mt-3.5">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-card {
  border-radius: 16px;
  border: 1px solid var(--settings-card-border);
  background: var(--bg-primary);
  padding: 18px;
  transition: border-color 0.2s ease;
}

.settings-card:hover {
  border-color: var(--settings-hover-border);
}

.settings-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.settings-card-icon-text {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

.settings-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text-primary);
}

.settings-card-desc {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
