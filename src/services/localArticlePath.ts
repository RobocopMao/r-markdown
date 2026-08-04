/**
 * 本地磁盘文章存储路径解析（仅桌面端 Tauri）。
 *
 * 统一提供 articles 根目录、文章文件目录、图片目录、tree.json 路径。
 * 用户可在设置中自定义根目录（articleStorageDir），为空时回退到
 * Documents/R-Markdown/articles。
 *
 * 目录内部布局（无论根目录在哪都保持一致）：
 *   <root>/
 *     ├── tree.json
 *     ├── articles/{id}.md
 *     └── images/*.png
 */

import { getSetting } from '@/config/settings'

const DEFAULT_ARTICLES_DIR = 'R-Markdown/articles'
const ARTICLES_SUBDIR = 'articles'
const IMAGES_SUBDIR = 'images'

/** 获取本地文章根目录绝对路径（已解析自定义设置） */
export async function getArticlesDir(): Promise<string> {
  const custom = getSetting<string>('articleStorageDir')
  if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '')
  const { documentDir } = await import('@tauri-apps/api/path')
  const doc = await documentDir()
  return `${doc}/${DEFAULT_ARTICLES_DIR}`
}

/** 获取文章文件存储子目录路径（<root>/articles） */
export async function getArticleFilesDir(): Promise<string> {
  return `${await getArticlesDir()}/${ARTICLES_SUBDIR}`
}

/** 获取 tree.json 路径 */
export async function getTreeFilePath(): Promise<string> {
  return `${await getArticlesDir()}/tree.json`
}

/** 获取图片目录绝对路径（<root>/images） */
export async function getImagesDir(): Promise<string> {
  return `${await getArticlesDir()}/${IMAGES_SUBDIR}`
}

/** 默认 articles 根目录（未自定义时） */
export async function getDefaultArticlesDir(): Promise<string> {
  const { documentDir } = await import('@tauri-apps/api/path')
  const doc = await documentDir()
  return `${doc}/${DEFAULT_ARTICLES_DIR}`
}
