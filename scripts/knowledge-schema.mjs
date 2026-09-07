const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象。`)
  return value
}
const text = (value, label, max = 10000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空。`)
  if (value.trim().length > max) throw new Error(`${label} 不能超过 ${max} 个字符。`)
  return value.trim()
}
const list = (value, label, max = 20) => {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} 必须是最多 ${max} 项的数组。`)
  return value
}

export const validateKnowledgeEntries = payload => {
  if (!Array.isArray(payload) || payload.length > 500) throw new Error('知识条目必须是最多 500 项的数组。')
  const ids = new Set()
  return payload.map((value, index) => {
    const item = object(value, `知识条目 ${index + 1}`)
    const id = text(item.id, `知识条目 ${index + 1}编号`, 40)
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new Error(`知识条目编号 ${id} 无效或重复。`)
    ids.add(id)
    return {
      id,
      category: text(item.category, `${id} 分类`, 80),
      title: text(item.title, `${id} 标题`, 200),
      summary: text(item.summary, `${id} 摘要`, 1000),
      body: text(item.body, `${id} 正文`, 50000),
      takeaways: list(item.takeaways, `${id} 要点`, 20).map((entry, entryIndex) => text(entry, `${id} 要点 ${entryIndex + 1}`, 300)),
      stage: text(item.stage, `${id} 类型`, 40),
      updated: text(item.updated, `${id} 更新时间`, 40),
      published: item.published !== false
    }
  })
}

export const validateAiSettings = payload => {
  const item = object(payload, 'AI 配置')
  const apiUrl = text(item.apiUrl, 'AI 接口地址', 500)
  let parsed
  try { parsed = new URL(apiUrl) } catch { throw new Error('AI 接口地址格式无效。') }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('AI 接口地址必须使用 http:// 或 https://。')
  const topK = Number(item.topK)
  const temperature = Number(item.temperature)
  const maxTokens = Number(item.maxTokens)
  const dailyLimit = Number(item.dailyLimit)
  if (!Number.isInteger(topK) || topK < 1 || topK > 10) throw new Error('RAG 召回数量必须为 1-10。')
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error('模型温度必须为 0-2。')
  if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 8192) throw new Error('最大输出 Token 必须为 128-8192。')
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000) throw new Error('每日问答限额必须为 1-100000。')
  return {
    enabled: item.enabled === true,
    provider: text(item.provider, '服务商名称', 80),
    apiUrl,
    model: text(item.model, '模型名称', 120),
    apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim().slice(0, 1000) : '',
    clearApiKey: item.clearApiKey === true,
    topK,
    temperature,
    maxTokens,
    dailyLimit,
    allowPrivateNetwork: item.allowPrivateNetwork === true,
    systemPrompt: text(item.systemPrompt, '系统提示词', 4000)
  }
}

export const defaultAiSettings = {
  enabled: false,
  provider: 'OpenAI Compatible',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4.1-mini',
  apiKey: '',
  clearApiKey: false,
  topK: 5,
  temperature: 0.2,
  maxTokens: 1200,
  dailyLimit: 200,
  allowPrivateNetwork: false,
  systemPrompt: '你是白云飞个人知识库的 AI 助手。只依据提供的本地知识上下文回答；资料不足时明确说明，不得编造。回答使用中文，并在结尾列出引用资料标题。'
}
