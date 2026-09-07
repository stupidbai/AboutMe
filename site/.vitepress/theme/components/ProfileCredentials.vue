<script setup lang="ts">
import { onMounted } from 'vue'
import { withBase } from 'vitepress'
import { useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
onMounted(load)
</script>

<template>
  <div class="credential-grid">
    <article v-for="item in config.credentials" :key="`${item.organization}-${item.title}`" class="credential-card" :class="{ 'credential-card--proof': item.image }">
      <div class="credential-card__copy">
        <span>{{ item.period }}</span>
        <h3>{{ item.title }}</h3>
        <strong>{{ item.organization }}</strong>
        <p>{{ item.description }}</p>
      </div>
      <figure v-if="item.image" class="credential-card__image">
        <img :src="withBase(item.image)" :alt="item.imageAlt || `${item.organization} ${item.title}`">
        <figcaption>{{ item.imageAlt || `${item.organization} ${item.title}` }}</figcaption>
      </figure>
    </article>
  </div>
</template>
