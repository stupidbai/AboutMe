<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'
import { communityFetch, useCommunityAuth } from '../useCommunityAuth'

interface Category { id: string; name: string; description: string; postCount: number }
interface Author { id: string; username: string; displayName: string; role: string }
interface Post { id: string; categoryId: string; categoryName: string; title: string; excerpt: string; bodyHtml?: string; status: string; pinned: boolean; featured: boolean; viewCount: number; replyCount: number; likeCount: number; viewerLiked: boolean; createdAt: string; lastActivityAt: string; author: Author | null }
interface Reply { id: string; parentId: string; bodyHtml: string; status: string; likeCount: number; viewerLiked: boolean; createdAt: string; author: Author | null }
const { state, refresh } = useCommunityAuth()
const categories = ref<Category[]>([]); const posts = ref<Post[]>([]); const selected = ref<Post | null>(null); const replies = ref<Reply[]>([])
const filter = reactive({ category: '', q: '' }); const draft = reactive({ categoryId: 'ai', title: '', body: '' }); const reply = ref(''); const showComposer = ref(false)
const busy = ref(''); const error = ref(''); const available = ref(true)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.pageSize)))
const resultLabel = computed(() => filter.q ? `“${filter.q}”的讨论结果` : filter.category ? categories.value.find(item => item.id === filter.category)?.name || '板块讨论' : '最新讨论')
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const readError = async (response: Response) => { try { return (await response.json()).error || `请求失败（${response.status}）` } catch { return `请求失败（${response.status}）` } }
const loadPosts = async () => {
  const params = new URLSearchParams({ page: String(pagination.page) }); if (filter.category) params.set('category', filter.category); if (filter.q.trim()) params.set('q', filter.q.trim())
  try { const response = await fetch(`/api/forum/posts?${params}`, { credentials: 'same-origin' }); if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(); const payload = await response.json(); posts.value = payload.posts; Object.assign(pagination, { page: payload.page, pageSize: payload.pageSize, total: payload.total }); available.value = true } catch { available.value = false }
}
const loadCategories = async () => { const response = await fetch('/api/forum/categories'); if (!response.ok) throw new Error(); categories.value = await response.json(); if (!categories.value.some(item => item.id === draft.categoryId)) draft.categoryId = categories.value[0]?.id || '' }
onMounted(async () => {
  await refresh()
  try {
    await Promise.all([loadCategories(), loadPosts()])
    const initialPost = new URLSearchParams(location.search).get('post')
    if (/^[a-f0-9]{24}$/.test(initialPost || '')) await openPost(initialPost!)
  } catch { available.value = false }
})
const openPost = async (id: string) => { error.value = ''; const response = await fetch(`/api/forum/posts/${id}`, { credentials: 'same-origin' }); if (!response.ok) { error.value = await readError(response); return }; const payload = await response.json(); selected.value = payload.post; replies.value = payload.replies; history.replaceState(null, '', `${withBase('/forum')}?post=${id}`); scrollTo({ top: 0, behavior: 'smooth' }) }
const closePost = () => { selected.value = null; replies.value = []; history.replaceState(null, '', withBase('/forum')) }
const changePage = async (page: number) => { pagination.page = Math.max(1, Math.min(page, totalPages.value)); await loadPosts(); scrollTo({ top: 0, behavior: 'smooth' }) }
const createPost = async () => { busy.value = 'post'; error.value = ''; try { const response = await communityFetch('/api/forum/posts', { method: 'POST', body: JSON.stringify(draft) }); if (!response.ok) { error.value = await readError(response); return }; const post = await response.json(); draft.title = ''; draft.body = ''; showComposer.value = false; await loadCategories(); await loadPosts(); await openPost(post.id) } finally { busy.value = '' } }
const sendReply = async () => { if (!selected.value) return; busy.value = 'reply'; error.value = ''; try { const response = await communityFetch(`/api/forum/posts/${selected.value.id}/replies`, { method: 'POST', body: JSON.stringify({ body: reply.value }) }); if (!response.ok) { error.value = await readError(response); return }; reply.value = ''; await openPost(selected.value.id) } finally { busy.value = '' } }
const like = async (type: 'posts' | 'replies', item: Post | Reply) => { if (!state.user) return; const response = await communityFetch(`/api/forum/${type}/${item.id}/like`, { method: 'POST' }); if (response.ok) Object.assign(item, await response.json()) }
const remove = async (type: 'posts' | 'replies', item: Post | Reply) => { if (!confirm('确认删除该内容？')) return; const response = await communityFetch(`/api/forum/${type}/${item.id}`, { method: 'DELETE' }); if (!response.ok) { error.value = await readError(response); return }; if (type === 'posts') { closePost(); await loadPosts() } else if (selected.value) await openPost(selected.value.id) }
</script>

