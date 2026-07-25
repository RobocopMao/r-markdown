<script setup vapor lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { DEFAULT_CATEGORIES } from '@/services/materialStorage'
import { useTheme } from '@/composables/useTheme'

const { colors } = useTheme()

const selectChevronStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
}

const props = defineProps<{
  visible: boolean
  defaultAuthor?: string
}>()

const emit = defineEmits<{
  close: []
  save: [name: string, author: string, category: string, subCategory: string, description: string]
}>()

const LAST_AUTHOR_KEY = 'rm_save_material_author'

const name = ref('')
const description = ref('')
const author = ref(props.defaultAuthor || localStorage.getItem(LAST_AUTHOR_KEY) || '')
const selectedCategory = ref(DEFAULT_CATEGORIES[0])
const subCategory = ref('')

function handleSave() {
  if (!name.value.trim()) return

  const authorVal = author.value.trim()
  if (authorVal) localStorage.setItem(LAST_AUTHOR_KEY, authorVal)

  emit('save', name.value.trim(), authorVal, selectedCategory.value, subCategory.value.trim(), description.value.trim())
}

function reset() {
  name.value = ''
  description.value = ''
  author.value = props.defaultAuthor || localStorage.getItem(LAST_AUTHOR_KEY) || ''
  selectedCategory.value = DEFAULT_CATEGORIES[0]
  subCategory.value = ''
}

watch(
  () => props.visible,
  (v) => {
    if (!v) reset()
  },
)
</script>

<template>
  <BaseDialog
    title="保存素材"
    :visible="visible"
    :show-footer="true"
    confirm-text="保存"
    cancel-text="取消"
    :confirm-disabled="!name.trim()"
    :accent="colors.accent"
    width="400px"
    @close="emit('close')"
    @confirm="handleSave"
  >
    <div class="flex flex-col gap-4">
      <!-- 素材名称 -->
      <div>
        <label class="block text-[12px] text-[#666] dark:text-[#999] mb-1.5">素材名称</label>
        <input
          v-model="name"
          type="text"
          placeholder="给素材起个名字"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#bbb] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#666]"
          @keyup.enter="handleSave"
        />
      </div>

      <!-- 分类 -->
      <div>
        <label class="block text-[12px] text-[#666] dark:text-[#999] mb-1.5">分类</label>
        <select
          v-model="selectedCategory"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-[9px] text-[13px] text-[#1a1a1a] outline-none box-border cursor-pointer appearance-none bg-no-repeat bg-[right_8px_center] pr-7 transition-colors focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(108,92,231,0.1)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5]"
          :style="selectChevronStyle"
        >
          <option v-for="cat in DEFAULT_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <!-- 子分类 -->
      <div>
        <label class="block text-[12px] text-[#666] dark:text-[#999] mb-1.5">子分类（非必填）</label>
        <input
          v-model="subCategory"
          type="text"
          placeholder="更细的分类，如：引言、结尾"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#bbb] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#666]"
        />
      </div>

      <!-- 作者 -->
      <div>
        <label class="block text-[12px] text-[#666] dark:text-[#999] mb-1.5">作者</label>
        <input
          v-model="author"
          type="text"
          placeholder="作者名"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#bbb] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#666]"
        />
      </div>

      <!-- 描述 -->
      <div>
        <label class="block text-[12px] text-[#666] dark:text-[#999] mb-1.5">描述</label>
        <textarea
          v-model="description"
          rows="2"
          placeholder="简单描述这个素材…"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#bbb] focus:border-[var(--accent)] resize-none dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#666]"
        />
      </div>
    </div>
  </BaseDialog>
</template>
