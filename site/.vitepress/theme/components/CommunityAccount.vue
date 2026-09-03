<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import { adjacencyGraphs, dictionary } from '@zxcvbn-ts/language-common'
import { translations } from '@zxcvbn-ts/language-en'
import { communityFetch, useCommunityAuth } from '../useCommunityAuth'

type Mode = 'login' | 'register' | 'forgot' | 'reset'
const zxcvbn = new ZxcvbnFactory({ dictionary, graphs: adjacencyGraphs, translations })
const { state, refresh, setUser } = useCommunityAuth()
const mode = ref<Mode>('login')
const busy = ref(false)
const error = ref('')
const message = ref('')
const settings = reactive({ registrationEnabled: true, requireEmailVerification: false, turnstileEnabled: false, turnstileSiteKey: '' })
const form = reactive({ identity: '', username: '', displayName: '', email: '', password: '', confirmPassword: '', acceptedTerms: false, website: '', turnstileToken: '' })
const profile = reactive({ displayName: '', bio: '' })
const passwords = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const resetToken = ref('')
const title = computed(() => ({ login: '登录社区账号', register: '注册社区账号', forgot: '找回密码', reset: '设置新密码' })[mode.value])
const strength = computed(() => {
  const password = mode.value === 'register' ? form.password : passwords.newPassword
  if (!password) return { score: 0, label: '请输入至少 12 个字符', warning: '' }
  const result = zxcvbn.check(password, [form.username, form.displayName, form.email].filter(Boolean))
  return { score: result.score, label: ['很弱', '较弱', '一般', '良好', '很强'][result.score], warning: result.feedback.warning || result.feedback.suggestions[0] || '' }
})

const readError = async (response: Response) => { try { return (await response.json()).error || `请求失败（${response.status}）` } catch { return `请求失败（${response.status}）` } }
const renderTurnstile = async () => {
  if (!settings.turnstileEnabled || mode.value !== 'register') return
  await nextTick()
  const target = document.querySelector('#community-turnstile') as HTMLElement | null
  if (!target || target.dataset.rendered) return
  const execute = () => {
    const widget = (window as any).turnstile
    if (!widget || target.dataset.rendered) return
    widget.render(target, { sitekey: settings.turnstileSiteKey, callback: (token: string) => { form.turnstileToken = token }, 'expired-callback': () => { form.turnstileToken = '' } })
    target.dataset.rendered = 'true'
  }
  if ((window as any).turnstile) { execute(); return }
  const script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async = true; script.defer = true; script.onload = execute
  document.head.appendChild(script)
}

