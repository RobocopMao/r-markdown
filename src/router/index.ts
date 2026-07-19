import { createRouter, createWebHashHistory } from 'vue-router'

const isTauriClient = import.meta.env.VITE_TAURI === 'true'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      // Tauri 客户端默认打开编辑器，Web 版显示首页
      // 有私有子模块 → 粒子特效版，无 → 公开降级版（通过 Vite alias 自动 fallback）
      component: isTauriClient
        ? () => import('../views/editor/EditorPage.vue')
        : () => import('@/views-private/home/HomePage.vue'),
    },
    {
      path: '/editor',
      name: 'editor',
      component: () => import('../views/editor/EditorPage.vue'),
    },
    {
      path: '/components',
      name: 'components',
      component: () => import('@/views/extension/ExtensionPage.vue'),
    },
    {
      path: '/materials',
      name: 'materials',
      component: () => import('@/views-private/material/MaterialLibraryPage.vue'),
    },
    {
      path: '/help',
      name: 'help',
      component: () => import('@/views-private/help/TutorialList.vue'),
    },
    {
      path: '/help/:slug',
      name: 'help-detail',
      component: () => import('@/views-private/help/TutorialDetail.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/404/NotFound.vue'),
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
