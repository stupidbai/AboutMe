<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { importedKnowledgeEntries } from '../../../data/importedKnowledge'

const categories = ['全部', '技术博客', '效率工具', 'AI 软件', '安全工具']
const activeCategory = ref('全部')
const query = ref('')

const filteredEntries = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return importedKnowledgeEntries.filter((entry) => {
    const categoryMatched = activeCategory.value === '全部' || entry.category === activeCategory.value
    const searchable = [entry.title, entry.description, entry.category, entry.originalAuthor].join(' ').toLowerCase()
    return categoryMatched && (!keyword || searchable.includes(keyword))
  })
})
</script>

<template>
  <section class="archive-library">
    <div class="archive-hero">
      <div>
        <span>ARCH3RPRO ARCHIVE · 2025</span>
        <h2>历史知识归档</h2>
        <p>14 篇本人原创文章完整迁移，3 篇转载资料转为保留作者与来源记录的本地摘要页。</p>
      </div>
      <dl>
        <div><dt>17</dt><dd>知识条目</dd></div>
        <div><dt>63</dt><dd>本地资源</dd></div>
      </dl>
    </div>

    <div class="knowledge-toolbar archive-toolbar">
      <label>
        <span>搜索历史归档</span>
        <input v-model="query" type="search" placeholder="例如：VitePress、Mac、CherryStudio" />
      </label>
      <div class="knowledge-filters" aria-label="归档分类">
        <button
          v-for="category in categories"
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
      <span>源提交 acf58fa03821</span>
    </div>

    <div class="archive-grid">
      <a v-for="entry in filteredEntries" :key="entry.id" class="archive-card" :href="withBase(entry.route)">
        <div class="archive-card__meta">
          <span>{{ entry.category }}</span>
          <span :class="{ reference: entry.isReference }">{{ entry.isReference ? '引用页' : '本人原创' }}</span>
        </div>
        <h3>{{ entry.title }}</h3>
        <p>{{ entry.description }}</p>
        <footer><time>{{ entry.date || '日期未标注' }}</time><span>阅读全文 →</span></footer>
      </a>
    </div>
  </section>
</template>
