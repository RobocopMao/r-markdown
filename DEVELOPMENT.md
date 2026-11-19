# r-markdown 开发规范

> 每次开发前必须阅读本文档，确保代码风格和项目结构一致。

当前版本 **0.5.1**。

## 项目概述

公众号 Markdown 排版编辑器，支持实时预览、主题切换、深色模式、草稿管理、文章工作区（GitHub 云文章 / 本地磁盘文章）、图床上传、素材库、微信发布、违禁词检测、文档大纲、查找替换、命令面板、AI 写作 / AI 排版 / AI 配图、PDF 导出、Mermaid/MathJax 公式、桌面客户端（macOS / Windows）。

## 技术栈

| 类别     | 技术                    | 版本                |
| -------- | ----------------------- | ------------------- |
| 框架     | Vue 3 (Composition API) | 3.6.x               |
| 语言     | TypeScript              | 6.x                 |
| 构建     | Vite                    | 8.x                 |
| 样式     | Tailwind CSS 4          | 4.3.x               |
| 编辑器   | CodeMirror 6            | 6.x                 |
| 路由     | Vue Router              | 4.6.x               |
| 代码高亮 | highlight.js            | 11.x                |
| 图表     | Mermaid                 | 11.x                |
| 公式     | MathJax                 | 内置 public/mathjax |
| 桌面     | Tauri 2                 | 2.x                 |
| 包管理   | pnpm                    | -                   |
| Node     | >= 24.0.0               | -                   |

## 目录结构

```
src/
├── components/          # 公用组件
│   ├── BaseDialog.vue       # 通用弹窗
│   ├── BaseDrawer.vue       # 通用抽屉
│   ├── BaseCheckbox.vue     # 通用勾选框（自绘样式，项目内不要用原生 checkbox）
│   ├── BaseTooltip.vue      # 通用 tooltip
│   ├── BetaBadge.vue        # 「Beta」角标（AI 素材四处入口共用，颜色跟随所在元素）
│   ├── ImagePreview.vue     # 大图预览浮层（命令式 open(src, caption)，Teleport 到 body）
│   ├── ConfirmDialog.vue    # 确认弹窗
│   ├── DarkModeToggle.vue   # 深色模式切换
│   ├── NavCapsule.vue       # 顶部导航胶囊
│   ├── PromptDialog.vue     # 提示词弹窗
│   ├── SiteFooter.vue       # 页脚
│   ├── SiteLogo.vue         # 站点 Logo
│   ├── Toast.vue            # 轻提示
│   └── mobile/              # 移动端专用
│       └── MobileNavMenu.vue    # 移动端导航菜单
├── composables/         # Vue 组合式函数（全局通用）
│   ├── useAutoUpdater.ts    # Tauri 自动更新检查
│   ├── useDarkMode.ts       # 深色模式逻辑
│   ├── useDropdownGroup.ts  # 下拉菜单组
│   ├── useEditorSettings.ts # 编辑器全局设置（自动保存开关等）
│   ├── useMermaid.ts        # Mermaid 图表渲染
│   ├── useParagraphSettings.ts # 段落格式全局设置
│   ├── useSetting.ts        # 通用设置读写（响应式，监听 setting-changed 事件）
│   └── useSessionCountdown.ts # AI 面板的「结果保留」倒计时（各面板传自己的时长 key；每秒只改变化的文案）
│   ├── useTheme.ts          # 主题管理
├── config/              # 配置层
│   ├── defaults.ts          # 全部设置项与默认值（唯一来源，新增设置只改这里）
│   └── settings.ts          # 设置读写（带 AES-GCM-256 加密敏感项）
├── data/                # 静态数据
│   ├── demoContent.ts       # 编辑器示例内容
│   └── ai/                  # AI 能力用的技能 / 规范文本（与对应 skill 同源，手动同步）
│       ├── r-markdown-formatter/ # AI 排版用的组件规范（format-spec.md，与 r-markdown-formatter skill 同源）
│       ├── r-markdown-material/  # AI 素材用的玩法技能（SKILL.md：什么需求用哪个组件、子内容形状、正反例）
│       └── khazix/              # AI 写作用的内置技能（khazix-writer skill：SKILL.md + references/）
├── extension/           # 排版组件库（git 子模块，闭源；缺失时自动复制 stubs）
├── extension-stubs/     # 排版组件空桩（extension 不可用时的 fallback）
├── router/              # 路由配置
│   └── index.ts
├── services/            # 业务服务层
│   ├── DraftStorage.ts      # IndexedDB 草稿存储
│   ├── aiFormat.ts          # AI 排版 / 通用 chat.completions 调用（导出 chatCompletion，formatArticle 为别名）
│   ├── aiWrite.ts           # AI 写作：在 AI 排版配置之上叠加写作专属模型 / 温度 / 最大输出
│   ├── aiWriteSessionStore.ts # AI 写作会话持久化（IndexedDB 单条记录，key 'current'）
│   ├── aiSessionStore.ts    # AI 排版 / 配图的结果保留（IndexedDB：records 存 JSON、blobs 存图片）
│   ├── imageGen.ts          # AI 配图：OpenAI 兼容 /images/generations 调用（取图 / base64 解码 / 错误中文映射）
│   ├── imageProviders.ts    # AI 配图厂商注册表（接口·尺寸·请求体差异的数据化描述 + 按厂商配置读写）
│   ├── apiBase.ts           # 基址归一化、HTTP 错误中文映射、超时与中止（AI 排版与 AI 配图共用）
│   ├── GitHubArticleCache.ts# GitHub 文章本地缓存（IndexedDB）
│   ├── GitHubTreeService.ts # GitHub 仓库文章树 CRUD
│   ├── LocalTreeService.ts  # 本地磁盘文章树 CRUD（与 GitHub 版同签名）
│   ├── localArticlePath.ts  # 本地文章目录路径解析（支持自定义根目录）
│   ├── localArticleStorage.ts # 本地文章目录迁移 / 重装后重新加载
│   ├── localImageDisk.ts    # 本地磁盘图片存储与解析
│   ├── articleWorkspace.ts  # 文章工作区（多仓库 / 多分支 / 多目录）
│   ├── configPersistence.ts # 配置持久化到磁盘
│   ├── coverCache.ts        # 微信封面 media_id 缓存
│   ├── encryption.ts        # AES-GCM-256 加解密
│   ├── githubUploader.ts    # GitHub 图床
│   ├── letaUploader.ts      # 乐塔图床
│   ├── materialLibrary.ts   # 官方素材库读取
│   ├── materialStorage.ts   # 我的素材存储（IndexedDB + 磁盘）
│   ├── materialPublish.ts   # 素材发布到 GitHub（走 Worker 代理）
│   ├── startupCheck.ts      # 配置恢复启动检查
│   └── wechatPublisher.ts   # 微信公众号发布
├── styles/              # 全局样式
│   └── style.css
├── utils/               # 工具函数
│   ├── articleNaming.ts     # 文章文件命名（文章名净化 / 短哈希 / 唯一基名解析）
│   ├── aiFormatPrompt.ts    # AI 排版：prompt 组装、图片/素材占位符遮罩·还原、输出清洗与标签校验（纯逻辑）
│   ├── aiMaterialPrompt.ts  # AI 素材：技能加载、prompt 组装、输出清洗与质检（纯逻辑）
│   ├── materialBoundary.ts  # 素材边界注释：判定「是不是单个成品组件」，不是就首尾包 <!-- 素材开始/结束 -->（纯逻辑）
│   ├── materialCommands.ts  # 素材输入框的 / 快捷命令：识别斜杠查询、过滤组件清单、替换进正文（纯逻辑）
│   ├── wechatHtmlRules.ts   # `<html>` 块的公众号兼容扫描：按微信规范挑出会被服务器删掉的 CSS / 属性，分「会散版」和「只提示」两档
│   ├── aiWritePrompt.ts     # AI 写作：prompt 组装、输出分类（出稿/追问）、自检报告提取（纯逻辑）
│   ├── aiSession.ts         # AI 各面板共用的保留时长逻辑（滑动续期、收敛、剩余文案，纯逻辑）
│   ├── aiMaterialSession.ts # AI 素材：会话模型、消息归一化与历史裁剪（纯逻辑，与 aiWriteSession 同构）
│   ├── aiWriteSession.ts    # AI 写作：会话模型、消息归一化与历史裁剪（纯逻辑）
│   ├── bannedWords.ts       # 违禁词词库与扫描（含代码块/URL 遮罩）
│   ├── charCount.ts         # 字数统计与预估阅读时长
│   ├── colorUtils.ts        # 颜色处理
│   ├── commandPalette.ts    # 命令面板检索与快捷键解析（纯逻辑）
│   ├── components.ts        # 组件解析器（callout/timeline 等）
│   ├── extractTitle.ts      # 从 Markdown 提取标题 / 文件名净化
│   ├── findReplace.ts       # 查找替换纯逻辑
│   ├── headingLevels.ts     # 标题层级唯一权威定义
│   ├── helpers.ts           # 通用工具（esc/leaf/hexToRgb/withAlpha/getErrorMessage 等）
│   ├── imageDB.ts           # IndexedDB 图片存储
│   ├── inlineFormat.ts      # 行内格式化（==渐变::柔光!!胶囊^^上标等）
│   ├── markdownParser.ts    # Markdown → HTML 解析（含自定义块级标签）
│   ├── mathRenderer.ts      # MathJax 公式渲染
│   ├── outline.ts           # 文档大纲提取（标题 + <title> + <p-title>）
│   ├── paginate.ts          # PDF 导出 DOM 测量装箱分页
│   ├── platform.ts          # 平台判断与快捷键文案（显示用，不用于按键分支）
│   ├── saveFile.ts          # 保存文件到本地（桌面端原生保存对话框 / 浏览器 a.download）
│   ├── textDiff.ts          # 行级文本差异（LCS + hunk 折叠，供 AI 排版结果对照，纯逻辑）
│   └── xhsCards.ts          # 小红书卡片生成
├── views/               # 页面视图
│   ├── 404/
│   │   └── NotFound.vue          # 404 页
│   ├── home/
│   │   └── HomePage.vue          # 首页（公开降级版）
│   ├── editor/
│   │   ├── EditorPage.vue        # 编辑器页
│   │   ├── components/           # 编辑器专用组件（见下方组件表，mobile/ 下为移动端操作菜单）
│   │   └── composables/          # 编辑器专用组合式函数（草稿/云文章/图片/导入/滚动同步/微信发布等）
│   ├── extension/
│   │   └── ExtensionPage.vue     # 组件展示页
│   ├── help/                     # 帮助文档（公开降级版）
│   └── material/                 # 素材库页（公开降级版）
├── views-private/       # 私有视图（git 子模块，闭源）：私有首页 / 素材库页 / 帮助文档
├── App.vue              # 根组件
└── main.ts              # 入口文件

src-tauri/               # Tauri 桌面客户端（git 子模块，Rust）：入口 / 插件注册 / 微信 API / 图标 / 权限 / 配置

worker/                  # Cloudflare Worker：GitHub API 代理（素材库发布鉴权，wrangler.toml）
functions/               # Cloudflare Pages Function：/api/leta 乐塔图床代理

scripts/
├── clean-artifacts.mjs        # 清理 src/**.js 编译产物（dev/build 前自动执行）
├── dev-lan.mjs                # 局域网真机调试：自签证书 + HTTPS 启动 vite（pnpm dev:lan）
└── ensure-extension-stubs.mjs # extension 子模块为空时复制 stubs（build 前自动执行）
```

### 编辑器组件一览（`src/views/editor/components/`）

| 组件                                                                   | 用途                                                                                                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Editor.vue`                                                           | CodeMirror 编辑器封装（主题、快捷键、滚动、定位）                                                                                                                    |
| `Preview.vue`                                                          | 预览区渲染与复制                                                                                                                                                     |
| `EditorSidebar.vue`                                                    | 左侧竖排入口：文章 / 草稿 / 导入 / **AI** / 组件 / 图库 / 素材 / 检测 / 示例 / 帮助；「AI」与「素材」「示例」一样是悬停展开的二级菜单（AI 写作 / AI 排版 / AI 配图 / AI 素材）；底部只留「展开 / 收起」按钮（深色模式与设置已移到顶栏右上角） |
| `TreeSidebar.vue` `TreeNode.vue`                                       | 文章树侧栏与节点（拖拽、右键菜单；标题栏那排操作桌面/手机共用，手机上横向可滚动，**移动端「文章」Tab 直接用它，不再塞进三点菜单**）                                   |
| `OutlinePanel.vue`                                                     | 文档大纲面板                                                                                                                                                         |
| `FindReplacePanel.vue`                                                 | 查找替换面板                                                                                                                                                         |
| `CommandPalette.vue`                                                   | 命令面板（⌘K）                                                                                                                                                       |
| `Minimap.vue`                                                          | 预览区缩略图                                                                                                                                                         |
| `BannedBoard.vue`                                                      | 违禁词检测面板（内嵌编辑区，与统计 / 草稿箱 / 图库 / 我的素材同款；检测结果 / 自定义词 / 白名单三 Tab，点命中条目跳到编辑器对应行——原抽屉弹窗 BannedWordsDialog 已改为内嵌面板） |
| `SettingsBoard.vue`                                                    | 设置面板（内嵌编辑区，与统计 / 草稿箱 / 图库 / 我的素材 / 违禁词检测同款；基础 / 图片 / 文章存储 / 公众号 / AI〔AI 文本·AI 图片〕 / 关于六 Tab 排在右上角，标签页切换与原来一致）；「AI 文本」把写作与排版合并成一份公共接口配置，两者不同的采样参数在该子页内分区展示——原抽屉弹窗 SettingsDialog 已改为内嵌面板 |
| `SettingsCard.vue` `SettingsSlider.vue`                                | 设置卡片外壳（左图标块 + 标题 / 副标题 + 右上 `#action` 插槽 + 正文控件区）与统一滑杆（`linear-gradient` 画「已填充绿 / 未填充灰」双色轨道，原生 `accent-color` 做不到分段着色） |
| `ThemePicker.vue`                                                      | 主题色选择（顶栏右上角，最右一组按钮：主题色 → 深色/浅色 → 设置）                                                                                                    |
| `ThemeModeToggle.vue`                                                  | 深色 / 浅色 / 跟随系统切换（顶栏右上角，紧邻主题色选择；弹出菜单同 `ThemePicker` 的点击展开方式）                                                                    |
| `ComponentPickerDialog.vue` `TagPropsForm.vue`                         | 组件插入与属性编辑                                                                                                                                                   |
| `GalleryBoard.vue`                                                     | 图库面板（内嵌编辑区，本地 / 磁盘图片；缩略图悬停右上角「查看大图」，点开全屏预览浮层；点图只做选中，选中后右上角出现「插入」才真正写进正文（多选下勾 1 张也能插入，勾 2 张以上只给「删除选中」），开多选后可批量删除图片缓存——原「设置 → 清理图片缓存」已并入此处）                       |
| `DraftBoard.vue` `SaveDraftDialog.vue`                                 | 草稿列表与保存草稿                                                                                                                                                                                                                                                                    |
| `PushToCloudDialog.vue` `PushToCloudTree.vue`                          | 推送到云端文章树                                                                                                                                                     |
| `PublishToWechatDialog.vue`                                            | 发布到公众号                                                                                                                                                         |
| `MaterialBoard.vue` `MaterialCard.vue` `SaveMaterialDialog.vue`        | 我的素材面板（内嵌编辑区；瀑布流按容器宽自适应 1–4 列，分类 pill + 搜索；点素材只做选中，选中后工具条出现「插入」，多选下勾 1 个也能插入、勾 2 个只给「删除选中」；发布与删除确认沿用原流程——原抽屉弹窗 MaterialLibraryPanel 已改为内嵌面板） |
| `XhsBoard.vue`                                                         | 小红书图面板（内嵌编辑区，与统计 / 草稿箱 / 图库 / 我的素材 / 违禁词检测 / 设置同款；3:4 竖版 / 1:1 方版两个比例标签页，首图 + 正文卡片，点单张「下载」或右上「下载全部」〔桌面端打包 ZIP〕——原抽屉弹窗 XhsExporter 已改为内嵌面板） |
| `FinalizeDialog.vue`                                                   | 定稿（本地导出 Markdown）                                                                                                                                            |
| `AiBoard.vue`                                                          | AI 面板（内嵌编辑区，与统计 / 草稿箱 / 图库 / 我的素材 / 违禁词检测 / 设置同款；`BoardHeader` + 四个 `.board-tab` 切换 AI 写作 / AI 排版 / AI 配图 / AI 素材，四个子组件都用 `BaseDrawer` 的 `embedded` 模式，`visible` 跟着面板 `active` 走、不跟 tab 走，避免切 tab 时 abort 在途请求） |
| `AiWriteDialog.vue`                                                    | AI 写作（对话模式；对话流在 body、**输入框走 `BaseDrawer` 的 `#footer` 插槽固定底部**；稿件卡 / 四层自检报告 / 应用到编辑器）                                        |
| `AiFormatDialog.vue`                                                   | AI 排版（来源选择 / 流式生成 / 差异对比，桌面双栏·移动单栏 / 应用结果 / 结果保留倒计时 + 清空）                                                                      |
| `AiImageDialog.vue`                                                    | AI 配图（提示词 / 比例 · 分辨率或自定义宽高 · 质量 · 背景 / 出图预览与下载 · 添加到图库 · 添加到磁盘〔仅桌面端〕 / 插入编辑器 · 上传图床 · 保存磁盘并插入〔仅桌面端〕 / 结果保留倒计时 + 清空）      |
| `AiMaterialDialog.vue`                                                 | AI 素材（**多轮对话**：与 AI 写作同构的会话流，每轮出的素材是一条左对齐全宽卡片，预览/源码双视图 + 字数统计 + 提醒都挂在那一版上，「插入到编辑器」〔`insertOwnLine`，不覆盖已有内容〕与「清空编辑器再插入」〔`replaceAll`，走 ConfirmDialog 确认〕放在**该版卡片底部**，页脚另有一个「插入最新一版」快捷动作；顶部「新建会话」清空重开、`aiMaterialSessionHours` 倒计时；生成仍按编辑器语法产出组件片段（容器按需包、拼版自动加边界注释，见第 33 条）；**不做「保存到我的素材」**） |
| `Dropdown.vue`                                                         | 通用下拉                                                                                                                                                             |
| `mobile/MobileActionsMenu.vue`                                         | 移动端操作菜单（**只有编辑 / 预览两种模式**；文章 Tab 用文章树自带的标题栏工具栏，不再有这个菜单。宽度 `w-32`，与 `MobileNavMenu` 的 `w-32` 一致。设置常驻顶栏右上角、不在此菜单内） |
| `mobile/MobileEditorToolbar.vue`                                       | 移动端编辑 Tab 快捷工具栏（PC 标题栏那排按钮在触屏没有 hover 二级菜单，故独立做一条可横向滚动的图标条：基础 / 容器 / 图片 / 组件 / 解析 + 13 个行内样式；前四类点开是底部 `Teleport` 面板。右端固定「撤销」按钮不参与横滚，走 CodeMirror 的 `undo` 命令，与 Cmd/Ctrl+Z 同一条历史栈） |

### 编辑器组合式函数（`src/views/editor/composables/`）

| 文件                  | 用途                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `useAutoSave.ts`      | 自动保存（间隔可配）                                                                                                               |
| `useDraft.ts`         | 草稿关联与匹配                                                                                                                     |
| `useExport.ts`        | 导出（图片 / 小红书 / PDF / HTML）                                                                                                 |
| `useGitHubTree.ts`    | 文章树（GitHub 与本地磁盘切换）                                                                                                    |
| `useImageInsert.ts`   | 粘贴 / 拖拽图片插入与上传（导出 `processImageInsert()` / `insertImageToDisk()` / `uploadImageToHosting()` 供 AI 配图复用落盘链路） |
| `useImport.ts`        | 导入 `.md` / `.txt` / `.docx`（导出 `pickDocumentFile()` 供 AI 排版复用）                                                          |
| `useMaterial.ts`      | 素材保存与插入                                                                                                                     |
| `useScrollSync.ts`    | 编辑器与预览滚动同步                                                                                                               |
| `useToolbar.ts`       | 工具栏按钮与插入语法定义                                                                                                           |
| `useWechatPublish.ts` | 微信公众号发布                                                                                                                     |

## 开发环境搭建

```bash
# 安装依赖
pnpm install

# 初始化/更新 git 子模块（src-tauri / src/extension / src/views-private）
pnpm sm:update        # 或 bash update-submodules.sh

# 启动 Web 开发服务器（会先执行 pnpm clean 清理 .js 编译产物）
pnpm dev

# 启动局域网开发服务器，供手机/平板访问（HTTPS + 监听所有网卡）
pnpm dev:lan

# 启动 Tauri 桌面客户端开发模式（热更新）
pnpm tauri:dev

# 构建 Web 生产版本（clean → ensure-extension-stubs → vue-tsc → vite build）
pnpm build

# 构建桌面客户端
pnpm tauri:build

# 代码检查
pnpm check        # ESLint + Prettier 检查
pnpm lint         # ESLint 自动修复
pnpm format       # Prettier 格式化

# 清理编译产物（IDE / vue-tsc 增量编译会在 src/ 下生成 .js 残留）
pnpm clean
```

> `pnpm dev` / `build` / `tauri:dev` / `tauri:build` 均会先自动执行 `pnpm clean`，避免旧的 `.js` 文件被 Vite 优先加载导致行为异常。
> `pnpm build` 还会先执行 `ensure-extension-stubs.mjs`：`src/extension/` 为空时把 `src/extension-stubs/` 的 31 个 `.ts` 复制进去，保证 `vue-tsc -b` 与 `vite` 不报错。

