import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { DraftStorage, type Draft } from '@/services/DraftStorage'
import { extractTitle, sanitizeFilename } from '@/utils/extractTitle'

export function useDraft(
  markdown: Ref<string>,
  showToast: (msg: string) => void,
  extractedTitle: ComputedRef<string>,
  resetMinimap: () => void,
  currentCloudArticleId: Ref<string | null>,
  matchCloudArticle: (title: string | null) => boolean,
) {
  const draftListVisible = ref(false)
  const saveDraftVisible = ref(false)
  const finalizeVisible = ref(false)
  const finalizeDeleteConfirmVisible = ref(false)
  const pushToCloudDeleteConfirmVisible = ref(false)
  const drafts = ref<Draft[]>([])
  const currentDraftId = ref<number | null>(DraftStorage.getCurrentDraftId())

  const draftConfirmVisible = ref(false)
  const draftConfirmTitle = ref('')
  const draftConfirmMessage = ref('')
  const draftConfirmType = ref<'accent' | 'danger'>('accent')
  const draftConfirmText = ref('')
  const draftPendingAction = ref<{ type: 'load' | 'delete'; draftId: number } | null>(null)

  const confirmOverwriteVisible = ref(false)
  const confirmOverwriteMode = ref<'title-changed' | 'same-title-draft'>('title-changed')
  const pendingDraftTitle = ref('')
  const pendingOverwriteDraftId = ref<number | null>(null)

  const draftCount = computed(() => drafts.value.length)
  const currentDraftTitle = ref('')

  watch(currentDraftId, (val) => {
    DraftStorage.setCurrentDraftId(val)
  })

  watch(
    currentDraftId,
    async (id) => {
      if (id !== null) {
        const draft = await DraftStorage.getById(id)
        currentDraftTitle.value = draft?.title ?? ''
      } else {
        currentDraftTitle.value = ''
      }
    },
    { immediate: true },
  )

  async function refreshDrafts() {
    drafts.value = await DraftStorage.list()
  }

  function matchExistingDraft() {
    if (currentDraftId.value !== null) return
    const title = extractedTitle.value

    let match: Draft | undefined
    if (title) {
      match = drafts.value
        .filter((d) => d.title === title)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    }

    if (!match) {
      const content = markdown.value
      match = drafts.value.find((d) => d.content === content)
    }

    if (match) {
      currentDraftId.value = match.id!
    }
  }

  function handleOpenSaveDraft() {
    saveDraftVisible.value = true
  }

  async function handleSaveDraft(_draftId: number, title: string) {
    const isDup = await DraftStorage.isDuplicate(
      title,
      markdown.value,
      currentDraftId.value ?? undefined,
    )
    if (isDup) {
      showToast('内容无变化，无需重复保存')
      return
    }

    if (currentDraftId.value) {
      const existing = await DraftStorage.getById(currentDraftId.value)
      if (existing && existing.title !== title) {
        pendingDraftTitle.value = title
        confirmOverwriteMode.value = 'title-changed'
        confirmOverwriteVisible.value = true
        return
      }
    } else {
      const allDrafts = await DraftStorage.list()
      const sameNameDraft = allDrafts.find((d) => d.title === title)
      if (sameNameDraft) {
        pendingDraftTitle.value = title
        pendingOverwriteDraftId.value = sameNameDraft.id!
        confirmOverwriteMode.value = 'same-title-draft'
        confirmOverwriteVisible.value = true
        return
      }
    }

    await doSaveDraft(title, currentDraftId.value ?? undefined)
  }

  async function doSaveDraft(title: string, targetId?: number) {
    if (targetId !== undefined) {
      await DraftStorage.save(title, markdown.value, targetId)
      currentDraftId.value = targetId
    } else {
      const id = await DraftStorage.save(title, markdown.value)
      currentDraftId.value = id
    }
    saveDraftVisible.value = false
    confirmOverwriteVisible.value = false
    showToast('草稿已保存')
    await refreshDrafts()
  }

  function handleOverwrite() {
    const targetId =
      confirmOverwriteMode.value === 'same-title-draft'
        ? pendingOverwriteDraftId.value!
        : currentDraftId.value!
    doSaveDraft(pendingDraftTitle.value, targetId)
  }

  function handleSaveAsNew() {
    confirmOverwriteVisible.value = false
    doSaveDraft(pendingDraftTitle.value)
  }

  function handleCancelOverwrite() {
    confirmOverwriteVisible.value = false
    pendingDraftTitle.value = ''
  }

  async function handleLoadDraft(id: number) {
    const draft = await DraftStorage.getById(id)
    if (draft) {
      markdown.value = draft.content
      currentDraftId.value = draft.id!
      currentCloudArticleId.value = null
      setTimeout(() => matchCloudArticle(extractTitle(markdown.value)), 300)
      resetMinimap()
      showToast('已加载草稿')
      draftListVisible.value = false
    }
  }

  async function handleDeleteDraft(id: number) {
    await DraftStorage.remove(id)
    if (currentDraftId.value === id) {
      currentDraftId.value = null
    }
    showToast('草稿已删除')
    await refreshDrafts()
    setTimeout(() => matchExistingDraft(), 300)
  }

  function onDraftConfirmLoad(payload: { draftId: number; title: string }) {
    draftPendingAction.value = { type: 'load', draftId: payload.draftId }
    draftConfirmTitle.value = '重新编辑'
    draftConfirmMessage.value = `将重新编辑「${payload.title}」，当前编辑内容将被覆盖。`
    draftConfirmType.value = 'accent'
    draftConfirmText.value = '重新编辑'
    draftConfirmVisible.value = true
  }

  function onDraftConfirmDelete(payload: { draftId: number; title: string }) {
    draftPendingAction.value = { type: 'delete', draftId: payload.draftId }
    draftConfirmTitle.value = '删除草稿'
    draftConfirmMessage.value = `将永久删除草稿「${payload.title}」，此操作不可撤销。`
    draftConfirmType.value = 'danger'
    draftConfirmText.value = '删除'
    draftConfirmVisible.value = true
  }

  function onDraftConfirm() {
    if (!draftPendingAction.value) return
    const { type, draftId } = draftPendingAction.value
    draftPendingAction.value = null
    draftConfirmVisible.value = false
    if (type === 'load') {
      handleLoadDraft(draftId)
    } else {
      handleDeleteDraft(draftId)
    }
  }

  function handleOpenFinalize() {
    finalizeVisible.value = true
  }

  async function handleFinalize(title: string) {
    const safeName = sanitizeFilename(title)
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const filePath = await save({
        defaultPath: safeName + '.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (!filePath) return
      await writeTextFile(filePath, markdown.value)
      showToast('已保存')
    } catch {
      const blob = new Blob([markdown.value], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = safeName + '.md'
      a.click()
      URL.revokeObjectURL(url)
      showToast('已下载')
    }
    finalizeVisible.value = false
    if (currentDraftId.value !== null) {
      setTimeout(() => {
        finalizeDeleteConfirmVisible.value = true
      }, 200)
    }
  }

  async function handleDeleteAfterFinalize() {
    finalizeDeleteConfirmVisible.value = false
    if (currentDraftId.value !== null) {
      await DraftStorage.remove(currentDraftId.value)
      currentDraftId.value = null
      showToast('草稿已删除')
      await refreshDrafts()
    }
  }

  async function handlePushCloudDeleteConfirm() {
    pushToCloudDeleteConfirmVisible.value = false
    if (currentDraftId.value !== null) {
      await DraftStorage.remove(currentDraftId.value)
      currentDraftId.value = null
      showToast('本地草稿已删除')
      await refreshDrafts()
    }
  }

  return {
    draftListVisible,
    saveDraftVisible,
    finalizeVisible,
    finalizeDeleteConfirmVisible,
    pushToCloudDeleteConfirmVisible,
    drafts,
    currentDraftId,
    draftConfirmVisible,
    draftConfirmTitle,
    draftConfirmMessage,
    draftConfirmType,
    draftConfirmText,
    draftPendingAction,
    confirmOverwriteVisible,
    confirmOverwriteMode,
    pendingDraftTitle,
    pendingOverwriteDraftId,
    draftCount,
    currentDraftTitle,
    refreshDrafts,
    matchExistingDraft,
    handleOpenSaveDraft,
    handleSaveDraft,
    handleOverwrite,
    handleSaveAsNew,
    handleCancelOverwrite,
    handleLoadDraft,
    handleDeleteDraft,
    onDraftConfirmLoad,
    onDraftConfirmDelete,
    onDraftConfirm,
    handleOpenFinalize,
    handleFinalize,
    handleDeleteAfterFinalize,
    handlePushCloudDeleteConfirm,
  }
}
