<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'

interface Summary { pageViews:number; visitors:number; sessions:number; engagedSessions:number; engagementRate:number; contactIntents:number; contactRate:number; pagesPerSession:number; caseOpens:number; ragQueries:number; returningVisitors:number }
interface Daily { date:string; pageViews:number; visitors:number; sessions:number; engagedSessions:number; contactIntents:number }
interface Analytics {
  days:number; timezone:string; collectedAt:string; summary:Summary
  comparison:{ pageViewsChange:number|null; visitorsChange:number|null; sessionsChange:number|null; contactIntentsChange:number|null }
  daily:Daily[]; topPages:Array<{ pagePath:string; pageViews:number; visitors:number; engagedSessions:number }>
  sources:Array<{ source:string; visitors:number; pageViews:number }>; devices:Array<{ device:string; visitors:number; pageViews:number }>
  conversions:Array<{ eventName:string; events:number; visitors:number }>
  performance:{ samples:number; averageLoadMs:number; p95LoadMs:number; averageTtfbMs:number; averageFcpMs:number }
}

const state = ref<'loading'|'login'|'ready'|'unavailable'>('loading')
const username = ref('admin')
const password = ref('')
const period = ref(30)
const analytics = ref<Analytics | null>(null)
const settings = reactive({ enabled:true, respectDnt:true, retentionDays:365, updatedAt:'', updatedBy:'' })
const settingsEtag = ref('')
const busy = ref('')
const error = ref('')
const message = ref('')

const readError = async (response:Response) => {
  try { return (await response.json()).error || `请求失败（${response.status}）` } catch { return `请求失败（${response.status}）` }
}
const fetchDashboard = async () => {
  state.value = 'loading'; error.value = ''
  try {
    const [analyticsResponse, settingsResponse] = await Promise.all([
      fetch(`/api/admin/analytics?days=${period.value}`, { credentials:'same-origin' }),
      fetch('/api/admin/analytics-settings', { credentials:'same-origin' })
    ])
    if (analyticsResponse.status === 401 || settingsResponse.status === 401) { state.value = 'login'; return }
    if (!analyticsResponse.ok || !settingsResponse.ok) { state.value = 'unavailable'; return }
    analytics.value = await analyticsResponse.json()
    Object.assign(settings, await settingsResponse.json())
    settingsEtag.value = settingsResponse.headers.get('etag') || ''
    state.value = 'ready'
  } catch { state.value = 'unavailable' }
}
onMounted(fetchDashboard)

const login = async () => {
  busy.value = 'login'; error.value = ''
  const response = await fetch('/api/admin/login', {
    method:'POST', credentials:'same-origin', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ username:username.value, password:password.value })
  }).catch(() => null)
  password.value = ''
  if (!response?.ok) error.value = response ? await readError(response) : '无法连接管理服务。'
  else await fetchDashboard()
  busy.value = ''
}
const saveSettings = async () => {
  busy.value = 'settings'; error.value = ''; message.value = ''
  const response = await fetch('/api/admin/analytics-settings', {
    method:'PUT', credentials:'same-origin', headers:{ 'content-type':'application/json', 'if-match':settingsEtag.value },
    body:JSON.stringify(settings)
  })
  if (!response.ok) error.value = await readError(response)
  else {
    Object.assign(settings, await response.json())
    settingsEtag.value = response.headers.get('etag') || ''
    message.value = '监控隐私与保留配置已保存。'
    await fetchDashboard()
  }
  busy.value = ''
}

const format = (value:number) => new Intl.NumberFormat('zh-CN').format(value || 0)
const formatPercent = (value:number|null) => value === null ? '暂无对比' : `${value > 0 ? '+' : ''}${value}%`
const formatMs = (value:number) => value ? `${format(value)} ms` : '暂无样本'
const sourceLabel = (source:string) => source.startsWith('utm:') ? `UTM · ${source.slice(4)}` : ({ direct:'直接访问', search:'搜索引擎', social:'社交平台', referral:'外部引荐' } as Record<string,string>)[source] || source
const deviceLabel = (device:string) => ({ desktop:'桌面端', mobile:'移动端', tablet:'平板', other:'其他' } as Record<string,string>)[device] || device
const conversionLabel = (eventName:string) => ({ contact_intent:'发起联系', case_open:'打开案例资料', forum_open:'进入论坛', rag_query:'知识问答', account_open:'打开账号页', knowledge_open:'打开知识库' } as Record<string,string>)[eventName] || eventName

