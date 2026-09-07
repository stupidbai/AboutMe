<script setup lang="ts">
import { onMounted } from 'vue'
import { withBase } from 'vitepress'
import { useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
onMounted(load)
</script>

<template>
  <div class="timeline-list">
    <article
      v-for="item in config.timeline"
      :key="`${item.period}-${item.organization}`"
      class="timeline-card"
      :class="{ 'timeline-card--current': item.current, 'timeline-card--appointment': item.type === 'appointment' }"
    >
      <time>{{ item.period }}</time>
      <div class="timeline-card__main">
        <div class="timeline-card__copy">
          <span v-if="item.current" class="current-badge">CURRENT</span>
          <span v-else-if="item.type === 'appointment'" class="appointment-badge">INDUSTRY APPOINTMENT</span>
          <h3>{{ item.organization }}</h3>
          <strong>{{ item.role }}</strong>
          <p>{{ item.description }}</p>
        </div>
        <figure v-if="item.image" class="timeline-card__proof">
          <img :src="withBase(item.image)" :alt="item.imageAlt || `${item.organization}${item.role}凭证`" loading="lazy">
          <figcaption>任职凭证</figcaption>
        </figure>
      </div>
    </article>
  </div>
</template>
