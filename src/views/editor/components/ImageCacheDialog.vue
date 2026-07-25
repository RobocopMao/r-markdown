<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ListChecks, CheckCheck, Pin, PinOff } from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import { getAllImagePreviews, deleteImage } from '@/utils/imageDB'
import { useTheme } from '@/composables/useTheme'
import { getSetting, setSetting } from '@/config/settings'

const props = withDefaults(defineProps<{ visible: boolean; mode?: 'cleanup' | 'gallery' }>(), {
  mode: 'cleanup',
})
const emit = defineEmits<{
  close: []
  insert: [token: string]
  'request-cleanup': [payload: { message: string; tokens: string[] }]
}>()

const { colors } = useTheme()

const isGallery = computed(() => props.mode === 'gallery')

const loading = ref(true)
const images = ref<{ token: string; dataUrl: string; size: number; createdAt: number }[]>([])
const multiSelect = ref(false)
const selectedTokens = ref(new Set<string>())
const gallerySelected = ref<string | null>(null)
const pinnedTokens = ref(new Set<string>([]))

const sortedImages = computed(() => {
  const pinned = images.value.filter((img) => pinnedTokens.value.has(img.token))
  const unpinned = images.value.filter((img) => !pinnedTokens.value.has(img.token))
  return [...pinned, ...unpinned]
})

const allSelected = computed(() =>
  images.value.length > 0 && selectedTokens.value.size === images.value.length,
)

const titleText = computed(() => isGallery.value ? '图库' : '清理图片缓存')

const isPinned = computed(() => gallerySelected.value ? pinnedTokens.value.has(gallerySelected.value) : false)

function loadPinnedTokens() {
  const saved = getSetting<string[]>('pinnedImageTokens') || []
  pinnedTokens.value = new Set(saved)
}

