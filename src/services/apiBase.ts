/**
 * OpenAI 兼容接口的通用基址与错误处理助手。
 *
 * AI 排版（/chat/completions）与 AI 配图（/images/generations）共用这里的实现，
 * 避免两处各自维护一份「补 /v1」「中文错误映射」的逻辑而逐渐漂移。
 */

/** 去掉尾部多余的 `/`；若结尾没有版本段则补 /v1 */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (!url) return ''
  // 已带版本段（/v1、/v1beta、/compatible-mode/v1 等）则不补
  if (!/\/v\d+[a-z]*$/i.test(url)) url += '/v1'
  return url
}

/** 从错误响应体里尝试提取供应商给出的说明 */
export function extractApiError(bodyText: string): string {
  if (!bodyText) return ''
  try {
    const data = JSON.parse(bodyText)
    const msg = data?.error?.message || data?.message || data?.error
    if (typeof msg === 'string') return msg.slice(0, 200)
  } catch {
    // 非 JSON，退回截断的原文
  }
  const trimmed = bodyText.trim()
  return trimmed ? trimmed.slice(0, 200) : ''
}

/**
 * 把 HTTP 状态码与网络异常翻译成可读中文。
 * @param action 失败动作的中文名，用于兜底文案，如「生成图片」
 */
export function describeHttpError(status: number, bodyText: string, action = '请求'): string {
  const detail = extractApiError(bodyText)
  const suffix = detail ? `（${detail}）` : ''
  switch (status) {
    case 401:
    case 403:
      return `API Key 无效或无权限${suffix}`
    case 404:
      return `接口地址或模型名不正确${suffix}`
    case 422:
      return `请求参数不被接受${suffix}`
    case 429:
      return `请求过于频繁或额度不足${suffix}`
    default:
      if (status >= 500) return `服务端错误（HTTP ${status}）${suffix}`
      return `${action}失败（HTTP ${status}）${suffix}`
  }
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'AbortError'
  return e instanceof Error ? e.message.includes('abort') : false
}

/** 组合外部 signal 与超时，返回清理函数 */
export function withTimeout(timeoutSec: number, external?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('请求超时', 'AbortError')),
    Math.max(1, timeoutSec) * 1000,
  )
  const onAbort = () => controller.abort()
  external?.addEventListener('abort', onAbort)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  }
}
