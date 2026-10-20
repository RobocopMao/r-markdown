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

/**
 * 比例下拉里的「自定义」哨兵值。
 *
 * 不用 'W:H' 之类的真比例表示自定义，是因为它必须能与 sizeTable 的键区分开：
 * 选到它时面板不显示分辨率档位，改由用户直接填宽高。
 */
export const CUSTOM_RATIO = 'custom'

/** 下拉选项（值 + 中文标签） */
export interface ImageOption {
  value: string
  label: string
}

/** 自定义像素尺寸的合法区间与对齐粒度 */
export interface ImageCustomSize {
  min: number
  max: number
  /** 宽高都按这个数对齐；与官方尺寸表里所有边长一致（16 的倍数） */
  step: number
}

/** 一次任务查询的结果，由各中转站的 parseTask 填 */
export interface ImageRelayTaskState {
  /** 原始状态字符串，如 pending / processing / completed */
  status: string
  /** 是否已出图（真值时 url 或 b64 至少有一个） */
  done: boolean
  /** 是否已失败/取消（真值时读 message） */
  failed: boolean
  /** 进度百分比，未知填 0 */
  progress: number
  url?: string
  b64?: string
  revisedPrompt?: string
  /** 失败原因，失败时展示给用户 */
  message?: string
}

/**
 * 中转站的「异步任务」描述。
 *
 * 有些中转站（如 APIMart）不直接回图片，而是回一个 task_id，要再查一次任务接口；
 * 而各家查询路径、状态字段、结果结构都不一样，所以把差异收进这份数据描述：
 * **新增一家中转站 = 在 IMAGE_RELAYS 里加一条**，设置页的下拉与调用层的轮询都自动生效，
 * 调用层不出现 if (中转站 === 'xxx')。
 */
