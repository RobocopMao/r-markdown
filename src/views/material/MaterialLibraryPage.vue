<script setup lang="ts">
import { ref, onMounted } from 'vue'

const visible = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true
  })
})
</script>

<template>
  <div
    class="flex min-h-screen flex-col items-center justify-center px-4 text-center"
    :class="{ 'opacity-100': visible, 'opacity-0': !visible }"
    style="background: var(--bg-secondary); transition: opacity 0.3s ease"
  >
    <div class="mb-6 text-6xl">📦</div>
    <h1 class="m-0 mb-3 text-2xl font-extrabold tracking-tight" style="color: var(--text-primary)">
      素材库
    </h1>
    <p class="m-0 mb-8 text-base" style="color: var(--text-muted)">
      子模块未拉取，请在终端执行以下命令：
    </p>
    <div
      class="mb-4 rounded-xl border px-6 py-4 text-sm font-mono"
      style="
        background: var(--bg-primary);
        border-color: var(--border-color);
        color: var(--text-primary);
      "
    >
      git submodule update --init --recursive
    </div>
    <p class="m-0 text-sm" style="color: var(--text-muted)">拉取完成后刷新页面即可访问素材库</p>
  </div>
</template>
