<script setup lang="ts">
/**
 * 公开降级版首页入口（V2 版本名占位）。
 *
 * 背景：`src/views-private` 是私有子模块，`vite.config.ts` 在它缺失时会把
 * `@/views-private` 别名指向 `src/views`。首页路由现在指向
 * `@/views-private/home/HomePageV2.vue`，所以这里需要一个同名文件兜底，
 * 否则在没有子模块的环境（公开仓库直接构建、外部 fork、CI 拉取失败）会解析失败。
 *
 * 公开环境看到的是公开版首页 HomePage.vue —— 与切换前的降级行为一致。
 */
import HomePage from './HomePage.vue'
</script>

<template>
  <HomePage />
</template>
