<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Folder } from 'lucide-vue-next'
import { useGitHubTree } from '../composables/useGitHubTree'
import type { TreeNode } from '@/services/GitHubTreeService'
import BaseDialog from '@/components/BaseDialog.vue'
import { extractTitle } from '@/utils/extractTitle'
import PushToCloudTree from './PushToCloudTree.vue'

const props = defineProps<{
  visible: boolean
  /** 当前编辑器中的 Markdown 内容 */
  markdown: string
  /** 当前编辑器关联的云端文章 ID */
  currentCloudArticleId?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'push',
    params: { parentId: string | null; title: string; content: string; existingArticleId?: string },
  ): void
}>()

const { treeRoots, expandedIds, isExpanded, toggleExpand, getChildren, init, expandAncestors } =
  useGitHubTree()

// 当 visible 为 true 时初始化
watch(
  () => props.visible,
  (val) => {
    if (val) {
      const extracted = extractTitle(props.markdown)
      if (extracted) {
        title.value = extracted
      }
      // 已关联云端文章则直接切到更新模式并自动选中
      if (props.currentCloudArticleId) {
        mode.value = 'update'
        selectedArticleId.value = props.currentCloudArticleId
      } else {
        mode.value = 'new'
        selectedParentId.value = null
        selectedArticleId.value = ''
      }
      init()
    }
  },
)

// 树加载完成后展开关联文章的祖先并回填标题
watch(treeRoots, (roots) => {
  if (roots.length > 0 && props.currentCloudArticleId && mode.value === 'update') {
    expandAncestors(props.currentCloudArticleId)
    const node = findArticleNode(props.currentCloudArticleId)
    if (node) title.value = node.title
  }
})

// 模式
const mode = ref<'new' | 'update'>('new')
const title = ref('')

// 文件夹选择
const selectedParentId = ref<string | null>(null)

// 更新模式：选择已有文章
const selectedArticleId = ref<string>('')

// 递归查找文章节点
function findArticleNode(id: string): TreeNode | undefined {
  function walk(nodes: TreeNode[]): TreeNode | undefined {
    for (const n of nodes) {
      if (n.id === id) return n
      const found = walk(getChildren(n.id))
      if (found) return found
    }
  }
  return walk(treeRoots.value)
}

// 递归渲染文件夹选择树
function isParentSelected(parentId: string | null): boolean {
  return selectedParentId.value === parentId
}

function selectParent(id: string | null) {
  selectedParentId.value = id
  mode.value = 'new'
}

function selectArticle(id: string) {
  selectedArticleId.value = id
  mode.value = 'update'
  const node = findArticleNode(id)
  if (node) title.value = node.title
}

function confirm() {
  const t = title.value.trim()
  if (!t) return

  if (mode.value === 'new') {
    emit('push', {
      parentId: selectedParentId.value,
      title: t,
      content: props.markdown,
    })
  } else {
    emit('push', {
      parentId: null,
      title: t,
      content: props.markdown,
      existingArticleId: selectedArticleId.value,
    })
  }
}

const confirmDisabled = computed(
  () => !title.value.trim() || (mode.value === 'update' && !selectedArticleId.value),
)

function close() {
  emit('close')
}
</script>

<template>
  <BaseDialog
    :visible="visible"
    title="上传到仓库"
    width="420px"
    max-height="80vh"
    :show-footer="true"
    confirm-text="确认上传"
    :confirm-disabled="confirmDisabled"
    :loading="loading"
    loading-text="正在上传..."
    accent="var(--accent)"
    @close="close"
    @confirm="confirm"
  >
    <!-- 模式切换 -->
    <div
      class="flex gap-2 mb-4"
      style="background: var(--bg-secondary, #f5f5f5); border-radius: 8px; padding: 3px"
    >
      <button
        class="flex-1 py-1.5 text-xs rounded-md border-none cursor-pointer transition-colors duration-150"
        :style="
          mode === 'new'
            ? { background: 'var(--accent)', color: 'white' }
            : {
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color, #e0e0e0)',
              }
        "
        @click="mode = 'new'"
      >
        新建文章
      </button>
      <button
        class="flex-1 py-1.5 text-xs rounded-md border-none cursor-pointer transition-colors duration-150"
        :style="
          mode === 'update'
            ? { background: 'var(--accent)', color: 'white' }
            : {
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color, #e0e0e0)',
              }
        "
        @click="
          mode = 'update';
          selectedParentId = null
        "
      >
        更新已有文章
      </button>
    </div>

    <!-- 标题 -->
    <div class="mb-3">
      <label class="text-xs mb-1 block" style="color: var(--text-secondary)">文章标题</label>
      <input
        v-model="title"
        placeholder="输入文章标题"
        class="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style="
          border-color: var(--border-color, #e5e5e5);
          background: var(--bg-secondary, #f9f9f9);
          color: var(--text-primary);
        "
      />
    </div>

    <!-- 新建：选择目标文件夹 -->
    <template v-if="mode === 'new'">
      <label class="text-xs mb-2 block" style="color: var(--text-secondary)">选择目标文件夹</label>

      <!-- 根目录 -->
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-100"
        :style="
          isParentSelected(null)
            ? { background: 'var(--accent-light)', color: 'var(--accent)' }
            : { color: 'var(--text-primary)' }
        "
        @click="selectParent(null)"
      >
        <Folder :size="14" style="color: var(--accent)" />
        <span>（根目录）</span>
        <span
          v-if="isParentSelected(null)"
          class="ml-auto w-2 h-2 rounded-full"
          style="background: var(--accent)"
        />
      </div>

      <!-- 递归文件夹树 -->
      <div class="overflow-auto mt-1">
        <PushToCloudTree
          :nodes="treeRoots"
          :depth="0"
          mode="new"
          :selected-id="selectedParentId"
          :get-children="getChildren"
          :is-expanded="isExpanded"
          :toggle-expand="toggleExpand"
          @select="selectParent"
        />
      </div>
    </template>

    <!-- 更新：递归选择已有文章 -->
    <template v-if="mode === 'update'">
      <label class="text-xs mb-2 block" style="color: var(--text-secondary)"
        >选择要更新的文章</label
      >
      <div class="overflow-auto mt-1" style="max-height: 280px">
        <PushToCloudTree
          :nodes="treeRoots"
          :depth="0"
          mode="update"
          :selected-id="selectedArticleId"
          :get-children="getChildren"
          :is-expanded="isExpanded"
          :toggle-expand="toggleExpand"
          @select="selectArticle"
        />
        <div
          v-if="treeRoots.length === 0"
          class="text-xs py-4 text-center"
          style="color: var(--text-secondary)"
        >
          暂无文章
        </div>
      </div>
    </template>
  </BaseDialog>
</template>
