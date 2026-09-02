export type KnowledgeCategory = '企业 AI' | '知识工程' | '可信系统' | '交付与生态'

export interface KnowledgeEntry {
  id: string
  category: KnowledgeCategory
  title: string
  summary: string
  takeaways: string[]
  stage: '方法卡' | '实践笔记' | '检查清单'
  updated: string
}

export const knowledgeCategories: Array<'全部' | KnowledgeCategory> = [
  '全部',
  '企业 AI',
  '知识工程',
  '可信系统',
  '交付与生态'
]

export const knowledgeEntries: KnowledgeEntry[] = [
  {
    id: 'k01',
    category: '企业 AI',
    title: '企业 AI 场景优先级判断',
    summary: '用业务价值、发生频率、数据条件、验证周期和风险边界判断一个场景是否值得进入验证。',
    takeaways: ['先确认业务责任人', '优先选择短反馈闭环', '先验证价值再扩大投入'],
    stage: '方法卡',
    updated: '2026-09'
  },
  {
    id: 'k02',
    category: '企业 AI',
    title: '多模型接入与路由治理',
    summary: '在统一接入层管理模型能力、质量、延迟、成本和合规要求，避免业务直接绑定单一模型。',
    takeaways: ['按任务选择模型', '记录调用与成本', '保留人工升级路径'],
    stage: '实践笔记',
    updated: '2026-09'
  },
  {
    id: 'k03',
    category: '企业 AI',
    title: 'Agent 工作流上线检查',
    summary: '把工具权限、状态管理、人工确认、异常恢复和结果审计纳入 Agent 上线前检查。',
    takeaways: ['最小工具权限', '关键节点人工确认', '失败可以恢复与追踪'],
    stage: '检查清单',
    updated: '2026-09'
  },
  {
    id: 'k04',
    category: '知识工程',
    title: 'RAG 项目的知识治理起点',
    summary: '检索效果从知识源头开始：明确文档责任、版本、权限、有效期和更新机制。',
    takeaways: ['定义可信知识源', '保留版本和责任人', '过期内容及时退出'],
    stage: '方法卡',
    updated: '2026-09'
  },
  {
    id: 'k05',
    category: '知识工程',
    title: '检索与答案评估集',
    summary: '用真实问题构建分层评估集，分别检查召回、引用、事实一致性和不可回答边界。',
    takeaways: ['覆盖高频与高风险问题', '检索和生成分开评估', '持续吸收线上失败样本'],
    stage: '实践笔记',
    updated: '2026-09'
  },
  {
    id: 'k06',
    category: '知识工程',
    title: '知识库运营闭环',
    summary: '将未命中、低满意回答和业务变化转化为知识更新任务，让系统随着使用持续改善。',
    takeaways: ['记录未命中问题', '建立内容负责人机制', '用反馈驱动迭代'],
    stage: '检查清单',
    updated: '2026-09'
  },
  {
    id: 'k07',
    category: '可信系统',
    title: '专业流程的规则显式化',
    summary: '把依赖个人经验的判断拆成规则、材料、角色、例外和升级机制，再进入系统设计。',
    takeaways: ['区分规则与经验', '明确例外处理', '关键决定可解释'],
    stage: '方法卡',
    updated: '2026-09'
  },
  {
    id: 'k08',
    category: '可信系统',
    title: '证据链与可追溯设计',
    summary: '围绕身份、时间、材料版本、操作过程和结果建立完整记录，支持复核与审计。',
    takeaways: ['记录关键主体和时间', '材料版本不可混淆', '全过程支持复核'],
    stage: '实践笔记',
    updated: '2026-09'
  },
  {
    id: 'k09',
    category: '可信系统',
    title: '高风险 AI 功能上线边界',
    summary: '对于影响权利、合规或专业判断的功能，明确 AI 建议与最终责任之间的边界。',
    takeaways: ['AI 输出标明依据', '高风险操作必须确认', '保留纠错和申诉通道'],
    stage: '检查清单',
    updated: '2026-09'
  },
  {
    id: 'k10',
    category: '交付与生态',
    title: 'FDE 团队能力模型',
    summary: 'FDE 需要同时理解客户业务、方案设计、工程实现与现场协同，培养应围绕真实交付展开。',
    takeaways: ['以真实问题训练', '方案与工程共同负责', '每次交付沉淀资产'],
    stage: '方法卡',
    updated: '2026-09'
  },
  {
    id: 'k11',
    category: '交付与生态',
    title: '从一次项目到可复制方案',
    summary: '把交付中的共性需求拆为行业模板、组件、数据接口和实施清单，降低下一次落地成本。',
    takeaways: ['区分共性与定制', '复盘形成标准件', '用结果验证可复制性'],
    stage: '实践笔记',
    updated: '2026-09'
  },
  {
    id: 'k12',
    category: '交付与生态',
    title: '生态合作项目化检查',
    summary: '生态合作应从资源名单走向明确场景、能力分工、客户价值、交付责任和复盘机制。',
    takeaways: ['围绕具体需求组队', '提前确认责任边界', '合作结果可以跟踪'],
    stage: '检查清单',
    updated: '2026-09'
  }
]
