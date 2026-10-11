# r-markdown 开发规范

> 每次开发前必须阅读本文档，确保代码风格和项目结构一致。

当前版本 **0.4.3**。

## 项目概述

公众号 Markdown 排版编辑器，支持实时预览、主题切换、深色模式、草稿管理、文章工作区（GitHub 云文章 / 本地磁盘文章）、图床上传、素材库、微信发布、违禁词检测、文档大纲、查找替换、命令面板、PDF 导出、Mermaid/MathJax 公式、桌面客户端（macOS / Windows）。

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
│   ├── BaseTooltip.vue      # 通用 tooltip
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
│   └── useTheme.ts          # 主题管理
├── config/              # 配置层
│   ├── defaults.ts          # 全部设置项与默认值（唯一来源，新增设置只改这里）
│   └── settings.ts          # 设置读写（带 AES-GCM-256 加密敏感项）
├── data/                # 静态数据
│   └── demoContent.ts       # 编辑器示例内容
├── extension/           # 排版组件库（git 子模块，闭源；缺失时自动复制 stubs）
├── extension-stubs/     # 排版组件空桩（extension 不可用时的 fallback）
├── router/              # 路由配置
│   └── index.ts
├── services/            # 业务服务层
│   ├── DraftStorage.ts      # IndexedDB 草稿存储
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
└── ensure-extension-stubs.mjs # extension 子模块为空时复制 stubs（build 前自动执行）
```

### 编辑器组件一览（`src/views/editor/components/`）

| 组件                                                                   | 用途                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Editor.vue`                                                           | CodeMirror 编辑器封装（主题、快捷键、滚动、定位）                          |
| `Preview.vue`                                                          | 预览区渲染与复制                                                           |
| `EditorSidebar.vue`                                                    | 左侧竖排入口：文章 / 草稿 / 导入 / 组件 / 图库 / 素材 / 检测 / 示例 / 帮助 |
| `TreeSidebar.vue` `TreeNode.vue`                                       | 文章树侧栏与节点（拖拽、右键菜单）                                         |
| `OutlinePanel.vue`                                                     | 文档大纲面板                                                               |
| `FindReplacePanel.vue`                                                 | 查找替换面板                                                               |
| `CommandPalette.vue`                                                   | 命令面板（⌘K）                                                             |
| `Minimap.vue`                                                          | 预览区缩略图                                                               |
| `BannedWordsDialog.vue`                                                | 违禁词检测弹窗                                                             |
| `SettingsDialog.vue`                                                   | 设置弹窗（基础 / 图片 / 文章存储 / 公众号 / 关于）                         |
| `ThemePicker.vue`                                                      | 主题色选择                                                                 |
| `ComponentPickerDialog.vue` `TagPropsForm.vue`                         | 组件插入与属性编辑                                                         |
| `ImageCacheDialog.vue`                                                 | 图库弹窗（本地 / 磁盘图片）                                                |
| `DraftListDialog.vue` `SaveDraftDialog.vue`                            | 草稿列表与保存草稿                                                         |
| `PushToCloudDialog.vue` `PushToCloudTree.vue`                          | 推送到云端文章树                                                           |
| `PublishToWechatDialog.vue`                                            | 发布到公众号                                                               |
| `MaterialLibraryPanel.vue` `MaterialCard.vue` `SaveMaterialDialog.vue` | 素材面板与卡片                                                             |
| `XhsExporter.vue`                                                      | 小红书图导出（首图 + 正文卡片，桌面端打包 ZIP）                            |
| `FinalizeDialog.vue`                                                   | 定稿（本地导出 Markdown）                                                  |
| `Dropdown.vue`                                                         | 通用下拉                                                                   |
| `mobile/MobileActionsMenu.vue`                                         | 移动端操作菜单                                                             |

### 编辑器组合式函数（`src/views/editor/composables/`）

