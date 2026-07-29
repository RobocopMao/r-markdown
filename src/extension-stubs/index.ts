/**
 * Extension stubs — 闭源 extension 子模块不可用时的 fallback
 * 导出与 extension/index.ts 完全一致的接口，避免编译报错
 */

export interface ComponentDef {
  id: string
  name: string
  tag: string
  description?: string
  example?: string
  attrs?: Array<{
    key: string
    label: string
    required?: boolean
    default?: string
    options?: string[]
    description?: string
  }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (attrs: any, body: any, t: any, ...rest: any[]) => string
}

import { Badges_DA01 } from './Badges_DA01'
import { Breaking_DA01 } from './Breaking_DA01'
import { CaseFlow_DA01 } from './CaseFlow_DA01'
import { Chart_DA01 } from './Chart_DA01'
import { Compare_DA01 } from './Compare_DA01'
import { Compare_DA02 } from './Compare_DA02'
import { Cta_DA01 } from './Cta_DA01'
import { Engage_DA01 } from './Engage_DA01'
import { Engage_DA02 } from './Engage_DA02'
import { Img_DA01 } from './Img_DA01'
import { Lead_DA01 } from './Lead_DA01'
import { Mermaid_DA01 } from './Mermaid_DA01'
import { PTitle_DA01 } from './PTitle_DA01'
import { PTitle_DA02 } from './PTitle_DA02'
import { ReadingPath_DA01 } from './ReadingPath_DA01'
import { Slider_DA01 } from './Slider_DA01'
import { Statement_DA01 } from './Statement_DA01'
import { Steps_DA01 } from './Steps_DA01'
import { Steps_DA02 } from './Steps_DA02'
import { Timeline_DA01 } from './Timeline_DA01'
import { Table_DA01 } from './Table_DA01'
import { Column_DA01 } from './Column_DA01'
import { Container_DA01 } from './Container_DA01'
import { Row_DA01 } from './Row_DA01'
import { Text_DA01 } from './Text_DA01'
import { Title_DA01 } from './Title_DA01'
import { Title_DA02 } from './Title_DA02'
import { Html_DA01 } from './Html_DA01'
import { Stack_DA01 } from './Stack_DA01'
import { Positioned_DA01 } from './Positioned_DA01'

// 名称别名（与 extension/index.ts 导入名一致）
export const CTA_DA01 = Cta_DA01
export const PTitle = PTitle_DA01

export const components: ComponentDef[] = [
  { id: 'Title_DA01', name: '标题卡片', tag: 'title', render: Title_DA01.render },
  { id: 'Title_DA02', name: '标题卡片', tag: 'title', render: Title_DA02.render },
  {
    id: 'ReadingPath_DA01',
    name: '阅读路线',
    tag: 'reading-path',
    render: ReadingPath_DA01.render,
  },
  { id: 'Column_DA01', name: '纵向布局', tag: 'column', render: Column_DA01.render },
  { id: 'Container_DA01', name: '容器', tag: 'container', render: Container_DA01.render },
  { id: 'Row_DA01', name: '横向布局', tag: 'row', render: Row_DA01.render },
  { id: 'Text_DA01', name: '文本样式', tag: 'text', render: Text_DA01.render },
  { id: 'PTitle_DA01', name: '段落标题', tag: 'p-title', render: PTitle_DA01.render },
  { id: 'PTitle_DA02', name: '段落标题', tag: 'p-title', render: PTitle_DA02.render },
  { id: 'Html_DA01', name: 'HTML', tag: 'html', render: Html_DA01.render },
  { id: 'Breaking_DA01', name: '突发卡片', tag: 'breaking', render: Breaking_DA01.render },
  { id: 'Steps_DA01', name: '步骤流', tag: 'steps', render: Steps_DA01.render },
  { id: 'Steps_DA02', name: '步骤流', tag: 'steps', render: Steps_DA02.render },
  { id: 'CaseFlow_DA01', name: '实践案例流', tag: 'case-flow', render: CaseFlow_DA01.render },
  { id: 'Compare_DA01', name: '对比', tag: 'compare', render: Compare_DA01.render },
  { id: 'Compare_DA02', name: '对比', tag: 'compare', render: Compare_DA02.render },
  { id: 'CTA_DA01', name: '行动号召', tag: 'cta', render: Cta_DA01.render },
  { id: 'Badges_DA01', name: '彩色标签徽章', tag: 'badges', render: Badges_DA01.render },
  { id: 'Statement_DA01', name: '居中强调语', tag: 'statement', render: Statement_DA01.render },
  { id: 'Lead_DA01', name: '引导文字', tag: 'lead', render: Lead_DA01.render },
  { id: 'Engage_DA01', name: '底部引导卡片', tag: 'engage', render: Engage_DA01.render },
  { id: 'Engage_DA02', name: '底部引导卡片', tag: 'engage', render: Engage_DA02.render },
  { id: 'Timeline_DA01', name: '时间线', tag: 'timeline', render: Timeline_DA01.render },
  { id: 'Slider_DA01', name: '轮播图', tag: 'slider', render: Slider_DA01.render },
  { id: 'Img_DA01', name: '图片', tag: 'img', render: Img_DA01.render },
  { id: 'Chart_DA01', name: '图表', tag: 'chart', render: Chart_DA01.render },
  { id: 'Mermaid_DA01', name: 'Mermaid 图表', tag: 'mermaid', render: Mermaid_DA01.render },
  { id: 'Table_DA01', name: '表格扩展', tag: 'table', render: Table_DA01.render },
]

export const componentMap = Object.fromEntries(components.map((c) => [c.id, c]))

export const tagMap = Object.fromEntries(components.map((c) => [c.tag, c]))

export {
  Title_DA01,
  Title_DA02,
  ReadingPath_DA01,
  Column_DA01,
  Container_DA01,
  Row_DA01,
  Text_DA01,
  Breaking_DA01,
}
export { Steps_DA01, Steps_DA02, CaseFlow_DA01, Compare_DA01, Compare_DA02 }
export { Badges_DA01, Statement_DA01, Lead_DA01, Engage_DA01, Engage_DA02 }
export { Timeline_DA01, Slider_DA01, Img_DA01, Chart_DA01, Mermaid_DA01, Table_DA01, Html_DA01 }
