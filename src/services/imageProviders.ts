/**
 * AI 配图（生图）的「厂商注册表」。
 *
 * 各家生图接口的参数并不一致（尺寸是档位还是像素、宽高比是独立字段还是拼进 size、
 * 返回的是 url 还是 b64……），所以这里把差异全部收敛成一份数据描述：
 * **新增一家厂商 = 在 IMAGE_PROVIDERS 里加一条 def**，设置页与配图面板的字段会自动出现，
 * 调用层（services/imageGen.ts）也只按 def 组装请求体，不再出现 if (厂商 === 'xxx')。
 *
 * 配置本身按厂商分开存放（settings 的 imageGenProviders 表，敏感字段整体加密），
 * 读取一律走 getProviderConfig()，不要在 UI 里直接读设置对象。
 */

import { getSetting, setSetting } from '@/config/settings'

/** 面板与设置页共用的厂商能力描述 */
export interface ImageProviderDef {
  /** 厂商 id，同时是配置表 imageGenProviders 的键 */
  id: string
  /** 展示名 */
  name: string
  /**
   * 官方文档地址。
   * 目前界面上没有入口（用户明确不要「查看文档」按钮），仅作资料留存与将来复用。
   */
  docUrl: string
  /** 默认接口基址（含版本段） */
  baseUrl: string
  /** 备选线路，供网络不通时一键切换（CORS 已确认可用，纯属线路差异） */
  altBaseUrls: { label: string; url: string }[]
  /** 该厂商允许的模型名（先填默认值，用户可查列表或手改） */
  models: string[]
  defaultModel: string
  /** 尺寸档位（如 1K / 2K）；与 ratios 组合决定实际输出像素 */
  sizes: string[]
  defaultSize: string
  /** 支持的宽高比；为空表示该厂商不支持独立的比例参数 */
  ratios: string[]
  defaultRatio: string
  /** 档位 × 比例 → 像素，仅用于界面提示 */
  sizeTable: Record<string, Record<string, string>>
  /** 单次请求超时默认值（秒）与允许区间 */
  defaultTimeoutSec: number
  minTimeoutSec: number
  maxTimeoutSec: number
  /** 从 /models 列表里筛选图像模型的规则；不匹配的模型名不会进入下拉 */
  modelIdPattern: RegExp
  /** 模型名下方的用法提示 */
  modelHint: string
  /** 设置页顶部的说明文案 */
  intro: string
  /** 组装请求体（厂商私有字段都在这里消化） */
  buildBody(ctx: ImageRequestContext): Record<string, unknown>
  /** 从响应 JSON 里取图片（url 或 base64 二选一） */
  parseResponse(json: unknown): ImageResponse
}

export interface ImageRequestContext {
  model: string
  prompt: string
  size: string
  ratio: string
}

export interface ImageResponse {
  /** 远端图片地址 */
  url?: string
  /** base64 图片数据（不含 data URI 前缀） */
  b64?: string
  /** 模型改写后的提示词，部分接口会返回 */
  revisedPrompt?: string
}

export interface ImageGenProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
  size: string
  ratio: string
  timeoutSec: number
}

/** Agnes 的尺寸对照表（来自官方文档「输出尺寸参考」） */
const AGNES_SIZE_TABLE: Record<string, Record<string, string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '3K': '3072x3072', '4K': '4096x4096' },
  '3:4': { '1K': '864x1152', '2K': '1728x2304', '3K': '2592x3456', '4K': '3456x4608' },
  '4:3': { '1K': '1152x864', '2K': '2304x1728', '3K': '3456x2592', '4K': '4608x3456' },
  '16:9': { '1K': '1312x736', '2K': '2624x1472', '3K': '3936x2208', '4K': '5248x2944' },
  '9:16': { '1K': '736x1312', '2K': '1472x2624', '3K': '2208x3936', '4K': '2944x5248' },
  '2:3': { '1K': '832x1248', '2K': '1664x2496', '3K': '2496x3744', '4K': '3328x4992' },
  '3:2': { '1K': '1248x832', '2K': '2496x1664', '3K': '3744x2496', '4K': '4992x3328' },
  '21:9': { '1K': '1568x672', '2K': '3136x1344', '3K': '4704x2016', '4K': '6272x2688' },
}

