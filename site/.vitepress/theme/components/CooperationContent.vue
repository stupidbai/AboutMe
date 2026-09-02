<script setup lang="ts">
import { onMounted } from 'vue'
import { portalHref, useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
onMounted(load)
</script>

<template>
  <div>
    <h1>{{ config.cooperation.title }}</h1>
    <p>{{ config.cooperation.description }}</p>

    <h2>哪些阶段适合开始合作</h2>
    <div class="cooperation-grid">
      <article v-for="stage in config.cooperation.stages" :key="stage.code">
        <span>{{ stage.code }}</span><h3>{{ stage.title }}</h3><p>{{ stage.description }}</p>
      </article>
    </div>

    <h2>优先合作方向</h2>
    <section v-for="direction in config.cooperation.directions" :key="direction.title" class="cooperation-direction">
      <h3>{{ direction.title }}</h3>
      <p>{{ direction.description }}</p>
      <ul><li v-for="item in direction.items" :key="item">{{ item }}</li></ul>
    </section>

    <h2>建立合作确定性</h2>
    <div class="process-grid">
      <article v-for="item in config.cooperation.process" :key="item.title"><h3>{{ item.title }}</h3><p>{{ item.description }}</p></article>
    </div>

    <p><a :href="portalHref('/contact')">带着一个具体问题开始沟通 →</a></p>
  </div>
</template>
