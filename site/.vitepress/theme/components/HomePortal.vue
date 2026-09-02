<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { portalHref, useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
const visibleRoutes = computed(() => config.value.routes.filter(route => route.enabled))
onMounted(load)
</script>

<template>
  <div class="home-portal">
    <section class="portal-hero">
      <div class="portal-hero__copy">
        <p class="portal-kicker">{{ config.home.kicker }}</p>
        <h1>{{ config.home.title }}<span>{{ config.home.highlight }}</span></h1>
        <p class="portal-lead">{{ config.home.lead }}</p>
        <div class="portal-actions">
          <a class="portal-button portal-button--primary" :href="portalHref(config.home.primaryAction.link)">{{ config.home.primaryAction.label }}</a>
          <a class="portal-button" :href="portalHref(config.home.secondaryAction.link)">{{ config.home.secondaryAction.label }}</a>
        </div>
      </div>
      <aside class="identity-panel">
        <span class="identity-panel__label">CURRENT ROLE</span>
        <strong>{{ config.identity.name }}</strong>
        <p>{{ config.identity.currentRole }}<br>{{ config.identity.subtitle }}</p>
        <dl>
          <div><dt>聚焦</dt><dd>{{ config.identity.focus }}</dd></div>
          <div><dt>能力</dt><dd>{{ config.identity.capabilities }}</dd></div>
          <div><dt>城市</dt><dd>{{ config.identity.city }}</dd></div>
        </dl>
      </aside>
    </section>

    <section class="metric-grid" aria-label="核心数据">
      <article v-for="metric in config.metrics" :key="metric.label">
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.label }}</span>
      </article>
    </section>

    <section class="portal-section">
      <header class="portal-section__head">
        <div><p class="portal-kicker">DIRECTORY / 目录</p><h2>{{ config.home.directoryTitle }}</h2></div>
        <p>{{ config.home.directoryDescription }}</p>
      </header>
      <div class="route-grid">
        <a v-for="route in visibleRoutes" :key="route.code" class="route-card" :class="`route-card--${route.accent}`" :href="portalHref(route.link)">
          <span class="route-card__code">{{ route.code }}</span>
          <span class="route-card__arrow" aria-hidden="true">↗</span>
          <h3>{{ route.title }}</h3>
          <p>{{ route.description }}</p>
          <div class="tag-row"><span v-for="tag in route.tags" :key="tag">{{ tag }}</span></div>
        </a>
      </div>
    </section>

    <section class="portal-section portal-section--focus">
      <header class="portal-section__head">
        <div><p class="portal-kicker">FOCUS MAP</p><h2>{{ config.home.focusTitle }}</h2></div>
        <p>{{ config.home.focusDescription }}</p>
      </header>
      <div class="focus-grid">
        <article v-for="focus in config.focusAreas" :key="focus.code">
          <span>{{ focus.code }}</span><h3>{{ focus.title }}</h3><p>{{ focus.description }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
