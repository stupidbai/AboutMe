<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { cases } from '../../../data/cases'

const filters = [
  { key: 'all', label: '全部案例' },
  { key: 'delivery', label: '产品与工程' },
  { key: 'community', label: '社群与人才' },
  { key: 'ecosystem', label: '渠道与生态' }
]

const selected = ref('all')
const groupMap: Record<string, string[]> = {
  delivery: ['01', '02', '03', '04', '07'],
  community: ['05', '06'],
  ecosystem: ['08', '09']
}

const visibleCases = computed(() => selected.value === 'all'
  ? cases
  : cases.filter(item => groupMap[selected.value].includes(item.id)))
</script>

<template>
  <div>
    <div class="case-filters" role="group" aria-label="案例筛选">
      <button v-for="filter in filters" :key="filter.key" type="button" :class="{ active: selected === filter.key }" @click="selected = filter.key">
        {{ filter.label }}
      </button>
    </div>
    <div class="case-grid">
      <component
        :is="item.nasUrl ? 'a' : 'article'"
        v-for="item in visibleCases"
        :key="item.id"
        class="case-card"
        :class="{ 'case-card--linked': item.nasUrl, 'case-card--pending': !item.nasUrl }"
        :href="item.nasUrl || undefined"
        :target="item.nasUrl ? '_blank' : undefined"
        :rel="item.nasUrl ? 'noopener noreferrer' : undefined"
        :aria-label="item.nasUrl ? `${item.title}：打开 NAS 资料` : undefined"
        :data-nas-link="item.nasUrl ? 'configured' : 'pending'"
      >
        <div class="case-card__media" :class="{ 'case-card__media--contain': item.contain }">
          <div v-if="item.partners" class="partner-grid" aria-label="合作伙伴">
            <div v-for="partner in item.partners" :key="partner.name">
              <img :src="withBase(partner.logo)" :alt="`${partner.name}标识`" loading="lazy" width="72" height="42">
              <span>{{ partner.name }}</span>
            </div>
          </div>
          <img v-else :src="withBase(item.image)" :alt="item.imageAlt" loading="lazy" width="720" height="450">
          <span class="case-card__index">{{ item.id }}</span>
        </div>
        <div class="case-card__body">
          <span class="case-card__kicker">{{ item.kicker }}</span>
          <h2>{{ item.title }}</h2>
          <p>{{ item.description }}</p>
          <div v-if="item.outcome" class="case-outcome"><strong>{{ item.outcome }}</strong><span>{{ item.outcomeLabel }}</span></div>
          <div class="tag-row"><span v-for="tag in item.tags" :key="tag">{{ tag }}</span></div>
          <div class="case-card__link">
            <span>{{ item.nasUrl ? '查看 NAS 项目资料' : 'NAS 链接待配置' }}</span>
            <span aria-hidden="true">{{ item.nasUrl ? '↗' : '—' }}</span>
          </div>
        </div>
      </component>
    </div>
  </div>
</template>
