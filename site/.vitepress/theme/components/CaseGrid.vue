<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { cases } from '../../../data/cases'

const storageKey = 'bai-yunfei-case-nas-links-v1'

const filters = [
  { key: 'all', label: '全部案例' },
  { key: 'delivery', label: '产品与工程' },
  { key: 'community', label: '社群与人才' },
  { key: 'ecosystem', label: '渠道与生态' }
]

const selected = ref('all')
const configOpen = ref(false)
const browserLinks = ref<Record<string, string>>({})
const draftLinks = ref<Record<string, string>>({})
const configError = ref('')
const configMessage = ref('')
const groupMap: Record<string, string[]> = {
  delivery: ['01', '02', '03', '04', '07'],
  community: ['05', '06'],
  ecosystem: ['08', '09']
}

const resolvedCases = computed(() => cases.map(item => ({
  ...item,
  nasUrl: Object.prototype.hasOwnProperty.call(browserLinks.value, item.id)
    ? browserLinks.value[item.id].trim()
    : item.nasUrl
})))

const visibleCases = computed(() => selected.value === 'all'
  ? resolvedCases.value
  : resolvedCases.value.filter(item => groupMap[selected.value].includes(item.id)))

const configuredCount = computed(() => resolvedCases.value.filter(item => item.nasUrl).length)

const createDraft = () => Object.fromEntries(
  resolvedCases.value.map(item => [item.id, item.nasUrl])
)

const isValidNasUrl = (value: string) => {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const openConfig = () => {
  draftLinks.value = createDraft()
  configError.value = ''
  configMessage.value = ''
  configOpen.value = true
}

const saveConfig = () => {
  const normalized = Object.fromEntries(
    cases.map(item => [item.id, (draftLinks.value[item.id] || '').trim()])
  )
  const invalidCase = cases.find(item => !isValidNasUrl(normalized[item.id]))
  if (invalidCase) {
    configError.value = `案例 ${invalidCase.id} 的地址无效，请填写完整的 http:// 或 https:// 地址。`
    configMessage.value = ''
    return
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized))
  } catch {
    configError.value = '当前浏览器无法保存配置，请检查隐私模式或存储权限。'
    configMessage.value = ''
    return
  }
  browserLinks.value = normalized
  configError.value = ''
  configMessage.value = `已保存，当前共有 ${Object.values(normalized).filter(Boolean).length} 个 NAS 链接可用。`
}

const restoreDefaults = () => {
  window.localStorage.removeItem(storageKey)
  browserLinks.value = {}
  draftLinks.value = Object.fromEntries(cases.map(item => [item.id, item.nasUrl]))
  configError.value = ''
  configMessage.value = '已恢复项目文件中的默认链接。'
}

onMounted(() => {
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) return
    const parsed = JSON.parse(saved) as Record<string, unknown>
    browserLinks.value = Object.fromEntries(
      cases
        .filter(item => typeof parsed[item.id] === 'string')
        .map(item => [item.id, String(parsed[item.id]).trim()])
    )
  } catch {
    window.localStorage.removeItem(storageKey)
  }
})
</script>

<template>
  <div>
    <div class="case-toolbar">
      <div class="case-filters" role="group" aria-label="案例筛选">
        <button v-for="filter in filters" :key="filter.key" type="button" :class="{ active: selected === filter.key }" @click="selected = filter.key">
          {{ filter.label }}
        </button>
      </div>
      <button
        type="button"
        class="case-config-toggle"
        :aria-expanded="configOpen"
        aria-controls="case-link-config"
        @click="configOpen ? configOpen = false : openConfig()"
      >
        配置 NAS 链接
        <span>{{ configuredCount }}/{{ cases.length }}</span>
      </button>
    </div>

    <form v-if="configOpen" id="case-link-config" class="case-config-panel" @submit.prevent="saveConfig">
      <div class="case-config-panel__head">
        <div>
          <span>WEB CONFIG</span>
          <h2>案例 NAS 链接配置</h2>
          <p>填写后保存，案例卡片会立即变为可点击状态。网页配置仅保存在当前浏览器。</p>
        </div>
        <button type="button" class="case-config-close" aria-label="关闭 NAS 链接配置" @click="configOpen = false">×</button>
      </div>

      <div class="case-config-grid">
        <label v-for="item in cases" :key="item.id">
          <span><strong>{{ item.id }}</strong>{{ item.title }}</span>
          <input
            v-model="draftLinks[item.id]"
            type="url"
            inputmode="url"
            autocomplete="url"
            :placeholder="`https://NAS地址/案例-${item.id}`"
          >
        </label>
      </div>

      <p class="case-config-note">需要让所有访问者使用统一地址时，请将同一配置写入项目的 <code>config/case-links.json</code> 后重新发布。</p>
      <p v-if="configError" class="case-config-feedback case-config-feedback--error" role="alert">{{ configError }}</p>
      <p v-if="configMessage" class="case-config-feedback" role="status">{{ configMessage }}</p>
      <div class="case-config-actions">
        <button type="submit" class="case-config-save">保存网页配置</button>
        <button type="button" class="case-config-reset" @click="restoreDefaults">恢复文件默认值</button>
      </div>
    </form>

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
