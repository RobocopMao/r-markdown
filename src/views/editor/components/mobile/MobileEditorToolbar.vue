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
</script>

<template>
  <div class="mobile-quick-tools">
    <div class="quick-scroll">
      <!-- 基础语法：分割线/列表/引用/链接/任务/代码块/限高图/多图/表格 -->
      <button
        class="quick-btn"
        :class="atLineStart ? '' : 'quick-btn--off'"
        :disabled="!atLineStart"
        title="基础语法"
        @click="togglePanel('basic')"
      >
        <AlignLeft :size="16" />
      </button>
      <!-- 容器/布局：列、列堆叠、行、层叠、块容器、文本、HTML 容器 -->
      <button
        class="quick-btn"
        :class="atLineStart ? '' : 'quick-btn--off'"
        :disabled="!atLineStart"
        title="容器与布局"
        @click="togglePanel('layout')"
      >
        <Box :size="16" />
      </button>
      <!-- 图片：临时/长期/磁盘/图床 -->
      <button
        class="quick-btn"
        :class="atLineStart ? '' : 'quick-btn--off'"
        :disabled="!atLineStart"
        title="插入图片"
        @click="togglePanel('image')"
      >
        <ImageIcon :size="16" />
      </button>
      <!-- 组件：直接开组件选择面板，没有二级 -->
      <button
        class="quick-btn"
        :class="atLineStart ? '' : 'quick-btn--off'"
        :disabled="!atLineStart"
        title="插入组件"
        @click="emit('open-components')"
      >
        <Puzzle :size="16" />
      </button>
      <!-- 解析：光标在组件标签上时可用，属性抽屉在移动端是 300px 侧滑 -->
      <button
        class="quick-btn"
        :class="tagAvailable ? '' : 'quick-btn--off'"
        :disabled="!tagAvailable"
        title="解析标签属性"
        @click="emit('open-tag')"
      >
        <Braces :size="16" />
      </button>

      <span class="quick-divider" />

      <!-- 行内样式：选中单行文字后可用 -->
      <button
        v-for="opt in inlineFormatOptions"
        :key="opt.syntax"
        class="quick-btn"
        :class="hasSelection ? '' : 'quick-btn--off'"
        :disabled="!hasSelection"
        :title="opt.label + '：' + opt.hint"
        @click="onInline(opt)"
      >
        <component :is="formatIcons[opt.syntax]" :size="16" />
      </button>
    </div>

    <!-- 底部面板挂到 body：编辑器面板自身是 overflow 容器，留在里面会被裁掉 -->
    <Teleport to="body">
      <div v-if="panel" class="quick-mask" @click.self="panel = ''">
        <div class="quick-sheet">
          <div class="quick-sheet-head">
            <span class="quick-sheet-title">
              {{ panel === 'basic' ? '基础语法' : panel === 'layout' ? '容器与布局' : '插入图片' }}
            </span>
            <button class="quick-sheet-close" title="关闭" @click="panel = ''">
              <X :size="16" />
            </button>
          </div>

          <div class="quick-sheet-body">
            <!-- ── 基础语法 ── -->
            <template v-if="panel === 'basic'">
              <button
                v-for="opt in markdownInsertOptions.filter((o) => !o.table)"
                :key="opt.label"
                class="quick-row"
                @click="onInsertSyntax(opt.syntax)"
              >
                <component :is="opt.icon" :size="15" :style="{ color: accent }" />
                <span class="quick-row-label">{{ opt.label }}</span>
                <span class="quick-row-hint">{{ opt.display }}</span>
              </button>
              <!-- 表格：触屏直接点第几格就是几行几列 -->
              <div class="quick-section">
                <div class="quick-section-title">表格</div>
                <div
                  class="quick-grid"
                  :style="{ gridTemplateColumns: `repeat(${MAX_GRID_COLS}, 22px)` }"
                >
                  <button
                    v-for="i in MAX_GRID_ROWS * MAX_GRID_COLS"
                    :key="i"
                    class="quick-cell"
                    :title="`${Math.ceil(i / MAX_GRID_COLS)} 行 ${((i - 1) % MAX_GRID_COLS) + 1} 列`"
                    @click="onTableCell(i)"
                  />
                </div>
              </div>
            </template>

            <!-- ── 容器与布局 ── -->
            <template v-else-if="panel === 'layout'">
              <div class="quick-section">
                <div class="quick-section-title">列（水平分栏，包在 row 里）</div>
                <div
                  class="quick-grid"
                  :style="{ gridTemplateColumns: `repeat(${MAX_COLS}, 32px)` }"
                >
                  <button
                    v-for="i in MAX_COLS"
                    :key="i"
                    class="quick-cell quick-cell--lg"
                    :title="`${i} 列均分`"
                    @click="onColumn(i)"
                  />
                </div>
              </div>
              <div class="quick-section">
                <div class="quick-section-title">列堆叠（独立排列）</div>
                <div
                  class="quick-grid"
                  :style="{ gridTemplateColumns: `repeat(${MAX_COLS}, 32px)` }"
                >
                  <button
                    v-for="i in MAX_COLS"
                    :key="i"
                    class="quick-cell quick-cell--lg"
                    :title="`${i} 列堆叠`"
                    @click="onColumnStack(i)"
                  />
                </div>
              </div>
              <div class="quick-section">
                <div class="quick-section-title">行（纵向堆叠）</div>
                <div class="quick-grid" :style="{ gridTemplateColumns: 'repeat(3, 1fr)' }">
                  <button
                    v-for="i in MAX_ROWS"
                    :key="i"
                    class="quick-cell quick-cell--row"
                    :title="`${i} 行纵向堆叠`"
                    @click="onRow(i)"
                  />
                </div>
              </div>
              <button class="quick-row" @click="onLayoutItem('stack')">
                <span class="quick-row-label">层叠</span>
                <span class="quick-row-hint">多层叠加</span>
              </button>
              <button class="quick-row" @click="onLayoutItem('container')">
                <span class="quick-row-label">块容器</span>
                <span class="quick-row-hint">通用包裹</span>
              </button>
              <button class="quick-row" @click="onLayoutItem('text')">
                <span class="quick-row-label">文本</span>
                <span class="quick-row-hint">样式文字</span>
              </button>
              <button class="quick-row" @click="onLayoutItem('html')">
                <span class="quick-row-label">HTML 容器</span>
                <span class="quick-row-hint">内联样式</span>
              </button>
            </template>

            <!-- ── 图片 ── -->
            <template v-else>
              <button class="quick-row" @click="onImage('temp')">
                <ImageIcon :size="15" :style="{ color: accent }" />
                <span class="quick-row-label">临时存储</span>
                <span class="quick-row-hint">本地临时图片</span>
              </button>
              <button class="quick-row" @click="onImage('persist')">
                <ImagePlus :size="15" :style="{ color: accent }" />
                <span class="quick-row-label">长期存储</span>
                <span class="quick-row-hint">本地长期图片</span>
              </button>
              <button v-if="isTauri" class="quick-row" @click="onImage('disk')">
                <HardDrive :size="15" :style="{ color: accent }" />
                <span class="quick-row-label">磁盘存储</span>
                <span class="quick-row-hint">本地磁盘图片</span>
              </button>
              <button class="quick-row" :disabled="uploading" @click="onImage('hosting')">
                <ImageUp :size="15" :style="{ color: accent }" />
                <span class="quick-row-label">上传图床</span>
                <span class="quick-row-hint">{{ uploading ? '上传中...' : uploadLabel }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mobile-quick-tools {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  background: var(--bg-primary);
}

.quick-scroll {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.quick-scroll::-webkit-scrollbar {
  display: none;
}

.quick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: background 0.15s;
}
.quick-btn:active {
  background: rgba(0, 0, 0, 0.06);
}
.quick-btn--off {
  opacity: 0.35;
  cursor: not-allowed;
}

.quick-divider {
  flex: 0 0 auto;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--border-color, rgba(0, 0, 0, 0.1));
}

