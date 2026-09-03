<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, withBase } from 'vitepress'
import { communityFetch, useCommunityAuth } from '../useCommunityAuth'

interface CommentItem { id: string; parentId: string; bodyHtml: string; status: string; createdAt: string; likeCount: number; viewerLiked: boolean; author: null | { id: string; username: string; displayName: string; role: string } }
const route = useRoute()
const props = defineProps<{ articlePath?: string }>()
const { state, refresh } = useCommunityAuth()
const comments = ref<CommentItem[]>([])
const body = ref('')
const parentId = ref('')
const busy = ref(false)
const error = ref('')
const available = ref(true)
const resolvedArticlePath = () => props.articlePath || route.path.replace(/\.html$/, '').replace(/\/$/, '')
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const readError = async (response: Response) => { try { return (await response.json()).error || `请求失败（${response.status}）` } catch { return `请求失败（${response.status}）` } }
const load = async () => {
  error.value = ''
  try {
    const response = await fetch(`/api/comments?article=${encodeURIComponent(resolvedArticlePath())}`, { credentials: 'same-origin' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { available.value = false; return }
    comments.value = (await response.json()).comments; available.value = true
  } catch { available.value = false }
}
onMounted(async () => { await Promise.all([refresh(), load()]) })
watch(() => [route.path, props.articlePath], load)
const submit = async () => {
  if (!state.user) return
  busy.value = true; error.value = ''
  try {
    const response = await communityFetch('/api/comments', { method: 'POST', body: JSON.stringify({ articlePath: resolvedArticlePath(), parentId: parentId.value, body: body.value }) })
    if (!response.ok) { error.value = await readError(response); return }
    body.value = ''; parentId.value = ''; await load()
  } finally { busy.value = false }
}
const like = async (item: CommentItem) => {
  if (!state.user) return
  const response = await communityFetch(`/api/comments/${item.id}/like`, { method: 'POST' })
  if (response.ok) Object.assign(item, await response.json())
}
const remove = async (item: CommentItem) => {
  if (!confirm('确认删除这条评论？')) return
  const response = await communityFetch(`/api/comments/${item.id}`, { method: 'DELETE' })
  if (response.ok) await load(); else error.value = await readError(response)
}
</script>

<template>
  <section v-if="available" class="article-comments">
    <header class="community-heading"><div><span>DISCUSSION</span><h2>文章讨论</h2><p>{{ comments.filter(item => item.status === 'active').length }} 条评论 · 支持 Markdown，内容会经过安全过滤。</p></div></header>
    <div v-if="comments.length" class="comment-list">
      <article v-for="item in comments" :key="item.id" class="comment-item" :class="{ reply: item.parentId }">
        <template v-if="item.status === 'deleted'"><p class="comment-deleted">这条评论已删除</p></template>
        <template v-else><header><strong>{{ item.author?.displayName || '已注销用户' }}</strong><span>@{{ item.author?.username || 'deleted' }} · {{ formatDate(item.createdAt) }}</span></header><div class="community-rendered" v-html="item.bodyHtml"></div><footer><button :class="{ active: item.viewerLiked }" :disabled="!state.user" @click="like(item)">赞 {{ item.likeCount }}</button><button v-if="state.user" @click="parentId = item.id">回复</button><button v-if="state.user && (state.user.id === item.author?.id || state.user.role === 'moderator')" @click="remove(item)">删除</button></footer></template>
      </article>
    </div>
    <div v-else class="community-empty">还没有评论，欢迎留下第一条有价值的讨论。</div>
    <form v-if="state.user" class="comment-form" @submit.prevent="submit"><div v-if="parentId" class="reply-target">正在回复一条评论 <button type="button" @click="parentId = ''">取消</button></div><textarea v-model="body" required minlength="2" maxlength="2000" rows="4" placeholder="分享补充、疑问或实践经验…"></textarea><button class="community-primary" :disabled="busy">{{ busy ? '提交中…' : '发表评论' }}</button></form>
    <p v-else class="community-signin">访客可以阅读评论。<a :href="withBase('/account')">注册或登录</a>后即可参与讨论。</p>
    <p v-if="error" class="case-admin-feedback case-admin-feedback--error">{{ error }}</p>
  </section>
</template>
