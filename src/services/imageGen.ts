/**
 * AI 配图服务：调用 OpenAI 兼容的 /images/generations 接口。
 *
 * 设计要点：
 * - 纯 fetch 实现，无第三方依赖；厂商差异全部由 imageProviders 的 def 描述，
 *   本文件只负责「发请求 / 解响应 / 映射错误」。
 * - 支持 AbortController 中止与超时自动中止（超时建议 60–360s）。
 * - 所有错误统一映射为可读中文，便于直接展示给用户。
 */

import { normalizeBaseUrl, describeHttpError, isAbortError, withTimeout } from '@/services/apiBase'

export interface ImageGenConfig {
  /** 归一化后的接口基址，形如 https://apihub.agnes-ai.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  timeoutSec: number
}

export interface ImageGenRequest {
  prompt: string
  /** 尺寸档位，如 1K */
  size: string
  /** 宽高比，如 16:9 */
  ratio: string
}

export interface ImageGenOptions {
  signal?: AbortSignal
}

export interface ImageGenResult {
  /** 远端图片地址（与 b64 二选一） */
  url: string
  /** base64 图片数据，不含 data URI 前缀 */
  b64: string
  /** 模型改写后的提示词，可能为空 */
  revisedPrompt: string
}

/** 组装请求体的回调，由厂商 def 提供 */
export type BuildImageBody = (ctx: {
  model: string
  prompt: string
  size: string
  ratio: string
}) => Record<string, unknown>

/** 解析响应的回调，由厂商 def 提供 */
export type ParseImageResponse = (json: unknown) => {
  url?: string
  b64?: string
  revisedPrompt?: string
}

function assertConfigured(cfg: ImageGenConfig): void {
  const missing: string[] = []
  if (!cfg.baseUrl) missing.push('接口地址')
  if (!cfg.apiKey) missing.push('API Key')
  if (!cfg.model) missing.push('模型名')
  if (missing.length > 0) {
    throw new Error(`尚未配置 AI 配图：请先在设置中填写${missing.join('、')}`)
  }
}

/**
 * 执行一次生图请求。
 *
 * 只负责把图片取回（URL 或 base64 二选一），不做下载、压缩、落盘 —— 那些属于调用方。
 */
export async function generateImage(
  cfg: ImageGenConfig,
  req: ImageGenRequest,
  buildBody: BuildImageBody,
  parseResponse: ParseImageResponse,
  opts: ImageGenOptions = {},
): Promise<ImageGenResult> {
  assertConfigured(cfg)

  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  const { signal, cleanup } = withTimeout(cfg.timeoutSec, opts.signal)
  try {
    let res: Response
    try {
      res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(
          buildBody({
            model: cfg.model,
            prompt: req.prompt,
            size: req.size,
            ratio: req.ratio,
          }),
        ),
        signal,
      })
    } catch (e: unknown) {
      if (isAbortError(e)) throw e
      // fetch 只在网络层失败时抛 TypeError
      throw new TypeError('网络请求失败')
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      throw new Error(describeHttpError(res.status, bodyText, '生成图片'))
    }

    const json = await res.json().catch(() => null)
    const parsed = parseResponse(json)
    if (!parsed.url && !parsed.b64) {
      throw new Error('接口未返回图片，请检查模型名与尺寸参数是否正确')
    }
    return {
      url: parsed.url || '',
      b64: parsed.b64 || '',
      revisedPrompt: parsed.revisedPrompt || '',
    }
  } catch (e: unknown) {
    if (isAbortError(e)) throw e
    if (e instanceof TypeError) {
      throw new Error('无法连接到接口地址，请检查接口地址与网络')
    }
    throw e
  } finally {
    cleanup()
  }
}

/**
 * 把生图结果转成 Blob。
 *
 * - 接口直接返回 base64 时本地解码，不产生额外网络请求；
 * - 返回 URL 时在浏览器侧下载（Agnes 的图片地址可公开访问）。
 */
export async function toImageBlob(
  result: ImageGenResult,
  timeoutSec = 60,
  signal?: AbortSignal,
): Promise<Blob> {
  if (result.b64) return decodeBase64Image(result.b64)
  if (!result.url) throw new Error('接口未返回图片')
  // 少数实现会把图片以 data URI 直接塞进 url 字段，这时不必再走一次网络
  if (result.url.startsWith('data:')) {
    const inline = result.url.match(/^data:([^;,]*);base64,(.+)$/)
    if (!inline) throw new Error('接口返回的图片格式无法识别')
    return decodeBase64Image(inline[2], inline[1] || 'image/png')
  }

  const { signal: s, cleanup } = withTimeout(timeoutSec, signal)
  try {
    let res: Response
    try {
      res = await fetch(result.url, { signal: s })
    } catch (e: unknown) {
      if (isAbortError(e)) throw e
      /**
       * 走到这里多数是 CORS：图片存在第三方存储域上，那个域不放行跨域读取，
       * fetch 会被浏览器拦掉（网络面板显示 CORS error）。这跟「网络不通」是两回事，
       * 所以文案要说清楚，免得被当成网络故障去查。
       */
      throw new Error(
        '图片所在存储域不允许跨域读取（CORS），无法保存；请改用内联返回（return_base64）',
      )
    }
    if (!res.ok) {
      throw new Error(`图片下载失败（HTTP ${res.status}），可能是链接已过期，请重新生成`)
    }
    const blob = await res.blob()
    if (!blob || blob.size === 0) {
      throw new Error('图片内容为空，请重新生成')
    }
    return blob
  } catch (e: unknown) {
    if (isAbortError(e)) throw e
    throw e
  } finally {
    cleanup()
  }
}

