import { invoke } from '@tauri-apps/api/core'

export interface DraftArticle {
  title: string
  content: string
  author: string
  digest: string
  thumb_media_id: string
}

export async function uploadCoverImage(
  appid: string,
  appsecret: string,
  imagePath: string,
): Promise<{ media_id: string; url: string }> {
  return invoke('wechat_upload_image', { appid, appsecret, imagePath })
}

export async function saveDraft(
  appid: string,
  appsecret: string,
  article: DraftArticle,
  updateMediaId?: string,
): Promise<{ media_id: string }> {
  return invoke('wechat_save_draft', {
    appid,
    appsecret,
    title: article.title,
    content: article.content,
    author: article.author,
    digest: article.digest,
    thumbMediaId: article.thumb_media_id,
    updateMediaId: updateMediaId || '',
  })
}