| 文件                  | 用途                               |
| --------------------- | ---------------------------------- |
| `useAutoSave.ts`      | 自动保存（间隔可配）               |
| `useDraft.ts`         | 草稿关联与匹配                     |
| `useExport.ts`        | 导出（图片 / 小红书 / PDF / HTML） |
| `useGitHubTree.ts`    | 文章树（GitHub 与本地磁盘切换）    |
| `useImageInsert.ts`   | 粘贴 / 拖拽图片插入与上传          |
| `useImport.ts`        | 导入 `.md` / `.txt` / `.docx`      |
| `useMaterial.ts`      | 素材保存与插入                     |
| `useScrollSync.ts`    | 编辑器与预览滚动同步               |
| `useToolbar.ts`       | 工具栏按钮与插入语法定义           |
| `useWechatPublish.ts` | 微信公众号发布                     |

## 开发环境搭建

```bash
# 安装依赖
pnpm install

# 初始化/更新 git 子模块（src-tauri / src/extension / src/views-private）
pnpm sm:update        # 或 bash update-submodules.sh

# 启动 Web 开发服务器（会先执行 pnpm clean 清理 .js 编译产物）
pnpm dev

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
- **Vapor 编译模式**：多数展示型组件使用 `<script setup vapor lang="ts">`（如 `Editor.vue`、`Preview.vue`、`Minimap.vue`、各 Dialog），按需启用，不要无条件全开

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

> 打 tag 后需同步 `package.json` 与 `src-tauri/tauri.conf.json` 的 `version` 字段保持一致，`build-desktop.yml` 会以 tag 版本生成 `latest.json`。

### ⚠️ Git 操作规则（强制）

**commit 与 push 均需用户明确指示，AI 不得自行执行。**

- 提交（commit）：用户明确说"提交"、"commit"、"提交一下"等指令后才执行
- 推送（push）：用户明确说"推送"、"push"、"推到线上"等指令后才执行
- 合并（merge）到 main 分支也需要用户确认后才执行
- 删除远程 tag、强制推送、重置等破坏性操作同理，需用户明确确认
- 无论哪个分支（main / develop / 功能分支），规则一致

### 发布流程

> 以下每一步均需用户明确指示后才执行，AI 不得自行 commit / push / merge / tag。

```bash
# 1. 在 develop 分支开发（用户指示"提交"后执行 commit）
git add .
git commit -m "feat: xxx"

# 2. 用户确认后合并到 main
git checkout main
git merge develop

# 3. 用户确认后推送 main
git push origin main

# 4. 用户确认后删除旧 tag 并重新打 tag
git tag -d v0.4.x
git push origin :refs/tags/v0.4.x
git tag v0.4.x
git push origin v0.4.x

# 5. 用户确认后推送 develop
git checkout develop
git push origin develop
```

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
5. **新增设置项后**：只需在 `src/config/defaults.ts` 加一行，`initSettings()` 会自动为旧用户补默认值；敏感字段记得加进 `settings.ts` 的 `SENSITIVE_KEYS`
6. **构建前确认**：确保 `pnpm check` 通过，无 ESLint/Prettier 错误
7. **多语句内联 handler**：Vue 模板中 `@click="a = 1; b = 2"` 这类带分号的多行内联 handler 会被 Prettier（`"semi": false`）移除分号导致 rolldown 解析失败。多语句 handler 一律提取为具名函数（参考 `EditorPage.vue` 的 `onTagDialogClose` / `onSettingsClose`）
8. **标题层级只改一处**：`#` 与 `<p-title level="N">` 的上限与默认值统一来自 `src/utils/headingLevels.ts`，不要在其他文件硬编码（历史上已漂移过一次）
9. **字数统计不要用正则粗暴匹配 `---`**：正文里的水平分割线也是 `---`，`charCount.ts` 只把首个非空行是 `---` 的情况当作 front-matter
10. **Tauri 开发**：
    - 前端代码中的 Tauri API 调用须通过 `import.meta.env.VITE_TAURI === 'true'` 守卫，确保 Web 版不受影响
    - 修改 `Cargo.toml` 中 `[lib] name` 后须同步修改 `src-tauri/src/main.rs` 中的 crate 引用
    - 首次构建桌面端需安装 Rust 工具链（[rustup.rs](https://rustup.rs)）
11. **Node 版本**：项目要求 Node.js >= 24，使用 nvm 管理版本：
    ```bash
    nvm install 24
    nvm use 24
    ```
