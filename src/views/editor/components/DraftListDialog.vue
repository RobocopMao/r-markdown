<script setup lang="ts">
import { ref, computed } from 'vue'
import { FileInput, Trash2 } from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { Draft } from '@/services/DraftStorage'

const props = defineProps<{
  visible: boolean
  drafts: Draft[]
}>()

const emit = defineEmits<{
  close: []
  load: [draftId: number]
  delete: [draftId: number]
}>()

const pendingAction = ref<{ type: 'load' | 'delete'; draftId: number } | null>(null)
const searchQuery = ref('')
const confirmVisible = computed({
  get: () => pendingAction.value !== null,
  set: (v: boolean) => { if (!v) pendingAction.value = null },
})

const filteredDrafts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.drafts
  return props.drafts.filter((d) => d.title.toLowerCase().includes(q))
})

const confirmTitle = computed(() => (pendingAction.value?.type === 'load' ? '加载草稿' : '删除草稿'))
const confirmType = computed(() => (pendingAction.value?.type === 'delete' ? 'danger' : 'accent'))
const confirmMessage = computed(() => {
  if (!pendingAction.value) return ''
  const draft = props.drafts.find((d) => d.id === pendingAction.value!.draftId)
  const name = draft?.title ?? '未知草稿'
  return pendingAction.value.type === 'load'
    ? `将加载「${name}」，当前编辑内容将被覆盖。`
    : `将永久删除草稿「${name}」，此操作不可撤销。`
})

function onConfirm() {
  if (!pendingAction.value) return
  const { type, draftId } = pendingAction.value
  pendingAction.value = null
  if (type === 'load') {
    emit('load', draftId)
  } else {
    emit('delete', draftId)
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="草稿箱"
    width="min(95vw, 1000px)"
    :show-footer="false"
    @close="emit('close')"
  >
    <template #header>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索草稿..."
        class="w-[200px] h-7 px-2.5 rounded-full border draft-search-input bg-[var(--bg-primary)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
    </template>
    <div class="flex flex-row flex-wrap gap-3">
      <div v-if="filteredDrafts.length === 0 && searchQuery" class="w-full py-10 text-center text-[12px] text-[var(--text-secondary)]">
        无匹配草稿
      </div>
      <div v-else-if="filteredDrafts.length === 0" class="w-full py-10 text-center text-[12px] text-[var(--text-secondary)]">
        暂无草稿
      </div>
      <div
        v-for="draft in filteredDrafts"
        :key="draft.id"
        class="draft-item flex flex-col gap-1.5 px-3 py-2.5 rounded-[6px] w-[calc((100%-48px)/5)]"
      >
        <div class="text-[12px] font-semibold truncate text-[var(--text-primary)] leading-snug" :title="draft.title">
          {{ draft.title }}
        </div>
        <div class="flex-1 text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-5 min-h-0">
          {{ draft.content.slice(0, 100).replace(/\n/g, ' ') }}
        </div>
        <div class="flex items-center justify-between gap-1 mt-auto">
          <span class="text-[10px] text-[var(--text-tertiary,#999)] truncate">
            {{ formatTime(draft.updatedAt) }}
          </span>
          <div class="flex items-center gap-0.5 shrink-0">
            <button
              class="inline-flex items-center justify-center w-5 h-5 rounded-[3px] border-none bg-transparent
                     transition-all duration-150 panel-action-btn cursor-pointer"
              title="加载"
              @click="draft.id !== undefined && (pendingAction = { type: 'load', draftId: draft.id })"
            >
              <FileInput :size="12" class="w-3 h-3" />
            </button>
            <button
              class="inline-flex items-center justify-center w-5 h-5 rounded-[3px] border-none bg-transparent
                     transition-all duration-150 panel-action-btn cursor-pointer"
              title="删除"
              @click="draft.id !== undefined && (pendingAction = { type: 'delete', draftId: draft.id })"
            >
              <Trash2 :size="12" class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:visible="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-type="confirmType"
      :confirm-text="pendingAction?.type === 'load' ? '加载' : '删除'"
      @confirm="onConfirm"
    />
  </BaseDrawer>
</template>

<style scoped>
.draft-item {
  background: var(--bg-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}
.draft-item:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-primary));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
}

.draft-search-input {
  border-color: var(--border-color, #d0d0d0);
}
.draft-search-input:focus {
  border-color: var(--accent);
}
.draft-search-input::placeholder {
  color: var(--text-tertiary, #aaa);
}

.panel-action-btn {
  color: var(--text-secondary);
}
.panel-action-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

[data-theme='dark'] .draft-item {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 1px rgba(255, 255, 255, 0.06);
}
[data-theme='dark'] .draft-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45), 0 0 1px rgba(255, 255, 255, 0.08);
}
</style>
