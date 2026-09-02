<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import type { KnowledgeEntry } from '../../../data/knowledge'

interface AiSettings {
  enabled: boolean; provider: string; apiUrl: string; model: string; apiKey: string; apiKeySet: boolean
  clearApiKey: boolean; topK: number; temperature: number; maxTokens: number; systemPrompt: string
}
type AdminEntry = KnowledgeEntry & { takeawayText: string }
type ViewState = 'loading' | 'login' | 'ready' | 'unavailable'

const state = ref<ViewState>('loading')
const username = ref('admin')
const password = ref('')
const entries = ref<AdminEntry[]>([])
const ai = ref<AiSettings | null>(null)
const knowledgeRevision = ref('')
const aiRevision = ref('')
const busy = ref('')
const error = ref('')
const message = ref('')
const publishedCount = computed(() => entries.value.filter(entry => entry.published).length)

const readError = async (response: Response) => {
  try { return (await response.json()).error || `请求失败（${response.status}）` }
  catch { return `请求失败（${response.status}）` }
}
const toAdminEntry = (entry: KnowledgeEntry): AdminEntry => ({ ...entry, takeaways: [...entry.takeaways], takeawayText: entry.takeaways.join('\n') })

const load = async () => {
  state.value = 'loading'; error.value = ''
  try {
    const [knowledgeResponse, aiResponse] = await Promise.all([
      fetch('/api/admin/knowledge', { credentials: 'same-origin', headers: { accept: 'application/json' } }),
      fetch('/api/admin/ai-settings', { credentials: 'same-origin', headers: { accept: 'application/json' } })
    ])
    if (knowledgeResponse.status === 401 || aiResponse.status === 401) { state.value = 'login'; return }
    if (!knowledgeResponse.ok || !aiResponse.ok) { state.value = 'unavailable'; return }
    entries.value = ((await knowledgeResponse.json()) as KnowledgeEntry[]).map(toAdminEntry)
    ai.value = await aiResponse.json() as AiSettings
    knowledgeRevision.value = knowledgeResponse.headers.get('etag') || ''
    aiRevision.value = aiResponse.headers.get('etag') || ''
    state.value = knowledgeRevision.value && aiRevision.value ? 'ready' : 'unavailable'
  } catch { state.value = 'unavailable' }
}

const login = async () => {
  busy.value = 'login'; error.value = ''
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ username: username.value, password: password.value }) })
    password.value = ''
    if (!response.ok) { error.value = await readError(response); return }
    await load()
  } catch { error.value = '无法连接管理服务，请确认已运行 npm run admin。' }
  finally { busy.value = '' }
}

