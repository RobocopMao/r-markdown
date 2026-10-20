/**
 * AI 写作服务：在「AI 文本」的共用接口配置之上，叠加写作专用的采样参数。
 *
 * 为什么复用同一套接口配置：设置里的「AI 文本」子页把接口地址、API Key、模型名
 * 作为文本类能力（写作 / 排版）的公共配置，写作没必要让他再填一遍。
 * 这里只覆盖写作与排版不同的两项（采样温度、最大输出），
 * 其余（接口地址、API Key、模型名、流式、超时）沿用共用配置。
 *
 * 调用本身仍走 aiFormat.chatCompletion —— 不在这里另写一份 fetch，
 * 否则超时、错误中文映射、SSE 解析会与排版慢慢漂移。
 */

import { getSetting } from '@/config/settings'
import {
  chatCompletion,
  isAiConfigured,
  resolveAiConfig,
  type AiFormatConfig,
  type ChatMessage,
  type FormatOptions,
  type FormatResult,
} from '@/services/aiFormat'

/** 写作默认温度：排版取低值求稳定，写作需要更高的发散度 */
export const DEFAULT_WRITE_TEMPERATURE = 0.7
/** 写作默认最大输出：公众号长文 4000-8000 字，比排版的 8192 需要更大的余量 */
export const DEFAULT_WRITE_MAX_TOKENS = 16384
/**
 * 写作最大输出的滑块区间。
 *
 * 排版那档是 1024–32768，写作给到 65536：长文 + 技能全文 + 参考资料一起算，
 * 输出被截断是写作最常见的失败，上限留足才不会逼用户去手改配置。
 * 下限仍从 1024 起，步进 1024 与排版一致。
 */
export const MIN_WRITE_MAX_TOKENS = 1024
export const MAX_WRITE_MAX_TOKENS = 65536

/**
 * 解析写作配置：以「AI 文本」共用配置（地址 / Key / 模型）为底，覆盖写作专用的三项。
 *
 * 模型：写作与排版共用同一套接口与常用模型清单，但各自记住用哪个
 * （aiWriteModel / aiFormatModel），空串表示跟随清单首项（没有单独的默认模型设置）。
 * 采样温度与最大输出因为任务性质不同而分开存。
 */
export function resolveWriteConfig(modelOverride?: string): AiFormatConfig {
  const base = resolveAiConfig(modelOverride ?? (getSetting<string>('aiWriteModel') || ''))
  const temperature = Number(getSetting<number>('aiWriteTemperature'))
  const maxTokens = Number(getSetting<number>('aiWriteMaxTokens'))
  return {
    ...base,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_WRITE_TEMPERATURE,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : DEFAULT_WRITE_MAX_TOKENS,
  }
}

/**
 * 配置是否可用：地址 / Key / 模型三项齐备。
 *
 * 不能直接复用 isAiConfigured()——那个不带面板的模型覆盖，
 * 而写作面板可能临时换了模型，两者解析出来的 model 未必相同。
 */
export function isWriteConfigured(modelOverride?: string): boolean {
  const c = resolveWriteConfig(modelOverride)
  return Boolean(c.baseUrl && c.apiKey && c.model)
}

/** 未配置时列出缺项，供界面拼中文提示 */
export function missingWriteConfigFields(modelOverride?: string): string[] {
  const cfg = resolveWriteConfig(modelOverride)
  const missing: string[] = []
  if (!cfg.baseUrl) missing.push('接口地址')
  if (!cfg.apiKey) missing.push('API Key')
  if (!cfg.model) missing.push('模型名')
  return missing
}

/** 执行一次写作请求（薄包装，保留独立命名以便将来加写作专属逻辑） */
export async function runWrite(
  cfg: AiFormatConfig,
  messages: ChatMessage[],
  opts: FormatOptions = {},
): Promise<FormatResult> {
  return chatCompletion(cfg, messages, opts)
}

/** 供设置页「测试连接」复用：排版配置齐备即可视为写作可用 */
export { isAiConfigured }
