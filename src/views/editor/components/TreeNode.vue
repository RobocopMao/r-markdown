<script setup lang="ts">
import { computed, inject } from 'vue'
import { Folder, FileText, ChevronRight, ChevronDown, SquarePen } from 'lucide-vue-next'
import BaseTooltip from '@/components/BaseTooltip.vue'
import type { TreeNode } from '@/services/GitHubTreeService'

const props = defineProps<{
  node: TreeNode
  depth: number
}>()

// ── 从父组件注入共享状态/方法 ──
const injectIsNodeVisible = inject<(id: string) => boolean>('tree-isNodeVisible', () => true)
const injectIsExpanded = inject<(id: string) => boolean>('tree-isExpanded', () => false)
const injectToggleExpand = inject<(id: string) => void>('tree-toggleExpand', () => {})
const injectGetChildren = inject<(id: string) => TreeNode[]>('tree-getChildren', () => [])
const injectOnPointerDown = inject<(e: PointerEvent, node: TreeNode) => void>(
  'tree-onPointerDown',
  () => {},
)
const injectDropIndicatorStyle = inject<(id: string) => Record<string, string> | null>(
  'tree-dropIndicatorStyle',
  () => null,
)
const injectIsDropInside = inject<(node: TreeNode) => boolean>('tree-isDropInside', () => false)
const injectOnEditArticleClick = inject<(node: TreeNode) => void>(
  'tree-onEditArticleClick',
  () => {},
)
const injectOpenContextMenu = inject<(e: MouseEvent, node: TreeNode) => void>(
  'tree-openContextMenu',
  () => {},
)
const injectCurrentCloudId = inject<string | null>('tree-currentCloudArticleId', null)
const injectDragNodeId = inject<string | null>('tree-dragNodeId', null)
const injectReordering = inject<boolean>('tree-reordering', false)

const paddingStyle = computed(() => ({
  paddingLeft: `${10 + props.depth * 16}px`,
}))

function dropIndicator(nodeId: string) {
  return injectDropIndicatorStyle(nodeId)
}
</script>

<template>
  <template v-if="injectIsNodeVisible(node.id)">
    <!-- folder 节点 -->
    <template v-if="node.type === 'folder'">
      <div
        class="tree-node group relative flex items-center gap-0.5 px-2 py-1 select-none transition-colors duration-100"
        :class="{
          'tree-node--active': injectCurrentCloudId === node.id,
          'opacity-40': injectReordering && injectDragNodeId === node.id,
          'tree-node--drop-inside': injectIsDropInside(node),
        }"
        :style="paddingStyle"
        :data-node-id="node.id"
        @pointerdown="injectOnPointerDown($event, node)"
        @click="injectToggleExpand(node.id)"
        @contextmenu.prevent="injectOpenContextMenu($event, node)"
      >
        <div
          v-if="dropIndicator(node.id)"
          class="absolute left-0 right-0 pointer-events-none z-10"
          :style="dropIndicator(node.id)"
        />
        <span class="flex items-center justify-center w-4 h-4 shrink-0">
          <ChevronRight
            v-if="!injectIsExpanded(node.id)"
            :size="12"
            style="color: var(--text-secondary)"
          />
          <ChevronDown v-else :size="12" style="color: var(--text-secondary)" />
        </span>
        <Folder :size="14" class="shrink-0 ml-0.5" style="color: var(--accent)" />
        <span class="text-xs truncate ml-1" style="color: var(--text-primary)">{{
          node.title
        }}</span>
      </div>

      <!-- 递归子节点 -->
      <template v-if="injectIsExpanded(node.id)">
        <TreeNode
          v-for="child in injectGetChildren(node.id)"
          :key="child.id"
          :node="child"
          :depth="depth + 1"
        />
      </template>
    </template>

    <!-- article 节点 -->
    <template v-else>
      <div
        class="tree-node group relative flex items-center gap-0.5 px-2 py-1 select-none transition-colors duration-100"
        :class="{
          'tree-node--active': injectCurrentCloudId === node.id,
          'opacity-40': injectReordering && injectDragNodeId === node.id,
        }"
        :style="paddingStyle"
        :data-node-id="node.id"
        @pointerdown="injectOnPointerDown($event, node)"
        @contextmenu.prevent="injectOpenContextMenu($event, node)"
      >
        <div
          v-if="dropIndicator(node.id)"
          class="absolute left-0 right-0 pointer-events-none z-10"
          :style="dropIndicator(node.id)"
        />
        <span class="flex items-center justify-center w-4 h-4 shrink-0">
          <span class="w-4" />
        </span>
        <FileText :size="14" class="shrink-0" style="color: var(--text-secondary)" />
        <div class="flex flex-col min-w-0 flex-1 ml-1">
          <span class="text-xs truncate" style="color: var(--text-primary)">{{ node.title }}</span>
        </div>
        <span class="ml-auto shrink-0 hidden group-hover:flex items-center">
          <BaseTooltip text="重新编辑">
            <button
              class="p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
              @click.stop="injectOnEditArticleClick(node)"
            >
              <SquarePen :size="14" style="color: var(--text-secondary)" />
            </button>
          </BaseTooltip>
        </span>
      </div>
    </template>
  </template>
</template>

<style scoped>
.tree-node {
  min-height: 28px;
  cursor: pointer;
}

.tree-node:hover {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.tree-node--active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.tree-node--drop-inside {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  border-radius: 6px;
}
</style>
