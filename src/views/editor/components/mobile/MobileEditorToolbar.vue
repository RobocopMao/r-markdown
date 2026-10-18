<script setup lang="ts">
/**
 * 移动端编辑 Tab 顶部的快捷工具栏。
 *
 * PC 端这些按钮放在面板标题栏（.panel-header）里，靠 hover 展开二级菜单；
 * 触屏没有 hover，标题栏在移动端本来也是 hidden，所以这里重新做一份：
 * 图标横向滚动条 + 点击弹出底部面板。功能与 PC 左侧那一组一一对应：
 *   基础 / 容器 / 图片 / 组件 / 解析 + 13 个行内样式
 *
 * 真正的插入动作都回传给 EditorPage 处理——语法模板、表格行列、图片落盘链路
 * 全在 useToolbar / useImageInsert 里，这里只负责「显示什么 + 点给谁」，
 * 不要再复制一份插入逻辑，否则两端口径迟早会走散。
 */
import { ref } from 'vue'
import {
  AlignLeft,
  Box,
  Braces,
  Image as ImageIcon,
  ImagePlus,
  ImageUp,
  HardDrive,
  Puzzle,
  X,
  // 分区标题与布局项用与 PC 工具栏相同的图标，保证两端认图一致
  Table,
  Columns2,
  Rows2,
  Layers,
  Package,
  Type,
  Code2,
  Undo2,
} from 'lucide-vue-next'
import {
  formatIcons,
  markdownInsertOptions,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  MAX_COLS,
  MAX_ROWS,
} from '../../composables/useToolbar'
import { inlineFormatOptions } from '@/utils/inlineFormat'

const props = defineProps<{
  /** 光标在空行行首：基础/容器/图片/组件都要求这个条件 */
  atLineStart: boolean
  /** 选中了单行文字：行内样式才可用 */
  hasSelection: boolean
  /** 主题色，图标染色用 */
  accent: string
  /** 桌面客户端才有「磁盘存储」 */
  isTauri: boolean
  /** 图床正在上传，避免重复点 */
  uploading: boolean
  /** 图床名称，显示在「上传图床」右侧 */
  uploadLabel: string
  /** 光标落在一个可解析的组件标签上 */
  tagAvailable: boolean
  /** 历史栈里还有可撤销的改动 */
  canUndo: boolean
}>()

const emit = defineEmits<{
  'inline-format': [syntax: string, wrapType: 'delim' | 'tag']
  'insert-syntax': [syntax: string]
  'insert-table': [rows: number, cols: number]
  'insert-column': [cols: number]
  'insert-column-stack': [cols: number]
  'insert-row': [rows: number]
  'insert-stack': []
  'insert-container': []
  'insert-text': []
  'insert-html': []
  'image-temp': []
  'image-persist': []
  'image-disk': []
  'image-hosting': []
  'open-components': []
  'open-tag': []
  undo: []
}>()

/** 当前展开的底部面板，空串表示关闭 */
const panel = ref<'' | 'basic' | 'layout' | 'image'>('')

function togglePanel(kind: 'basic' | 'layout' | 'image') {
  panel.value = panel.value === kind ? '' : kind
}

/** 点完一项就收起面板，别让用户再手动关一次 */
function done() {
  panel.value = ''
}

function onInline(opt: (typeof inlineFormatOptions)[number]) {
  if (!props.hasSelection) return
  emit('inline-format', opt.syntax, opt.wrapType ?? 'delim')
  done()
}

function onInsertSyntax(syntax: string) {
  if (!props.atLineStart) return
  emit('insert-syntax', syntax)
  done()
}

/**
 * 表格方格：触屏没有 hover 预览，直接「点第几格 = 插入几行几列」。
 * 第 i 格换算成 rows/cols 的公式与 PC 的 getGridCellClass 保持一致。
 */
function onTableCell(i: number) {
  if (!props.atLineStart) return
  emit('insert-table', Math.ceil(i / MAX_GRID_COLS), ((i - 1) % MAX_GRID_COLS) + 1)
  done()
}

function onColumn(count: number) {
  if (!props.atLineStart) return
  emit('insert-column', count)
  done()
}

function onColumnStack(count: number) {
  if (!props.atLineStart) return
  emit('insert-column-stack', count)
  done()
}

function onRow(count: number) {
  if (!props.atLineStart) return
  emit('insert-row', count)
  done()
}

