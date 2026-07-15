<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { DEFAULT_CATEGORIES } from '@/services/materialStorage'
import { useTheme } from '@/composables/useTheme'

const { colors } = useTheme()

const props = defineProps<{
  visible: boolean
  defaultAuthor?: string
}>()

const emit = defineEmits<{
  close: []
  save: [name: string, author: string, category: string, description: string]
}>()

const LAST_AUTHOR_KEY = 'rm_save_material_author'

const name = ref('')
const description = ref('')
const author = ref(props.defaultAuthor || localStorage.getItem(LAST_AUTHOR_KEY) || '')
const selectedCategory = ref(DEFAULT_CATEGORIES[0])
const customCategory = ref('')
const showCustomInput = ref(false)

const category = computed(() =>
  showCustomInput.value ? customCategory.value : selectedCategory.value
)

function handleCategoryChange(val: string) {
  if (val === '__custom__') {
    showCustomInput.value = true
    customCategory.value = ''
  } else {
    showCustomInput.value = false
    selectedCategory.value = val
  }
}

function handleSave() {
  if (!name.value.trim()) return
  const cat = showCustomInput.value
    ? (customCategory.value.trim() ? `其他 · ${customCategory.value.trim()}` : '其他')
    : selectedCategory.value
  if (!cat) return

  const authorVal = author.value.trim()
  if (authorVal) localStorage.setItem(LAST_AUTHOR_KEY, authorVal)

  emit('save', name.value.trim(), authorVal, cat, description.value.trim())
}

function reset() {
  name.value = ''
  description.value = ''
  author.value = props.defaultAuthor || localStorage.getItem(LAST_AUTHOR_KEY) || ''
  selectedCategory.value = DEFAULT_CATEGORIES[0]
  customCategory.value = ''
  showCustomInput.value = false
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
    :confirm-disabled="!name.trim() || !category"
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
          :value="showCustomInput ? '__custom__' : selectedCategory"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors cursor-pointer focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5]"
          @change="handleCategoryChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="cat in DEFAULT_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          <option value="__custom__">自定义…</option>
        </select>
        <input
          v-if="showCustomInput"
          v-model="customCategory"
          type="text"
          placeholder="输入自定义分类"
          class="w-full mt-2 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#bbb] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#666]"
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
