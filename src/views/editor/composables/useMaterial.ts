import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { MaterialStorage, type MaterialItem } from '@/services/materialStorage'

interface EditorExposed {
  insertAtCursor: (text: string) => void
}

export function useMaterial(
  markdown: Ref<string>,
  showToast: (msg: string) => void,
  editorRef: Ref<EditorExposed | undefined>,
) {
  const router = useRouter()

  const showMaterialPanel = ref(false)
  const saveMaterialVisible = ref(false)

  // 素材重复内容确认弹窗状态
  const confirmMaterialOverwriteVisible = ref(false)
  const pendingMaterial = ref<{ name: string; author: string; category: string; subCategory: string; description: string } | null>(null)
  const pendingMaterialContent = ref('')
  const pendingOverwriteMaterialId = ref<string | null>(null)
  const pendingOverwriteMaterialName = ref('')

  // ── 素材入口 ──
  function onMaterialAction(action: 'my' | 'library') {
    if (action === 'my') {
      showMaterialPanel.value = true
    } else if (action === 'library') {
      router.push('/materials')
    }
  }

  function handleOpenSaveMaterial() {
    saveMaterialVisible.value = true
  }

  async function handleSaveMaterial(name: string, author: string, category: string, subCategory: string, description: string) {
    const raw = markdown.value
    if (!raw.trim()) {
      showToast('编辑器内容为空')
      return
    }
    const content = raw.trim()

    // 检查是否有相同内容的素材
    const allMaterials = await MaterialStorage.list()
    const sameContent = allMaterials.find((m) => m.content === content)
    if (sameContent) {
      pendingMaterial.value = { name, author: author || '匿名', category, subCategory, description }
      pendingMaterialContent.value = content
      pendingOverwriteMaterialId.value = sameContent.id
      pendingOverwriteMaterialName.value = sameContent.name
      confirmMaterialOverwriteVisible.value = true
      return
    }

    await doSaveMaterial(name, author || '匿名', category, subCategory, description, content)
  }

  async function doSaveMaterial(name: string, author: string, category: string, subCategory: string, description: string, content: string) {
    const item: MaterialItem = {
      id: crypto.randomUUID(),
      name,
      author,
      category,
      subCategory: subCategory || undefined,
      description: description || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content,
    }
    await MaterialStorage.save(item)
    saveMaterialVisible.value = false
    confirmMaterialOverwriteVisible.value = false
    showToast('素材已保存')
  }

  async function handleMaterialOverwrite() {
    if (!pendingMaterial.value || !pendingOverwriteMaterialId.value) return
    const existing = await MaterialStorage.get(pendingOverwriteMaterialId.value)
    if (!existing) return
    const updated: MaterialItem = {
      ...existing,
      name: pendingMaterial.value.name,
      author: pendingMaterial.value.author,
      category: pendingMaterial.value.category,
      subCategory: pendingMaterial.value.subCategory || undefined,
      description: pendingMaterial.value.description || undefined,
      content: pendingMaterialContent.value,
      updatedAt: new Date().toISOString(),
    }
    await MaterialStorage.save(updated)
    saveMaterialVisible.value = false
    confirmMaterialOverwriteVisible.value = false
    showToast('素材已覆盖')
  }

  async function handleMaterialSaveAsNew() {
    if (!pendingMaterial.value) return
    confirmMaterialOverwriteVisible.value = false
    await doSaveMaterial(pendingMaterial.value.name, pendingMaterial.value.author, pendingMaterial.value.category, pendingMaterial.value.subCategory, pendingMaterial.value.description, pendingMaterialContent.value)
  }

  function handleCancelMaterialOverwrite() {
    confirmMaterialOverwriteVisible.value = false
    pendingMaterial.value = null
    pendingMaterialContent.value = ''
    pendingOverwriteMaterialId.value = null
  }

  function handleInsertMaterial(item: MaterialItem) {
    if (!editorRef.value) return
    editorRef.value.insertAtCursor('\n' + item.content)
    showMaterialPanel.value = false
    showToast('素材已插入')
  }

  return {
    showMaterialPanel,
    saveMaterialVisible,
    confirmMaterialOverwriteVisible,
    pendingMaterial,
    pendingMaterialContent,
    pendingOverwriteMaterialId,
    pendingOverwriteMaterialName,
    onMaterialAction,
    handleOpenSaveMaterial,
    handleSaveMaterial,
    handleMaterialOverwrite,
    handleMaterialSaveAsNew,
    handleCancelMaterialOverwrite,
    handleInsertMaterial,
  }
}