function decodeBase64Image(b64: string, type = 'image/png'): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/**
 * 拉取可用模型列表并筛选出图像模型。
 * 接口不支持 /models 时抛可读错误，由设置页引导用户手填模型名。
 */
export async function listImageModels(
  cfg: Pick<ImageGenConfig, 'baseUrl' | 'apiKey' | 'timeoutSec'>,
  pattern: RegExp,
): Promise<string[]> {
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl || !cfg.apiKey) {
    throw new Error('请先填写接口地址与 API Key')
  }
  const { signal, cleanup } = withTimeout(Math.min(cfg.timeoutSec, 30))
  try {
    let res: Response
    try {
      res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal,
      })
    } catch (e: unknown) {
      if (isAbortError(e)) throw new Error('查询模型列表超时')
      throw new Error('无法连接到接口地址，请检查接口地址与网络')
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error('该接口不支持模型列表查询，请手动填写模型名')
      }
      throw new Error(describeHttpError(res.status, bodyText, '查询模型列表'))
    }

    const data = await res.json().catch(() => null)
    const ids: string[] = Array.isArray(data?.data)
      ? (data.data as { id?: unknown }[])
          .map((m) => String(m?.id ?? ''))
          .filter((id: string) => Boolean(id))
      : []
    if (ids.length === 0) {
      throw new Error('该接口未返回模型列表，请手动填写模型名')
    }
    const images = [...new Set(ids.filter((id) => pattern.test(id)))].sort((a, b) =>
      a.localeCompare(b),
    )
    if (images.length === 0) {
      throw new Error(`接口返回了 ${ids.length} 个模型，但没有匹配的图像模型，请手动填写模型名`)
    }
    return images
  } finally {
    cleanup()
  }
}

/** 测试连接：调用 /models 验证地址与 Key 是否可用 */
export async function testImageConnection(
  cfg: Pick<ImageGenConfig, 'baseUrl' | 'apiKey' | 'timeoutSec'>,
  pattern: RegExp,
): Promise<string[]> {
  return listImageModels(cfg, pattern)
}

/**
 * 用「AI 排版」配置的大语言模型把一句简短描述扩写成生图提示词。
 *
 * 为什么复用排版接口而不是让生图厂商做：生图接口只出图、不做文本理解，
 * 而用户往往已经在「设置 → AI 排版」里配好了可用的对话模型，直接借用最省事。
 *
 * 注意本函数**不**校验配置：是否配置由调用方（面板）判断，以便决定按钮显不显示。
 * 传入的 messages 由调用方给出，这里只负责转发与错误归一。
 */
export async function optimizeImagePrompt(
  cfg: {
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    stream: boolean
    timeoutSec: number
  },
  promptText: string,
  opts: { size: string; ratio: string; signal?: AbortSignal; onDelta?: (d: string) => void },
): Promise<string> {
  // 动态导入：避免 AI 配图在未使用优化功能时也把排版模块打进同一 chunk
  const { formatArticle } = await import('@/services/aiFormat')

  const system = [
    '你是文生图提示词工程师。把用户的一句话描述扩写成一条高质量的生图提示词。',
    '',
    '要求：',
    '- 只输出扩写后的提示词本身，不要任何解释、前言、标题或引号',
    '- 按「主体 + 场景/环境 + 风格 + 光照 + 构图 + 质量要求」的顺序组织',
    '- 保留用户的原始意图与关键元素，不要替换成别的主体',
    '- 具体、可视化，避免「好看」「高级」这类空泛词',
    '- 用中文，一段话，60–120 字之间',
  ].join('\n')

  const user = [
    `原始描述：${promptText}`,
    `本次出图参数：${opts.size} 档、${opts.ratio} 比例`,
    '',
    '请输出扩写后的提示词：',
  ].join('\n')

  const { text } = await formatArticle(
    cfg,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { signal: opts.signal, onDelta: opts.onDelta },
  )

  // 兜底清洗：模型偶尔会带引号、前缀或换行
  const cleaned = text
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, '')
    .replace(/^(扩写后的?提示词|提示词|Prompt)\s*[:：]\s*/i, '')
    .replace(/^["“「']+|["”」']+$/g, '')
    .trim()

  if (!cleaned) throw new Error('模型没有返回内容，请重试')
  return cleaned
}
