<!--
  来源：r-markdown-formatter skill 的 references/format-spec.md
        （源仓库 RobocopMao/r-markdown-formatter，私有；本地 sibling 目录 ../r-markdown-formatter）

  用途：AI 排版功能的「唯一排版标准」，整篇作为 system prompt 的规范部分下发给模型。

  同步方式：skill 规范更新后，手动重新拷贝覆盖本文件，并保留本注释块。
            校验：去掉本注释块后，正文应与源文件逐字节一致
            （当前基线 sha256 = 56fab0adc044f04aff7e50253208b9e47d87f26e6d369532517e6e124b259314）。

  注意：本行以下的任何内容都会原样进入 prompt，不要在这里写非规范内容。
        读取方（src/utils/aiFormatPrompt.ts 的 loadFormatSpec）会剥离本注释块。
-->

# R-Markdown 组件参数参考

> 按功能分类，罗列所有组件的写法、参数和子内容格式。

---

## 一、标题与分节

### `<title>` — 文章标题卡片

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `type` | string | `DA01` | `DA01`（阅读统计右侧）/ `DA02`（统计 badge 旁） |
| `badge` | string | `""` | 顶部标签，如 GUIDE / TUTORIAL |
| `subtitle` | string | `""` | 副标题或说明文字 |
| `chips` | string | `""` | 关键词，用 `\|` 分隔 |
| `style` | string | `""` | `banner`（主题色通栏）/ `float`（主题色圆角标签）/ `info`（浅主题色横向信息栏）/ `highlight`（左侧主题色宽边）/ `gradient`（浅主题色渐变）；仅 DA02 支持，留空为默认卡片 |
| `avatar` | string | `""` | `info` 风格左侧圆形头像图片路径，留空使用文档图标 |
| `color` | string | `""` | CSS 颜色值，覆盖主题色 |
| `title-size` | string | `28px` | 标题字号，如 28px、32px |
| `title-weight` | string | `900` | 标题字重，如 400-900 |
| `title-color` | string | `rgb(17,24,39)` | 标题颜色，任意 CSS 颜色值 |
| `margin` | string | `""` | 组件外边距，CSS margin 格式，留空默认 `0px 0px 30px` |

**子内容**: 文章标题（必填）

**写法示例**:
```markdown
<title type="DA02" badge="作业" subtitle="AIGC 商业视频实战营 · 第2周" chips="即梦AI|图生图">第2周作业</title>
<title type="DA02" style="banner" badge="UPDATE" subtitle="新增了段落标题、步骤流程、时间线等组件。" chips="新组件|深色模式">v2.0 版本更新说明</title>
<title type="DA02" style="info" avatar="https://example.com/avatar.png" badge="GUIDE" subtitle="快速入门指南">如何上手</title>
```

---

### `<p-title>` — 段落标题

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `num` | string | `""` | 序号数字，如 01 / 02 / 03 |
| `title` | string | `""` | 标题文字（优先于 body） |
| `subtitle` | string | `""` | 副标题，如英文翻译 |
| `level` | string | `1` | `1` / `2` / `3` / `4` |
| `size` | string | `normal` | `normal` / `medium` / `small`（仅 level=1） |
| `num-style` | string | `""` | `circle`（圆形）/ `square`（圆角矩形）（仅 level≠1） |
| `prefix` | string | `""` | 前缀图标，如 🚀 |
| `suffix` | string | `""` | 后缀图标，如 ✅ |
| `hide` | string | `""` | `num`（隐藏序号）/ `line`（隐藏章节线）（仅 level=1） |
| `color` | string | `""` | 标题颜色 |
| `num-color` | string | `""` | 序号颜色 |
| `subtitle-color` | string | `""` | 副标题颜色 |

**子内容**: body 作为 title 的 fallback（title 属性优先）

**写法示例**:
```markdown
<!-- 一级（完整章节标题） -->
<p-title num="01" title="作业目标" subtitle="OBJECTIVES" level="1"></p-title>

<!-- 一级 + size -->
<p-title num="01" title="作业目标" level="1" size="medium"></p-title>

<!-- 二级 -->
<p-title num="01" title="AI 绘画创作" level="2"></p-title>

<!-- 三级 + 圆形序号 -->
<p-title num="01" title="提示词" level="3" num-style="circle"></p-title>

<!-- DA02 变体（flex row 三段式，竖线分隔，4 级） -->
<p-title type="DA02" num="01" title="章节标题" level="1"></p-title>
<p-title type="DA02" num="01" title="章节标题" subtitle="SUBTITLE" level="2"></p-title>
```