<template>
  <section class="forum-board">
    <div v-if="!available" class="community-empty">当前为静态预览，论坛需要通过 Node 或 Docker 服务访问。</div>
    <template v-else-if="selected">
      <button class="forum-back" @click="closePost">← 返回讨论列表</button>
      <article class="forum-topic"><div class="forum-topic__meta"><span>{{ selected.categoryName }} <b v-if="selected.pinned">置顶</b> <b v-if="selected.featured">精选</b></span><span>{{ selected.viewCount }} 浏览 · {{ selected.replyCount }} 回复</span></div><h1>{{ selected.title }}</h1><p class="forum-author">{{ selected.author?.displayName || '站点发起' }} · {{ formatDate(selected.createdAt) }}</p><div class="community-rendered" v-html="selected.bodyHtml"></div><footer><button :class="{ active: selected.viewerLiked }" :disabled="!state.user" @click="like('posts', selected)">赞 {{ selected.likeCount }}</button><button v-if="state.user && (state.user.id === selected.author?.id || state.user.role === 'moderator')" @click="remove('posts', selected)">删除</button></footer></article>
      <div class="forum-replies"><h2>全部回复</h2><article v-for="item in replies" :key="item.id" class="forum-reply"><header><strong>{{ item.author?.displayName || '已注销用户' }}</strong><span>{{ formatDate(item.createdAt) }}</span></header><p v-if="item.status === 'deleted'" class="comment-deleted">这条回复已删除</p><div v-else class="community-rendered" v-html="item.bodyHtml"></div><footer v-if="item.status !== 'deleted'"><button :class="{ active: item.viewerLiked }" :disabled="!state.user" @click="like('replies', item)">赞 {{ item.likeCount }}</button><button v-if="state.user && (state.user.id === item.author?.id || state.user.role === 'moderator')" @click="remove('replies', item)">删除</button></footer></article><div v-if="!replies.length" class="community-empty">还没有回复。</div></div>
      <form v-if="state.user && selected.status === 'active'" class="comment-form" @submit.prevent="sendReply"><textarea v-model="reply" rows="4" required minlength="2" maxlength="5000" placeholder="参与讨论…"></textarea><button class="community-primary" :disabled="busy === 'reply'">发表回复</button></form><p v-else-if="!state.user" class="community-signin"><a :href="withBase('/account')">登录或注册</a>后参与讨论。</p>
    </template>
    <template v-else>
      <header class="forum-hero"><div><span>OPEN DISCUSSION</span><h1>交流论坛</h1><p>围绕企业 AI、工程实践、商业合作与生态连接展开长期讨论。</p></div><button v-if="state.user" class="community-primary" @click="showComposer = !showComposer">{{ showComposer ? '收起' : '发布新讨论' }}</button><a v-else :href="withBase('/account')">登录 / 注册</a></header>
      <form v-if="showComposer && state.user" class="community-panel community-form forum-composer" @submit.prevent="createPost"><label><span>板块</span><select v-model="draft.categoryId"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label><label><span>标题</span><input v-model="draft.title" required minlength="4" maxlength="100"></label><label class="wide"><span>正文（支持 Markdown）</span><textarea v-model="draft.body" rows="7" required minlength="10" maxlength="20000"></textarea></label><button class="community-primary wide" :disabled="busy === 'post'">发布讨论</button></form>
      <div class="forum-categories"><button :class="{ active: !filter.category }" @click="filter.category = ''; pagination.page = 1; loadPosts()"><strong>全部</strong><span>{{ pagination.total }} 条讨论</span></button><button v-for="category in categories" :key="category.id" :class="{ active: filter.category === category.id }" @click="filter.category = category.id; pagination.page = 1; loadPosts()"><strong>{{ category.name }}</strong><span>{{ category.postCount }} 篇 · {{ category.description }}</span></button></div>
      <form class="forum-search" @submit.prevent="pagination.page = 1; loadPosts()"><input v-model="filter.q" maxlength="100" placeholder="搜索标题与正文"><button>搜索</button></form>
      <h2 class="forum-result-title">{{ resultLabel }}</h2><div class="forum-post-list"><button v-for="post in posts" :key="post.id" class="forum-post" @click="openPost(post.id)"><div><span>{{ post.categoryName }} <b v-if="post.pinned">置顶</b> <b v-if="post.featured">精选</b></span><h3>{{ post.title }}</h3><p>{{ post.excerpt }}</p><small>{{ post.author?.displayName || '站点发起' }} · {{ formatDate(post.lastActivityAt) }}</small></div><dl><div><dt>{{ post.replyCount }}</dt><dd>回复</dd></div><div><dt>{{ post.viewCount }}</dt><dd>浏览</dd></div></dl></button><div v-if="!posts.length" class="community-empty">暂时没有匹配的讨论。</div></div>
      <nav v-if="totalPages > 1" class="forum-pagination" aria-label="讨论分页"><button :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">上一页</button><span>第 {{ pagination.page }} / {{ totalPages }} 页</span><button :disabled="pagination.page >= totalPages" @click="changePage(pagination.page + 1)">下一页</button></nav>
    </template>
    <p v-if="error" class="case-admin-feedback case-admin-feedback--error">{{ error }}</p>
  </section>
</template>
