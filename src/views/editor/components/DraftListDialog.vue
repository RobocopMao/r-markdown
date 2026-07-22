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

/** 从正文提取 <badges badge="xx"> 和 <breaking badge="xx"> 的标签值 */
function extractTags(content: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()
  const re = /<(?:badges|breaking)\b[^>]*\bbadge\s*=\s*"([^"]*)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
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
    @close="emit('close')"
  >
    <template #header>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索草稿..."
        class="w-[200px] h-7 px-2.5 rounded-full border draft-search-input bg-[var(--bg-primary)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
    <div v-else class="draft-grid">
      <div
        v-for="draft in filteredDrafts"
        :key="draft.id"
        class="draft-card"
      >
        <!-- 标题 -->
        <div class="draft-title" :title="draft.title">
          {{ draft.title }}
        </div>

        <!-- 正文 -->
        <div class="draft-body">
          {{ cleanBody(draft.content) || '（无内容）' }}
        </div>

        <!-- 标签 -->
        <div v-if="extractTags(draft.content).length" class="draft-tags">
          <span
            v-for="(tag, idx) in extractTags(draft.content)"
            :key="tag"
            class="draft-tag"
            :style="{
              background: tagPalette[idx % tagPalette.length].bg,
              color: tagPalette[idx % tagPalette.length].fg,
            }"
          >
            {{ tag }}
          </span>
        </div>

        <!-- 分隔线 -->
        <hr class="draft-divider" />

        <!-- 底部：日期 + 操作 -->
        <div class="draft-footer">
          <span class="draft-date">{{ formatDate(draft.updatedAt) }}</span>
          <div class="draft-actions">
            <button
              class="draft-action-btn"
              title="加载"
              @click="draft.id !== undefined && emit('confirm-load', { draftId: draft.id, title: draft.title })"
            >
              <Pencil :size="14" />
            </button>
            <button
              class="draft-action-btn"
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
.draft-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.draft-card {
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.15s ease, background 0.15s ease;
  min-height: 160px;
}

.draft-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.06);
  background: color-mix(in srgb, var(--accent) 4%, var(--bg-primary));
}

.draft-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.draft-body {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
  min-height: 0;
}

.draft-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.draft-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
}

.draft-divider {
  border: none;
  border-top: 1px solid var(--border-color, #eee);
  margin: 0 0 10px;
}

.draft-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.draft-date {
  font-size: 11px;
  color: var(--text-tertiary, #999);
}

.draft-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.draft-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.draft-action-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.draft-search-input {
  border-color: var(--border-color, #d0d0d0);
}
.draft-search-input:focus {
  border-color: var(--accent);
}
.draft-search-input::placeholder {
  color: var(--text-tertiary, #aaa);
}

/* 暗色模式 */
[data-theme='dark'] .draft-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15);
}
[data-theme='dark'] .draft-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2);
}
</style>
