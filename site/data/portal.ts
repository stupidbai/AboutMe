export interface InsightItem {
  code: string
  title: string
  description: string
  topics: string[]
  anchor: string
}

export const insights: InsightItem[] = [
  { code: '01', title: '企业 AI 落地', description: '从业务场景、数据与流程出发，判断哪些问题值得由 AI 解决。', topics: ['场景识别', '价值验证', '产品化'], anchor: 'enterprise-ai' },
  { code: '02', title: '知识库与 RAG', description: '从文档治理、检索召回到答案验证，构建可持续运营的知识系统。', topics: ['知识工程', '检索评估', '运营闭环'], anchor: 'rag' },
  { code: '03', title: '多模型与 Agent', description: '统一模型接入、路由、成本与工作流，让能力可以治理和复用。', topics: ['模型路由', 'Agent 编排', '成本治理'], anchor: 'agent' },
  { code: '04', title: '可信数字化', description: '把业务规则、证据链与审计要求写进系统架构和产品流程。', topics: ['可信存证', '流程数字化', '可追溯'], anchor: 'trusted' },
  { code: '05', title: 'FDE 与交付体系', description: '培养贴近客户现场的复合团队，缩短方案和工程落地之间的距离。', topics: ['现场工程', '团队培养', '交付治理'], anchor: 'fde' },
  { code: '06', title: 'AI 生态建设', description: '组织厂商、高校、开发者和行业需求，形成联合验证与复制交付。', topics: ['伙伴网络', '区域生态', '联合方案'], anchor: 'ecosystem' }
]