export interface ImageRelayDef {
  id: string
  name: string
  docUrl: string
  /**
   * 该站的接口基址：选中后自动填进「接口地址」。
   * 不填则沿用厂商默认地址（如官方直连），用户仍可手改。
   */
  baseUrl?: string
  /** 查询任务的路径模板，相对接口基址；`{id}` 会被替换成任务 id */
  taskPath: string
  /** 轮询间隔（秒） */
  pollIntervalSec: number
  /** 状态中文名，用于面板上的进度文案；未知状态直接显示原文 */
  statusText?: Record<string, string>
  /** 从「提交生图」的响应里取任务 id；取不到返回空串（表示对方是同步返回） */
  parseTaskId(json: unknown): string
  /** 从「查询任务」的响应里取状态与结果 */
  parseTask(json: unknown): ImageRelayTaskState
}

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
  /**
   * 是否允许用户自填像素宽高（比例下拉里会多出一项「自定义」）。
   * 不声明则该厂商只有预设比例 + 分辨率档位，面板不出现自定义输入框。
   */
  customSize?: ImageCustomSize
  /** 可选的图片质量档位；不声明则面板不显示「质量」控件 */
  qualities?: ImageOption[]
  defaultQuality?: string
  /** 可选的背景档位；不声明则面板不显示「背景」控件 */
  backgrounds?: ImageOption[]
  defaultBackground?: string
  /**
   * 可选的内容审核强度。
   *
   * 有一种用法是**只给 defaultModeration、不给 moderations**：面板不渲染控件，
   * 请求里固定发这个值。审核强度这种东西多数人不会去调，暴露成开关只会多一个
   * 能选错的参数，所以 GPT-Image-2.5 就固定 `low`（官方默认是 auto，更严）。
   */
  moderations?: ImageOption[]
  defaultModeration?: string
  /**
   * 可选的中转站列表：选中某个中转站后，生图改成「提交 → 轮询任务 → 取图」，
   * 不选（默认）则维持一次性同步返回。不声明则该厂商没有这个下拉。
   */
  relays?: ImageRelayDef[]
  /** 单次请求超时默认值（秒）与允许区间 */
  defaultTimeoutSec: number
  minTimeoutSec: number
  maxTimeoutSec: number
  /** 从 /models 列表里筛选图像模型的规则；不匹配的模型名不会进入下拉 */
  modelIdPattern: RegExp
  /**
   * 「本厂商真正支持的型号」的形状。作用有三：
   * 1. 「获取模型列表」之后按它**直接过滤掉**不适配的模型（中转站的 /models 混着几十个
   *    别家的图像模型，全列出来只会让人选错）；
   * 2. 手填的模型名不在范围内时，设置页在下方追加一句提示；
   * 3. **都不阻止保存**——中转站可能给模型名加前缀 / 改分隔符，硬拦会把能用的配置也拦掉。
   *
   * 正则必须是**宽松的包含式匹配**（不加 ^$、允许 - _ . 空格互换），
   * 因为各家中转站对同一个模型的写法并不一致（`openai/gpt-image-2.5-flare`、
   * `gpt-image-2.5-flare-20251001`、`gpt_image_2_5_flare` 都算）。
   * 不声明则不做这项校验——Agnes 的模型名随版本迭代，没必要限制。
   */
  modelIdValid?: RegExp
  /** 手填的模型名不在合法范围时追加的提示文案 */
  modelIdWarn?: string
  /** 模型名下方的用法提示；不声明则不显示这一行（模型名已说明清楚的地方不必重复） */
  modelHint?: string
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
  /**
   * 已换算好的像素尺寸，形如 "1024x1024"（注意是 x，官方 size 字段就是这个写法）。
   *
   * 为什么要单独给：官方接口要的是像素，而面板上用户选的是「档位 × 比例」或「自定义宽高」。
   * 换算只做一次、只在 resolveOutputSize() 里做，厂商 def 的 buildBody 直接拿去用，
   * 不要再各自拼字符串——那样三家厂商迟早拼出三种写法。
   */
  pixels: string
  /** 图片质量档位（厂商不支持时为空串） */
  quality: string
  /** 背景档位（厂商不支持时为空串） */
  background: string
  /** 内容审核强度（厂商不支持时为空串） */
  moderation: string
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
  /** 当前使用的模型 */
  model: string
  /**
   * 该厂商勾选的常用模型清单（设置页可多选、可手填）。
   * 生图面板的模型下拉就取这份；model 始终是其中一项。
   */
  models: string[]
  size: string
  ratio: string
  timeoutSec: number
  /** 自定义模式的像素宽（比例非「自定义」或厂商不支持时无意义，收敛为 0） */
  width: number
  /** 自定义模式的像素高 */
  height: number
  /** 图片质量档位（不支持该能力的厂商为空串） */
  quality: string
  /** 背景档位（不支持该能力的厂商为空串） */
  background: string
  /** 内容审核强度（不支持该能力的厂商为空串） */
  moderation: string
  /**
   * 选中的中转站 id；空串表示不走任务轮询（按同步接口处理）。
   * 中转站列表来自厂商 def 的 relays，切换厂商时会被收敛成该厂商支持的值。
   */
  relay: string
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

/**
 * GPT-Image-2.5 的尺寸对照表（官方文档给出的「比例 × 分辨率档位 → 像素」表）。
 *
 * 表里每个边长都是 16 的倍数，所以自定义宽高也用 step=16 对齐，两种模式下接口收到的
 * 尺寸口径一致（官方对这个模型没有「只接受固定尺寸」的限制，自定义值直接发送）。
 */
const GPT_IMAGE_SIZE_TABLE: Record<string, Record<string, string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '3:2': { '1K': '1536x1024', '2K': '2048x1360', '4K': '3520x2336' },
  '2:3': { '1K': '1024x1536', '2K': '1360x2048', '4K': '2336x3520' },
  '4:3': { '1K': '1024x768', '2K': '2048x1536', '4K': '3312x2480' },
  '3:4': { '1K': '768x1024', '2K': '1536x2048', '4K': '2480x3312' },
  '5:4': { '1K': '1280x1024', '2K': '2560x2048', '4K': '3216x2576' },
  '4:5': { '1K': '1024x1280', '2K': '2048x2560', '4K': '2576x3216' },
  '16:9': { '1K': '1536x864', '2K': '2048x1152', '4K': '3840x2160' },
  '9:16': { '1K': '864x1536', '2K': '1152x2048', '4K': '2160x3840' },
  '2:1': { '1K': '2048x1024', '2K': '2688x1344', '4K': '3840x1920' },
  '1:2': { '1K': '1024x2048', '2K': '1344x2688', '4K': '1920x3840' },
  '21:9': { '1K': '2016x864', '2K': '2688x1152', '4K': '3840x1648' },
  '9:21': { '1K': '864x2016', '2K': '1152x2688', '4K': '1648x3840' },
  '3:1': { '1K': '1536x512', '2K': '3072x1024', '4K': '3840x1280' },
  '1:3': { '1K': '512x1536', '2K': '1024x3072', '4K': '1280x3840' },
}

