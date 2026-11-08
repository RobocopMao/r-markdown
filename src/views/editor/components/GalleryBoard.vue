<script setup vapor lang="ts">
/**
 * 图库面板。
 *
 * 呈现方式与草稿箱（DraftBoard）/ 统计面板一致：激活后占满编辑区、面板内部自己滚动，
 * 不再用抽屉弹窗盖住编辑器。
 *
 * 交互只有两条主线，都「先选后动」，避免手一滑就把图插进正文：
 * - 未开多选：点图只是选中（再点一次取消），选中后右上角出现「插入」，点了才真正插到光标位置
 * - 开了多选：点图是勾选；只勾 1 张时也能插入，勾 2 张以上就只剩「删除选中」——
 *   多选的语义是批量清理，不能让人误以为能把一堆图一起塞进文章
 *
 * 原「设置 → 清理图片缓存」的抽屉已并到这里：多选 + 删除就是那个功能，
 * 本地缓存图标的查看大图 / 置顶 / 单张删除也都留在这。
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { ListChecks, CheckCheck, Pin, PinOff, Folder, Eye, Trash2 } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import BaseTooltip from '@/components/BaseTooltip.vue'
import BoardHeader from './BoardHeader.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import { getAllImagePreviews, deleteImage } from '@/utils/imageDB'
import { LocalImageDisk, type DiskImageEntry } from '@/services/localImageDisk'
import { getImagesDir } from '@/services/localArticlePath'
import { getSetting, setSetting } from '@/config/settings'

const emit = defineEmits<{
  close: []
  insert: [payload: { kind: 'local' | 'disk'; value: string }]
  'request-delete': [payload: { message: string; tokens: string[] }]
}>()

const isTauri = import.meta.env.VITE_TAURI === 'true'

// ── 本地图片（IndexedDB 缓存）──
const loading = ref(true)
const images = ref<{ token: string; dataUrl: string; size: number; createdAt: number }[]>([])
const multiSelect = ref(false)
const selectedTokens = ref(new Set<string>())
/** 磁盘图片的选中项（同一时刻只选一张；relPath 作 key） */
const selectedDisk = ref<string | null>(null)
const pinnedTokens = ref(new Set<string>([]))

// ── 磁盘图片（images 目录，仅桌面端）──
type DiskImageItem = DiskImageEntry & { dataUrl?: string }
const activeTab = ref<'local' | 'disk'>('local')
const diskLoading = ref(false)
const diskImages = ref<DiskImageItem[]>([])

// ── 大图预览（公共组件，面板只负责喂图）──
/** 大图预览暴露的方法（vapor 组件是函数式组件，取不到 InstanceType，直接写形状） */
const imagePreviewRef = ref<{
  open: (src?: string | null, caption?: string) => void
} | null>(null)

// 顶部「本地 / 磁盘」切换按钮的主题色滑块
const btnLocal = ref<HTMLButtonElement | null>(null)
const btnDisk = ref<HTMLButtonElement | null>(null)
const tabSliderStyle = ref<Record<string, string>>({})

function updateTabSlider() {
  const btn = activeTab.value === 'local' ? btnLocal.value : btnDisk.value
  if (!btn) return
  const parent = btn.parentElement
  if (!parent) return
  const parentRect = parent.getBoundingClientRect()
  const btnRect = btn.getBoundingClientRect()
  tabSliderStyle.value = {
    width: `${btnRect.width - 4}px`,
    transform: `translateX(${btnRect.left - parentRect.left}px)`,
  }
}

watch(activeTab, () => {
  // 多选只管本地图片缓存，切到磁盘就把多选收起来，免得误以为能删磁盘文件
  multiSelect.value = false
  selectedTokens.value.clear()
  selectedDisk.value = null
  nextTick(() => requestAnimationFrame(updateTabSlider))
})

