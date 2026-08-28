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
  /**
   * 粘贴/拖拽图片上传方式：
   * - 'local' IndexedDB 存储 | 'disk' 本地磁盘存储（仅桌面端）
   * - 'github' GitHub 图床 | 'leta' 乐塔图床
   */
  pasteDropMode: { default: 'local' },
  /** 工具栏图床上传默认使用哪个图床：'github' | 'leta' */
  defaultHosting: { default: 'github' },
  /** 图片压缩质量 10-100，对应 JPEG quality 0.1-1.0 */
  compressQuality: { default: 100 },
  /**
   * 磁盘图片上传文件名规则（仅桌面端、磁盘存储生效）：
   * - 'original' 保留原图片名称（默认），重名时追加序号
   * - 'datetime' 按年月日时分秒命名（如 20260818231010）
   */
  diskImageNaming: { default: 'original', platforms: ['desktop'] },
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
  editorTheme: { default: 'default' },
  /** 云端文章 GitHub 仓库，格式 owner/repo */
  cloudArticleRepo: { default: '' },
  /** 云端文章 GitHub 仓库分支 */
  cloudArticleBranch: { default: 'main' },
  /** 云端文章 GitHub Token */
  cloudArticleToken: { default: '' },
  /**
   * 按工作区 id 的云端文章 GitHub Token 映射（敏感字段，整体加密存储）。
   * 空对象表示未使用按工作区 token，回退到 cloudArticleToken。
   */
  cloudArticleTokens: { default: {} },
  /**
   * 文章工作区列表（github 仓库+分支 / local 目录），支持多仓库多分支多目录。
   * 空数组表示未初始化，首次使用时按旧配置 seed。
   */
  articleWorkspaces: { default: [] },
  /** 当前激活的 github 工作区 id（空表示未选择） */
  activeGithubWorkspaceId: { default: '' },
  /** 当前激活的 local 工作区 id（空表示未选择，仅桌面端） */
  activeLocalWorkspaceId: { default: '', platforms: ['desktop'] },
  /**
   * 文章目录树存储模式（仅桌面端）：
   * - 'github' 使用 GitHub 仓库存储（默认）
   * - 'local'  使用本地磁盘存储（Documents/R-Markdown/articles/）
   * Web 端固定为 'github'。
   */
  articleStorageMode: { default: 'github', platforms: ['desktop'] },
  /**
   * 本地磁盘存储的根目录绝对路径（仅桌面端、local 模式生效）。
   * 空字符串表示使用默认路径 Documents/R-Markdown/articles。
   * 用户可在设置中修改，修改后原有文章文件夹会被剪切移动到新目录。
   */
  articleStorageDir: { default: '', platforms: ['desktop'] },
  /** TreeSidebar 初始展开状态 */
  treeSidebarExpanded: { default: false },
  /** TreeSidebar 宽度（px） */
  treePanelWidth: { default: 278 },
  /** 违禁词检测：用户自定义补充词库 */
  bannedCustomWords: { default: [] },
  /** 违禁词检测：白名单（命中的词直接忽略） */
  bannedWhitelist: { default: [] },
}