watch(mode, renderTurnstile)
onMounted(async () => {
  await refresh()
  profile.displayName = state.user?.displayName || ''; profile.bio = state.user?.bio || ''
  try { Object.assign(settings, await (await fetch('/api/community/status')).json()) } catch {}
  const params = new URLSearchParams(location.search)
  resetToken.value = params.get('reset') || ''
  const verifyToken = params.get('verify') || ''
  if (resetToken.value) mode.value = 'reset'
  if (verifyToken) {
    busy.value = true
    try {
      const response = await communityFetch('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verifyToken }) })
      if (!response.ok) error.value = await readError(response)
      else { const result = await response.json(); setUser(result.user); message.value = '邮箱验证完成，已自动登录。'; history.replaceState(null, '', withBase('/account')) }
    } finally { busy.value = false }
  }
  await renderTurnstile()
})

const submit = async () => {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const endpoint = mode.value === 'login' ? '/api/auth/login' : '/api/auth/register'
    const payload = mode.value === 'login'
      ? { identity: form.identity, password: form.password }
      : { username: form.username, displayName: form.displayName, email: form.email, password: form.password, confirmPassword: form.confirmPassword, acceptedTerms: form.acceptedTerms, website: form.website, turnstileToken: form.turnstileToken }
    const response = await communityFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) })
    if (!response.ok) { error.value = await readError(response); return }
    const result = await response.json()
    if (result.requiresEmailVerification) { mode.value = 'login'; form.identity = form.email; message.value = result.message; return }
    setUser(result.user); profile.displayName = result.user.displayName; profile.bio = result.user.bio || ''; form.password = ''; form.confirmPassword = ''
    message.value = mode.value === 'login' ? '登录成功，现在可以评论和发帖。' : '注册成功，已自动登录。'
  } catch { error.value = '无法连接社区服务，请确认已通过 Node 或 Docker 启动。' }
  finally { busy.value = false }
}
const requestReset = async () => { error.value = ''; busy.value = true; try { const response = await communityFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identity: form.identity }) }); if (!response.ok) error.value = await readError(response); else message.value = (await response.json()).message } finally { busy.value = false } }
const resendVerification = async () => { error.value = ''; busy.value = true; try { const response = await communityFetch('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ identity: form.identity }) }); if (!response.ok) error.value = await readError(response); else message.value = (await response.json()).message } finally { busy.value = false } }
const resetPassword = async () => { error.value = ''; busy.value = true; try { const response = await communityFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken.value, password: passwords.newPassword, confirmPassword: passwords.confirmPassword }) }); if (!response.ok) error.value = await readError(response); else { message.value = (await response.json()).message; mode.value = 'login'; history.replaceState(null, '', withBase('/account')); passwords.newPassword = ''; passwords.confirmPassword = '' } } finally { busy.value = false } }
const logout = async () => { await communityFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); mode.value = 'login'; message.value = '已安全退出。' }
const saveProfile = async () => { error.value = ''; message.value = ''; busy.value = true; try { const response = await communityFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify(profile) }); if (!response.ok) { error.value = await readError(response); return }; const payload = await response.json(); setUser(payload.user); message.value = '个人资料已更新。' } finally { busy.value = false } }
const changePassword = async () => { error.value = ''; message.value = ''; busy.value = true; try { const response = await communityFetch('/api/auth/password', { method: 'PUT', body: JSON.stringify(passwords) }); if (!response.ok) { error.value = await readError(response); return }; passwords.currentPassword = ''; passwords.newPassword = ''; passwords.confirmPassword = ''; message.value = '密码已更新，其他设备会话已退出。' } finally { busy.value = false } }
</script>