---

## 二、导航与引导

### `<reading-path>` — 阅读导航

无属性。自动从文档结构抽取 h2 标题生成章节导航。

**写法示例**:
```markdown
<reading-path></reading-path>
```

---

### `<lead>` — 引导文字段

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `color` | string | `""` | 左侧边框颜色 |
| `text-color` | string | `""` | 文字颜色 |
| `bg` | string | `""` | 背景颜色 |
| `round` | string | `""` | 圆角，如 `12px` |

**子内容**: 引导文字（必填）

**写法示例**:
```markdown
<lead>使用即梦AI绘画工具，完成一幅治愈作品。</lead>
```

---

### `<statement>` — 居中强调语

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `color` | string | `""` | 文字颜色，默认 `rgb(51,65,85)` |

**子内容**: 强调文字（必填）。居中、大字号、加粗。

**写法示例**:
```markdown
<statement>提交方式：以班主任发布为准</statement>
```

---

## 三、信息卡片

### `<breaking>` — 重大更新 / 核心结论卡片

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `badge` | string | `""` | 顶部标签，如 BREAKING / NEW |
| `title` | string | `""` | 主标题 |
| `subtitle` | string | `""` | 副标题 |
| `chips` | string | `""` | 关键词，用 `\|` 分隔 |
| `color` | string | `""` | CSS 颜色值 |
| `top` | string | `""` | 设为任意值去除顶部外边距 |

**子内容**: 正文内容

**写法示例**:
```markdown
<breaking badge="直播" title="本周课程安排" subtitle="录播 + 直播，双管齐下" chips="即梦AI|实战">
**录播课**：==《即梦AI创作技巧》==

**直播课**：::《图生图创作实战》::
</breaking>
```

---

### `<cta>` — 行动号召卡片

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `label` | string | `""` | 顶部标签，如 GET STARTED |
| `title` | string | `""` | 主标题 |
| `button` | string | `""` | 按钮文字 |
| `color` | string | `""` | CSS 颜色值 |
| `light` | string | `""` | 设任意值启用浅色背景（否则深色渐变） |

**子内容**: 补充说明文字

**写法示例**:
```markdown
<cta label="GET STARTED" title="准备好开始你的创作了吗？" button="立即复制下方代码"></cta>
```

---

### `<engage>` — 底部互动引导

**DA01（点赞转发版）**:

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `type` | string | `DA01` | `DA01` / `DA02` |
| `title` | string | `""` | 主标题 |
| `label` | string | `THANKS FOR READING` | 底部小字 |

**DA02（彩色图标版）**:

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `type` | string | `DA02` | `DA01` / `DA02` |
| `title` | string | `感谢你的阅读与支持！` | 主标题 |
| `subtitle` | string | `喜欢就互动一下吧～ 💚` | 副标题 |
| `color` | string | `red\|green\|yellow` | 单一色（三列同色）/ 三色用 `\|` 分隔对应点赞/转发/推荐。支持: green/red/yellow/blue/purple/orange/pink/teal/gray/十六进制 |

**写法示例**:
```markdown
<!-- DA01 简约版 -->
<engage type="DA01" title="希望这篇文章对你有帮助" label="THANKS FOR READING"></engage>

<!-- DA02 彩色版 -->
<engage type="DA02" title="感谢你的阅读与支持！" subtitle="喜欢就互动一下吧～ ♥️" color="red|green|yellow"></engage>
```

---

## 四、步骤与流程

### `<steps>` — 步骤流

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `label` | string | `""` | 顶部标签，如 HOW IT WORKS |
| `title` | string | `""` | 主标题 |
| `hint` | string | `""` | 底部提示，如「左右滑动查看」 |
| `active` | string | `1` | 高亮步骤序号 |
| `color` | string | `""` | CSS 颜色值 |
| `direction` | string | DA01=`horizontal`, DA02=`vertical` | `horizontal` / `vertical` |

