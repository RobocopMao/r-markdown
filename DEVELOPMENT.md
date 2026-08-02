# r-markdown 开发规范

> 每次开发前必须阅读本文档，确保代码风格和项目结构一致。

## 项目概述

公众号 Markdown 排版编辑器，支持实时预览、主题切换、深色模式。

## 技术栈

| 类别   | 技术                    | 版本  |
| ------ | ----------------------- | ----- |
| 框架   | Vue 3 (Composition API) | 3.6.x |
| 语言   | TypeScript              | 6.x   |
| 构建   | Vite                    | 8.x   |
| 样式   | Tailwind CSS 4          | 4.3.x |
| 编辑器 | CodeMirror 6            | 6.x   |
| 路由   | Vue Router              | 4.6.x |
| 桌面   | Tauri 2                 | 2.x   |
| 包管理 | pnpm                    | -     |
| Node   | >= 24.0.0               | -     |

## 目录结构

```
src/
├── components/          # 公用组件
│   ├── BaseDialog.vue       # 通用弹窗
│   ├── DarkModeToggle.vue   # 深色模式切换
│   ├── NavCapsule.vue       # 顶部导航胶囊
│   ├── SiteFooter.vue       # 页脚
│   ├── SiteLogo.vue         # 站点 Logo
│   ├── Toast.vue            # 轻提示
│   └── mobile/              # 移动端专用
│       └── MobileNavMenu.vue    # 移动端导航菜单
├── extension/            # 排版组件库（git 子模块）
│   ├── index.ts             # 组件注册与导出
│   ├── Badges_DA01.ts       # 标签徽章
│   ├── Breaking_DA01.ts     # 突发新闻卡片
│   ├── CaseFlow_DA01.ts     # 案例流程
│   ├── Chart_DA01.ts        # 图表组件
│   ├── Compare_DA01.ts      # 对比布局 v1
│   ├── Compare_DA02.ts      # 对比布局 v2
│   ├── Cta_DA01.ts          # 行动召唤
│   ├── Engage_DA01.ts       # 互动引导 v1
│   ├── Engage_DA02.ts       # 互动引导 v2
│   ├── Img_DA01.ts          # 单图组件
│   ├── Lead_DA01.ts         # 引导文段
│   ├── PTitle_DA01.ts       # 副标题
│   ├── ReadingPath_DA01.ts  # 阅读路径
│   ├── Slider_DA01.ts       # 图片幻灯片轮播
│   ├── Statement_DA01.ts    # 居中强调语
│   ├── Steps_DA01.ts        # 步骤流 v1
│   ├── Steps_DA02.ts        # 步骤流 v2
│   ├── Timeline_DA01.ts     # 时间线
│   ├── Title_DA01.ts        # 标题 v1
│   └── Title_DA02.ts        # 标题 v2
├── extension-stubs/     # 排版组件空桩（extension 不可用时的 fallback）
│   ├── index.ts             # 与 extension/index.ts 接口一致的 stub
│   ├── Badges_DA01.ts       # …（21 个组件，render 返回空字符串）
│   └── ...
├── composables/         # Vue 组合式函数
│   ├── useAutoUpdater.ts    # Tauri 自动更新检查
│   ├── useDarkMode.ts       # 深色模式逻辑
│   └── useTheme.ts          # 主题管理
├── router/              # 路由配置
│   └── index.ts
├── styles/              # 全局样式
│   └── style.css
├── utils/               # 工具函数
│   ├── components.ts        # 组件解析器（callout/timeline 等）
│   ├── helpers.ts           # 通用工具（esc/leaf/lightenHex 等）
│   ├── inlineFormat.ts      # 行内格式化（==渐变::柔光!!胶囊^^上标等）
│   └── mathRenderer.ts      # MathJax 公式渲染
├── App.vue              # 根组件
├── main.ts              # 入口文件
├── views/               # 页面视图
│   ├── home/
│   │   └── HomePage.vue     # 首页
│   ├── editor/
│   │   ├── EditorPage.vue   # 编辑器页
│   │   └── components/      # 编辑器专用组件（Editor/Preview/ThemePicker 等，mobile/ 下为移动端操作菜单）
│   └── extension/
│       └── ExtensionPage.vue # 组件展示页

src-tauri/               # Tauri 桌面客户端（Rust）
├── src/
│   ├── main.rs              # Rust 程序入口
│   └── lib.rs               # Tauri 插件注册与配置
├── icons/                   # 应用图标（ico/icns/png）
├── capabilities/            # 权限声明（shell/updater 等）
├── Cargo.toml               # Rust 依赖与包配置
└── tauri.conf.json          # Tauri 构建与打包配置
```

