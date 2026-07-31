<script setup lang="ts">
import { useAutoUpdater } from './composables/useAutoUpdater'
import { startupState, handleRestore } from './services/startupCheck'
import ConfirmDialog from './components/ConfirmDialog.vue'

useAutoUpdater()
</script>

<template>
  <ConfirmDialog
    v-model:visible="startupState.showRestorePrompt"
    title="检测到旧配置文件"
    message="发现在上次安装中保存的配置数据，是否恢复？"
    cancel-text="不恢复"
    confirm-text="恢复配置"
    @confirm="handleRestore(true)"
    @cancel="handleRestore(false)"
  />
  <router-view />
</template>

<style>
/* ── Toolbar ── */
.toolbar {
  background: var(--bg-primary);
  border-color: var(--border-color);
}

/* ── Panel Header ── */
.panel-header {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  color: var(--text-secondary);
}

.panel-header-muted {
  color: var(--text-muted);
}

/* ── Resize Handle ── */
.resize-handle {
  width: 10px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.resize-handle-btn {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--border-color, #e5e5e5);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition:
    background 0.2s,
    box-shadow 0.2s,
    border-color 0.2s,
    opacity 0.15s;
  color: var(--text-muted, #999);
  opacity: 0;
  pointer-events: none;
}

.resize-handle-btn--visible {
  opacity: 1;
  pointer-events: auto;
}

.resize-handle:hover .resize-handle-btn--visible {
  background: var(--accent-light, rgba(108, 92, 231, 0.08));
  border-color: var(--accent, #6c5ce7);
  color: var(--accent, #6c5ce7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.resize-handle:active .resize-handle-btn--visible {
  background: var(--accent, #6c5ce7);
  color: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
}

/* 暗色模式 */
html.dark .resize-handle-btn,
[data-theme='dark'] .resize-handle-btn {
  background: #1e1e1e;
  border-color: var(--border-color, #3a3a3a);
}

html.dark .resize-handle:hover .resize-handle-btn--visible,
[data-theme='dark'] .resize-handle:hover .resize-handle-btn--visible {
  background: var(--accent-light, rgba(108, 92, 231, 0.12));
}

html.dark .resize-handle:active .resize-handle-btn--visible,
[data-theme='dark'] .resize-handle:active .resize-handle-btn--visible {
  background: var(--accent, #6c5ce7);
  color: #fff;
}

/* ── Header Blur ── */
.header-blur {
  background: linear-gradient(
    to bottom,
    rgba(245, 245, 247, 0.98) 0%,
    rgba(245, 245, 247, 0.6) 70%,
    rgba(245, 245, 247, 0) 100%
  );
}

[data-theme='dark'] .header-blur {
  background: linear-gradient(
    to bottom,
    rgba(17, 17, 20, 0.98) 0%,
    rgba(17, 17, 20, 0.6) 70%,
    rgba(17, 17, 20, 0) 100%
  );
}
</style>
