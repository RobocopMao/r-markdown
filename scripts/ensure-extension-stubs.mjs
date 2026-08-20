// 闭源 extension 子模块不可用时（目录为空/未克隆），把本地 stubs 复制进 src/extension，
// 保证 vue-tsc -b 与 vite 都能解析到模块而不会编译报错。
// 真实子模块已拉取时跳过，不做任何改动。
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const realDir = join(root, 'src/extension')
const stubDir = join(root, 'src/extension-stubs')

function isEmptyDir(dir) {
  if (!existsSync(dir)) return true
  return readdirSync(dir).filter((f) => !f.startsWith('.')).length === 0
}

if (isEmptyDir(realDir)) {
  mkdirSync(realDir, { recursive: true })
  const files = readdirSync(stubDir).filter((f) => f.endsWith('.ts') && !f.startsWith('.'))
  for (const f of files) copyFileSync(join(stubDir, f), join(realDir, f))
  console.log(`[ensure-extension-stubs] 复制 ${files.length} 个 extension stub 到 src/extension/`)
} else {
  console.log('[ensure-extension-stubs] 检测到真实 extension 子模块，跳过')
}