## 开发环境搭建

```bash
# 安装依赖
pnpm install

# 启动 Web 开发服务器
pnpm dev

# 启动 Tauri 桌面客户端开发模式（热更新）
pnpm tauri:dev

# 构建 Web 生产版本
pnpm build

# 构建桌面客户端
pnpm tauri:build

# 代码检查
pnpm check        # ESLint + Prettier 检查
pnpm lint         # ESLint 自动修复
pnpm format       # Prettier 格式化
```

## 代码规范

### ESLint 规则

- `prefer-const`: 强制使用 const
- `no-var`: 禁止 var
- `no-console`: 仅允许 console.warn 和 console.error
- `@typescript-eslint/no-explicit-any`: 警告（尽量避免 any）
- `@typescript-eslint/no-unused-vars`: 警告（`_` 开头的变量/参数忽略）
- `vue/multi-word-component-names`: 关闭
- `vue/no-v-html`: 关闭（项目需要 v-html 渲染 Markdown）

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

## TypeScript 规范

- **严格模式**已开启（`strict: true`）
- **避免 `any`**，用 `unknown` 或具体类型替代
- **正则回调参数**用 `_m`, `_p1`, `_p2` 命名（匹配但不使用）
- **工具函数导出**用 `export function`，不用 `export default`
- **类型定义**集中在文件顶部或独立类型文件中

## 样式规范

### Tailwind CSS 4

- 优先使用 Tailwind 工具类，避免自定义 CSS
- 自定义样式写在 `<style scoped>` 中
- 全局样式写在 `src/styles/style.css`

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

### 行内格式化语法

在 `src/utils/inlineFormat.ts` 中定义：

| 语法                 | 效果     | HTML 输出                                          |
| -------------------- | -------- | -------------------------------------------------- |
| `==文字==`           | 渐变背景 | `<span style="background:linear-gradient(...)">`   |
| `::文字::`           | 柔光重点 | `<span style="color:...;font-weight:700">`         |
| `!!文字!!`           | 胶囊文字 | `<span style="background:...;border-radius:20px">` |
| `^^文字^^`           | 上标强调 | `<strong style="color:...">`                       |
| `__文字__`           | 下划线   | `<span style="text-decoration:underline">`         |
| `~~文字~~`           | 删除线   | `<del>`                                            |
| `**文字**`           | 加粗     | `<strong>`                                         |
| `*文字*`             | 斜体     | `<em>`                                             |
| `` `文字` ``         | 行内代码 | `<code>`                                           |
| `[text](url "desc")` | 脚注引用 | 带引号标题的链接自动转为脚注，文末生成参考资料     |

### 组件解析语法

### 编辑器组件语法

在 `src/editor-components/` 目录下定义，通过 `<tag>` 标签使用：

| 标签            | 组件           | 说明                       |
| --------------- | -------------- | -------------------------- |
| `<title>`       | 标题组件       | 支持 v1/v2 两种样式        |
| `<ptitle>`      | 副标题组件     | 支持 hide 属性隐藏元素     |
| `<statement>`   | 居中强调语     | -                          |
| `<lead>`        | 引导文字段     | -                          |
| `<breaking>`    | 突发新闻卡片   | -                          |
| `<compare>`     | 对比布局       | 支持 v1/v2 两种样式        |
| `<cta>`         | 行动召唤卡片   | -                          |
| `<steps>`       | 横向步骤流     | 支持 v1/v2 两种样式        |
| `<timeline>`    | 时间线组件     | -                          |
| `<engage>`      | 互动引导组件   | 支持 v1/v2 两种样式        |
| `<caseflow>`    | 案例流程组件   | -                          |
| `<readingpath>` | 阅读路径组件   | -                          |
| `<img>`         | 单图组件       | 支持宽高、圆角、裁切、对齐 |
| `<slider>`      | 图片幻灯片轮播 | 支持 4 种轮播模式          |
| `<chart>`       | 图表组件       | -                          |
| `<badges>`      | 标签徽章       | -                          |

## Extension 子模块机制

`src/extension/` 是 git 子模块，仓库为闭源私有。无权限克隆时该目录为空。