<template>
  <section class="community-account">
    <div v-if="state.loading" class="community-empty">正在读取账号状态…</div>
    <div v-else-if="!state.available" class="community-empty">当前为静态预览，注册与登录需要通过 Node 或 Docker 服务访问。</div>
    <template v-else-if="!state.user">
      <header class="community-heading"><div><span>COMMUNITY ACCOUNT</span><h2>{{ title }}</h2><p>访客可浏览公开内容；注册用户可以评论知识文章、点赞互动并参与论坛讨论。</p></div></header>
      <div v-if="mode === 'login' || mode === 'register'" class="community-tabs"><button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button><button v-if="settings.registrationEnabled" :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button></div>
      <form v-if="mode === 'login' || mode === 'register'" class="community-form" @submit.prevent="submit">
        <label v-if="mode === 'login'"><span>用户名或邮箱</span><input v-model="form.identity" autocomplete="username" required maxlength="254"></label>
        <template v-else>
          <label><span>用户名</span><input v-model="form.username" autocomplete="username" required minlength="3" maxlength="24" placeholder="中文、字母或数字"></label>
          <label><span>显示名称</span><input v-model="form.displayName" required maxlength="40"></label>
          <label class="wide"><span>邮箱</span><input v-model="form.email" type="email" autocomplete="email" required maxlength="254"></label>
          <label class="community-honeypot" aria-hidden="true"><span>网站</span><input v-model="form.website" tabindex="-1" autocomplete="off"></label>
          <label class="wide community-consent"><input v-model="form.acceptedTerms" type="checkbox" required><span>我同意<a :href="withBase('/terms')">服务条款</a>、<a :href="withBase('/privacy')">隐私说明</a>与<a :href="withBase('/community-guidelines')">社区规则</a>。</span></label>
        </template>
        <label :class="{ wide: mode === 'login' }"><span>密码</span><input v-model="form.password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required :minlength="mode === 'login' ? 1 : 12" maxlength="128"></label>
        <label v-if="mode === 'register'"><span>确认密码</span><input v-model="form.confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label>
        <div v-if="mode === 'register'" class="password-strength wide"><span>密码强度：{{ strength.label }}</span><progress :value="strength.score + 1" max="5"></progress><small>{{ strength.warning || '建议使用长且独特的密码短语。' }}</small></div>
        <div v-if="mode === 'register' && settings.turnstileEnabled" id="community-turnstile" class="wide"></div>
        <button class="community-primary wide" :disabled="busy">{{ busy ? '请稍候…' : (mode === 'login' ? '登录' : (settings.requireEmailVerification ? '注册并验证邮箱' : '注册并登录')) }}</button>
        <button v-if="mode === 'login'" type="button" class="community-quiet wide" @click="mode = 'forgot'">忘记密码？</button>
        <button v-if="mode === 'login' && settings.requireEmailVerification" type="button" class="community-quiet wide" @click="resendVerification">未收到验证邮件？重新发送</button>
      </form>
      <form v-else-if="mode === 'forgot'" class="community-form" @submit.prevent="requestReset"><label class="wide"><span>用户名或邮箱</span><input v-model="form.identity" required maxlength="254"></label><button class="community-primary wide" :disabled="busy">发送重置邮件</button><button type="button" class="community-quiet wide" @click="mode = 'login'">返回登录</button></form>
      <form v-else class="community-form" @submit.prevent="resetPassword"><label><span>新密码</span><input v-model="passwords.newPassword" type="password" required minlength="12" maxlength="128"></label><label><span>确认新密码</span><input v-model="passwords.confirmPassword" type="password" required minlength="12" maxlength="128"></label><div class="password-strength wide"><span>密码强度：{{ strength.label }}</span><progress :value="strength.score + 1" max="5"></progress><small>{{ strength.warning || '建议使用长且独特的密码短语。' }}</small></div><button class="community-primary wide" :disabled="busy">重置密码</button></form>
    </template>
    <template v-else>
      <header class="community-heading"><div><span>MY ACCOUNT</span><h2>{{ state.user.displayName }}</h2><p>@{{ state.user.username }} · {{ state.user.role === 'moderator' ? '社区版主' : '注册用户' }}</p></div><button class="community-quiet" @click="logout">退出登录</button></header>
      <div class="account-grid">
        <form class="community-panel community-form" @submit.prevent="saveProfile"><h3 class="wide">个人资料</h3><label class="wide"><span>显示名称</span><input v-model="profile.displayName" required maxlength="40"></label><label class="wide"><span>个人简介</span><textarea v-model="profile.bio" maxlength="240" rows="3"></textarea></label><label class="wide"><span>邮箱</span><input :value="state.user.email" disabled></label><button class="community-primary wide" :disabled="busy">保存资料</button></form>
        <form class="community-panel community-form" @submit.prevent="changePassword"><h3 class="wide">修改密码</h3><label class="wide"><span>当前密码</span><input v-model="passwords.currentPassword" type="password" required></label><label><span>新密码</span><input v-model="passwords.newPassword" type="password" required minlength="12" maxlength="128"></label><label><span>确认新密码</span><input v-model="passwords.confirmPassword" type="password" required minlength="12" maxlength="128"></label><div class="password-strength wide"><span>密码强度：{{ strength.label }}</span><progress :value="strength.score + 1" max="5"></progress></div><button class="community-primary wide" :disabled="busy">更新密码</button></form>
      </div>
      <div class="community-account__actions"><a :href="withBase('/forum')">进入交流论坛 →</a><a :href="withBase('/knowledge')">浏览知识库 →</a></div>
    </template>
    <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p><p v-if="message" class="case-admin-feedback">{{ message }}</p>
  </section>
</template>