/**
 * OpenAI 标准 images 响应解析：data[0] 里按 url / b64_json / revised_prompt 取值。
 *
 * Agnes 与 GPT-Image 响应结构一致（后者就是官方格式），所以共用一份，避免两份实现漂移。
 */
function parseOpenAiImageResponse(json: unknown): ImageResponse {
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
}

/**
 * APIMart：不直接回图，先回 task_id，再 GET /v1/tasks/{task_id} 拿结果。
 *
 * 响应结构（官方文档）：
 * - 提交 `{"code":200,"data":[{"status":"submitted","task_id":"task_01K..."}]}`
 * - 查询 `{"code":200,"data":{"id","status","progress","result":{"images":[{"url":["..."]}]}}}`
 * - 状态 pending / processing / completed / failed / cancelled
 * - 失败 `{"error":{"code","message","type"}}`
 */
const APIMART_RELAY: ImageRelayDef = {
  id: 'apimart',
  name: 'APIMart',
  docUrl: 'https://docs.apimart.ai/api-reference/tasks/get-task',
  // 选它就把接口地址自动换成这里，省得用户再手抄一遍
  baseUrl: 'https://api.apimart.ai/v1',
  taskPath: '/tasks/{id}',
  pollIntervalSec: 3,
  statusText: {
    submitted: '已提交',
    pending: '排队中',
    processing: '生成中',
    completed: '已完成',
    failed: '已失败',
    cancelled: '已取消',
  },
  parseTaskId(json: unknown) {
    const data = (json as { data?: unknown } | null)?.data
    const first = Array.isArray(data) ? data[0] : data
    const id = (first as { task_id?: unknown } | null)?.task_id
    return typeof id === 'string' ? id : ''
  },
  parseTask(json: unknown) {
    const data = (
      json as { data?: { status?: unknown; progress?: unknown; result?: unknown } } | null
    )?.data
    const status = typeof data?.status === 'string' ? data.status : ''
    const progress = Number(data?.progress)
    const state: ImageRelayTaskState = {
      status,
      // 终态由状态字段判断，不能只看「有没有 url」：否则对方回 completed 却没给图时会一直轮询到超时
      done: status === 'completed',
      failed: status === 'failed' || status === 'cancelled',
      progress: Number.isFinite(progress) ? progress : 0,
    }
    if (state.failed) {
      const err = (json as { error?: { message?: unknown } } | null)?.error
      const fallback = status === 'cancelled' ? '任务已取消' : '任务已失败，请稍后重试'
      state.message = typeof err?.message === 'string' && err.message ? err.message : fallback
      return state
    }
    // result.images[0].url 是**字符串数组**，取第一个；也兼容直接给字符串的站点
    const images = (data?.result as { images?: unknown } | null)?.images
    const first = Array.isArray(images) ? (images[0] as { url?: unknown } | null) : null
    const rawUrl = first?.url
    const url = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl
    if (typeof url === 'string' && url) {
      state.url = url
      state.done = true
    }
    return state
  },
}

/** 全部中转站描述，供设置页渲染下拉；新增一家在这里加一条即可 */
export const IMAGE_RELAYS: ImageRelayDef[] = [APIMART_RELAY]

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
  parseResponse: parseOpenAiImageResponse,
}