/**
 * 容器类四个一次性插入项。
 * 写成方法而不是模板里的 `emit(...); done()`——Vue 模板表达式不支持换行分隔语句，
 * prettier 一折行就会编译失败（这个坑在 TreeSidebar 上踩过一次）。
 */
function onLayoutItem(kind: 'stack' | 'container' | 'text' | 'html') {
  if (!props.atLineStart) return
  if (kind === 'stack') emit('insert-stack')
  else if (kind === 'container') emit('insert-container')
  else if (kind === 'text') emit('insert-text')
  else emit('insert-html')
  done()
}

function onImage(kind: 'temp' | 'persist' | 'disk' | 'hosting') {
  if (!props.atLineStart) return
  if (kind === 'hosting' && props.uploading) return
  if (kind === 'temp') emit('image-temp')
  else if (kind === 'persist') emit('image-persist')
  else if (kind === 'disk') emit('image-disk')
  else emit('image-hosting')
  done()
}

/*
 * 面板里十几行的排版完全一致，只有「静态分区标题」与「可点功能行」在
 * 指针与按压反馈上不同，所以把公用部分抽成常量，避免同一串 Tailwind 类写十几遍。
 * 样式全用 Tailwind 工具类，不再写 <style> 块；颜色一律走 CSS 变量，
 * 深浅色由 dark: 变体（项目自定义为 .dark 类）自动切换。
 */
const ROW_LAYOUT =
  'flex w-full items-center gap-2.5 rounded-[10px] border-none bg-transparent px-2.5 py-2.5 text-left'
/** 可点的功能行 */
const ROW_ACTION = 'cursor-pointer active:bg-black/5 dark:active:bg-white/[0.08]'
/** 分区标题行（表格 / 列 / 列堆叠 / 行）：排版像一条列表项，但本身不可点 */
const ROW_STATIC = 'cursor-default'

/**
 * 弹层里的方格：触屏没有 hover 预览，点第几格就是几行几列。
 * 边框不能直接用 var(--border-color)：深色下它只有 10% 白，叠在 #242426 的面板上
 * 亮度差仅 +21，截图里几乎看不出格子。浅色对齐 PC 工具栏的 #d0d0d0，
 * 深色用 25% 白（亮度差约 +55），与 PC 的 dark:border-white/15 同源但更重一档。
 * active: 是靠 :active 伪类提高优先级压过 dark: 的，两者的层叠顺序不用操心。
 */
const CELL_BASE =
  'cursor-pointer rounded-[3px] border border-[#d0d0d0] bg-transparent active:border-[var(--accent)] active:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] dark:border-white/25'

/** 图标条的圆角按钮 */
const BAR_BTN =
  'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-none bg-transparent p-0 text-[var(--text-secondary)] transition-colors duration-150 active:bg-black/[0.06] disabled:cursor-not-allowed disabled:opacity-35 dark:active:bg-white/[0.08]'
</script>

