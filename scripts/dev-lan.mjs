// 局域网开发服务器：给手机/平板访问本机 vite dev 用。
//
// 为什么必须是 https 而不是 http：
//   http://192.168.x.x 不属于「安全上下文」，浏览器会把 crypto.subtle 置为 undefined。
//   本项目 src/services/encryption.ts 的 initCrypto() 用它生成 AES 密钥，
//   src/main.ts 的 boot() 里 await initEncryption() 一旦抛错，Vue 就完全不会挂载 —— 页面白屏。
//   https 是安全上下文，即使证书是自签的、浏览器警告过、用户点了「继续访问」，
//   isSecureContext 依然是 true，crypto.subtle 和 navigator.clipboard 都正常。
//
// 用法：pnpm dev:lan   （或 npm run dev:lan）
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const certDir = join(root, '.dev-cert')
const certPath = join(certDir, 'cert.pem')
const keyPath = join(certDir, 'key.pem')
const metaPath = join(certDir, 'meta.json')
const port = Number(process.env.RMD_LAN_PORT || 5177)

/** 取本机局域网 IPv4，优先 en0（Wi-Fi 常见），排除回环与虚拟网卡 */
function detectLanIps() {
  const preferred = []
  const others = []
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      // utun/bridge/awdl 这些是 VPN、虚拟机、点对点，手机连不上
      if (/^(utun|bridge|awdl|llw|anpi|gif|stf)/.test(name)) continue
      ;(name === 'en0' ? preferred : others).push(addr.address)
    }
  }
  return [...preferred, ...others]
}

/** 用 openssl 生成自签证书，SAN 里带上局域网 IP 和 localhost */
function generateCert(ip) {
  mkdirSync(certDir, { recursive: true })
  const cnfDir = mkdtempSync(join(tmpdir(), 'rmd-cnf-'))
  const cnfPath = join(cnfDir, 'openssl.cnf')
  // 用配置文件而不是 -addext，因为 macOS 自带的 LibreSSL 不认 -addext
  writeFileSync(
    cnfPath,
    [
      '[req]',
      'distinguished_name = dn',
      'x509_extensions = v3_req',
      'prompt = no',
      '[dn]',
      'CN = R-Markdown LAN Dev',
      '[v3_req]',
      'basicConstraints = CA:TRUE',
      'keyUsage = digitalSignature, keyEncipherment, keyCertSign',
      'extendedKeyUsage = serverAuth',
      `subjectAltName = @alt`,
      '[alt]',
      'DNS.1 = localhost',
      'IP.1 = 127.0.0.1',
      `IP.2 = ${ip}`,
      '',
    ].join('\n'),
  )
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '365',
        '-config',
        cnfPath,
        '-extensions',
        'v3_req',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
  } finally {
    rmSync(cnfDir, { recursive: true, force: true })
  }
  writeFileSync(metaPath, JSON.stringify({ ip, createdAt: new Date().toISOString() }, null, 2))
}

const ips = detectLanIps()
const ip = ips[0]

if (!ip) {
  console.error('[dev-lan] 没找到局域网 IPv4 地址，确认已连上 Wi-Fi 或有线网络。')
  process.exit(1)
}
if (ips.length > 1) {
  console.log(`[dev-lan] 本机有多个局域网 IP，使用 ${ip}（其他：${ips.slice(1).join(', ')}）`)
}

// 换了网络（IP 变了）旧证书的 SAN 就对不上，手机仍会拦，所以要重新生成
let needCert = !existsSync(certPath) || !existsSync(keyPath)
if (!needCert && existsSync(metaPath)) {
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    if (meta.ip !== ip) {
      console.log(`[dev-lan] 局域网 IP 从 ${meta.ip} 变成 ${ip}，重新签发证书`)
      needCert = true
    }
  } catch {
    needCert = true
  }
}

if (needCert) {
  console.log(`[dev-lan] 生成自签证书（局域网 IP ${ip}），有效期 365 天…`)
  generateCert(ip)
}

const url = `https://${ip}:${port}/`

console.log('')
console.log('  ──────────────────────────────────────────────')
console.log(`  手机访问：${url}`)
console.log('  手机首次打开会提示证书不受信任 → 点「高级 / 继续前往」')
console.log('  ⚠ 必须用 https，换成 http 会白屏（crypto.subtle 不存在）')
console.log('  ──────────────────────────────────────────────')
console.log('')

const child = spawn(
  process.execPath,
  [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'vite.lan.config.ts'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, RMD_LAN_PORT: String(port) } },
)

child.on('exit', (code) => process.exit(code ?? 0))

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig))
}
