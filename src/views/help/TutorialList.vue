<script setup lang="ts"></script>

<template>
  <div class="tutorial-list-placeholder">
    <div class="placeholder-wrapper">
      <div class="placeholder-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2 class="placeholder-title">教程列表</h2>
      <p class="placeholder-desc">views-private 子模块未拉取，此页面不可用。</p>
      <p class="placeholder-hint">
        请执行 <code>git submodule update --init --recursive</code> 拉取子模块后重试。
      </p>
    </div>
  </div>
</template>

<style scoped>
.tutorial-list-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 2rem;
}

.placeholder-wrapper {
  text-align: center;
  max-width: 420px;
}

.placeholder-icon {
  color: #aaa;
  margin-bottom: 1.5rem;
}

.placeholder-title {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin: 0 0 0.75rem;
}

.placeholder-desc {
  font-size: 16px;
  color: #888;
  margin: 0 0 1rem;
  line-height: 1.6;
}

.placeholder-hint {
  font-size: 14px;
  color: #aaa;
  margin: 0;
  line-height: 1.6;
}

.placeholder-hint code {
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: #666;
}
</style>

<style>
[data-theme='dark'] .placeholder-title {
  color: #e0e0e0;
}
[data-theme='dark'] .placeholder-desc {
  color: #999;
}
[data-theme='dark'] .placeholder-hint {
  color: #777;
}
[data-theme='dark'] .placeholder-hint code {
  background: #2a2a2e;
  color: #bbb;
}
</style>