### Fallback 策略

`vite.config.ts` 在构建时检测 `src/extension/` 是否为空目录（过滤 `.` / `..` 后无文件），若为空则通过 Vite alias 将 `@/extension` 重定向到 `src/extension-stubs/`：

```typescript
const extensionDir = `${__dirname}/src/extension`
const hasExtension =
  existsSync(extensionDir) && readdirSync(extensionDir).filter((f) => !f.startsWith('.')).length > 0

export default defineConfig({
  resolve: {
    alias: [
      // 必须用数组形式确保 @/extension 优先于 @
      ...(!hasExtension ? [{ find: '@/extension', replacement: '/src/extension-stubs' }] : []),
      { find: '@', replacement: '/src' },
    ],
  },
})
```

### Stub 结构

`src/extension-stubs/` 包含 21 个组件，每个组件导出与 `extension/` 同名的 `ComponentDef` 对象，`render` 返回空字符串。`index.ts` 导出与 `extension/index.ts` 完全一致的 `ComponentDef` 接口、`components[]`、`componentMap`、`tagMap` 及所有独立组件。

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

示例：`v0.1.3`

### ⚠️ 推送规则（强制）

**只有用户主动提出推送代码时，才执行 `git push`。** 无论哪个分支（main / develop / 功能分支），AI 不得自行决定推送。

- 提交（commit）可以在开发过程中自动执行
- 推送（push）必须等用户明确说"推送"、"push"、"推到线上"等指令后才执行
- 合并（merge）到 main 分支也需要用户确认后才执行
- 删除远程 tag 同理，需用户确认

### 发布流程

```bash
# 1. 在 develop 分支开发并提交
git add .
git commit -m "feat: xxx"

# 2. 用户确认后合并到 main
git checkout main
git merge develop

# 3. 用户确认后推送 main
git push origin main

# 4. 用户确认后删除旧 tag 并重新打 tag
git tag -d v0.1.x
git push origin :refs/tags/v0.1.x
git tag v0.1.x
git push origin v0.1.x

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

| 文件                | 触发条件                 | 用途                                                          |
| ------------------- | ------------------------ | ------------------------------------------------------------- |
| `deploy.yml`        | 推送 `main` 分支         | 构建 Web 版并部署到 GitHub Pages                              |
| `build-desktop.yml` | 推送 `v*` 标签或手动触发 | 构建 macOS (aarch64) + Windows (x64) 桌面客户端并发布 Release |

**重要配置说明**：

- `vite.config.ts` 中 `base` 路径区分 Web 部署（`/r-markdown/`）和桌面构建（`/`），通过 `VITE_TAURI` 和 `GITHUB_ACTIONS` 两个环境变量联合判断
- 桌面构建使用 `cross-env` 确保跨平台环境变量兼容
- 发布时 `Cargo.toml` 中 `[lib] name` 必须为 snake_case（`r_markdown_lib`）
- 桌面客户端无代码签名，macOS 安装后需执行 `sudo xattr -rd com.apple.quarantine /Applications/R-Markdown.app` 放行
- 每次发布桌面客户端需同步更新 `tauri.conf.json` 的 `version` 字段与 git tag 一致

### 预览构建产物

```bash
pnpm preview
```

## 注意事项

1. **不要手动编辑 `.vue.js` 文件**：这些是 Vue 编译器生成的临时文件，已在 `.gitignore` 中排除
2. **不要提交 `src/**/\*.js`文件**：TypeScript 源码编译产物，已在`.gitignore` 中排除
3. **修改行内格式化语法后**：同步更新本文档的语法对照表
4. **新增组件后**：同步更新本文档的目录结构和组件解析语法表
5. **构建前确认**：确保 `pnpm check` 通过，无 ESLint/Prettier 错误
6. **Tauri 开发**：
   - 前端代码中的 Tauri API 调用须通过 `import.meta.env.VITE_TAURI === 'true'` 守卫，确保 Web 版不受影响
   - 修改 `Cargo.toml` 中 `[lib] name` 后须同步修改 `src-tauri/src/main.rs` 中的 crate 引用
   - 首次构建桌面端需安装 Rust 工具链（[rustup.rs](https://rustup.rs)）
7. **Node 版本**：项目要求 Node.js >= 24，使用 nvm 管理版本：
   ```bash
   nvm install 24
   nvm use 24
   ```
