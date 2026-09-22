# R-Markdown 编辑器

> 专为微信公众号打造的 Markdown 排版工具，所见即所得，一键复制到公众号后台。
> 同时提供 macOS / Windows 桌面客户端，本地离线使用。

当前版本 **0.4.3**。

## ✨ 功能特性

### 写作与排版

- **实时预览** — 左侧编辑 Markdown，右侧实时渲染公众号效果
- **一键复制** — 富文本 / HTML 源码两种复制模式，直接粘贴到公众号编辑器
- **多格式导出** — 保存图片（PNG）、小红书图（首图 + 正文卡片，桌面端打包 ZIP）、PDF、HTML
- **主题切换** — 15 款预设主题色 + 自定义颜色，支持暗色模式
- **编辑器配色** — 10 套代码高亮主题（默认 / GitHub / Solarized / Material / One Dark / Dracula / Monokai）
- **段落格式** — 字号、字重、行高、段间距、首行缩进可调
- **滚动同步** — 编辑器与预览面板滚动位置按比例联动
- **查找替换** — 支持区分大小写、全词匹配、正则表达式，含上一个 / 下一个 / 全部替换
- **文档大纲** — 右侧大纲面板汇总标题层级，点击跳转并高亮定位
- **底部状态栏** — 显示光标行列、已选字数、总字数与预估阅读时长
- **命令面板** — `⌘K` / `Ctrl+K` 统一检索草稿 / 云文章 / 本地文章 / 素材，含最近搜索
- **违禁词检测** — 五类内置词库（极限用语 / 权威背书 / 医疗功效 / 金融风险 / 诱导互动），支持自定义词与白名单，命中可点击跳转定位
- **可调面板** — 拖拽调整编辑器与预览区宽度，工具栏按可用宽度自适应换行
- **组件展示** — 内置排版组件库，可视化浏览所有可用组件及效果

### 内容管理

- **自动保存** — 内容实时保存到 localStorage，刷新不丢失
- **草稿管理** — IndexedDB 多草稿存储，支持导入 / 关联 / 自动匹配
- **文章工作区** — 多仓库 / 多分支 / 多目录并存，下拉快速切换，单工作区自动设为「当前」
- **云端文章** — 基于 GitHub 仓库的文章树管理（CRUD、拖拽、缓存、自动关联）
- **本地文章** — 桌面端可将文章树存到本地磁盘（目录可配置、可迁移、重装后可重新加载）
- **图床上传** — 支持 IndexedDB / 本地磁盘 / GitHub / 乐塔四种图片存放方式
- **图库** — 可视化浏览已上传图片，磁盘图片 hover 显示文件夹图标可定位本地文件
- **素材库** — 可视化浏览 / 安装 / 发布排版素材，支持「我的素材」与官方素材库
- **导入** — 支持 `.md` / `.txt` / `.docx`（docx 走 mammoth 提取纯文本）
- **微信发布** — 直接上传草稿到微信公众号素材库（桌面端）

### 客户端

- **桌面客户端** — 基于 Tauri 2 的 macOS（Apple Silicon）和 Windows（x64）原生应用
- **自动更新** — 桌面客户端启动时自动检查新版本，一键下载安装
- **页面缩放** — 桌面端支持整体缩放比例设置

## 🎨 排版能力