**子内容**: 每行 `- 步骤名 | 步骤描述`

**写法示例**:
```markdown
<!-- 横向步骤 -->
<steps label="FIVE COMMANDS" title="五大核心提示词指令" hint="左右滑动查看" active="1">
- 风格 | 选择绘画风格，如写实、插画、水彩
- 环境 | 描述画面背景
- 主体 | 明确画面主要对象
</steps>

<!-- 竖向步骤 -->
<steps label="IMAGE-TO-IMAGE" title="图生图创作流程" direction="vertical" active="1">
- 选择参考图 | 挑选一张合适的参考图片
- 调整风格 | 使用图生图功能调整
</steps>
```

---

### `<case-flow>` — 实践案例流

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `color` | string | `""` | 标签背景色 |

**子内容**: 每行 `- [案例 N] 案例描述`

**写法示例**:
```markdown
<case-flow>
- [案例 01] 品牌视觉升级：从绿色全面转向 Indigo 靛青色调
- [案例 02] 交互体验优化：图片窗口化让长文阅读更流畅
</case-flow>
```

---

### `<timeline>` — 时间线

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `color` | string | `""` | 时间线颜色 |

**子内容**: 每行 `- 日期 | 标题 | 描述`，可选图片

**写法示例**:
```markdown
<timeline>
- 2024年01月 | 项目启动 | 完成团队组建和需求分析
- 2024年06月 | 一期上线 | 核心功能发布，用户突破1万
- 2025年01月 | 二期迭代 | 新增AI辅助功能 | ![配图](url)[100% 120px]
</timeline>
```

---

## 五、对比与图表

### `<compare>` — 前后对比

| 属性 | 类型 | DA01默认值 | DA02默认值 | 可选值/说明 |
|------|------|-----------|-----------|-------------|
| `type` | string | `DA01` | `DA02` | `DA01`（横向）/ `DA02`（纵向） |
| `left-label` | string | `""` | `""` | 左侧列标签 |
| `left-title` | string | `""` | `""` | 左侧列标题 |
| `right-label` | string | `""` | `""` | 右侧列标签 |
| `right-title` | string | `""` | `""` | 右侧列标题 |
| `color` | string | `""` | `""` | CSS 颜色值 |
| `direction` | string | `horizontal` | — | 仅 DA01，`horizontal` / `vertical` |

**子内容**: 使用 `<left>` 和 `<right>` 子标签包裹两侧内容

**写法示例**:
```markdown
<!-- 横向对比 -->
<compare left-label="BEFORE" left-title="改版前" right-label="AFTER" right-title="改版后">
<left>
![旧版](old.png)[100% 120px]
</left>
<right>
![新版](new.png)[100% 120px]
</right>
</compare>

<!-- 纵向对比 -->
<compare type="DA02" left-label="BEFORE" left-title="改版前" right-label="AFTER" right-title="改版后">
<left>
旧版描述...
</left>
<right>
新版描述...
</right>
</compare>
```

---

### `<chart>` — 图表

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `type` | string | `bar` | **必填**。`bar` / `line` / `pie` / `scatter` |
| `labels` | string | `""` | **必填**（散点图除外）。逗号分隔 |
| `values` | string | `""` | **必填**。逗号分隔；多组用 `;` 分隔；散点图多组用 `\|` 分隔 |
| `width` | string | `375` | SVG 宽度（px） |
| `height` | string | `""` | SVG 高度（px），不填自动 |
| `title` | string | `""` | 图表标题 |
| `colors` | string | `""` | 自定义颜色，逗号分隔 |
| `color` | string | `""` | 色板基础色 |
| `smooth` | string | `false` | `true` / `false`（仅 type=line） |
| `legends` | string | `""` | 多组数据图例，逗号分隔 |
| `unit` | string | `""` | 数据单位，如 `万元` |

**子内容**: 无

**写法示例**:
```markdown
<chart type="bar" labels="一月,二月,三月" values="120,200,150" title="季度销售" unit="万元" colors="#ff6b6b,#4ecdc4,#45b7d1"></chart>
```

---

## 六、媒体展示

