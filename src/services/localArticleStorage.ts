/**
 * 本地磁盘文章存储目录管理（仅桌面端 Tauri）。
 *
 * 负责：
 * - 将默认文章目录剪切移动到用户指定的新目录（保持内部布局不变）
 * - 重新安装场景下，让用户选择已有目录直接加载（无结构则新建）
 *
 * 内部布局：<root>/{tree.json, articles/, images/}
 *
 * 安全策略：
 * - 绝不递归删除用户选中目录的内容（避免误删主目录等危险路径）
 * - 仅允许移动到「空目录」或「仅含本应用数据的目录」
 * - 复制成功后才删除原目录，失败时保留原目录数据
 */

import { getSetting, setSetting } from '@/config/settings'
import { open } from '@tauri-apps/plugin-dialog'
import { getArticlesDir, getDefaultArticlesDir } from './localArticlePath'

/** 本应用在根目录下产生的文件/子目录名集合，用于判断目标目录是否"仅含本应用数据" */
const APP_ENTRIES = new Set(['tree.json', 'articles', 'images'])

/**
 * 判断是否为操作系统产生的元数据/隐藏文件，应跳过不复制、不统计。
 * - .DS_Store（macOS Finder 元数据）
 * - ._*（macOS resource fork，复制/打包时自动生成）
 * - .Spotlight-V100 / .Trashes / .fseventsd（macOS 索引/废纸篓/事件日志）
 * - Thumbs.db / desktop.ini（Windows）
 * Tauri 的 fs scope 默认禁止访问 .DS_Store 等，stat 会报 forbidden，
 * 所以必须在调用 stat/copyFile 前过滤掉。
 */
function isOsJunkEntry(name: string): boolean {
  if (!name) return false
  if (name === '.DS_Store' || name === 'Thumbs.db' || name === 'desktop.ini') return true
  if (name.startsWith('._')) return true
  if (name === '.Spotlight-V100' || name === '.Trashes' || name === '.fseventsd') return true
  return false
}

/**
 * 规范化路径用于比较：统一分隔符为 /，去除首尾分隔符与盘符大小写差异。
 * 例：'C:\\Users\\foo\\bar' → 'c:/users/foo/bar'
 *     '/Users/foo/bar/'    → '/users/foo/bar'
 */
function normalizePath(p: string): string {
  let s = p.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  // Windows 盘符统一小写：C:/ → c:/
  if (/^[A-Za-z]:\//.test(s)) s = s[0].toLowerCase() + s.slice(1)
  return s
}

/**
 * 判断路径是否为危险目标（根、用户主目录、盘符根等），禁止移动到这里。
 * 这些路径一旦被清空/删除，会导致用户大量数据丢失。
 *
 * 跨平台：同时识别 POSIX（/Users/x、/home/x）与 Windows（C:\Users\x、
 * C:\、D:\）路径。通过 Tauri homeDir() 拿真实主目录做精确比对。
 *
 * 规则（只拦「整个磁盘/整个主目录」级别的路径）：
 * - 裸盘符根（C:\、D:\）和 POSIX 根（/）→ 危险
 * - 等于用户主目录本身（~/）→ 危险
 * - 主目录下的子目录（如 ~/R-Markdown、~/Documents/foo）→ 放行，
 *   由 containsOnlyAppData 兜底：只删仅含本应用数据的目录，不会动用户其他文件
 * - 非主目录路径：Windows 盘符下一级即可（D:\MyArticles 放行），
 *   POSIX 需 ≥ 2 级（/data/foo 放行，/foo 危险）
 */
async function isDangerousPath(p: string): Promise<boolean> {
  const path = normalizePath(p)
  if (!path) return true
  // 裸盘符根（c:、c:/）或 POSIX 根（/）
  if (/^[a-z]:\/?$/.test(path)) return true
  if (path === '/') return true

  // 拿系统真实主目录比对，兼容 Windows / macOS / Linux
  let home = ''
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    home = normalizePath(await homeDir())
  } catch {
    home = ''
  }
  // 等于主目录本身 → 危险（递归删除会清空整个 home）
  if (home && path === home.replace(/\/+$/, '')) return true

  const isWindows = /^[a-z]:\//.test(path)
  const parts = path.split('/').filter(Boolean)
  if (isWindows) {
    // Windows：盘符段 + 至少 1 级子目录（D:\MyArticles → ['d:', 'myarticles'] = 2 段，放行）
    if (parts.length < 2) return true
    return false
  }
  // POSIX：根下至少 2 级（/data/foo 放行，/foo 危险）
  if (parts.length < 2) return true
  return false
}

/**
 * 判断目录是否仅包含本应用产生的数据（或为空）。
 * 用于决定是否允许直接向其写入而不破坏用户其他数据。
 */
async function containsOnlyAppData(dir: string): Promise<boolean> {
  const { exists, readDir } = await import('@tauri-apps/plugin-fs')
  if (!(await exists(dir))) return true // 不存在视为空
  const entries = await readDir(dir)
  if (entries.length === 0) return true
  // 跳过 OS 元数据后，剩余条目必须全部为本应用数据
  return entries.filter((e) => !isOsJunkEntry(e.name)).every((e) => APP_ENTRIES.has(e.name))
}

