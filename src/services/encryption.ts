/**
 * 敏感字段本地加密服务
 *
 * 使用 Web Crypto API (AES-GCM-256) 对 localStorage 中的敏感值加密。
 * 密钥以 JWK 格式存于 localStorage，每次加密生成随机 12 字节 IV 拼接到密文前。
 *
 * 安全边界：防御"打开 DevTools 看一眼"级别的明文泄露。
 * 不防御内存 dump / 磁盘取证 / XSS 注入后可任意读取缓存等高级攻击。
 */

const KEY_STORAGE_KEY = 'r-markdown-crypto-key'

let cryptoKey: CryptoKey | null = null

async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** 加载或生成 AES-GCM 密钥，仅在应用启动时调用一次 */
export async function initCrypto(): Promise<void> {
  const raw = localStorage.getItem(KEY_STORAGE_KEY)
  if (raw) {
    try {
      cryptoKey = await importKey(JSON.parse(raw))
      return
    } catch {
      // JWK 损坏，重新生成
    }
  }

  cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const jwk = await crypto.subtle.exportKey('jwk', cryptoKey)
  localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(jwk))
}

/** 加密文本，返回 base64(IV || ciphertext) */
export async function encrypt(plaintext: string): Promise<string> {
  if (!cryptoKey) throw new Error('Crypto not initialized')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/** 解密 base64(IV || ciphertext)，返回原文 */
export async function decrypt(cipherBase64: string): Promise<string> {
  if (!cryptoKey) throw new Error('Crypto not initialized')
  const combined = Uint8Array.from(atob(cipherBase64), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
  return new TextDecoder().decode(plaintext)
}

/** 判断 localStorage 中的值是否为明文 JSON（用于迁移检测） */
export function isPlaintextJSON(stored: string): boolean {
  try {
    JSON.parse(stored)
    return true
  } catch {
    return false
  }
}
