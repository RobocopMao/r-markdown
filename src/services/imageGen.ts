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
import type { ImageRelayDef, ImageRelayTaskState } from '@/services/imageProviders'

export interface ImageGenConfig {
  /** 归一化后的接口基址，形如 https://apihub.agnes-ai.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  timeoutSec: number
  /**
   * 选中的中转站。有值时生图分两步：先提交拿 task_id，再轮询任务接口取图；
   * 未选（undefined）则维持一次性同步返回，两种走法的响应体由 def 各自解析。
   */
  relay?: ImageRelayDef
}

export interface ImageGenRequest {
  prompt: string
  /** 尺寸档位，如 1K（自定义像素模式下仅作展示，实际尺寸看 pixels） */
  size: string
  /** 宽高比，如 16:9；自定义像素模式下为 'custom' */
  ratio: string
  /** 已换算好的像素尺寸，形如 1024x1024 —— 官方 size 字段直接用这个 */
  pixels: string
  /** 图片质量档位（厂商不支持时传空串，由 def 决定发不发） */
  quality: string
  /** 背景档位（厂商不支持时传空串） */
  background: string
  /** 内容审核强度（厂商不支持时传空串） */
  moderation: string
}

export interface ImageGenOptions {
  signal?: AbortSignal
  /**
   * 任务状态变化回调，只在走了中转站轮询时触发（同步接口一次就回图，没有中间态）。
   * 面板用它把「排队中 / 生成中 45%」显示出来，不传则静默轮询。
   */
  onTaskState?: (state: ImageRelayTaskState) => void
}

export interface ImageGenResult {
  /** 远端图片地址（与 b64 二选一） */
  url: string
  /** base64 图片数据，不含 data URI 前缀 */
  b64: string
  /** 模型改写后的提示词，可能为空 */
  revisedPrompt: string
}

/**
 * 组装请求体的回调，由厂商 def 提供。
 *
 * ctx 是「面板选了什么」与「接口要什么」之间的全部信息，各厂商只挑自己认识的字段发，
 * 不认识的就不要发（例如 Agnes 不发 quality，GPT-Image 不发 ratio）。
 */
export type BuildImageBody = (ctx: {
  model: string
  prompt: string
  size: string
  ratio: string
  pixels: string
  quality: string
  background: string
  moderation: string
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
 * 提交生图请求，返回原始 JSON。
 *
 * 同步接口在这一步就拿到图片；走中转站时这里只拿到 task_id。
 */
async function submitGeneration(
  baseUrl: string,
  cfg: ImageGenConfig,
  req: ImageGenRequest,
  buildBody: BuildImageBody,
  signal: AbortSignal,
): Promise<unknown> {
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
          pixels: req.pixels,
          quality: req.quality,
          background: req.background,
          moderation: req.moderation,
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
  assertRelayApiError(cfg.relay, json)
  return json
}

/**
 * 拦下「HTTP 200 但响应体里其实是错误」的站点。
 *
 * 多米API 这类站点把失败塞在 200 里，实测两种都出现过：
 * - Key 不对 → `{"code":403,"msg":"请求密钥KEY不正确！"}`
 * - 余额不足 → `{"code":400,"msg":"请求失败，API账户余额不足或没有权限"}`
 * 不拦的话：提交会被当成「没给任务 id 的同步响应」而降级成同步解析，
 * 查询会被当成「还在跑」而一直轮询到超时——两种报错都与真实原因无关。
 *
 * 文案直接用对方给的 msg：它本来就是中文，且**只有站点自己知道** 403 是 Key 问题
 * 还是账户问题，我们不要在这里猜。
 */
function assertRelayApiError(relay: ImageRelayDef | undefined, json: unknown): void {
  const message = relay?.apiError?.(json) || ''
  if (message) throw new Error(message)
}

/** 可被中止的等待，用于轮询间隔 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('请求已中止', 'AbortError'))
      return
    }
    // onAbort 用函数声明，好让它能引用后声明的 timer；声明提升，运行时无问题
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('请求已中止', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 轮询中转站的任务接口，直到出图、失败或整体超时。
 *
 * 超时由外层的 withTimeout 统一控制（提交与轮询共用同一个 deadline），
 * 这里只需一直查，直到 signal 被中止。
 */
async function pollRelayTask(
  baseUrl: string,
  cfg: ImageGenConfig,
  relay: ImageRelayDef,
  taskId: string,
  parseResponse: ParseImageResponse,
  opts: ImageGenOptions,
  signal: AbortSignal,
): Promise<ImageGenResult> {
  const interval = Math.max(1, relay.pollIntervalSec) * 1000
  const taskUrl = `${baseUrl}${relay.taskPath.replace('{id}', encodeURIComponent(taskId))}`

  for (;;) {
    let res: Response
    try {
      res = await fetch(taskUrl, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal,
      })
    } catch (e: unknown) {
      if (isAbortError(e)) throw e
      throw new TypeError('网络请求失败')
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      throw new Error(describeHttpError(res.status, bodyText, '查询任务状态'))
    }

    const json = await res.json().catch(() => null)
    assertRelayApiError(relay, json)
    const state = relay.parseTask(json)
    opts.onTaskState?.(state)

    if (state.failed) {
      throw new Error(state.message || '任务已失败，请稍后重试')
    }
    if (state.url || state.b64) {
      return {
        url: state.url || '',
        b64: state.b64 || '',
        revisedPrompt: state.revisedPrompt || '',
      }
    }
    if (state.done) {
      // 声明完成却没给图：再按同步响应结构试一次，免得白等
      const parsed = parseResponse(json)
      if (parsed.url || parsed.b64) {
        return {
          url: parsed.url || '',
          b64: parsed.b64 || '',
          revisedPrompt: parsed.revisedPrompt || '',
        }
      }
      throw new Error('任务已完成但没有返回图片，请检查模型名与尺寸参数是否正确')
    }

    await sleep(interval, signal)
  }
}

/**
 * 执行一次生图请求。
 *
 * 只负责把图片取回（URL 或 base64 二选一），不做下载、压缩、落盘 —— 那些属于调用方。
 * 选了中转站时自动走「提交 → 轮询 → 取图」，调用方无需区分。
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
    const json = await submitGeneration(baseUrl, cfg, req, buildBody, signal)

    // 中转站：提交只回 task_id，图要再查任务接口
    if (cfg.relay) {
      const taskId = cfg.relay.parseTaskId(json)
      if (taskId) {
        opts.onTaskState?.({
          status: 'submitted',
          done: false,
          failed: false,
          progress: 0,
        })
        return await pollRelayTask(baseUrl, cfg, cfg.relay, taskId, parseResponse, opts, signal)
      }
      // 没给 task_id，说明这一家用的是同步响应，按普通结构继续解析
    }

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
 * 拉取可用模型列表并筛选出「本厂商能用」的模型。
 *
 * 两道筛选：
 * 1. `pattern`（def.modelIdPattern）：是不是图像模型——把文本模型挡在外面；
 * 2. `strict`（def.modelIdValid，可选）：**是不是本厂商真能用的型号**。
 *    中转站的 /models 会把几十个别家的图像模型一起列出来（nano-banana / seedream /
 *    flux …），它们不吃本厂商这套参数，列进下拉只会让人选了再失败。
 *    各家写法不一致（前缀、后缀、下划线分隔都有可能），宽松匹配由 def 的正则负责。
 *
 * 接口不支持 /models 时抛可读错误，由设置页引导用户手填模型名。
 */
export async function listImageModels(
  cfg: Pick<ImageGenConfig, 'baseUrl' | 'apiKey' | 'timeoutSec'>,
  pattern: RegExp,
  strict?: RegExp,
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
    const imageIds = [...new Set(ids.filter((id) => pattern.test(id)))].sort((a, b) =>
      a.localeCompare(b),
    )
    if (imageIds.length === 0) {
      throw new Error(`接口返回了 ${ids.length} 个模型，但没有匹配的图像模型，请手动填写模型名`)
    }
    if (!strict) return imageIds
    const usable = imageIds.filter((id) => strict.test(id))
    if (usable.length === 0) {
      throw new Error(
        `接口返回了 ${imageIds.length} 个图像模型，但没有本厂商支持的型号，请手动填写模型名`,
      )
    }
    return usable
  } finally {
    cleanup()
  }
}