const gptImage: ImageProviderDef = {
  id: 'gpt-image',
  name: 'GPT-Image-2.5',
  docUrl: 'https://platform.openai.com/docs/api-reference/images/create',
  baseUrl: 'https://api.openai.com/v1',
  // 官方只有这一个域名；用中转站时把地址整个换掉即可，字段口径不变
  altBaseUrls: [],
  models: ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
  defaultModel: 'gpt-image-2.5-flare',
  sizes: ['1K', '2K', '4K'],
  defaultSize: '1K',
  ratios: [
    '1:1',
    '3:2',
    '2:3',
    '4:3',
    '3:4',
    '5:4',
    '4:5',
    '16:9',
    '9:16',
    '2:1',
    '1:2',
    '21:9',
    '9:21',
    '3:1',
    '1:3',
  ],
  defaultRatio: '1:1',
  sizeTable: GPT_IMAGE_SIZE_TABLE,
  // 质量拉到 xhigh / max 时出图明显更慢，超时上限给到 600 秒
  defaultTimeoutSec: 300,
  minTimeoutSec: 60,
  maxTimeoutSec: 600,
  // 中转站常把模型名改成 gpt-image-2.5-… 之类，只按关键词筛，别要求完全一致
  modelIdPattern: /image/i,
  // 但「筛得到」不等于「能用」：中转站的图像模型还有 nano-banana / seedream / flux 等，
  // 它们不吃 size / quality / background / moderation 这套官方字段，选了只会报错。
  // 连 gpt-image-2.5-ext 也算不匹配——那是中转站自造的聚合路由，只收「比例 + resolution」，
  // 不收 quality / 透明背景 / 自定义像素，跟本面板的参数对不上。
  // 分隔符三种都可能：连字符（官方）、下划线、点，还常有 `openai/` 前缀或 `-20251001` 后缀，
  // 所以用包含式匹配而不加 ^$。ext 是聚合路由，匹配不上属于预期。
  // 末尾的 (?![a-z]) 是必要的一道：没有它 gpt-image-2.5-flareless 也会命中。
  modelIdValid: /gpt[-_ ]?image[-_ ]?2[._-]5[-_ ]?(flare|sunburst)(?![a-z])/i,
  modelIdWarn:
    '只认 gpt-image-2.5-flare 与 gpt-image-2.5-sunburst。其他模型（含 gpt-image-2.5-ext 这类聚合路由）不吃本面板的比例 · 质量 · 背景参数，生图会失败。',
  intro:
    '官方接口与中转站都按 OpenAI 标准字段发送（size / quality / background / moderation）：地址填 https://api.openai.com/v1，或中转站的 …/v1 即可；尺寸、质量等参数在生成面板里按次选择。',
  customSize: { min: 256, max: 4096, step: 16 },
  qualities: [
    // label 只给人看；真正发出去的仍是 value，所以中文名不必带英文原词
    { value: 'auto', label: '自动' },
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' },
    { value: 'xhigh', label: '超高' },
    { value: 'max', label: '最高' },
  ],
  defaultQuality: 'low',
  backgrounds: [
    { value: 'auto', label: '自动' },
    { value: 'opaque', label: '不透明' },
    // 透明只有 PNG/WebP 存得住，这层约束由调用层保证（默认就是 png），下拉里不必挂格式名
    { value: 'transparent', label: '透明' },
  ],
  defaultBackground: 'auto',
  /**
   * 审核强度固定 `low`，不给选项表 —— 面板因此不渲染「审核」控件。
   *
   * 官方默认是 `auto`（更严），而这类参数用户基本不会调，露出来只会多一个能选错
   * 的开关。取值仍在官方枚举内，中转站也照发。
   */
  defaultModeration: 'low',
  /**
   * 有的中转站（APIMart）不直接回图，要拿 task_id 再查一次任务接口。
   * 选上对应中转站后生图走「提交 → 轮询 → 取图」；不选则按上面的标准同步接口处理。
   */
  relays: IMAGE_RELAYS,
  buildBody({ model, prompt, pixels, quality, background, moderation }) {
    /**
     * 只发官方字段，一个都不多。
     *
     * - size 用换算好的像素（"1024x1024"），官方就是这个写法；
     * - 不发 n：官方默认 1；
     * - 不发 output_format：官方默认 png，正好是背景透明需要的那一种；
     * - 不收 ratio：官方没有这个概念，比例已经体现在 size 里。
     */
    return {
      model,
      prompt,
      size: pixels,
      quality,
      background,
      moderation,
    }
  },
  parseResponse: parseOpenAiImageResponse,
}

