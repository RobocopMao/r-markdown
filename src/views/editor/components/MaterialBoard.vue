<script setup vapor lang="ts">
/**
 * 「我的素材」面板。
 *
 * 呈现方式与草稿箱（DraftBoard）/ 图库（GalleryBoard）/ 统计面板一致：
 * 激活后占满编辑区、面板内部自己滚动，不再用抽屉弹窗盖住编辑器。
 *
 * 交互沿用图库那套「先选中、再插入」：
 * - 未开多选：点卡片只是选中（再点一次取消），工具条右上角出现「插入」才真正写进正文
 * - 开了多选：勾 1 个也能插入，勾 2 个及以上只给「删除选中」（多选的语义是批量清理）
 *
 * 原抽屉里的功能一个没少：分类筛选、搜索、置顶、发布到公共素材库、批量删除。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { MasonryWall } from '@yeger/vue-masonry-wall'
import { ListChecks, CheckCheck, Search } from 'lucide-vue-next'
import { MaterialStorage, DEFAULT_CATEGORIES, type MaterialItem } from '@/services/materialStorage'
import { publishMaterial, generateMaterialId, validateImageUrls } from '@/services/materialPublish'
import MaterialCard from './MaterialCard.vue'
import BaseTooltip from '@/components/BaseTooltip.vue'
import BoardHeader from './BoardHeader.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { getErrorMessage } from '@/utils/helpers'

const emit = defineEmits<{
  close: []
  insert: [item: MaterialItem]
}>()

// ── 数据 ──
const loading = ref(true)
const myMaterials = ref<MaterialItem[]>([])
const myCategoryFilter = ref('全部')
const searchQuery = ref('')

// 多选：只为批量删除服务（发布 / 插入走单选）
const selectMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const activeMaterialId = ref<string | null>(null)

const deleteConfirmVisible = ref(false)
const publishing = ref(false)
const publishConfirmVisible = ref(false)

// ── 瀑布流（@yeger/vue-masonry-wall）──
const COLS_GAP = 8
/** 卡片最小宽度：再窄标题和分类标签就要折行了 */
const MIN_CARD_WIDTH = 240
const wallWidth = ref(0)
const wallWrapperRef = ref<HTMLElement | null>(null)
let wallResizeObserver: ResizeObserver | null = null

/**
 * 列数按容器实际宽度算，不按窗口宽度算——面板在桌面是编辑区宽度、手机是整屏，
 * 用容器宽度一处就能覆盖两种情况，也不必区分 Tauri 窄窗口。
 */
const cols = computed(() => {
  if (wallWidth.value <= 0) return 2
  const n = Math.floor((wallWidth.value + COLS_GAP) / (MIN_CARD_WIDTH + COLS_GAP))
  return Math.max(1, Math.min(n, 4))
})
const columnWidth = computed(() => {
  if (wallWidth.value <= 0) return 0
  const n = cols.value
  return (wallWidth.value - COLS_GAP * (n - 1)) / n
})

function initWallObserver() {
  nextTick(() => {
    if (!wallResizeObserver) {
      wallResizeObserver = new ResizeObserver((entries) => {
        wallWidth.value = entries[0]?.contentRect.width ?? 0
      })
    }
    wallResizeObserver.disconnect()
    if (wallWrapperRef.value) wallResizeObserver.observe(wallWrapperRef.value)
  })
}

onBeforeUnmount(() => {
  wallResizeObserver?.disconnect()
  wallResizeObserver = null
})

// ── 数据加载 ──
async function loadMyMaterials() {
  loading.value = true
  myMaterials.value = await MaterialStorage.list()
  // IndexedDB 为空时，尝试从本地磁盘扫描素材文件夹
  if (myMaterials.value.length === 0) {
    await MaterialStorage.syncFromFiles()
    myMaterials.value = await MaterialStorage.list()
  }
  loading.value = false
  activeMaterialId.value = null
  initWallObserver()
}

const filteredMaterials = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let filtered =
    myCategoryFilter.value === '全部'
      ? myMaterials.value
      : myCategoryFilter.value === '其他'
        ? myMaterials.value.filter((m) => m.category.startsWith('其他'))
        : myMaterials.value.filter((m) => m.category === myCategoryFilter.value)
  if (q) {
    filtered = filtered.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.author || '').toLowerCase().includes(q),
    )
  }
  return [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
})

const myCategoryOptions = computed(() => {
  const cats = new Set(myMaterials.value.map((m) => m.category))
  const hasOther = [...cats].some((c) => c.includes('其他'))
  const filtered = DEFAULT_CATEGORIES.filter((c) => {
    if (c === '其他') return hasOther
    return cats.has(c)
  })
  return ['全部', ...filtered]
})

