<script setup lang="ts">
import { onMounted } from 'vue'
import { useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
onMounted(load)
</script>

<template>
  <div class="timeline-list">
    <article v-for="item in config.timeline" :key="`${item.period}-${item.organization}`" class="timeline-card" :class="{ 'timeline-card--current': item.current }">
      <time>{{ item.period }}</time>
      <div>
        <span v-if="item.current" class="current-badge">CURRENT</span>
        <h3>{{ item.organization }}</h3>
        <strong>{{ item.role }}</strong>
        <p>{{ item.description }}</p>
      </div>
    </article>
  </div>
</template>
