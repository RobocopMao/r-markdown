<script setup vapor lang="ts">
import { ref, watch } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import BaseDialog from '@/components/BaseDialog.vue'
import { getSetting } from '@/config/settings'
import { uploadCoverImage, saveDraft } from '@/services/wechatPublisher'
import { getCoverMediaId, setCoverMediaId, clearMediaId } from '@/services/coverCache'
import { parseMarkdownAsync } from '@/utils/markdownParser'
import { getDataURL } from '@/utils/imageDB'
import { useTheme } from '@/composables/useTheme'
import { useMermaid } from '@/composables/useMermaid'

const { colors } = useTheme()

const props = defineProps<{
  visible: boolean
  title: string
  content: string
  updateMediaId?: string
  initialCoverMediaId?: string
}>()

const emit = defineEmits<{
  close: []
  saved: [media_id: string, cover_media_id: string]
}>()

const draftTitle = ref('')
const author = ref('')
const digest = ref('')
const coverMediaId = ref('')
const coverUrl = ref('')
const localCoverUrl = ref('')
const draftMediaId = ref('')
const uploading = ref(false)
const saving = ref(false)
const error = ref('')

function initFields() {
  draftTitle.value = props.title || ''
  author.value = getSetting<string>('wechatDefaultAuthor') || ''
  digest.value = extractDigest(props.content || '')
  coverMediaId.value = props.initialCoverMediaId || ''
  coverUrl.value = ''
  localCoverUrl.value = ''
  // 从父组件传入的 updateMediaId（本地草稿元数据中的 wechatMediaId）恢复草稿 ID
  // 无存储值时清空，避免残留上一条文档的 media_id
  draftMediaId.value = props.updateMediaId || ''
  error.value = ''
}

const DIGEST_MAX = 120

/**
 * 从 markdown 内容中提取摘要，超过 DIGEST_MAX 字尾部截断加 "..."
 */
