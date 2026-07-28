<script setup vapor lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    visible: boolean
    value: string
    title?: string
    description?: string
    placeholder?: string
    cancelText?: string
    confirmText?: string
    loading?: boolean
    loadingText?: string
  }>(),
  {
    title: '提示',
    description: '',
    placeholder: '请输入',
    cancelText: '取消',
    confirmText: '保存',
    loading: false,
    loadingText: '操作中...',
  },
)

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'save', v: string): void
}>()

const inputVal = ref(props.value)

watch(
  () => props.visible,
  (v) => {
    if (v) inputVal.value = props.value
  },
)

async function save() {
  const val = inputVal.value.trim()
  emit('save', val)
  await nextTick()
  if (!props.loading) {
    emit('update:visible', false)
  }
}

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-base-dialog-fade-in"
      @click.self="cancel"
    >
    <div class="prompt-dialog bg-white rounded-xl p-6 w-80 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <h3 class="prompt-dialog-title m-0 mb-2 text-base text-[#1f1a17]">{{ title }}</h3>
      <p v-if="description" class="prompt-dialog-desc m-0 mb-4 text-[13px] text-[#8a8175]">
        {{ description }}
      </p>
      <input
        v-model="inputVal"
        type="text"
        class="prompt-dialog-input w-full box-border px-3 py-2.5 border-[1.5px] border-[#e0dbd3] rounded-lg text-sm text-[#1f1a17] outline-none transition-colors focus:border-[var(--accent)]"
        :placeholder="placeholder"
        @keyup.enter="save"
        autofocus
      />
      <div class="flex gap-2 mt-4 justify-end">
        <button
          class="prompt-dialog-cancel-btn px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none bg-[#f3f0ea] text-[#8a8175] transition-colors hover:bg-[#e8e3da]"
          :disabled="loading"
          @click="cancel"
        >
          {{ cancelText }}
        </button>
        <button
          class="px-4 py-2 rounded-lg text-[13px] font-semibold border-none text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          :class="loading ? 'bg-[var(--accent)] opacity-60 cursor-not-allowed' : 'bg-[var(--accent)] cursor-pointer hover:bg-[var(--accent-dark)]'"
          :disabled="loading"
          @click="save"
        >
          {{ loading ? loadingText : confirmText }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
@keyframes base-dialog-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-base-dialog-fade-in {
  animation: base-dialog-fade-in 0.2s ease-out;
}

[data-theme='dark'] .prompt-dialog {
  background: #2a2a2a;
}
[data-theme='dark'] .prompt-dialog-title {
  color: #f0f0f0;
}
[data-theme='dark'] .prompt-dialog-desc {
  color: #999;
}
[data-theme='dark'] .prompt-dialog-input {
  background: #333;
  border-color: #555;
  color: #f0f0f0;
}
[data-theme='dark'] .prompt-dialog-cancel-btn {
  background: #444;
  color: #ccc;
}
[data-theme='dark'] .prompt-dialog-cancel-btn:hover {
  background: #555;
}
</style>
