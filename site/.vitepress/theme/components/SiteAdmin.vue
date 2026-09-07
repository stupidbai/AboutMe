<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import type { CooperationDirection, Metric, PortalRoute, SiteConfig } from '../../../data/siteConfig'

type ViewState = 'loading' | 'login' | 'ready' | 'unavailable'
const state = ref<ViewState>('loading')
const username = ref('admin')
const password = ref('')
const config = ref<SiteConfig | null>(null)
const revision = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
const revisionNumber = computed(() => revision.value.match(/site-config-(\d+)/)?.[1] || '—')

const readError = async (response: Response) => {
  try { return (await response.json()).error || `请求失败（${response.status}）` }
  catch { return `请求失败（${response.status}）` }
}

const loadConfig = async () => {
  state.value = 'loading'
  error.value = ''
  try {
    const response = await fetch('/api/admin/site-config', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    if (response.status === 401) { state.value = 'login'; return }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { state.value = 'unavailable'; return }
    config.value = await response.json() as SiteConfig
    revision.value = response.headers.get('etag') || ''
    state.value = revision.value ? 'ready' : 'unavailable'
  } catch { state.value = 'unavailable' }
}

const login = async () => {
  busy.value = true
  error.value = ''
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ username: username.value, password: password.value })
    })
    password.value = ''
    if (!response.ok) { error.value = await readError(response); return }
    await loadConfig()
  } catch { error.value = '无法连接管理服务，请确认已运行 npm run admin。' }
  finally { busy.value = false }
}

const save = async () => {
  if (!config.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const response = await fetch('/api/admin/site-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'if-match': revision.value },
      credentials: 'same-origin', body: JSON.stringify(config.value)
    })
    if (response.status === 401) { state.value = 'login'; error.value = '登录已过期，请重新登录。'; return }
    if (!response.ok) { error.value = await readError(response); return }
    config.value = await response.json() as SiteConfig
    revision.value = response.headers.get('etag') || revision.value
    message.value = '站点配置已保存。公开页面刷新后立即生效，无需重新构建。'
  } catch { error.value = '保存失败，请检查管理服务连接。' }
  finally { busy.value = false }
}

const logout = async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
  config.value = null
  revision.value = ''
  state.value = 'login'
}

const move = <T>(items: T[], index: number, offset: number) => {
  const target = index + offset
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target], items[index]]
}
const remove = <T>(items: T[], index: number) => items.splice(index, 1)
const splitList = (value: string) => value.split(/[、,，\n]/).map(item => item.trim()).filter(Boolean)
const setRouteTags = (route: PortalRoute, event: Event) => { route.tags = splitList((event.target as HTMLInputElement).value) }
const setDirectionItems = (direction: CooperationDirection, event: Event) => { direction.items = splitList((event.target as HTMLTextAreaElement).value) }

const addMetric = () => config.value?.metrics.push({ value: '新数据', label: '数据说明' } as Metric)
const addRoute = () => config.value?.routes.push({ code: 'NEW', title: '新版块', description: '请填写版块说明。', link: '/', tags: [], accent: 'cyan', enabled: true })
const addFocus = () => config.value?.focusAreas.push({ code: 'NEW FOCUS', title: '新工作主线', description: '请填写工作主线说明。' })
const addTimeline = () => config.value?.timeline.push({ period: '时间', organization: '组织名称', role: '角色', description: '请填写主要职责与成果。', current: false })
const addStage = () => config.value?.cooperation.stages.push({ code: 'NEW', title: '新合作阶段', description: '请填写适合合作的情况。' })
const addDirection = () => config.value?.cooperation.directions.push({ title: '新合作方向', description: '请填写方向说明。', items: ['合作要点'] })
const addProcess = () => config.value?.cooperation.process.push({ title: '新流程', description: '请填写流程说明。' })

onMounted(loadConfig)
</script>

