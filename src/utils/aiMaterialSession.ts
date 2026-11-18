/**
 * AI 素材的会话模型与裁剪（纯逻辑，无网络、无 Vue、无 IndexedDB）。
 *
 * 为什么素材也要会话：一句话很难一次说清。用户看到第一版后常会说「第二个卡片改成蓝色」
 * 「标题再短一点」「不要用 steps 了，改成两栏」——这些都得带着上一版继续聊。
 * 所以面板从「表单 → 单次结果」改成了和 AI 写作一样的对话流，每次出稿都是一个消息节点，
 * 插入按钮就挂在对应那份素材下面。
 *
 * 设计要点（与 aiWriteSession 同构，便于两处维护口径一致）：
 * - **单会话**：全局只有一个「当前会话」，新建即丢弃旧的。
 * - **滑动有效期**：从**最后一次请求**算起，口径见 utils/aiSession。
 * - 素材源码不另设数据结构：它就是一条 assistant 消息（kind='draft' + material），
 *   因此历次版本天然留在对话里，可以回看、可以插入旧版。
 * - 持久化由 services/aiSessionStore.ts 的 records store 负责（key = 'material'），
 *   这里只做结构与裁剪。
 */

import { estimateTokens } from '@/utils/aiFormatPrompt'
import type { ChatMessage } from '@/services/aiFormat'
import { expiresAtFrom, isExpiredAt } from '@/utils/aiSession'

/** 会话结构版本；将来字段变更时用它做迁移判定 */
export const MATERIAL_SESSION_VERSION = 1

/** assistant 轮次分类：draft=出稿（可直接插入），question=追问或说明（没有可插入内容） */
export type MaterialTurnKind = 'draft' | 'question'

export interface MaterialMessage {
  id: string
  role: 'user' | 'assistant'
  /** assistant：清洗后的完整输出；user：原文 */
  content: string
  /** 仅 assistant 有：这一轮是出稿还是追问 */
  kind?: MaterialTurnKind
  /** kind==='draft' 时的素材源码（已过清洗 + 确定性修复）；其余为空 */
  material?: string
  /** 仅 draft：这一版的质检提醒（属性不存在、形状不对、自动修复记录等） */
  warnings?: string[]
  at: number
}

export interface MaterialSession {
  version: number
  id: string
  createdAt: number
  expiresAt: number
  messages: MaterialMessage[]
}

/** 本地唯一 id（风格与 aiWriteSession.newId 一致） */
export function newMaterialId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createMaterialSession(now: number, hours: number): MaterialSession {
  return {
    version: MATERIAL_SESSION_VERSION,
    id: newMaterialId(),
    createdAt: now,
    expiresAt: expiresAtFrom(now, hours),
    messages: [],
  }
}

/** 续期：把 expiresAt 推到「最后一次请求时刻 + 时长」 */
export function renewMaterialSession(
  session: MaterialSession,
  now: number,
  hours: number,
): MaterialSession {
  return { ...session, expiresAt: expiresAtFrom(now, hours) }
}

export function isMaterialExpired(session: MaterialSession, now: number): boolean {
  return isExpiredAt(session.expiresAt, now)
}

/**
 * 归一化从 IndexedDB 读到的会话。
 *
 * 返回 null 表示「不可用，请新建」——结构非法、版本不认识、或已过期都归到这一类。
 * 逐字段收敛（而不是直接信任 JSON）是为了防手改数据或旧版本残留把面板渲染搞崩。
 */
export function normalizeMaterialSession(
  raw: unknown,
  now: number,
  hours: number,
): MaterialSession | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== MATERIAL_SESSION_VERSION) return null

  const createdAt = Number(o.createdAt)
  const expiresAt = Number(o.expiresAt)
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null

  const session: MaterialSession = {
    version: MATERIAL_SESSION_VERSION,
    id: typeof o.id === 'string' && o.id ? o.id : newMaterialId(),
    createdAt,
    expiresAt,
    messages: normalizeMessages(o.messages),
  }

  if (isMaterialExpired(session, now)) return null

  // 有效期异常（比如手改成十年后）按设置项重新夹一遍；基准是最后一次活动而不是 createdAt
  const lastActiveAt = session.messages.reduce((max, m) => Math.max(max, m.at), createdAt)
  const maxExpiresAt = expiresAtFrom(lastActiveAt, hours)
  if (session.expiresAt > maxExpiresAt) session.expiresAt = maxExpiresAt
  return session
}