const maxDailyPageViews = computed(() => Math.max(1, ...(analytics.value?.daily.map(item => item.pageViews) || [0])))
const insights = computed(() => {
  const data = analytics.value
  if (!data?.summary.pageViews) return ['监控已启用，首批数据会在真实访问发生后出现在这里。', '建议在外部渠道链接中使用 utm_source，以便比较不同推广来源。']
  const result:string[] = []
  const { summary, comparison, performance, sources, topPages } = data
  if (comparison.visitorsChange !== null) result.push(`独立访客较上一周期${comparison.visitorsChange >= 0 ? '增长' : '下降'} ${Math.abs(comparison.visitorsChange)}%。`)
  if (summary.engagementRate < 35) result.push(`会话互动率为 ${summary.engagementRate}%，可优先优化访问最多页面的首屏信息与下一步行动。`)
  else result.push(`会话互动率为 ${summary.engagementRate}%，访问者已形成较好的内容停留。`)
  if (performance.samples && performance.p95LoadMs > 3000) result.push(`P95 页面加载为 ${performance.p95LoadMs} ms，建议先压缩首页与案例图片。`)
  if (sources[0]) result.push(`当前主要来源为「${sourceLabel(sources[0].source)}」，带来 ${sources[0].visitors} 位访客。`)
  if (topPages[0]) result.push(`访问最多页面是「${topPages[0].pagePath}」，可在该页强化与合作目标相关的行动入口。`)
  return result.slice(0, 4)
})
</script>