### `<slider>` — 图片轮播

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `images` | string | `""` | **必填**。URL 逗号分隔（最多 5 张） |
| `interval` | string | `3` | 切换间隔（秒），最低 2 秒 |
| `width` | string | `600` | 视图宽度（px） |
| `height` | string | `200` | 视图高度（px） |
| `type` | string | `1` | `1`（循环）/ `2`（来回）/ `3`（滚回）/ `4`（淡入淡出） |

**写法示例**:
```markdown
<slider images="img1.webp,img2.webp,img3.webp" interval="3" width="1080" height="463" type="1"></slider>
```

---

### `<img>` — 自定义图片

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `src` | string | `""` | **必填**。图片地址，支持 http(s) URL、base64 数据 |
| `alt` | string | `""` | 替代文本 |
| `desc` | string | `""` | 图片说明，有值时显示在图片下方 |
| `width` | string | `100%` | 容器宽度，如 `100%` / `600px` |
| `height` | string | `auto` | 容器高度，如 `auto` / `400px` |
| `radius` | string | `8px` | 圆角，如 `12px` / `50%` / `10px 20px` / `10px 20px 10px 20px` |
| `fit` | string | `cover` | `fill` / `contain` / `cover` / `none` / `scale-down`，CSS object-fit 裁切方式 |
| `align` | string | `left` | `left` / `center` / `right`，容器水平对齐（固定宽度时生效） |
| `left` | string | `""` | X 轴偏移（margin-left），如 `10px` / `-20px` / `50%` |
| `top` | string | `""` | Y 轴偏移（margin-top），如 `10px` / `-20px` / `50%` |
| `margin` | string | `""` | 外边距，CSS margin 格式（上 右 下 左），留空由 align 决定默认值 |
| `shadow` | string | `""` | 图片容器阴影，如 `rgba(0,0,0,0.1) 0px 10px 24px`；设为 `true` 使用默认阴影 |
| `overflow` | string | `hidden` | `hidden` / `visible` / `auto` / `scroll`，容器溢出处理方式 |

---

## 七、标签与徽章

### `<badges>` — 彩色标签组

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `tone` | string | `accent` | `accent` / `green` / `yellow` / `dark`，预设风格色调 |
| `color` | string | `""` | 自定义文字颜色（优先于 tone），如 `#333` |
| `bg` | string | `""` | 自定义背景颜色（优先于 tone）；多个颜色用 `|` 分隔时使用横向渐变背景，如 `#ff6b6b|#6c5ce7` |
| `margin` | string | `""` | 组件外边距，CSS margin 格式（上 右 下 左），留空使用默认值 `14px 0px` |

**子内容**: 用 `|` 分隔标签文字

**写法示例**:
```markdown
<badges tone="accent">Vue|TypeScript|Vite|Tailwind</badges>
<badges tone="green">React|Next.js|Prisma</badges>
<badges color="#fff" bg="#e74c3c">自定义红底白字</badges>
<badges bg="#ff6b6b|#6c5ce7" color="#fff">渐变背景标签</badges>
```

---

## 八、表格扩展

### `<table>` — 表格扩展

使用 `<table>` 标签包裹标准 Markdown 表格语法，实现丰富的表格样式定制。

| 属性 | 类型 | 默认值 | 可选值/说明 |
|------|------|--------|-------------|
| `width` | string | `""` | 表格宽度，如 `800px` 或 `120%`，配合 scroll-x 实现横向滚动 |
| `height` | string | `""` | 容器最大高度，如 `300px`，配合 scroll-y 实现竖向滚动 |
| `padding` | string | `20px` | 外层容器内边距，如 `8px 16px` |
| `margin` | string | `24px 0px` | 外层容器外边距 |
| `radius` | string | `14px` | 外层容器圆角半径 |
| `scroll-x` | string | `true` | `true` / `false`，表格宽度超出容器时开启横向滚动 |
| `scroll-y` | string | `false` | `true` / `false`，表格高度超出容器时开启竖向滚动，需配合 height |
| `striped` | string | `false` | `true` / `false`，斑马条纹（偶数行浅灰背景交替） |
| `compact` | string | `false` | `true` / `false`，紧凑模式（减小单元格内边距） |
| `border` | string | `false` | `true` / `false`，为单元格添加边框线 |
| `nowrap` | string | `false` | `true` / `false`，强制单元格内容不换行 |
| `font-size` | string | `13px` | 单元格字体大小，如 `14px` / `0.9rem` |
| `header-bg` | string | `""` | 自定义表头背景色，如 `#e8f0fe` 或 `rgb(232,240,254)` |
| `header-color` | string | `#334155` | 自定义表头文字颜色 |
| `bg` | string | `""` | 表格内容区背景色，如 `#ffffff` |
| `cell-color` | string | `""` | 单元格文字颜色，默认 `rgb(51,65,85)` |
| `striped-bg` | string | `""` | 斑马纹行背景色（优先级高于 bg） |
| `striped-color` | string | `""` | 斑马纹行文字颜色（优先级高于 cell-color） |
| `border-color` | string | `""` | 边框颜色，默认 `rgba(229,231,235,0.9)` |

