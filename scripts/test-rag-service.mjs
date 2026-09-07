import { RagService } from './rag-service.mjs'
import { assertSafeOutboundUrl } from './network-security.mjs'

const service = new RagService({ distRoot: 'Z:/missing-rag-test-dist' })
const entries = [{
  id: 'rag-guide',
  title: '企业 AI 知识库与 RAG 实践',
  category: 'AI 工程',
  summary: '从知识治理开始建设检索增强生成系统。',
  body: '知识治理包括资料清洗、权限边界、分段索引、召回评估和持续反馈。Knowledge governance is the foundation of reliable RAG.',
  takeaways: ['先治理资料，再接入模型。'],
  published: true
}]

const chinese = service.retrieve('知识治理怎么做', entries, 5)
if (chinese[0]?.id !== 'rag-guide' || chinese[0]?.chunk !== 1) throw new Error('MiniSearch 中文分段检索失败。')

const fuzzy = service.retrieve('knowlege governence', entries, 5)
if (fuzzy[0]?.id !== 'rag-guide') throw new Error('MiniSearch 英文模糊检索失败。')

let blocked = false
try {
  await assertSafeOutboundUrl('http://127.0.0.1:11434/v1/chat/completions')
} catch {
  blocked = true
}
if (!blocked) throw new Error('默认应阻止回环 AI 接口。')
const allowed = await assertSafeOutboundUrl('http://127.0.0.1:11434/v1/chat/completions', { allowPrivateNetwork: true })
if (allowed.hostname !== '127.0.0.1') throw new Error('显式允许内网接口后仍无法使用。')

console.log('MiniSearch Chinese tokenization and chunk retrieval: verified')
console.log('MiniSearch fuzzy English retrieval: verified')
console.log('AI endpoint private-network guard: verified')