/** 按保存日期降序；createdAt 缺失的沉到该组末尾 */
function byCreatedAtDesc(a: { createdAt: number }, b: { createdAt: number }): number {
  return (b.createdAt || 0) - (a.createdAt || 0)
}

/** 置顶的排最前，置顶组内与其余图片都按日期降序 */
const sortedImages = computed(() => {
  const pinned = images.value.filter((img) => pinnedTokens.value.has(img.token))
  const unpinned = images.value.filter((img) => !pinnedTokens.value.has(img.token))
  return [...pinned.sort(byCreatedAtDesc), ...unpinned.sort(byCreatedAtDesc)]
})

const allSelected = computed(
  () => images.value.length > 0 && selectedTokens.value.size === images.value.length,
)

const currentCount = computed(() =>
  activeTab.value === 'local' ? images.value.length : diskImages.value.length,
)

/** 恰好选了一张时才能插入：多选下勾了多张属于「批量清理」，不提供插入 */
const canInsert = computed(() => {
  if (activeTab.value === 'disk') return selectedDisk.value !== null
  return selectedTokens.value.size === 1
})

const subtitleText = computed(() => {
  const isLocal = activeTab.value === 'local'
  const total = isLocal ? images.value.length : diskImages.value.length
  const unit = isLocal ? '图片缓存' : '磁盘图片'
  if (total === 0) return `还没有${unit}`
  if (multiSelect.value) {
    const picked = selectedTokens.value.size
    return picked === 0
      ? `共 ${total} 张，勾选后可删除；只勾 1 张时也能插入`
      : picked === 1
        ? `共 ${total} 张，已勾选 1 张，可插入或删除`
        : `共 ${total} 张，已勾选 ${picked} 张，多选下只能批量删除`
  }
  return canInsert.value
    ? `共 ${total} 张${unit}，点右上角「插入」放进文章`
    : `共 ${total} 张${unit}，点一张选中后再插入`
})

async function loadImages() {
  loading.value = true
  images.value = await getAllImagePreviews()
  loading.value = false
}

async function loadDiskImages() {
  diskLoading.value = true
  const list = await LocalImageDisk.listImages()
  diskImages.value = list
  for (const item of list) loadDiskPreview(item)
  diskLoading.value = false
}

async function loadDiskPreview(item: DiskImageItem) {
  const url = await LocalImageDisk.readAsDataURL(item.relPath)
  if (url) item.dataUrl = url
}

function loadPinnedTokens() {
  const saved = getSetting<string[]>('pinnedImageTokens') || []
  pinnedTokens.value = new Set(saved)
}