<template>
  <section class="case-admin site-admin">
    <header class="case-admin__hero">
      <div><span>PRIVATE CMS</span><h1>站点内容管理</h1><p>集中维护首页、身份、联系、目录、履历与合作内容。所有修改均保存在 SQLite，并带版本冲突保护和自动备份。</p></div>
      <div class="site-admin__links"><a :href="withBase('/')" target="_blank">查看网站 ↗</a><a :href="withBase('/admin/knowledge')">知识与 AI →</a><a :href="withBase('/admin/cases')">案例管理 →</a><a :href="withBase('/admin/users')">用户与社区 →</a></div>
    </header>

    <div v-if="state === 'loading'" class="case-admin-state">正在连接管理服务…</div>
    <div v-else-if="state === 'unavailable'" class="case-admin-state case-admin-state--warning"><h2>管理服务未启动</h2><p>请运行 <code>npm run admin</code> 后刷新。纯静态预览只读取默认配置，不能写入。</p><button type="button" @click="loadConfig">重新连接</button></div>
    <form v-else-if="state === 'login'" class="case-admin-login" @submit.prevent="login"><h2>管理员登录</h2><p>站点配置与案例配置共用同一安全会话。</p><label><span>账号</span><input v-model="username" autocomplete="username" required></label><label><span>密码</span><input v-model="password" type="password" autocomplete="current-password" required></label><p v-if="error" class="case-admin-feedback case-admin-feedback--error">{{ error }}</p><button :disabled="busy">{{ busy ? '登录中…' : '登录管理后台' }}</button></form>

    <template v-else-if="config">
      <div class="case-admin-toolbar"><div>站点配置 · SQLite r{{ revisionNumber }}</div><div><button type="button" class="case-admin-primary" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存全部修改' }}</button><button type="button" class="case-admin-ghost" @click="logout">退出登录</button></div></div>
      <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p><p v-if="message" class="case-admin-feedback" role="status">{{ message }}</p>

      <details class="site-admin-section" open><summary>个人身份与首页主视觉</summary><div class="case-admin-fields">
        <label><span>姓名</span><input v-model="config.identity.name"></label><label><span>当前职位</span><input v-model="config.identity.currentRole"></label>
        <label class="wide"><span>身份副标题</span><input v-model="config.identity.subtitle"></label><label class="wide"><span>聚焦方向</span><input v-model="config.identity.focus"></label><label class="wide"><span>核心能力</span><input v-model="config.identity.capabilities"></label><label><span>城市</span><input v-model="config.identity.city"></label>
        <label class="wide"><span>首页眉题</span><input v-model="config.home.kicker"></label><label><span>首页标题</span><input v-model="config.home.title"></label><label><span>强调标题</span><input v-model="config.home.highlight"></label><label class="wide"><span>首页简介</span><textarea v-model="config.home.lead" rows="3"></textarea></label>
        <label><span>主按钮文字</span><input v-model="config.home.primaryAction.label"></label><label><span>主按钮链接</span><input v-model="config.home.primaryAction.link"></label><label><span>次按钮文字</span><input v-model="config.home.secondaryAction.label"></label><label><span>次按钮链接</span><input v-model="config.home.secondaryAction.link"></label>
        <label><span>目录标题</span><input v-model="config.home.directoryTitle"></label><label><span>目录说明</span><input v-model="config.home.directoryDescription"></label><label><span>主线标题</span><input v-model="config.home.focusTitle"></label><label><span>主线说明</span><input v-model="config.home.focusDescription"></label>
      </div></details>

      <details class="site-admin-section" open><summary>联系方式</summary><div class="case-admin-fields">
        <label class="wide"><span>联系区标题</span><input v-model="config.contact.title"></label><label class="wide"><span>联系区说明</span><textarea v-model="config.contact.description" rows="2"></textarea></label>
        <label><span>电话</span><input v-model="config.contact.phone"></label><label><span>邮箱</span><input v-model="config.contact.email" type="email"></label><label><span>城市</span><input v-model="config.contact.city"></label><label><span>公众号</span><input v-model="config.contact.publicAccount"></label><label class="wide"><span>二维码路径</span><input v-model="config.contact.wechatQr"></label><label><span>二维码标题</span><input v-model="config.contact.wechatLabel"></label><label><span>二维码提示</span><input v-model="config.contact.wechatHint"></label>
      </div></details>

      <details class="site-admin-section"><summary>首页数据指标（{{ config.metrics.length }}）</summary><div class="site-admin-repeat"><article v-for="(item, index) in config.metrics" :key="index" class="case-admin-card"><header><strong>指标 {{ index + 1 }}</strong><div class="case-admin-card__actions"><button @click="move(config.metrics, index, -1)">↑</button><button @click="move(config.metrics, index, 1)">↓</button><button class="danger" @click="remove(config.metrics, index)">删除</button></div></header><div class="case-admin-fields"><label><span>数值</span><input v-model="item.value"></label><label><span>说明</span><input v-model="item.label"></label></div></article><button class="site-admin-add" @click="addMetric">＋ 新增指标</button></div></details>

      <details class="site-admin-section"><summary>首页目录与版块显隐（{{ config.routes.length }}）</summary><div class="site-admin-repeat"><article v-for="(route, index) in config.routes" :key="index" class="case-admin-card"><header><strong>{{ route.code }} · {{ route.title }}</strong><div class="case-admin-card__actions"><button @click="move(config.routes, index, -1)">↑</button><button @click="move(config.routes, index, 1)">↓</button><button class="danger" @click="remove(config.routes, index)">删除</button></div></header><div class="case-admin-fields"><label><span>编号</span><input v-model="route.code"></label><label><span>主题色</span><select v-model="route.accent"><option>cyan</option><option>blue</option><option>violet</option><option>orange</option><option>green</option></select></label><label class="wide"><span>标题</span><input v-model="route.title"></label><label class="wide"><span>说明</span><textarea v-model="route.description" rows="2"></textarea></label><label><span>链接</span><input v-model="route.link"></label><label><span>标签（顿号分隔）</span><input :value="route.tags.join('、')" @input="setRouteTags(route, $event)"></label><label class="case-admin-check"><input v-model="route.enabled" type="checkbox"><span>在首页目录显示</span></label></div></article><button class="site-admin-add" @click="addRoute">＋ 新增目录</button></div></details>

      <details class="site-admin-section"><summary>长期工作主线（{{ config.focusAreas.length }}）</summary><div class="site-admin-repeat"><article v-for="(item, index) in config.focusAreas" :key="index" class="case-admin-card"><header><strong>{{ item.title }}</strong><div class="case-admin-card__actions"><button @click="move(config.focusAreas, index, -1)">↑</button><button @click="move(config.focusAreas, index, 1)">↓</button><button class="danger" @click="remove(config.focusAreas, index)">删除</button></div></header><div class="case-admin-fields"><label><span>英文代码</span><input v-model="item.code"></label><label><span>标题</span><input v-model="item.title"></label><label class="wide"><span>说明</span><textarea v-model="item.description" rows="2"></textarea></label></div></article><button class="site-admin-add" @click="addFocus">＋ 新增主线</button></div></details>

      <details class="site-admin-section"><summary>职业时间线（{{ config.timeline.length }}）</summary><div class="site-admin-repeat"><article v-for="(item, index) in config.timeline" :key="index" class="case-admin-card"><header><strong>{{ item.period }} · {{ item.organization }}</strong><div class="case-admin-card__actions"><button @click="move(config.timeline, index, -1)">↑</button><button @click="move(config.timeline, index, 1)">↓</button><button class="danger" @click="remove(config.timeline, index)">删除</button></div></header><div class="case-admin-fields"><label><span>时间</span><input v-model="item.period"></label><label><span>组织</span><input v-model="item.organization"></label><label class="wide"><span>角色</span><input v-model="item.role"></label><label class="wide"><span>说明</span><textarea v-model="item.description" rows="2"></textarea></label><label class="case-admin-check"><input v-model="item.current" type="checkbox"><span>标记为当前经历</span></label></div></article><button class="site-admin-add" @click="addTimeline">＋ 新增经历</button></div></details>

      <details class="site-admin-section"><summary>合作页内容</summary><div class="case-admin-fields site-admin-overview"><label class="wide"><span>页面标题</span><input v-model="config.cooperation.title"></label><label class="wide"><span>页面说明</span><textarea v-model="config.cooperation.description" rows="2"></textarea></label></div>
        <h3>适合合作的阶段</h3><div class="site-admin-repeat"><article v-for="(item, index) in config.cooperation.stages" :key="index" class="case-admin-card"><header><strong>{{ item.title }}</strong><div class="case-admin-card__actions"><button @click="move(config.cooperation.stages, index, -1)">↑</button><button @click="move(config.cooperation.stages, index, 1)">↓</button><button class="danger" @click="remove(config.cooperation.stages, index)">删除</button></div></header><div class="case-admin-fields"><label><span>代码</span><input v-model="item.code"></label><label><span>标题</span><input v-model="item.title"></label><label class="wide"><span>说明</span><textarea v-model="item.description" rows="2"></textarea></label></div></article><button class="site-admin-add" @click="addStage">＋ 新增阶段</button></div>
        <h3>优先合作方向</h3><div class="site-admin-repeat"><article v-for="(item, index) in config.cooperation.directions" :key="index" class="case-admin-card"><header><strong>{{ item.title }}</strong><div class="case-admin-card__actions"><button @click="move(config.cooperation.directions, index, -1)">↑</button><button @click="move(config.cooperation.directions, index, 1)">↓</button><button class="danger" @click="remove(config.cooperation.directions, index)">删除</button></div></header><div class="case-admin-fields"><label class="wide"><span>标题</span><input v-model="item.title"></label><label class="wide"><span>说明</span><textarea v-model="item.description" rows="2"></textarea></label><label class="wide"><span>要点（每行或顿号分隔）</span><textarea :value="item.items.join('\n')" rows="3" @input="setDirectionItems(item, $event)"></textarea></label></div></article><button class="site-admin-add" @click="addDirection">＋ 新增方向</button></div>
        <h3>合作流程</h3><div class="site-admin-repeat"><article v-for="(item, index) in config.cooperation.process" :key="index" class="case-admin-card"><header><strong>{{ item.title }}</strong><div class="case-admin-card__actions"><button @click="move(config.cooperation.process, index, -1)">↑</button><button @click="move(config.cooperation.process, index, 1)">↓</button><button class="danger" @click="remove(config.cooperation.process, index)">删除</button></div></header><div class="case-admin-fields"><label><span>标题</span><input v-model="item.title"></label><label><span>说明</span><input v-model="item.description"></label></div></article><button class="site-admin-add" @click="addProcess">＋ 新增流程</button></div>
      </details>
      <div class="admin-save-dock" role="region" aria-label="站点配置保存">
        <span>修改后点击保存，公开页面刷新后立即生效</span>
        <button type="button" class="case-admin-primary" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存并生效' }}</button>
      </div>
    </template>
  </section>
</template>