### 局域网真机调试（`pnpm dev:lan`）

手机连同一个 Wi-Fi，访问终端打印的 `https://192.168.x.x:5177/`，首次会弹证书警告，点「高级 → 继续前往」即可。

**必须走 HTTPS，不能用 HTTP**：`http://192.168.x.x` 不是安全上下文，浏览器会把 `crypto.subtle` 置为 `undefined`；`src/services/encryption.ts` 的 `initCrypto()` 依赖它生成 AES 密钥，而 `src/main.ts` 的 `boot()` 里 `await initEncryption()` 一旦抛错，Vue 根本不挂载 —— 表现为**完整白屏**，控制台只有一条 `Uncaught (in promise)`，堆栈指向 `encryption.ts`。HTTPS（哪怕用的是自签证书、点了「继续访问」）仍然算安全上下文，`crypto.subtle` 与 `navigator.clipboard` 都正常。

实现：
- `scripts/dev-lan.mjs` 检测局域网 IPv4（优先 `en0`，排除 utun/bridge/awdl 等虚拟网卡）→ 用 openssl 自签证书（SAN 含 `localhost`、`127.0.0.1` 与当前局域网 IP，有效期 365 天）→ 启动 `vite.lan.config.ts`。
- 证书放 `.dev-cert/`（已 gitignore）。`meta.json` 记着签给哪个 IP，**换网络后自动重签**（IP 变了 SAN 就对不上，手机仍会拦）。
- 端口默认 5177，可用 `RMD_LAN_PORT` 覆盖。
- `vite.lan.config.ts` 用 `mergeConfig` 继承主配置，只覆盖 `server` 段；`mergeConfig` 会整体替换 `server.proxy`，所以 `/api/leta` 代理要在该文件里重写一遍。

## 代码规范

### ESLint 规则

- `prefer-const`: 强制使用 const
- `no-var`: 禁止 var
- `no-console`: 仅允许 console.warn 和 console.error
- `@typescript-eslint/no-explicit-any`: 警告（尽量避免 any）
- `@typescript-eslint/no-unused-vars`: 警告（`_` 开头的变量/参数忽略）
- `vue/multi-word-component-names`: 关闭
- `vue/no-v-html`: 关闭（项目需要 v-html 渲染 Markdown）
- 浏览器 globals 通过 `globals` 包一次性导入（`globals.browser` + `globals.es2022`），不要在 `eslint.config.js` 手动列举 DOM 全局变量

### 错误处理规范

- **禁止 `catch (e: any)`**，统一使用 `catch (e: unknown)`
- 提取错误消息用 `getErrorMessage(e: unknown, fallback?: string)`（`src/utils/helpers.ts`），自动处理 `Error` / `string` / `{message}` 三种形态
- 不要写 `e?.message || '...'`，用 `getErrorMessage(e, '...')` 替代

### Prettier 规则

```json
{
  "semi": false, // 不加分号
  "singleQuote": true, // 单引号
  "tabWidth": 2, // 2 空格缩进
  "trailingComma": "all", // 尾逗号
  "printWidth": 100, // 行宽 100
  "bracketSpacing": true, // 括号空格
  "arrowParens": "always", // 箭头函数参数加括号
  "endOfLine": "lf" // LF 换行
}
```

## 命名规范

### 文件命名

| 类型       | 格式                  | 示例                 |
| ---------- | --------------------- | -------------------- |
| Vue 组件   | PascalCase            | `DarkModeToggle.vue` |
| 组合式函数 | camelCase（use 前缀） | `useTheme.ts`        |
| 工具函数   | camelCase             | `inlineFormat.ts`    |
| 路由       | camelCase             | `index.ts`           |
| 样式       | kebab-case            | `style.css`          |

### 代码命名

| 类型      | 格式                   | 示例                           |
| --------- | ---------------------- | ------------------------------ |
| 变量/函数 | camelCase              | `formatText`, `isDark`         |
| 类型/接口 | PascalCase             | `ThemeColors`, `CalloutConfig` |
| 常量      | UPPER_SNAKE_CASE       | `DEFAULT_THEME`                |
| CSS 类名  | kebab-case（Tailwind） | `bg-white`, `text-gray-500`    |
| 私有属性  | `_` 前缀               | `_m`, `_p1`（正则回调参数）    |

## Vue 组件规范

### 基本结构

```vue
<script setup lang="ts">
// 1. 导入
import { ref, computed, watch, onMounted } from 'vue'
import SomeComponent from './SomeComponent.vue'

// 2. Props 定义
const props = defineProps<{ title: string }>()

// 3. Emits 定义
const emit = defineEmits<{ change: [value: string] }>()

// 4. 响应式状态
const count = ref(0)

// 5. 计算属性
const doubled = computed(() => count.value * 2)

// 6. 方法
function increment() {
  count.value++
}

// 7. 生命周期
onMounted(() => {
  // 初始化
})
</script>

<template>
  <div>{{ title }}: {{ doubled }}</div>
</template>
```

### 关键规则

- **始终使用 `<script setup>`**，不要用 Options API
- **Props 用类型声明**：`defineProps<{ ... }>()`
- **Emits 用类型声明**：`defineEmits<{ ... }>()`
- **组件引入后直接使用**，无需注册
- **模板中使用 kebab-case 组件名**：`<dark-mode-toggle />`
- **Vapor 编译模式**：绝大多数组件使用 `<script setup vapor lang="ts">`（75 个 `.vue` 里 73 个已开）。**只在 SFC 上写 `vapor` 属性逐文件开启，不要在 `vite.config.ts` 里全局开**——全局开会让报错一次性全冒出来，很难定位。开启前必须知道三条硬约束（都是运行时才报错，编译期完全干净）：
  1. **不能用 `$router` / `$route` / `$refs` / `$el`**（`app.config.globalProperties` 在 Vapor 组件里不生效）。模板里改成 `useRouter()` 拿到的 `router.push(...)`。`$props` / `$emit` / `$attrs` / `$slots` 是支持的（在 `@vue/compiler-vapor` 的 `canPrefix()` 白名单里）。
  2. **自定义指令必须是函数式** `(el, value, arg, modifiers) => cleanup`，对象式 `{ mounted() {} }` 会报 `Received a VDOM object directive ... in a Vapor template`。
  3. **`InstanceType<typeof X>` 对 vapor 组件失效**（函数式组件没有构造签名，报 TS2344），改用暴露方法的形状：`ref<{ open: () => void } | null>(null)`。
  两个例外文件**不要开 vapor**：`SettingsBoard.vue`（卡片是静态插槽内容，交给 `MasonryFlow` 这个 VDOM 组件分列；vapor 父组件传给 VDOM 子组件的插槽拿不到可用 vnode，瀑布流会退化成单列）、`MasonryFlow.vue`（普通 `<script>` + render 函数，vapor 要求 `<script setup>`）。

## TypeScript 规范

- **严格模式**已开启（`strict: true`）
- **避免 `any`**，用 `unknown` 或具体类型替代；`catch` 子句必须用 `unknown`
- **正则回调参数**用 `_m`, `_p1`, `_p2` 命名（仅匹配但不使用时）
- **正则回调参数若实际有使用**，去掉 `_` 前缀（如 `(_match, label, url, desc) =>` 中 `label` 被使用就命名 `label` 而非 `_label`）
- **工具函数导出**用 `export function`，不用 `export default`
- **类型定义**集中在文件顶部或独立类型文件中

## 样式规范

### Tailwind CSS 4

- 优先使用 Tailwind 工具类，避免自定义 CSS
- 自定义样式写在 `<style scoped>` 中
- 全局样式写在 `src/styles/style.css`
- 主题色一律走 CSS 变量 `var(--accent)` / `var(--accent-dark)` / `var(--accent-light)` / `var(--accent-border)` / `var(--accent-rgb)`，不要硬编码色值

### 主题色系统

主题色通过 `useTheme()` composable 获取，包含以下属性：

```typescript
interface ThemeColors {
  accent: string // 主题强调色（如 #6366f1）
  dark: string // 深色变体
  light: string // 浅色变体
  rgb: string // RGB 值（如 "99,102,241"）
  border: string // 边框色
}
```

预设色板 `THEMES` 共 15 款（自定义色走 `isCustom` 分支）；编辑器代码高亮主题另有 10 套（默认 / GitHub Light / Solarized Light / Material Light / One Dark / GitHub Dark / Solarized Dark / Material Dark / Dracula / Monokai）。

### 行内格式化语法

在 `src/utils/inlineFormat.ts` 中定义（`inlineFormatOptions` 同时驱动工具栏按钮）：

| 语法                  | 效果             | HTML 输出                                          |
| --------------------- | ---------------- | -------------------------------------------------- |
| `==文字==`            | 渐变背景         | `<span style="background:linear-gradient(...)">`   |
| `::文字::`            | 柔光重点         | `<span style="color:...;font-weight:700">`         |
| `!!文字!!`            | 胶囊文字         | `<span style="background:...;border-radius:20px">` |
| `^^文字^^`            | 上标强调         | `<strong style="color:...">`                       |
| `__文字__`            | 下划线           | `<span style="text-decoration:underline">`         |
| `~~文字~~`            | 删除线           | `<del>`                                            |
| `**文字**`            | 加粗             | `<strong>`                                         |
| `*文字*`              | 斜体             | `<em>`                                             |
| `***文字***`          | 加粗斜体         | `<strong><em>`                                     |
| `` `文字` ``          | 行内代码         | `<code>`                                           |
| `$公式$`              | 行内公式         | MathJax SVG                                        |
| `<sup>` `<sub>` `<u>` | 上标/下标/下划线 | 对应 HTML 标签                                     |
| `<text ...>`          | 行内文本样式     | 见 Text_DA01 属性表                                |
| `![alt](src)[W H]`    | 图片             | 方括号内为尺寸后缀语法                             |
| `[text](url "desc")`  | 脚注引用         | 带引号标题的链接自动转为脚注，文末生成参考资料     |

### 块级组件语法

在 `src/extension/` 目录下定义（闭源子模块），通过 `<tag>` 标签使用：

| 标签             | 组件 id 前缀       | 说明                                                                                 |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `<title>`        | `Title_DA01/02`    | 标题卡片，两种样式                                                                   |
| `<p-title>`      | `PTitle_DA01/02`   | 段落标题：`num` 序号 / `title` / `subtitle` / `level`（1–4）                         |
| `<reading-path>` | `ReadingPath_DA01` | 阅读路线导航，依据文内标题自动生成                                                   |
| `<statement>`    | `Statement_DA01`   | 居中强调语                                                                           |
| `<lead>`         | `Lead_DA01`        | 引导文字段                                                                           |
| `<breaking>`     | `Breaking_DA01`    | 突发/重大更新卡片                                                                    |
| `<compare>`      | `Compare_DA01/02`  | Before/After 对比布局，两种样式                                                      |
| `<cta>`          | `CTA_DA01`         | 行动召唤卡片                                                                         |
| `<steps>`        | `Steps_DA01/02`    | 横向步骤流，两种样式                                                                 |
| `<timeline>`     | `Timeline_DA01`    | 时间线组件（内部可嵌 `<img>`）                                                       |
| `<engage>`       | `Engage_DA01/02`   | 互动引导组件，两种样式                                                               |
| `<case-flow>`    | `CaseFlow_DA01`    | 实践案例流程                                                                         |
| `<badges>`       | `Badges_DA01`      | 彩色标签徽章                                                                         |
| `<table>`        | `Table_DA01`       | 表格扩展，支持 `{col:N}` / `{row:N}` / `{cover}` 合并                                |
| `<img>`          | `Img_DA01`         | 单图：src / alt / desc / width / height / radius / fit / align / left / top / shadow |
| `<slider>`       | `Slider_DA01`      | 图片幻灯片轮播，4 种模式（循环 / 来回 / 滚回 / 淡入淡出）                            |
| `<chart>`        | `Chart_DA01`       | 图表组件                                                                             |
| `<mermaid>`      | `Mermaid_DA01`     | Mermaid 图表                                                                         |
| `<row>`          | `Row_DA01`         | 横向布局                                                                             |
| `<column>`       | `Column_DA01`      | 纵向布局                                                                             |
| `<container>`    | `Container_DA01`   | 通用容器，支持递归嵌套                                                               |
| `<stack>`        | `Stack_DA01`       | 层叠舞台容器，内部递归解析 Markdown                                                  |
| `<positioned>`   | `Positioned_DA01`  | 定位子层，仅可在 `<stack>` 内使用                                                    |
| `<text>`         | `Text_DA01`        | 文本样式容器                                                                         |
| `<html>`         | `Html_DA01`        | 直通 HTML 片段                                                                       |

> 组件编号规则：`{组件类型}_{D|C}{A-Z}{01-99}`，`D` = Default、`C` = Custom。
> 同一 `tag` 可有多个 id（多个变体，如 `Title_DA01` / `Title_DA02`），`tagMap` 只保留最后一个。

## 子模块机制

项目包含三个 git 子模块，均为闭源私有：

| 子模块路径           | 用途                       | Fallback                                               |
| -------------------- | -------------------------- | ------------------------------------------------------ |
| `src/extension/`     | 排版组件库（30 个组件）    | 重定向到 `src/extension-stubs/`（render 返回空字符串） |
| `src/views-private/` | 私有首页 / 素材库 / 帮助页 | 重定向到 `src/views/`（公开版首页、帮助、素材）        |
| `src-tauri/`         | Tauri Rust 桌面端源码      | 无（仅桌面构建需要）                                   |

### Fallback 策略

`vite.config.ts` 在构建时检测 `src/extension/` 和 `src/views-private/home/HomePage.vue` 是否存在：

```typescript
const extensionDir = `${__dirname}/src/extension`
const hasExtension =
  existsSync(extensionDir) && readdirSync(extensionDir).filter((f) => !f.startsWith('.')).length > 0

const privateHomeFile = `${__dirname}/src/views-private/home/HomePage.vue`
const hasPrivateHome = existsSync(privateHomeFile)

export default defineConfig({
  resolve: {
    alias: [
      // 必须用数组形式确保 @/extension 优先于 @
      ...(!hasExtension ? [{ find: '@/extension', replacement: '/src/extension-stubs' }] : []),
      ...(!hasPrivateHome ? [{ find: '@/views-private', replacement: '/src/views' }] : []),
      { find: '@', replacement: '/src' },
    ],
    // .ts 优先于 .js，避免旧的 .js 残留文件被优先加载
    extensions: ['.ts', '.mts', '.js', '.mjs', '.jsx', '.tsx', '.json'],
  },
})
```

### Stub 结构

`src/extension-stubs/` 含 31 个 `.ts` 文件（30 个组件 + `index.ts`），每个组件导出与 `extension/` 同名的 `ComponentDef` 对象，`render` 返回空字符串。`index.ts` 导出与 `extension/index.ts` 一致的 `ComponentDef` 接口、`components[]`、`componentMap`、`tagMap` 及独立组件。

> ⚠️ 已知偏差：stubs 的 `components[]` 目前只有 28 条，缺 `Stack_DA01` / `Positioned_DA01`（两个文件本身存在且已导出）。新增组件后需同步补进 `components[]`。

### 子模块更新

```bash
# 初始化 / 更新所有子模块
pnpm sm:update
# 或
bash update-submodules.sh
```

> ⚠️ `update-submodules.sh` 内的 `ROOT` 仍是旧机器路径（`/Users/xuepingmao/miclaw/project/r-markdown`），在新目录下执行会失败；脚本只做 `fetch` + `checkout origin/main`，不 commit / push。

### 依赖

- `@types/node` 需安装（用于 `existsSync` / `readdirSync` / `__dirname`）

## Git 工作流

### 分支策略

- `main`: 生产分支，只接受合并，不直接提交
- `develop`: 开发分支，日常开发在此分支
- 功能分支从 `develop` 创建，完成后合并回 `develop`

### 提交规范

```
<type>: <subject>

type 类型：
  feat     新功能
  fix      修复
  style    样式调整（不影响逻辑）
  refactor 重构
  docs     文档
  chore    构建/工具变更
```

示例：

```
feat: 添加时间线组件
fix: 修复渐变背景文字颜色不显示
style: 调整深色模式下卡片边框颜色
```

### Tag 规范

格式：`v{major}.{minor}.{patch}`

示例：`v0.4.3`

> 打 tag 前先确认版本号四处一致：`package.json`、`README.md` 首行、`DEVELOPMENT.md` 首行，以及子模块的 `src-tauri/tauri.conf.json`（同一子模块里的 `Cargo.toml` / `Cargo.lock` 也要跟着改）。`build-desktop.yml` 会以 tag 版本生成 `latest.json`。

### ⚠️ Git 操作规则（强制）

**commit 与 push 均需用户明确指示，AI 不得自行执行。**

- 提交（commit）：用户明确说"提交"、"commit"、"提交一下"等指令后才执行
- 推送（push）：用户明确说"推送"、"push"、"推到线上"等指令后才执行
- 合并（merge）到 main 分支也需要用户确认后才执行
- 删除远程 tag、强制推送、重置等破坏性操作同理，需用户明确确认
- 无论哪个分支（main / develop / 功能分支），规则一致

### 发布流程

> 以下每一步均需用户明确指示后才执行，AI 不得自行 commit / push / merge / tag。

**顺序不能反：先子模块、后主仓。** 主仓里的子模块指针必须指向子模块 `main` 上真实存在的 commit；先合主仓的话，指针会落在子模块 develop 的提交上，CI 的 `checkout submodules` 直接失败。

```bash
# 1. 在 develop 分支开发（用户指示"提交"后执行 commit）
git add .
git commit -m "feat: xxx"

# 2. 用户确认后，逐个把子模块的 develop 合进各自 main 并推送
#    能快进就 --ff-only；各自 main 上已有合并提交时（历史遗留）改用 --no-ff
git -C src-tauri checkout main && git -C src-tauri merge --ff-only develop
git -C src-tauri push origin main
git -C src/views-private checkout main && git -C src/views-private merge --no-ff develop
git -C src/views-private push origin main
#    src/extension 视有无改动决定；它 main / develop 目前指向同一 commit

# 3. 用户确认后合并主仓到 main
git checkout main
git merge --no-ff develop        # 先加 --no-commit 试跑，确认无冲突再真合

# 4. 核对主仓的子模块指针落在子模块的 main 上（不是 develop）
git ls-tree HEAD src-tauri src/extension src/views-private
git -C src-tauri rev-parse origin/main           # 与上面第二列逐行比对
git -C src/views-private rev-parse origin/main
#    不一致就显式改指针：
#    git update-index --cacheinfo 160000,<子模块 main 的 commit>,src/views-private

# 5. 推送 main
git push origin main

# 6. 用户确认后打 tag（用附注 tag，v0.4.9 起统一如此；轻量 tag 只有 v0.4.4–v0.4.8）
git tag -a v0.x.y -F -           # 正文写本次发版条目
git push origin v0.x.y

# 7. 三个子模块的本地检出切回 main，避免工作区停在 develop 造成的困惑
for d in src-tauri src/extension src/views-private; do git -C "$d" checkout main; done
git submodule status             # 三行都应是干净状态，前面没有 +/- 号

# 8. 退回 develop 继续开发
git checkout develop
git push origin develop
```

> 版本号要改**四处**，常被漏掉的是文档那两处：`package.json`、`README.md` 首行、`DEVELOPMENT.md` 首行，以及子模块内的 `src-tauri/Cargo.toml` / `Cargo.lock` / `tauri.conf.json`。锁文件 `package-lock.json` / `pnpm-lock.yaml` 不参与版本 bump。
>
> **子模块的 main / develop 可能指向同一 commit**，此时指针写哪一个都一样——`src/extension` 目前就是这种状态。判断依据是 `git rev-parse origin/main` 与 `origin/develop` 是否相等，不是本地检出的分支名。
>
> 打 tag 后 `build-desktop.yml` 自动构建并在 Release 里按 tag 正文生成条目；`deploy.yml`（GitHub Pages）是 `workflow_dispatch` 手动触发，要发站点得自己跑一次。

## 构建与部署

### Web 版

```bash
pnpm build
```

构建产物在 `dist/` 目录。

### 桌面客户端

```bash
pnpm tauri:build
```

构建产物：

- macOS: `src-tauri/target/release/bundle/dmg/R-Markdown_*.dmg`
- Windows: `src-tauri/target/release/bundle/msi/R-Markdown_*.msi`

### CI/CD

项目配置了两条 GitHub Actions 工作流，均在 `.github/workflows/` 下：

| 文件                | 触发条件                        | 用途                                                          |
| ------------------- | ------------------------------- | ------------------------------------------------------------- |
| `deploy.yml`        | 手动触发（`workflow_dispatch`） | 构建 Web 版并部署到 GitHub Pages                              |
| `build-desktop.yml` | 推送 `v*` 标签或手动触发        | 构建 macOS (aarch64) + Windows (x64) 桌面客户端并发布 Release |

**重要配置说明**：

- `vite.config.ts` 中 `base` 路径区分三种场景：Web 部署（`/r-markdown/`，`GITHUB_ACTIONS` 且非 Tauri）、桌面构建（`./`，`VITE_TAURI`）、本地开发（`/`）
- 桌面构建使用 `cross-env` 确保跨平台环境变量兼容
- 发布时 `Cargo.toml` 中 `[lib] name` 必须为 snake_case（`r_markdown_lib`）
- 桌面客户端无代码签名，macOS 安装后需执行 `sudo xattr -rd com.apple.quarantine /Applications/R-Markdown.app` 放行
- 每次发布桌面客户端需同步更新 `tauri.conf.json` 的 `version` 字段与 git tag 一致
- 百度统计 ID 支持环境变量覆盖（`BAIDU_CF_ID` / `BAIDU_GH_ID`），未设置时使用默认值；`CF_PAGES` 存在走 CF ID，否则 GitHub Actions 部署走 GH ID，本地不注入
- 桌面端发布需要签名密钥（`TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD`），`build-desktop.yml` 会用 `tauri signer sign` 为 updater 包生成 `.sig`，并汇总生成 `latest.json` 供应用内自动更新读取

