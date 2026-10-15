# r-markdown 开发规范

> 每次开发前必须阅读本文档，确保代码风格和项目结构一致。

当前版本 **0.4.6**。

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
│   ├── aiFormatPrompt.ts    # AI 排版：prompt 组装、图片占位符遮罩/还原、输出清洗与标签校验（纯逻辑）
│   ├── aiWritePrompt.ts     # AI 写作：prompt 组装、输出分类（出稿/追问）、自检报告提取（纯逻辑）
│   ├── aiSession.ts         # AI 各面板共用的保留时长逻辑（滑动续期、收敛、剩余文案，纯逻辑）
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
└── ensure-extension-stubs.mjs # extension 子模块为空时复制 stubs（build 前自动执行）
```

### 编辑器组件一览（`src/views/editor/components/`）

| 组件                                                                   | 用途                                                                                                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Editor.vue`                                                           | CodeMirror 编辑器封装（主题、快捷键、滚动、定位）                                                                                                                    |
| `Preview.vue`                                                          | 预览区渲染与复制                                                                                                                                                     |
| `EditorSidebar.vue`                                                    | 左侧竖排入口：文章 / 草稿 / 导入 / **AI** / 组件 / 图库 / 素材 / 检测 / 示例 / 帮助；「AI」与「素材」「示例」一样是悬停展开的二级菜单（AI 写作 / AI 排版 / AI 配图） |
| `TreeSidebar.vue` `TreeNode.vue`                                       | 文章树侧栏与节点（拖拽、右键菜单）                                                                                                                                   |
| `OutlinePanel.vue`                                                     | 文档大纲面板                                                                                                                                                         |
| `FindReplacePanel.vue`                                                 | 查找替换面板                                                                                                                                                         |
| `CommandPalette.vue`                                                   | 命令面板（⌘K）                                                                                                                                                       |
| `Minimap.vue`                                                          | 预览区缩略图                                                                                                                                                         |
| `BannedWordsDialog.vue`                                                | 违禁词检测弹窗                                                                                                                                                       |
| `SettingsDialog.vue`                                                   | 设置弹窗（基础 / 图片 / 文章存储 / 公众号 / AI〔AI 文本·AI 图片〕 / 关于）；「AI 文本」把写作与排版合并成一份公共接口配置，两者不同的采样参数在该子页内分区展示      |
| `ThemePicker.vue`                                                      | 主题色选择                                                                                                                                                           |
| `ComponentPickerDialog.vue` `TagPropsForm.vue`                         | 组件插入与属性编辑                                                                                                                                                   |
| `ImageCacheDialog.vue`                                                 | 图库弹窗（本地 / 磁盘图片）                                                                                                                                          |
| `DraftListDialog.vue` `SaveDraftDialog.vue`                            | 草稿列表与保存草稿                                                                                                                                                   |
| `PushToCloudDialog.vue` `PushToCloudTree.vue`                          | 推送到云端文章树                                                                                                                                                     |
| `PublishToWechatDialog.vue`                                            | 发布到公众号                                                                                                                                                         |
| `MaterialLibraryPanel.vue` `MaterialCard.vue` `SaveMaterialDialog.vue` | 素材面板与卡片                                                                                                                                                       |
| `XhsExporter.vue`                                                      | 小红书图导出（首图 + 正文卡片，桌面端打包 ZIP）                                                                                                                      |
| `FinalizeDialog.vue`                                                   | 定稿（本地导出 Markdown）                                                                                                                                            |
| `AiWriteDialog.vue`                                                    | AI 写作（对话模式；对话流在 body、**输入框走 `BaseDrawer` 的 `#footer` 插槽固定底部**；稿件卡 / 四层自检报告 / 应用到编辑器）                                        |
| `AiFormatDialog.vue`                                                   | AI 排版（来源选择 / 流式生成 / 差异对比，桌面双栏·移动单栏 / 应用结果 / 结果保留倒计时 + 清空）                                                                      |
| `AiImageDialog.vue`                                                    | AI 配图（提示词 / 尺寸档位·宽高比 / 出图预览与下载 / 插入编辑器 · 上传图床 · 保存磁盘并插入〔仅桌面端〕 / 结果保留倒计时 + 清空）                                    |
| `Dropdown.vue`                                                         | 通用下拉                                                                                                                                                             |
| `mobile/MobileActionsMenu.vue`                                         | 移动端操作菜单（含 AI 写作、AI 排版、AI 配图入口）                                                                                                                   |

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
14. **新增 AI 配图厂商只改一处**：各厂商参数不一致（尺寸是档位还是像素、宽高比是否独立字段、返回 url 还是 base64），差异全部收在 `src/services/imageProviders.ts` 的 `IMAGE_PROVIDERS` 里——加一条 `ImageProviderDef`（含 `buildBody` / `parseResponse`）即可，设置页与配图面板的字段由该描述渲染，调用层不得出现 `if (厂商 === 'xxx')`。配置按厂商存于设置 `imageGenProviders`（敏感字段，整体加密）；读取一律走 `getProviderConfig()`，不要直接读设置对象，否则拿不到默认值合并与非法值纠正
15. **AI 配图的图片落地不另起一套**：生成结果只产出 `File` 并交给 `useImageInsert`；`processImageInsert()` 按「图片设置 → 粘贴/拖拽上传方式」走本地存储 / 本地磁盘 / GitHub / 乐塔四条既有链路，`uploadImageToHosting()` 走图床那条，`insertImageToDisk()` 固定走本地磁盘（面板里的「保存磁盘并插入」，**仅桌面端显示**，`import.meta.env.VITE_TAURI === 'true'`）。不要在配图面板里判断存储方式、压缩或上传，否则两处行为会漂移。**磁盘落盘的压缩参数 / 大小上限 / img 标签格式只有 `insertImageToDisk()` 一份**——它同时服务粘贴、图库选图与 AI 配图三个入口，改一处三处生效
16. **Agnes 生图必须用 `return_base64: true`，不要用 URL 返回**：`response_format: 'url'` 给出的地址指向 `storage.googleapis.com/agnes-aigc/…`，**该存储域不返回 CORS 头**，浏览器里 `fetch` 它必被拦（网络面板显示 CORS error；`<img>` 能显示但 JS 读不到字节）。用 `return_base64: true` 让图片数据随同一次响应回来，就没有第二个请求。改厂商 def 的 `buildBody` 时注意别退回 URL 模式
17. **保存文件统一走 `src/utils/saveFile.ts`**：桌面端（Tauri）的 WebView 对 blob URL 的 `<a download>` **不生效且不报错**，必须用原生保存对话框（`plugin-dialog` 的 `save()` + `plugin-fs` 的 `writeFile()`）。该工具已封装「桌面端优先、用户取消即返回、插件异常才降级浏览器下载」；新增导出/保存功能一律用它，不要各处再抄一遍（HTML 导出 / 定稿 / 小红书导出三处仍是各自实现，改到时可一并收编）
18. **调用大模型只走 `aiFormat.chatCompletion`**：AI 排版（`formatArticle` 是它的别名）、AI 写作（`services/aiWrite.ts`）、AI 配图的提示词优化都调同一个实现，超时、错误中文映射、SSE 解析只有一份。新增任何「让模型说点什么」的功能一律复用它，不要再写第二份 fetch，否则这些边界处理会慢慢漂移
19. **AI 写作的技能文本是内置副本**：`src/data/ai/khazix/`（`SKILL.md` + `references/`）是 `khazix-writer` skill 的手工拷贝，做法与 `r-markdown-formatter/format-spec.md` 一致——顶部来源注释块记录基线 sha256，读取方 `aiWritePrompt.loadSkillText()` / `loadReferenceText()` 会剥离注释块与 YAML frontmatter（frontmatter 是 DSH 的 skill 路由元数据，进 prompt 只会让模型去描述这个 skill）。**技能原文末尾的「【固定尾部】」必须剥掉**（`stripFixedTail()`）：那是卡兹克本人公众号的模板（求三连、署名「作者：卡兹克」、他的投稿邮箱），用户写的是自己的号，照抄过去就是替别人署名、留别人的邮箱。剥离只发生在读取时，**不要改 `SKILL.md` 本身**（要求与源文件逐字节一致）；契约里也有一节明确禁止署名 / 求关注号召 / 邮箱联系方式——注意写这些条款时**不要原样复述尾部用词**（例如别写「不要出现『作者：卡兹克』」），那等于把要禁的字符串又放回 prompt，用「不要写署名或落款」这种泛化说法。技能更新后手动重拷覆盖并更新注释里的 sha256；这些文件已加进 `.prettierignore`，**不要**让 prettier 重排它们（表格与空行会漂移）
20. **AI 写作是单会话**：全局只有一个「当前会话」（IndexedDB 里固定 key `'current'` 的单条记录）；保留时长口径见第 29 条（**从最后一次请求滑动续期**，不再是「创建时算死的绝对有效期」）；`normalizeSession()` 对过期或结构非法的会话一律返回 `null`，调用方据此新建。稿件不另设数据结构——它就是一条 `kind: 'draft'` 的 assistant 消息，因此历次稿件天然留在对话里。往模型发历史时用 `toHistory()`（assistant 取 `article` 而非带标记的 `content`），旧稿被裁掉不影响改稿：那条请求会把稿件正文显式写进 user message
21. **AI 写作面板的输入框在 `BaseDrawer` 的 `#footer` 插槽**：footer 是 `flex shrink-0 justify-end gap-3 border-t px-5 py-3`，因此里面要放**单个 `w-full` 子元素**再自行分行（`justify-end` 对唯一子元素无影响）。不要把输入框放进 body，否则长对话时会被滚走；也不要为此给 `BaseDrawer` 加新插槽。自动增高由 `autoGrow()` 控制，最小 / 最大高度写成 `INPUT_BASE_MIN/MAX × INPUT_HEIGHT_SCALE`（当前倍率 2，即 76–296px）：**要调高度就改 `INPUT_HEIGHT_SCALE` 这一个数**，不要改成「行数翻倍」——那样最小高度只有 60px（内边距不参与翻倍），与「两倍高」对不上
22. **AI 写作稿件卡的操作按钮在卡片底部，不在顶部**：卡片顺序固定为「头部（稿件 + 字数）→ 正文 → 自检报告 → 操作行（重试自检 / 按自检意见改稿 / 重新生成 / 应用到编辑器）」。曾把操作行放在卡片顶部，它与**上一条回复**紧贴，用户点「应用到编辑器」时会以为填进编辑器的是上一条回答——这不是取值 bug，而是归属歧义。同时**每个操作按钮都必须带 `:disabled="generating"`**（「应用到编辑器」曾漏掉，流式期间可点，会去应用上一稿）。`onApply` / `onConfirmApply` 一律传**消息 id**、由 `doApply(id)` 回到当前 session 里重新取一次消息，不要捕获消息对象：确认弹窗确认期间会话可能已推进，拿旧对象会写进过期正文
23. **AI 写作稿件预览的排版是「段落设置 + 局部收紧」**：正文比编辑器预览小一号、行距更紧，但**不要**去逐元素覆盖字号——`markdownParser` 把标题 / 列表 / 引用 / 代码的字号写成了内联 px，只有段落走 `ParagraphStyle`，逐类覆盖既脆弱又容易漏。做法是：字号用 `.ai-write-preview` 的 CSS `zoom`（`--ai-write-preview-zoom`，默认 0.94）整体缩一档，行距在 `paragraphStyle()` 里减 `PREVIEW_LINE_HEIGHT_STEP`（0.15，下限 1.2——设置页滑块范围是 1.2–3.0）。`renderedHtml` 按消息 id 缓存，**缓存键必须带上段落设置**（`renderKey()`），否则用户改完字号 / 行距回来看到的还是上一套排版；稿件列表变化只补渲染缺 HTML 的稿子，段落设置变化才整体作废重渲染
24. **打开 AI 写作面板要滚到最底部，靠 `pinToBottom()` 而不是一次 `scrollToBottom()`**：稿件正文是**异步**渲染的（`renderDraft` → `parseMarkdownAsync`），渲染完会把内容撑高；输入框聚焦后还会自动增高、让滚动容器变矮。只设一次 `scrollTop` 会因为晚一拍落下的 reflow 而**差一点没到底**（曾实测差 133px）。做法是 `pinToBottom()` 连续若干帧把 `scrollTop` 顶到底，并用 `ResizeObserver` 同时盯 `contentRef`（内容长高）与 `scrollRef`（容器变矮）——两处都会改变「底部」位置。所有自动贴底都必须受 `stickToBottom` 约束：用户主动上滑后不得把他拽回去，回到底部（滚动到底 80px 内）才恢复跟随
25. **AI 写作面板只有一个技能开关「卡兹克写作技能」（`aiWriteUseSkill`，默认开启）**：它同时管三件事——技能本体 `SKILL.md`、参考资料 `references/`、出稿后的四层自检。这三者**本来就是同一套技能**（四层自检体系写在 `SKILL.md` 第四节里），曾拆成「四层自检」+「附带参考资料」两个勾选框，是误判，已合并。要点：
    - `buildSystem()` 在关掉时给 `buildWriteSystemPrompt` 传 `skill: ''`（参考资料也传空），`buildWriteSystemPrompt` 据此切成中性人设，并去掉「唯一写作标准」「用技能里的收尾方式」这类**指向技能的措辞**——否则 prompt 里会出现「请严格按下面这份技能来写」却什么都没跟，模型会困惑甚至瞎编。
    - 出稿后的质检条件是 `useSkill.value`（不再是独立的 `selfCheck`）。
    - 勾选状态用 `setSetting(..., true)` 静默写回，外部写入由 `onSkillChanged` 同步回本地 ref，**打开面板时必须重新读一遍设置**，否则面板显示的选择会与实际拼进 prompt 的值不一致。
    - `getSkill()` / `getRefs()` 是模块级 Promise 缓存，只管加载、不影响是否进 prompt，关掉开关时不必清理。
    - 老 key `aiWriteSelfCheck` / `aiWriteIncludeReferences` 已随合并删除；它们**从未发布过**（新增于同一会话），所以不需要迁移。