const saveKnowledge = async () => {
  busy.value = 'knowledge'; error.value = ''; message.value = ''
  const payload = entries.value.map(({ takeawayText, ...entry }) => ({ ...entry, takeaways: takeawayText.split(/[、,，\n]/).map(item => item.trim()).filter(Boolean) }))
  try {
    const response = await fetch('/api/admin/knowledge', { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': knowledgeRevision.value }, credentials: 'same-origin', body: JSON.stringify(payload) })
    if (!response.ok) { error.value = await readError(response); return }
    entries.value = ((await response.json()) as KnowledgeEntry[]).map(toAdminEntry)
    knowledgeRevision.value = response.headers.get('etag') || knowledgeRevision.value
    message.value = `已保存 ${entries.value.length} 条知识，其中 ${publishedCount.value} 条公开。`
  } catch { error.value = '知识库保存失败。' }
  finally { busy.value = '' }
}

const saveAi = async () => {
  if (!ai.value) return
  busy.value = 'ai'; error.value = ''; message.value = ''
  try {
    const response = await fetch('/api/admin/ai-settings', { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': aiRevision.value }, credentials: 'same-origin', body: JSON.stringify(ai.value) })
    if (!response.ok) { error.value = await readError(response); return }
    ai.value = await response.json() as AiSettings
    aiRevision.value = response.headers.get('etag') || aiRevision.value
    message.value = `AI 配置已保存，当前为${ai.value.enabled ? '模型问答模式' : '本地检索模式'}。`
  } catch { error.value = 'AI 配置保存失败。' }
  finally { busy.value = '' }
}

const testAi = async () => {
  busy.value = 'test'; error.value = ''; message.value = ''
  try {
    const response = await fetch('/api/admin/ai-test', { method: 'POST', credentials: 'same-origin' })
    const payload = await response.json()
    if (!response.ok) { error.value = payload.error || '连接测试失败。'; return }
    message.value = `连接成功：${payload.answer}`
  } catch { error.value = '无法连接 AI 接口。' }
  finally { busy.value = '' }
}

const addEntry = () => {
  const number = entries.value.reduce((max, item) => Math.max(max, Number.parseInt(item.id.replace(/\D/g, ''), 10) || 0), 0) + 1
  entries.value.push({ id: `k${String(number).padStart(2, '0')}`, category: '企业 AI', title: '新知识条目', summary: '请填写摘要。', body: '请填写知识正文。', takeaways: [], takeawayText: '', stage: '实践笔记', updated: new Date().toISOString().slice(0, 7), published: false })
}
const remove = (index: number) => entries.value.splice(index, 1)
const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= entries.value.length) return; [entries.value[index], entries.value[target]] = [entries.value[target], entries.value[index]] }
const logout = async () => { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined); state.value = 'login'; entries.value = []; ai.value = null }
onMounted(load)
</script>

<template>
  <section class="case-admin knowledge-admin">
    <header class="case-admin__hero"><div><span>KNOWLEDGE CMS · RAG</span><h1>知识库与 AI 管理</h1><p>管理公开知识条目，并配置 OpenAI 兼容接口。API Key 由服务端加密保存，不会发送到公开页面。</p></div><div class="site-admin__links"><a :href="withBase('/knowledge')" target="_blank">查看知识库 ↗</a><a :href="withBase('/admin/site')">站点管理 →</a><a :href="withBase('/admin/cases')">案例管理 →</a></div></header>
    <div v-if="state === 'loading'" class="case-admin-state">正在连接管理服务…</div>
    <div v-else-if="state === 'unavailable'" class="case-admin-state case-admin-state--warning"><h2>管理服务未启动</h2><p>请运行 <code>npm run admin</code> 后刷新。</p><button @click="load">重新连接</button></div>
    <form v-else-if="state === 'login'" class="case-admin-login" @submit.prevent="login"><h2>管理员登录</h2><label><span>账号</span><input v-model="username" autocomplete="username" required></label><label><span>密码</span><input v-model="password" type="password" autocomplete="current-password" required></label><p v-if="error" class="case-admin-feedback case-admin-feedback--error">{{ error }}</p><button :disabled="busy === 'login'">{{ busy === 'login' ? '登录中…' : '登录管理后台' }}</button></form>
    <template v-else-if="ai">
      <div class="case-admin-toolbar"><div><strong>{{ entries.length }}</strong> 条知识 · <strong>{{ publishedCount }}</strong> 条公开</div><div><button class="case-admin-secondary" @click="addEntry">新增知识</button><button class="case-admin-primary" :disabled="!!busy" @click="saveKnowledge">{{ busy === 'knowledge' ? '保存中…' : '保存知识库' }}</button><button class="case-admin-ghost" @click="logout">退出</button></div></div>
      <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p><p v-if="message" class="case-admin-feedback" role="status">{{ message }}</p>

      <details class="site-admin-section" open><summary>AI 问答与 RAG 配置</summary><div class="case-admin-fields">
        <label class="case-admin-check"><input v-model="ai.enabled" type="checkbox"><span>启用 AI 生成回答；关闭时仅返回本地检索结果</span></label>
        <label><span>服务商名称</span><input v-model="ai.provider" placeholder="OpenAI Compatible"></label><label><span>模型名称</span><input v-model="ai.model" placeholder="gpt-4.1-mini"></label>
        <label class="wide"><span>Chat Completions 完整接口地址</span><input v-model="ai.apiUrl" type="url" placeholder="https://api.openai.com/v1/chat/completions"></label>
        <label class="wide"><span>API Key {{ ai.apiKeySet ? '（已安全保存；留空则保持不变）' : '' }}</span><input v-model="ai.apiKey" type="password" autocomplete="new-password" placeholder="sk-..."></label>
        <label class="case-admin-check"><input v-model="ai.clearApiKey" type="checkbox"><span>保存时清除现有 API Key</span></label>
        <label><span>RAG 召回数量</span><input v-model.number="ai.topK" type="number" min="1" max="10"></label><label><span>模型温度</span><input v-model.number="ai.temperature" type="number" min="0" max="2" step="0.1"></label><label><span>最大输出 Token</span><input v-model.number="ai.maxTokens" type="number" min="128" max="8192"></label>
        <label class="wide"><span>系统提示词</span><textarea v-model="ai.systemPrompt" rows="5"></textarea></label>
        <div class="wide knowledge-admin__actions"><button class="case-admin-primary" :disabled="!!busy" @click="saveAi">{{ busy === 'ai' ? '保存中…' : '保存 AI 配置' }}</button><button class="case-admin-secondary" :disabled="!!busy" @click="testAi">{{ busy === 'test' ? '测试中…' : '测试已保存的接口' }}</button></div>
      </div></details>

      <div class="case-admin-list"><article v-for="(entry, index) in entries" :key="entry.id" class="case-admin-card"><header><div><span>{{ entry.id }}</span><strong>{{ entry.title }}</strong></div><div class="case-admin-card__actions"><button :disabled="index === 0" @click="move(index, -1)">↑</button><button :disabled="index === entries.length - 1" @click="move(index, 1)">↓</button><button class="danger" @click="remove(index)">删除</button></div></header><div class="case-admin-fields">
        <label><span>编号</span><input v-model="entry.id" maxlength="40"></label><label><span>分类</span><input v-model="entry.category"></label><label class="wide"><span>标题</span><input v-model="entry.title"></label><label class="wide"><span>摘要</span><textarea v-model="entry.summary" rows="2"></textarea></label><label class="wide"><span>正文（RAG 检索内容）</span><textarea v-model="entry.body" rows="7"></textarea></label><label class="wide"><span>核心要点（每行一项）</span><textarea v-model="entry.takeawayText" rows="3"></textarea></label><label><span>内容类型</span><input v-model="entry.stage"></label><label><span>更新时间</span><input v-model="entry.updated"></label><label class="case-admin-check"><input v-model="entry.published" type="checkbox"><span>公开发布并纳入 RAG</span></label>
      </div></article></div>
    </template>
  </section>
</template>