/** 按 id 取中转站描述；空串或不认识返回 undefined（表示走同步接口） */
export function getImageRelay(id: string | undefined): ImageRelayDef | undefined {
  if (!id) return undefined
  return IMAGE_RELAYS.find((r) => r.id === id)
}

export const IMAGE_PROVIDERS: ImageProviderDef[] = [agnes, gptImage]

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

/**
 * 把自定义像素收敛成合法值：先夹到 [min, max]，再按 step 对齐。
 *
 * 对齐是必须的：官方尺寸表里所有边长都是 step 的倍数，不对齐会让「自定义」和「预设」
 * 两种模式发出两种口径的像素，某些中转站对非对齐值会直接 422。
 */
function clampDimension(value: unknown, custom: ImageCustomSize, fallback: number): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  const stepped = Math.round(num / custom.step) * custom.step
  return Math.min(custom.max, Math.max(custom.min, stepped))
}

/** 该厂商是否支持自定义像素宽高（不支持时面板不出现「自定义」比例与宽高输入框） */
export function supportsCustomSize(def: ImageProviderDef): boolean {
  return Boolean(def.customSize)
}

/** 该厂商是否有可选的中转站（没有则设置页不显示「中转站」下拉） */
export function supportsRelay(def: ImageProviderDef): boolean {
  return Boolean(def.relays?.length)
}

/**
 * 一个模型名是否落在本厂商支持的范围内。
 *
 * 「获取模型列表」的过滤与手填后的提醒都用这一个判断，避免两处各写一份正则
 * （一处改了另一处没改，就会「列表里能选、选了又报不支持」）。
 * 厂商没声明 modelIdValid 时一律视为支持。
 */
export function isSupportedImageModel(def: ImageProviderDef, model: string): boolean {
  const valid = def.modelIdValid
  return !valid || valid.test(model)
}

/**
 * 从白名单里取值，不在表内（或空）则回退默认值。
 *
 * 厂商没声明选项表时没有「用户能选的值」，此时直接回退 default ——
 * 这样「只给默认值、不给选项」的固定参数（如审核强度）也能生效。
 * 选项与默认值都没给就返回空串，表示该厂商不支持这个字段、请求里不要发。
 */
function pickOption(
  options: ImageOption[] | undefined,
  stored: unknown,
  fallback: string | undefined,
): string {
  if (!options?.length) return fallback ?? ''
  const value = typeof stored === 'string' ? stored : ''
  return options.some((o) => o.value === value) ? value : (fallback ?? options[0].value)
}

