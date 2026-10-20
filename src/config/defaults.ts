/**
 * 应用默认配置。新增设置项只需在此文件加一行，
 * initSettings() 会自动为旧用户补上缺失的默认值。
 * platforms 不传表示全平台适用。
 */
import { DEFAULT_PALETTE_SHORTCUT } from '@/utils/commandPalette'

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
  /** 编辑器右侧文档大纲导航开关（总开关，关闭后工具栏按钮与面板一起隐藏） */
  outlineEnabled: { default: true },
  /** 编辑器右侧大纲面板是否展开（界面状态，默认收起，点工具栏「大纲」按钮切换） */
  outlinePanelVisible: { default: false },
  /** 编辑器底部状态栏开关（显示光标行列、已选字数、总字数与预估阅读时长） */
  statusBarEnabled: { default: true },
  /** 编辑器主题 */
  editorTheme: { default: 'default' },
  /**
   * 编辑区字号（px），仅影响 CodeMirror 输入区的显示，
   * 与「普通段落」的 paraFontSize（预览/导出的排版字号）相互独立。
   */
  editorFontSize: { default: 13 },
  /**
   * 命令面板快捷键（类 Spotlight 的全局检索：草稿/云文章/本地文章/素材）。
   * Mod 表示平台主修饰键（macOS 的 Cmd、其余平台的 Ctrl），与 CodeMirror 语义一致。
   */
  commandPaletteShortcut: { default: DEFAULT_PALETTE_SHORTCUT },
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
  /**
   * 文章文件命名方式（GitHub 仓库 / 本地磁盘两种模式均适用，桌面端与 Web 端一致）：
   * - 'id'    沿用内部 id 命名，文件名形如 art-xxxx.md（默认，向后兼容）
   * - 'title' 用「菜单树文章名 + 短哈希」命名，形如 公众号排版技巧-k3f9a2b1.md；
   *           哈希取自节点 id，用于避免同名文章的文件名冲突
   * 仅影响「新建」与「重命名」时的文件名；已有文章在重命名时才会迁移到新命名。
   */
  articleFileNaming: { default: 'id' },
  /** TreeSidebar 初始展开状态 */
  treeSidebarExpanded: { default: false },
  /** TreeSidebar 宽度（px） */
  treePanelWidth: { default: 278 },
  /** 违禁词检测：用户自定义补充词库 */
  bannedCustomWords: { default: [] },
  /** 违禁词检测：白名单（命中的词直接忽略） */
  bannedWhitelist: { default: [] },
  /**
   * AI 排版：OpenAI 兼容接口基址（必填，无默认值）。
   * 可填 https://api.deepseek.com 这类裸域名，缺失版本段时自动补 /v1。
   */
  aiBaseUrl: { default: '' },
  /** AI 排版：API Key（敏感字段，加密存储；必填，无默认值） */
  aiApiKey: { default: '' },
  /**
   * 旧版本遗留的单个模型名，现在**没有对应设置项**，只在 `aiModels` 为空时
   * 作为兜底读一次（装过「只填一个模型名」那版的老用户）。
   * 现行口径：模型只有一份清单，**清单首项即默认**，不另设「默认模型」。
   */
  aiModel: { default: '' },
  /**
   * AI 文本：常用模型清单（设置页多选维护，可手填）。**首项即默认**。
   * 写作与排版共用这份清单，但各自记住用哪一个，所以下面还有两个「当前选择」。
   */
  aiModels: { default: [] },
  /**
   * AI 写作面板当前使用的模型；空串表示跟随清单首项。
   * 分开存是因为同一套接口下，写作常挑发散度高的模型、排版常挑稳定的模型。
   */
  aiWriteModel: { default: '' },
  /** AI 排版面板当前使用的模型；空串表示跟随清单首项 */
  aiFormatModel: { default: '' },
  /** AI 排版：采样温度，排版任务取较低值以稳定输出 */
  aiTemperature: { default: 0.3 },
  /** AI 排版：单次输出 token 上限，长文被截断时可调大 */
  aiMaxTokens: { default: 8192 },
  /** AI 排版：是否流式输出（边生成边显示） */
  aiStream: { default: true },
  /** AI 排版：单次请求超时（秒） */
  aiTimeoutSec: { default: 180 },
  /** AI 排版：默认力度档位，minimal | standard | rich */
  aiStylePreset: { default: 'standard' },
  /** AI 排版：默认补充指令（每次排版自动附加，可留空） */
  aiExtraInstruction: { default: '' },
  /**
   * AI 排版：常用补充要求清单，供面板勾选复用。
   * 每项 { id, text, enabled }：enabled 为 true 时该条会拼进本次请求的补充要求。
   * 勾选状态随条目一起持久化，下次打开面板无需重复勾选。
   */
  aiExtraPresets: { default: [] },
  /**
   * 注：写作与排版共用「AI 文本」的接口地址 / API Key / 模型名
   * （aiBaseUrl / aiApiKey / aiModel），因此这里不再有模型覆盖项。
   * 下面是写作与排版**不同**的那几项。
   */
  /** AI 写作：采样温度。写作需要比排版更高的发散度 */
  aiWriteTemperature: { default: 0.7 },
  /** AI 写作：单次输出 token 上限。公众号长文 4000-8000 字，需要比排版的 8192 更大 */
  aiWriteMaxTokens: { default: 16384 },
  /**
   * AI 写作：文章原型档位。
   * auto 由模型自行判断；其余对应 khazix-writer skill 的五种原型。
   */
  aiWriteArchetype: { default: 'auto' },
  /** AI 写作：目标字数档位，auto 交给 skill 自己的「4000-8000 字」口径 */
  aiWriteLength: { default: 'auto' },
  /**
   * AI 写作：是否启用「卡兹克写作技能」（默认开启）。
   *
   * 一个开关管三件事，因为它们本来就是同一套技能的组成部分：
   * 1. 载入技能本体 `src/data/ai/khazix/SKILL.md`；
   * 2. 连参考资料一起载入（同目录 `references/` 的风格示例 + 内容方法论，约 +6900 tokens）；
   * 3. 出稿后按技能第四节「四层自检体系」再跑一次质检。
   *
   * 关掉即整篇技能都不进 prompt，模型自由发挥（仍保留输出格式约定）。
   * 默认开启：这是这个功能的核心卖点，不该让用户先去设置里打开。
   */
  aiWriteUseSkill: { default: true },
  /**
   * AI 各面板的结果保留时长（小时）——**三个面板各自独立设置**。
   *
   * 口径都是「从**最后一次请求**算起」的滑动续期：一直在用就一直留得住，
   * 停手超过这个时长后，下一次请求从空白开始。
   *
   * 为什么分开：三个面板的使用节奏完全不同——写作往往一次聊很久（一次成稿要几十分钟），
   * 排版/配图多是「生成一次就用掉」。共用一个值会逼用户在两种节奏间折中，
   * 所以各给各的（都默认 24 小时）。键名沿用 aiWriteSessionHours 保持向后兼容。
   */
  aiWriteSessionHours: { default: 24 },
  /** AI 排版：结果保留时长（小时） */
  aiFormatSessionHours: { default: 24 },
  /** AI 配图：结果保留时长（小时） */
  aiImageSessionHours: { default: 24 },
  /**
   * AI 配图：上一次用的提示词，重开面板/重启应用都还在。
   *
   * 为什么单独存：配图常常是「改几个字再生成一版」的迭代，每次重开都要
   * 重新敲一遍长提示词很烦。面板上有「清空」按钮可手动清掉。
   * 注意这是**提示词草稿**，不是生成结果，所以不受结果保留时长约束。
   */
  aiImagePrompt: { default: '' },
  /** AI 写作：长期补充要求，每次写作都拼进 system prompt（可留空） */
  aiWriteExtraInstruction: { default: '' },
  /**
   * AI 配图：当前选中的厂商 id（对应 services/imageProviders.ts 的注册表，
   * 目前有 'agnes' 与 'gpt-image'）。各厂商参数不一致，故配置按厂商分开存放。
   */
  imageGenProvider: { default: 'agnes' },
  /**
   * AI 配图：按厂商的配置表（敏感字段，整体加密存储）。
   * 形如 { agnes: { apiKey, baseUrl, model, models, size, ratio, timeoutSec },
   *        'gpt-image': { …, width, height, quality, background, moderation, relay } }；
   * models 是该厂商勾选的常用模型清单（可手填），model 是当前使用的那个。
   * 读取一律走 imageProviders.getProviderConfig()，缺失字段会自动回退厂商默认值
   * （含旧版本没有的 width / height / quality / background / moderation / relay）。
   * relay 是选中的中转站 id，空串表示按标准同步接口处理。
   */
  imageGenProviders: { default: {} },
}