/** 当前要插入的素材：多选态下勾了 1 个算选中，多选态勾多个只允许删除 */
const insertTarget = computed<MaterialItem | null>(() => {
  if (selectMode.value) {
    if (selectedIds.value.size !== 1) return null
    const id = [...selectedIds.value][0]
    return myMaterials.value.find((m) => m.id === id) || null
  }
  if (!activeMaterialId.value) return null
  return myMaterials.value.find((m) => m.id === activeMaterialId.value) || null
})

const canInsert = computed(() => !!insertTarget.value)

/** 已发布过的素材不再给「发布」按钮 */
const canPublish = computed(
  () => !!insertTarget.value && insertTarget.value.source !== 'official' && !selectMode.value,
)

const subtitleText = computed(() => {
  const total = myMaterials.value.length
  if (total === 0) return '还没有素材，编辑器里设计好内容后点「保存素材」即可'
  if (selectMode.value) {
    const picked = selectedIds.value.size
    return picked === 0
      ? `共 ${total} 个素材，勾选后可删除；只勾 1 个时也能插入`
      : picked === 1
        ? `共 ${total} 个素材，已勾选 1 个，可插入或删除`
        : `共 ${total} 个素材，已勾选 ${picked} 个，多选下只能批量删除`
  }
  const matched = filteredMaterials.value.length
  const scope = matched === total ? '' : `，匹配 ${matched} 个`
  return canInsert.value
    ? `共 ${total} 个素材${scope}，点右上角「插入」放进文章`
    : `共 ${total} 个素材${scope}，点一张选中后再插入`
})

// ── 交互 ──
function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedIds.value = new Set()
  activeMaterialId.value = null
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

const allSelected = computed(
  () =>
    filteredMaterials.value.length > 0 && selectedIds.value.size === filteredMaterials.value.length,
)

function toggleSelectAll() {
  if (allSelected.value) selectedIds.value = new Set()
  else selectedIds.value = new Set(filteredMaterials.value.map((m) => m.id))
}

/** 点卡片：多选态是勾选，单选态是选中（点已选中的那张=取消） */
function handleCardClick(item: MaterialItem) {
  if (selectMode.value) {
    toggleSelect(item.id)
    return
  }
  activeMaterialId.value = activeMaterialId.value === item.id ? null : item.id
}

async function handlePin(item: MaterialItem) {
  await MaterialStorage.togglePin(item.id)
  await loadMyMaterials()
  // 置顶只是排序变化，别把用户刚选中的那张弄丢
  selectedIds.value = new Set([...selectedIds.value])
}

function handleInsert() {
  if (!insertTarget.value) return
  emit('insert', insertTarget.value)
}

// ── 删除 ──
function handleDeleteSelected() {
  if (selectedIds.value.size === 0) return
  deleteConfirmVisible.value = true
}

async function confirmDelete() {
  const ids = [...selectedIds.value]
  await MaterialStorage.removeBatch(ids)
  selectedIds.value = new Set()
  selectMode.value = false
  deleteConfirmVisible.value = false
  await loadMyMaterials()
}

// ── 发布到公共素材库 ──
function handlePublish() {
  if (!insertTarget.value || publishing.value) return
  // 发布前验证：素材内容中的图片地址必须是在线地址
  const validation = validateImageUrls(insertTarget.value.content)
  if (!validation.valid) {
    toast(
      `发布失败：素材中存在本地图片地址（${validation.localUrls.join(', ')}），请替换为在线地址后再发布。`,
    )
    return
  }
  publishConfirmVisible.value = true
}

async function doPublish() {
  publishConfirmVisible.value = false
  const item = insertTarget.value
  if (!item || publishing.value) return

  publishing.value = true
  try {
    const pubId = generateMaterialId(item.category)
    const result = await publishMaterial(pubId, {
      name: item.name,
      author: item.author,
      category: item.category,
      subCategory: item.subCategory,
      description: item.description,
      content: item.content,
    })
    toast(result.message)
    if (result.ok) {
      item.source = 'official'
      item.officialId = pubId
      await MaterialStorage.save(item)
      await loadMyMaterials()
    }
  } catch (e: unknown) {
    toast(`发布失败: ${getErrorMessage(e)}`)
  } finally {
    publishing.value = false
  }
}

// ── 轻提示（面板自带，不依赖父级 toast）──
const toastVisible = ref(false)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function toast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2200)
}

