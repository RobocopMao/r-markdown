/**
 * R-Markdown 组件标签名的唯一清单。
 *
 * 解析器主循环、各组件收 body 的循环、格式化器都按这份清单判断「这一行是不是组件标签」。
 * 三处各自硬编码过一次，已经漂移过一次（格式化器认为可以顶格的标签，解析器不认），
 * 所以集中到这里；新增组件时只改这个文件。
 */

/**
 * 参与「行首锚定」判断的组件标签名（含 `<left>` / `<text>` 这类子标签）。
 *
 * 必须与解析器里那些列 0 锚定正则（`/^<steps\b/`、`/^<\/steps>/`）一一对应，漏一个就等于没修。
 * 外层拼接正则时统一加 `\b` 收尾，所以 `slide` / `slider` 这类同前缀名字不会互相误匹配。
 */
export const COMPONENT_TAGS = [
  'container',
  'row',
  'column',
  'text',
  'html',
  'stack',
  'positioned',
  'steps',
  'statement',
  'badges',
  'lead',
  'breaking',
  'cta',
  'compare',
  'left',
  'right',
  'reading-path',
  'title',
  'p-title',
  'case-flow',
  'timeline',
  'slider',
  'slide',
  'item',
  'engage',
  'mermaid',
  'table',
  'chart',
  'svg',
]

/**
 * 块级组件：格式化时前后各留一个空行。
 *
 * 只含「自成一块」的组件。子标签（`<left>` / `<right>` / `<text>` / `<slide>` /
 * `<item>`）与三个原样透传块（`<html>` / `<svg>` / `<mermaid>`）不在其中：
 * 前者塞空行会把 `compare` 的两栏撑开，后者内部是代码、外层是否空行无所谓。
 */
export const BLOCK_COMPONENT_TAGS = [
  'container',
  'row',
  'column',
  'stack',
  'positioned',
  'steps',
  'statement',
  'badges',
  'lead',
  'breaking',
  'cta',
  'compare',
  'reading-path',
  'title',
  'p-title',
  'case-flow',
  'timeline',
  'slider',
  'engage',
  'table',
  'chart',
]

/** 原样透传块：开闭标签之间的内容不做任何改动（内部是代码或用户手写 HTML） */
export const VERBATIM_TAGS = ['html', 'mermaid', 'svg']
