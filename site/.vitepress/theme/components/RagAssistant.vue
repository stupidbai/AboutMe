<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { portalHref } from '../useSiteConfig'

interface RagSource { id: string; title: string; category: string; route: string; excerpt: string; score: number }
interface RagResult { mode: 'search' | 'ai'; answer: string; sources: RagSource[]; queryId: string; model?: string; provider?: string }

const question = ref('')
const result = ref<RagResult | null>(null)
const busy = ref(false)
const error = ref('')
const available = ref(true)
const aiEnabled = ref(false)
const provider = ref('')
const feedback = ref(0)
const examples = ['RAG 项目应该先做什么？', 'FDE 团队如何培养？', '高风险 AI 功能有哪些上线边界？']

onMounted(async () => {
  try {
    const response = await fetch('/api/ai/status', { headers: { accept: 'application/json' } })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { available.value = false; return }
    const status = await response.json()
    aiEnabled.value = status.enabled
    provider.value = [status.provider, status.model].filter(Boolean).join(' · ')
  } catch { available.value = false }
})

const ask = async () => {
  const value = question.value.trim()
  if (value.length < 2) { error.value = '请输入至少 2 个字符的问题。'; return }
  busy.value = true
  error.value = ''
  result.value = null
  feedback.value = 0
  try {
    const response = await fetch('/api/rag/query', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ question: value })
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`)
    result.value = payload
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '问答请求失败。' }
  finally { busy.value = false }
}

const useExample = (value: string) => { question.value = value; ask() }
const sendFeedback = async (value: 1 | -1) => {
  if (!result.value?.queryId || feedback.value) return
  try {
    const response = await fetch('/api/rag/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queryId: result.value.queryId, feedback: value }) })
    if (response.ok) feedback.value = value
  } catch {}
}
</script>

<template>
  <section class="rag-assistant">
    <header><div><span class="portal-kicker">LOCAL RAG · AI Q&A</span><h2>向知识库提问</h2><p>先检索本地资料，再由已配置的 AI 模型组织回答；引用来源会随答案一起展示。</p></div><span class="rag-status" :class="{ active: aiEnabled }">{{ aiEnabled ? `AI 已启用${provider ? ` · ${provider}` : ''}` : '本地检索模式' }}</span></header>
    <div v-if="!available" class="rag-notice">当前为纯静态预览。请通过 Node 或 Docker 管理服务启动，才能使用知识库问答。</div>
    <template v-else>
      <form class="rag-form" @submit.prevent="ask"><label><span>你的问题</span><textarea v-model="question" rows="3" maxlength="500" placeholder="例如：企业做 RAG 项目时，第一步应该关注什么？"></textarea></label><button :disabled="busy">{{ busy ? '正在检索与生成…' : '开始提问' }}</button></form>
      <div class="rag-examples"><span>试着问：</span><button v-for="example in examples" :key="example" type="button" :disabled="busy" @click="useExample(example)">{{ example }}</button></div>
      <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p>
      <article v-if="result" class="rag-answer"><div class="rag-answer__label">{{ result.mode === 'ai' ? 'AI 回答' : '检索结果' }}</div><p>{{ result.answer }}</p><div v-if="result.sources.length" class="rag-sources"><h3>引用的本地资料</h3><a v-for="source in result.sources" :key="source.id" :href="portalHref(source.route)"><strong>{{ source.title }}</strong><span>{{ source.category }}</span><p>{{ source.excerpt }}</p></a></div><div class="rag-feedback"><span>{{ feedback ? '感谢反馈' : '这次回答有帮助吗？' }}</span><button :class="{ active: feedback === 1 }" :disabled="!!feedback" @click="sendFeedback(1)">有帮助</button><button :class="{ active: feedback === -1 }" :disabled="!!feedback" @click="sendFeedback(-1)">没帮助</button></div></article>
      <p class="rag-privacy">为改进知识库，系统会保存问题、响应模式、命中数量和反馈，不记录访问者姓名或联系方式。</p>
    </template>
  </section>
</template>
