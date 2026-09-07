<script setup lang="ts">
import { withBase } from 'vitepress'
import { contentChannels, outdoorPhotos } from '../../../data/life'
</script>

<template>
  <div class="life-sections">
    <div class="photo-grid">
      <figure v-for="photo in outdoorPhotos" :key="photo.src">
        <img :src="withBase(photo.src)" :alt="photo.alt" loading="lazy" width="900" height="600">
        <figcaption>{{ photo.caption }}</figcaption>
      </figure>
    </div>
    <div class="channel-grid">
      <article v-for="channel in contentChannels" :key="channel.title">
        <img :src="withBase(channel.src)" :alt="channel.alt" loading="lazy" width="520" height="620">
        <h3>{{ channel.title }}</h3><p>{{ channel.description }}</p>
      </article>
    </div>
  </div>
</template>