function extractDigest(content: string): string {
  let result = ''

  // 1. 优先从 <title> 组件提取
  const titleMatch = content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    const tagStr = titleMatch[0]
    const inner = (titleMatch[1] || '').trim()

    const extractAttr = (name: string): string => {
      const m = tagStr.match(new RegExp(`${name}="([^"]*)"`, 'i'))
      return m ? m[1] : ''
    }

    const badge = extractAttr('badge')
    const subtitle = extractAttr('subtitle')
    const chips = extractAttr('chips')
    const parts: string[] = []

    if (badge && inner) {
      parts.push(`${badge} · ${inner}`)
    } else if (inner) {
      parts.push(inner)
    } else if (badge) {
      parts.push(badge)
    }

    if (subtitle) {
      if (parts.length > 0) {
        parts[parts.length - 1] += '。' + subtitle
      } else {
        parts.push(subtitle)
      }
    }

    if (chips) {
      const tags = chips
        .split('|')
        .map((t) => `#${t.trim()}`)
        .filter(Boolean)
        .join(' ')
      if (tags) {
        if (parts.length > 0) {
          parts[parts.length - 1] += '。' + tags
        } else {
          parts.push(tags)
        }
      }
    }

    result = parts.join(' — ')
    if (!result) {
      result = inner
    }
  } else {
    // 2. 其次从 <breaking> 组件提取
    const breakingMatch = content.match(/<breaking\b[^>]*>([\s\S]*?)<\/breaking>/i)
    if (breakingMatch) {
      const bTagStr = breakingMatch[0]
      const bBody = (breakingMatch[1] || '').trim()
      const extractAttr = (name: string): string => {
        const m = bTagStr.match(new RegExp(`${name}="([^"]*)"`, 'i'))
        return m ? m[1] : ''
      }
      const bBadge = extractAttr('badge')
      const bTitle = extractAttr('title')
      const bSubtitle = extractAttr('subtitle')
      const bChips = extractAttr('chips')
      const bParts: string[] = []

      if (bBadge && bTitle) {
        bParts.push(`${bBadge} · ${bTitle}`)
      } else if (bTitle) {
        bParts.push(bTitle)
      } else if (bBadge) {
        bParts.push(bBadge)
      }

      if (bSubtitle) {
        if (bParts.length > 0) {
          bParts[bParts.length - 1] += '。' + bSubtitle
        } else {
          bParts.push(bSubtitle)
        }
      }

      if (bBody) {
        const bodyText = bBody
          .replace(/[#*`~>\[\]!()|\\{}<>\-+=_:;'",.\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (bodyText) {
          if (bParts.length > 0) {
            bParts[bParts.length - 1] += '。' + bodyText
          } else {
            bParts.push(bodyText)
          }
        }
      }

      if (bChips) {
        const tags = bChips
          .split('|')
          .map((t) => `#${t.trim()}`)
          .filter(Boolean)
          .join(' ')
        if (tags) {
          if (bParts.length > 0) {
            bParts[bParts.length - 1] += '。' + tags
          } else {
            bParts.push(tags)
          }
        }
      }

      result = bParts.join(' — ')
    } else {
      // 3. 无 title/breaking 组件：取文章正文内容
      // 去掉标签和 markdown 标记，保留纯文本
      result = content
        .replace(/<[^>]*>/g, '')
        .replace(/[#*`~>\[\]!()|\\{}\-+=_:;'",]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }
  }

  if (result.length > DIGEST_MAX) {
    return result.slice(0, DIGEST_MAX - 3) + '...'
  }
  return result
}

watch(
  () => props.visible,
  (val) => {
    if (val) initFields()
  },
)

async function handleSelectCover() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    })
    if (!result) return
    const imagePath = result as string
    if (!imagePath) return

    // 立即使用本地文件预览（Tauri webview 中用 convertFileSrc 转 asset:// 协议）
    localCoverUrl.value = convertFileSrc(imagePath)

    // 检查缓存：同一张图之前上传过则直接复用 media_id
    const cached = getCoverMediaId(imagePath)
    if (cached) {
      coverMediaId.value = cached
      return
    }

    uploading.value = true
    error.value = ''
    const appid = getSetting<string>('wechatAppId')
    const appsecret = getSetting<string>('wechatAppSecret')
    const resp = await uploadCoverImage(appid, appsecret, imagePath)
    coverMediaId.value = resp.media_id
    coverUrl.value = resp.url
    // 写入缓存
    setCoverMediaId(imagePath, resp.media_id)
  } catch (e: any) {
    error.value = `上传封面失败: ${e?.message || e}`
  } finally {
    uploading.value = false
  }
}

const IMG_STORE_KEY = 'r-markdown-editorImgs'

/** 将 localStorage 中的 IMG_xxx base64 token 还原为完整 base64 字符串 */
function resolveLocalBase64(text: string): string {
  try {
    const raw = localStorage.getItem(IMG_STORE_KEY)
    if (!raw) return text
    const entries: [string, string][] = JSON.parse(raw)
    if (!Array.isArray(entries) || entries.length === 0) return text
    let result = text
    for (const [token, b64] of entries) {
      result = result.split(token).join(b64)
    }
    return result
  } catch {
    return text
  }
}

async function resolveIdbImages(text: string): Promise<string> {
  const idbTokens = text.match(/idb:DBI_\d+_[a-z0-9]{6}/g)
  if (!idbTokens || idbTokens.length === 0) return text
  let result = text
  for (const ref of idbTokens) {
    const token = ref.slice(4) // 去掉 "idb:"
    const dataUrl = await getDataURL(token)
    if (dataUrl) {
      result = result.split(ref).join(dataUrl)
    }
  }
  return result
}

