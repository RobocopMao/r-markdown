/**
 * AI 排版服务：调用 OpenAI 兼容的 /chat/completions 接口。
 *
 * 设计要点：
 * - 纯 fetch 实现，无第三方依赖；支持 SSE 流式与非流式两种模式。
 * - 支持 AbortController 中止与超时自动中止。
 * - 所有错误统一映射为可读中文，便于直接展示给用户。
 */

import { getSetting } from '@/config/settings'
import { normalizeBaseUrl, describeHttpError, isAbortError, withTimeout } from '@/services/apiBase'

export { normalizeBaseUrl }

export interface AiFormatConfig {
  /** 归一化后的接口基址，形如 https://api.deepseek.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  stream: boolean
  timeoutSec: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface FormatOptions {
  /** 每个流式增量回调 */
  onDelta?: (delta: string) => void
  signal?: AbortSignal
}

export interface FormatResult {
  text: string
  /** 供应商返回的结束原因，'length' 表示被 max_tokens 截断 */
  finishReason: string
}

export function resolveAiConfig(): AiFormatConfig {
  return {
    baseUrl: normalizeBaseUrl(getSetting<string>('aiBaseUrl') || ''),
    apiKey: getSetting<string>('aiApiKey') || '',
    model: (getSetting<string>('aiModel') || '').trim(),
    temperature: getSetting<number>('aiTemperature') ?? 0.3,
    maxTokens: getSetting<number>('aiMaxTokens') ?? 8192,
    stream: getSetting<boolean>('aiStream') ?? true,
    timeoutSec: getSetting<number>('aiTimeoutSec') ?? 180,
  }
}

/** 配置是否完整（三项均必填） */
export function isAiConfigured(): boolean {
  const c = resolveAiConfig()
  return Boolean(c.baseUrl && c.apiKey && c.model)
}

/** 未配置时抛出可读错误，供 UI 展示引导 */
export function assertConfigured(cfg: AiFormatConfig): void {
  const missing: string[] = []
  if (!cfg.baseUrl) missing.push('接口地址')
  if (!cfg.apiKey) missing.push('API Key')
  if (!cfg.model) missing.push('模型名')
  if (missing.length > 0) {
    throw new Error(`尚未配置 AI 排版：请先在设置中填写${missing.join('、')}`)
  }
}

async function postChat(
  cfg: AiFormatConfig,
  messages: ChatMessage[],
  stream: boolean,
  signal: AbortSignal,
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream,
      }),
      signal,
    })
  } catch (e: unknown) {
    // fetch 只在网络层失败时抛 TypeError；中止统一交由调用方识别
    if (isAbortError(e)) throw e
    throw new TypeError('网络请求失败')
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(describeHttpError(res.status, bodyText))
  }
  return res
}

/** 解析一个 SSE 数据行，返回其中的增量文本；非内容行返回 null */
function parseSseData(raw: string): { delta: string; finish: string } | null {
  const line = raw.trim()
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    const obj = JSON.parse(payload)
    const choice = obj?.choices?.[0]
    if (!choice) return null
    const delta: string = choice.delta?.content ?? choice.message?.content ?? choice.text ?? ''
    const finish: string = choice.finish_reason ?? ''
    if (!delta && !finish) return null
    return { delta, finish }
  } catch {
    // 半行或非 JSON 心跳，忽略
    return null
  }
}

/**
 * 执行排版请求。流式模式下每个增量经 opts.onDelta 回传。
 */
export async function formatArticle(
  cfg: AiFormatConfig,
  messages: ChatMessage[],
  opts: FormatOptions = {},
): Promise<FormatResult> {
  assertConfigured(cfg)

  const { signal, cleanup } = withTimeout(cfg.timeoutSec, opts.signal)
  try {
    if (!cfg.stream) {
      const res = await postChat(cfg, messages, false, signal)
      const data = await res.json().catch(() => null)
      const choice = data?.choices?.[0]
      const text: string = choice?.message?.content ?? ''
      if (!text) throw new Error('接口返回内容为空，请检查模型名是否正确')
      return { text, finishReason: choice?.finish_reason ?? '' }
    }

    const res = await postChat(cfg, messages, true, signal)
    if (!res.body) {
      // 少数环境不提供流式 body，退回整体读取
      const raw = await res.text()
      return { text: collectFromRawSse(raw), finishReason: '' }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let full = ''
    let finishReason = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 按行处理，最后一段可能不完整，留在 buffer
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx)
        buffer = buffer.slice(newlineIdx + 1)
        const parsed = parseSseData(line)
        if (!parsed) continue
        if (parsed.delta) {
          full += parsed.delta
          opts.onDelta?.(parsed.delta)
        }
        if (parsed.finish) finishReason = parsed.finish
      }
    }
    // 处理残留的最后一行
    if (buffer.trim()) {
      const parsed = parseSseData(buffer)
      if (parsed?.delta) {
        full += parsed.delta
        opts.onDelta?.(parsed.delta)
      }
      if (parsed?.finish) finishReason = parsed.finish
    }

    if (!full.trim()) throw new Error('接口未返回有效内容，请检查模型名是否正确')
    return { text: full, finishReason }
  } catch (e: unknown) {
    if (isAbortError(e)) throw e
    // postChat 与 describeHttpError 已产出可读中文；TypeError 才是真正的网络失败
    if (e instanceof TypeError) {
      throw new Error('无法连接到接口地址，请检查接口地址与网络')
    }
    throw e
  } finally {
    cleanup()
  }
}

/** 非流式兜底：从原始 SSE 文本中拼接全部增量 */
function collectFromRawSse(raw: string): string {
  let out = ''
  for (const line of raw.split('\n')) {
    const parsed = parseSseData(line)
    if (parsed?.delta) out += parsed.delta
  }
  if (out) return out
  // 服务端实际返回的是普通 JSON
  try {
    return JSON.parse(raw)?.choices?.[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}

/** 拉取可用模型列表（GET /models），失败时抛出可读错误 */
export async function listModels(cfg: AiFormatConfig): Promise<string[]> {
  if (!cfg.baseUrl || !cfg.apiKey) {
    throw new Error('请先填写接口地址与 API Key')
  }
  const { signal, cleanup } = withTimeout(Math.min(cfg.timeoutSec, 30))
  try {
    let res: Response
    try {
      res = await fetch(`${cfg.baseUrl}/models`, {
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
      throw new Error(describeHttpError(res.status, bodyText))
    }

    const data = await res.json().catch(() => null)
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: { id?: string }) => String(m?.id ?? '')).filter(Boolean)
      : []
    if (ids.length === 0) {
      throw new Error('该接口未返回模型列表，请手动填写模型名')
    }
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
  } finally {
    cleanup()
  }
}

/** 测试连接：调用 /models 验证地址与 Key 是否可用 */
export async function testAiConnection(cfg: AiFormatConfig): Promise<void> {
  await listModels(cfg)
}