/** 把存储值收敛成合法配置：缺失字段回退厂商默认值，越界值与白名单外的值一并纠正 */
function normalizeConfig(def: ImageProviderDef, stored: Partial<ImageGenProviderConfig>) {
  const size = def.sizes.includes(stored.size || '') ? stored.size! : def.defaultSize
  const allowedRatios = supportsCustomSize(def) ? [...def.ratios, CUSTOM_RATIO] : def.ratios
  const ratio = allowedRatios.includes(stored.ratio || '') ? stored.ratio! : def.defaultRatio
  const timeout = Number(stored.timeoutSec)

  // 自定义像素的兜底：默认比例的默认档位那一格，这样切到「自定义」时框里不会是空的
  const fallbackPixels = def.sizeTable[def.defaultRatio]?.[def.defaultSize] || ''
  const [fallbackW, fallbackH] = fallbackPixels.split('x').map((n) => Number(n) || 0)
  const custom = def.customSize
  const width =
    custom && ratio === CUSTOM_RATIO ? clampDimension(stored.width, custom, fallbackW) : 0
  const height =
    custom && ratio === CUSTOM_RATIO ? clampDimension(stored.height, custom, fallbackH) : 0

  /**
   * 常用模型清单与当前模型的收敛。
   *
   * 没有单独的「默认模型」设置：**清单首项即默认**（用户明确要求去掉那层，
   * 见 DEVELOPMENT.md 第 30 条）。所以顺序是——先把清单洗净，再决定当前值：
   * - 清单缺失（旧配置）或为空 → 退化成只含当前 model 的一项，面板下拉才不会空着；
   * - 清单有值 → 去空、去重；
   * - 当前 model 不在清单里（从没选过、或被从清单里删了）就落到清单首项，
   *   而不是补进清单尾——否则「默认」就成了最后勾的那个，行为看着随机。
   */
  const listed = Array.isArray(stored.models)
    ? stored.models.filter((m): m is string => typeof m === 'string')
    : []
  const seen = new Set<string>()
  const models: string[] = []
  for (const m of listed) {
    const name = m.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    models.push(name)
  }
  const storedModel = typeof stored.model === 'string' ? stored.model.trim() : ''
  if (models.length === 0 && storedModel) models.push(storedModel)
  if (models.length === 0) models.push(def.defaultModel)
  const model = models.includes(storedModel) ? storedModel : models[0]

  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
    baseUrl: (typeof stored.baseUrl === 'string' && stored.baseUrl.trim()) || def.baseUrl,
    model,
    models,
    size,
    ratio,
    timeoutSec:
      Number.isFinite(timeout) && timeout > 0
        ? Math.min(def.maxTimeoutSec, Math.max(def.minTimeoutSec, Math.round(timeout)))
        : def.defaultTimeoutSec,
    width,
    height,
    quality: pickOption(def.qualities, stored.quality, def.defaultQuality),
    background: pickOption(def.backgrounds, stored.background, def.defaultBackground),
    moderation: pickOption(def.moderations, stored.moderation, def.defaultModeration),
    // 中转站只认该厂商声明过的；不认识就回退空串（走同步接口），不会留下无效 id
    relay: (def.relays || []).some((r) => r.id === stored.relay) ? stored.relay! : '',
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

/** 最大公约数，用于把自定义宽高化简成比例标签 */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

export interface ResolvedOutputSize {
  /** 真正发给接口的像素尺寸，形如 "1024x1024"；查不到对应格子时为空串 */
  pixels: string
  /** 给人看的完整描述，如 "2K · 2048x1152" 或 "1080×1440 · 3:4" */
  label: string
}

/**
 * 把面板上的选择换算成接口要的像素尺寸 —— 全项目只在这里做换算。
 *
 * 两种模式：
 * - 预设：比例 + 分辨率档位 → 查厂商尺寸表；
 * - 自定义：比例选 CUSTOM_RATIO，直接用用户填的宽高，分辨率档位不参与。
 *
 * 调用方（面板 / 提示词扩写 / buildImage）都必须用这里的 pixels，不要自己拼 WxH。
 */
export function resolveOutputSize(
  def: ImageProviderDef,
  cfg: Pick<ImageGenProviderConfig, 'size' | 'ratio' | 'width' | 'height'>,
): ResolvedOutputSize {
  if (cfg.ratio === CUSTOM_RATIO && def.customSize) {
    const custom = def.customSize
    const fallback = def.sizeTable[def.defaultRatio]?.[def.defaultSize] || ''
    const [fbW, fbH] = fallback.split('x').map((n) => Number(n) || 0)
    const width = clampDimension(cfg.width, custom, fbW)
    const height = clampDimension(cfg.height, custom, fbH)
    const divisor = gcd(width, height)
    /**
     * 只在化简结果正好是厂商预设比例时才显示它：1080×1440 → "3:4"，而 1920×1088（1080 被
     * 对齐成 1088 后）会化简出 "30:17" 这种噪音，不如只给像素。
     */
    const simplified = divisor > 0 ? `${width / divisor}:${height / divisor}` : ''
    const ratioText = def.ratios.includes(simplified) ? simplified : ''
    return {
      pixels: `${width}x${height}`,
      label: ratioText ? `${width}×${height} · ${ratioText}` : `${width}×${height}`,
    }
  }

  const pixels = def.sizeTable[cfg.ratio]?.[cfg.size] || ''
  return { pixels, label: pixels ? `${cfg.size} · ${pixels}` : '' }
}

/** 广告位：厂商是否支持传入参考图（图生图/多图合成，本期未开放） */
export function supportsReferenceImages(def: ImageProviderDef): boolean {
  return def.id === 'agnes'
}