**子内容**: 标准 Markdown 表格语法（`| 列A | 列B |\n| --- | --- |\n| 1 | 2 |`）

**单元格合并语法**:
- `{col:N}` — 合并右侧 N 列
- `{row:N}` — 合并下方 N 行
- `{col:2,row:3}` — 组合使用
- `{cover}` — 被合并占用的格，渲染时跳过

**写法示例**:
```markdown
<!-- 基本表格 -->
<table>
| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| scroll-x | 横向滚动 | true |
| striped | 斑马条纹 | false |
</table>

<!-- 带样式的表格 -->
<table striped compact header-bg="#f0f4ff" border>
| 项目 | Q1 | Q2 | 备注 |
| --- | --- | --- | --- |
| 营收 | {col:2}合并两列 | {cover} | - |
| 成本 | 80 | 90 | 120 |
</table>
```

---

## 九、行内修饰语法

| 语法 | 效果 | 适用场景 |
|------|------|----------|
| `==文字==` | 渐变背景 | 核心术语、关键概念划重点 |
| `!!文字!!` | 圆角胶囊 | 可点击/可操作对象、产品名 |
| `^^文字^^` | 靛青加重 | 加重强调的观点 |
| `::文字::` | 柔光蓝紫 | 次要强调 |
| `**文字**` | 粗体 | 常规强调 |
| `__文字__` 或 `<u>文字</u>` | 下划线 | 链接式强调 |
| `~~文字~~` | 删除线 | 否定/删除 |
| `*文字*` | 斜体 | 引用/书名 |
| `***文字***` | 加粗+斜体 | 强强调 |
| `H~2~O` | 下标 | 化学式 |
| `m^2^` | 上标 | 数学单位 |

---

## 十、通用 Markdown 语法

### 图片语法

```markdown
<!-- 基本图片 -->
![描述](url)

<!-- 限制尺寸 -->
![描述](url)[100% 200px]

<!-- 多图横向滑动并排 -->
< ![图1](url1), ![图2](url2), ![图3](url3) >
```

### 代码块

```markdown
```javascript
const count = ref(0)
```

### 任务列表

```markdown
- [x] 已完成
- [ ] 未完成
```

### 提示块

```markdown
> [TIP] 操作提示内容
```

### 脚注

```markdown
[^R-Markdown](https://github.com)[说明文字]
```

### 标准标题

```markdown
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
```

---

## 组件标签速查

| 标签 | 用途 | 变体 |
|------|------|------|
| `<title>` | 文章标题卡片 | DA01/DA02 |
| `<p-title>` | 段落标题 | DA01/DA02，level 1-4 |
| `<reading-path>` | 章节导航 | — |
| `<lead>` | 引导文字 | — |
| `<statement>` | 居中金句 | — |
| `<breaking>` | 重大更新卡片 | — |
| `<cta>` | 行动号召 | — |
| `<engage>` | 底部互动 | DA01/DA02 |
| `<steps>` | 步骤流 | 横向/竖向 |
| `<case-flow>` | 案例流 | — |
| `<timeline>` | 时间线 | — |
| `<compare>` | 前后对比 | 横向/纵向 |
| `<chart>` | 图表 | bar/line/pie/scatter |
| `<slider>` | 图片轮播 | 4 种切换动画 |
| `<img>` | 自定义图片 | — |
| `<table>` | 表格扩展 | 单元格合并、斑马纹、滚动 |
| `<badges>` | 彩色标签 | 4 种预设色调、渐变背景 |
