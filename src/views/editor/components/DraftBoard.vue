<script setup lang="ts">
/**
 * 草稿箱面板。
 *
 * 呈现方式与统计面板（views/dashboard/DashboardBoard.vue）保持一致：
 * 激活后占满编辑区、面板内部自己滚动，不再用抽屉弹窗盖住编辑器。
 *
 * 只负责「看草稿 + 发起动作」，加载/删除的确认流程仍在 useDraft 里，
 * 事件名与原来的弹窗完全一致，父级接线不用改语义。
 */
import { computed, ref } from 'vue'
import { Pencil, Search, Trash2 } from 'lucide-vue-next'
import BaseTooltip from '@/components/BaseTooltip.vue'
import type { Draft } from '@/services/draftStorage'

const props = defineProps<{
  drafts: Draft[]
}>()

const emit = defineEmits<{
  close: []
  'confirm-load': [payload: { draftId: number; title: string }]
  'confirm-delete': [payload: { draftId: number; title: string }]
}>()

const searchQuery = ref('')

// 标签色板（与统计面板的浅底色标签风格一致）
const tagPalette = [
  { bg: '#FFF3E0', fg: '#E65100' },
  { bg: '#E8F5E9', fg: '#2E7D32' },
  { bg: '#E3F2FD', fg: '#1565C0' },
  { bg: '#F3E5F5', fg: '#7B1FA2' },
  { bg: '#FFEBEE', fg: '#C62828' },
  { bg: '#E0F2F1', fg: '#00695C' },
]

/** 从正文提取标签，优先级：<title badge> > <badges badge> > <breaking badge> */
function extractTags(content: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()

  // 优先级 1: <title badge="xx">
  let m: RegExpExecArray | null
  const titleRe = /<title\b[^>]*\bbadge\s*=\s*"([^"]*)"/gi
  while ((m = titleRe.exec(content)) !== null) {
    const v = m[1].trim()
    if (v && !seen.has(v)) {
      tags.push(v)
      seen.add(v)
    }
  }

  // 优先级 2: <badges badge="xx">
  const badgesRe = /<badges\b[^>]*\bbadge\s*=\s*"([^"]*)"/gi
  while ((m = badgesRe.exec(content)) !== null) {
    const v = m[1].trim()
    if (v && !seen.has(v)) {
      tags.push(v)
      seen.add(v)
    }
  }

  // 优先级 3: <breaking badge="xx">
  const breakingRe = /<breaking\b[^>]*\bbadge\s*=\s*"([^"]*)"/gi
  while ((m = breakingRe.exec(content)) !== null) {
    const v = m[1].trim()
    if (v && !seen.has(v)) {
      tags.push(v)
      seen.add(v)
    }
  }

  return tags
}

/** 清洗正文：去 HTML/组件标签、去 Markdown 语法、只保留汉字 */
function cleanBody(text: string): string {
  let s = text
  // 去 HTML / 自定义标签
  s = s.replace(/<[^>]*>/g, '')
  // 去 Markdown 语法结构
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/==([^=]+)==/g, '$1')
  s = s.replace(/::([^:]+)::/g, '$1')
  s = s.replace(/!!([^!]+)!!/g, '$1')
  s = s.replace(/\^\^([^^]+)\^\^/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  // 去链接 [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // 去图片
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
  // 只保留汉字、中文标点与空白（空白留着，避免几段文字黏成一串），再压成单行
  s = s.replace(/[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\s]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s.slice(0, 120)
}

const filteredDrafts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.drafts
  return props.drafts.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      extractTags(d.content).some((t) => t.toLowerCase().includes(q)),
  )
})

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-4">
      <!-- 顶部工具条：与统计面板同版式（标题 + 返回编辑 + 搜索） -->
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-[16px] font-semibold tracking-tight">草稿箱</h1>
            <button
              type="button"
              class="rounded-md border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              @click="emit('close')"
            >
              返回编辑
            </button>
          </div>
          <p class="mt-1 text-[12px] text-[var(--text-secondary)]">
            共 {{ props.drafts.length }} 篇<span v-if="searchQuery.trim()"
              >，匹配 {{ filteredDrafts.length }} 篇</span
            >
          </p>
        </div>

        <div class="flex items-center gap-2">
          <label
            class="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-2.5 text-[12px] text-[var(--text-secondary)] focus-within:border-[var(--accent)]"
          >
            <Search :size="13" class="shrink-0" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索草稿…"
              class="w-[140px] border-0 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </label>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="filteredDrafts.length === 0 && searchQuery.trim()"
        class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
      >
        无匹配草稿
      </div>
      <div
        v-else-if="filteredDrafts.length === 0"
        class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-16 text-center text-[13px] text-[var(--text-secondary)]"
      >
        暂无草稿
      </div>

      <!-- 卡片网格 -->
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-stretch gap-3">
        <article
          v-for="draft in filteredDrafts"
          :key="draft.id"
          class="draft-card flex min-w-0 flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3.5"
        >
          <!-- 标题 -->
          <h3
            class="mb-1.5 h-[42px] overflow-hidden text-[14px] font-bold leading-[1.45] text-[var(--text-primary)] line-clamp-2"
            :title="draft.title"
          >
            {{ draft.title || '（无标题）' }}
          </h3>

          <!-- 正文摘要 -->
          <p
            class="mb-3 line-clamp-2 min-h-[38px] text-[12px] leading-[1.6] text-[var(--text-secondary)]"
          >
            {{ cleanBody(draft.content) || '（无内容）' }}
          </p>

          <!-- 标签 -->
          <div class="mb-2.5 flex flex-wrap gap-1.5">
            <template v-if="extractTags(draft.content).length">
              <span
                v-for="(tag, idx) in extractTags(draft.content)"
                :key="tag"
                class="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium leading-[1.4]"
                :style="{
                  background: tagPalette[idx % tagPalette.length].bg,
                  color: tagPalette[idx % tagPalette.length].fg,
                }"
              >
                {{ tag }}
              </span>
            </template>
            <span
              v-else
              class="inline-block rounded-md bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-medium leading-[1.4] text-[var(--text-secondary)]"
              >未分类</span
            >
          </div>

          <!-- 底部：日期 + 操作（贴底对齐，卡片等高时按钮在同一条线上） -->
          <div
            class="mt-auto flex items-center justify-between border-t border-[var(--border-color)] pt-2.5"
          >
            <span class="text-[11px] tabular-nums text-[var(--text-muted)]">{{
              formatDate(draft.updatedAt)
            }}</span>
            <div class="flex items-center gap-1.5">
              <BaseTooltip text="重新编辑">
                <button
                  class="draft-action-btn inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-secondary)]"
                  @click="
                    draft.id !== undefined &&
                    emit('confirm-load', { draftId: draft.id, title: draft.title })
                  "
                >
                  <Pencil :size="14" />
                </button>
              </BaseTooltip>
              <BaseTooltip text="删除">
                <button
                  class="draft-action-btn draft-delete-btn inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-secondary)]"
                  @click="
                    draft.id !== undefined &&
                    emit('confirm-delete', { draftId: draft.id, title: draft.title })
                  "
                >
                  <Trash2 :size="14" />
                </button>
              </BaseTooltip>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.draft-card {
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.draft-card:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-color));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  background: color-mix(in srgb, var(--accent) 3%, var(--bg-primary));
}

.draft-action-btn {
  transition:
    color 0.15s,
    background 0.15s;
}

.draft-action-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.draft-delete-btn:hover {
  color: #e53935;
  background: rgba(229, 57, 53, 0.1);
}

[data-theme='dark'] .draft-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
</style>
