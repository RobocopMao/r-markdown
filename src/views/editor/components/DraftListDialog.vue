<script setup lang="ts">
import { ref, computed } from 'vue'
import { Pencil, Trash2 } from 'lucide-vue-next'
import BaseDrawer from '@/components/BaseDrawer.vue'
import type { Draft } from '@/services/DraftStorage'

const props = defineProps<{
  visible: boolean
  drafts: Draft[]
}>()

const emit = defineEmits<{
  close: []
  'confirm-load': [payload: { draftId: number; title: string }]
  'confirm-delete': [payload: { draftId: number; title: string }]
}>()

const searchQuery = ref('')

// 标签色板
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
    if (v && !seen.has(v)) { tags.push(v); seen.add(v) }
  }

  // 优先级 2: <badges badge="xx">
  const badgesRe = /<badges\b[^>]*\bbadge\s*=\s*"([^"]*)"/gi
  while ((m = badgesRe.exec(content)) !== null) {
    const v = m[1].trim()
    if (v && !seen.has(v)) { tags.push(v); seen.add(v) }
  }

  // 优先级 3: <breaking badge="xx">
  const breakingRe = /<breaking\b[^>]*\bbadge\s*=\s*"([^"]*)"/gi
  while ((m = breakingRe.exec(content)) !== null) {
    const v = m[1].trim()
    if (v && !seen.has(v)) { tags.push(v); seen.add(v) }
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
  // 只保留汉字及中文标点
  s = s.replace(/[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '')
  return s.slice(0, 120)
}

const filteredDrafts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.drafts
  return props.drafts.filter((d) =>
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
  <BaseDrawer
    :visible="visible"
    title="草稿箱"
    width="min(95vw, 1100px)"
    :show-footer="false"
    noBodyPadding
    @close="emit('close')"
  >
    <template #header>
      <span class="text-xs text-[var(--text-secondary)] shrink-0">共 {{ props.drafts.length }} 篇</span>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索草稿..."
        class="w-[200px] h-7 px-2.5 rounded-full border border-[var(--border-color,#d0d0d0)] bg-[var(--bg-primary)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-tertiary,#aaa)]"
      />
    </template>

    <!-- 空状态 -->
    <div
      v-if="filteredDrafts.length === 0 && searchQuery"
      class="w-full py-16 text-center text-[13px] text-[var(--text-secondary)]"
    >
      无匹配草稿
    </div>
    <div
      v-else-if="filteredDrafts.length === 0"
      class="w-full py-16 text-center text-[13px] text-[var(--text-secondary)]"
    >
      暂无草稿
    </div>

    <!-- 卡片网格 -->
    <div v-else class="grid grid-cols-5 gap-3 w-full py-3 px-3.5">
      <div
        v-for="draft in filteredDrafts"
        :key="draft.id"
        class="draft-card flex flex-col p-3.5 rounded-xl bg-[var(--bg-primary)] min-h-40 min-w-0 overflow-hidden"
      >
        <!-- 标题 -->
        <div class="text-[15px] font-bold text-[var(--text-primary)] leading-[1.4] h-[42px] line-clamp-2 overflow-hidden mb-2.5" :title="draft.title">
          {{ draft.title }}
        </div>

        <!-- 正文 -->
        <div class="flex-1 text-xs text-[var(--text-secondary)] leading-[1.6] line-clamp-2 overflow-hidden mb-3.5 min-h-0">
          {{ cleanBody(draft.content) || '（无内容）' }}
        </div>

        <!-- 标签 -->
        <div class="flex flex-wrap gap-1.5 mb-2.5">
          <template v-if="extractTags(draft.content).length">
            <span
              v-for="(tag, idx) in extractTags(draft.content)"
              :key="tag"
              class="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium leading-[1.4]"
              :style="{
                background: tagPalette[idx % tagPalette.length].bg,
                color: tagPalette[idx % tagPalette.length].fg,
              }"
            >
              {{ tag }}
            </span>
          </template>
          <span v-else class="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium leading-[1.4] bg-[var(--border-color,#eee)] text-[var(--text-secondary)]">未分类</span>
        </div>

        <!-- 分隔线 -->
        <hr class="border-0 border-t border-[var(--border-color,#eee)] mx-0 mb-2.5" />

        <!-- 底部：日期 + 操作 -->
        <div class="flex items-center justify-between">
          <span class="text-[11px] text-[var(--text-tertiary,#999)]">{{ formatDate(draft.updatedAt) }}</span>
          <div class="flex items-center gap-1.5">
            <button
              class="draft-action-btn inline-flex items-center justify-center w-[26px] h-[26px] rounded-md border-0 bg-transparent text-[var(--text-secondary)] cursor-pointer"
              title="重新编辑"
              @click="draft.id !== undefined && emit('confirm-load', { draftId: draft.id, title: draft.title })"
            >
              <Pencil :size="14" />
            </button>
            <button
              class="draft-action-btn draft-delete-btn inline-flex items-center justify-center w-[26px] h-[26px] rounded-md border-0 bg-transparent text-[var(--text-secondary)] cursor-pointer"
              title="删除"
              @click="draft.id !== undefined && emit('confirm-delete', { draftId: draft.id, title: draft.title })"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </BaseDrawer>
</template>

<style scoped>
.draft-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.15s ease, background 0.15s ease;
}

.draft-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.06);
  background: color-mix(in srgb, var(--accent) 4%, var(--bg-primary));
}

.draft-action-btn {
  transition: color 0.15s, background 0.15s;
}

.draft-action-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.draft-delete-btn:hover {
  color: #e53935;
  background: rgba(229, 57, 53, 0.1);
}

[data-theme='dark'] .draft-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15);
}

[data-theme='dark'] .draft-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2);
}
</style>
