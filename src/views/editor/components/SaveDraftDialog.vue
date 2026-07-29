<script setup vapor lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { useTheme } from '@/composables/useTheme'

const { colors } = useTheme()

const props = defineProps<{
  visible: boolean
  initialTitle: string
}>()

const emit = defineEmits<{
  close: []
  saved: [draftId: number, title: string]
}>()

const draftTitle = ref('')
const errorMsg = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      draftTitle.value = props.initialTitle || ''
      errorMsg.value = ''
    }
  },
)

function handleSave() {
  const trimmed = draftTitle.value.trim()
  if (!trimmed) {
    errorMsg.value = '请输入标题'
    return
  }
  emit('saved', 0, trimmed)
}
</script>

<template>
  <BaseDialog
    :visible="visible"
    title="保存草稿"
    :show-footer="true"
    confirm-text="保存"
    :confirm-disabled="!draftTitle.trim()"
    :accent="colors.accent"
    @close="emit('close')"
    @confirm="handleSave"
  >
    <div class="flex flex-col gap-4">
      <div>
        <label class="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
          草稿标题
        </label>
        <input
          v-model="draftTitle"
          type="text"
          placeholder="请输入草稿标题"
          class="save-draft-input w-full h-9 px-3 rounded-[5px] border bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] outline-none"
          @keyup.enter="handleSave"
        />
        <p v-if="errorMsg" class="text-[var(--danger)] text-[11px] mt-1">{{ errorMsg }}</p>
        <p v-else class="text-[var(--text-tertiary,#aaa)] text-[11px] mt-1">
          标题默认从#/p-title标签/breaking标签获取
        </p>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.save-draft-input {
  border-color: var(--border-color, #d0d0d0);
}
.save-draft-input:focus {
  border-color: var(--accent);
}
.save-draft-input::placeholder {
  color: var(--text-tertiary, #aaa);
}
</style>
