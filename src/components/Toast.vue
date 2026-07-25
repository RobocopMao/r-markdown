<script setup vapor lang="ts">
defineProps<{
  visible: boolean
  message: string
}>()
</script>

<template>
  <Transition name="toast">
    <div
      v-if="visible"
      class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-full bg-[#111] text-white text-sm font-medium shadow-lg pointer-events-none"
    >
      {{ message }}
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
  transform: translate(-50%, 12px);
}
</style>