<template>
  <div class="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
    <!--
      尺寸必须和文章 Tab 的标题栏（TreeSidebar.vue 的 px-3 py-2、按钮 h-7）对齐：
      手机上底部 Tab 在「文章」和「编辑」之间切换时，这两条工具栏是同一条横带，
      高度或左右边距差一档，切换就会看到明显跳动。
      对齐后统一是 8 + 28 + 8 + 1px 边框 = 45px 高，左右各 12px。

      外层横向排两条：左侧可滚动的图标条 + 右侧常驻的撤销按钮。
      撤销固定在右边不跟着滚，否则划到行内样式那一堆时按钮就滑出屏幕了；
      两侧都按 py-2 对齐，撤销按钮本身也是 h-7，所以整条仍是 45px 高。
    -->
    <div class="flex items-stretch">
      <div
        class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <!-- 基础语法：分割线/列表/引用/链接/任务/代码块/限高图/多图/表格 -->
        <button
          :class="BAR_BTN"
          :disabled="!atLineStart"
          title="基础语法"
          @click="togglePanel('basic')"
        >
          <AlignLeft :size="14" />
        </button>
        <!-- 容器/布局：列、列堆叠、行、层叠、块容器、文本、HTML 容器 -->
        <button
          :class="BAR_BTN"
          :disabled="!atLineStart"
          title="容器与布局"
          @click="togglePanel('layout')"
        >
          <Box :size="14" />
        </button>
        <!-- 图片：临时/长期/磁盘/图床 -->
        <button
          :class="BAR_BTN"
          :disabled="!atLineStart"
          title="插入图片"
          @click="togglePanel('image')"
        >
          <ImageIcon :size="14" />
        </button>
        <!-- 组件：直接开组件选择面板，没有二级 -->
        <button
          :class="BAR_BTN"
          :disabled="!atLineStart"
          title="插入组件"
          @click="emit('open-components')"
        >
          <Puzzle :size="14" />
        </button>
        <!-- 解析：光标在组件标签上时可用，属性抽屉在移动端是 300px 侧滑 -->
        <button
          :class="BAR_BTN"
          :disabled="!tagAvailable"
          title="解析标签属性"
          @click="emit('open-tag')"
        >
          <Braces :size="14" />
        </button>

        <span class="mx-1 h-[18px] w-px shrink-0 bg-[var(--border-color)]" />

        <!-- 行内样式：选中单行文字后可用 -->
        <button
          v-for="opt in inlineFormatOptions"
          :key="opt.syntax"
          :class="BAR_BTN"
          :disabled="!hasSelection"
          :title="opt.label + '：' + opt.hint"
          @click="onInline(opt)"
        >
          <component :is="formatIcons[opt.syntax]" :size="14" />
        </button>
      </div>

      <!--
        撤销：固定在最右，不参与横向滚动。调的是 CodeMirror 的 undo 命令，
        与 PC 的 Cmd/Ctrl+Z 走同一条历史栈，一次点击退一个改动批次。
      -->
      <div class="flex shrink-0 items-center py-2 pr-3 pl-1.5">
        <button :class="BAR_BTN" :disabled="!canUndo" title="撤销" @click="emit('undo')">
          <Undo2 :size="14" />
        </button>
      </div>
    </div>

    <!-- 底部面板挂到 body：编辑器面板自身是 overflow 容器，留在里面会被裁掉 -->
    <Teleport to="body">
      <div
        v-if="panel"
        class="fixed inset-0 z-[200] flex items-end bg-black/30 dark:bg-black/55"
        @click.self="panel = ''"
      >
        <div
          class="flex max-h-[70vh] w-full flex-col rounded-t-2xl bg-[var(--bg-primary)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] dark:bg-[#242426]"
        >
          <div
            class="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-4 pt-3 pb-2"
          >
            <span class="text-[13px] font-semibold text-[var(--text-primary)]">
              {{ panel === 'basic' ? '基础语法' : panel === 'layout' ? '容器与布局' : '插入图片' }}
            </span>
            <button
              class="inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--text-secondary)] active:bg-black/[0.06] dark:active:bg-white/[0.08]"
              title="关闭"
              @click="panel = ''"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="overflow-y-auto px-3 pt-2 pb-3">
            <!-- ── 基础语法 ── -->
            <template v-if="panel === 'basic'">
              <button
                v-for="opt in markdownInsertOptions.filter((o) => !o.table)"
                :key="opt.label"
                :class="[ROW_LAYOUT, ROW_ACTION]"
                @click="onInsertSyntax(opt.syntax)"
              >
                <component :is="opt.icon" :size="15" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">
                  {{ opt.label }}
                </span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">
                  {{ opt.display }}
                </span>
              </button>
              <!-- 表格：触屏直接点第几格就是几行几列 -->
              <div class="pb-2.5">
                <div :class="[ROW_LAYOUT, ROW_STATIC]">
                  <Table :size="15" class="shrink-0" :style="{ color: accent }" />
                  <span class="text-[13px] font-medium text-[var(--text-primary)]">表格</span>
                  <span class="ml-auto text-[11px] text-[var(--text-secondary)]">点格选行列</span>
                </div>
                <div
                  class="grid gap-0.5 px-2.5"
                  :style="{ gridTemplateColumns: `repeat(${MAX_GRID_COLS}, 22px)` }"
                >
                  <button
                    v-for="i in MAX_GRID_ROWS * MAX_GRID_COLS"
                    :key="i"
                    :class="[CELL_BASE, 'h-[22px] w-[22px]']"
                    :title="`${Math.ceil(i / MAX_GRID_COLS)} 行 ${((i - 1) % MAX_GRID_COLS) + 1} 列`"
                    @click="onTableCell(i)"
                  />
                </div>
              </div>
            </template>

            <!-- ── 容器与布局 ── -->
            <template v-else-if="panel === 'layout'">
              <div class="pb-2.5">
                <div :class="[ROW_LAYOUT, ROW_STATIC]">
                  <Columns2 :size="15" class="shrink-0" :style="{ color: accent }" />
                  <span class="text-[13px] font-medium text-[var(--text-primary)]">列</span>
                  <span class="ml-auto text-[11px] text-[var(--text-secondary)]">水平分栏</span>
                </div>
                <div
                  class="grid gap-0.5 px-2.5"
                  :style="{ gridTemplateColumns: `repeat(${MAX_COLS}, 22px)` }"
                >
                  <button
                    v-for="i in MAX_COLS"
                    :key="i"
                    :class="[CELL_BASE, 'h-[22px] w-[22px]']"
                    :title="`${i} 列均分`"
                    @click="onColumn(i)"
                  />
                </div>
              </div>
              <div class="pb-2.5">
                <div :class="[ROW_LAYOUT, ROW_STATIC]">
                  <Columns2 :size="15" class="shrink-0" :style="{ color: accent }" />
                  <span class="text-[13px] font-medium text-[var(--text-primary)]">列堆叠</span>
                  <span class="ml-auto text-[11px] text-[var(--text-secondary)]">独立排列</span>
                </div>
                <div
                  class="grid gap-0.5 px-2.5"
                  :style="{ gridTemplateColumns: `repeat(${MAX_COLS}, 22px)` }"
                >
                  <button
                    v-for="i in MAX_COLS"
                    :key="i"
                    :class="[CELL_BASE, 'h-[22px] w-[22px]']"
                    :title="`${i} 列堆叠`"
                    @click="onColumnStack(i)"
                  />
                </div>
              </div>
              <div class="pb-2.5">
                <div :class="[ROW_LAYOUT, ROW_STATIC]">
                  <Rows2 :size="15" class="shrink-0" :style="{ color: accent }" />
                  <span class="text-[13px] font-medium text-[var(--text-primary)]">行</span>
                  <span class="ml-auto text-[11px] text-[var(--text-secondary)]">纵向堆叠</span>
                </div>
                <!--
                  「行」是纵向堆叠，所以三根横条要竖着叠起来（同 PC 的 flex-col）。
                  宽度取 142px = 上面两行列方格的整宽（6×22 + 5×2 间隙），
                  这样「列」和「行」两块左边缘对齐、右边缘也齐，视觉上是一组控件。
                -->
                <div class="flex flex-col gap-0.5 px-2.5">
                  <button
                    v-for="i in MAX_ROWS"
                    :key="i"
                    :class="[CELL_BASE, 'h-[22px] w-[142px]']"
                    :title="`${i} 行纵向堆叠`"
                    @click="onRow(i)"
                  />
                </div>
              </div>
              <button :class="[ROW_LAYOUT, ROW_ACTION]" @click="onLayoutItem('stack')">
                <Layers :size="15" class="shrink-0" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">层叠</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">多层叠加</span>
              </button>
              <button :class="[ROW_LAYOUT, ROW_ACTION]" @click="onLayoutItem('container')">
                <Package :size="15" class="shrink-0" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">块容器</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">通用包裹</span>
              </button>
              <button :class="[ROW_LAYOUT, ROW_ACTION]" @click="onLayoutItem('text')">
                <Type :size="15" class="shrink-0" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">文本</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">样式文字</span>
              </button>
              <button :class="[ROW_LAYOUT, ROW_ACTION]" @click="onLayoutItem('html')">
                <Code2 :size="15" class="shrink-0" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">HTML 容器</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">内联样式</span>
              </button>
            </template>

            <!-- ── 图片 ── -->
            <template v-else>
              <button :class="[ROW_LAYOUT, ROW_ACTION]" @click="onImage('temp')">
                <ImageIcon :size="15" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">临时存储</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">本地临时图片</span>
              </button>
              <button :class="[ROW_LAYOUT, ROW_ACTION]" @click="onImage('persist')">
                <ImagePlus :size="15" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">长期存储</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">本地长期图片</span>
              </button>
              <button v-if="isTauri" :class="[ROW_LAYOUT, ROW_ACTION]" @click="onImage('disk')">
                <HardDrive :size="15" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">磁盘存储</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">本地磁盘图片</span>
              </button>
              <button
                :class="[ROW_LAYOUT, ROW_ACTION]"
                :disabled="uploading"
                @click="onImage('hosting')"
              >
                <ImageUp :size="15" :style="{ color: accent }" />
                <span class="text-[13px] font-medium text-[var(--text-primary)]">上传图床</span>
                <span class="ml-auto text-[11px] text-[var(--text-secondary)]">
                  {{ uploading ? '上传中...' : uploadLabel }}
                </span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
