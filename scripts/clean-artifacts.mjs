// 清理 src/ 下的 TypeScript / Vue 编译产物（.js / .js.map / .vue.js / .vue.js.map）
// 这些文件由 IDE 或 vue-tsc 增量编译生成，会污染 ESLint 结果并可能被 Vite 误加载。
import { globSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const patterns = ['src/**/*.js', 'src/**/*.js.map', 'src/**/*.vue.js', 'src/**/*.vue.js.map']

let removed = 0
for (const pattern of patterns) {
  for (const file of globSync(pattern, { cwd: root })) {
    const abs = resolve(root, file)
    try {
      rmSync(abs)
      removed++
    } catch {
      // 忽略删除失败（权限/不存在）
    }
  }
}
console.log(`[clean] removed ${removed} compiled artifact(s) from src/`)
