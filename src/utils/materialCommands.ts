/**
 * AI 素材输入框的「/ 组件名」快捷插入。
 *
 * 需求原话（用户 2026-11-18）：「我想在输入框出做一个快捷组件名的插入， 比如我输入/的时候就显示
 * container、text等， 选中后添加到输入框，类似DSH的 / 功能」。
 *
 * 为什么需要：素材需求是自然语言，但组件标签名是英文（`p-title`、`case-flow`、`positioned`），
 * 用户记不住也懒得敲。敲 `/` 就能挑，挑完插进去的是 `<tag>` 原文——与模型输出、SKILL.md
 * 里写法完全一致，模型读需求时不会歧义（写「容器」它还得猜是 `<container>` 还是 `<stack>`）。
 *
 * 纯逻辑放这里，输入框那边只管 DOM 与键盘，便于单测。
 */

export interface MaterialCommand {
  /** 组件标签名，不带尖括号 */
  tag: string
  /** 中文名，与组件注册表里的 `name` 对齐 */
  name: string
  /** 一句话说明，右侧灰字 */
  hint: string
}

/**
 * 菜单顺序：先布局组件（自由拼版那套），再成品卡片，最后是图类与表格。
 *
 * 没有 `<reading-path>`：它不吃内容、只按文内 H2 自动生成章节导航，用户说不清楚
 * 「我要一条阅读路线」，往输入框里插一个空壳反而误导模型去凑标题。
 * 没有 `<left>` / `<right>`：它们是 `<compare>` 的内部子块，脱离 compare 就是两个
 * 裸标签、什么也渲染不出来，插进需求里只会让模型以为要单独做一栏。
 *
 * 不直接从 `@/extension` 的 components 生成：那份注册表同一 tag 有多个变体
 * （`Title_DA01` / `Title_DA02` 都是 `title`），直接展开会有重复项；
 * 而且注册表里没有中文说明，菜单里只有英文名，用户挑不出来。
 * 所以这里手写一份带中文的清单，新组件加进来时要同步补一行（DEVELOPMENT.md 有记录）。
 */
export const MATERIAL_COMMANDS: MaterialCommand[] = [
  // 布局：像写 HTML 一样自己搭
  { tag: 'container', name: '容器', hint: '万能布局容器' },
  { tag: 'row', name: '横向布局', hint: '左右分栏' },
  { tag: 'column', name: '纵向布局', hint: 'row 的子栏' },
  { tag: 'text', name: '文本', hint: '字号/颜色/粗细' },
  { tag: 'stack', name: '堆叠容器', hint: '叠图、定比例' },
  { tag: 'positioned', name: '绝对定位', hint: '叠在 stack 上' },
  { tag: 'html', name: '原生 HTML', hint: '微信支持的标签' },
  // 成品卡片
  { tag: 'title', name: '标题卡片', hint: '文章开头大标题' },
  { tag: 'p-title', name: '段落标题', hint: '小节标题 + 编号' },
  { tag: 'lead', name: '引导文字', hint: '导语、摘要' },
  { tag: 'statement', name: '居中强调', hint: '一句话强调' },
  { tag: 'breaking', name: '突发卡片', hint: '快讯、公告' },
  { tag: 'steps', name: '步骤流', hint: '分步操作' },
  { tag: 'case-flow', name: '实践案例', hint: '带标签的案例流' },
  { tag: 'timeline', name: '时间线', hint: '按时间罗列' },
  { tag: 'compare', name: '对比', hint: '左右两栏' },
  { tag: 'cta', name: '行动号召', hint: '带按钮的卡片' },
  { tag: 'engage', name: '底部引导', hint: '文末谢谢读者' },
  { tag: 'badges', name: '标签组', hint: '关键词小标签' },
  // 媒体与数据
  { tag: 'img', name: '图片', hint: '带宽高圆角' },
  { tag: 'slider', name: '轮播图', hint: '多张横滑' },
  { tag: 'chart', name: '图表', hint: '柱状/折线/饼图' },
  { tag: 'mermaid', name: 'Mermaid 图表', hint: '流程图、时序图' },
  { tag: 'svg', name: '交互 SVG', hint: '点击揭晓、逐条浮现' },
  { tag: 'table', name: '表格', hint: '数据行写法' },
]

/**
 * 找光标前的 `/ 查询词`。
 *
 * 判据故意宽一点：`/` 前面可以是行首、空格，或**任何非 ASCII 字符**——
 * 中文用户不打空格，「用/container 包起来」是常见写法，只认 `\s` 会漏。
 * 但 `/` 后面必须是纯 ASCII 字母/连字符（组件标签的字符集），
 * 所以「换成蓝色 / 标题再短一点」「换成蓝色/标题再短一点」这类正常句子里
 * 斜杠后面跟中文，不会被当成快捷输入误触发。
 */
export function findSlashQuery(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  const head = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const m = /(?:^|\s|[^\x00-\x7F])\/([a-zA-Z-]*)$/.exec(head)
  if (!m) return null
  const query = m[1]
  return { query, start: head.length - query.length - 1 }
}

/**
 * 按查询词过滤。排序：标签前缀命中 → 标签包含 → 中文名命中。
 *
 * 只按中文名匹配、不按 hint 匹配：hint 是给已经看到条目的人做补充说明的，
 * 拿它参与匹配纯属噪音——比如查 `st` 会因为 `<positioned>` 的说明里写着
 * 「叠在 stack 上」而混进来一个不相干的条目。排序稳定，同分保留清单里的原顺序。
 */
export function filterMaterialCommands(query: string): MaterialCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return MATERIAL_COMMANDS
  const prefix: MaterialCommand[] = []
  const contains: MaterialCommand[] = []
  const named: MaterialCommand[] = []
  for (const cmd of MATERIAL_COMMANDS) {
    const tag = cmd.tag.toLowerCase()
    if (tag.startsWith(q)) prefix.push(cmd)
    else if (tag.includes(q)) contains.push(cmd)
    else if (cmd.name.includes(q)) named.push(cmd)
  }
  return [...prefix, ...contains, ...named]
}

/**
 * 把选中的组件写回输入框：替换掉 `/query` 那段，插入 `<tag>`。
 *
 * **不在后面补空格**——补了以后 `用<container> 包起来` 这种句子会多一个空格；
 * 而用户在标签后立刻接着打中文时，多出来的空格在需求里毫无意义。
 * 需要空格的场景（标签后跟英文单词）很少，自己打一个更省事。
 */
export function applyMaterialCommand(
  text: string,
  caret: number,
  start: number,
  tag: string,
): { text: string; caret: number } {
  const replacement = `<${tag}>`
  const rest = text.slice(caret)
  return {
    text: text.slice(0, start) + replacement + rest,
    caret: start + replacement.length,
  }
}