const agnes: ImageProviderDef = {
  id: 'agnes',
  name: 'Agnes',
  docUrl: 'https://agnes-ai.com/zh-Hans/docs/agnes-image-25-flash',
  // 默认走国内线路：与「AI 排版」用的 api.agnes-ai.cn 同一线路，国内网络下更稳
  baseUrl: 'https://api.agnes-ai.cn/v1',
  altBaseUrls: [{ label: '国际线路', url: 'https://apihub.agnes-ai.com/v1' }],
  models: ['agnes-image-2.5-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
  defaultModel: 'agnes-image-2.5-flash',
  sizes: ['1K', '2K', '3K', '4K'],
  defaultSize: '1K',
  ratios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'],
  defaultRatio: '1:1',
  sizeTable: AGNES_SIZE_TABLE,
  defaultTimeoutSec: 180,
  minTimeoutSec: 60,
  maxTimeoutSec: 360,
  modelIdPattern: /image/i,
  modelHint: '配图模型，如 agnes-image-2.5-flash（当前免费）',
  intro:
    '填入该厂商的 API Key 即可使用编辑器内的「AI 配图」。地址与模型名已填好默认值，没有特殊需要不用改。',
  buildBody({ model, prompt, size, ratio }) {
    return {
      model,
      prompt,
      // 档位式 size 必须搭配 ratio 才能得到可预期的像素尺寸
      size,
      ratio,
      /**
       * 文生图必须用 return_base64 拿内联数据，不能用 URL 返回。
       *
       * 原因：URL 指向 storage.googleapis.com/agnes-aigc/…，那个存储域**不返回 CORS 头**，
       * 浏览器里 fetch 它必然被拦（表现为「图片下载失败 / CORS error」；<img> 能显示但 JS 读不到字节）。
       * 走 base64 则数据随同一次响应回来，而该接口本身是放行 CORS 的，于是不再有第二个请求。
       * 文档：「文生图需要以 Base64 返回时使用 return_base64」→ 返回路径 data[0].b64_json。
       */
      return_base64: true,
    }
  },
  parseResponse(json) {
    const item = (json as { data?: unknown[] } | null)?.data?.[0] as
      | { url?: unknown; b64_json?: unknown; revised_prompt?: unknown }
      | undefined
    return {
      url: typeof item?.url === 'string' && item.url ? item.url : undefined,
      b64: typeof item?.b64_json === 'string' && item.b64_json ? item.b64_json : undefined,
      revisedPrompt:
        typeof item?.revised_prompt === 'string' && item.revised_prompt
          ? item.revised_prompt
          : undefined,
    }
  },
}

export const IMAGE_PROVIDERS: ImageProviderDef[] = [agnes]

export const DEFAULT_IMAGE_PROVIDER_ID = agnes.id

/** 按 id 取厂商描述；未知 id 回退到第一家，避免旧配置把界面打空 */
export function getImageProvider(id: string): ImageProviderDef {
  return IMAGE_PROVIDERS.find((p) => p.id === id) || IMAGE_PROVIDERS[0]
}

/** 当前选中的厂商 id */
export function getActiveProviderId(): string {
  const id = getSetting<string>('imageGenProvider') || ''
  return IMAGE_PROVIDERS.some((p) => p.id === id) ? id : DEFAULT_IMAGE_PROVIDER_ID
}

export function setActiveProviderId(id: string): void {
  setSetting('imageGenProvider', id)
}

type ProviderConfigTable = Record<string, Partial<ImageGenProviderConfig>>

function readTable(): ProviderConfigTable {
  const raw = getSetting<unknown>('imageGenProviders')
  return raw && typeof raw === 'object' ? (raw as ProviderConfigTable) : {}
}

/** 把存储值收敛成合法配置：缺失字段回退厂商默认值，越界值与白名单外的值一并纠正 */
function normalizeConfig(def: ImageProviderDef, stored: Partial<ImageGenProviderConfig>) {
  const size = def.sizes.includes(stored.size || '') ? stored.size! : def.defaultSize
  const ratio = def.ratios.includes(stored.ratio || '') ? stored.ratio! : def.defaultRatio
  const timeout = Number(stored.timeoutSec)
  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
    baseUrl: (typeof stored.baseUrl === 'string' && stored.baseUrl.trim()) || def.baseUrl,
    model: (typeof stored.model === 'string' && stored.model.trim()) || def.defaultModel,
    size,
    ratio,
    timeoutSec:
      Number.isFinite(timeout) && timeout > 0
        ? Math.min(def.maxTimeoutSec, Math.max(def.minTimeoutSec, Math.round(timeout)))
        : def.defaultTimeoutSec,
  }
}

/** 读取某厂商的配置（已合并默认值） */
export function getProviderConfig(id: string): ImageGenProviderConfig {
  const def = getImageProvider(id)
  return normalizeConfig(def, readTable()[def.id] || {})
}

/** 局部更新某厂商的配置（其余字段保持不动） */
export function setProviderConfig(id: string, patch: Partial<ImageGenProviderConfig>): void {
  const def = getImageProvider(id)
  const table = { ...readTable() }
  table[def.id] = { ...(table[def.id] || {}), ...patch }
  setSetting('imageGenProviders', table)
}

/** 配置是否可用（地址、Key、模型名三项齐全） */
export function isImageProviderConfigured(cfg: ImageGenProviderConfig): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.model)
}

/** 未配置时列出缺项，供界面拼中文提示 */
export function missingImageConfigFields(cfg: ImageGenProviderConfig): string[] {
  const missing: string[] = []
  if (!cfg.baseUrl) missing.push('接口地址')
  if (!cfg.apiKey) missing.push('API Key')
  if (!cfg.model) missing.push('模型名')
  return missing
}

/** 档位 + 比例对应的像素提示；表里查不到时返回空串 */
export function describeOutputSize(def: ImageProviderDef, size: string, ratio: string): string {
  return def.sizeTable[ratio]?.[size] || ''
}

/** 广告位：厂商是否支持传入参考图（图生图/多图合成，本期未开放） */
export function supportsReferenceImages(def: ImageProviderDef): boolean {
  return def.id === 'agnes'
}
