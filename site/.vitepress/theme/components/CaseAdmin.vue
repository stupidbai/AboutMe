<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { CaseItem } from '../../../data/cases'
import { withBase } from 'vitepress'

type AdminCase = CaseItem & { tagText: string; partnerText: string }
type ViewState = 'loading' | 'login' | 'ready' | 'unavailable'

const state = ref<ViewState>('loading')
const username = ref('admin')
const password = ref('')
const cases = ref<AdminCase[]>([])
const busy = ref(false)
const error = ref('')
const message = ref('')
const pendingDeleteId = ref('')
const revision = ref('')

const configuredCount = computed(() => cases.value.filter(item => item.nasUrl.trim()).length)
const revisionNumber = computed(() => revision.value.match(/cases-(\d+)/)?.[1] || '—')

const toAdminCase = (item: CaseItem): AdminCase => ({
  ...item,
  tags: [...item.tags],
  partners: item.partners?.map(partner => ({ ...partner })),
  tagText: item.tags.join('、'),
  partnerText: item.partners?.map(partner => `${partner.name}|${partner.logo}`).join('\n') || ''
})

const readError = async (response: Response) => {
  try {
    const payload = await response.json()
    return payload.error || `请求失败（${response.status}）`
  } catch {
    return `请求失败（${response.status}）`
  }
}

const loadCases = async () => {
  state.value = 'loading'
  error.value = ''
  try {
    const response = await fetch('/api/admin/cases', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (response.status === 401) {
      state.value = 'login'
      return
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      state.value = 'unavailable'
      return
    }
    const payload = await response.json() as CaseItem[]
    revision.value = response.headers.get('etag') || ''
    if (!revision.value) {
      state.value = 'unavailable'
      return
    }
    cases.value = payload.map(toAdminCase)
    state.value = 'ready'
  } catch {
    state.value = 'unavailable'
  }
}

const login = async () => {
  busy.value = true
  error.value = ''
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: username.value, password: password.value })
    })
    password.value = ''
    if (!response.ok) {
      error.value = await readError(response)
      return
    }
    await loadCases()
  } catch {
    error.value = '无法连接管理服务，请确认已运行 npm run admin。'
  } finally {
    busy.value = false
  }
}

const validate = () => {
  const ids = new Set<string>()
  for (const item of cases.value) {
    if (!item.id.trim() || ids.has(item.id.trim())) return `案例编号 ${item.id || '空'} 无效或重复。`
    ids.add(item.id.trim())
    if (!item.title.trim()) return `案例 ${item.id} 缺少标题。`
    if (!item.kicker.trim()) return `案例 ${item.id} 缺少分类说明。`
    if (!item.description.trim()) return `案例 ${item.id} 缺少案例介绍。`
    if (!item.image.trim()) return `案例 ${item.id} 缺少图片路径。`
    const invalidPartner = item.partnerText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      .find(line => !line.includes('|') || line.split('|').some(part => !part.trim()))
    if (invalidPartner) return `案例 ${item.id} 的合作伙伴格式无效，请使用“名称|Logo路径”。`
    if (item.nasUrl.trim()) {
      try {
        const parsed = new URL(item.nasUrl.trim())
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol')
      } catch {
        return `案例 ${item.id} 的 NAS 地址必须使用 http:// 或 https://。`
      }
    }
  }
  return ''
}

const saveCases = async () => {
  error.value = validate()
  message.value = ''
  if (error.value) return
  busy.value = true
  const payload = cases.value.map(({ tagText, partnerText, ...item }) => ({
    ...item,
    id: item.id.trim(),
    title: item.title.trim(),
    kicker: item.kicker.trim(),
    description: item.description.trim(),
    image: item.image.trim(),
    imageAlt: item.imageAlt.trim(),
    nasUrl: item.nasUrl.trim(),
    tags: tagText.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean),
    partners: partnerText.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const separator = line.indexOf('|')
      return { name: line.slice(0, separator).trim(), logo: line.slice(separator + 1).trim() }
    })
  }))
  try {
    const response = await fetch('/api/admin/cases', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'if-match': revision.value },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
    if (response.status === 401) {
      state.value = 'login'
      error.value = '登录已过期，请重新登录。'
      return
    }
    if (response.status === 409 || response.status === 428) {
      error.value = `${await readError(response)} 当前编辑内容尚未覆盖服务器数据。`
      return
    }
    if (!response.ok) {
      error.value = await readError(response)
      return
    }
    const saved = await response.json() as CaseItem[]
    revision.value = response.headers.get('etag') || revision.value
    cases.value = saved.map(toAdminCase)
    message.value = `已保存 ${saved.length} 个案例，其中 ${saved.filter(item => item.nasUrl).length} 个已配置 NAS 链接。`
    pendingDeleteId.value = ''
  } catch {
    error.value = '保存失败，请检查管理服务连接。'
  } finally {
    busy.value = false
  }
}

const addCase = () => {
  const nextNumber = cases.value.reduce((max, item) => Math.max(max, Number.parseInt(item.id, 10) || 0), 0) + 1
  cases.value.push({
    id: String(nextNumber).padStart(2, '0'),
    category: 'delivery',
    title: '新案例',
    kicker: '案例分类 · 负责角色',
    description: '请填写案例背景、承担职责、实施方法与交付结果。',
    image: '',
    imageAlt: '',
    tags: [],
    tagText: '',
    partnerText: '',
    nasUrl: '',
    contain: false
  })
  message.value = '已新增草稿，请完善内容后保存。'
  error.value = ''
}

