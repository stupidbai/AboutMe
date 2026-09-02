<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { knowledgeEntries as fallbackEntries, type KnowledgeEntry } from '../../../data/knowledge'

const entries = ref<KnowledgeEntry[]>(fallbackEntries.map(entry => ({ ...entry, takeaways: [...entry.takeaways] })))
const activeCategory = ref('全部')
const query = ref('')
const knowledgeCategories = computed(() => ['全部', ...new Set(entries.value.map(entry => entry.category))])

const filteredEntries = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return entries.value.filter((entry) => {
    const categoryMatched = activeCategory.value === '全部' || entry.category === activeCategory.value
    const searchable = [entry.title, entry.summary, entry.category, entry.stage, ...entry.takeaways].join(' ').toLowerCase()
    return categoryMatched && (!keyword || searchable.includes(keyword))
  })
})

onMounted(async () => {
  try {
    const response = await fetch('/api/knowledge', { headers: { accept: 'application/json' } })
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) entries.value = await response.json()
  } catch {
    // Static deployments keep using the validated build-time knowledge snapshot.
  }
})
</script>

<template>
  <div class="knowledge-library">
    <div class="knowledge-toolbar">
      <label>
        <span>搜索知识条目</span>
        <input v-model="query" type="search" placeholder="例如：RAG、Agent、FDE、证据链" />
      </label>
      <div class="knowledge-filters" aria-label="知识分类">
        <button
          v-for="category in knowledgeCategories"
          :key="category"
          type="button"
          :class="{ active: activeCategory === category }"
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>
    </div>

    <div class="knowledge-summary">
      <span>{{ filteredEntries.length }} 条结果</span>
      <span>原创整理 · 持续更新</span>
    </div>

    <div v-if="filteredEntries.length" class="knowledge-grid">
      <article v-for="entry in filteredEntries" :id="entry.id" :key="entry.id" class="knowledge-card">
        <div class="knowledge-card__meta">
          <span>{{ entry.category }}</span>
          <span>{{ entry.stage }}</span>
        </div>
        <h2>{{ entry.title }}</h2>
        <p>{{ entry.summary }}</p>
        <ul>
          <li v-for="takeaway in entry.takeaways" :key="takeaway">{{ takeaway }}</li>
        </ul>
        <details class="knowledge-card__body"><summary>展开正文</summary><p>{{ entry.body }}</p></details>
        <footer><span>{{ entry.id.toUpperCase() }}</span><time>{{ entry.updated }}</time></footer>
      </article>
    </div>
    <p v-else class="knowledge-empty">没有匹配条目，请更换关键词或分类。</p>
  </div>
</template>
