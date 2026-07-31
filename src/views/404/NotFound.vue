<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Home } from 'lucide-vue-next'

const router = useRouter()
</script>

<template>
  <div class="flex items-center justify-center min-h-screen p-8">
    <div class="text-center">
      <p class="text-8xl font-extrabold text-gray-300 leading-none mb-2">404</p>
      <h1 class="text-2xl font-semibold text-gray-800 mb-2">页面未找到</h1>
      <p class="text-sm text-gray-400 mb-6">您访问的页面不存在或已被移除</p>
      <button
        class="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--accent)] text-white text-sm cursor-pointer transition-colors duration-150 hover:bg-[var(--accent-dark)]"
        @click="router.replace('/')"
      >
        <Home class="shrink-0" :size="16" />
        返回首页
      </button>
    </div>
  </div>
</template>
