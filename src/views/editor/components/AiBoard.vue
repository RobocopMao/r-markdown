<script setup lang="ts">
/**
 * AI 面板：写作 / 排版 / 配图三合一。
 *
 * 原来这是三个独立的抽屉（AiWriteDialog / AiFormatDialog / AiImageDialog），
 * 点侧栏「AI」的二级菜单会从右边滑出整屏高的抽屉盖住编辑器——和统计、草稿箱、
 * 图库那些已经改成「占满编辑区」的面板风格不一致，也没法一边看正文一边用 AI。
 *
 * 这里沿用同一套面板范式（BoardHeader + 编辑区占位），三个子组件**原样复用**，
 * 只给 BaseDrawer 传 embedded：去掉传送门、遮罩、抽屉外框与滑入动效，
 * 把「头部插槽 / 内容 / 页脚」三段直接铺在面板里。三千行界面不用复制一遍。
 *
 * 显隐策略：
 * - 面板本身由父级 v-show 控制（保留各 AI 的会话、结果、输入框内容，切走再回来还在）。
 * - 三个子组件的 visible 都跟着 active 走，**不跟着 tab 走**：
 *   否则从「写作」切到「配图」会把在途请求 abort 掉，回来还得重发。
 *   代价是打开面板时三者一起初始化（读配置 + 恢复上次结果），都是本地读，可以接受。
 */
import { computed } from 'vue'
import BoardHeader from './BoardHeader.vue'
import AiWriteDialog from './AiWriteDialog.vue'
import AiFormatDialog from './AiFormatDialog.vue'
import AiImageDialog from './AiImageDialog.vue'

/** 三个标签页的键 */
export type AiTab = 'write' | 'format' | 'image'

const props = defineProps<{
  /** 面板是否显示（父级 v-show 用，同时驱动三个子组件的「打开时初始化」） */
  active: boolean
  /** 当前标签页 */
  tab: AiTab
  /** 编辑器当前内容 */
  markdown: string
  /** 图床上传进行中（AI 配图用） */
  uploading?: boolean
}>()

const emit = defineEmits<{
  close: []
  /** 切换标签页（由父级持有状态，便于菜单点谁就切谁） */
  'update:tab': [tab: AiTab]
  /** AI 写作的稿件应用 */
  applyWrite: [text: string]
  /** AI 写作的稿件应用后留在 AI 面板、切到「AI 排版」 */
  applyWriteAndFormat: [text: string]
  /** AI 排版结果应用 */
  applyFormat: [text: string]
  /** 配图：插入编辑器 */
  insert: [file: File]
  /** 配图：上传图床并插入 */
  upload: [file: File]
  /** 配图：保存磁盘并插入（仅桌面端） */
  saveDisk: [file: File]
  /** 配图：只加入本地图库 */
  addGallery: [file: File]
  /** 配图：只加入本地磁盘 */
  addDisk: [file: File]
  /** 跳转设置：写作 / 排版落到「AI 文本」子页，配图落到「AI 图片」子页 */
  openSettingsWrite: []
  openSettingsFormat: []
  openSettingsImage: []
}>()

const TABS: { key: AiTab; label: string }[] = [
  { key: 'write', label: 'AI 写作' },
  { key: 'format', label: 'AI 排版' },
  { key: 'image', label: 'AI 配图' },
]

/** 副标题跟着标签页走，一句话说清这一页在干什么 */
const DESCRIPTION: Record<AiTab, string> = {
  write: '和 AI 一起写稿，满意后一键替换编辑器内容',
  format: '按 R-Markdown 规范重排全文，应用前可对比差异',
  image: '生成配图，插入编辑器或存进图库 / 磁盘',
}

const description = computed(() => DESCRIPTION[props.tab])
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" style="background: var(--bg-primary)">
    <!-- 头部固定在顶部，只有下面的内容区滚动：AI 写作的输入框在页脚，需要一直可见 -->
    <div class="shrink-0 px-4 pt-4">
      <!--
        margin-class="mb-0"：AI 面板的内容区（对话流 / 排版设置 / 配图参数）自带内边距，
        再叠一个 16px 的头部下边距会显得空，这里收掉。
      -->
      <BoardHeader title="AI" :description="description" margin-class="mb-0" @close="emit('close')">
        <template #tabs>
          <button
            v-for="t in TABS"
            :key="t.key"
            class="board-tab"
            :class="{ active: props.tab === t.key }"
            @click="emit('update:tab', t.key)"
          >
            {{ t.label }}
          </button>
        </template>
      </BoardHeader>
    </div>

    <div class="min-h-0 flex-1">
      <div v-show="props.tab === 'write'" class="h-full">
        <AiWriteDialog
          embedded
          :visible="props.active"
          :markdown="props.markdown"
          @close="emit('close')"
          @apply="emit('applyWrite', $event)"
          @apply-and-format="emit('applyWriteAndFormat', $event)"
          @open-settings="emit('openSettingsWrite')"
        />
      </div>
      <div v-show="props.tab === 'format'" class="h-full">
        <AiFormatDialog
          embedded
          :visible="props.active"
          :markdown="props.markdown"
          @close="emit('close')"
          @apply="emit('applyFormat', $event)"
          @open-settings="emit('openSettingsFormat')"
        />
      </div>
      <div v-show="props.tab === 'image'" class="h-full">
        <AiImageDialog
          embedded
          :visible="props.active"
          :markdown="props.markdown"
          :uploading="props.uploading"
          @close="emit('close')"
          @insert="emit('insert', $event)"
          @upload="emit('upload', $event)"
          @save-disk="emit('saveDisk', $event)"
          @add-gallery="emit('addGallery', $event)"
          @add-disk="emit('addDisk', $event)"
          @open-settings="emit('openSettingsImage')"
        />
      </div>
    </div>
  </div>
</template>
