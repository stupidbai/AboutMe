<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import ArticleComments from './ArticleComments.vue'
import { knowledgeEntries as fallbackEntries, type KnowledgeEntry } from '../../../data/knowledge'

const entry = ref<KnowledgeEntry | null>(null)
const loading = ref(true)
const entryId = ref('')

onMounted(async () => {
  entryId.value = new URLSearchParams(location.search).get('id') || ''
  let entries = fallbackEntries
  try {
    const response = await fetch('/api/knowledge', { headers: { accept: 'application/json' } })
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) entries = await response.json()
  } catch {}
  entry.value = entries.find(item => item.id === entryId.value) || null
  loading.value = false
})
</script>

<template>
  <div v-if="loading" class="community-empty">正在读取知识条目…</div>
  <div v-else-if="!entry" class="community-empty">未找到该知识条目。<a :href="withBase('/knowledge')">返回知识库</a></div>
  <template v-else>
    <article class="knowledge-detail">
      <a class="forum-back" :href="withBase('/knowledge')">← 返回知识库</a>
      <div class="knowledge-card__meta"><span>{{ entry.category }}</span><span>{{ entry.stage }}</span></div>
      <h1>{{ entry.title }}</h1>
      <p class="knowledge-detail__lead">{{ entry.summary }}</p>
      <div class="knowledge-detail__body">{{ entry.body }}</div>
      <section><h2>关键要点</h2><ul><li v-for="takeaway in entry.takeaways" :key="takeaway">{{ takeaway }}</li></ul></section>
      <footer><span>{{ entry.id.toUpperCase() }}</span><time>{{ entry.updated }}</time></footer>
    </article>
    <ArticleComments :article-path="`/knowledge/item/${entry.id}`" />
  </template>
</template>
