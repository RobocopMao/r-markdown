<script setup vapor lang="ts">
import { ref, computed, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { useTheme } from '@/composables/useTheme'
import { sanitizeFilename } from '@/utils/extractTitle'

const { colors } = useTheme()

const props = defineProps<{
  visible: boolean
  initialTitle: string
}>()

const emit = defineEmits<{
  close: []
  finalize: [title: string]
}>()

const fileName = ref('')
const errorMsg = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      fileName.value = props.initialTitle || ''
      errorMsg.value = ''
    }
  },
)

const preview = computed(() => {
  const trimmed = fileName.value.trim()
  if (!trimmed) return '(请输入标题)'
  return `${sanitizeFilename(trimmed)}.md`
})

function handleFinalize() {
  const trimmed = fileName.value.trim()
  if (!trimmed) {
    errorMsg.value = '请输入标题'
    return
  }
  emit('finalize', sanitizeFilename(trimmed))
}
</script>

<template>
  <BaseDialog
    :visible="visible"
    title="定稿导出"
    :show-footer="true"
    confirm-text="保存"
    :confirm-disabled="!fileName.trim()"
    :accent="colors.accent"
    @close="emit('close')"
    @confirm="handleFinalize"
  >
    <div class="flex flex-col gap-4">
      <div>
        <label class="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
          文章标题
        </label>
        <input
          v-model="fileName"
          type="text"
          placeholder="请输入文章标题"
          class="finalize-input w-full h-9 px-3 rounded-[5px] border bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] outline-none"
          @keyup.enter="handleFinalize"
        />
        <p v-if="errorMsg" class="text-[var(--danger)] text-[11px] mt-1">{{ errorMsg }}</p>
        <p v-else class="text-[var(--text-tertiary,#aaa)] text-[11px] mt-1">将导出为 Markdown 文件到本地</p>
      </div>
      <div
        class="py-1 rounded-[5px] bg-[var(--bg-hover)] text-[12px] text-[var(--text-secondary)]"
      >
        文件名预览：{{ preview }}
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.finalize-input {
  border-color: var(--border-color, #d0d0d0);
}
.finalize-input:focus {
  border-color: var(--accent);
}
.finalize-input::placeholder {
  color: var(--text-tertiary, #aaa);
}
</style>