基于 [awesome-design-md](https://www.npmjs.com/package/awesome-design-md) 排版引擎，支持丰富的公众号扩展语法：

### 内联语法

| 语法                                     | 效果                                     |
| ---------------------------------------- | ---------------------------------------- |
| `==渐变背景文字==`                       | 渐变背景强调                             |
| `::柔光重点文字::`                       | 柔光蓝紫色文字                           |
| `!!胶囊文字!!`                           | 超圆角胶囊背景                           |
| `^^加重强调^^`                           | 靛青加重文字                             |
| `__下划线__`                             | 下划线                                   |
| `~~删除线~~`                             | 删除线                                   |
| `**加粗**` / `*斜体*` / `***加粗斜体***` | 基础强调                                 |
| `` `行内代码` ``                         | 行内代码                                 |
| `$公式$`                                 | 行内数学公式（MathJax）                  |
| `<sup>` / `<sub>` / `<u>`                | 上标 / 下标 / HTML 下划线                |
| `<badges>`                               | 彩色标签徽章                             |
| `![alt](src)[100% 120px]`                | 图片（方括号内为尺寸后缀）               |
| `[text](url "desc")`                     | 脚注引用（带引号标题的链接自动转为脚注） |

### 块级组件

扩展组件通过 `<tag>` 标签使用，全部组件均支持属性面板可视化编辑。

| 标签             | 组件                  | 说明                                              |
| ---------------- | --------------------- | ------------------------------------------------- |
| `<title>`        | 标题卡片              | 两种样式（DA01 / DA02）                           |
| `<p-title>`      | 段落标题              | 支持 `level` 指定大纲层级（1–4）                  |
| `<reading-path>` | 阅读路线导航          | 根据文内标题自动生成                              |
| `<statement>`    | 居中强调语            | -                                                 |
| `<lead>`         | 引导文字段            | -                                                 |
| `<breaking>`     | 突发/重大更新卡片     | -                                                 |
| `<compare>`      | Before/After 对比布局 | 两种样式                                          |
| `<cta>`          | 行动召唤卡片          | -                                                 |
| `<steps>`        | 横向步骤流            | 两种样式                                          |
| `<timeline>`     | 时间线组件            | -                                                 |
| `<engage>`       | 互动引导组件          | 两种样式                                          |
| `<case-flow>`    | 实践案例流程          | -                                                 |
| `<badges>`       | 彩色标签徽章          | -                                                 |
| `<table>`        | 表格扩展              | 支持 `{col:N}` / `{row:N}` / `{cover}` 单元格合并 |
| `<img>`          | 单图组件              | 宽高、圆角、裁切、容器对齐、偏移、阴影            |
| `<slider>`       | 图片幻灯片轮播        | 4 种轮播模式（循环 / 来回 / 滚回 / 淡入淡出）     |
| `<chart>`        | 图表组件              | -                                                 |
| `<mermaid>`      | Mermaid 图表          | 流程图 / 时序图 / 甘特图                          |
| `<row>`          | 横向布局              | -                                                 |
| `<column>`       | 纵向布局              | -                                                 |
| `<container>`    | 通用容器              | 支持嵌套                                          |
| `<stack>`        | 层叠舞台容器          | 配合 `<positioned>` 做绝对定位                    |
| `<positioned>`   | 定位层                | 仅可在 `<stack>` 内使用                           |
| `<text>`         | 文本样式              | 行内文本样式容器                                  |
| `<html>`         | HTML                  | 直通 HTML 片段                                    |
| ` ``` `          | 代码块                | 语言头显示代码图标与语言名                        |
| `> [TIP]`        | 提示框                | 支持 TIP / NOTE / WARNING / CAUTION / IMPORTANT   |

## 🚀 快速开始

### 环境要求

- Node.js >= 24
- pnpm
- Rust（仅桌面客户端开发需要）

### 安装与运行

```bash
# 克隆项目（含子模块）
git clone --recursive https://github.com/RobocopMao/r-markdown.git
cd r-markdown

# 若已克隆但未带子模块，初始化子模块
pnpm sm:update   # 或 bash update-submodules.sh

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

浏览器打开终端输出的地址即可使用。

> `pnpm dev` / `build` / `tauri:dev` / `tauri:build` 会先自动执行 `pnpm clean` 清理 `src/**.js` 编译产物。
> 子模块缺失时 `pnpm build` 会自动把 `src/extension-stubs/` 复制到 `src/extension/` 作为空桩，保证编译通过。

### 构建生产版本

```bash
pnpm build
```

构建产物输出到 `dist/` 目录。

### 预览构建结果

```bash
pnpm preview
```

### 代码检查

```bash
pnpm check    # ESLint + Prettier 检查
pnpm lint     # ESLint 自动修复
pnpm format   # Prettier 格式化
```

### 桌面客户端开发

```bash
# 启动 Tauri 开发模式（热更新）
pnpm tauri:dev

# 构建桌面客户端
pnpm tauri:build
```

构建产物：

- macOS: `src-tauri/target/release/bundle/dmg/R-Markdown_*.dmg`
- Windows: `src-tauri/target/release/bundle/msi/R-Markdown_*.msi`

### 桌面客户端安装

从 [GitHub Releases](https://github.com/RobocopMao/r-markdown/releases) 下载最新版本。

macOS 首次打开时若提示"已损坏"，执行以下命令放行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/R-Markdown.app
```

## 📦 技术栈

- **Vue 3** (Composition API + `<script setup>`)
- **TypeScript**
- **Vite** — 构建工具
- **Vue Router** — 路由管理（hash 模式）
- **CodeMirror 6** — Markdown 编辑器内核
- **Tailwind CSS 4** — 样式系统
- **IndexedDB** — 图片 / 草稿 / 素材 / 缓存本地存储
- **MathJax** — 数学公式渲染
- **Mermaid** — 流程图 / 时序图 / 甘特图
- **highlight.js** — 代码块语法高亮（转内联样式，可直接粘贴公众号）
- **html-to-image** — 图片导出
- **JSZip** — 小红书图批量打包（桌面端）
- **mammoth** — `.docx` 导入
- **PixiJS** — 首页粒子特效
- **awesome-design-md** — 公众号排版引擎
- **Tauri 2** — 桌面客户端框架（macOS + Windows，Rust 后端调用微信 API）

## 📁 项目结构

```
r-markdown/
├── src/
│   ├── components/            # 公用 UI 组件
│   │   ├── BaseDialog.vue         # 通用弹窗
│   │   ├── BaseDrawer.vue         # 通用抽屉
│   │   ├── BaseTooltip.vue        # 通用 tooltip
│   │   ├── ConfirmDialog.vue      # 确认弹窗
│   │   ├── DarkModeToggle.vue     # 暗色模式切换
│   │   ├── NavCapsule.vue         # 顶部导航胶囊
│   │   ├── PromptDialog.vue       # 提示词弹窗
│   │   ├── SiteFooter.vue         # 页脚
│   │   ├── SiteLogo.vue           # 站点 Logo
│   │   ├── Toast.vue              # 轻提示
│   │   └── mobile/                # 移动端专用组件
│   ├── composables/           # 全局组合式函数
│   │   ├── useTheme.ts            # 主题管理
│   │   ├── useDarkMode.ts         # 暗色模式
│   │   ├── useAutoUpdater.ts      # Tauri 自动更新
│   │   ├── useMermaid.ts          # Mermaid 渲染
│   │   ├── useEditorSettings.ts   # 编辑器全局设置
│   │   ├── useParagraphSettings.ts# 段落格式设置
│   │   ├── useDropdownGroup.ts    # 下拉菜单组
│   │   └── useSetting.ts          # 通用设置读写
│   ├── config/               # 配置层
│   │   ├── defaults.ts            # 全部设置项与默认值（新增设置只改这里）
│   │   └── settings.ts            # 设置读写（敏感项 AES-GCM-256 加密）
│   ├── data/                 # 静态数据
│   │   └── demoContent.ts         # 示例内容
│   ├── extension/            # 排版组件库（git 子模块，闭源）
│   ├── extension-stubs/      # 排版组件空桩（fallback）
│   ├── router/               # 路由
│   ├── services/             # 业务服务层
│   │   ├── DraftStorage.ts        # IndexedDB 草稿存储
│   │   ├── GitHubArticleCache.ts  # GitHub 文章本地缓存
│   │   ├── GitHubTreeService.ts   # GitHub 仓库文章树 CRUD
│   │   ├── LocalTreeService.ts    # 本地磁盘文章树 CRUD
│   │   ├── localArticlePath.ts    # 本地文章目录路径解析
│   │   ├── localArticleStorage.ts # 本地文章目录迁移 / 重装加载
│   │   ├── localImageDisk.ts      # 本地磁盘图片存储
│   │   ├── articleWorkspace.ts    # 文章工作区（多仓库 / 多分支 / 多目录）
│   │   ├── encryption.ts          # AES-GCM-256 加解密
│   │   ├── githubUploader.ts      # GitHub 图床
│   │   ├── letaUploader.ts        # 乐塔图床
│   │   ├── materialLibrary.ts     # 官方素材库
│   │   ├── materialStorage.ts     # 我的素材存储
│   │   ├── materialPublish.ts     # 素材发布
│   │   ├── coverCache.ts          # 微信封面缓存
│   │   ├── configPersistence.ts   # 配置持久化
│   │   ├── startupCheck.ts        # 启动配置恢复检查
│   │   └── wechatPublisher.ts     # 微信公众号发布
│   ├── styles/               # 全局样式
│   ├── utils/                # 工具函数
│   │   ├── markdownParser.ts      # Markdown → HTML 解析
│   │   ├── inlineFormat.ts        # 行内格式化
│   │   ├── components.ts          # 组件解析（callout / timeline 等）
│   │   ├── headingLevels.ts       # 标题层级唯一权威定义
│   │   ├── outline.ts             # 文档大纲提取
│   │   ├── findReplace.ts         # 查找替换纯逻辑
│   │   ├── charCount.ts           # 字数统计与阅读时长
│   │   ├── commandPalette.ts      # 命令面板检索逻辑
│   │   ├── bannedWords.ts         # 违禁词词库与扫描
│   │   ├── paginate.ts            # PDF 导出 DOM 测量分页
│   │   ├── platform.ts            # 平台判断与快捷键文案
│   │   ├── colorUtils.ts          # 颜色处理
│   │   ├── extractTitle.ts        # 标题提取
│   │   ├── helpers.ts             # 通用辅助（esc/leaf/hexToRgb/getErrorMessage 等）
│   │   ├── imageDB.ts             # IndexedDB 图片存储
│   │   ├── mathRenderer.ts        # MathJax 公式渲染
│   │   └── xhsCards.ts            # 小红书卡片
│   ├── views/                # 页面视图
│   │   ├── home/HomePage.vue          # 首页
│   │   ├── editor/
│   │   │   ├── EditorPage.vue         # 编辑器页
│   │   │   ├── components/            # 编辑器专用组件（见下表）
│   │   │   └── composables/           # 编辑器专用组合式函数
│   │   ├── extension/ExtensionPage.vue # 组件展示页
│   │   ├── help/                      # 帮助文档（公开降级版）
│   │   ├── material/                  # 素材库（公开降级版）
│   │   └── 404/NotFound.vue           # 404 页
│   ├── views-private/        # 私有视图（git 子模块，闭源）：私有首页 / 素材库 / 帮助
│   ├── App.vue               # 根组件
│   └── main.ts               # 入口
├── src-tauri/                # Tauri 桌面客户端（git 子模块，Rust）
├── worker/                   # Cloudflare Worker：GitHub API 代理（素材库发布鉴权）
├── functions/                # Cloudflare Pages Function：/api/leta 乐塔图床代理
├── scripts/
│   ├── clean-artifacts.mjs        # 清理 src/**.js 编译产物
│   └── ensure-extension-stubs.mjs # 子模块缺失时复制空桩
├── .github/workflows/
│   ├── deploy.yml             # GitHub Pages 部署（手动触发）
│   └── build-desktop.yml      # 桌面端 CI/CD 构建（tag 触发）
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 编辑器组件一览（`src/views/editor/components/`）

| 组件                                                                   | 用途                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Editor.vue`                                                           | CodeMirror 编辑器封装                                                            |
| `Preview.vue`                                                          | 预览区渲染与复制                                                                 |
| `EditorSidebar.vue`                                                    | 左侧竖排功能入口（文章 / 草稿 / 导入 / 组件 / 图库 / 素材 / 检测 / 示例 / 帮助） |
| `TreeSidebar.vue` `TreeNode.vue`                                       | 文章树侧栏与节点                                                                 |
| `OutlinePanel.vue`                                                     | 文档大纲面板                                                                     |
| `FindReplacePanel.vue`                                                 | 查找替换面板                                                                     |
| `CommandPalette.vue`                                                   | 命令面板（⌘K）                                                                   |
| `Minimap.vue`                                                          | 预览区缩略图（可开关）                                                           |
| `BannedWordsDialog.vue`                                                | 违禁词检测弹窗                                                                   |
| `SettingsDialog.vue`                                                   | 设置弹窗（基础 / 图片 / 文章存储 / 公众号 / 关于）                               |
| `ThemePicker.vue`                                                      | 主题色选择                                                                       |
| `ComponentPickerDialog.vue` `TagPropsForm.vue`                         | 组件插入与属性编辑                                                               |
| `ImageCacheDialog.vue`                                                 | 图库弹窗                                                                         |
| `DraftListDialog.vue` `SaveDraftDialog.vue`                            | 草稿列表与保存草稿                                                               |
| `PushToCloudDialog.vue` `PushToCloudTree.vue`                          | 推送到云端文章树                                                                 |
| `PublishToWechatDialog.vue`                                            | 发布到公众号                                                                     |
| `MaterialLibraryPanel.vue` `MaterialCard.vue` `SaveMaterialDialog.vue` | 素材面板与卡片                                                                   |
| `XhsExporter.vue`                                                      | 小红书图导出                                                                     |
| `FinalizeDialog.vue`                                                   | 定稿（本地导出 Markdown）                                                        |
| `Dropdown.vue`                                                         | 通用下拉                                                                         |
| `mobile/MobileActionsMenu.vue`                                         | 移动端操作菜单                                                                   |

## 🌐 在线体验

- **Cloudflare Pages（主站，含乐塔图床代理）**：[r-markdown.pages.dev](https://r-markdown.pages.dev/)
- **GitHub Pages（`deploy.yml` 手动触发部署）**：[RobocopMao.github.io/r-markdown](https://RobocopMao.github.io/r-markdown/)

## 📄 License

MIT