function togglePin() {
  if (!gallerySelected.value) return
  const next = new Set(pinnedTokens.value)
  if (next.has(gallerySelected.value)) {
    next.delete(gallerySelected.value)
    gallerySelected.value = null
  } else {
    next.add(gallerySelected.value)
  }
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

async function loadImages() {
  loading.value = true
  images.value = await getAllImagePreviews()
  loading.value = false
}

function toggleMultiSelect() {
  multiSelect.value = !multiSelect.value
  if (!multiSelect.value) {
    selectedTokens.value.clear()
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedTokens.value.clear()
  } else {
    selectedTokens.value = new Set(images.value.map((img) => img.token))
  }
}

function toggleSelect(token: string) {
  const s = new Set(selectedTokens.value)
  if (s.has(token)) {
    s.delete(token)
  } else {
    s.add(token)
  }
  selectedTokens.value = s
}

function toggleGallery(token: string) {
  gallerySelected.value = gallerySelected.value === token ? null : token
}

function handleInsert() {
  if (gallerySelected.value) {
    emit('insert', gallerySelected.value)
    gallerySelected.value = null
  }
}

function confirmDelete(token: string) {
  emit('request-cleanup', { message: '确定要清理这张图片缓存吗？', tokens: [token] })
}

function confirmBatchDelete() {
  emit('request-cleanup', {
    message: `确定要清理选中的 ${selectedTokens.value.size} 张图片缓存吗？`,
    tokens: [...selectedTokens.value],
  })
}

async function doCleanup(tokens: string[]) {
  for (const token of tokens) {
    await deleteImage(token)
  }
  selectedTokens.value.clear()
  await loadImages()
}

// 移除 handleConfirm、confirmVisible、confirmMessage、pendingTokens，用 emit + doCleanup 代替
// doCleanup 通过 defineExpose 暴露给父组件调用

watch(() => props.visible, (val) => {
  if (val) {
    selectedTokens.value.clear()
    multiSelect.value = false
    gallerySelected.value = null
    loadPinnedTokens()
    loadImages()
  }
})

loadPinnedTokens()
loadImages()

defineExpose({ doCleanup })
</script>

<template>
    <BaseDrawer
        :visible="visible"
        :title="titleText"
        width="min(95vw, 1000px)"
        :show-footer="isGallery ? (gallerySelected !== null) : (multiSelect && selectedTokens.size > 0)"
        @close="emit('close')"
    >
        <template v-if="isGallery" #header>
            <div class="text-xs text-[#999] dark:text-[#666]">{{ images.length }} 张</div>
            <button
                v-if="gallerySelected"
                class="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-[#f5f5f5] dark:hover:bg-[#333]"
                :class="isPinned ? 'text-[var(--accent)]' : 'text-[#999]'"
                :title="isPinned ? '取消置顶' : '置顶'"
                @click="togglePin"
            >
                <PinOff v-if="isPinned" :size="16" />
                <Pin v-else :size="16" />
            </button>
        </template>
        <template v-else #header>
            <div class="ml-auto flex items-center gap-1">
                <button
                    v-if="multiSelect"
                    class="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-[#f5f5f5] dark:hover:bg-[#333]"
                    :class="allSelected ? 'text-[var(--accent)]' : 'text-[#999]'"
                    @click="toggleSelectAll"
                    title="全选"
                >
                    <CheckCheck :size="16" />
                </button>
                <button
                    class="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-[#f5f5f5] dark:hover:bg-[#333]"
                    :class="multiSelect ? 'text-[var(--accent)]' : 'text-[#999]'"
                    @click="toggleMultiSelect"
                    :title="multiSelect ? '退出多选' : '多选'"
                >
                    <ListChecks :size="16" />
                </button>
            </div>
        </template>

        <div v-if="loading" class="py-10 text-center text-sm text-[#999] dark:text-[#666]">加载中...</div>
        <div v-else-if="images.length === 0" class="py-10 text-center text-sm text-[#999] dark:text-[#666]">暂无缓存图片</div>
        <div v-else class="relative grid grid-cols-6 gap-3">
            <div
                v-for="img in sortedImages"
                :key="img.token"
                class="relative aspect-square overflow-hidden rounded-lg border-2 bg-white transition-colors dark:bg-[#2a2a2a]"
                :class="isGallery
          ? (gallerySelected === img.token
            ? 'cursor-pointer border-[var(--accent)]'
            : 'cursor-pointer border-transparent hover:border-[#e0e0e0] dark:hover:border-[#555]')
          : (multiSelect
            ? (selectedTokens.has(img.token)
              ? 'cursor-pointer border-[var(--accent)]'
              : 'cursor-pointer border-transparent hover:border-[#e0e0e0] dark:hover:border-[#555]')
            : 'cursor-default border-transparent hover:border-[#e0e0e0] dark:hover:border-[#555]')"
                @click="isGallery ? toggleGallery(img.token) : (multiSelect && toggleSelect(img.token))"
            >
                <img :src="img.dataUrl" class="block h-full w-full object-cover" />
                <!-- Pin badge -->
                <div
                    v-if="pinnedTokens.has(img.token)"
                    class="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/55 px-1 py-[2px] text-[10px] text-white"
                >
                    <Pin :size="10" />
                </div>
                <!-- Selected checkmark -->
                <div
                    v-if="isGallery ? (gallerySelected === img.token) : (multiSelect && selectedTokens.has(img.token))"
                    class="absolute left-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded border-2 bg-white/90 dark:bg-[#2a2a2a]/90"
                    :class="isGallery || selectedTokens.has(img.token) ? '!border-[var(--accent)] !bg-[var(--accent)]' : 'border-[#d9d9d9] dark:border-[#555]'"
                >
                    <span class="text-[13px] font-bold text-white">✓</span>
                </div>
                <!-- Size label -->
                <div class="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1 py-px text-[10px] text-white/80">
                    {{ formatSize(img.size) }}
                </div>
                <!-- Date label -->
                <div class="absolute bottom-1.5 right-1.5 rounded bg-black/50 px-1 py-px text-[10px] text-white/80">
                    {{ formatDate(img.createdAt) }}
                </div>
                <button
                    v-if="!isGallery && !multiSelect"
                    class="absolute bottom-1.5 right-1.5 cursor-pointer rounded border-0 bg-black/55 px-2.5 py-[3px] text-xs text-white opacity-0 transition-opacity hover:bg-red-600/80"
                    @click.stop="confirmDelete(img.token)"
                >
                    清理
                </button>
            </div>


        </div>

        <template v-if="isGallery" #footer>
            <button
                class="cursor-pointer rounded-md border-0 px-5 py-[7px] text-[13px] text-white transition-colors"
                :style="{ background: 'var(--accent)' }"
                @click="handleInsert"
            >
                插入
            </button>
        </template>
        <template v-else #footer>
            <button
                class="cursor-pointer rounded-md border-0 bg-[#dc2626] px-5 py-[7px] text-[13px] text-white transition-colors hover:bg-[#b91c1c]"
                @click="confirmBatchDelete"
            >
                清理选中（{{ selectedTokens.size }}）
            </button>
        </template>
    </BaseDrawer>
</template>
