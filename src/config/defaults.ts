/**
 * 应用默认配置。新增设置项只需在此文件加一行，
 * initSettings() 会自动为旧用户补上缺失的默认值。
 * platforms 不传表示全平台适用。
 */

export interface SettingDef {
  default: unknown
  /** 适用平台，不传表示全平台 */
  platforms?: ('desktop' | 'web')[]
}

export const DEFAULT_SETTINGS: Record<string, SettingDef> = {
  /** 启动时是否自动检查更新（仅桌面端） */
  autoUpdate: { default: true, platforms: ['desktop'] },
  /** 页面缩放百分比（仅桌面端） */
  pageZoom: { default: 100, platforms: ['desktop'] },
  /** 是否启用自动保存（仅桌面端） */
  autoSave: { default: true, platforms: ['desktop'] },
  /** 自动保存间隔（秒，仅桌面端） */
  autoSaveInterval: { default: 0.5, platforms: ['desktop'] },
  /** GitHub 图床仓库，格式 用户名/仓库名 */
  githubRepo: { default: '' },
  /** GitHub Personal Access Token */
  githubToken: { default: '' },
  /** GitHub 仓库分支 */
  githubBranch: { default: 'main' },
  /** 乐塔图床 Token */
  letaToken: { default: '' },
  /** 乐塔图床存储 ID */
  letaStorageId: { default: '1' },
  /** 粘贴/拖拽图片上传方式：'local' 本地存储 | 'github' GitHub 图床 | 'leta' 乐塔图床 */
  pasteDropMode: { default: 'local' },
  /** 工具栏图床上传默认使用哪个图床：'github' | 'leta' */
  defaultHosting: { default: 'github' },
  /** 图片压缩质量 10-100，对应 JPEG quality 0.1-1.0 */
  compressQuality: { default: 100 },
  /** 普通段落字号（px） */
  paraFontSize: { default: 16 },
  /** 普通段落行高 */
  paraLineHeight: { default: 1.85 },
  /** 普通段落字重 */
  paraFontWeight: { default: '400' },
  /** 普通段落间距（下方 margin，px） */
  paraMargin: { default: 24 },
  /** 普通段落首行缩进，支持 px/em/rem，如 "2em"，空字符串表示不缩进 */
  paraIndent: { default: '' },
  /** 公众号 AppID */
  wechatAppId: { default: '' },
  /** 公众号 AppSecret */
  wechatAppSecret: { default: '' },
  /** 公众号默认作者名 */
  wechatDefaultAuthor: { default: '' },
  /** 预览区 minimap 缩略图开关 */
  minimapEnabled: { default: false },
  /** 编辑器主题 */
  editorTheme: { default: 'warm' },
}