function toggleCardPin(token: string) {
  const next = new Set(pinnedTokens.value)
  if (next.has(token)) next.delete(token)
  else next.add(token)
  pinnedTokens.value = next
  setSetting('pinnedImageTokens', [...next])
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localPreviewCaption(img: { size: number; createdAt: number }): string {
  return [formatSize(img.size), formatDate(img.createdAt)].filter(Boolean).join(' · ')
}

function diskPreviewCaption(img: DiskImageItem): string {
  return [img.name, formatSize(img.size)].filter(Boolean).join(' · ')
}

function openPreview(src: string | undefined, caption: string) {
  imagePreviewRef.value?.open(src, caption)
}

/** 在文件管理器中定位本地磁盘图片（仅桌面端） */
async function revealDiskImage(item: DiskImageItem) {
  if (!isTauri) return
  try {
    const dir = await getImagesDir()
    await invoke('show_in_folder', { path: `${dir}/${item.name}` })
  } catch {
    /* 定位失败静默忽略 */
  }
}

function toggleMultiSelect() {
  multiSelect.value = !multiSelect.value
  if (!multiSelect.value) selectedTokens.value.clear()
}

function toggleSelectAll() {
  if (allSelected.value) selectedTokens.value.clear()
  else selectedTokens.value = new Set(images.value.map((img) => img.token))
}

function toggleSelect(token: string) {
  const s = new Set(selectedTokens.value)
  if (s.has(token)) s.delete(token)
  else s.add(token)
  selectedTokens.value = s
}

/** 插入到编辑器光标位置；面板由父级在插完后关掉，好让用户立刻看到插进去的图 */
function doInsert(payload: { kind: 'local' | 'disk'; value: string }) {
  emit('insert', payload)
}

/** 点本地图：多选态是勾选（可多张），非多选态是单选（点已选中的那张=取消） */
function onLocalClick(token: string) {
  if (multiSelect.value) {
    toggleSelect(token)
    return
  }
  selectedTokens.value = selectedTokens.value.has(token) ? new Set() : new Set([token])
}

/** 点磁盘图：同样是「先选中，再点插入」，再点一次取消 */
function onDiskClick(relPath: string) {
  selectedDisk.value = selectedDisk.value === relPath ? null : relPath
}

/** 右上角「插入」：把当前选中的那张图插到编辑器光标位置 */
function insertSelected() {
  if (activeTab.value === 'disk') {
    if (!selectedDisk.value) return
    doInsert({ kind: 'disk', value: selectedDisk.value })
    return
  }
  if (selectedTokens.value.size !== 1) return
  doInsert({ kind: 'local', value: [...selectedTokens.value][0] })
}

function requestDeleteOne(token: string) {
  emit('request-delete', { message: '确定要删除这张图片缓存吗？', tokens: [token] })
}

function requestDeleteSelected() {
  if (selectedTokens.value.size === 0) return
  emit('request-delete', {
    message: `确定要删除选中的 ${selectedTokens.value.size} 张图片缓存吗？删除后不可恢复。`,
    tokens: [...selectedTokens.value],
  })
}

/** 由父级在确认弹窗里点「确定」后调用 */
async function doCleanup(tokens: string[]) {
  for (const token of tokens) {
    await deleteImage(token)
  }
  selectedTokens.value.clear()
  await loadImages()
}

onMounted(async () => {
  loadPinnedTokens()
  await loadImages()
  if (isTauri) await loadDiskImages()
  nextTick(() => requestAnimationFrame(updateTabSlider))
})

defineExpose({ doCleanup })
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-4">
      <BoardHeader title="图库" :description="subtitleText" @close="emit('close')">
        <!-- 标签页：本地 / 磁盘（仅桌面端有磁盘目录），统一放在标题下面一行靠左 -->
        <template #tabs>
          <div
            v-if="isTauri"
            class="relative flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--bg-hover)] p-0.5"
          >
            <div
              class="absolute bottom-0.5 top-0.5 rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
              :style="tabSliderStyle"
            ></div>
            <button
              ref="btnLocal"
              class="relative z-10 cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-1 text-[12px] font-semibold transition-colors"
              :class="activeTab === 'local' ? 'text-white' : 'text-[var(--text-secondary)]'"
              @click="activeTab = 'local'"
            >
              本地图片
            </button>
            <button
              ref="btnDisk"
              class="relative z-10 cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-1 text-[12px] font-semibold transition-colors"
              :class="activeTab === 'disk' ? 'text-white' : 'text-[var(--text-secondary)]'"
              @click="activeTab = 'disk'"
            >
              磁盘图片
            </button>
          </div>
        </template>

        <template #actions>
          <button
            v-if="activeTab === 'disk' && selectedDisk"
            class="cursor-pointer rounded-md border-0 bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            @click="insertSelected"
          >
            插入
          </button>

          <!-- 多选：全选 + 多选开关 + 删除选中（只在本地图片下有用） -->
          <template v-if="activeTab === 'local'">
            <BaseTooltip v-if="multiSelect" :text="allSelected ? '取消全选' : '全选'">
              <button
                class="gallery-tool-btn inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent"
                :class="allSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'"
                @click="toggleSelectAll"
              >
                <CheckCheck :size="15" />
              </button>
            </BaseTooltip>
            <BaseTooltip :text="multiSelect ? '退出多选' : '多选'">
              <button
                class="gallery-tool-btn inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent"
                :class="multiSelect ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'"
                @click="toggleMultiSelect"
              >
                <ListChecks :size="15" />
              </button>
            </BaseTooltip>
            <button
              v-if="canInsert"
              class="cursor-pointer rounded-md border-0 bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              @click="insertSelected"
            >
              插入
            </button>
            <button
              v-if="multiSelect && selectedTokens.size > 0"
              class="cursor-pointer rounded-md border-0 bg-[#dc2626] px-3 py-1 text-[12px] text-white transition-colors hover:bg-[#b91c1c]"
              @click="requestDeleteSelected"
            >
              删除选中（{{ selectedTokens.size }}）
            </button>
          </template>
        </template>
      </BoardHeader>

      <!-- 本地图片 -->
      <template v-if="activeTab === 'local'">
        <div
          v-if="loading"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          加载中…
        </div>
        <div
          v-else-if="images.length === 0"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          暂无图片缓存
          <div class="mt-1 text-[11px] text-[var(--text-muted)]">
            编辑器里插入的图片会缓存在这里，方便再次使用
          </div>
        </div>
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          <div
            v-for="img in sortedImages"
            :key="img.token"
            class="gallery-card group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)]"
            :class="{ 'is-selected': selectedTokens.has(img.token) }"
            @click="onLocalClick(img.token)"
          >
            <img :src="img.dataUrl" class="block h-full w-full object-cover" />

            <!-- 右上角：查看大图 / 删除 / 置顶（悬停出现；触屏常显）。置顶放最右，固定不变 -->
            <div class="absolute right-1.5 top-1.5 z-10 flex items-center gap-1">
              <BaseTooltip class="card-action-hint" text="查看大图" placement="top">
                <button
                  class="flex size-[22px] cursor-pointer items-center justify-center rounded border-0 bg-black/55 text-white transition-colors hover:bg-[var(--accent)]"
                  @click.stop="openPreview(img.dataUrl, localPreviewCaption(img))"
                >
                  <Eye :size="12" />
                </button>
              </BaseTooltip>
              <BaseTooltip class="card-action-hint" text="删除" placement="top">
                <button
                  class="card-delete-btn flex size-[22px] cursor-pointer items-center justify-center rounded border-0 bg-black/55 text-white transition-colors hover:bg-[#e53935]"
                  @click.stop="requestDeleteOne(img.token)"
                >
                  <Trash2 :size="12" />
                </button>
              </BaseTooltip>
              <BaseTooltip
                class="card-action-hint"
                :class="{ 'card-action-hint--on': pinnedTokens.has(img.token) }"
                :text="pinnedTokens.has(img.token) ? '取消置顶' : '置顶'"
                placement="top"
              >
                <button
                  class="flex size-[22px] cursor-pointer items-center justify-center rounded border-0 bg-black/55 text-white transition-colors hover:bg-[var(--accent)]"
                  @click.stop="toggleCardPin(img.token)"
                >
                  <PinOff v-if="pinnedTokens.has(img.token)" :size="12" />
                  <Pin v-else :size="12" />
                </button>
              </BaseTooltip>
            </div>

            <!-- 选中角标：多选态显示空方框（提示可勾），单选/勾选后显示实心对勾 -->
            <div
              v-if="multiSelect || selectedTokens.has(img.token)"
              class="absolute left-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded border-2 transition-colors"
              :class="
                selectedTokens.has(img.token)
                  ? '!border-[var(--accent)] !bg-[var(--accent)]'
                  : 'border-white/80 bg-white/25'
              "
            >
              <span v-if="selectedTokens.has(img.token)" class="text-[13px] font-bold text-white"
                >✓</span
              >
            </div>

            <!-- 大小 / 日期 -->
            <div
              class="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1 py-px text-[10px] text-white/85"
            >
              {{ formatSize(img.size) }}
            </div>
            <div
              class="absolute bottom-1.5 right-1.5 rounded bg-black/50 px-1 py-px text-[10px] text-white/85"
            >
              {{ formatDate(img.createdAt) }}
            </div>
          </div>
        </div>
      </template>

      <!-- 磁盘图片 -->
      <template v-else>
        <div
          v-if="diskLoading"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          加载中…
        </div>
        <div
          v-else-if="diskImages.length === 0"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          磁盘目录暂无图片
          <div class="mt-1 text-[11px] text-[var(--text-muted)]">
            通过「保存到本地磁盘」上传的图片会存放在这里
          </div>
        </div>
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          <div
            v-for="img in diskImages"
            :key="img.relPath"
            class="gallery-card group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)]"
            :class="{ 'is-selected': selectedDisk === img.relPath }"
            @click="onDiskClick(img.relPath)"
          >
            <img v-if="img.dataUrl" :src="img.dataUrl" class="block h-full w-full object-cover" />
            <div v-else class="flex h-full w-full items-center justify-center bg-[var(--bg-hover)]">
              <div
                class="size-4 animate-spin rounded-full border-2 border-[#ccc] border-t-transparent"
              />
            </div>

            <div
              v-if="selectedDisk === img.relPath"
              class="absolute left-1.5 top-1.5 z-10 flex h-[22px] w-[22px] items-center justify-center rounded border-2 !border-[var(--accent)] !bg-[var(--accent)]"
            >
              <span class="text-[13px] font-bold text-white">✓</span>
            </div>

            <div class="absolute right-1.5 top-1.5 z-10 flex items-center gap-1">
              <BaseTooltip
                v-if="isTauri"
                class="card-action-hint"
                text="在文件管理器中显示"
                placement="top"
              >
                <button
                  class="flex size-[22px] cursor-pointer items-center justify-center rounded border-0 bg-black/55 text-white transition-colors hover:bg-[var(--accent)]"
                  @click.stop="revealDiskImage(img)"
                >
                  <Folder :size="12" />
                </button>
              </BaseTooltip>
              <BaseTooltip
                v-if="img.dataUrl"
                class="card-action-hint"
                text="查看大图"
                placement="top"
              >
                <button
                  class="flex size-[22px] cursor-pointer items-center justify-center rounded border-0 bg-black/55 text-white transition-colors hover:bg-[var(--accent)]"
                  @click.stop="openPreview(img.dataUrl, diskPreviewCaption(img))"
                >
                  <Eye :size="12" />
                </button>
              </BaseTooltip>
            </div>

            <div
              class="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1 py-px text-[10px] text-white/85"
            >
              {{ formatSize(img.size) }}
            </div>
            <div
              class="absolute bottom-1.5 right-1.5 rounded bg-black/50 px-1 py-px text-[10px] text-white/85"
            >
              {{ formatDate(img.modified) }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- 大图预览浮层（公共组件，Teleport / 层级 / Esc / 尺寸回填都在里面） -->
  <ImagePreview ref="imagePreviewRef" />
</template>

<style scoped>
.gallery-card {
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.gallery-card:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-color));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.gallery-card.is-selected {
  border-color: var(--accent);
}

[data-theme='dark'] .gallery-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.gallery-tool-btn {
  transition:
    color 0.15s,
    background 0.15s;
}

.gallery-tool-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

/*
  缩略图右上角操作按钮（查看大图 / 置顶 / 删除 / 文件管理器定位）的显隐：
  - 鼠标设备：默认隐藏，悬停缩略图才出现
  - 触屏设备（hover: none）：常驻显示，否则手机上没有任何入口
 */
.card-action-hint {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.group:hover .card-action-hint,
.card-action-hint:focus-within {
  opacity: 1;
  pointer-events: auto;
}

.card-action-hint--on {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .card-action-hint {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
