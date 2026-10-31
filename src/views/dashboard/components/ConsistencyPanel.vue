<script setup lang="ts">
/**
 * 三源一致性面板（P1）。
 *
 * 检查两件具体的事：
 *   1. 磁盘上有 .md 文件，但 tree.json 里没有对应节点 → 孤儿文件
 *   2. tree.json 里有节点，但正文拉不到 → 缺失正文
 *
 * 这两种情况在真实使用里会真的出现（手动放文件、切换工作区、云端删了本地没同步），
 * 所以值得单独列出来，并在有数据时给出可操作的提示。
 */
defineProps<{
  orphanFiles: string[]
  missingContents: string[]
  sources: { drafts: boolean; local: boolean; github: boolean }
  warnings: string[]
}>()

function sourceState(ok: boolean): string {
  return ok ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
}

function sourceDot(ok: boolean): string {
  return ok ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
}
</script>

<template>
  <div class="space-y-3">
    <!-- 数据源状态 -->
    <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
      <span class="flex items-center gap-1.5">
        <span class="h-1.5 w-1.5 rounded-full" :class="sourceDot(sources.drafts)" />
        <span :class="sourceState(sources.drafts)">草稿库</span>
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-1.5 w-1.5 rounded-full" :class="sourceDot(sources.local)" />
        <span :class="sourceState(sources.local)">本地磁盘</span>
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-1.5 w-1.5 rounded-full" :class="sourceDot(sources.github)" />
        <span :class="sourceState(sources.github)">GitHub</span>
      </span>
    </div>

    <!-- 警告 -->
    <div
      v-for="(warning, i) in warnings"
      :key="i"
      class="rounded-lg bg-[rgba(230,150,40,0.1)] px-2.5 py-2 text-[11px] leading-relaxed text-[#b87514] dark:text-[#e8a33d]"
    >
      {{ warning }}
    </div>

    <!-- 孤儿文件 -->
    <div v-if="orphanFiles.length">
      <div class="mb-1 text-[11px] font-medium text-[var(--text-secondary)]">
        孤儿文件 {{ orphanFiles.length }} 个
        <span class="font-normal text-[var(--text-muted)]">（磁盘有、目录树没有）</span>
      </div>
      <ul class="max-h-32 space-y-0.5 overflow-y-auto">
        <li
          v-for="file in orphanFiles"
          :key="file"
          class="truncate font-mono text-[10px] text-[var(--text-muted)]"
          :title="file"
        >
          {{ file }}
        </li>
      </ul>
    </div>

    <!-- 缺失正文 -->
    <div v-if="missingContents.length">
      <div class="mb-1 text-[11px] font-medium text-[var(--text-secondary)]">
        缺正文 {{ missingContents.length }} 篇
        <span class="font-normal text-[var(--text-muted)]">（目录树有、正文读不到）</span>
      </div>
      <ul class="max-h-32 space-y-0.5 overflow-y-auto">
        <li
          v-for="item in missingContents"
          :key="item"
          class="truncate text-[10px] text-[var(--text-muted)]"
          :title="item"
        >
          {{ item }}
        </li>
      </ul>
    </div>

    <div
      v-if="!orphanFiles.length && !missingContents.length && !warnings.length"
      class="text-[11px] text-[var(--text-muted)]"
    >
      数据源之间没有发现不一致。
    </div>
  </div>
</template>