const deleteCase = (id: string) => {
  if (pendingDeleteId.value !== id) {
    pendingDeleteId.value = id
    message.value = `再次点击案例 ${id} 的删除按钮以确认。`
    return
  }
  cases.value = cases.value.filter(item => item.id !== id)
  pendingDeleteId.value = ''
  message.value = `案例 ${id} 已从草稿中移除，点击“保存全部修改”后生效。`
}

const moveCase = (index: number, offset: number) => {
  const target = index + offset
  if (target < 0 || target >= cases.value.length) return
  const reordered = [...cases.value]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  cases.value = reordered
}

const logout = async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
  cases.value = []
  revision.value = ''
  state.value = 'login'
  message.value = ''
  error.value = ''
}

onMounted(loadCases)
</script>

<template>
  <section class="case-admin">
    <header class="case-admin__hero">
      <div>
        <span>PRIVATE ADMIN</span>
        <h1>案例配置管理</h1>
        <p>此页面通过服务端账号验证。公开案例页只能查看，无法新增、修改或删除配置。</p>
      </div>
      <a :href="withBase('/cases')" target="_blank" rel="noopener">查看公开案例页 ↗</a>
    </header>

    <div v-if="state === 'loading'" class="case-admin-state">正在连接管理服务…</div>

    <div v-else-if="state === 'unavailable'" class="case-admin-state case-admin-state--warning">
      <h2>管理服务未启动</h2>
      <p>请在项目目录运行 <code>npm run admin</code>，再刷新此页面。普通静态预览不提供写入权限。</p>
      <button type="button" @click="loadCases">重新连接</button>
    </div>

    <form v-else-if="state === 'login'" class="case-admin-login" @submit.prevent="login">
      <h2>管理员登录</h2>
      <p>账号和密码只发送给当前站点的管理服务，不写入网页代码。</p>
      <label><span>账号</span><input v-model="username" name="username" autocomplete="username" required></label>
      <label><span>密码</span><input v-model="password" name="password" type="password" autocomplete="current-password" required></label>
      <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="busy">{{ busy ? '登录中…' : '登录管理后台' }}</button>
    </form>

    <template v-else>
      <div class="case-admin-toolbar">
        <div><strong>{{ cases.length }}</strong> 个案例 · <strong>{{ configuredCount }}</strong> 个 NAS 链接 · SQLite r{{ revisionNumber }}</div>
        <div>
          <button type="button" class="case-admin-secondary" @click="addCase">新增案例</button>
          <button type="button" class="case-admin-primary" :disabled="busy" @click="saveCases">{{ busy ? '保存中…' : '保存全部修改' }}</button>
          <button type="button" class="case-admin-ghost" @click="logout">退出登录</button>
        </div>
      </div>

      <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p>
      <p v-if="message" class="case-admin-feedback" role="status">{{ message }}</p>

      <div class="case-admin-list">
        <article v-for="(item, index) in cases" :key="item.id" class="case-admin-card">
          <header>
            <div><span>{{ item.id }}</span><strong>{{ item.title || '未命名案例' }}</strong></div>
            <div class="case-admin-card__actions">
              <button type="button" :disabled="index === 0" aria-label="上移案例" @click="moveCase(index, -1)">↑</button>
              <button type="button" :disabled="index === cases.length - 1" aria-label="下移案例" @click="moveCase(index, 1)">↓</button>
              <button type="button" class="danger" @click="deleteCase(item.id)">{{ pendingDeleteId === item.id ? '确认删除' : '删除' }}</button>
            </div>
          </header>

          <div class="case-admin-fields">
            <label><span>案例编号</span><input v-model="item.id" maxlength="8" required></label>
            <label><span>案例分类</span><select v-model="item.category"><option value="delivery">产品与工程</option><option value="community">社群与人才</option><option value="ecosystem">渠道与生态</option></select></label>
            <label class="wide"><span>案例标题</span><input v-model="item.title" required></label>
            <label class="wide"><span>分类说明 / 负责角色</span><input v-model="item.kicker" required></label>
            <label class="wide"><span>案例介绍</span><textarea v-model="item.description" rows="3" required></textarea></label>
            <label class="wide"><span>NAS 链接</span><input v-model="item.nasUrl" type="url" placeholder="https://NAS地址/项目资料"></label>
            <label><span>图片路径</span><input v-model="item.image" placeholder="/assets/cases/example.jpg" required></label>
            <label><span>图片说明</span><input v-model="item.imageAlt"></label>
            <label class="wide"><span>标签（用顿号或逗号分隔）</span><input v-model="item.tagText" placeholder="知识工程、RAG、全栈交付"></label>
            <label class="wide"><span>合作伙伴（每行：名称|Logo 路径）</span><textarea v-model="item.partnerText" rows="2" placeholder="华为|/assets/cases/partners/huawei.svg"></textarea></label>
            <label><span>结果数值</span><input v-model="item.outcome" placeholder="50%+"></label>
            <label><span>结果说明</span><input v-model="item.outcomeLabel"></label>
            <label class="case-admin-check"><input v-model="item.contain" type="checkbox"><span>图片完整显示，不裁切</span></label>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