<template>
  <section class="analytics-dashboard">
    <div v-if="state === 'loading'" class="case-admin-state">正在读取访问监控数据…</div>
    <form v-else-if="state === 'login'" class="case-admin-login" @submit.prevent="login">
      <span>ANALYTICS ADMIN</span><h1>访问监控与数据分析</h1><p>使用站点管理员账号登录。</p>
      <label>账号<input v-model="username" autocomplete="username" required></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" required></label>
      <button :disabled="busy === 'login'">登录管理后台</button>
      <p v-if="error" class="case-admin-feedback case-admin-feedback--error">{{ error }}</p>
    </form>
    <div v-else-if="state === 'unavailable'" class="case-admin-state"><h1>管理服务未连接</h1><p>请运行 <code>npm run admin</code> 后重试。</p></div>
    <template v-else-if="analytics">
      <header class="case-admin__hero analytics-dashboard__hero">
        <div><span>FIRST-PARTY ANALYTICS</span><h1>访问监控与数据分析</h1><p>PV、独立访客、会话、来源、内容转化与性能均由本站第一方匿名事件计算。</p></div>
        <div class="site-admin__links"><a :href="withBase('/admin/users')">用户与社区 →</a><a :href="withBase('/contact')" target="_blank">查看联系页 ↗</a></div>
      </header>
      <div class="analytics-dashboard__toolbar"><label>统计周期<select v-model.number="period" @change="fetchDashboard"><option :value="7">近 7 天</option><option :value="30">近 30 天</option><option :value="90">近 90 天</option></select></label><button @click="fetchDashboard">刷新数据</button><span>按 {{ analytics.timezone }} 统计 · 更新于 {{ analytics.collectedAt.slice(0,16).replace('T',' ') }}</span></div>
      <p v-if="error" class="case-admin-feedback case-admin-feedback--error">{{ error }}</p><p v-if="message" class="case-admin-feedback">{{ message }}</p>

      <section class="analytics-summary" aria-label="核心访问指标">
        <article><span>页面浏览 PV</span><strong>{{ format(analytics.summary.pageViews) }}</strong><small :class="{ positive:(analytics.comparison.pageViewsChange || 0) > 0, negative:(analytics.comparison.pageViewsChange || 0) < 0 }">{{ formatPercent(analytics.comparison.pageViewsChange) }} 较上一周期</small></article>
        <article><span>独立访客 UV</span><strong>{{ format(analytics.summary.visitors) }}</strong><small :class="{ positive:(analytics.comparison.visitorsChange || 0) > 0, negative:(analytics.comparison.visitorsChange || 0) < 0 }">{{ formatPercent(analytics.comparison.visitorsChange) }} 较上一周期</small></article>
        <article><span>访问会话</span><strong>{{ format(analytics.summary.sessions) }}</strong><small>每会话 {{ analytics.summary.pagesPerSession }} 页</small></article>
        <article><span>互动率</span><strong>{{ analytics.summary.engagementRate }}%</strong><small>{{ format(analytics.summary.engagedSessions) }} 个有效互动会话</small></article>
        <article><span>联系意向</span><strong>{{ format(analytics.summary.contactIntents) }}</strong><small>访客转化 {{ analytics.summary.contactRate }}%</small></article>
        <article><span>回访访客</span><strong>{{ format(analytics.summary.returningVisitors) }}</strong><small>曾在此前到访过本站</small></article>
      </section>

      <section class="analytics-panel analytics-trend-panel"><header><div><h2>每日访问趋势</h2><p>柱高为每日 PV；标签同时展示当天独立访客。</p></div></header><div v-if="analytics.daily.length" class="analytics-bars"><div v-for="day in analytics.daily" :key="day.date" class="analytics-bar"><div class="analytics-bar__value">{{ day.pageViews }}</div><div class="analytics-bar__track"><i :style="{ height: `${Math.max(5, day.pageViews / maxDailyPageViews * 100)}%` }" /></div><strong>{{ day.date.slice(5) }}</strong><small>UV {{ day.visitors }}</small></div></div><div v-else class="community-empty">尚无访问事件。公开页面被真实访问后，趋势会自动出现。</div></section>

      <div class="analytics-two-column">
        <section class="analytics-panel"><header><div><h2>页面表现</h2><p>按 PV 排序，互动会话反映停留超过 15 秒的访问。</p></div></header><div class="analytics-table-wrap"><table><thead><tr><th>页面</th><th>PV</th><th>访客</th><th>互动会话</th></tr></thead><tbody><tr v-for="item in analytics.topPages" :key="item.pagePath"><td><code>{{ item.pagePath }}</code></td><td>{{ item.pageViews }}</td><td>{{ item.visitors }}</td><td>{{ item.engagedSessions }}</td></tr></tbody></table><div v-if="!analytics.topPages.length" class="community-empty">暂无页面数据。</div></div></section>
        <section class="analytics-panel"><header><div><h2>来源与设备</h2><p>来源仅保留渠道类型/UTM，不保存完整来源地址。</p></div></header><div class="analytics-split-list"><div><h3>访问来源</h3><ol><li v-for="item in analytics.sources" :key="item.source"><span>{{ sourceLabel(item.source) }}</span><strong>{{ item.visitors }} UV</strong></li><li v-if="!analytics.sources.length">暂无来源数据</li></ol></div><div><h3>访问设备</h3><ol><li v-for="item in analytics.devices" :key="item.device"><span>{{ deviceLabel(item.device) }}</span><strong>{{ item.visitors }} UV</strong></li><li v-if="!analytics.devices.length">暂无设备数据</li></ol></div></div></section>
      </div>

      <div class="analytics-two-column">
        <section class="analytics-panel"><header><div><h2>行动转化</h2><p>用于判断内容是否推动了案例查看、联系、问答和社区互动。</p></div></header><div class="analytics-conversions"><article v-for="item in analytics.conversions" :key="item.eventName"><span>{{ conversionLabel(item.eventName) }}</span><strong>{{ item.events }}</strong><small>{{ item.visitors }} 位访客触发</small></article><div v-if="!analytics.conversions.length" class="community-empty">暂无行动事件。</div></div></section>
        <section class="analytics-panel"><header><div><h2>体验性能</h2><p>来自浏览器导航性能数据，P95 用于识别慢页面风险。</p></div></header><div class="analytics-performance"><article><span>平均加载</span><strong>{{ formatMs(analytics.performance.averageLoadMs) }}</strong></article><article><span>P95 加载</span><strong>{{ formatMs(analytics.performance.p95LoadMs) }}</strong></article><article><span>平均 TTFB</span><strong>{{ formatMs(analytics.performance.averageTtfbMs) }}</strong></article><article><span>平均 FCP</span><strong>{{ formatMs(analytics.performance.averageFcpMs) }}</strong></article></div><small class="analytics-note">当前性能样本：{{ analytics.performance.samples }}。低于一个样本时不做性能判断。</small></section>
      </div>

      <section class="analytics-panel analytics-insights"><header><div><h2>自动分析提示</h2><p>基于当前周期的实际访问数据生成，便于决定下一轮内容与渠道优化重点。</p></div></header><ul><li v-for="item in insights" :key="item">{{ item }}</li></ul></section>

      <section class="analytics-panel analytics-settings"><header><div><h2>监控隐私与保留</h2><p>仅使用第一方匿名 Cookie 的单向摘要进行去重；不保存 IP、账号信息或完整来源 URL。</p></div></header><form class="community-form" @submit.prevent="saveSettings"><label class="community-consent"><input v-model="settings.enabled" type="checkbox"><span>启用站内访问监控</span></label><label class="community-consent"><input v-model="settings.respectDnt" type="checkbox"><span>遵守浏览器“禁止跟踪”偏好</span></label><label><span>事件保留天数</span><input v-model.number="settings.retentionDays" type="number" min="30" max="1825" required></label><div class="wide admin-form-actions"><button type="submit" :disabled="busy === 'settings'">保存监控配置</button></div></form></section>
      <div class="admin-save-dock" role="region" aria-label="访问监控配置保存">
        <span>修改监控配置后点击保存，设置立即生效</span>
        <button type="button" class="case-admin-primary" :disabled="busy === 'settings'" @click="saveSettings">{{ busy === 'settings' ? '保存中…' : '保存并生效' }}</button>
      </div>
    </template>
  </section>
</template>
