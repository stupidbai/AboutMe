<script setup lang="ts">
import { insights } from '../../../data/portal'
</script>

<template>
  <div class="insight-grid">
    <a v-for="item in insights" :key="item.code" class="insight-card" :href="`#${item.anchor}`">
      <span class="insight-card__code">{{ item.code }}</span>
      <h2>{{ item.title }}</h2>
      <p>{{ item.description }}</p>
      <div class="tag-row"><span v-for="topic in item.topics" :key="topic">{{ topic }}</span></div>
    </a>
  </div>
</template>
