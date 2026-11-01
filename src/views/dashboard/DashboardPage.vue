<script setup lang="ts">
/**
 * 统计面板（独立页面 `/dashboard`）。
 *
 * 面板主体在 DashboardBoard.vue 里，编辑器内置的「统计」入口复用同一份，
 * 这样两处永远看到一致的数据与版式，不用维护两套。
 */
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import DashboardBoard from './DashboardBoard.vue'
</script>

<template>
  <div class="min-h-screen bg-[var(--bg-secondary)] font-sans text-[var(--text-primary)]">
    <SiteHeader :show-nav-links="false" />

    <main class="mx-auto w-full max-w-[1080px] px-4 pt-[104px] pb-16 sm:px-6 sm:pt-[124px]">
      <DashboardBoard />
    </main>

    <SiteFooter />
  </div>
</template>