onMounted(() => {
  loadMyMaterials()
})

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-4">
      <BoardHeader title="我的素材" :description="subtitleText" @close="emit('close')">
        <template #search>
          <label class="board-search">
            <Search :size="16" class="shrink-0" />
            <input v-model="searchQuery" type="text" placeholder="搜索素材…" />
          </label>
        </template>

        <template #actions>
          <!-- 多选工具：全选 / 多选（图标与图库共用同一套口径） -->
          <BaseTooltip v-if="selectMode" :text="allSelected ? '取消全选' : '全选'">
            <button
              class="gallery-tool-btn inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent"
              :class="allSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'"
              @click="toggleSelectAll"
            >
              <CheckCheck :size="15" />
            </button>
          </BaseTooltip>
          <BaseTooltip :text="selectMode ? '退出多选' : '多选'">
            <button
              class="gallery-tool-btn inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent"
              :class="selectMode ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'"
              @click="toggleSelectMode"
            >
              <ListChecks :size="15" />
            </button>
          </BaseTooltip>

          <!-- 动作按钮一律排在图标之后 -->
          <button
            v-if="canPublish"
            class="cursor-pointer rounded-md border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
            :class="publishing ? 'cursor-not-allowed opacity-50' : ''"
            :disabled="publishing"
            @click="handlePublish"
          >
            {{ publishing ? '发布中…' : '发布' }}
          </button>
          <button
            v-if="canInsert"
            class="cursor-pointer rounded-md border-0 bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            @click="handleInsert"
          >
            插入
          </button>
          <button
            v-if="selectMode && selectedIds.size > 0"
            class="cursor-pointer rounded-md border-0 bg-[#dc2626] px-3 py-1 text-[12px] text-white transition-colors hover:bg-[#b91c1c]"
            @click="handleDeleteSelected"
          >
            删除选中（{{ selectedIds.size }}）
          </button>
        </template>

        <!-- 分类筛选：标签页统一放在标题下面一行靠左 -->
        <template #tabs>
          <template v-if="myMaterials.length > 0">
            <button
              v-for="cat in myCategoryOptions"
              :key="cat"
              class="board-tab"
              :class="{ active: myCategoryFilter === cat }"
              @click="myCategoryFilter = cat"
            >
              {{ cat }}
            </button>
          </template>
        </template>
      </BoardHeader>

      <!-- 列表 -->
      <div ref="wallWrapperRef" class="min-h-[200px]">
        <div
          v-if="loading"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          加载中…
        </div>
        <div
          v-else-if="myMaterials.length === 0"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          还没有素材
          <div class="mt-1 text-[11px] text-[var(--text-muted)]">
            在编辑器中设计内容后，点工具栏的「保存素材」即可收进这里
          </div>
        </div>
        <div
          v-else-if="filteredMaterials.length === 0"
          class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
        >
          没有匹配的素材
          <div class="mt-1 text-[11px] text-[var(--text-muted)]">换个关键词或分类试试</div>
        </div>
        <MasonryWall
          v-else
          :items="filteredMaterials"
          :column-width="columnWidth"
          :gap="COLS_GAP"
          :min-columns="cols"
          :max-columns="cols"
          :key-mapper="(item) => item.id"
        >
          <template #default="{ item }">
            <MaterialCard
              :id="item.officialId"
              :name="item.name"
              :category="item.category"
              :sub-category="item.subCategory"
              :author="item.author"
              :description="item.description"
              :updated-at="item.updatedAt"
              :content="item.content"
              :show-check="selectMode"
              :selected="selectedIds.has(item.id)"
              :active="activeMaterialId === item.id && !selectMode"
              :pinned="!!item.pinned"
              compact
              @click="handleCardClick(item)"
              @pin="handlePin(item)"
            />
          </template>
        </MasonryWall>
      </div>
    </div>
  </div>

  <!-- 发布确认弹窗 -->
  <ConfirmDialog
    :visible="publishConfirmVisible"
    title="发布素材"
    message="素材将上传到 GitHub 仓库，你的素材将免费提供给其他人使用，同时请上传规范的素材，否则可能会被下架。确定发布吗？"
    confirm-text="发布"
    @cancel="publishConfirmVisible = false"
    @confirm="doPublish"
  />

  <!-- 删除确认弹窗 -->
  <ConfirmDialog
    :visible="deleteConfirmVisible"
    title="删除素材"
    :message="`确认删除选中的 ${selectedIds.size} 个素材？此操作不可恢复。`"
    confirm-text="删除"
    confirm-type="danger"
    @confirm="confirmDelete"
    @cancel="deleteConfirmVisible = false"
  />

  <!-- 面板内轻提示 -->
  <Transition name="toast">
    <div
      v-if="toastVisible"
      class="pointer-events-none fixed bottom-8 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-[#111] px-5 py-2.5 text-sm font-medium text-white shadow-lg"
    >
      {{ toastMessage }}
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.25s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, 12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
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
</style>
