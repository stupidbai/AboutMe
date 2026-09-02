export interface Metric {
  value: string
  label: string
}

export interface PortalRoute {
  code: string
  title: string
  description: string
  link: string
  tags: string[]
  accent: string
}

export interface TimelineItem {
  period: string
  organization: string
  role: string
  description: string
  current?: boolean
}

export interface InsightItem {
  code: string
  title: string
  description: string
  topics: string[]
  anchor: string
}

export const metrics: Metric[] = [
  { value: '数十人', label: '研发团队管理经验' },
  { value: '60%', label: '云产线模块交付周期缩短' },
  { value: '50%+', label: '知识库支持效率提升' },
  { value: '100W+', label: 'AI 社群矩阵覆盖用户' }
]

export const portalRoutes: PortalRoute[] = [
  {
    code: '01 · PROFILE',
    title: '职业履历与能力底座',
    description: '从华为研发与交付，到企业 AI 商业验证、京东云技术管理和莲证科技 CIO。',
    link: '/profile',
    tags: ['时间线', '技术能力', '组织背书'],
    accent: 'cyan'
  },
  {
    code: '02 · COOPERATION',
    title: '合作方向与工作方式',
    description: '面向可信数字化、企业 AI、厂商生态、FDE 团队与解决方案交付。',
    link: '/cooperation',
    tags: ['场景诊断', '方案共创', '联合交付'],
    accent: 'blue'
  },
  {
    code: '03 · CASES',
    title: '项目案例与结果证明',
    description: '九类真实场景，覆盖知识工程、研发效能、工业视觉、内容平台、人才与生态。',
    link: '/cases',
    tags: ['9 类场景', '产品交付', '生态协同'],
    accent: 'violet'
  },
  {
    code: '04 · INSIGHTS',
    title: '主题地图与实践方法',
    description: '把企业 AI 落地、可信系统、工程交付和生态建设组织成可进入的知识地图。',
    link: '/insights',
    tags: ['企业 AI', '可信系统', 'FDE'],
    accent: 'orange'
  },
  {
    code: '05 · LIFE',
    title: '工作之外的个人侧面',
    description: '户外、骑行、摄影、口琴，以及持续表达与内容创作。',
    link: '/life',
    tags: ['户外影像', '公众号', '视频号'],
    accent: 'green'
  },
  {
    code: '06 · CONTACT',
    title: '联系方式与合作入口',
    description: '从一个具体问题开始，说明场景、资源、目标和希望共同承担的角色。',
    link: '/contact',
    tags: ['微信', '电话', '邮箱'],
    accent: 'cyan'
  }
]

export const focusAreas = [
  {
    code: 'TRUSTED DIGITAL',
    title: '公证与可信数字化',
    description: '把专业规则、业务流程和可信机制转化为可运行、可追溯、可持续演进的系统。'
  },
  {
    code: 'ENTERPRISE AI',
    title: '企业 AI 系统与产品',
    description: '围绕知识库、Agent、多模型治理和行业 Copilot 建设企业 AI 能力底座。'
  },
  {
    code: 'DELIVERY',
    title: '研发与解决方案交付',
    description: '贯通需求、架构、研发、质量、上线和运营，用工程机制提升交付确定性。'
  },
  {
    code: 'ECOSYSTEM',
    title: '伙伴网络与区域生态',
    description: '连接模型、云、算力、高校、开发者和行业客户，形成可复制的联合方案。'
  }
]

export const timeline: TimelineItem[] = [
  {
    period: '2017 — 2022',
    organization: '华为技术有限公司',
    role: '云服务工程师 → 项目经理 → 开发组 Leader',
    description: '企业云服务研发、国际客户交付、DevOps 效能优化与数十人研发团队管理。'
  },
  {
    period: '2022 — 2023',
    organization: 'AI 应用开发与生态运营',
    role: '独立开发者 / AI 生态运营',
    description: '开发 AI 应用并完成商业验证，运营「白哥非白」及 AI 社群联盟。'
  },
  {
    period: '2023 — 2025',
    organization: '江苏追光智能科技有限公司',
    role: '技术总监 / 全栈工程师',
    description: '交付企业知识库、工业视觉、企业协作平台及云服务运维体系。'
  },
  {
    period: '2025 — 2026.06',
    organization: '京东云（徐州）AI 创新中心',
    role: '技术总监',
    description: '负责 AI 技术路线、ToB 解决方案、多模型平台与产业生态协同。'
  },
  {
    period: '2026.07 — 至今',
    organization: '上海莲证科技有限公司',
    role: 'CIO',
    description: '负责公证系统开发、AI 生态系统建设、FDE 团队培育与解决方案落地。',
    current: true
  }
]

export const insights: InsightItem[] = [
  {
    code: '01',
    title: '企业 AI 落地',
    description: '从业务场景、数据与流程出发，判断哪些问题值得由 AI 解决。',
    topics: ['场景识别', '价值验证', '产品化'],
    anchor: 'enterprise-ai'
  },
  {
    code: '02',
    title: '知识库与 RAG',
    description: '从文档治理、检索召回到答案验证，构建可持续运营的知识系统。',
    topics: ['知识工程', '检索评估', '运营闭环'],
    anchor: 'rag'
  },
  {
    code: '03',
    title: '多模型与 Agent',
    description: '统一模型接入、路由、成本与工作流，让能力可以治理和复用。',
    topics: ['模型路由', 'Agent 编排', '成本治理'],
    anchor: 'agent'
  },
  {
    code: '04',
    title: '可信数字化',
    description: '把业务规则、证据链与审计要求写进系统架构和产品流程。',
    topics: ['可信存证', '流程数字化', '可追溯'],
    anchor: 'trusted'
  },
  {
    code: '05',
    title: 'FDE 与交付体系',
    description: '培养贴近客户现场的复合团队，缩短方案和工程落地之间的距离。',
    topics: ['现场工程', '团队培养', '交付治理'],
    anchor: 'fde'
  },
  {
    code: '06',
    title: 'AI 生态建设',
    description: '组织厂商、高校、开发者和行业需求，形成联合验证与复制交付。',
    topics: ['伙伴网络', '区域生态', '联合方案'],
    anchor: 'ecosystem'
  }
]
