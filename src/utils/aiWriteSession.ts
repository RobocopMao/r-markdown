/**
 * AI 写作的会话模型与裁剪（纯逻辑，无网络、无 Vue、无 IndexedDB）。
 *
 * 设计要点：
 * - **单会话**：全局只有一个「当前会话」，没有历史列表；新建即丢弃旧的。
 * - **24 小时滑动有效期**：从**最后一次请求**算起（不是创建时刻），
 *   用户一直在用就一直留得住；停手超过时长后下一次请求从空白开始。
 *   保留时长的通用逻辑在 utils/aiSession.ts，三个 AI 面板共用。
 * - 稿件不另设数据表：它本身就是一条 assistant 消息（kind='draft' + article），
 *   因此对话里天然保留历次稿件，可回看、可应用旧稿。
 * - 持久化由 services/aiWriteSessionStore.ts 负责，这里只做结构与裁剪。
 */

import { estimateTokens } from '@/utils/aiFormatPrompt'
import type { ChatMessage } from '@/services/aiFormat'
import {
  DEFAULT_SESSION_HOURS,
  MAX_SESSION_HOURS,
  MIN_SESSION_HOURS,
  expiresAtFrom,
  formatRemaining,
  isExpiredAt,
  normalizeHours,
  remainingMs,
} from '@/utils/aiSession'

// 保留时长的工具从 aiSession 转发：写作面板原来就从这个模块导入它们，保持不变动
export {
  DEFAULT_SESSION_HOURS,
  MAX_SESSION_HOURS,
  MIN_SESSION_HOURS,
  formatRemaining,
  normalizeHours,
}

/** 会话结构版本；将来字段变更时用它做迁移判定 */
export const SESSION_VERSION = 1

/** assistant 轮次分类：draft=出稿，question=素材不足时的追问 */
export type WriteTurnKind = 'draft' | 'question'

export interface WriteMessage {
  id: string
  role: 'user' | 'assistant'
  /** assistant：清洗后的完整输出（含标记）；user：原文 */
  content: string
  /** 仅 assistant 有：这一轮是出稿还是追问 */
  kind?: WriteTurnKind
  /** kind==='draft' 时的稿件正文（已剥离标记）；其余为空 */
  article?: string
  /** 四层自检报告，挂在产生它的那条稿件消息上 */
  report?: string
  reportStatus?: 'running' | 'done' | 'failed'
  at: number
}

export interface WriteSession {
  version: number
  id: string
  createdAt: number
  expiresAt: number
  messages: WriteMessage[]
}

/** 生成一个本地唯一 id（时间戳 + 随机后缀，风格与 aiFormatPrompt.newPresetId 一致） */
export function newId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 新建一个空会话。
 *
 * expiresAt 从 createdAt（也就是第一次活动）算起；之后每次发起请求都会用
 * renewSession() 把它推到「最后一次活动 + 时长」。
 */
export function createSession(now: number, hours: number): WriteSession {
  return {
    version: SESSION_VERSION,
    id: newId(),
    createdAt: now,
    expiresAt: expiresAtFrom(now, hours),
    messages: [],
  }
}

/**
 * 续期：把 expiresAt 推到「最后一次请求时刻 + 时长」，返回新对象。
 *
 * 口径是滑动续期（用户一直在用就一直留得住），所以每次真正发起请求时都要调一次，
 * 而不是只按 createdAt 算死。
 */
export function renewSession(session: WriteSession, now: number, hours: number): WriteSession {
  return { ...session, expiresAt: expiresAtFrom(now, hours) }
}

export function isExpired(session: WriteSession, now: number): boolean {
  return isExpiredAt(session.expiresAt, now)
}

/** 剩余有效时间（毫秒），已过期返回 0 */
export function sessionRemainingMs(session: WriteSession, now: number): number {
  return remainingMs(session.expiresAt, now)
}

/**
 * 归一化从 IndexedDB 读到的会话。
 *
 * 返回 null 表示「不可用，请新建」——结构非法、版本不认识、或已过期都归到这一类。
 * 逐字段收敛（而不是直接信任 JSON）是为了防手改数据或旧版本残留把面板渲染搞崩，
 * 思路与 aiFormatPrompt.normalizePresets 一致。
 */