function normalizeMessages(raw: unknown): MaterialMessage[] {
  if (!Array.isArray(raw)) return []
  const out: MaterialMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const role = o.role === 'user' || o.role === 'assistant' ? o.role : null
    const content = typeof o.content === 'string' ? o.content : ''
    if (!role) continue
    // assistant 的出稿消息允许 content 为空但 material 有值（避免极端数据把整条丢掉）
    const material = typeof o.material === 'string' ? o.material : undefined
    if (!content && !material) continue
    const kind =
      o.kind === 'draft' || o.kind === 'question' ? (o.kind as MaterialTurnKind) : undefined
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : newMaterialId(),
      role,
      content,
      kind: kind ?? (material ? 'draft' : undefined),
      material,
      warnings: Array.isArray(o.warnings)
        ? o.warnings.filter((w): w is string => typeof w === 'string')
        : undefined,
      at: Number.isFinite(Number(o.at)) ? Number(o.at) : Date.now(),
    })
  }
  return out
}

/** 追加一条消息，返回新对象（便于 Vue 响应式更新，不做原地 push） */
export function appendMaterialMessage(
  session: MaterialSession,
  msg: MaterialMessage,
): MaterialSession {
  return { ...session, messages: [...session.messages, msg] }
}

/** 替换某条消息（就地改代码、补写提醒时用），返回新对象 */
export function replaceMaterialMessage(
  session: MaterialSession,
  id: string,
  patch: Partial<MaterialMessage>,
): MaterialSession {
  return {
    ...session,
    messages: session.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }
}

/** 截断到某条消息之前（「重新生成」用：丢掉这条及其之后，让历史以用户消息结尾） */
export function truncateBefore(session: MaterialSession, id: string): MaterialSession {
  const idx = session.messages.findIndex((m) => m.id === id)
  if (idx < 0) return session
  return { ...session, messages: session.messages.slice(0, idx) }
}

/** 最近一条出稿消息（可能为 null） */
export function latestMaterialDraft(session: MaterialSession): MaterialMessage | null {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i]
    if (m.role === 'assistant' && m.kind === 'draft' && m.material) return m
  }
  return null
}

export interface MaterialHistoryOptions {
  /** 最多保留多少条消息（默认 12） */
  maxTurns?: number
  /** token 预算上限，默认 16000；超预算时从最前逐条丢弃 */
  maxTokens?: number
}

/**
 * 构造发给模型的对话历史。
 *
 * 两条硬约束（与 AI 写作同口径）：
 * 1. **assistant 用 material（素材源码）而不是 content**：出稿轮的 content 里可能带着
 *    清洗前的说明文字，回灌会强化「输出说明」这件事；素材源码才是真正要延续的上下文。
 * 2. **始终保留最后一条**：哪怕它单独就超预算，也不能裁掉。
 */
export function toMaterialHistory(
  session: MaterialSession,
  opts: MaterialHistoryOptions = {},
): ChatMessage[] {
  const maxTurns = Math.max(2, opts.maxTurns ?? 12)
  const maxTokens = Math.max(1000, opts.maxTokens ?? 16000)

  const history: ChatMessage[] = session.messages.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? (m.material ?? m.content) : m.content,
  }))

  const kept = history.slice(Math.max(0, history.length - maxTurns))
  let tokens = kept.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  while (tokens > maxTokens && kept.length > 1) {
    const dropped = kept.shift()!
    tokens -= estimateTokens(dropped.content)
  }
  return kept
}
