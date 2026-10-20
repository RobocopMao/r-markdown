<script setup lang="ts">
/**
 * 模型多选：把「接口查回来的模型列表」与「自己手填的模型名」合成一份可勾选的清单。
 *
 * 为什么不是一个原生 multiple select：原生多选要按住 Ctrl 点、选中项不高亮成标签，
 * 手填模型也没有入口，而中转站的模型列表经常有几十个、还常混着非本用途的模型，
 * 所以做成「标签 + 输入框 + 勾选清单」三块。
 *
 * 已选值放在 v-model:models；options 只影响「能勾哪些」，不影响已选值是否合法
 * （手填的模型可能不在列表里，这是被允许的）。
 */
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import BaseCheckbox from '@/components/BaseCheckbox.vue'

const props = withDefaults(
  defineProps<{
    /** 已选模型名 */
    models: string[]
    /** 可勾选清单（接口查回来的）；为空时只显示手填入口 */
    options?: string[]
    /** 手填框占位文案 */
    placeholder?: string
    /** 禁用（例如生成中） */
    disabled?: boolean
    /** 清单区域最大高度（px），模型多时避免把设置页撑太长 */
    listMaxHeight?: number
  }>(),
  {
    options: () => [],
    placeholder: '手动输入模型名后回车添加',
    disabled: false,
    listMaxHeight: 132,
  },
)

const emit = defineEmits<{
  'update:models': [models: string[]]
}>()

/** 手填框当前内容 */
const draft = ref('')

function commit(next: string[]) {
  // 去重并丢掉空串，保持「先勾选、后手填」的顺序由调用方决定
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const m of next) {
    const name = m.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    cleaned.push(name)
  }
  emit('update:models', cleaned)
}

function toggle(name: string, checked: boolean) {
  commit(checked ? [...props.models, name] : props.models.filter((m) => m !== name))
}

function remove(name: string) {
  commit(props.models.filter((m) => m !== name))
}

function addDraft() {
  const name = draft.value.trim()
  if (!name) return
  // 重复添加直接忽略，不报错——用户多半只是忘了它已经在列表里
  if (!props.models.includes(name)) commit([...props.models, name])
  draft.value = ''
}

function onDraftKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addDraft()
  }
}
</script>

<template>
  <div>
    <!-- 已选：标签形式，每个可单独移除 -->
    <div v-if="models.length > 0" class="mb-1.5 flex flex-wrap items-center gap-1">
      <span
        v-for="m in models"
        :key="m"
        class="inline-flex max-w-full items-center gap-1 rounded-md bg-[#f0f0f0] py-[2px] pl-2 pr-1 text-[11px] text-[#333] dark:bg-[#2a2a2a] dark:text-[#ccc]"
      >
        <span class="truncate font-mono" :title="m">{{ m }}</span>
        <button
          class="cursor-pointer rounded p-[1px] text-[#999] transition-colors hover:bg-[#e0e0e0] hover:text-[#333] disabled:cursor-not-allowed dark:text-[#666] dark:hover:bg-[#3a3a3a] dark:hover:text-[#ccc]"
          :disabled="disabled"
          :aria-label="`移除 ${m}`"
          @click="remove(m)"
        >
          <X :size="11" />
        </button>
      </span>
    </div>
    <p v-else class="mb-1.5 text-[10px] text-[#999] dark:text-[#666]">
      还没有选中任何模型，从下面勾选或手填一个。
    </p>

    <!-- 手填入口：中转站的模型列表常有遗漏，所以任何时候都能加 -->
    <div class="flex items-center gap-1.5">
      <input
        v-model="draft"
        :placeholder="placeholder"
        :disabled="disabled"
        class="min-w-0 flex-1 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
        @keydown="onDraftKeydown"
      />
      <button
        class="shrink-0 cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-[5px] text-[11px] text-[#666] transition-colors hover:border-[#ccc] hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:text-[#ccc]"
        :disabled="disabled || !draft.trim()"
        @click="addDraft"
      >
        添加
      </button>
    </div>

    <!-- 勾选清单：options 为空时整块不出现，避免一个空框 -->
    <div
      v-if="options.length > 0"
      class="mt-1.5 overflow-y-auto rounded-lg border border-[#f0f0f0] p-1.5 dark:border-[#333]"
      :style="{ maxHeight: `${listMaxHeight}px` }"
    >
      <div
        v-for="opt in options"
        :key="opt"
        class="flex items-center gap-2 rounded px-1 py-[3px] hover:bg-[#f7f7f7] dark:hover:bg-[#262626]"
      >
        <BaseCheckbox
          :checked="models.includes(opt)"
          size="sm"
          :disabled="disabled"
          @change="toggle(opt, $event)"
        />
        <button
          class="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[11px] text-[#444] disabled:cursor-not-allowed dark:text-[#bbb]"
          :disabled="disabled"
          :title="opt"
          @click="toggle(opt, !models.includes(opt))"
        >
          {{ opt }}
        </button>
      </div>
    </div>
  </div>
</template>