### 在线服务

| 服务                  | 位置                              | 用途                                            |
| --------------------- | --------------------------------- | ----------------------------------------------- |
| Cloudflare Pages 主站 | `r-markdown.pages.dev`            | 网页版主站；`functions/api/leta` 代理乐塔图床   |
| Cloudflare Worker     | `worker/index.ts`                 | GitHub API 代理（素材库发布），Token 仅存服务端 |
| GitHub Pages          | `RobocopMao.github.io/r-markdown` | 备用网页版，`deploy.yml` 手动部署               |

Worker 的 CORS 白名单为 `https://robocopmao.github.io`、`https://r-markdown.pages.dev` 及 `*.r-markdown.pages.dev` 分支预览，桌面端通过 `r-markdown-secret` 请求头鉴权。两个 secret 用 `wrangler secret put` 设置，不进仓库：

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put DESKTOP_SECRET
```

### 预览构建产物

```bash
pnpm preview
```

## 注意事项

1. **不要手动编辑 `.vue.js` / `src/**.js`文件**：这些是 IDE 或 vue-tsc 增量编译生成的临时产物，已在`.gitignore`中排除，并由`pnpm clean` 在 dev/build 前自动清理
2. **不要提交 `src/**/\*.js`文件**：TypeScript / Vue 编译产物，已在`.gitignore` 中排除
3. **修改行内格式化语法后**：同步更新本文档的语法对照表
4. **新增组件后**：同步更新本文档的目录结构、组件语法表，并补进 `src/extension-stubs/index.ts` 的 `components[]`（当前缺 `Stack_DA01` / `Positioned_DA01`）
5. **新增设置项后**：只需在 `src/config/defaults.ts` 加一行，`initSettings()` 会自动为旧用户补默认值；敏感字段（如 `aiApiKey`）记得加进 `settings.ts` 的 `SENSITIVE_KEYS`
6. **构建前确认**：确保 `pnpm check` 通过，无 ESLint/Prettier 错误
7. **多语句内联 handler**：Vue 模板中 `@click="a = 1; b = 2"` 这类带分号的多行内联 handler 会被 Prettier（`"semi": false`）移除分号导致 rolldown 解析失败。多语句 handler 一律提取为具名函数（参考 `EditorPage.vue` 的 `onTagDialogClose` / `onSettingsClose`）
8. **标题层级只改一处**：`#` 与 `<p-title level="N">` 的上限与默认值统一来自 `src/utils/headingLevels.ts`，不要在其他文件硬编码（历史上已漂移过一次）
9. **字数统计不要用正则粗暴匹配 `---`**：正文里的水平分割线也是 `---`，`charCount.ts` 只把首个非空行是 `---` 的情况当作 front-matter
10. **文章文件名不要直接拼 `node.id`**：`node.id` 是唯一索引（被 IndexedDB 缓存 key、`cloudArticleId`、命令面板持久化引用，**必须保持稳定**），实际文件名可能已按设置 `articleFileNaming` 改为「文章名-短哈希」。凡是要读写文章文件的地方，一律走 `resolveArticleFileBase(node)`（`src/utils/articleNaming.ts`）并把它作为 `fileBase` 参数传给 `fetchArticle` / `saveArticle` / `deleteArticle`；GitHub 侧路径还需 `encodeURIComponent`（中文标题必需）。tree.json 的可选字段 `node.file` 记录实际文件名，缺省即回退 `{id}.md`（兼容旧数据）
11. **Tauri 开发**：
    - 前端代码中的 Tauri API 调用须通过 `import.meta.env.VITE_TAURI === 'true'` 守卫，确保 Web 版不受影响
    - 修改 `Cargo.toml` 中 `[lib] name` 后须同步修改 `src-tauri/src/main.rs` 中的 crate 引用
    - 首次构建桌面端需安装 Rust 工具链（[rustup.rs](https://rustup.rs)）
12. **Node 版本**：项目要求 Node.js >= 24，使用 nvm 管理版本：
    ```bash
    nvm install 24
    nvm use 24
    ```
13. **AI 排版的组件规范**：`src/data/ai/r-markdown-formatter/format-spec.md` 是 prompt 中的「唯一排版标准」，与 `r-markdown-formatter` skill 同源。更新规范时手动重拷该文件并保留顶部来源注释块（读取方 `aiFormatPrompt.loadFormatSpec()` 会剥离注释，正文需与源文件逐字节一致）；可用组件白名单以 `@/extension` 的 `components[]` 与 `markdownParser` 的实际分支为准，不要只改规范文档
14. **新增 AI 配图厂商只改一处**：各厂商参数不一致（尺寸是档位还是像素、宽高比是否独立字段、返回 url 还是 base64），差异全部收在 `src/services/imageProviders.ts` 的 `IMAGE_PROVIDERS` 里——加一条 `ImageProviderDef`（含 `buildBody` / `parseResponse`）即可，设置页与配图面板的字段由该描述渲染，调用层不得出现 `if (厂商 === 'xxx')`。配置按厂商存于设置 `imageGenProviders`（敏感字段，整体加密）；读取一律走 `getProviderConfig()`，不要直接读设置对象，否则拿不到默认值合并与非法值纠正。能力字段全部可选、**不声明即不渲染对应控件**：`customSize`（`{ min, max, step }`，声明后比例下拉末尾追加 `CUSTOM_RATIO`「自定义」，面板把「分辨率」换成宽高两个输入框并按 `step` 对齐）、`qualities` / `defaultQuality`、`backgrounds` / `defaultBackground`、`moderations` / `defaultModeration`（每项都是 `ImageOption[]` + 默认值）；只给默认值、不给选项表时视为**固定参数**——面板不渲染控件，请求里恒发该值（GPT-Image-2.5 的审核强度就是这样固定为 `low`，官方默认的 `auto` 更严但不是我们要的）。像素尺寸**有且只有一份换算**：`resolveOutputSize(def, cfg)` 产出 `{ pixels, label }`——`pixels` 是官方 `size` 字段要的 `1024x1024` 写法（字母 x），`label` 是给人看的 `2K · 2048x1152`；面板显示、`buildBody`、`optimizeImagePrompt` 的尺寸描述都取这一个，不要各自拼。GPT-Image-2.5（`gpt-image-2.5-flare` / `gpt-image-2.5-sunburst`）严格按官方 `/v1/images/generations` 发 `model` / `prompt` / `size` / `quality` / `background` / `moderation`（不发 `n`、不发 `output_format`，官方默认 png 正好满足透明背景），中转站与官方同一套字段；尺寸表 `GPT_IMAGE_SIZE_TABLE` 是 15 比例 × 1K/2K/4K，**所有边长都是 16 的倍数**，自定义宽高也按 16 对齐（不对齐时部分中转站直接 422）。模型名「是否支持」由 `modelIdValid`（正则）/ `modelIdWarn`（文案）声明，**一个正则管两处**：（1）「获取模型列表」时 `listImageModels(cfg, modelIdPattern, modelIdValid)` 直接把不合规的模型过滤掉——中转站的 `/models` 把几十个别家图像模型一起列出来，全塞进勾选清单只会让人选错、生成才失败；返回空且原本有图像模型时提示「没有本厂商支持的型号」。（2）**手填**的模型名不受过滤限制（中转站常漏项、常改写法，写死过滤会挡住能用的配置），所以对整份已选清单再提示一行黄字，带 `isSupportedImageModel(def, model)` 判断并把具体是哪几个名字点出来，文案用「手填的 xxx 可能不支持」。两处判断共用同一个 helper，别各写一份正则。正则必须**宽松的包含式匹配**、不带 `^$`：各家写法不统一（`openai/gpt-image-2.5-flare`、`gpt-image-2.5-flare-20251001`、`gpt_image_2_5_flare`、`gpt image 2.5 sunburst`、`:free` 后缀都要认），分隔符用 `[-_ ]?` / `[._-]` 这类可选写法；末尾记得加 `(?![a-z])`，否则 `gpt-image-2.5-flareless` 也会命中。**两处都只提示/过滤、不阻止保存**。有的中转站（APIMart）不在提交时回图，而是回 `task_id`，要再查任务接口——这类差异收在 `IMAGE_RELAYS` 的 `ImageRelayDef` 里（`taskPath` / `pollIntervalSec` / `statusText` / `parseTaskId` / `parseTask` / `apiError?` / `qualities?` / `modelList?` / `probePath?`），**新增一家中转站 = 加一条**，设置页的「中转站」下拉（位于厂商下拉之后、接口地址之前，`relays` 为空则不渲染）与 `imageGen.ts` 的轮询都自动生效，`ImageRelayDef.baseUrl` 有值时选中即自动填进接口地址；配置项 `relay` 存它的 id，**空串＝按标准同步接口处理**（默认值就是空串，所以旧配置与官方直连都不受影响）。轮询与提交共用同一个 `timeoutSec` 总时长，中止走同一个 signal；`parseTask` 必须把终态写进 `done` / `failed`（只看「有没有 url」会让对方回 completed 却没给图时一直轮询到超时）；结果字段形状各家不同：APIMart 是 `result.images[0].url[0]`（字符串数组），多米API 是 `data.images[0].url`（单个字符串）、状态在 `state` 且成功态叫 `succeeded`。`apiError?(json)` 用来识别**「HTTP 200 但响应体里其实是错误」**的站点：多米API 把 Key 错误（`code:403` 请求密钥KEY不正确）与余额不足（`code:400`）都包在 200 里，不拦一道的话提交会被当成「没给任务 id 的同步响应」、查询会被当成「还在跑」直到超时，报错都与真实原因无关；命中时**直接把对方的 `msg` 抛给用户**，别在客户端猜是哪类问题。`qualities?` 让中转站声明的档位**收窄**厂商那一套（多米API 只有 low / medium / high，没有 xhigh / max）。`modelList: false` 声明该站没有 `/models` 列表接口（多米API 实测 404），设置页据此**藏掉「获取模型列表」按钮**并换成一句手填说明——留个按下去必然失败的按钮只会让人怀疑地址或 Key 填错了；`probePath` 则给这类站提供「测试连接」的探活路径（查一个**不存在**的任务，Key 有效时对方会老实回「任务不存在」），不声明就退化为拉一次 `/models`。判断标准只看鉴权类与 5xx（401/403/≥500 才算失败），「任务不存在」说明路由通、Key 也过了。**同一家站一个模型族挂几条线路、能力天差地别时用 `modelRules`**：`ImageRelayModelRule[]`，每项 `{ match: RegExp, overrides?, buildBody? }`，按顺序匹配、**第一条命中的生效**（更具体的写前面，兜底一条 `match: /.*/` 放最后）；差异只体现在模型名上，所以规则只能按模型名匹配。ToAPIs 就是三条线：`-vip` / `-official` 是官方口径的完整能力（像素尺寸、六档质量、透明背景），普通版只认 10 种比例、必须发 `size: 比例 + resolution: 档位`、`quality` 传了也被静默忽略、`transparent` 出来是 RGB PNG（alpha 丢失）——而且普通版传像素是**先提交成功、约 45 秒后任务才 failed**，所以差异必须提前体现在面板上，不能等服务端报错。`overrides` 里 `ratios` 收窄比例、`customSize: null` 是显式「这条线路不收像素」（与 `undefined` 未声明、沿用厂商不同，**不能用 `??` 一把合并**，得用 `'customSize' in overrides` 判断）、`qualities: []` 表示没有画质可调、`backgrounds` 缺 `transparent` 表示留不住 alpha、`pixelFree: true` 表示按「比例 + 档位」出图由上游定像素。**能力必须只有一个来源 `resolveCapabilities(def, relayId, model)`**（返回 `ratios` / `customSize` / `pixelFree` / `qualities` / `backgrounds` / `buildBody?`）：`normalizeConfig()` 的收敛口径、面板下拉列什么、`resolveOutputSize()` 怎么算、请求体用哪个 `buildBody`，全都读它，否则会出现「下拉里有 max、存进去被收敛成 low」这种自相矛盾的界面。`pixelFree` 时 `resolveOutputSize()` 返回的 `pixels` 是空串，**这不是错误状态**（上游会按档位自己定像素，且未必等于本地尺寸表那一格，例如 ToAPIs 的 2K + 16:9 出 2560×1440 而不是 2048×1152），界面靠 `pixelFree` 区分「别生成」与「照常生成」，`buildBody` 也改用 `size: 比例` + `resolution: 档位`。线路专属的请求体走 `caps.buildBody ?? def.buildBody`
15. **AI 配图的图片落地不另起一套**：生成结果只产出 `File` 并交给 `useImageInsert`；`processImageInsert()` 按「图片设置 → 粘贴/拖拽上传方式」走本地存储 / 本地磁盘 / GitHub / 乐塔四条既有链路，`uploadImageToHosting()` 走图床那条，`insertImageToDisk()` 固定走本地磁盘（面板里的「保存磁盘并插入」，**仅桌面端显示**，`import.meta.env.VITE_TAURI === 'true'`）。不要在配图面板里判断存储方式、压缩或上传，否则两处行为会漂移。**磁盘落盘的压缩参数 / 大小上限 / img 标签格式只有 `insertImageToDisk()` 一份**——它同时服务粘贴、图库选图与 AI 配图三个入口，改一处三处生效。**压缩口径本身收敛在 `prepareGalleryFile()`（图库/IndexedDB，5MB）与 `prepareDiskFile()`（磁盘，10MB）两个 helper**：凡是「要把 File 存进图库/磁盘」的路径都调它们，不要再各写一遍 `compressQuality` + 上限判断。
    - **「只落地、不插入」与「落地并插入」是两组动作**：`insertImageToDisk()` / `processImageInsert()` 会往光标处插 `<img>`；`addImageToGallery()` / `addImageToDisk()` 只写库/写盘、返回 `boolean` 表示成功与否，**不碰编辑器内容**（AI 配图结果区的「添加到图库 / 添加到磁盘」就是后者）。想让用户「先攒着、晚点挑一张插」时用后者，别为了复用去调前两个——那会顺带把图插进正文，用户点两下就重复插两张。**压缩对 PNG 输入必须保留 PNG 编码**：`compressImage()` 曾一律 `canvas.toBlob(..., 'image/jpeg')`，透明背景的图落地就被压成 JPEG、alpha 变黑底；现在输入是 `image/png` 且尺寸在上限内时走 `encodeCanvas(canvas, 'image/png', 1)` 原样产出 PNG，只有超上限才退回 JPEG 二分压缩。新增任何压缩入口都要守这条，否则「背景：透明」出来的图在插入后就不透了
    - **`<img>` 必须独占一行，插入入口走 `insertOwnLine()`**：`markdownParser.ts` 只有 `if (/^<img\s/.test(line.trim()))` 才把图片渲染成独立的 `Img_DA01` 块，否则 `<img>` 会被当行内内容塞进相邻的 `<p>`，视觉上就黏在段落或组件标签（`<badges>`、`<title>`）前后。`Editor.vue` 的 `insertOwnLine(text, from?, to?)` 会按插入点所在行的前后是否有非空白字符决定补不补换行（缩进不算内容，缺哪边补哪边），`useImageInsert` 的 `insertImageTag(tag, insertAt, ownLine)` 再按需分派。**AI 配图的三个插入入口（`processImageInsert` / `uploadImageToHosting` / `insertImageToDisk`）与图库的 `onGalleryInsert` 都传 `ownLine = true`**；粘贴 / 拖拽等其它入口保持默认 `false`，行为不变。
    - **插入前必须挡 `isInsideTag`**：光标落在组件标签内部时插图片会把 `</badges>` 之类的闭合标签劈成两半（`insertOwnLine` 补的换行就插在标签中间）。`processImageInsert` / `insertImageToDisk` / `uploadImageToHosting` / `onGalleryInsert` 四个入口都要有这条守卫，提示「不能在组件标签内插入图片」并**保持面板打开**，让用户挪完光标再插
16. **Agnes 生图必须用 `return_base64: true`，不要用 URL 返回**：`response_format: 'url'` 给出的地址指向 `storage.googleapis.com/agnes-aigc/…`，**该存储域不返回 CORS 头**，浏览器里 `fetch` 它必被拦（网络面板显示 CORS error；`<img>` 能显示但 JS 读不到字节）。用 `return_base64: true` 让图片数据随同一次响应回来，就没有第二个请求。改厂商 def 的 `buildBody` 时注意别退回 URL 模式
17. **保存文件统一走 `src/utils/saveFile.ts`**：桌面端（Tauri）的 WebView 对 blob URL 的 `<a download>` **不生效且不报错**，必须用原生保存对话框（`plugin-dialog` 的 `save()` + `plugin-fs` 的 `writeFile()`）。该工具已封装「桌面端优先、用户取消即返回、插件异常才降级浏览器下载」；新增导出/保存功能一律用它，不要各处再抄一遍（HTML 导出 / 定稿 / 小红书导出三处仍是各自实现，改到时可一并收编）
18. **调用大模型只走 `aiFormat.chatCompletion`**：AI 排版（`formatArticle` 是它的别名）、AI 写作（`services/aiWrite.ts`）、AI 配图的提示词优化都调同一个实现，超时、错误中文映射、SSE 解析只有一份。新增任何「让模型说点什么」的功能一律复用它，不要再写第二份 fetch，否则这些边界处理会慢慢漂移
19. **AI 写作的技能文本是内置副本**：`src/data/ai/khazix/`（`SKILL.md` + `references/`）是 `khazix-writer` skill 的手工拷贝，做法与 `r-markdown-formatter/format-spec.md` 一致——顶部来源注释块记录基线 sha256，读取方 `aiWritePrompt.loadSkillText()` / `loadReferenceText()` 会剥离注释块与 YAML frontmatter（frontmatter 是 DSH 的 skill 路由元数据，进 prompt 只会让模型去描述这个 skill）。**技能原文末尾的「【固定尾部】」必须剥掉**（`stripFixedTail()`）：那是卡兹克本人公众号的模板（求三连、署名「作者：卡兹克」、他的投稿邮箱），用户写的是自己的号，照抄过去就是替别人署名、留别人的邮箱。剥离只发生在读取时，**不要改 `SKILL.md` 本身**（要求与源文件逐字节一致）；契约里也有一节明确禁止署名 / 求关注号召 / 邮箱联系方式——注意写这些条款时**不要原样复述尾部用词**（例如别写「不要出现『作者：卡兹克』」），那等于把要禁的字符串又放回 prompt，用「不要写署名或落款」这种泛化说法。技能更新后手动重拷覆盖并更新注释里的 sha256；这些文件已加进 `.prettierignore`，**不要**让 prettier 重排它们（表格与空行会漂移）
20. **AI 写作是单会话**：全局只有一个「当前会话」（IndexedDB 里固定 key `'current'` 的单条记录）；保留时长口径见第 29 条（**从最后一次请求滑动续期**，不再是「创建时算死的绝对有效期」）；`normalizeSession()` 对过期或结构非法的会话一律返回 `null`，调用方据此新建。稿件不另设数据结构——它就是一条 `kind: 'draft'` 的 assistant 消息，因此历次稿件天然留在对话里。往模型发历史时用 `toHistory()`（assistant 取 `article` 而非带标记的 `content`），旧稿被裁掉不影响改稿：那条请求会把稿件正文显式写进 user message
21. **AI 写作面板的输入框在 `BaseDrawer` 的 `#footer` 插槽**：footer 是 `flex shrink-0 justify-end gap-3 border-t px-5 py-3`，因此里面要放**单个 `w-full` 子元素**再自行分行（`justify-end` 对唯一子元素无影响）。不要把输入框放进 body，否则长对话时会被滚走；也不要为此给 `BaseDrawer` 加新插槽。自动增高由 `autoGrow()` 控制，最小 / 最大高度写成 `INPUT_BASE_MIN/MAX × INPUT_HEIGHT_SCALE`（当前倍率 2，即 76–296px）：**要调高度就改 `INPUT_HEIGHT_SCALE` 这一个数**，不要改成「行数翻倍」——那样最小高度只有 60px（内边距不参与翻倍），与「两倍高」对不上
22. **AI 写作稿件卡的操作按钮在卡片底部，不在顶部**：卡片顺序固定为「头部（稿件 + 字数）→ 正文 → 自检报告 → 操作行（重试自检 / 按自检意见改稿 / 重新生成 / 应用到编辑器）」。曾把操作行放在卡片顶部，它与**上一条回复**紧贴，用户点「应用到编辑器」时会以为填进编辑器的是上一条回答——这不是取值 bug，而是归属歧义。同时**每个操作按钮都必须带 `:disabled="generating"`**（「应用到编辑器」曾漏掉，流式期间可点，会去应用上一稿）。`onApply` / `onConfirmApply` 一律传**消息 id**、由 `doApply(id)` 回到当前 session 里重新取一次消息，不要捕获消息对象：确认弹窗确认期间会话可能已推进，拿旧对象会写进过期正文
23. **块级组件标签的开标签可以跨行，解析统一走 `parseTagSpan()`**：`markdownParser.ts` 里 `<title>` / `<p-title>`（以及 `<reading-path>` 依赖的 p-title level1 收集）都用同一个 `parseTagSpan(startIdx, tagName)`，它逐行拼出开标签并**在扫描 `>` 时跳过引号内的字符**（否则 `subtitle="a>b"` 会被截断在属性值中间），再按嵌套深度收集 body 到闭合标签；**找不到闭合标签时返回 `null`**，调用方退回普通段落，避免把后文整段吞掉。所以 `<title>` / 属性行 / `>` / 标题 / `</title>` 这种「一个标签拆成好几行」的写法也能正常渲染。新增类似的块级标签时不要再用 `^<tag\b([^>]*)>([\s\S]*?)</tag>` 这种单行正则，否则开标签一跨行就整条匹配失败、组件被静默丢掉。
23. **AI 写作稿件预览的排版是「段落设置 + 局部收紧」**：正文比编辑器预览小一号、行距更紧，但**不要**去逐元素覆盖字号——`markdownParser` 把标题 / 列表 / 引用 / 代码的字号写成了内联 px，只有段落走 `ParagraphStyle`，逐类覆盖既脆弱又容易漏。做法是：字号用 `.ai-write-preview` 的 CSS `zoom`（`--ai-write-preview-zoom`，默认 0.94）整体缩一档，行距在 `paragraphStyle()` 里减 `PREVIEW_LINE_HEIGHT_STEP`（0.15，下限 1.2——设置页滑块范围是 1.2–3.0）。`renderedHtml` 按消息 id 缓存，**缓存键必须带上段落设置**（`renderKey()`），否则用户改完字号 / 行距回来看到的还是上一套排版；稿件列表变化只补渲染缺 HTML 的稿子，段落设置变化才整体作废重渲染
24. **打开 AI 写作面板要滚到最底部，靠 `pinToBottom()` 而不是一次 `scrollToBottom()`**：稿件正文是**异步**渲染的（`renderDraft` → `parseMarkdownAsync`），渲染完会把内容撑高；输入框聚焦后还会自动增高、让滚动容器变矮。只设一次 `scrollTop` 会因为晚一拍落下的 reflow 而**差一点没到底**（曾实测差 133px）。做法是 `pinToBottom()` 连续若干帧把 `scrollTop` 顶到底，并用 `ResizeObserver` 同时盯 `contentRef`（内容长高）与 `scrollRef`（容器变矮）——两处都会改变「底部」位置。所有自动贴底都必须受 `stickToBottom` 约束：用户主动上滑后不得把他拽回去，回到底部（滚动到底 80px 内）才恢复跟随
25. **AI 写作面板只有一个技能开关「卡兹克写作技能」（`aiWriteUseSkill`，默认开启）**：它同时管三件事——技能本体 `SKILL.md`、参考资料 `references/`、出稿后的四层自检。这三者**本来就是同一套技能**（四层自检体系写在 `SKILL.md` 第四节里），曾拆成「四层自检」+「附带参考资料」两个勾选框，是误判，已合并。要点：
    - `buildSystem()` 在关掉时给 `buildWriteSystemPrompt` 传 `skill: ''`（参考资料也传空），`buildWriteSystemPrompt` 据此切成中性人设，并去掉「唯一写作标准」「用技能里的收尾方式」这类**指向技能的措辞**——否则 prompt 里会出现「请严格按下面这份技能来写」却什么都没跟，模型会困惑甚至瞎编。
    - 出稿后的质检条件是 `useSkill.value`（不再是独立的 `selfCheck`）。
    - 勾选状态用 `setSetting(..., true)` 静默写回，外部写入由 `onSkillChanged` 同步回本地 ref，**打开面板时必须重新读一遍设置**，否则面板显示的选择会与实际拼进 prompt 的值不一致。
    - `getSkill()` / `getRefs()` 是模块级 Promise 缓存，只管加载、不影响是否进 prompt，关掉开关时不必清理。
    - 老 key `aiWriteSelfCheck` / `aiWriteIncludeReferences` 已随合并删除；它们**从未发布过**（新增于同一会话），所以不需要迁移。
26. **设置里的「AI 文本」= 写作 + 排版合并，接口配置共用**：`SettingsBoard` 的 `aiPane` 只有 `'text' | 'image'`（原来的 `write` / `format` 已合并）。接口地址 / API Key / 流式输出写作与排版**共用一份**（`aiBaseUrl` / `aiApiKey` / `aiStream`），只出现一次；模型见第 30 条。`resolveWriteConfig()` 在 `resolveAiConfig()` 之上只覆盖写作与排版不同的采样参数（`aiWriteTemperature` / `aiWriteMaxTokens`）。`text` 子页内用两个 `<section>`（「AI 排版」「AI 写作」）分区展示差异项。子页名与功能名是两套口径：**子页按模态叫「AI 文本 / AI 图片」，功能仍叫「AI 写作 / AI 排版 / AI 配图」**（侧栏入口、面板标题、教程都用功能名）。`initialTab` 约定保留 `'ai-write'` / `'ai-format'` / `'ai-image'` 三个入口，前两个都落到 `text` 子页
27. **「AI 文本」里所有采样参数一律用滑块，样式对齐 `compress-slider`**：「AI 排版」「AI 写作」两个小节的控件必须同款——`class="compress-slider w-full cursor-pointer"` + 标题行 `flex items-center justify-between mb-1`（右侧显示当前值）+ 说明行 `mt-0.5`。写作的「最大输出」曾是 `<input type="number">`，与排版的滑块不一致，已统一改为滑块。写作最大输出的区间常量在 `services/aiWrite.ts`（`MIN_WRITE_MAX_TOKENS` / `MAX_WRITE_MAX_TOKENS` = 1024 / 65536），上限比排版的 1024–32768 更高——长文 + 技能全文 + 参考资料一起算，输出截断是写作最常见的失败；模板里用 `:min` / `:max` 绑定常量，不要写死字面量
28. **AI 写作与 AI 排版面板都不显示「这段 prompt 有多大」的 token 估算（两边都曾有过，均已按要求移除；不要再加回来）**：
    - **AI 写作**（2026-10-15 移除）：曾显示「固定开销约 N tokens」。那段经历了一次修正——最初直接显示 `estimatePromptTokens(buildSystem())`，但四层自检**不改 system prompt**，而是出稿后**另发一次请求**（`runSelfCheck` 复用同一份 system，只把待检文章放进 user），所以勾选自检时数字纹丝不动、看起来像 bug；后来改成 `computed` 并在勾选时 ×2，用户最终决定整个去掉。相关的 `fixedTokens` / `systemTokens` / `refreshFixedTokens` 与 `aiWritePrompt.estimatePromptTokens` 都已删除。
    - **AI 排版**（2026-10-15 稍后移除）：参数行右侧曾显示「规范约 N tokens」（`specTokens` + `estimateTokens(buildSystemPrompt(spec, preset))`，随力度档位变化）。已连同 `specTokens` ref、`preset` watcher 里的重算、以及打开面板时那次「预热并估算」一起删除；`getSpec()` 的预热保留（它是模块级缓存，能省掉点「开始排版」后的等待）。
    - **保留的结论仍然成立**：四层自检会让一轮里的技能全文发两遍（实测两次请求的 system 相同），这是它更慢更贵的真实原因，教程里据实说明了这一点。
    - **注意区分**：排版面板里**生成中**显示的「N tokens」是**流式输出的字数进度**（`estimateTokens(streamingText)`，见 `AiFormatDialog` 的「排版中…」那一行），它反映的是「已经产出多少」，不是「prompt 有多大」——**这个要保留**。判据：跟着 `streamingText` 走的是进度，跟着 `spec` / `preset` 走的是估算。
    - 另注：「自检」现已并入「卡兹克写作技能」开关（见第 25 条），不再有独立的 `selfCheck` ref。
29. **三个 AI 面板的「结果保留」是同一套机制，但保留时长各设各的**：写作 / 排版 / 配图的结果都留在本地，按各自设置项（`aiWriteSessionHours` / `aiFormatSessionHours` / `aiImageSessionHours`，都默认 24h）自动作废。**别再把它们合回一个共用 key**——用户的节奏不同（写作一次聊几十分钟，排版/配图多是生成一次就用掉），共用会逼他折中。倒计时 composable 要显式传入自己那一项的 key（`useSessionCountdown('aiFormatSessionHours')`）。要点：
    - **滑动续期**：`expiresAt` 不是创建时算死，而是**每次发起请求时**推到 `now + 时长`（写作 `renewOnRequest()`、排版 `onGenerate`、配图 `onGenerate` 各调一次）。旧口径「从创建时刻算起的绝对有效期」已废弃——`aiWriteSession` 的旧 `normalizeSession` 曾拿 `createdAt` 当夹取基准，滑动续期下会把正常会话误判成异常，已改成以**最后一次消息时刻**为基准。
    - **共用逻辑**：保留时长的收敛 / 剩余文案 / 过期判定在 `utils/aiSession.ts`；倒计时刷新在 `composables/useSessionCountdown.ts`（每秒 tick，但只在文案真变了才写 ref）。面板自己只维护一个 `resultExpiresAt`。
    - **持久化**：`services/aiSessionStore.ts` 提供 records（JSON：排版文本、配图元信息）+ blobs（配图二进制）两个 store。**写入前必须 `JSON.parse(JSON.stringify())` 深拷贝**，否则响应式代理会触发 DataCloneError。读取时若已过期会顺手删掉记录。
    - **清空**：每个面板头部有「清空结果」，各走一个 `ConfirmDialog` 二次确认，清内存 + 清本地记录（配图还要 `clearAllBlobs()`）。
    - 设置项曾短暂合并成 `aiSessionHours`，现拆回三个独立 key。`initSettings()` 里保留了一段迁移：把那个共用值还给三个面板再删旧 key（装过中间版本的用户 choice 不丢），别删。
30. **模型可以有多份，用「清单 + 当前选择」两层，不要做成单个字符串**：
    - **清单**（能选哪些）：`src/components/ModelMultiSelect.vue` 是唯一的多选控件——已选项以标签呈现可单个移除、**手填入口常驻**（中转站的 `/models` 经常漏项或给一堆加前缀的别名）、下方是可勾选清单。设置页「获取模型列表」查回来的只是 `options`（能勾什么），**已选值不受它限制**，手填的模型照样生效。
    - **没有「默认模型」这一层，清单首项即默认**（用户明确要求去掉那个单独的下拉：「默认模型没有多大用处」）。设置页只维护清单，不再有「默认模型」设置项；「这次用哪个」全由各面板自己的 ref 决定：文本是 `aiWriteModel`（写作）/ `aiFormatModel`（排版），配图是 `ImageGenProviderConfig.model`，**每家厂商一份**。口径统一在三处兜底：`resolveAiConfig(modelOverride?)` → `listTextModels()[0]`、`normalizeConfig()` → `models[0]`、面板 ref 初值/失效后 → `modelOptions[0]`。
    - **切换后会保持**：面板换模型就 `setSetting` 落盘（配图走 `setProviderConfig`），下次开面板还是它；只有值不在清单里了才落到清单首项。别改成「每次打开都重置成首项」，那等于把刚做的选择丢掉。
    - **面板下拉只列具体模型，不提供「默认」这种伪选项**：三个面板原先都有 `<option value="">默认（xxx）</option>`，已全部删除——一个下拉里混着"某个模型"和"回去看设置"两种语义，用户选完不知道这次到底发哪个。现在面板的 ref 初始化为 `aiWriteModel` / `aiFormatModel`（配图 `model`），空或已失效则落到清单首项。**读取方仍然接受空串**（`resolveAiConfig(modelOverride?)` / `resolveWriteConfig(modelOverride?)` / `getProviderConfig()` 统一回退到清单首项），因为从没打开过面板的旧配置里确实是空串；但不要在 UI 上再把空串当成一个可选项。
    - **写作与排版各记一份、清单共用**：同一套接口下写作要发散、排版要稳定，常挑不同模型；共用一个的话每次切换都要回设置页改。所以不要「优化」成单个 `aiModel`。
    - **清单与被选值必须自洽**：`normalizeConfig()` 与 `saveAiModels()` / `saveImageModels()` 都要保证「当前 model 一定在清单里」。注意收敛方向：清单有值而当前 model 不在其中时，**让当前值落到清单首项，而不是把旧 model 补进清单尾**——补进尾部会让「默认」变成最后勾的那个，行为看着随机。清单为空时才用当前值兜底成一项（旧配置没清单），再空才用 `def.defaultModel` / 空串。配图的 `cfg.model` 同理由 `normalizeConfig()` 收敛，面板里不需要再兜底。
    - **面板下拉只在清单多于一项时出现**（写作 / 排版 `v-if="modelOptions.length > 1"`、配图 `v-if="cfg.models.length > 1"`）：单个选项的下拉没有可选的余地，白占一格还挤别的控件。三个面板一律同一判断，别给配图开例外。
    - **判定「是否已配置」要用实际会发的模型**：`isWriteConfigured(modelOverride?)` 曾直接等同 `isAiConfigured()`，面板单独选了模型、`aiModel` 为空时会误报「未配置」。传参传面板的 ref 值，不要依赖 `watch` 落盘的时序（落盘是异步的，刚换完模型就点生成时设置里可能还是上一条）。
31. **大图预览用公共组件 `@/components/ImagePreview.vue`，不要在各处再写一遍 Teleport 浮层**：命令式调用，状态全在组件内部——`<ImagePreview ref="imagePreviewRef" />` + `imagePreviewRef.value?.open(src, '可选的说明文字')` / `.close()`，`defineExpose({ open, close, visible })`。目前图库（`GalleryBoard` 的本地 / 磁盘图片）与 AI 配图的结果图（`AiImageDialog`）都在用它；**新增任何「缩略图 → 点开看大图」的场景一律复用**，包括素材卡片等。要点：
    - **浮层必须 `Teleport to="body"`**：调用方常常挂在 `BaseDrawer` / `BaseDialog` 里，那些面板带 `overflow: hidden` 与滑入动画的 `transform`，`position: fixed` 在里面会退化成相对面板定位、直接被裁掉。层级取 `z-[1200]`：`BaseDrawer` / `BaseDialog` 是 `z-[999]`、`ConfirmDialog` 1000、`PromptDialog` 1100，大图要盖在它们之上；全局 tooltip 是 `z-[9999]`，仍在上层（这是有意的，悬停提示不该被大图挡掉）。
    - **调用方只负责「喂图」，别自己再维护一份 preview 状态**：抽屉关闭时调 `imagePreviewRef.value?.close()` 收起浮层即可（图库面板是内嵌面板，整块 `v-if` 卸载时浮层随之销毁，不必额外收），不要在外面再存一份 `{ src, width, height }`——那样尺寸回填与 Esc 监听都会变成两份。
    - **入口按钮的显隐 CSS 各面板自带一份同名类**（图库是 `.card-action-hint`，AI 配图结果图是 `.preview-hint`；`<style scoped>` 不能跨组件共享），规则必须一致：默认为隐藏时 `opacity: 0` + `pointer-events: none`，`.group:hover` / `:focus-within` 显示，`@media (hover: none)` 常驻。上面这句以图库那份为例——**显隐类挂在 `BaseTooltip` 的根元素上**（不是按钮上）：鼠标设备（`hover: hover`）默认 `opacity: 0; pointer-events: none`，悬停整卡（`.group:hover`）才出现；触屏（`hover: none`）常驻显示——手机上根本没有 hover，否则就没有看大图的入口。`pointer-events` 必须跟着一起切：只改 opacity 会留下「看不见但能吃点击、还能触发 tooltip」的透明区域。磁盘卡片那排的「在文件管理器中显示」按钮也共用这个类，两个源图的显隐行为才能一致。
    - **预览按钮与删除按钮同时都在**：插图和清理已经合并进同一个图库面板（不再分「图库 / 清理缓存」两种模式），所以「先看大图再决定插不插」和「先看大图再决定删不删」都要能走通。
    - **点缩略图只做「选中」，绝不直接插入**：早先点一下就把图写进正文，手一滑就误插（图库紧跟编辑器、点击密度又高）。现在点图只是选中（再点一次取消，单选用 `selectedTokens` 只放一个 key，磁盘图用 `selectedDisk`），选中后工具条右上角才出现主题色「插入」按钮，点了才真的 `emit('insert')`。**多选态下：勾 1 张也给「插入」，勾 2 张及以上只给「删除选中」**——多选的语义是批量清理，不能让人误以为能把一堆图一起塞进文章。`canInsert` computed 统一判这条：磁盘页看 `selectedDisk`，本地页看 `selectedTokens.size === 1`。
    - **缩略图右上角是两个同款按钮，顺序固定「查看大图 → 置顶」（置顶在最右）**：两者都是 `size-[22px] + rounded + bg-black/55 + 12px 白色图标`，**主题色只在 hover 时出现**（`hover:bg-[var(--accent)]`）——已置顶的也走深底，不要给它常亮的主题色底，否则网格里一堆绿块，反而看不清是哪张。置顶状态靠图标区分（`Pin` / `PinOff`）并靠 `.card-action-hint--on` 让按钮常驻显示（否则「这张已置顶」只有悬停才看得见，但不改底色）。置顶按钮走 `toggleCardPin(token)`（按 token 直接翻转，不动当前选中项）。
    - **面板顶部工具条只放多选相关控件**（全选 / 多选 / 删除选中），不再有抽屉标题栏那排「置顶」圆按钮；置顶入口只有缩略图右上角那一组。
    - **两种图源的 `src` 口径不同**：本地图片直接用 `getAllImagePreviews()` 已经读好的 `img.dataUrl`；磁盘图片的 `dataUrl` 是异步 `readAsDataURL()` 补上的，**未就绪时连预览按钮都不渲染**（`v-if="img.dataUrl"`），不要让它显示成一个点了没反应的按钮。
    - **Esc 关浮层走捕获阶段**（组件内实现）：`open()` 时 `window.addEventListener('keydown', handler, true)`、`close()` 时移除，`onBeforeUnmount` 兜底，并 `stopPropagation()`——否则 `Escape` 会先被编辑器 / 抽屉的其它 Esc 逻辑吃掉，表现为「按了没反应」或「大图和抽屉一起关」。
    - **置顶与删除对磁盘图片不开放**：磁盘图由本地文件系统托管，删不删归文件管理器管，面板里只给「在文件管理器中显示」；置顶只对本地缓存图有意义。
    - **大图下方那行说明是「尺寸在前、调用方给的说明在后」**（组件内 `meta` computed）：`W × H` 拼在最前，后面接调用方传的 caption（图库传的是「大小 · 日期」，磁盘图是「文件名 · 大小」）。**像素尺寸只能等 `<img>` 的 `@load` 回填**——传进来的 dataUrl / blob URL 里没有宽高信息，`getAllImagePreviews()` 也不返回；组件内取 `naturalWidth / naturalHeight`。解码失败时保持 0，那一行就只显示 caption，不要用 `offsetWidth` 之类（那是被 `object-contain` 缩放后的显示尺寸，不是原图尺寸）。
    - **本地图片按 `createdAt` 降序**（新的在前），置顶组仍然整体排在前面、组内也按日期降序（`sortedImages` 里 `byCreatedAtDesc`）。`getAllImagePreviews()` 返回的是 IndexedDB 的 key 顺序，跟时间无关，所以必须显式排；`createdAt` 缺失的旧记录按 0 处理，自然沉到该组末尾。
32. **编辑器里的「大块视图」一律做成编辑区内嵌面板，不要再开抽屉弹窗**：统计、草稿箱、图库、「我的素材」、违禁词检测、设置、小红书图、AI 八块现在共用同一套骨架——`EditorPage` 里各自的 active ref（`statsActive` / `draftBoardVisible` / `galleryBoardActive` / `materialBoardActive` / `bannedBoardActive` / `settingsBoardActive` / `xhsBoardActive` / `aiBoardActive`）互斥，模板里各是一个 `v-if` 占满编辑区的块（`flex flex-1 min-w-0 flex-col overflow-hidden` + `:class="{ 'rounded-xl': !isMobile }"` + `style="background: var(--bg-primary)"`），编辑器那一层改用 `v-show` 保撤销栈与预览 iframe。要点：
    - **互斥统一走一个 `closeAllBoards()`**：八个入口（`onToggleStats` / `onOpenDraftBoard` / `onOpenGalleryBoard` / `onOpenMaterialBoard` / `onOpenBannedBoard` / `onOpenSettingsBoard` / `onOpenXhsBoard` / `onSidebarAiAction`）都是「先记住 `next = !自身`、再 `closeAllBoards()`、最后把自身设成 `next`」，不然容易漏写某个兄弟面板、叠两层。函数体里逐个显式置 `false` 而不是遍历数组——`draftBoardVisible` 来自 `useDraft`，声明在后面，放进数组会在模块初始化时撞 TDZ。侧栏「文章」按钮在面板激活时只关面板、不强行展开文章树（`onToggleTreePanel` 里提前 `return`）；导入成功后同样先关掉面板再回编辑区（`onSidebarImport`）。
    - **头部统一用 `BoardHeader.vue`，不要再各写一遍工具条**：`title` / `description` / `showBack` / `titleClass` 四个 prop，加 `#search`（中间）/ `#actions`（右侧）/ `#tabs`（标题下面靠左）三个插槽。桌面端是 `md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`，三列必须显式写 `md:col-start-1/2/3`——不写的话，没有搜索框的面板里 CSS Grid 自动放置会把动作按钮塞进中间那一列（曾经踩过）。窄屏退回 flex 换行，搜索框占满整行。搜索框样式统一用全局 `.board-search`（34px 高、260px 宽），标签页统一用全局 `.board-tab` / `.board-tab.active`（28px 高胶囊，视觉照扩展组件页的 `.cat-btn`）；这两条写在 `src/styles/style.css`，因为各面板 scoped 样式互相看不到。
    - **设置页的卡片化版式（`SettingsCard.vue` / `SettingsSlider.vue`）**：每个设置项是一张卡（左 44px 圆角图标块 + 标题 / 副标题 + 右上 `#action` 开关或下拉 + 正文控件区 + 底部灰说明），多张卡放在 `<MasonryFlow>`（`src/views/editor/components/MasonryFlow.vue`）里：flex 列 + JS 测高的瀑布流，桌面 2 列、`max-width: 767px` 收成 1 列，卡片按自身高度往下排。**不要改回 `grid`**（行高由整行最高的卡决定，矮卡下面必然空一截），**也不要改回 CSS 多列 `column-count`**——Safari 会把「上一列最后一项的 margin-bottom」挪到「下一列第一项上方」，右列第一张卡因此比左列低一截、两列顶部对不齐（Chrome 下正常，很难发现）。`MasonryFlow` 之所以不像「我的素材」那样直接用 `@yeger/vue-masonry-wall`：那个库是数据驱动（`items` 数组 + `keyMapper`），而设置页的卡片是静态模板，塞不进数组；`MasonryFlow` 用插槽 + `cloneVNode` 平摊 `Fragment` 后自行分列，原理与之一致（贪心塞进当前最矮的列）。两个配套细节：卡片内有输入框获得焦点时跳过重排（否则重排会把节点挪列、焦点当场丢），失焦后靠 `focusout` 补排一次；每张卡都挂 `ResizeObserver`，内容变高变矮会自动重排；「普通段落」卡内再套 `.settings-subcard`（淡灰底、无边框、12px 圆角）做 3 列参数卡。滑杆统一 `SettingsSlider`（`linear-gradient` 画双色轨道，原生 `accent-color` 只能整条同色）；**只要卡片里有滑杆，数值就一定写成 `.settings-subcard` 里的 `.settings-subcard-label` + `.settings-subcard-value`（label 与数值一行、滑杆在下、两端极值在最下），不要塞进卡片右上角的 `#action`**——`#action` 只放开关、下拉、按钮（例如「恢复默认」）；输入框 / 下拉 / 胶囊 / 开关统一用 `SettingsBoard.vue` 的 `.settings-input` / `.settings-select` / `.settings-chip` / `.settings-toggle`（+`.settings-toggle-knob`）这些 scoped class，别再往模板里粘长串 Tailwind 颜色。「恢复默认」各自管各自的：「普通段落」卡的 `#action` 里一个按钮调 `onResetPara()`（只还原字号 / 行高 / 字重 / 间距 / 缩进），「编辑区字号」卡的 `#action` 里一个按钮调 `onResetEditorFontSize()`（只还原编辑区字号）；不要合并成一个头部按钮，两套值互不相干。其余 Tab（图片 / 文章仓库 / 公众号 / AI / 关于）也全部改用同一套卡片：一个设置分组一张 `SettingsCard`，组内多个字段再套 `.settings-subcard`（两列用 `grid gap-3 sm:grid-cols-2`）；工作区这类「列表项」也用 `.settings-subcard`，当前选中项加 `.is-active`（`box-shadow: inset 0 0 0 1px var(--accent)`），「当前」徽标用 `.settings-badge`。子 Tab（AI 文本 / AI 图片、上传设置 / GitHub 图床 / 乐塔图床）仍是 `.board-tab`。新增的 CSS 变量 `--settings-card-border` / `--settings-subcard-bg` / `--settings-track` / `--settings-hover-border` 在 `src/styles/style.css` 的 `:root` 与 `[data-theme='dark']` 各有一份。
    - **侧栏按钮的 active 态统一**：`color: var(--accent)` + `color-mix(in srgb, var(--accent) 10%, transparent)` 背景，各按钮同一套（`EditorSidebar` 各收一个 `xxxActive` prop）；设置没有侧栏入口（顶栏齿轮按钮常驻），所以 `settingsBoardActive` 只做互斥、不点亮侧栏。
    - **查找替换与命令面板只属于「编辑器页面」**：`FindReplacePanel` 与 `CommandPalette` 都 `Teleport to="body"` + `fixed`，父容器的 `v-show` 藏不住，所以 `closeAllBoards()` 末尾调 `closeEditorOverlays()`（只在 `findVisible` 真为真时才清，避免白调 `applyFindSpec` 打断编辑状态），⌘K 走 `anyBoardActive()` 判断、面板开着不响应；移动端切「文章 / 预览」Tab 也收掉。
    - **`BaseDrawer` 支持 `embedded` 模式**：给「本来是抽屉、现在要塞进面板」的组件用（目前是 AI 四个子面板）。`embedded` 时不开传送门、没有遮罩/外框/动效，只保留「头部插槽 / 内容 / 页脚」三段铺满父容器；子组件的 `watch(() => props.visible)` 生命周期照旧，由面板的 `active` 驱动。注意 `visible` 要跟着「面板是否打开」而不是「当前 tab」——否则切 tab 会把在途请求 abort 掉。
    - **`embedded` 子组件的 `watch(…, { immediate: true })` 必须能安全跑在 `setup()` 阶段**：面板是 `v-if`，子组件挂载那一刻 `visible` 已经是 `true`，没有 `immediate` 的话「打开时初始化」整段不执行（症状是 AI 写作输入框提示「会话已过期」、发送按钮禁用）。但加了 `immediate` 之后，watcher 在 `setup` 里同步执行，**它调到的每个 `const` / `ref` 都必须已经声明在 watcher 之前**，否则撞暂时性死区（TDZ），表现为 `Uncaught (in promise) Cannot access 'xxx' before initialization`，整个面板初始化中断。踩过的具体例子：`AiImageDialog` 的 `aiReady`（`refreshAiReady()` 读它）原本写在文件后半段，加 `immediate` 后直接报错；已把它连同 `refreshAiReady` / `onAiSettingChanged` 一起挪到 `configured` 之后、watcher 之前，并在原处留了注释。另外父级不要用 `v-if` 直接绑 `active`，要「首次打开挂载、之后 `v-show`」（`EditorPage` 的 `aiBoardMounted`），否则关一次面板就卸载，对话记录、生成结果、**输入框里没发出去的字**全丢。
    - **面板自己管数据加载，父级只管开关与结果**：`DraftBoard` 收 `drafts` prop；`GalleryBoard` / `MaterialBoard` 自己 `onMounted` 拉数据（面板是 `v-if`，每次打开都是新的实例，天然拿到最新数据）。删除确认留在父级（`ConfirmDialog`），面板通过 `request-delete` / `defineExpose({ doCleanup })` 交回父级执行，避免两处各存一份确认状态。
    - **没有 props.visible 的面板用 `onMounted` 顶替「打开时初始化」**：面板是 `v-if`，每次打开都是新实例，所以原来写在 `watch(() => props.visible, …)` 里的初始化（按 `initialTab` 落 tab、刷新配置回显）直接搬进 `onMounted`；父级也不再传 `visible`，只传 `initial-tab`。
    - **把配色烘焙进图片/HTML 的面板，切深浅色必须重新生成**：小红书图的首图是 `buildCover(..., isDark)` 拼出来的 HTML、内容图是已经烘焙好背景色（深色 `#1a1a1a` / 亮色 `#ffffff`）与文字色的 PNG dataURL——两者都把「生成那一刻」的主题固化进去了，只靠 CSS 变量切不过来，症状就是切深浅色后卡片不变、非得刷新页面。所以 `XhsBoard` 里 `watch(isDark, …)` 要防抖 150ms 后重跑 `generate()`；同理任何「生成图 / 生成 HTML 快照」的面板都要挂这条 watcher。配套两点：① `generate()` 用 `genToken` 自增序号丢弃过期结果（重新生成要几十秒，期间可能又切了一次主题/比例，旧的那次不能把新结果盖掉）；② 生成中的占位改成 `v-if="building && !cards.length"`，重新生成时保留旧卡片，否则整块闪成「生成中…」；单张「下载」按钮在 `building` 时禁用（卡片是旧的，导出的也是旧主题）。

    - **插入类动作由父级收尾**：面板只 `emit('insert', payload)`，父级关面板、往光标处写内容、弹 toast。写正文的字符串里有引号时注意这是 `<script>` 上下文，直接写 `"`，写成 `&quot;` 不会被解码（曾因此把 `src="..."` 写成一堆 `&quot;`）。
33. **AI 素材只做「造片段 + 落地」，不复用素材库的保存链路**：`AiMaterialDialog.vue` 的产出是一段**按编辑器语法写的组件片段**，落地动作只有两个——「插入到编辑器」（`editorRef.insertOwnLine()`，插在光标处、不覆盖已有内容，与「插入组件」「插入图片」一致，块级标签必须独占行否则会和相邻段落黏在一起）与「清空编辑器再插入」（面板内 `ConfirmDialog` 确认 → 父级 `editorRef.replaceAll()` + `markdown.value` + `saveContent(text, true)`，与「格式化文档」同一条路子，因此进撤销栈、草稿/文章关联保留）。**不要接 `SaveMaterialDialog` / `MaterialStorage`**：那是「保存当前编辑器全文」的语义（`useMaterial.handleSaveMaterial` 固定取 `markdown.value`），与「保存 AI 生成的一小段」不是一回事，硬接会让用户存进去整篇文章。素材铁律与排版铁律冲突（排版禁止增删内容，素材是按需求凭空造），所以玩法单独写成技能文件 `data/ai/r-markdown-material/SKILL.md`（与 `khazix/SKILL.md`、`r-markdown-formatter/format-spec.md` 同构，`utils/aiMaterialPrompt.ts` 的 `loadMaterialSkill()` 用 `import('…?raw')` 动态加载并剥注释与 frontmatter，框架段由 `buildMaterialSystemPrompt({ skill, spec })` 拼），只共用 `loadFormatSpec()` 的规范正文与 `componentCheatsheet()` 的标签清单，**不要给 `buildSystemPrompt` 加参数把两套铁律混在一起**。**以后要调素材玩法只改 SKILL.md，别往 `aiMaterialPrompt.ts` 里加规则**——两处各说一套时模型会挑好写的那个遵守。

**拼出来的素材要带边界注释**（`utils/materialBoundary.ts`）。落地的两条路径（`EditorPage.onAiMaterialInsert` / `onAiMaterialReplace`）与素材库插入（`useMaterial.handleInsertMaterial`）都过 `wrapMaterialBoundary()`：内容**不是单个成品组件**时（自由拼版、纯 `<html>`、多块拼一起），首尾包一对 `<!-- 素材开始 -->` / `<!-- 素材结束 -->`，单个组件（`<steps>`、`<cta>`、`<img>`、`<chart>`、以及只包了一层 `<container>` 的单卡）原样输出。判据是「顶层元素是否恰好一个、且该元素自带完整外观」——`LAYOUT_TAGS`（`container`/`row`/`column`/`text`/`stack`/`positioned`/`html`/`svg`）与子标签（`left`/`right`/`slide`/`item`）不算成品，外面只剩一层 `<container>` 时会剥掉它再看内部。**这样做的理由**：拼版素材在编辑器里是一堆散落的标签，用户很难看出它是「一个整体」，复制/删除/整体移动时容易拆坏；注释给了它一个人能认的边界，而解析器会整段跳过 `<!--` 开头的行（`markdownParser.ts` 主循环），`countChars()` 的 `<[^>]+>` 也会剥掉它，所以**不影响渲染、不污染字数、格式化也保留**（`materialBoundary.ts` 里 `hasMaterialBoundary()` 保证幂等，重复插入不会套两层）。`<svg>` 归入 `LAYOUT_TAGS` 是因为 `interactive-materials/gen.py:473` 生成的片段自己就带这对注释，不重复加。

**素材生成必须过代码侧质检**（实测结论：光在 prompt 里写「禁止 JSX / 必须用组件」拦不住模型，它会在 JSX、YAML 伪代码、普通 Markdown 之间摇摆）。`utils/aiMaterialPrompt.ts` 提供 `checkMaterialOutput()`（无组件 / JSX 外形 / 非法属性 / 子内容形状）、`findIllegalAttrs()`（比对 `@/extension` 注册表的 `attrs`，另含 `<left>` `<right>` 这类只在别的组件内部出现、带属性就匹配不上的子标签）、`findShapeProblems()`（`<compare>` 缺 `<left>`/`<right>`、`<steps>` 缺 `|`、`<case-flow>` 缺 `[标签]`、`<timeline>` 段数不足、`<badges>` 逐行写或逗号分隔、数据型组件标签内有正文、必填属性缺失、属性值用中文弯引号）。**数据型组件清单 `BODY_IGNORED_TAGS`（`chart` / `slider` / `engage`）是实测得到的**——它们的 `render(attrs, _body, …)` 签名里 body 是下划线参数，实现根本不读，标签内写什么都渲染不出来；模型极爱把 `<chart>` 当 Markdown 表格写成 `- 2020 | 6.4` 行，图直接是空的。**改组件实现让某个组件开始用 body 之后，要把它从这个清单里删掉。**`AiMaterialDialog.vue` 生成后用 `checkMaterialOutput()` 判一次，不合格就带 `buildMaterialRetryMessage(需求, 上一版, 驳回理由)` 重试，最多 `MAX_RETRY = 2` 次；仍不合格就把结果交给用户并给 warning，不无限循环。**能用确定性修复的不要靠重试**：`repairMaterialOutput()` 会在质检前把「`<chart>` 数据写成正文行」这类**可逆**错误解析出来挪进 `labels` / `values`（正文结构固定为 `- 标签 | 数值`，解析不出就原样返回交给重试），修过的项以 `repairNotes` 进 warning 告知用户——静默改内容比报错更糟。同一层还收了三类**位置错位**的确定性修复：`moveMisplacedTitle()`（`<title title="主标题"></title>` —— 标题文字写进了属性，`<title>` 的 render 读 body，属性被静默忽略、标题区空白）、`splitTitleSubtitle()`（`<title>主标题 | 副标题</title>` —— 副标题被当正文用 28px 大字渲染）、`fixBadgesSeparator()`（`<badges>a,b,c</badges>` 或 `<badges>` 里逐行写 —— `render` 只按 `|` 切，逗号与换行都会让三个标签变成一个）、`fixAttributeQuotes()`（`<steps type=“DA02”>` —— 属性值用了中文弯引号，解析器整个读不到该属性，`<steps>` 会静默退回 A01 样式，不报错也看不出来）、`fixFullwidthPipes()`（`<steps>` / `<timeline>` / `<badges>` 正文里的中文全角竖线 `｜` —— 中文输入法下 `|` 极易打成全角，两者视觉几乎一样，但所有按竖线切分的解析只认半角：`<timeline>` 一行都解析不出来时 `render()` 直接返回空字符串，**预览区整块空白、控制台也不报错**，用户只能看到「这个预览不出来」。这类错法提示词讲不清（模型看不出两个符号的差别），又是纯机械替换，所以直接修；只改 `PIPE_LIST_TAGS` 里那几个组件的正文与 `chips` / `bg` 属性，别的正文里出现全角竖线可能是用户有意写的，不碰。`findShapeProblems()` 里的竖线判定要先过 `normalizePipe()` 再数段数，否则半角行会被重复报成「缺分隔符」与「用了全角竖线」两条）。。**自动修复必须有明确的「不动手」边界**：`fixBadgesSeparator` 逐行写只在「每行 ≤ 12 字」时才并成一行，单行逗号只在「至少 3 个条目 + 每项 ≤ 8 字」时才拆——两个条目的句子（「这是一句话，别拆」）跟二元素标签列表长得一模一样，分不出来就不修，交给质检报警 + 重试；`moveMisplacedTitle` 在正文已有内容时不动（防丢正文）；`splitTitleSubtitle` 在已有 `subtitle` 属性或切不出两段时不动。实测这类错法提示词讲三遍 + 带理由重试两次，模型仍会犯（「图表 + 数据行」在训练语料里几乎都是表格形状）。**规范外的标签名要第一个报，并且必须给出正确标签名**：`findUnknownTags()` 扫出 `components` 注册表之外的大写/拼接标签（模型会造 `<title-card>`、`<chart-card>`、`<step-list>` 这种「组件名 + 用途」的拼接词），先按「合法标签名 + 连字符」猜、猜不到再查 `TAG_SYNONYMS` 词根表（取最长匹配词根，`image-card` 同时命中 image 和 card，要算图片不是标题卡）。**不能让它落到「一个组件都没用」那条提示**——模型据此不知道该改标签名，带理由重试两次还是原样，最后把废稿交给用户。`legalTags()` 必须把 `INNER_TAG_ATTRS` 的键（`left` / `right`）一起算合法，否则 `<compare>` 的合法写法会被自己驳回。**新增组件或改组件属性时，`INNER_TAG_ATTRS` / `PARSER_LEVEL_ATTRS` / `TAG_SYNONYMS` 要同步核对**，否则新属性会被误判为非法。结果保留走独立设置项 `aiMaterialSessionHours`（第 29 条同一套机制），需求草稿存 `aiMaterialPrompt` 不受保留时长约束；调用仍只走 `aiFormat.chatCompletion`（第 18 条）。**容器按需包，不是一律包**（`wrapInContainer()`，排在修复链末尾）。用户 2026-11-18 先说「生成的素材需要使用 r-markdown 的容器组件来生成」，随后修正为「注意不是所有素材都需要 container 组件包裹，html 明确不要用 container 组件包裹」。落成规则：① **单个成品组件不包**——`isSingleComponent()` 为真时原样输出，组件自己就是完整版式，外套容器等于加一圈内边距和底色，和直接用组件的样子不一样；② **顶层只要有 `<html>` 块就绝不包**——`hasTopLevelHtmlBlock()`，块内是按整宽写死的原生 HTML，套壳多一层 `section`，复制到公众号也多一层嵌套（混写的情况同样不包，宁可让用户自己补壳）；③ 其余情况（多个块拼一起、`row`/`column`/`text` 自由拼版、混着段落文字）才包一层。`isSingleComponent()` 会剥掉外层那层 `<container>` 再看内部，否则所有素材都会被判成「不是单个组件」。**包的时候 `display="block"` 不能省**：实测 `<container>` 默认 `display: flex` + `direction: row`，在 660px 预览里放 `<p-title>` + `<steps>`，两个子组件各被压到 108px / 137px 宽、挤在同一行；改 `direction="column"` 只解决方向，子元素仍按内容收缩；**只有 `display="block"` 能让每个子组件各占整宽**（660 / 660）。已经包过的只补 `display="block"`（模型自己写了 `display="flex"` 说明有意横向排版，保留），已写 `display` 的不动。`checkMaterialOutput()` 里「一个组件都没用」的判定要排除 `container`——否则把纯 Markdown 包一层容器后这条检查就永远不命中了（踩过）。原「快速灵感」chip 行已按同一次要求整体删除（`MATERIAL_IDEAS` / `useIdea()` / `promptRef` 全部移除），不要再加回来。

**选型错必须单独质检，语法质检查不出来**（`checkMaterialIntent()`，实测结论）。用户说「做三个小节标题」，模型会写 `<steps type="DA02">` 或 `<title num="01">`——两者语法完全合法、`checkMaterialOutput()` 一路绿灯，但版式和用户要的完全不是一回事。所以 `AiMaterialDialog.vue` 的判定统一走 `checkMaterialOutput(s) ?? checkMaterialIntent(requirement, s)`，**只查语法会漏掉最高频的一类错误**。`INTENT_EXPECTATIONS` 只在需求里出现了那些说法时才约束（「小节标题 / 章节标题 / 段落标题 / 分节标题 / 编号标题 / 小标题 → `p-title`」等），且只管「点名了但没用」，不管「多用了别的」。**但这条规则有个前置豁免**：正文里只要出现 `HAND_BUILT_TAGS` 里的任一布局组件（见下面「素材不强制套成品组件」），就直接放行——用户完全可以自己用 `<row>`/`<column>` 搭双栏而不写 `<compare>`，那是满足需求，不是违规。**唯一的例外是标签组（`strict: true`）**：`<badges bg="#ff6b6b|#6c5ce7">` 天生支持渐变，用户说「一排彩色标签 / 关键词」时用 `<html>` 手画一排带 `border-radius` 的 `<span>` 画面看着一样，但以后改文案要改三处，所以这条连 `HAND_BUILT_TAGS` 也不放行；`unless` 里放 `/<(?:title|breaking)\b[^>]*\bchips\s*=/i`——卡片自己写 `chips` 是正解，不算选错。词表也要按用户原话收（`['标签','徽章','徽标','关键词','chips']`），用户从不说「标签组」，漏了这条等于规则不存在。

**「说了颜色却丢了颜色」是第三类质检**（`checkColorIntent()`，`AiMaterialDialog.vue` 的判定链因此是 `checkMaterialOutput ?? checkMaterialIntent ?? checkColorIntent`）。实测（2026-11-18，用户反馈「badges 组件的 skill 示例属性不全，导致不能生成颜色或渐变背景的样式」）：模型终于被逼着改用 `<badges>增长|复利|长期主义</badges>` 之后，**属性一个都没写**——语法合法、选型也对，两道质检全绿，但渐变诉求整个丢了，渲染出来是默认灰底小标签。`checkColorIntent()` 只在「需求含 `COLOR_WORDS`（渐变/彩色/配色/颜色/底色/色底）」+「输出里有 `<badges>`」+「开标签上没有 `bg` / `color`」时驳回，驳回理由直接给出正解写法；输出里有 `<html>` 或 `<svg>` 时返回 `null`（手写版式的颜色写在 `style` 里，不归它管）。**根因在文档侧**：`SKILL.md` 的「组件写法手册」只展开常用属性，`<badges>` 那一节原本只写 `tone`，`color` / `bg` / `margin` 完全没提，模型据此以为只能预设配色。所以同时补了三处口径：① `<badges>` 小节重写成四属性表 + 渐变示例；② 手册开头加引用块「这里只展开常用的那几个属性，不等于只有这些，完整清单在 prompt 末尾附录」；③ `buildMaterialSystemPrompt()` 的附录标题改成「每个标签的完整属性清单以这里为准」并前置三行提示。**顺带把同类缺失一次性补齐**（脚本比对 `src/extension/*.ts` 的 `key:` 与 SKILL.md 各小节得出）：`lead` / `statement` / `steps` / `case-flow` / `timeline` / `compare` / `chart` / `slider` / `img` / `mermaid` / `table`（缺 19 个）/ `row` / `column` / `stack` / `positioned` / `text` / `reading-path` 都补上了漏掉的属性。**这条经验要推广**：SKILL.md 是模型唯一能看到的属性来源，任何「组件支持但手册没写」的属性都等于不存在。

**重试轮要清掉上一版的 `repairNotes`**（`prepareMaterial(raw, fresh = true)`）。踩过：第 1 版模型写成了裸 `<html>`，`wrapBareHtml()` 记了一条「已自动补上 `<html>` 包裹」；重试后第 2 版变成了正确的 `<badges>`，但那条 note 还留着，面板对着最终这一版 `<badges>` 显示「已自动补上 `<html>` 包裹」——用户看到的提示和眼前的素材完全对不上。修复记录必须和它所属的那一版绑定。

这一层还收了四类 `p-title` 相关修复（都是「预览看着有内容、其实版式全错」的隐蔽错法）：`fixTitleWithNum()`（`<title num="01">` / `<title index="03">` —— 序号属性是 `<p-title>` 独有的，`<title>` 一个数字类属性都没有，说明把小节标题写成了封面大标题卡，直接把标签名换成 `<p-title>` 并把序号属性统一成 `num`；**这条要先于「属性不存在」报**，否则模型会去删 `index`/`num`，删了照样不是分节标题；模型换着名字写序号，`NUMBER_ATTRS` 收 `num`/`index`/`number`/`no`/`order`/`seq`/`idx`）、`movePtitleNumIntoAttr()`（`<p-title>01 为什么</p-title>` —— 序号写进正文会和标题一起用大字渲染，搬进 `num` 属性）、`expandSelfClosingTags()`（`<p-title num="01" … />` —— 解析器找不到闭合标签会**整块丢掉**，预览空白且不报错；除 `<img>` 外所有组件都必须成对）、`findChineseTags()`（`<并列小节标题>` —— `findUnknownTags()` 的正则只认 ASCII 小写开头，中文标签一个都扫不到，会掉进「一个组件都没用」这种误导提示）。`findShapeProblems()` 还补了「组件开闭数量对不上」。**`findUnknownTags()` 猜建议标签时只能用 `components` 里的组件 tag 当候选，不能拿 `legalTags()`**——`section` 是合法的行内标签，放进去后 `section-title` 会被猜成 `section`，模型照这个建议改只会更离谱。

还有一类 `<compare>` 的两栏标题错位：`moveCompareSideTitle()`（把 `以前的写法（缺点）` 写在 `<left>` 的第一行）。`Compare_DA01` 的 `renderSide(label, title, content)` 里 label 是 10px 加粗、title 是 14px 加粗深色、正文行是 14px 灰字，所以写在首行的「标题」既不居中也不加粗，和另一栏对不齐，纯粹是灰字正文；而这个组件两栏标题的唯一正确位置是 `<compare>` 自己的 `left-title` / `right-title` 属性。同一函数还兜住更严重的一种写法：`<left title="以前的写法">` —— `parseSides()` 用的是 `/<left>([\s\S]*?)<\/left>/`，带任何属性都**整块匹配不上、两栏内容全部消失**，所以它会把属性值搬上 `<compare>` 并重建不带属性的 `<left>`。判据是「首行不以 `-` / `*` / `![` / `<` 开头、去 `**` 后 ≤ 24 字、且下面还有列表行」——够不够长、有没有列表跟着，是区分「标题」和「一句普通正文」的唯一线索；`<compare>` 已经有对应属性时不动（否则会盖掉手写的值）。

还有一类是**整段写法本身踩了解析器的坑**，跟属性对不对无关：块级组件写成「开标签 + 正文 + 闭标签」**同一行**时，正文会被丢掉，严重时连后面隔一个空行写的段落一起吞掉（实测 `<timeline>- 2021 | 立项 | 起步</timeline>` 整篇渲染成空字符串，`<steps title="流程">- 甲 | 一</steps>` 会吃掉后面的段落，`<cta title="标题">说明文字</cta>` 只剩标题）。原因是 `utils/markdownParser.ts` 里 `<cta>` 这一族只前窥 3 行找行首的闭合标签，找不到就退回 `parseCtaInline()`（`utils/components.ts`），那是 `render(attrs, '', t)`——body 直接给空串。所以 `splitInlineBlocks()` 排在 `repairMaterialOutput()` 链的**最前面**（早于所有属性修复），把 `NEED_OWN_LINE_TAGS`（`cta` / `breaking` / `steps` / `timeline` / `case-flow` / `table` / `row` / `compare` / `left` / `right` / `column` / `container` / `stack`）的四种挤行形态拆成三行：开标签后补换行、闭标签前补换行、闭标签后补换行（`</left><right>` 这种连写）、**闭标签前紧贴另一个子组件闭标签**（`…</text></column>`）。跳过空组件（`<cta …></cta>`）——它们本来就该一行。`findShapeProblems()` 里对同一批标签报了这两种形状，让重试也能修正。第四条是实测补的：`<column flex="1">` 里两个 `<text>` 写成一行、`</column>` 紧跟在第二个 `</text>` 后面时，`collectBlockBody()` 会走「开标签同行就闭合」分支、把 body 取成第一个 `</text>` 之前的空串，整个 column 渲染成 `""`——而原来的「闭标签前紧贴正文」规则用了 `[^\s>]` 作前导，前一个字符是 `>` 时直接漏掉，导致修完仍是空白。

`<cta>` 光拆行还不够，它的属性和正文位置有独特约定：合法属性只有 `label` / `title` / `button` / `color` / `light` / `margin`，**没有 `subtitle` / `desc` / `text` / `content`**（模型按别的卡片组件习惯爱写 `subtitle`，会被静默忽略，卡片上只剩标题），而「关注后回复关键词…」这类补充说明该写在正文里、「立即关注领取」这类按钮文字必须写 `button` 属性。`fixCtaAttrs()` 两层：先把 `CTA_GHOST_ATTRS` 里那些属性的值搬进正文，再在没写 `button` 时把正文末行搬进 `button`。**搬按钮的判据必须严**——「≤ 14 字 + 不带句末标点 + 以号召动词开头（立即/马上/现在/点击/关注/领取/获取/下载/报名/加入/扫码/回复/查看/前往）」三条同时满足才动手，初版只判「短 + 无标点」就把「只要一段说明」的卡片拆成了「说明 + 按钮」两块。同理 `findShapeProblems()` 报「缺 button」也用同一套判据：`button` 不是必填属性，用户真想要纯文字卡片时不能报错。

还有一类是**选错卡片但暴露得很明显**：`<engage>` / `<title>` 这些卡片写上了 `button` / `btn`。`<cta>` 是唯一带按钮区的组件，`<engage>`（纯文字互动卡）和 `<title>`（封面大标题卡）连按钮的位置都没有，属性写了就是静默忽略——渲染出来是一张「只有标题、没有按钮」的卡，用户要的「点一下关注」整个消失。`upgradeCardToCta()` 只在检测到 `btn` / `button` 时才把 `CARD_NO_BUTTON_TAGS`（`engage` / `title` / `breaking` / `statement` / `lead` / `badges` / `p-title`）里的标签整块换成 `<cta>`，`btn` 改名为 `button`，其余属性交给 `fixCtaAttrs()` 继续归位。**它必须排在 `moveMisplacedTitle()` 之前**——`<title title="主标题" btn="…">` 的标题本来在属性上，先搬进正文的话，换成 `<cta>` 之后 `title` 属性就没了。判据只用「有没有按钮属性」，不带按钮的 `<engage title subtitle>`、`<title badge subtitle>` 一律不动，那是合法写法。

还有一类是**关键词写错了位置**：`<title>` / `<breaking>` 的 `chips` 属性被写成卡片后面另起一整块 `<badges>`（实测 `<title subtitle="…">把复杂的事讲简单</title>` + `<badges>说人话|拆结构|给例子</badges>`）。`<badges>` 自己能渲染，所以语法质检全绿，但它是**独立的一块**——排在卡片外面，看起来是卡片下方又飘出一行标签，和卡片里那排 `#关键词` 完全不是一回事。`mergeBadgesIntoCard()` 只在「卡片紧跟（中间只有空白）一个 `<badges>`」且「卡片自己没写 `chips`」时才并进去，`<badges>` 正文先过 `normalizePipe()` 再按行合并成 `|` 分隔；卡片已有 `chips` 时两块都留着（用户可能真的想两处都有）。顺序上它要排在 `moveMisplacedTitle()` 之前、`fixFullwidthPipes()` 之后——全角竖线得先换成半角，否则并进去以后就再也认不出是竖线了。`findShapeProblems()` 同步报这一条，让重试也能修正。**判断依据是「这块标签紧跟卡片」而不是「有 badges 就报错」**：`<badges>` 单独使用完全合法，是正文里罗列标签的正常写法。

再一类是**属性名被换成了近义词**。实测真实生成拿到了

```text
<title main="把复杂的事讲简单" sub="讲清楚，才是真的懂。"></title>
<badges items="说人话,拆结构,给例子"></badges>
```

`main` / `sub` / `items` 编辑器一个都不认识，三个属性全部静默失效——渲染出来是一张空白标题卡加一块空标签组，用户看到的是「什么都没有」。这不是内容写错，而是同一个东西换了个名字，能一一对应回来，所以同样走确定性修复：`fixAliasAttrs()` 把 `<title>` 上的 `sub`/`subheading`/`desc`/`description`/`lead`/`slogan` 改成 `subtitle`，`tags`/`tag`/`keywords`/`labels` 改成 `chips`（逗号分隔的要先按 `[,，、]` 切开再用 `|` 连接），`main`/`headline`/`heading`/`text`/`content` 在正文为空时搬进正文；`<badges items="a,b,c">` 则把属性值搬进正文并换成 `|` 分隔。正文已有内容时一律不搬（防丢正文）。它排在 `upgradeCardToCta()` 之后、`fixFullwidthPipes()` 之前——先换成正常属性名，后面按 body 认形状的修复才认得出来。SKILL.md 的「语法外形」第 2 条也补了这一条，并给了用户这版错写法的 ❌ 对照。

**素材不强制套成品组件，允许自由拼版和纯 HTML**（用户口径：「可以用 container / row / column / text / stack / positioned / html 这些组件像写 HTML 代码一样来构建素材，不强制必须添加其他自定义组件，也可以纯 HTML，只要微信编辑器支持范围内都行」）。`checkMaterialOutput()` 原先只认「用了某个库存组件」，把 `container` 排除后连「用布局组件手工搭版式」都过不了，双栏并排这类版式会被判成「一个组件都没用」。现在分三条路放开，但每条都留了闸：

- **布局组件自由拼装**：`HAND_BUILT_TAGS = ['row','column','text','stack','positioned','html']`，`checkMaterialIntent()` 开头只要命中其中之一就直接返 `null`。理由：选型质检的意义是「用户要双栏，你别给个 `<steps>`」，手工用 `<row>`/`<column>` 搭出双栏完全满足需求，再按「应该用 `<compare>`」驳回是错的。注意这里的放行**只针对手工版式**，`<title>` 卡顶不上步骤流的情况仍然会报（实测仍有驳回）。
- **原生 HTML 必须包 `<html>`**：`<html>` 组的 `render()` 是 `return body`，块内是原样透出的，所以 `<h2>` `<ul>` `<table>` 这些原生标签在块内合法。裸写原生 HTML 会被解析器塞进 `<p>`（实测 `<div>` 被包成 `<p><div>…`，`<ul><li>` 结构直接被拆坏），所以 `wrapBareHtml()` 会在检测到行首是原生块级标签时自动补一层 `<html>` 并给 note。两个例外：正文里同时出现库存组件标签时**不补**（`<html>` 的 body 不参与 Markdown 解析，混写会把组件当死文本印出来）；`<table>` 与我们 table 组件撞名，只在里面出现 `<tr>`/`<thead>`/`<tbody>`/`<td>`/`<th>` 时才当原生表格，否则仍按我们的组件走（我们只认 `- 甲 | 乙` 数据行）。
- **隔离机制是放开的前提**：不隔离的话三处检查会集体误伤纯 HTML——`findUnknownTags()` 把 `<h3>`/`<ul>`/`<li>`/`<tr>` 当自造组件驳回、`findIllegalAttrs()` 把原生 `<table style>` 当我们 table 组件的非法属性、`splitInlineBlocks()` 把原生 `<table>…</table>` 当块级组件硬拆三行。所以 `splitHtmlBlocks()` 先把每个 `<html>…</html>` 换成 `\u0000rmhtml{i}\u0000` 占位符，三个检查器（`findIllegalAttrs` / `findShapeProblems` / `findUnknownTags`）的 `withoutCode` 首行都改成从 `masked` 起算；`repairMaterialOutput()` 也因此拆成两层——外层 `splitHtmlBlocks()` → `repairMarkup()`（原修复链，链首多一个 `wrapBareHtml()`）→ `wrapInContainer(restoreHtmlBlocks(…))`。`aiFormatPrompt.ts` 的 `validateFormat()` 同样先剥掉 `<html>` 块（它在 `AiMaterialDialog.vue` 生成素材时也会跑，否则会把 `<h3>` 报成「出现规范外的标签」）。
- **块内不是全放行**：`FORBIDDEN_HTML_TAGS = ['script','style','iframe','object','embed','form','input','video','audio','canvas']`，`findForbiddenHtmlTags()` 单独扫（`findUnknownTags` 已经被隔离跳过块内），`checkMaterialOutput()` 在 `findUnknownTags` 之后报「`<html>` 块里不能用这些标签：`<script>`（微信编辑器不支持，会被过滤或整段失效）」。不拆包的话这两类会漏过——粘进公众号轻则空白、重则整篇发不出去。
- **prompt 契约第 5 条同步改口径**：从「**必须用组件表达**」改成「**必须有版式**……要么用现成卡片组件，要么用布局组件像写 HTML 一样自己搭，要么整段 `<html>` 原生 HTML，不强制套成品卡片组件」；`buildMaterialUserMessage()` / `buildMaterialRetryMessage()` 也各补一句（后者在「造了不存在的标签名」条目下强调「真要自己写原生 HTML，必须整段包在 `<html>` 里，包外的原生标签会被当成自造组件」）。SKILL.md 对应改了铁律第 1 条、铁律第 5 条例外、输出格式里 `<html>` 措辞，并新增「### 自由拼版：布局组件当 HTML 用」小节（含 `<container>` + `<row gap>` + 两个 `<column flex="1">` 的可运行示例）。

**组件属性白名单要从注册表读，不要手抄**：`allowedAttrsByTag()` 直接由 `@/extension` 的组件定义生成，实测 `<text>` 的合法属性里有 `margin` / `padding` / `extra-style`（`Text_DA01` 的 `render` 会把它们拼进 style），`<column>` 则没有 `radius` / `border`。手抄清单会漏，模型写了白名单外的属性会被 `findIllegalAttrs()` 报出，但白名单内的写得再怪也用不着修。

**AI 素材是对话流，不是一次性表单**（用户 2026-11-18：「有时生成素材可能需要对话好几轮，需要改成 AI 写作那种可以多轮对话的形式，结果在会话中展示，插入按钮也放到对应生成的素材下面」）。`utils/aiMaterialSession.ts` 与 `aiWriteSession.ts` 同构（单会话、滑动有效期、`toHistory` 裁剪），但有三处**素材特有的取舍**：
- **素材源码就是一条 assistant 消息**（`kind: 'draft'` + `material`），不为「版本」另建数据结构。这样历次版本天然留在对话里，用户可以回看、可以插入旧版；`truncateBefore(session, id)` 让「重新生成某一版」把这条及之后整段丢掉，历史重新以用户消息结尾（**不能直接再 runTurn，否则历史以 assistant 结尾，模型会接着自己往下写**，这条与 AI 写作同一个坑）。
- **`kind: 'question'` 是对话模式才有的东西**：`looksLikeQuestion()` 判定「这轮是追问而不是出稿」，追问渲染成左对齐气泡、**没有插入按钮**。判据刻意窄（有组件标签就一定是出稿、长度 > 400 也当出稿，只有短且是疑问句才算），否则一段正常素材被误判成追问就永远出不来稿。生成循环里 `judge()` 对追问直接放行，不对它跑语法/选型质检。
- **历史里的 user 消息要分别包装**：第一句走 `buildMaterialUserMessage()`，之后每句走 `buildMaterialFollowUpMessage()`（「在上一条素材的基础上改，这是同一段素材的下一版，不是另做一段」+「输出**完整**源码，不要只写改动的部分」）。不点明这一点，模型会把「改一处」当成「再做一份」，用户前几轮的调整全白费。判据按**消息 id** 而不是下标定位第一句（历史会被裁剪，下标会漂）。
- **重试文案不再重复需求原文**：`buildMaterialRetryMessage(badOutput, reason)` 只剩两个参数。早期单轮实现会在前面拼一遍 `buildMaterialUserMessage(requirement)`，改成会话流后需求本来就在历史里，再拼一次等于同一份需求在上下文里出现两遍。判据取「最后一条用户消息」——改稿轮里用户说的才是这一轮的要求。
- **每版素材各自渲染、各自算字数**：`renderedHtml` 是 `Record<消息id, html>`，`draftStats(msg)` 优先数渲染后的可见汉字（`<p-title>` 这类正文全在属性里的组件，源码计数会得 0）。源码视图手改走 `onCodeEdit()` → `replaceMaterialMessage()` → 400ms 防抖后重渲染 + 落盘；**插入时按 id 回查最新内容**（`findDraft()`），确认弹窗期间改的源码不能丢。
- **操作行放卡片底部**，与 AI 写作同一条理由：放顶部会与上一条回复贴在一起，用户会以为点的是上一版。

**ESLint 在本机跑不起来是环境问题，不是代码问题**：`npx eslint <任意文件>` 一律报 `ConfigError: Key "rules": Key "constructor-super": structuredClone is not defined`——当前 Node 进程里没有全局 `structuredClone`（`node -e "console.log(typeof structuredClone)"` → `undefined`）。校验以 `npx prettier --check` + `npx vue-tsc -b --force` 为准，别把这条当成自己改出来的错。
- **空态与输入框跟 AI 写作对齐**（用户 2026-11-18：「模型后面的提示放到没有内容的时候的提示里面，空内容提示放中间，不需要边框，输入框高度大一点，同 AI 写作」）。三件事一起改：① 页脚原来「模型」下拉后面那行「生成的是可直接用的组件片段，插入后编辑器立即渲染」挪进空态正文，页脚不再有说明文字（`v-if="modelOptions.length > 1 || latestDraft"` 决定整行显不显示，两个都没有时该行整个消失）；② 空态从「`mt-6` + `rounded-xl` + `border-dashed` + `bg-white` 的小卡片」改成 `flex min-h-full flex-col items-center justify-center` 的居中块，**去掉边框和卡片底色**，`Sparkles` 从 22px 深灰改成 26px 主题色，与 AI 写作的空态同一套写法；③ 输入框加 `INPUT_HEIGHT_SCALE = 2`，最小 38→76px、最大 148→296px，与 `AiWriteDialog.vue` 逐字一致。**别把空态塞进 `contentRef` 里面**——`contentRef` 是 `ResizeObserver` 观察「内容长高后贴底」的目标，空态在里面会让它以为已经有内容、把滚动条顶到底；现在空态是 `scrollRef` 下的兄弟节点，`v-if="!hasMessages && !generating"` 独立判断（`generating` 也要判，否则首轮生成中空态和流式块会同时出现）。

**四个 AI 面板的头部与空态要长得一样**（用户 2026-11-18：「AI写作，空绘画的时候，右上角的新建绘画不显示，这个按钮加一个图标同AI素材；AI排版和AI配图，空内容提示的图标加主题色」，两处「绘画」是「会话」的输入法笔误）。落成三条：
- **「新建会话」跟着 `hasMessages` 走，四个面板一致**：`AiWriteDialog.vue` 原来写的是 `v-if` 不判空（注释理由是「空会话时它仍有意义，万一恢复出的会话有内容想重来」），但实际渲染出来的效果是空态里挂着一个点不出任何东西的按钮，用户会以为「这里已经有一份稿子」。现在与 `AiMaterialDialog.vue` 对齐——**有内容才出现**。图标统一用 `<Plus :size="12" />`，所以按钮要带 `flex items-center gap-1`。
- **空态图标用主题色、26px**：`AiFormatDialog.vue:1155` 与 `AiImageDialog.vue:1256` 原来都是 `<Sparkles :size="22" class="text-[#ccc]" />`（纯灰、22px），改成 `<Sparkles :size="26" class="text-[var(--accent)]" />`，与 `AiMaterialDialog.vue` 的空态一致。**用 `var(--accent)` 不要写死色值**，主题色是设置项。
- 改这类「四个面板要一致」的东西时，**四个文件一起看**：`AiWriteDialog.vue` / `AiFormatDialog.vue` / `AiImageDialog.vue` / `AiMaterialDialog.vue`。它们各写各的模板，没有共用组件，改一个很容易漏掉另外三个（这次就是用户先发现 AI 写作不一致才提的）。

**素材输入框的 `/` 快捷插入**（用户 2026-11-18：「我想在输入框处做一个快捷组件名的插入，比如我输入 / 的时候就显示 container、text 等，选中后添加到输入框，类似 DSH 的 / 功能，输入的提示也改一下」）。纯逻辑在 `utils/materialCommands.ts`，面板里只有三小段状态：

- **`MATERIAL_COMMANDS` 是手写清单，不是从注册表生成**。`@/extension` 的 `components` 里同一 `tag` 有多个变体（`Title_DA01` / `Title_DA02` 都是 `title`），直接映射会出重复条目；而且注册表只有中文 `name`，没有一句「它是干什么的」。所以清单手写 25 项，每项 `{ tag, name, hint }`，顺序按「布局 → 成品卡片 → 媒体数据」排——用户打 `/` 多半是想自己拼版，布局在前更好找。**新增组件时要同步这份清单**，否则它不会出现在菜单里（这是个静默遗漏，不会报错）。
- **清单里刻意不放 `<reading-path>` 和 `<left>` / `<right>`**（用户 2026-11-19 要求去掉）：`<reading-path>` 是自闭合组件、内容全靠抓文内 H2，用户没法在需求里描述它，插一个空壳进输入框只会让模型去凑标题；`<left>` / `<right>` 只在 `<compare>` 内部有意义，离开 compare 就是两个裸标签、什么也不渲染，插进需求会诱导模型单独做一栏。需要它们时用自然语言说，模型会放到该放的位置。
- **`findSlashQuery()` 的判据要比「斜杠后面有字母」更细**：`/(?:^|\s|[^\x00-\x7F])\/([a-zA-Z-]*)$/` 对光标前的文本求匹配。允许 `/` 前面是**任意非 ASCII 字符**（中文用户不打空格，「用/container 包起来」很常见），但 `/` 后面只认 ASCII 字母和连字符——所以「换成蓝色 / 标题再短一点」「换成蓝色/标题」这种正常中文句子里的斜杠不会误触发菜单。这两条判据缺一条就会坏：只认 `^|\s` 会让中文紧贴的写法失效；不限制 `\W` 之后的字符会让所有闲聊里的 `/` 都弹窗。
- **`filterMaterialCommands()` 不拿 `hint` 参与匹配**。曾经加过，结果打 `st` 会混进 `<positioned>`（它的说明里写着「叠在 stack 上」）。hint 是给已经看到条目的人做补充的，不是检索字段。排序是「标签前缀 → 标签包含 → 中文名」，同一档保持清单原顺序。
- **替换时既不补空格、也不现取 `selectionStart`**。不补空格是因为 `用<container> 包起来` 会平白多一个空格；不现取光标是因为鼠标点条目时 textarea 会失焦、某些情况下 `selectionStart` 会漂（实测点下去之后再读会偏一位，导致少替换一个字符、正文里留下 `用<text>t 包一段说明` 这种残字）。正确做法是 `refreshSlashMenu()` 命中那一刻把 `slashStart`（`/` 的下标）与 `slashCaret`（光标终点）一起记下来，`chooseCommand()` 只用这两个值；选完 `nextTick` 里再 `focus()` + `setSelectionRange()`，否则焦点还在被点掉的按钮上。
- 键盘与鼠标**共用一个入口** `chooseCommand()`：`ArrowUp` / `ArrowDown` 循环、`Enter` 与 `Tab` 确认、`Escape` 关闭；菜单开着时 `Enter` 必须 `preventDefault()` 并只做「选中」，否则会顺手把半截需求发出去。`isComposing || keyCode === 229` 的判断要放在**最前面**——中文输入法组词期间的回车是「上屏候选词」，不是确认。
- 输入提示同步改了：空态加了一行「想指定组件就打个 `/`」；两个 `placeholder` 末尾都带「打 / 插入组件名」，且**去掉了原来用 ` / ` 做分隔符的写法**（「换成蓝色 / 标题再短一点」），否则用户会以为那个斜杠是快捷入口。空态里原来那句「一次不满意就接着说」的分隔符同步换成顿号。

**AI 写作与 AI 素材的发送按钮贴在输入框右下角，只用图标**（用户 2026-11-18：「AI写作和AI素材，输入框的发送按钮，放到输入框右下角，类似 DSH 的发送，直接使用图标」）。两个面板的输入行结构一致：

- **`<div class="relative min-w-0 flex-1">` 包住 textarea，按钮 `absolute right-1.5 bottom-1.5`**。原来是 `flex items-end gap-2` 里并排的两个元素，按钮占掉一整列宽度，长输入时很挤；现在按钮叠在输入框内部、只占 28×28。
- **textarea 必须 `block` + `pr-11`**：`block` 是因为 textarea 默认 `inline-block`，父容器底部会留出行高间隙，导致 `bottom-1.5` 的按钮**看起来贴着输入框底边、上下不对称**（实测按钮底边间距 0px，右边 6px）；写成 `block` 后两侧都是 6px。`pr-11`（44px）是给图标的让位——没有它，长句会一直排到图标底下，读起来像被截断。
- 发送用 `<ArrowUp :size="15" :stroke-width="2.5" />`（实心主题色圆角块），生成中用 `<Square :size="11" fill="currentColor" />`（白底描边块）。**都用 `title` 属性而不是可见文字**：`title="发送（Enter）"` / `title="停止生成"`，既满足「直接使用图标」，鼠标悬停又能说明白。
- 禁用态用 `disabled:opacity-30`（原来是 `opacity-40`）——图标本来就小，透明度太高会看不出还在。
- **两个面板要一起改**：`AiWriteDialog.vue` 与 `AiMaterialDialog.vue` 各写各的输入行，没有共用组件。改完记得 `Square` / `ArrowUp` 两个图标在**两个文件的 import 块里都要加上**（`lucide-vue-next`），漏一个就是运行时空组件、按钮变空白方块。

---

**格式化要让素材注释贴紧素材代码**（`utils/markdownFormatter.ts`）。`formatMarkdown()` 里新增两条注释行识别（`isMaterialStartLine()` / `isMaterialEndLine()`，来自 `materialBoundary.ts`），四件具体的事：

- **`<!-- 素材开始 -->` 后面的空行全部丢掉**。判据看的是「输出缓冲末尾那一行是不是开始注释」（`lastIsMaterialStart()`），不是「上一行是开始注释」——连续多个空行会被逐个丢掉，一次收紧 3 个也只记一次循环。**不能只丢一个**，手写时常见连按两次回车。
- **`<!-- 素材结束 -->` 前面攒下的空行全部撤掉**：进到这一行时先 `while (out 末尾是空行) out.pop()`，再 push 注释。这样「代码 → 空行 → 注释」变成「代码 → 注释」，无论中间有几个空行。
- **结束后要留一个空行**：置 `pendingBlank = true`，由下一个非空行触发 `settlePendingBlank()` 补出来。这两条与原有的「块级组件闭合后补空行」共用同一个欠账机制，不另起一套。
- **开始注释自己也要和上文隔开**：`out` 非空且末尾不是空行时走 `ensureBlankBefore()`，否则它会粘在上一段正文末尾。但 `ensureBlankBefore()` 里加了一条豁免——**末尾是开始注释就直接返回**，否则「开始注释 → 代码」之间又会被补出一个空行，跟第一条自相矛盾。

**两个顺序上的坑**：

1. **注释判定要放在 `settlePendingBlank()` 之前**。上一行若是刚闭合的块级组件，`pendingBlank` 会在 `settlePendingBlank()` 里补一个空行，结束注释紧接着又把它删掉——文本结果正确，但 `blankInserted` 与 `materialTightened` 各多记一次，第二次格式化的 `stats` 就不再是全 0（`idempotent` 的文本相等仍然成立，但「能否报『已经是规范格式』」靠的是 `changed`，这次侥幸没坏）。把注释分支提到 `settlePendingBlank()` 前面就干净了。
2. **`justOpenedMaterial` 这类「一次性标志」不可靠**：初版用「刚输出开始注释 → 下一个空行丢掉并把标志置 false」，遇到连续两个空行时只丢第一个。改成用 `out` 缓冲的真实内容判断（`lastIsMaterialStart()`），天然支持任意个连续空行。

**`FormatStats` 新增 `materialTightened`**（`describeFormatStats()` 拼成「收紧素材注释 N」），只在这两处增删空行时累加。**没有新增 `blankCollapsed` 的计数**：那些被撤销的空行不是「连续空行收敛」，混进同一个计数会让提示文案误导人。

**验证口径**：`formatMarkdown()` 必须幂等——连跑两次，第二次 `changed: false`、`stats` 全 0。已测 7 个用例：多空行在开始后 / 多空行在结束前 / 单行组件素材 / `<html>` 素材 / 素材在文档最开头 / 素材在文档最结尾 / 没有注释的普通组件，全部 `idem: true`。

---

**AI 素材的说明收在素材卡头部的问号里，悬停展开**（用户 2026-11-18 五轮调整：先要「右上角提示后面加一个问号说明：生成的素材不一定在微信编辑器能够正确显示，需要自行预览调整」→ 改口「把这个提示加到会话里，左上角，去掉左上角素材后面的字数和分钟」→ 再加「可复用的素材可以点击清空编辑器再插入，然后保存到素材库」→ 最终「所有提示都加到这个位置，hover 的时候显示，不要加 title 说明」。）

**位置**：每张素材卡头部「素材」二字的右侧、`ml-auto` 那组「预览 / 源码」按钮的左边。触发元素是 `HelpCircle` 13px 的 `<span data-material-hint>`，`cursor: help`。

**唯一入口是问号，且是悬停触发**：两条说明都在浮层里，正文中不再有任何常驻提示行。

- 第一条：「生成的素材不一定在微信编辑器里正确显示，插入后请自行预览、按需调整。」
- 第二条：「可复用的素材可以点「清空编辑器再插入」，再点顶部的「保存素材」存进素材库。」
- 两条都是**踩过坑才想起来看**的内容，常驻占地方、藏进页脚又看不见，折中成悬停才展开。

**不要加 `title` 属性**：用户明确否掉了原生 `title`——原生提示延迟一秒、样式跟界面不搭、移动端点不出来，而且浮层里内容和 `title` 会重复显示两份。触发元素上**不能有 `title`**，只有自定义浮层。

**浮层必须 Teleport 到 body，不能用 `absolute`**：素材卡外壳是 `overflow-hidden rounded-xl`（内部渲染的素材自带圆角底色，要裁掉溢出），`absolute` 浮层会被直接裁没。所以是 `<Teleport to="body">` + `position: fixed` + 悬停那一刻用 `getBoundingClientRect()` 算出的坐标（`hintPos`），宽度固定 246px，右侧越界往左收、下方空间不够就翻到问号上方。

**悬停联动靠一个 160ms 的关闭定时器**（`scheduleHintClose()` / `cancelHintClose()`）：问号与浮层之间隔着 6px，直接 `mouseleave` 就关会让鼠标横穿缝隙时闪一下。问号与浮层各自 `mouseenter` 时取消定时器、各自 `mouseleave` 时启动定时器，所以移进浮层不会关，移出两处任何一处 160ms 后才关。`onBeforeUnmount` 里要 `clearTimeout`，否则组件卸载后定时器还会写 `hintOpenId`。

**窗口级监听只留 scroll 与 resize**：浮层是 `fixed` 定位，滚动/resize 后坐标会飘，直接收掉；`scroll` 必须用 `capture: true` 挂在 window 上，否则滚动区内部的滚动冒不出来。**不需要再挂 `click` 监听**——悬停展开的浮层，鼠标移开就关了，点外部没有额外意义。

**`Info` 图标与顶部提示条已整块删除**：原来 `v-else` 对话区顶部有一行常驻 `Info` + 灰字，点「所有提示都加到这个位置」后整条去掉，`lucide-vue-next` 的 `Info` import 也一并移除。头部倒计时胶囊旁边的 `HelpCircle` + `BaseTooltip` 那版更早就被否掉了，**不要再改回悬浮气泡、常驻提示条或原生 title**。

**`draftStats()` 与 `import { countChars }` 已整块删除**，不要为了算字数把它们加回来。字数信息在编辑器右侧预览区的阅读统计里看。

---

### `<html>` 块里的样式必须写成行内 `style="…"`

用户原话（2026-11-18）：「我的指令不好使了， 加一个要求，html必须使用行内样式」——「指令不好使了」是说光在 prompt 里叮嘱压不住模型，它照样写 `class="card"`。所以这条要代码侧硬拦。

**为什么必须是行内样式**：微信编辑器会把 `class` 属性整个丢掉，也从不加载任何外部样式表。`<div class="card">` 粘进公众号就是一块**没有任何样式的裸 div**；`<style>` 标签会被过滤（而且本来就在 `FORBIDDEN_HTML_TAGS` 里）。只有元素上的 `style="padding:16px;border-radius:12px"` 能活下来。

**三层一起上，缺一层都压不住**

1. **`findClassStyledTags(md)`**（`src/utils/aiMaterialPrompt.ts`，紧跟 `findForbiddenHtmlTags` 之后）：`splitHtmlBlocks()` 取出所有 `<html>` 块，逐块用 `/<([a-z][\w-]*)\b([^>]*)>/gi` 扫开标签，属性串里命中 `\bclass\s*=` 就把 tag 收进去（去重）。**只扫 `<html>` 块内部**——块外的组件标签不在微信的透传路径上，不该报。
2. **`checkMaterialOutput()` 里报成硬错误**（排在 `findForbiddenHtmlTags` 之后）：命中就返回「`<html>` 块里用了 `class`：`<div>`、`<h3>`——微信编辑器会丢掉 class，样式必须写成行内 `style="…"`」。这是**会触发重试**的那一类，不是软提示。
3. **`collectWarnings()` 里再软提示一遍**（`src/views/editor/components/AiMaterialDialog.vue`，排在 `findShapeProblems` 之前）：重试 2 次后仍带着 `class` 的话，至少让用户看见哪儿有问题。同一处还补了 `findForbiddenHtmlTags` 的软警告（`<script>` / `<style>` / `<iframe>` / `<video>` 之类）。

**只报不改**：`findClassStyledTags()` 没有对应的修复函数，`repairMaterialOutput()` 对带 `class` 的输入**原样返回、`notes: []`、幂等**。原因很直接——模型写的 class 名字（`card` / `card-title` / `list`）对应什么样式，代码侧猜不出来，硬猜只会把版式改坏。这条只能靠 prompt 说清 + 质检驳回让它重写。

**注意别过度收紧**：检查只针对 `class`，**不要求每个标签都带 `style`**。`<html><div><h3>x</h3></div></html>` 这种纯文字排版是合法的（`check === null`）——否则模型为了凑样式会把简单结构写复杂。混合写法（既有 `class` 又有 `style`）**照样报**，因为 class 那部分样式必然会丢。

**prompt 侧三处同步**：`buildMaterialSystemPrompt()` 输出契约第 6 条末尾追加「`<html>` 里的所有样式必须写成行内 `style="…"`：不许用 `class`、不许写 `<style>` 标签、不许引用任何外部样式表」；`buildMaterialRetryMessage()` 在「必须整段包在 `<html>` 里」那条之后追加「在 `<html>` 里用 `class` 挂样式 → 微信会丢掉，写 `class="card"` 等于没写样式」；`SKILL.md` 的「原生 HTML 兜底 `<html>`」小节新增「样式一律写成行内 `style="…"`，这是硬要求」整段，✅ 正例改成每个标签都带 `style`，新增 ❌ 反例二（用 class 挂样式），铁律第 6 条末尾也补了一句。

**验证**（浏览器单测 + 真实生成）：带 `class` 的 `<html>` 块 → `check` 报 class、`findClassStyledTags` 返回 `['div','h3']`；全行内同结构 → `check === null`；`class`+`style` 混写 → 仍返回 `['div']`；完全无 `style` 的纯文字版 → `check === null`；块外的 `<title>` 组件 → `[]`；`repairMaterialOutput` 幂等不动它。真实生成「纯 HTML 温馨提示卡片」→ 输出全是行内 `style`，`hasClass: false`、`hasStyle: true`。


---


### `<html>` 块里只用 `<section>`，别碰微信用不了的 CSS

用户原话（2026-11-18）：「不用使用div, 使用section」。前一条要求是「html必须使用行内样式」，这一条紧接着把标签名也收窄了。同时按用户「查询哪些 CSS 样式在微信编辑器里不支持，并把这些规则直接写进 AI 素材的提示词过滤掉」的要求，核了两份资料后把整批规则落成了代码。

**核查来源（2026-11 核对，改动前先回看这两处）**

- 微信官方《微信公众平台编辑器插件开发规范》：<https://developers.weixin.qq.com/doc/subscription/guide/product/plugin_spec.html>（1.3 行高、1.4 宽度、1.5 零高、1.6 `text-align:start|end`、1.8 `<pre>` 包正文、3 不建议设 `font-family`、4.5.2 不要用 `!important`）。
- 归零数媒《WeChat Article Code 白名单 2026 Q4》：<https://zer0n.cn/whitelist>（实测「服务器保存时到底删什么」——CSS 属性里只删 `position` 与 `filter`，`--` 开头的自定义属性整条删，`url()` 只认四个公众号图床域名，`id` / `on*` 被删）。

**为什么这条必须代码侧拦**：这些写法在编辑器预览里**完全正常**，粘进公众号才散版，而且不报任何错。光在 prompt 里叮嘱压不住——模型看不到自己写错了。

**`src/utils/wechatHtmlRules.ts`（新建）**

- `interface WechatHtmlIssue { text: string; blocking: boolean }`。`blocking: true` 是「微信会直接删掉或破坏版式」，质检驳回重写；`false` 是「能用但会变味」，只在面板提示一句——否则为 `font-family` 这种小事白烧两次重试。
- `scanHtmlBlock(block)`：先用 `STYLE_ATTR_RE` 抓每个开标签的 `style`，用自己写的 `splitDeclarations()` 拆声明（手写扫描器跟踪 `(`/`)` 深度，跳过 `url(data:…)` 里的分号，别用 `split(';')`）；再扫标签名与属性；最后三条独立检查（`<pre>` 含着成段中文且没 `<code>`、`<td>` 写死 px 宽）。
- `convertDivToSection(text, notes)`：`/<(\/?)div\b/gi` → `<$1section` 的**无损改名**，不等模型重写。note 去重。
- `WECHAT_BANNED_SUMMARY` 是给提示词用的一句话清单，改规则时和 `scanDeclaration()` 里的同级条目一起改。

**分档口径（改之前想清楚属于哪一档）**

- **blocking**：`position`（连带 `top`/`left`/`right`/`bottom`/`inset`/`z-index`）、`filter`、CSS 变量 `--x`、`text-align: start|end`、`on*`、`url()` 里的外链与 `data:`、`url(#x)` 引用（渐变/裁剪，`id` 被删后指不到）、`calc()` 里带空白加减号或乘号、`<div>`、`<pre>` 包正文。这些会让版式真散掉。
- **非 blocking**：`font-family`、`!important`、`opacity:0` 的 `<img>`、`<td>` 写死 px 宽、**没被 `url(#x)` 引用的 `id`**（包括 SVG 的 SMIL 触发锚点，见下文「交互 SVG」——拿它拦会把交互素材全废掉）、`button` / `details` / `marquee` / `math`（会被拆得只剩文字，给替代建议）。

**四处接入**

1. `aiMaterialPrompt.ts` 的 `findWechatHtmlIssues(md)`：`splitHtmlBlocks()` 逐块 `scanHtmlBlock()`，按 `text` 去重。**只扫 `<html>` 块内部**，块外的组件语法不受微信那套规则约束。
2. `checkMaterialOutput()` 在 `class` 那条之后只取 `blocking` 的报成硬错误（触发重试），文案前缀「`<html>` 块里有微信不支持的写法：」。
3. `repairMaterialOutput()` 里 `<div>` → `<section>` 放在 `restoreHtmlBlocks()` **之前**逐块处理：那块是原生 HTML，不能过按组件语法写的 `repairMarkup()`，改完再还原。
4. `collectWarnings()`（`AiMaterialDialog.vue`）只把非 blocking 那批当软提示，文案尾部补「（编辑器里会照常显示，粘进公众号才失效）」——不这么说用户以为已经好了。

**`id` 那一档后来改过**：最初是「见 `id` 就 blocking」，但交互 SVG 必须用 `id` 当 SMIL 触发锚点（`begin="reveal.click"`），实测把整类素材都拦掉了。现在只拦「被 `url(#x)` 引用」的 `id`，其余降级成软提示。判据与理由见下文「交互 SVG」一节。

**prompt 侧同步**：`buildMaterialSystemPrompt()` 输出契约新增第 8 条（只用 `<section>` 不用 `<div>`）与第 9 条（`position` / `filter` / CSS 变量 / `!important` / `font-family` / `text-align:start|end` / `id` / `on*` 全列一遍，并写明「图片一律不写 `url()`，需要配图留空 `src`」）；`buildMaterialRetryMessage()` 追加 `<div>` 与这条 CSS 清单；`SKILL.md` 的「原生 HTML 兜底 `<html>`」小节新增「只用 `<section>`，不要用 `<div>`」段 + 一张「别写 → 会怎样 → 换成」的对照表 + ❌ 反例三（绝对定位 + CSS 变量 + 外链背景图），铁律新增第 10 条，正例与反例里的 `<div>` 全部换成 `<section>`，`<details>` 也从「什么时候用它」的示例里去掉了（它会被拆）。

**验证**（浏览器单测）：`<div>` 版本 → `repairMaterialOutput` 改成 `<section>` + 一条 note，`check === null`，幂等；`position` + CSS 变量 + 外链 `url()` + `filter` + `id` + `onclick` 六项全被 `blocking` 命中，`check` 逐条拼出原因；`font-family` + `!important` + `opacity:0` 三项为非 blocking 且不进 `check`；全行内 `<section>` 版本 → `check === null`、`issues === []`、`notes === []`。

---

### 交互 SVG：像 `<html>` 一样整块遮起来（2026-11 新增）

AI 素材的 `/` 菜单里有「交互 SVG」，模型会产出整块 `<svg>`（公众号里脚本被禁，点击揭晓、逐条浮现这类效果只能靠 SVG + SMIL）。**`<svg>` 不能被当成我们自己的组件**，也不能被当成普通 Markdown，所以它需要和 `<html>` 同一套遮罩待遇。

**为什么必须遮**（不遮的话三处检查会集体误伤，症状和 `<html>` 当初一模一样）：

1. `findUnknownTags()` 把 `<svg>` / `<rect>` / `<circle>` 当自造组件驳回，报「用了不存在的标签」。
2. `findIllegalAttrs()` 拿组件属性表去查 `viewBox` / `fill` / `stroke-dasharray` / `fill-opacity`，全是「非法属性」。
3. `splitInlineBlocks()` 把单行紧凑的 SVG 当块级组件硬拆成三行，图形全乱。

**落地的四件事**

1. **`splitVerbatimBlocks()` / `restoreVerbatimBlocks()`**（`src/utils/aiMaterialPrompt.ts`，紧跟 `restoreHtmlBlocks()` 之后）：**先遮 `<html>` 再遮 `<svg>`**（顺序不能反，`<html>` 里可能嵌 `<svg>`，先遮 svg 会把 html 块切碎），占位符分别是 `\u0000rmhtml{i}\u0000` 与 `\u0000rmsvg{i}\u0000`。`repairMaterialOutput()` 改成 `splitVerbatimBlocks()` → `repairMarkup()` → `<html>` 块 `convertDivToSection()` → `restoreVerbatimBlocks()` → `wrapInContainer()`。
2. **三个「组件视角」检查器的入口换成 `masked`**：`findIllegalAttrs()` / `findShapeProblems()` / `findUnknownTags()`。反过来，**按微信规则判断的那几处（`findForbiddenHtmlTags` / `findClassStyledTags` / `findWechatHtmlIssues`）故意只用 `splitHtmlBlocks()`、不遮 SVG**——纯 SVG 素材本质是「原生 HTML 透传」，微信规则该照查。
3. **`wrapInContainer()` 放行整块 SVG**：新增 `isWholeSvg(body)`，**判断前先剥掉 `<!--…-->` 注释**再匹配 `/^<svg\b[\s\S]*<\/svg>$/i`。不剥注释的话，带 `<!-- 素材开始 -->` 的 SVG 会匹配不上、被误判成「多块拼接」又套一层 `<container display="block">`（踩过）。输出契约第 7 条也相应改成三档：单组件不包 / `<html>` 块与整块 `<svg>` 不包 / 只有多块拼接才包。
4. **`HAND_BUILT_TAGS` 加 `'svg'`**（`= ['row','column','text','stack','positioned','html','svg']`），让 `checkMaterialIntent()` 对「做一个交互 svg」这类需求直接放行，不走成品组件那套意图检查。「一个组件都没用」的判定改成 `used.some(t => blockTags.has(t) || t === 'svg')`，否则纯 SVG 素材会被报「通篇是普通 Markdown」。

**`<details>` 要硬拦**：模型一开始想用 `<details>` + `<summary>` 做点击揭晓（跑了 3 轮真实生成，前两轮都是这个写法）。它在编辑器里看着能折叠，粘进公众号会被拆开、内容全部平铺，交互完全消失。`checkMaterialOutput()` 里现在是 blocking 硬错误，文案直接给替代方案（`<svg>` + SMIL 的 `<animate>` / `<set>`，`begin="click"` 或 `begin="触发区id.click"`）。

**`wechatHtmlRules.ts` 里 `id` 的分级（这条最容易搞错）**：交互 SVG 恰恰**必须**用 `id` 当 SMIL 触发锚点（`<g id="reveal">` + `begin="reveal.click"`），而微信会删 `id`。原来的规则「见 `id` 就 blocking」会把所有交互素材废掉。现在的口径：

- **被 `url(#x)` 引用的 `id`**（渐变填充、`clip-path`、`mask`）→ blocking。`id` 被删后引用指不到，效果整块失效，这条单独查 `/url\(\s*#([\w:.-]+)\s*\)/i`。
- **其余 `id`**（包括 SMIL 触发锚点、模型随手给 `<g>` 起的名字）→ 只留一句**非 blocking** 软提示。`id` 是交互本体，删了触发就没了；但微信到底删不删、删了是否只影响样式，实测口径不完全一致，所以不拿它拦生成。

**`SKILL.md` 新增「### 交互 SVG `<svg>`」整节**（在「阅读路线 `<reading-path>`」之前）：可跑的点击揭晓示例、尺寸与安全边（`width="100%"` + `viewBox`、宽度固定 400、内容 x=18..382、字号 ≥14 / 主文案 16 / 图注 12.5、只用 `x`/`y`、禁 `<foreignObject>`/`<style>`/`<image>`、不要外套 `<container>`）、SMIL 三条铁律（动画只能改属性拥有者直接父元素上的属性；裸 `click` 只认宿主自身，跨元素必须 `父级id.click`，延迟写 `父级id.click+0.3s`；后画的压在上面会抢点击）、其它必守（隐藏用 `visibility` 不用 `opacity:0`；`<animate attributeName="height">` 无效，真要增高得动画 `viewBox`；id 一律带 `wci01`/`wci02` 前缀；**`<text>` 上不要写 `id`**；配色板）；需求映射表加两行（「点一下就动」→ `<svg>`）；铁律第 5、9 条同步（`<html>` 与 `<svg>` 块内部都不受白名单约束、都不套容器）。

**验证**：合法交互 SVG → `findUnknownTags` / `findIllegalAttrs` / `findShapeProblems` 全空、`checkMaterialOutput === null`、`repairMaterialOutput` 幂等；带边界注释的 SVG 原样返回不包容器；组件 + SVG 混排才包 `<container display="block">`；`<html>` 里嵌 SVG 不额外报错；单行紧凑 SVG 不被拆行；`url(#g1)` 渐变仍被 blocking；真机（预览区 660px）点击 `#reveal` 后 `#hint` 的 opacity 1→0、`#ans` 0→1，插入编辑器后带 `<!-- 素材开始 -->` 且 `<animate begin="reveal.click">` 完整保留。

---

### `<html>` 块里不许出现组件（`<img>` / `<svg>` 除外）

**用户原话（2026-11-18）**：「注意一下，html组件内部不要出现自定义组件， 除了img 和 svg 标签，因为html里面的内容直接按html解析」。

**为什么**：`<html>` 组件的 `render()` 就是 `return body`，块内不会再走一遍组件解析。实测 `parseMarkdownAsync('<html><section …><title subtitle="x">把复杂的事讲简单</title></section></html>')` 输出里 `<title subtitle="x">把复杂的事讲简单</title>` **原样留在 HTML 里**（`<steps>` 同理，108 字符原样吐出）。也就是说读者看到的是 `<steps title="三步">` 这行源码，而不是渲染好的卡片。`<img>` 与 `<svg>` 在块内正常透传，所以例外只有这两个。

**实现**（`src/utils/aiMaterialPrompt.ts`，紧挨 `findForbiddenHtmlTags` / `findClassStyledTags` 那组）：

- `findComponentsInHtml(md)`：`splitHtmlBlocks()` 取出每个 `<html>` 块 → 先 `replace(SVG_BLOCK_RE, '')` 整块剥掉 SVG → 再用 `/<([a-z][\w-]*)\b(?=[\s/>])/gi` 扫开标签 → 命中 `components` 名单且不在两个白名单里就记下（去重）。
- 两个白名单：`HTML_INLINE_OK = new Set(['img'])`（原生标签，块内合法）；`HTML_NATIVE_OVERLAP = new Set(['html', 'table'])`（`html` 是块壳自身，`table` 既是组件又是标准 HTML，块里写 `<tr><td>` 是正常用法）。
- `checkMaterialOutput()` 里是 **blocking**（触发重试），排在「禁用标签」之后、「`class`」之前：文案「`<html>` 块里混进了 R-Markdown 组件：…——`<html>` 里的内容按原生 HTML 直接输出，组件不会渲染，读者看到的是源码本身。块内只能用原生 HTML 标签、`<img>` 和 `<svg>`；要放组件请把它们移到 `<html>` 外面」。
- `collectWarnings()`（`AiMaterialDialog.vue`）也加一份软提示：重试两轮仍没改对时，用户至少知道问题在哪。

**三个容易踩的点**

1. **`html` 必须进白名单**。`splitHtmlBlocks()` 取出的块首尾就是 `<html>` / `</html>`，不排除就会每块都报「混进了 `<html>`」，所有纯 HTML 素材全被拦。
2. **`<svg>` 里要剥掉再扫**。SVG 的 `<text>` 与我们 `<text>` 组件同名，不剥就会把每个带文字的 SVG 误报成「块里混进组件」。
3. **`table` 也要排除**。`<table>` 既是我们的组件又是标准 HTML，块内写原生表格完全合法。

**prompt / SKILL / 文档同步**：`buildMaterialSystemPrompt()` 输出契约第 6 条追加「`<html>` 块内部按原生 HTML 直接输出，组件不会被解析——块里只能出现原生 HTML 标签、`<img>` 与 `<svg>`…要放组件就放到 `<html>` 外面」；`buildMaterialRetryMessage()` 追加对应条目；`SKILL.md` 的「原生 HTML 兜底 `<html>`」小节新增「块里只能出现原生 HTML 标签、`<img>` 和 `<svg>`，不许放 R-Markdown 组件」段（含「组件写在 `<html>` 外面」的正例）+ ❌ 反例四（把 `<steps>` 塞进块里），铁律第 5 条补「反过来的边界同样不能越」。

**验证**（浏览器单测 + 真实生成）：`<steps>` / `<title>` 塞进块内 → `check` 报出对应标签、`findComponentsInHtml` 返回 `['steps']` / `['title']`；`<img>`、原生 `<table>`、块内 `<svg>`（含 `<text>`）、全 `<section>` 纯 HTML → 全部 `check === null`、`[]`；块外的 `<steps>` 不受影响；`repairMaterialOutput` 对块内带组件的输入**原样返回、`notes: []`**（只报不改，往哪搬得靠模型判断）。真实生成「温馨提示卡片 + 卡里放三步流程」→ 模型正确地全部写成原生 `<section>` / `<h2>` / `<p>` / `<span>`，`warn: no-warn`、无组件混入。

---

### mermaid 预览：统一走 `renderMermaidInHtml()`，别再各写一遍判断

`parseMarkdownAsync()` 只把 `<mermaid>` 渲染成一个**空占位块**（`.mermaid-block` > `.mermaid-svg-container`），真正的图是 `useMermaid().renderAll()` 用 JS 画成 `<img>`（base64 PNG）塞进去的——因为 mermaid 要量真实尺寸，必须挂到 document 上才能画。

四个地方都要「先渲染成 HTML 再显示」：AI 素材面板的素材卡、素材库卡片（`MaterialCard.vue`）、素材库页面（`MaterialLibraryPage.vue`）、组件选择器（`ComponentPickerDialog.vue`）。它们原先各自复制了一段「判断 + 临时容器 + renderAll + 取回 innerHTML」，而**判断条件写的是 `html.includes('class="mermaid"')`——那是更早版本的类名**。`Mermaid_DA01.render()` 现在产出的是 `class="mermaid-block"`，条件永远不成立，`renderAll()` 从没被调用过，于是这几处预览里 mermaid 一直是空白。编辑器右侧的 `Preview.vue` 是无条件调 `renderAll()` 的，所以「插入编辑器后就能预览」——这个对比正是用户报的现象。

现在的口径：

- 判断和挂载逻辑收进 `src/composables/useMermaid.ts` 的两个导出：`hasMermaidBlock(html)` 和 `renderMermaidInHtml(html)`。调用点只需 `html = await renderMermaidInHtml(html)`，无需 `if`、无需自己建临时容器。
- **类名只写在这一个文件里**。组件改名时不会又漂掉一批调用点；要改判断逻辑也只改一处。
- `renderMermaidInHtml()` 内部用 `position:absolute; visibility:hidden` 挂到 body，`finally` 里 `removeChild`（即使渲染抛错也不留垃圾节点）。
- 没有 mermaid 块时直接原样返回，不挂 DOM。`Preview.vue` 走的是另一条路（增量渲染 + 已渲染块缓存，避免闪烁），保持原样别动它。

### 用户点名了组件就照办，没点名就手搭（2026-11 新增）

需求原话（用户）：

> 如果用户指定了使用哪个组件，明确优先告诉AI使用指定组件，并明确组件的属性语法， 不要乱用
>
> 如果没有告知，优先使用html 或 容器组件（container、text等）

两条方向相反的规则，所以先要能**判断出用户到底有没有点名**，再决定走哪条。判断不准的代价是双向的：把「做成三步流程」误判成点名 `<steps>`，会锁死版式；漏判「用 badges 组件」，模型就会去手写 `<html>` 画一排圆角 `<span>`（实测每次都是）。

**`findNamedComponents(requirement)`（`src/utils/aiMaterialPrompt.ts`）** 认四种写法，只认 `@/extension` 注册表里的 tag（外加 `svg`，它是解析器整段透传的原生标签，不在注册表）：

| 写法 | 例子 |
|---|---|
| 标签原文 | `<steps>`、`</steps>`、`<steps/>` |
| `/` 快捷插入 | `/steps`（`/` 前不能是字母数字，免得把 `and/or` 切出个 `or`） |
| 动词 + 标签名 | 「用 steps 组件」「换成 badges」「用 mermaid 画」——**必须带动词或「组件」二字** |
| 裸 `svg` | 「做一个点击揭晓的 svg」「做成 svg 动画」——它没有中文名，用户从不说「svg 组件」，所以只对它单独放宽 |

**否定语境不算点名**：`negated(index)` 往匹配位置前面看 4 个字符，命中 `不 / 别 / 勿 / 禁` 就跳过。真实说法「用 badges 组件，不要用 html」后半句也含 `用 html`，不拦就会把 `<html>` 也当成点名，和用户意思正好相反。窗口只开 4 字符是刻意的——放大到整句会把「不需要花哨，用 steps」误伤成否定。

**点名时要给的不是「用 `<steps>`」这句话，是能照抄的写法**：`componentDeepReference(tag)` 从组件定义里现取（不是硬编码清单）该 tag 全部变体的中文名、`allowedAttrsByTag()[tag]`、每个属性的 `options` / `default` / `description`，再附上组件自己的 `example` 逐字示例。属性表只说「有 `bg` 这个键」，模型照样会写成 `background="…"`；给一行完整标签，属性名、引号、body 分隔形状全都对上了，才算「明确属性语法」。`svg` 单独返回手写矢量图的三条要点。

**投放位置是 user message，不是 system prompt**：`renderNamedComponents(requirement)` 的结果由 `buildMaterialUserMessage()` / `buildMaterialFollowUpMessage()` 拼成 `<点名组件与写法>` 段。原因是它属于**这一轮**的约束——上一轮点名 `<steps>`，这一轮改口要 `<compare>`，只有按轮次投递才跟得上。system prompt 里放的是两条通则（契约第 5 条「没点名时默认优先自己搭」、第 10 条「点名了就必须用点名的那一个」）。

**点名还等于把范围压到最小**：`checkNamedOnly(requirement, text)` 拦「点名了 `<mermaid>`，却额外配了一段 `<steps>` 把同样的流程又用文字讲一遍，外面还套一层 `<container>`」。实测就是用户 2026-11-19 报的那一版——他要的是「A 到 B、B 到 C 的流程图」，交回来一张图 + 一段同义文字 + 一层容器。用户的原话是「要限定非常小才可以」。

判据是「输出里出现了**点名标签之外**的组件 tag」（`container` 也算，单个组件不该套容器）。豁免靠 `ADDITIVE_HINTS = ['再','加','配','附带','同时','顺便','以及','还有','接着','跟着']`——需求里出现这些词说明用户明确想多要一块，从宽放行（误放一次只是多给内容，误拦一次是把「我要两块」驳回成一块）。

**质检**：`checkNamedComponents(requirement, text)` 排在 `AiMaterialDialog.vue` 的 `judge` 链最前面（`checkMaterialOutput` 之后、`checkMaterialIntent` 之前）。它**不看 `HAND_BUILT_TAGS` 放行**——判据来自用户白纸黑字，命中就是硬错；而 `checkMaterialIntent` 那套词表猜出来的期望，才需要给手写版式留口子。

**默认口径的表述改了三个地方**（都要一起改，少一处模型就会两头看）：

- 输出契约第 5 条：没点名时「能对上映射表里的专有组件才用，对不上的版式优先用 `<container>` `<row>` `<column>` `<text>` 拼，或者整段交给 `<html>`——不要为了用上组件把内容硬塞进不相干的卡片」。
- 输出契约第 10 条（新增）：点名了就必须用点名的那一个，不许换性质相近的组件、不许绕成 `<html>`。
- `SKILL.md`「第一步：先判断用哪个组件」开头改成「先看用户有没有点名」+ `>` 引用块写「默认口径是够用就手搭」；铁律第 1 条结尾、新增第 11 条同步。
- `buildMaterialRetryMessage()` 加一条「无视了用户点名的组件」。

### Beta 角标：只有一个组件，四处共用

「AI 素材」后面那个 `Beta` 角标是 `src/components/BetaBadge.vue`，在四个地方各挂一次：`AiBoard.vue` 的标签页（`TABS` 里 `beta: true`）、`EditorSidebar.vue` 的 AI 子菜单、`mobile/MobileActionsMenu.vue` 的移动端更多菜单、`SettingsBoard.vue` 的「AI 素材」设置卡（走 `SettingsCard` 的 `#action` 插槽）。

要点：

- **不要在各处自己写 `<span>`**。同一个名字分散在四处，各写一遍迟早会写歪（字号、圆角、深浅各不相同），改文案时也会漏。要加新入口就 import 这个组件。
- **配色全部用 `color-mix(in srgb, currentColor 14%, transparent)` 跟着所在元素的文字色走**。所以灰色菜单项上是浅灰底、主题色选中的标签页上是浅白底、深色模式下自动变淡白底——都不需要为某个位置单独调样式。
- 已实测的四处渲染：侧栏子菜单 `32×14`、AI 面板选中标签页（白字 + 14% 白底）、设置页卡片右上角、移动端菜单单行。
- **移动端菜单的宽度是配套的**：`MobileActionsMenu.vue` 的容器是 `w-36`（144px），19 个 `.mobile-action-option` 都带 `whitespace-nowrap`。原来是 `w-32`，加上角标后「AI 素材」被挤成「AI 素」「材」两行——**再往菜单里加字或加角标时要一并放宽 / 保住 nowrap**。
- 写 HTML 注释解释这段时，**注释必须在 `<div` 的上一行，不能夹在 `<div` 与属性之间**：Vue 编译器会报 `SyntaxError: Opening tag "div" not terminated`，prettier 也跟着失败。

### AI 排版遇到素材注释：整段遮起来，原封不动吐回去

**要求**：文章里带 `<!-- 素材开始 -->` / `<!-- 素材结束 -->` 的素材块，排版之后必须和排版前**逐字节一致**。

**光在 prompt 里叮嘱压不住**。素材是别的 AI 按编辑器语法拼出来的成品（自由拼版的 `container`/`row`/`column`，或者整段原生 HTML），排版模型只要动它一下——补个空行、换个组件、把 `<text>` 里的字拆成段落——渲染出来就不是原来那版了，而且这种破坏肉眼几乎看不出来（不像丢字那样一眼能发现）。所以做两件事：

1. **代码侧整段遮罩**（`src/utils/aiFormatPrompt.ts`）：
   - `maskMaterialBlocks(md)` → `{ text, tokens }`，把 `^[ \t]*<!-- 素材开始 -->[\s\S]*?<!-- 素材结束 -->[ \t]*$` 整段换成 `{{RMMAT_n}}`，原文存进 `tokens`。
   - `unmaskMaterialBlocks(text, tokens)` → `{ text, restored, missing, dropped }`，还原并清掉模型臆造 / 越界的占位符，返回 `missing`（模型整段丢掉的素材序号）。
   - **遮罩顺序**：`maskMaterialBlocks()` 必须在 `maskImageTokens()` **之前**跑。先遮素材，素材内部的本地图片就一起被藏住；反过来会把素材里的 `<img src="data:…">` 单独抽成 `{{RMIMG_n}}`，还原时素材内部结构就变了。还原顺序相反（先素材后图片）。
2. **prompt 里加一条保真铁律**（`buildSystemPrompt()` 第 7 条）：`{{RMMAT_n}}` 代表一段成品素材，必须原样照抄、单独占一行、留在原位置；不要展开、不要改写、不要拆分、不要重排、不要套额外组件。

**一个连带坑：模型爱给占位符包一层 `<p>`**。素材里是块级组件（`<container>` / `<steps>` / `<html>`），塞进段落里会渲染错乱。所以 `unmaskMaterialBlocks()` 还原后有一步——把「只包着素材、没别的内容」的 `<p>` / `<div>` / `<section>` 壳拆掉（`/<(p|div|section)(?:\s[^>]*)?>\s*(<!-- 素材开始 -->[\s\S]*?<!-- 素材结束 -->)\s*<\/\1>/g` → `$2`）。段落里除了占位符还有别的文字的，一律不动（那是模型正常的行文）。

**验收口径**（改这块之后照这个跑一遍）：
- 往返一致性：`unmaskMaterialBlocks(maskMaterialBlocks(doc).text, tokens).text === doc`。
- 素材块里含 base64 图片 → 只产生 1 个 `{{RMMAT_1}}`，不产生 `{{RMIMG_n}}`。
- 只有开始注释没有结束注释 → 不遮（否则会吞掉半篇文章）。
- 模型丢占位符 → `missing: [n]`，面板提示「有 N 段素材未能保留…需要手动贴回」；模型多写占位符 → `dropped` 计数。
- **真实端到端**：编辑器里放一篇「正文 + 素材块 + 正文」，AI 排版 → 素材块 438 字节逐字节一致，前后正文确实被重排（`sameBytes: true` 且 `proseChanged: true`）。
