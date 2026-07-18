<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Package, CheckSquare, Upload } from 'lucide-vue-next'
import { MaterialStorage, DEFAULT_CATEGORIES, type MaterialItem } from '@/services/materialStorage'
import { publishMaterial, generateMaterialId } from '@/services/materialPublish'
import MaterialCard from './MaterialCard.vue'
import BaseDrawer from '@/components/BaseDrawer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  insert: [item: MaterialItem]
}>()

// ── 我的素材 ──
const myMaterials = ref<MaterialItem[]>([])
const myCategoryFilter = ref('全部')
const searchQuery = ref('')
const selectMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const deleteConfirmVisible = ref(false)
const activeMaterialId = ref<string | null>(null)
const uploading = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const publishConfirmVisible = ref(false)

function showToast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  setTimeout(() => { toastVisible.value = false }, 2000)
}

async function loadMyMaterials() {
  myMaterials.value = await MaterialStorage.list()
  activeMaterialId.value = null
}

const filteredMaterials = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let filtered = myCategoryFilter.value === '全部'
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

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedIds.value = new Set()
  activeMaterialId.value = null
}

function selectMaterial(id: string) {
  if (selectMode.value) return
  activeMaterialId.value = activeMaterialId.value === id ? null : id
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function handleDeleteSelected() {
  if (selectedIds.value.size === 0) return
  deleteConfirmVisible.value = true
}

async function confirmDelete() {
  const ids = Array.from(selectedIds.value)
  await MaterialStorage.removeBatch(ids)
  selectedIds.value = new Set()
  selectMode.value = false
  deleteConfirmVisible.value = false
  await loadMyMaterials()
}

function handleCardClick(item: MaterialItem) {
  if (selectMode.value) {
    toggleSelect(item.id)
    return
  }
  selectMaterial(item.id)
}

async function handlePin(item: MaterialItem) {
  await MaterialStorage.togglePin(item.id)
  await loadMyMaterials()
}

async function handlePublish() {
  if (!activeMaterialId.value || uploading.value) return
  publishConfirmVisible.value = true
}

async function doPublish() {
  publishConfirmVisible.value = false
  if (!activeMaterialId.value || uploading.value) return
  const item = myMaterials.value.find(m => m.id === activeMaterialId.value)
  if (!item) return

  uploading.value = true
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
    showToast(result.message)
    if (result.ok) {
      // 更新 source 为 official
      item.source = 'official'
      item.officialId = pubId
      await MaterialStorage.save(item)
      loadMyMaterials()
    }
  } catch (e: any) {
    showToast(`发布失败: ${e.message}`)
  } finally {
    uploading.value = false
  }
}

function handleInsertSelected() {
  if (!activeMaterialId.value) return
  const item = myMaterials.value.find(m => m.id === activeMaterialId.value)
  if (item) {
    emit('insert', item)
    emit('close')
  }
}

// ── Footer 显示逻辑 ──
const showFooter = computed(() => {
  return (!!activeMaterialId.value && !selectMode.value) || (selectMode.value && selectedIds.value.size > 0)
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

onMounted(() => {
  loadMyMaterials()
})

watch(() => props.visible, (newVal) => {
  if (newVal) { loadMyMaterials() }
})
</script>

<template>
  <BaseDrawer :visible="visible" width="800px" title="我的素材" :show-footer="showFooter" no-body-padding @close="emit('close')">
    <template #header>
      <span class="text-[11px] opacity-50 shrink-0">{{ myMaterials.length }} 个素材</span>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索素材"
        class="w-[160px] shrink px-2 py-1 rounded-full text-[11px] border outline-none border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:border-[var(--accent)]"
      />
      <button
        class="cursor-pointer flex items-center justify-center size-6 rounded border-none bg-transparent transition-colors shrink-0 ml-auto"
        :class="selectMode ? 'text-[var(--accent)]' : 'text-[#999] hover:text-[var(--text-primary)]'"
        @click="toggleSelectMode"
      >
        <CheckSquare :size="16" />
      </button>
    </template>

    <div class="flex flex-col flex-1 min-h-0">
      <!-- 分类筛选：sticky 固定 -->
      <div
        class="sticky top-0 z-10 flex gap-1.5 pt-2 pb-2 px-3 overflow-x-auto bg-[#f5f5f5] [scrollbar-width:none] dark:bg-[#1e1e1e]"
      >
        <button
          v-for="cat in myCategoryOptions"
          :key="cat"
          class="cursor-pointer px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors border-none"
          :class="myCategoryFilter === cat
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:bg-[rgba(255,255,255,0.06)]'"
          @click="myCategoryFilter = cat"
        >
          {{ cat }}
        </button>
      </div>

      <div class="flex-1 pt-1 pb-3 px-3">
        <div v-if="myMaterials.length === 0" class="flex flex-col items-center justify-center h-full gap-2 opacity-40">
          <Package :size="32" />
          <span class="text-[12px]">还没有素材</span>
          <span class="text-[11px]">在编辑器中设计内容后，点右上角保存按钮即可</span>
        </div>
        <div v-else class="columns-2 gap-2 pt-px [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full [&>*]:mb-2">
          <MaterialCard
          v-for="item in filteredMaterials"
          :key="item.id"
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
      </div>
    </div>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <template v-if="activeMaterialId && !selectMode">
        <button
          class="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors text-[var(--accent)] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
          :class="uploading ? 'opacity-50 cursor-not-allowed' : ''"
          :disabled="uploading"
          @click="handlePublish"
        >
          {{ uploading ? '发布中...' : '发布到公共素材库' }}
        </button>
        <button
          class="cursor-pointer px-4 py-1.5 rounded-md text-[12px] font-medium border-none transition-colors text-white bg-[var(--accent)]"
          @click="handleInsertSelected"
        >
          插入素材
        </button>
      </template>

      <template v-if="selectMode && selectedIds.size > 0">
        <button
          class="cursor-pointer px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer border-none transition-colors text-white bg-red-500 hover:bg-red-600 ml-auto"
          @click="handleDeleteSelected"
        >
          删除({{ selectedIds.size }})
        </button>
      </template>
    </template>
  </BaseDrawer>

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

  <!-- Toast -->
  <Transition name="toast">
    <div
      v-if="toastVisible"
      class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-full bg-[#111] text-white text-sm font-medium shadow-lg pointer-events-none"
    >
      {{ toastMessage }}
    </div>
  </Transition>
</template>

<style scoped>
/* Vue Transition 动画（无法用 Tailwind 表达） */
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
</style>