/** 递归复制目录内所有文件到目标目录，保持相对结构 */
async function copyDirRecursive(srcDir: string, destDir: string): Promise<void> {
  const { exists, mkdir, readDir, copyFile, stat } = await import('@tauri-apps/plugin-fs')

  async function walk(src: string, dest: string): Promise<void> {
    if (!(await exists(src))) return
    const entries = await readDir(src)
    await mkdir(dest, { recursive: true })
    for (const entry of entries) {
      if (isOsJunkEntry(entry.name)) continue
      const srcPath = `${src}/${entry.name}`
      const destPath = `${dest}/${entry.name}`
      const info = await stat(srcPath)
      if (info.isDirectory) {
        await walk(srcPath, destPath)
      } else {
        await copyFile(srcPath, destPath)
      }
    }
  }

  await walk(srcDir, destDir)
}

/** 递归删除目录 */
async function removeDirRecursive(dir: string): Promise<void> {
  const { exists, remove } = await import('@tauri-apps/plugin-fs')
  if (await exists(dir)) {
    await remove(dir, { recursive: true })
  }
}

/** 统计目录下文件总数（用于复制后校验） */
async function countFiles(dir: string): Promise<number> {
  const { exists, readDir, stat } = await import('@tauri-apps/plugin-fs')
  if (!(await exists(dir))) return 0
  let count = 0
  async function walk(d: string): Promise<void> {
    const entries = await readDir(d)
    for (const entry of entries) {
      if (isOsJunkEntry(entry.name)) continue
      const p = `${d}/${entry.name}`
      const info = await stat(p)
      if (info.isDirectory) {
        await walk(p)
      } else {
        count++
      }
    }
  }
  await walk(dir)
  return count
}

/**
 * 将当前文章根目录剪切移动到 targetDir。
 * 复制全部内容后删除原目录，并更新 articleStorageDir 设置。
 *
 * 安全约束：
 * - targetDir 必须是空目录，或仅含本应用数据；否则抛错并保持现状
 * - targetDir 不能是危险路径（根/主目录等）
 * - 复制成功且文件数校验通过后才删除原目录
 *
 * @param targetDir 用户选中的目标目录（将作为新的 articles 根）
 * @throws Error 带可读消息，供 UI 层展示
 */
export async function moveArticleDir(targetDir: string): Promise<void> {
  const src = await getArticlesDir()
  const dest = targetDir.trim().replace(/\/+$/, '')

  if (!dest) throw new Error('目标目录不能为空')
  if (await isDangerousPath(dest)) {
    throw new Error('目标目录不安全（不能是根目录或用户主目录），请选择更深的子目录')
  }
  if (src === dest) return

  // 目标目录必须为空或仅含本应用数据；否则拒绝，绝不删除用户其他数据
  if (!(await containsOnlyAppData(dest))) {
    throw new Error('目标目录非空且含有非本应用文件，为避免覆盖请选择空目录')
  }

  // 若目标已存在（仅含本应用数据），先清理以便干净写入
  const { exists } = await import('@tauri-apps/plugin-fs')
  if (await exists(dest)) {
    await removeDirRecursive(dest)
  }

  // 复制前统计源文件数，用于复制后校验
  const srcCount = await countFiles(src)

  // 复制源 → 目标
  await copyDirRecursive(src, dest)

  // 校验：目标文件数应与源一致
  const destCount = await countFiles(dest)
  if (destCount !== srcCount) {
    // 复制不完整，不删除源；让用户保留数据
    throw new Error(
      `复制校验失败（源 ${srcCount} 个文件，目标 ${destCount} 个），已保留原目录，请重试`,
    )
  }

  // 校验通过后才删除原目录
  await removeDirRecursive(src)

  setSetting('articleStorageDir', dest)
}

/** 当前是否已使用自定义目录（非默认） */
export function isCustomDir(): boolean {
  const dir = getSetting<string>('articleStorageDir')
  return !!dir && dir.trim().length > 0
}

/**
 * 弹出目录选择器，让用户选择已有文章目录直接加载。
 * 选中目录将被设为新的 articles 根（无结构则初始化为空目录）。
 * @returns 选中的目录路径，用户取消则返回 null
 */
export async function pickArticleDir(): Promise<string | null> {
  const selected = await open({
    directory: true,
    title: '选择文章存储目录',
    canCreateDirectories: true,
  })
  if (typeof selected !== 'string' || !selected) return null
  const dir = selected.trim().replace(/\/+$/, '')
  setSetting('articleStorageDir', dir)
  return dir
}

/** 恢复为默认目录（仅清空自定义设置，不移动数据） */
export async function resetToDefaultDir(): Promise<void> {
  const custom = getSetting<string>('articleStorageDir')
  if (!custom || !custom.trim()) return
  setSetting('articleStorageDir', '')
  await getDefaultArticlesDir() // 触发默认目录惰性校验
}
