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
- **可调面板** — 拖拽调整编辑器与预览区宽度
- **组件展示** — 内置排版组件库，可视化浏览所有可用组件及效果
- **图片轮播** — SVG 动画实现的图片幻灯片，支持 4 种轮播模式
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
# 克隆项目
git clone https://github.com/RobocopMao/r-markdown.git
cd r-markdown

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

浏览器打开终端输出的地址即可使用。

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

从 [GitHub Releases](https://github.com/robocopmao/r-markdown/releases) 下载最新版本。

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
- **html-to-image** — 图片导出
- **awesome-design-md** — 公众号排版引擎
- **Tauri 2** — 桌面客户端框架（macOS + Windows）

## 📁 项目结构

```
r-markdown/
├── src/
│   ├── components/            # 公用 UI 组件
│   │   ├── BaseDialog.vue     # 通用弹窗
│   │   ├── DarkModeToggle.vue # 暗色模式切换
│   │   ├── NavCapsule.vue     # 顶部导航胶囊
│   │   │── PromptDialog.vue   # 提示词弹窗
│   │   ├── SiteFooter.vue     # 页脚
│   │   ├── SiteLogo.vue       # 站点 Logo
│   │   ├── Toast.vue          # 轻提示
│   │   └── mobile/            # 移动端专用组件
│   │       └── MobileNavMenu.vue  # 移动端导航菜单
│   ├── extension/             # 排版组件库（git 子模块）
│   │   ├── Badges_DA01.ts     # 标签徽章
│   │   ├── Breaking_DA01.ts   # 突发新闻卡片
│   │   ├── CaseFlow_DA01.ts   # 案例流程
│   │   ├── Chart_DA01.ts      # 图表组件
│   │   ├── Compare_DA01.ts    # 对比布局 v1
│   │   ├── Compare_DA02.ts    # 对比布局 v2
│   │   ├── Cta_DA01.ts        # 行动召唤
│   │   ├── Engage_DA01.ts     # 互动引导 v1
│   │   ├── Engage_DA02.ts     # 互动引导 v2
│   │   ├── Img_DA01.ts        # 单图组件
│   │   ├── Lead_DA01.ts       # 引导文段
│   │   ├── PTitle_DA01.ts     # 副标题
│   │   ├── ReadingPath_DA01.ts # 阅读路径
│   │   ├── Slider_DA01.ts     # 图片幻灯片轮播
│   │   ├── Statement_DA01.ts  # 居中强调语
│   │   ├── Steps_DA01.ts      # 步骤流 v1
│   │   ├── Steps_DA02.ts      # 步骤流 v2
│   │   ├── Timeline_DA01.ts   # 时间线
│   │   ├── Title_DA01.ts      # 标题 v1
│   │   ├── Title_DA02.ts      # 标题 v2
│   │   └── index.ts           # 组件注册与导出
│   ├── extension-stubs/       # 排版组件空桩（extension 不可用时的 fallback）
│   │   ├── Badges_DA01.ts     # …（21 个组件，render 返回空字符串）
│   │   └── index.ts
│   ├── composables/           # 组合式函数
│   │   ├── useTheme.ts        # 主题管理
│   │   ├── useDarkMode.ts     # 暗色模式
│   │   ├── useAutoUpdater.ts  # Tauri 自动更新
│   │   └── useDropdownGroup.ts # 下拉菜单组
│   ├── views/                 # 页面视图
│   │   ├── home/
│   │   │   └── HomePage.vue       # 首页
│   │   ├── editor/
│   │   │   ├── EditorPage.vue     # 编辑器页
│   │   │   └── components/        # 编辑器专用组件
│   │   │       ├── ComponentPickerDialog.vue # 组件选择弹窗
│   │   │       ├── Dropdown.vue       # 下拉菜单
│   │   │       ├── Editor.vue         # CodeMirror 编辑器
│   │   │       ├── Preview.vue        # 公众号预览面板
│   │   │       ├── TagPropsForm.vue   # 组件属性表单
│   │   │       ├── ThemePicker.vue    # 主题色选择器
│   │   │       ├── XhsExporter.vue    # 图片导出
│   │   │       └── mobile/
│   │   │           └── MobileActionsMenu.vue  # 移动端操作菜单
│   │   └── extension/
│   │       └── ExtensionPage.vue # 组件展示页
│   ├── utils/                 # 工具函数
│   │   ├── markdownParser.ts  # Markdown → HTML 解析
│   │   ├── colorUtils.ts      # 颜色处理
│   │   ├── components.ts      # 组件工具
│   │   ├── helpers.ts         # 通用辅助函数
│   │   ├── inlineFormat.ts    # 内联格式化
│   │   └── mathRenderer.ts    # MathJax 公式渲染
│   ├── data/
│   │   └── demoContent.ts     # 示例内容
│   ├── router/
│   │   └── index.ts           # 路由配置
│   ├── styles/                # 全局样式
│   ├── App.vue                # 根组件
│   └── main.ts                # 入口
├── src-tauri/                 # Tauri 桌面客户端
│   ├── src/
│   │   ├── main.rs            # Rust 入口
│   │   └── lib.rs             # Tauri 插件注册
│   ├── icons/                 # 应用图标
│   ├── capabilities/          # 权限配置
│   ├── Cargo.toml             # Rust 依赖
│   └── tauri.conf.json        # Tauri 配置
├── .github/workflows/
│   ├── deploy.yml             # 网页版自动部署
│   └── build-desktop.yml      # 桌面端 CI/CD 构建
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🌐 在线体验

访问 [GitHub Pages](https://robocopmao.github.io/r-markdown/) 直接使用。

## 📄 License

MIT