async function handleSave() {
  if (!draftTitle.value.trim()) {
    error.value = '请输入标题'
    return
  }
  if (!coverMediaId.value) {
    error.value = '请选择封面图'
    return
  }
  if (!digest.value) {
    error.value = '摘要不能为空'
    return
  }
  if (!author.value) {
    error.value = '作者不能为空'
    return
  }
  saving.value = true
  error.value = ''
  const thumbMediaId = coverMediaId.value
  try {
    const step1 = resolveLocalBase64(props.content)
    const step2 = await resolveIdbImages(step1)
    const renderedHtml = await parseMarkdownAsync(step2, colors.value)

    // 在隐藏 DOM 中渲染 mermaid 图表（renderAll 需要真实 DOM）
    const mermaidContainer = document.createElement('div')
    mermaidContainer.style.cssText =
      'position:fixed;left:-9999px;top:0;width:800px;visibility:hidden'
    mermaidContainer.innerHTML = renderedHtml
    document.body.appendChild(mermaidContainer)
    await useMermaid().renderAll(mermaidContainer)
    const finalHtml = mermaidContainer.innerHTML
    document.body.removeChild(mermaidContainer)

    const appid = getSetting<string>('wechatAppId')
    const appsecret = getSetting<string>('wechatAppSecret')
    const resp = await saveDraft(
      appid,
      appsecret,
      {
        title: draftTitle.value,
        content: finalHtml,
        author: author.value,
        digest: digest.value,
        thumb_media_id: thumbMediaId,
      },
      draftMediaId.value,
    )
    // draft/add 返回 media_id，draft/update 不返回，只在首次时赋值
    if (resp.media_id) {
      draftMediaId.value = resp.media_id
    }
    emit('saved', resp.media_id, coverMediaId.value)
    emit('close')
  } catch (e: any) {
    const msg: string = e?.message || String(e)
    if (thumbMediaId && /thumb|media.id|封面/i.test(msg)) {
      clearMediaId(thumbMediaId)
      coverMediaId.value = ''
      error.value = '封面图已失效，请重新上传封面图'
    } else {
      error.value = `保存失败: ${msg}`
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :visible="visible"
    title="发布到公众号草稿箱"
    width="min(90vw, 540px)"
    :show-footer="false"
    :accent="colors.accent"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <!-- 标题 -->
      <div>
        <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">标题</label>
        <input
          v-model="draftTitle"
          placeholder="请输入文章标题"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
        />
      </div>

      <!-- 作者 -->
      <div>
        <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">作者</label>
        <input
          v-model="author"
          placeholder="请输入作者名"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
        />
      </div>

      <!-- 摘要 -->
      <div>
        <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">摘要</label>
        <textarea
          v-model="digest"
          rows="3"
          maxlength="120"
          placeholder="自动取正文前 120 字"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] resize-none dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
        />
        <p class="text-[10px] text-[#999] dark:text-[#666] mt-1">({{ digest.length }}/120字)</p>
      </div>

      <!-- 封面图 -->
      <div>
        <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">封面图</label>
        <div class="flex items-center gap-3">
          <button
            class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="uploading"
            @click="handleSelectCover"
          >
            {{ uploading ? '上传中…' : coverMediaId ? '重新选择' : '选择图片' }}
          </button>
          <span v-if="coverMediaId" class="text-[12px] text-[var(--accent)]">封面已上传</span>
        </div>
      </div>

      <!-- 错误提示 -->
      <p v-if="error" class="text-[12px] text-[#e74c3c]">{{ error }}</p>

      <!-- 操作按钮 -->
      <div class="flex justify-end gap-2 pt-2 border-t border-[#eee] dark:border-[#444]">
        <button
          class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333]"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          class="cursor-pointer rounded-lg border-0 px-4 py-1.5 text-[12px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          :style="{ backgroundColor: colors.accent }"
          :disabled="saving"
          @click="handleSave"
        >
          {{ saving ? '保存中…' : '存为草稿' }}
        </button>
      </div>
    </div>
  </BaseDialog>
</template>
