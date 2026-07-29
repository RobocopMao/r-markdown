<script setup vapor lang="ts">
import { useSlots } from 'vue'

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    message?: string
    cancelText?: string
    confirmText?: string
    /** 确认按钮主题：'accent' | 'danger' */
    confirmType?: 'accent' | 'danger'
    /** 加载中状态，按钮显示为禁用 + 加载文案 */
    loading?: boolean
    /** 加载中文案，默认"正在执行..." */
    loadingText?: string
  }>(),
  {
    title: '确认操作',
    message: '',
    cancelText: '取消',
    confirmText: '确认',
    confirmType: 'accent',
    loading: false,
    loadingText: '正在执行...',
  },
)

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const slots = useSlots()
const hasSlot = () => !!slots.default?.()

function onConfirm() {
  emit('confirm')
  if (props.loading) return
  emit('update:visible', false)
}

function onCancel() {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-base-dialog-fade-in"
    @click.self="onCancel"
  >
    <div class="confirm-dialog bg-white rounded-xl p-6 w-80 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <h3 class="confirm-dialog-title m-0 mb-2 text-base text-[#1f1a17]">{{ title }}</h3>
      <p v-if="message" class="confirm-dialog-message m-0 mb-4 text-[13px] text-[#8a8175]">
        {{ message }}
      </p>
      <div class="flex gap-2 mt-4" :class="hasSlot() ? 'flex-col' : 'justify-end'">
        <template v-if="hasSlot()">
          <button
            class="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none text-white transition-colors whitespace-nowrap"
            :class="[
              confirmType === 'danger'
                ? 'bg-[#e74c3c] hover:bg-[#c0392b]'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-dark)]',
              { 'w-full': hasSlot(), 'opacity-60 pointer-events-none': loading },
            ]"
            :disabled="loading"
            @click="onConfirm"
          >
            {{ loading ? loadingText : confirmText }}
          </button>
          <slot />
          <button
            class="confirm-dialog-cancel-btn px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none bg-[#f3f0ea] text-[#8a8175] transition-colors hover:bg-[#e8e3da] whitespace-nowrap"
            :class="{ 'w-full': hasSlot() }"
            @click="onCancel"
          >
            {{ cancelText }}
          </button>
        </template>
        <template v-else>
          <button
            class="confirm-dialog-cancel-btn px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none bg-[#f3f0ea] text-[#8a8175] transition-colors hover:bg-[#e8e3da] whitespace-nowrap"
            @click="onCancel"
          >
            {{ cancelText }}
          </button>
          <button
            class="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none text-white transition-colors whitespace-nowrap"
            :class="{
              [confirmType === 'danger'
                ? 'bg-[#e74c3c] hover:bg-[#c0392b]'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-dark)]']: true,
              'opacity-60 pointer-events-none': loading,
            }"
            :disabled="loading"
            @click="onConfirm"
          >
            {{ loading ? loadingText : confirmText }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes base-dialog-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.animate-base-dialog-fade-in {
  animation: base-dialog-fade-in 0.2s ease-out;
}

[data-theme='dark'] .confirm-dialog {
  background: #2a2a2a;
}
[data-theme='dark'] .confirm-dialog-title {
  color: #f0f0f0;
}
[data-theme='dark'] .confirm-dialog-message {
  color: #999;
}
[data-theme='dark'] .confirm-dialog-cancel-btn {
  background: #444;
  color: #ccc;
}
[data-theme='dark'] .confirm-dialog-cancel-btn:hover {
  background: #555;
}
</style>
