<script setup lang="ts">
import { Folder, FileText, ChevronRight, ChevronDown } from 'lucide-vue-next'
import type { TreeNode } from '@/services/GitHubTreeService'

defineProps<{
  nodes: TreeNode[]
  depth: number
  mode: 'new' | 'update'
  selectedId: string | null
  getChildren: (id: string) => TreeNode[]
  isExpanded: (id: string) => boolean
  toggleExpand: (id: string) => void
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

function onSelect(id: string) {
  emit('select', id)
}
</script>

<template>
  <template v-for="node in nodes" :key="node.id">
    <!-- 新建模式：只展示文件夹，点击选中 -->
    <template v-if="mode === 'new'">
      <template v-if="node.type === 'folder'">
        <div
          class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-100"
          :style="{
            paddingLeft: 12 + depth * 20 + 'px',
            ...(selectedId === node.id
              ? { background: 'var(--accent-light)', color: 'var(--accent)' }
              : { color: 'var(--text-primary)' }),
          }"
          @click="onSelect(node.id)"
        >
          <span
            class="flex items-center justify-center w-4 h-4 shrink-0"
            @click.stop="toggleExpand(node.id)"
          >
            <ChevronRight
              v-if="!isExpanded(node.id)"
              :size="12"
              style="color: var(--text-secondary)"
            />
            <ChevronDown v-else :size="12" style="color: var(--text-secondary)" />
          </span>
          <Folder :size="14" style="color: var(--accent)" />
          <span>{{ node.title }}</span>
        </div>
        <PushToCloudTree
          v-if="isExpanded(node.id)"
          :nodes="getChildren(node.id).filter((n: TreeNode) => n.type === 'folder')"
          :depth="depth + 1"
          :mode="mode"
          :selected-id="selectedId"
          :get-children="getChildren"
          :is-expanded="isExpanded"
          :toggle-expand="toggleExpand"
          @select="(id: string) => $emit('select', id)"
        />
      </template>
    </template>

    <!-- 更新模式：展示全部节点，文件夹点击展开，文章点击选中 -->
    <template v-else>
      <!-- 文件夹 -->
      <template v-if="node.type === 'folder'">
        <div
          class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-100"
          :style="{ paddingLeft: 12 + depth * 20 + 'px', color: 'var(--text-primary)' }"
          @click="toggleExpand(node.id)"
        >
          <span class="flex items-center justify-center w-4 h-4 shrink-0">
            <ChevronRight
              v-if="!isExpanded(node.id)"
              :size="12"
              style="color: var(--text-secondary)"
            />
            <ChevronDown v-else :size="12" style="color: var(--text-secondary)" />
          </span>
          <Folder :size="14" style="color: var(--accent)" />
          <span>{{ node.title }}</span>
        </div>
        <PushToCloudTree
          v-if="isExpanded(node.id)"
          :nodes="getChildren(node.id)"
          :depth="depth + 1"
          :mode="mode"
          :selected-id="selectedId"
          :get-children="getChildren"
          :is-expanded="isExpanded"
          :toggle-expand="toggleExpand"
          @select="(id: string) => $emit('select', id)"
        />
      </template>
      <!-- 文章 -->
      <div
        v-else
        class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-100"
        :style="{
          paddingLeft: 12 + depth * 20 + 'px',
          ...(selectedId === node.id
            ? { background: 'var(--accent-light)', color: 'var(--accent)' }
            : { color: 'var(--text-primary)' }),
        }"
        @click="onSelect(node.id)"
      >
        <FileText :size="14" class="shrink-0 ml-0.5" style="color: var(--text-secondary)" />
        <span>{{ node.title }}</span>
      </div>
    </template>
  </template>
</template>
