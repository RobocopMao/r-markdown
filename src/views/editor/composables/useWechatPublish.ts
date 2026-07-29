import { ref, type Ref, type ComputedRef } from 'vue'
import { getSetting } from '@/config/settings'
import { DraftStorage } from '@/services/DraftStorage'

export function useWechatPublish(
  markdown: Ref<string>,
  extractedTitle: ComputedRef<string>,
  currentDraftId: Ref<number | null>,
  showToast: (msg: string) => void,
  settingsVisible: Ref<boolean>,
  settingsInitialTab: Ref<string>,
) {
  const wechatPublishVisible = ref(false)
  const wechatMediaId = ref('')
  const wechatCoverMediaId = ref('')

  async function loadWechatMediaId() {
    if (currentDraftId.value) {
      const draft = await DraftStorage.getById(currentDraftId.value)
      wechatMediaId.value = draft?.wechatMediaId || ''
      wechatCoverMediaId.value = draft?.wechatCoverMediaId || ''
    } else {
      wechatMediaId.value = ''
      wechatCoverMediaId.value = ''
    }
  }

  async function handlePublishToWechat() {
    const appid = getSetting<string>('wechatAppId')
    const appsecret = getSetting<string>('wechatAppSecret')
    if (!appid || !appsecret) {
      showToast('请先在设置中配置公众号 AppID 和 AppSecret')
      settingsInitialTab.value = 'wechat'
      settingsVisible.value = true
      return
    }
    if (!currentDraftId.value) {
      showToast('请先保存本地草稿后再推送到公众号')
      return
    }
    await loadWechatMediaId()
    wechatPublishVisible.value = true
  }

  async function handleWechatSaved(mediaId: string, coverMediaId: string) {
    showToast('草稿已保存，请前往公众号后台查看')
    if (currentDraftId.value) {
      if (mediaId) await DraftStorage.updateWechatMediaId(currentDraftId.value, mediaId)
      if (coverMediaId)
        await DraftStorage.updateWechatCoverMediaId(currentDraftId.value, coverMediaId)
    }
  }

  return {
    wechatPublishVisible,
    wechatMediaId,
    wechatCoverMediaId,
    handlePublishToWechat,
    handleWechatSaved,
  }
}