/**
 * 中转站的鉴权探活：请求一个**不存在的任务**，只看对方认不认这把 Key。
 *
 * 用来给「没有 /models 列表接口」的站（多米API）提供测试连接：地址通、Key 有效时，
 * 对方会老实回「任务不存在」，而不是鉴权失败。查询一个不存在的 id 没有副作用，
 * 也不产生费用，比随便提交一次生图去试要干净得多。
 */
async function probeRelayAuth(
  cfg: Pick<ImageGenConfig, 'baseUrl' | 'apiKey' | 'timeoutSec'>,
  relay: ImageRelayDef,
  probePath: string,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(cfg.baseUrl)
  if (!baseUrl || !cfg.apiKey) {
    throw new Error('请先填写接口地址与 API Key')
  }
  const { signal, cleanup } = withTimeout(Math.min(cfg.timeoutSec, 30))
  try {
    const probeId = `probe-${Date.now().toString(36)}`
    const url = `${baseUrl}${probePath.replace('{id}', encodeURIComponent(probeId))}`
    let res: Response
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal })
    } catch (e: unknown) {
      if (isAbortError(e)) throw new Error('测试连接超时')
      throw new Error('无法连接到接口地址，请检查接口地址与网络')
    }
    const bodyText = await res.text().catch(() => '')
    let json: unknown = null
    try {
      json = bodyText ? JSON.parse(bodyText) : null
    } catch {
      json = null
    }
    // 有的站把「Key 不对 / 余额不足」包在 HTTP 200 里，先让厂商自己认一遍
    const relayMessage = relay.apiError?.(json) || ''
    if (relayMessage) throw new Error(relayMessage)
    // 鉴权类与服务器类错误才是真失败；其余（任务不存在、参数不全）说明路由通了、Key 也过了
    if (res.status === 401 || res.status === 403 || res.status >= 500) {
      throw new Error(describeHttpError(res.status, bodyText, '测试连接'))
    }
  } finally {
    cleanup()
  }
}

/**
 * 测试连接：验证地址与 Key 是否可用。
 *
 * 优先用中转站声明的 `probePath` 探活（没有 /models 的站只能这样），
 * 否则照旧拉一次 /models —— 能顺带证明模型列表可用。
 */
export async function testImageConnection(
  cfg: Pick<ImageGenConfig, 'baseUrl' | 'apiKey' | 'timeoutSec'>,
  pattern: RegExp,
  strict?: RegExp,
  relay?: ImageRelayDef,
): Promise<string[]> {
  const probePath = relay?.probePath
  if (relay && probePath) {
    await probeRelayAuth(cfg, relay, probePath)
    return []
  }
  return listImageModels(cfg, pattern, strict)
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
  opts: { sizeText: string; signal?: AbortSignal; onDelta?: (d: string) => void },
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
    // 自定义像素模式下没有档位，写「2K 档、16:9 比例」会让模型凭空编一个档位，所以只传成品描述
    `本次出图参数：${opts.sizeText}`,
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
