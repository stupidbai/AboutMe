<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'
import { useCommunityAuth } from '../useCommunityAuth'

const { state, refresh, setUser } = useCommunityAuth()
const mode = ref<'login' | 'register'>('login')
const busy = ref(false)
const error = ref('')
const message = ref('')
const form = reactive({ identity: '', username: '', displayName: '', email: '', password: '', confirmPassword: '', acceptedTerms: false, website: '' })
const profile = reactive({ displayName: '', bio: '' })
const passwords = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const title = computed(() => mode.value === 'login' ? '登录社区账号' : '注册社区账号')

onMounted(async () => { await refresh(); profile.displayName = state.user?.displayName || ''; profile.bio = state.user?.bio || '' })
const readError = async (response: Response) => { try { return (await response.json()).error || `请求失败（${response.status}）` } catch { return `请求失败（${response.status}）` } }

const submit = async () => {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const endpoint = mode.value === 'login' ? '/api/auth/login' : '/api/auth/register'
    const payload = mode.value === 'login'
      ? { identity: form.identity, password: form.password }
      : { username: form.username, displayName: form.displayName, email: form.email, password: form.password, confirmPassword: form.confirmPassword, acceptedTerms: form.acceptedTerms, website: form.website }
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) { error.value = await readError(response); return }
    const result = await response.json()
    setUser(result.user); profile.displayName = result.user.displayName; profile.bio = result.user.bio || ''; form.password = ''; form.confirmPassword = ''
    message.value = mode.value === 'login' ? '登录成功，现在可以评论和发帖。' : '注册成功，已自动登录。'
  } catch { error.value = '无法连接社区服务，请确认已通过 Node 或 Docker 启动。' }
  finally { busy.value = false }
}
const logout = async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
  setUser(null); mode.value = 'login'; message.value = '已安全退出。'
}
const saveProfile = async () => {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const response = await fetch('/api/auth/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
    if (!response.ok) { error.value = await readError(response); return }
    const payload = await response.json(); setUser(payload.user); message.value = '个人资料已更新。'
  } finally { busy.value = false }
}
const changePassword = async () => {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const response = await fetch('/api/auth/password', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(passwords) })
    if (!response.ok) { error.value = await readError(response); return }
    passwords.currentPassword = ''; passwords.newPassword = ''; passwords.confirmPassword = ''; message.value = '密码已更新，其他设备会话已退出。'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="community-account">
    <div v-if="state.loading" class="community-empty">正在读取账号状态…</div>
    <div v-else-if="!state.available" class="community-empty">当前为静态预览，注册与登录需要通过 Node 或 Docker 服务访问。</div>
    <template v-else-if="!state.user">
      <header class="community-heading"><div><span>COMMUNITY ACCOUNT</span><h2>{{ title }}</h2><p>访客可浏览公开内容；注册用户可以评论知识文章、点赞互动并参与论坛讨论。</p></div></header>
      <div class="community-tabs"><button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button><button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button></div>
      <form class="community-form" @submit.prevent="submit">
        <label v-if="mode === 'login'"><span>用户名或邮箱</span><input v-model="form.identity" autocomplete="username" required maxlength="120"></label>
        <template v-else>
          <label><span>用户名</span><input v-model="form.username" autocomplete="username" required minlength="3" maxlength="24" placeholder="字母、数字、下划线"></label>
          <label><span>显示名称</span><input v-model="form.displayName" required maxlength="30"></label>
          <label class="wide"><span>邮箱</span><input v-model="form.email" type="email" autocomplete="email" required maxlength="120"></label>
          <label class="community-honeypot" aria-hidden="true"><span>网站</span><input v-model="form.website" tabindex="-1" autocomplete="off"></label>
          <label class="wide community-consent"><input v-model="form.acceptedTerms" type="checkbox" required><span>我同意遵守社区规则，不发布违法、侵权、广告或攻击性内容。</span></label>
        </template>
        <label :class="{ wide: mode === 'login' }"><span>密码</span><input v-model="form.password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"></label>
        <label v-if="mode === 'register'"><span>确认密码</span><input v-model="form.confirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>
        <button class="community-primary wide" :disabled="busy">{{ busy ? '请稍候…' : (mode === 'login' ? '登录' : '注册并登录') }}</button>
      </form>
    </template>
    <template v-else>
      <header class="community-heading"><div><span>MY ACCOUNT</span><h2>{{ state.user.displayName }}</h2><p>@{{ state.user.username }} · {{ state.user.role === 'moderator' ? '社区版主' : '注册用户' }}</p></div><button class="community-quiet" @click="logout">退出登录</button></header>
      <div class="account-grid">
        <form class="community-panel community-form" @submit.prevent="saveProfile"><h3 class="wide">个人资料</h3><label class="wide"><span>显示名称</span><input v-model="profile.displayName" required maxlength="40"></label><label class="wide"><span>个人简介</span><textarea v-model="profile.bio" maxlength="240" rows="3"></textarea></label><label class="wide"><span>邮箱</span><input :value="state.user.email" disabled></label><button class="community-primary wide" :disabled="busy">保存资料</button></form>
        <form class="community-panel community-form" @submit.prevent="changePassword"><h3 class="wide">修改密码</h3><label class="wide"><span>当前密码</span><input v-model="passwords.currentPassword" type="password" required></label><label><span>新密码</span><input v-model="passwords.newPassword" type="password" required minlength="8"></label><label><span>确认新密码</span><input v-model="passwords.confirmPassword" type="password" required minlength="8"></label><button class="community-primary wide" :disabled="busy">更新密码</button></form>
      </div>
      <div class="community-account__actions"><a :href="withBase('/forum')">进入交流论坛 →</a><a :href="withBase('/knowledge')">浏览知识库 →</a></div>
    </template>
    <p v-if="error" class="case-admin-feedback case-admin-feedback--error" role="alert">{{ error }}</p><p v-if="message" class="case-admin-feedback">{{ message }}</p>
  </section>
</template>