26. **设置里的「AI 文本」= 写作 + 排版合并，接口配置共用**：`SettingsDialog` 的 `aiPane` 只有 `'text' | 'image'`（原来的 `write` / `format` 已合并）。接口地址 / API Key / 模型名 / 流式输出四项写作与排版**共用一份**（`aiBaseUrl` / `aiApiKey` / `aiModel` / `aiStream`），只出现一次；`aiWriteModelOverride` 已删除，`resolveWriteConfig()` 只覆盖写作与排版不同的采样参数（`aiWriteTemperature` / `aiWriteMaxTokens`），`isWriteConfigured()` 直接等同 `isAiConfigured()`。`text` 子页内用两个 `<section>`（「AI 排版」「AI 写作」）分区展示差异项。子页名与功能名是两套口径：**子页按模态叫「AI 文本 / AI 图片」，功能仍叫「AI 写作 / AI 排版 / AI 配图」**（侧栏入口、面板标题、教程都用功能名）。`initialTab` 约定保留 `'ai-write'` / `'ai-format'` / `'ai-image'` 三个入口，前两个都落到 `text` 子页
27. **「AI 文本」里所有采样参数一律用滑块，样式对齐 `compress-slider`**：「AI 排版」「AI 写作」两个小节的控件必须同款——`class="compress-slider w-full cursor-pointer"` + 标题行 `flex items-center justify-between mb-1`（右侧显示当前值）+ 说明行 `mt-0.5`。写作的「最大输出」曾是 `<input type="number">`，与排版的滑块不一致，已统一改为滑块。写作最大输出的区间常量在 `services/aiWrite.ts`（`MIN_WRITE_MAX_TOKENS` / `MAX_WRITE_MAX_TOKENS` = 1024 / 65536），上限比排版的 1024–32768 更高——长文 + 技能全文 + 参考资料一起算，输出截断是写作最常见的失败；模板里用 `:min` / `:max` 绑定常量，不要写死字面量
28. **AI 写作面板不显示 token 数（曾有过「固定开销约 N tokens」，已按要求移除）**：那段展示经历过一次修正——最初直接显示 `estimatePromptTokens(buildSystem())`，但四层自检**不改 system prompt**，而是出稿后**另发一次请求**（`runSelfCheck` 复用同一份 system，只把待检文章放进 user），所以勾选自检时数字纹丝不动、看起来像 bug；后来改成 `computed` 并在勾选时 ×2。**用户最终决定整个去掉**（2026-10-15），因此相关的 `fixedTokens` / `systemTokens` / `refreshFixedTokens` 与 `aiWritePrompt.estimatePromptTokens` 都已删除——不要再加回来，也不要在参数行右侧放这类估算。**保留的结论仍然成立**：四层自检会让一轮里的技能全文发两遍（实测两次请求的 system 相同），这是它更慢更贵的真实原因，教程里据实说明了这一点。**注意**：当时「自检不改 system」的原因是「四层自检是另发一次请求」，这一点仍然成立；但「自检」现在已并入「卡兹克写作技能」开关（见第 25 条），不再有独立的 `selfCheck` ref
29. **三个 AI 面板的「结果保留」是同一套机制，但保留时长各设各的**：写作 / 排版 / 配图的结果都留在本地，按各自设置项（`aiWriteSessionHours` / `aiFormatSessionHours` / `aiImageSessionHours`，都默认 24h）自动作废。**别再把它们合回一个共用 key**——用户的节奏不同（写作一次聊几十分钟，排版/配图多是生成一次就用掉），共用会逼他折中。倒计时 composable 要显式传入自己那一项的 key（`useSessionCountdown('aiFormatSessionHours')`）。要点：
    - **滑动续期**：`expiresAt` 不是创建时算死，而是**每次发起请求时**推到 `now + 时长`（写作 `renewOnRequest()`、排版 `onGenerate`、配图 `onGenerate` 各调一次）。旧口径「从创建时刻算起的绝对有效期」已废弃——`aiWriteSession` 的旧 `normalizeSession` 曾拿 `createdAt` 当夹取基准，滑动续期下会把正常会话误判成异常，已改成以**最后一次消息时刻**为基准。
    - **共用逻辑**：保留时长的收敛 / 剩余文案 / 过期判定在 `utils/aiSession.ts`；倒计时刷新在 `composables/useSessionCountdown.ts`（每秒 tick，但只在文案真变了才写 ref）。面板自己只维护一个 `resultExpiresAt`。
    - **持久化**：`services/aiSessionStore.ts` 提供 records（JSON：排版文本、配图元信息）+ blobs（配图二进制）两个 store。**写入前必须 `JSON.parse(JSON.stringify())` 深拷贝**，否则响应式代理会触发 DataCloneError。读取时若已过期会顺手删掉记录。
    - **清空**：每个面板头部有「清空结果」，各走一个 `ConfirmDialog` 二次确认，清内存 + 清本地记录（配图还要 `clearAllBlobs()`）。
    - 设置项曾短暂合并成 `aiSessionHours`，现拆回三个独立 key。`initSettings()` 里保留了一段迁移：把那个共用值还给三个面板再删旧 key（装过中间版本的用户 choice 不丢），别删。