export function normalizeSession(raw: unknown, now: number, hours: number): WriteSession | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== SESSION_VERSION) return null

  const createdAt = Number(o.createdAt)
  const expiresAt = Number(o.expiresAt)
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null

  const session: WriteSession = {
    version: SESSION_VERSION,
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    createdAt,
    expiresAt,
    messages: normalizeMessages(o.messages),
  }

  if (isExpired(session, now)) return null

  /*
    有效期异常（比如手改成十年后）按设置项重新夹一遍，避免倒计时显示离谱数字。

    注意基准是**最后一次活动**而不是 createdAt：现在是滑动续期，
    expiresAt 正常就会比 createdAt + 时长更晚（用户一直在用），
    拿 createdAt 当基准会把正常会话误判成异常、把倒计时砍短。
  */
  const lastActiveAt = session.messages.reduce((max, m) => Math.max(max, m.at), createdAt)
  const maxExpiresAt = expiresAtFrom(lastActiveAt, hours)
  if (session.expiresAt > maxExpiresAt) session.expiresAt = maxExpiresAt
  return session
}

function normalizeMessages(raw: unknown): WriteMessage[] {
  if (!Array.isArray(raw)) return []
  const out: WriteMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const role = o.role === 'user' || o.role === 'assistant' ? o.role : null
    const content = typeof o.content === 'string' ? o.content : ''
    if (!role || !content) continue
    const kind = o.kind === 'draft' || o.kind === 'question' ? (o.kind as WriteTurnKind) : undefined
    const status =
      o.reportStatus === 'running' || o.reportStatus === 'done' || o.reportStatus === 'failed'
        ? (o.reportStatus as WriteMessage['reportStatus'])
        : undefined
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : newId(),
      role,
      content,
      kind,
      article: typeof o.article === 'string' ? o.article : undefined,
      report: typeof o.report === 'string' ? o.report : undefined,
      // 刷新/重启后不可能还有在跑的自检，统一收敛为失败，让用户看到「可重试」
      reportStatus: status === 'running' ? 'failed' : status,
      at: Number.isFinite(Number(o.at)) ? Number(o.at) : Date.now(),
    })
  }
  return out
}

/** 追加一条消息，返回新对象（便于 Vue 响应式更新，不做原地 push） */
export function appendMessage(session: WriteSession, msg: WriteMessage): WriteSession {
  return { ...session, messages: [...session.messages, msg] }
}

/** 替换某条消息（自检报告回填、稿件正文补写时用），返回新对象 */
export function replaceMessage(
  session: WriteSession,
  id: string,
  patch: Partial<WriteMessage>,
): WriteSession {
  return {
    ...session,
    messages: session.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }
}

/** 最近一条稿件消息（可能为 null）；「应用到编辑器」「按自检意见改稿」都以它为准 */
export function latestDraft(session: WriteSession): WriteMessage | null {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i]
    if (m.role === 'assistant' && m.kind === 'draft' && m.article) return m
  }
  return null
}

/** 按 id 取稿件消息 */
export function findMessage(session: WriteSession, id: string): WriteMessage | null {
  return session.messages.find((m) => m.id === id) ?? null
}

/** 首条用户消息的文本，用于空态与「用当前文档」判断之外的展示 */
export function firstUserText(session: WriteSession): string {
  const m = session.messages.find((x) => x.role === 'user')
  return m?.content ?? ''
}

export interface HistoryOptions {
  /** 最多保留多少轮（一对 user/assistant 算两轮），默认 12 */
  maxTurns?: number
  /** token 预算上限，默认 24000；超预算时从最前逐条丢弃 */
  maxTokens?: number
}

/**
 * 构造发给模型的对话历史。
 *
 * 两条硬约束：
 * 1. **assistant 用 article（稿件正文）而不是 content**：content 里带着 <<<ARTICLE>>> 标记，
 *    回灌给模型会强化「输出标记」这件事的噪声；稿件正文才是真正的上下文。
 * 2. **始终保留最后一条**：哪怕它单独就超预算（用户刚发的一条长素材），也不能裁掉。
 *
 * 注意：旧稿被裁掉不影响「按自检意见改稿」——那条请求会把稿件正文显式写进 user message，
 * 不依赖历史里是否还留着它。
 */
export function toHistory(session: WriteSession, opts: HistoryOptions = {}): ChatMessage[] {
  const maxTurns = Math.max(2, opts.maxTurns ?? 12)
  const maxTokens = Math.max(1000, opts.maxTokens ?? 24000)

  const history: ChatMessage[] = session.messages.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? (m.article ?? m.content) : m.content,
  }))

  // 先按轮数上限裁剪（保留最近 maxTurns 条）
  const kept = history.slice(Math.max(0, history.length - maxTurns))

  // 再按 token 预算裁剪：从最前逐条丢弃，但至少保留最后一条
  let tokens = kept.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  while (tokens > maxTokens && kept.length > 1) {
    const dropped = kept.shift()!
    tokens -= estimateTokens(dropped.content)
  }
  return kept
}
