<script setup lang="ts">
import { timeline } from '../../../data/portal'
</script>

<template>
  <div class="timeline-list">
    <article v-for="item in timeline" :key="item.period" class="timeline-card" :class="{ 'timeline-card--current': item.current }">
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
