# R-Markdown 编辑器

> 专为微信公众号打造的 Markdown 排版工具，所见即所得，一键复制到公众号后台。
> 同时提供 macOS / Windows 桌面客户端，本地离线使用。

## ✨ 功能特性

- **实时预览** — 左侧编辑 Markdown，右侧实时渲染公众号效果
- **一键复制** — 富文本 / HTML 源码两种复制模式，直接粘贴到公众号编辑器
- **保存图片** — 将排版内容导出为高清 PNG 图片
- **主题切换** — 15 款预设主题色 + 自定义颜色，支持暗色模式
- **滚动同步** — 编辑器与预览面板滚动位置按比例联动
- **自动保存** — 内容实时保存到 localStorage，刷新不丢失
- **草稿管理** — IndexedDB 多草稿存储，支持导入 / 关联 / 自动匹配
- **云文章** — 基于 GitHub 仓库的文章树管理（CRUD、缓存、自动关联）
- **图床上传** — 支持 GitHub / Leta 图床，图片持久化托管
- **素材库** — 可视化浏览 / 安装 / 发布排版素材
- **微信发布** — 直接上传草稿到微信公众号素材库（桌面端）
- **可调面板** — 拖拽调整编辑器与预览区宽度
- **组件展示** — 内置排版组件库，可视化浏览所有可用组件及效果
- **图片轮播** — SVG 动画实现的图片幻灯片，支持 4 种轮播模式
- **公式 / 图表** — MathJax 数学公式 + Mermaid 流程图 / 时序图 / 甘特图
- **桌面客户端** — 基于 Tauri 2 的 macOS（Apple Silicon）和 Windows（x64）原生应用
- **自动更新** — 桌面客户端启动时自动检查新版本，一键下载安装

## 🎨 排版能力

基于 [awesome-design-md](https://www.npmjs.com/package/awesome-design-md) 排版引擎，支持丰富的公众号扩展语法：

### 内联语法

| 语法                 | 效果                                     |
| -------------------- | ---------------------------------------- |
| `==渐变背景文字==`   | 渐变背景强调                             |
| `::柔光重点文字::`   | 柔光蓝紫色文字                           |
| `!!胶囊文字!!`       | 超圆角胶囊背景                           |
| `^^加重强调^^`       | 靛青加重文字                             |
| `<badges>`           | 彩色标签徽章                             |
| `[text](url "desc")` | 脚注引用（带引号标题的链接自动转为脚注） |

### 块级组件

| 组件            | 说明                                   |
| --------------- | -------------------------------------- |
| `<statement>`   | 居中强调语                             |
| `<lead>`        | 引导文字段                             |
| `<breaking>`    | 突发/重大更新卡片                      |
| `<compare>`     | Before/After 对比布局                  |
| `<cta>`         | 行动召唤卡片                           |
| `<steps>`       | 横向步骤流                             |
| `<timeline>`    | 时间线组件                             |
| `<title>`       | 标题组件                               |
| `<ptitle>`      | 副标题组件                             |
| `<engage>`      | 互动引导组件                           |
| `<caseflow>`    | 案例流程组件                           |
| `<readingpath>` | 阅读路径组件                           |
| `<img>`         | 单图组件（宽高、圆角、裁切、容器对齐） |
| `<slider>`      | 图片幻灯片轮播                         |
| `<chart>`       | 图表组件                               |
| ` ``` `         | 代码块                                 |
| `> [TIP]`       | 提示框                                 |

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
- **Vue Router** — 路由管理
- **CodeMirror 6** — Markdown 编辑器内核
- **Tailwind CSS 4** — 样式系统
- **IndexedDB** — 图片 / 草稿 / 缓存本地存储
- **MathJax** — 数学公式渲染
- **Mermaid** — 流程图 / 时序图 / 甘特图
- **html-to-image** — 图片导出
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
│   │   ├── defaults.ts            # 设置默认值
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
│   │   ├── encryption.ts          # AES-GCM-256 加解密
│   │   ├── githubUploader.ts      # GitHub 图床
│   │   ├── letaUploader.ts        # Leta 图床
│   │   ├── materialLibrary.ts     # 素材库存储
│   │   ├── materialPublish.ts     # 素材发布
│   │   ├── coverCache.ts          # 微信封面缓存
│   │   ├── configPersistence.ts   # 配置持久化
│   │   ├── startupCheck.ts        # 启动配置恢复检查
│   │   └── wechatPublisher.ts     # 微信公众号发布
│   ├── styles/               # 全局样式
│   ├── utils/                # 工具函数
│   │   ├── markdownParser.ts      # Markdown → HTML 解析
│   │   ├── colorUtils.ts          # 颜色处理
│   │   ├── extractTitle.ts        # 标题提取
│   │   ├── helpers.ts             # 通用辅助（esc/hexToRgb/getErrorMessage 等）
│   │   ├── imageDB.ts             # IndexedDB 图片存储
│   │   ├── components.ts          # 组件工具
│   │   ├── inlineFormat.ts        # 内联格式化
│   │   ├── mathRenderer.ts        # MathJax 公式渲染
│   │   └── xhsCards.ts            # 小红书卡片
│   ├── views/                # 页面视图
│   │   ├── home/HomePage.vue          # 首页
│   │   ├── editor/
│   │   │   ├── EditorPage.vue         # 编辑器页
│   │   │   ├── components/            # 编辑器专用组件（Editor/Preview/各弹窗等）
│   │   │   └── composables/           # 编辑器专用组合式函数（草稿/云文章/图片/微信发布等）
│   │   └── extension/ExtensionPage.vue # 组件展示页
│   ├── views-private/        # 私有视图（git 子模块，闭源）：私有首页 / 素材库 / 帮助
│   ├── App.vue               # 根组件
│   └── main.ts               # 入口
├── src-tauri/                # Tauri 桌面客户端（git 子模块，Rust）
├── scripts/
│   └── clean-artifacts.mjs    # 清理 src/**.js 编译产物
├── .github/workflows/
│   ├── deploy.yml             # 网页版部署（手动触发）
│   └── build-desktop.yml      # 桌面端 CI/CD 构建（tag 触发）
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🌐 在线体验

访问 [GitHub Pages](https://RobocopMao.github.io/r-markdown/) 直接使用。

## 📄 License

MIT