/* ── 底部面板 ── */
.quick-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.3);
}

.quick-sheet {
  width: 100%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  border-radius: 16px 16px 0 0;
  background: var(--bg-primary, #fff);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.quick-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;
}

.quick-sheet-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.quick-sheet-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary, #888);
  cursor: pointer;
}
.quick-sheet-close:active {
  background: rgba(0, 0, 0, 0.06);
}

.quick-sheet-body {
  padding: 8px 12px 12px;
  overflow-y: auto;
}

.quick-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.quick-row:active {
  background: rgba(0, 0, 0, 0.05);
}
.quick-row:disabled {
  opacity: 0.5;
}

.quick-row-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.quick-row-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary, #999);
}

.quick-section {
  padding: 10px 10px 4px;
}

.quick-section-title {
  font-size: 11px;
  color: var(--text-secondary, #8a8a8a);
  margin-bottom: 8px;
}

.quick-grid {
  display: grid;
  gap: 2px;
}

.quick-cell {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color, #d0d0d0);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}
.quick-cell:active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

.quick-cell--lg {
  width: 32px;
  height: 32px;
}

.quick-cell--row {
  width: 100%;
  height: 22px;
}
</style>

<style>
/* 深色模式：面板与图标跟随主题变量，只补分层色 */
[data-theme='dark'] .quick-sheet {
  background: #242426;
}
[data-theme='dark'] .quick-row:active,
[data-theme='dark'] .quick-btn:active {
  background: rgba(255, 255, 255, 0.08);
}
[data-theme='dark'] .quick-mask {
  background: rgba(0, 0, 0, 0.55);
}
</style>
