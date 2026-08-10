export const DEMO_CONTENT = `<title type="DA02" badge="GUIDE" subtitle="这是一份包含所有可用 Markdown 指令及扩展标签的完整演示稿。" chips="图片并排|窗口滚动|渐变文字">功能全集：排版组件指南</title>

<p-title num="01" title="图片增强特性" subtitle="IMAGES · 窗口化与并排" level="1"></p-title>

这是本次更新的核心功能，解决了长图刷屏和多图堆叠的问题。

<p-title num="01" title="指定窗口尺寸（限制高度 250px）" level="2"></p-title>

![限高滚动测试](https://robocopmao.github.io/r-markdown/banner4.webp)[100% 250px]

> 上方的图片被限制在 250px 高度内，读者可以手动滚动查看。

<p-title num="02" title="多图横向滑动并排" level="2"></p-title>

< ![图1](https://robocopmao.github.io/r-markdown/banner1.webp), ![图2](https://robocopmao.github.io/r-markdown/banner2.webp), ![图3](https://robocopmao.github.io/r-markdown/banner3.webp) >

> 使用尖括号和感叹号语法，多张图片横向排开。

<p-title num="03" title="轮播图" level="2"></p-title>

<slider images="https://robocopmao.github.io/r-markdown/banner1.webp,https://robocopmao.github.io/r-markdown/banner2.webp,https://robocopmao.github.io/r-markdown/banner3.webp" interval="3" width="1080" height="463"></slider>

> 轮播组件依赖 \`SVG\` 动画，在所有支持 \`SVG\` 的设备和浏览器上均可正常播放。支持最多5张图片，自动轮播，默认间隔3秒，可使用\`type\`属性设置4种轮播类型。宽高可根据使用的图片尺寸进行调整，默认是600px✖️200px。

<p-title num="04" title="单图扩展组件（Img标签）" level="2"></p-title>

<img src="https://robocopmao.github.io/r-markdown/banner4.webp" width="100%" height="200px" radius="8px" fit="cover" desc="图片描述" />

> 基于HTML的img标签添加的扩展图片组件，可以设置图片宽高、圆角、裁切和偏移。

<p-title num="02" title="行内修饰与文字" subtitle="STYLES · 渐变与强调" level="1"></p-title>

- **渐变背景**：==这是 linear-gradient 渐变背景文字==，适合划重点。
- **胶囊文字**：!!这是圆角胶囊背景文字!!，适合做小标签。
- **加重强调**：^^这是加重强调文字^^，颜色更深。
- **柔光重点**：::这是柔光蓝紫色文字重点::。
- **经典修饰**：**粗体文字**、__下划线文字1__、<u>下划线文字2</u>、~~删除线文字~~、*斜体文字*、***加粗+斜体***。
- **下标**：H<sub>2</sub>O。
- **上标**：m<sup>2</sup>。

<p-title num="03" title="段落标题组件" subtitle="PARAGRAPH TITLE · 分段标题"></p-title>

<p-title num="01" title="自定义段落标题组件" subtitle="PARAGRAPH TITLE · 分段标题" num-color="blue" color="#e74c3c" subtitle-color="green" size="medium"></p-title>

<p-title num="02" title="二级标题示例" level="2" prefix="🔥" suffix="🔥" color="" num-color=""></p-title>

<p-title num="03" title="三级标题示例" level="3" color=""></p-title>

<p-title num="04" title="四级标题示例" level="4" color=""></p-title>

> 直接用1～4个 \`#\` 语法即可生成一到四级标，使用 \`p-title\` 标签语法会有更多的扩展。如果是一级标题，可以使用\`size\`属性\`small\`、\`medium\`来调节展示的大小。

<p-title num="04" title="核心交互组件" subtitle="COMPONENTS · 卡片与布局" level="1"></p-title>

<p-title num="01" title="突发/重大更新卡片 (Breaking)" level="2" color=""></p-title>

<breaking badge="NEW" title="功能全集文档上线" subtitle="支持一键复制，即装即用" chips="高效|美观" color="">
这个组件适合用于文章开头，展示最重要的核心结论或更新摘要。
</breaking>

<p-title num="02" title="提示与建议 (Callout)" level="2"></p-title>

> [TIP] 操作小贴士
> 使用 [TIP] 或 [NOTE] 可以快速生成带背景的提示框。

<p-title num="03" title="横向步骤流 (Horizontal Steps)" level="2"></p-title>

<steps label="HOW IT WORKS" title="安装好之后怎么跑起来" hint="左右滑动查看" active="2" color="">
- 输入 | 往知识库里喂东西
- 管理 | 让知识库有序运转
- 输出 | 从知识库取素材做东西
</steps>

<p-title num="04" title="竖向步骤流 (Vertical Steps)" level="2"></p-title>

<steps label="VERTICAL STEPS" title="竖向步骤流" active="2" direction="vertical">
- 注册账号 | 填写基本信息完成注册
- 实名认证 | 上传证件完成身份验证
- 开始使用 | 选择功能模块开始体验
</steps>

<p-title num="05" title="实践案例流 (Case Flow)" level="2"></p-title>

<case-flow color="">
- [案例 01] 品牌视觉升级：从绿色全面转向现代化的 Indigo 靛青色调。
- [案例 02] 交互体验优化：图片窗口化功能让长文阅读更流畅。
- [案例 03] 编辑器重构：组件化架构让新增样式变得简单高效。
</case-flow>

<p-title num="05" title="布局演示" subtitle="LAYOUT · 对比与引导" level="1"></p-title>

<p-title num="01" title="Before / After 对比（横向）" level="2"></p-title>

<compare left-label="BEFORE" left-title="回味过去" right-label="AFTER" right-title="展望未来">
<left>
![旧版](https://robocopmao.github.io/r-markdown/banner1.webp)[100% 120px]
</left>
<right>
![新版](https://robocopmao.github.io/r-markdown/banner2.webp)[100% 120px]
</right>
</compare>

<p-title num="02" title="Before / After 对比（纵向）" level="2"></p-title>

<compare left-label="BEFORE" left-title="回味过去" right-label="AFTER" right-title="展望未来" direction="vertical">
<left>
一切仿佛就在昨天
![旧版](https://robocopmao.github.io/r-markdown/banner1.webp)[100% 120px]
</left>
<right>
愿明天会更美好
![新版](https://robocopmao.github.io/r-markdown/banner2.webp)[100% 120px]
</right>
</compare>

<p-title num="03" title="行动点召唤 (CTA)" level="2"></p-title>

<cta label="GET STARTED" title="准备好开始你的创作了吗？" button="立即复制下方代码"></cta>

<p-title num="04" title="时间线演示（Timeline）" level="2"></p-title>

<timeline>
- 2024年01月 | 项目启动 | 完成团队组建和需求分析 | ![新版](https://robocopmao.github.io/r-markdown/banner2.webp)[100% 120px]
- 2024年06月 | 一期上线 | 核心功能发布，用户突破1万
- 2025年01月 | 二期迭代 | 新增AI辅助功能，用户突破10万
</timeline>

<p-title num="06" title="公式渲染 (MathJax)" subtitle="MATH · LaTeX" level="1"></p-title>

行内公式用法：质能方程 $E = mc^2$ 是物理学最基本的等式之一，勾股定理 $a^2 + b^2 = c^2$ 也很常用。

单行块级公式：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

欧拉恒等式：

$$
e^{i\\pi} + 1 = 0
$$

三角函数恒等式：

$$
\\sin^2\\theta + \\cos^2\\theta = 1
$$

多行对齐公式：

$$
\\begin{aligned}
f(x) &= \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}} \\\\
F(x) &= \\int_{-\\infty}^{x} f(t) dt
\\end{aligned}
$$

<p-title num="07" title="其他组件用法" subtitle="MISC · 标签与代码" level="1"></p-title>

<p-title num="01" title="彩色标签徽章 (Badges)" level="2"></p-title>

<badges tone="accent">Vue|TypeScript|Vite|Tailwind</badges>

<badges tone="green">React|Next.js|Tailwind|Prisma</badges>

<badges tone="yellow">Python|Django|PostgreSQL|Redis</badges>

<badges tone="dark">Docker|Kubernetes|AWS|Terraform</badges>

<badges color="#fff" bg="#e74c3c">自定义红底白字</badges>

> 使用 \`tone\` 属性切换风格：\`accent\`（主题色）、\`green\`（绿色）、\`yellow\`（黄色）、\`dark\`（深色）或通过\`color\`和\`bg\`属性自定义。

<p-title num="02" title="代码块 (Code Block)" level="2"></p-title>

\`\`\`javascript
// 一个简单的 Vue 组件示例
import { ref } from 'vue'

const count = ref(0)

function increment() {
  count.value++
  console.log('Count:', count.value)
}
\`\`\`

> 代码块会保留原始格式，包括换行和缩进，适合展示代码片段。

<p-title num="03" title="居中强调语 (Statement)" level="2"></p-title>

<statement>这是一段居中的强调文字，适合用来突出核心观点或结论。</statement>

> Statement 组件会将文字居中显示，字号较大且加粗，非常适合用作文章中的金句或核心观点。

<p-title num="04" title="引导文字段 (Lead)" level="2"></p-title>

<lead>
Lead 组件会生成一段带有左侧边框的引导文字，适合用来引入话题或提供背景信息。它的视觉效果比普通段落更突出，但又不会像 Statement 那样过于正式。
</lead>

> Lead 组件的左侧边框颜色会跟随主题色变化，非常适合用作文章的引言或过渡段落。

<p-title num="05" title="任务列表" level="2"></p-title>

- [x] 已完成任务
- [ ] 未完成任务

<p-title num="06" title="脚注" level="2"></p-title>

现在，[R-Markdown](https://robocopmao.github.io/r-markdown "R-Markdown是一款开源免费公众号扩展排版编辑器") 已在GitHub开源。

<p-title num="08" title="写在最后" subtitle="CONCLUSION · 结尾互动" level="1"></p-title>

所有组件都支持公众号无损复制，您可以根据需要自由组合。

<engage type="DA02" title="感谢你的阅读与支持！" subtitle="喜欢就互动一下吧～ ♥️" color="red|green|yellow"></engage>
`
