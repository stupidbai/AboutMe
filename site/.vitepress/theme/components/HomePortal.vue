<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { portalHref, useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
const visibleRoutes = computed(() => config.value.routes.filter(route => route.enabled))
const actionEvent = (link: string) => link === '/cases' ? 'case_open' : link === '/contact' ? 'contact_intent' : undefined
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
          <a class="portal-button portal-button--primary" :href="portalHref(config.home.primaryAction.link)" :data-analytics-event="actionEvent(config.home.primaryAction.link)">{{ config.home.primaryAction.label }}</a>
          <a class="portal-button" :href="portalHref(config.home.secondaryAction.link)" :data-analytics-event="actionEvent(config.home.secondaryAction.link)">{{ config.home.secondaryAction.label }}</a>
        </div>
        <p class="portal-action-note">先看可验证的案例，再用一个具体场景开启合作沟通。</p>
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
        <a v-for="route in visibleRoutes" :key="route.code" class="route-card" :class="`route-card--${route.accent}`" :href="portalHref(route.link)" :data-analytics-event="actionEvent(route.link)">
          <span class="route-card__code">{{ route.code }}</span>
          <span class="route-card__arrow" aria-hidden="true">↗</span>
          <h3>{{ route.title }}</h3>
          <p>{{ route.description }}</p>
          <div class="tag-row"><span v-for="tag in route.tags" :key="tag">{{ tag }}</span></div>
        </a>
      </div>
    </section>

    <section class="collaboration-path" aria-label="合作路径与直接联系方式">
      <header>
        <div><p class="portal-kicker">START HERE</p><h2>从一个明确的下一步开始。</h2></div>
        <p>无论从哪里来到本站，都可以先选择最贴近当前需求的路径；如需直接沟通，可通过电话、邮箱或微信联系。</p>
      </header>
      <div class="collaboration-path__grid">
        <a :href="portalHref('/cases')" data-analytics-event="case_open"><span>01 · 看证明</span><strong>我想先看案例</strong><p>从知识工程、研发效能、工业 AI 到生态连接，快速确认可协同的能力边界。</p><b>查看合作案例 →</b></a>
        <a :href="portalHref('/contact')" data-analytics-event="contact_intent"><span>02 · 说场景</span><strong>我有一个业务问题</strong><p>说明行业、当前问题、已有资源和目标结果，直接进入合作沟通。</p><b>发起合作沟通 →</b></a>
        <a :href="portalHref('/cooperation')"><span>03 · 对路径</span><strong>我需要资源协同</strong><p>了解企业 AI、可信数字化、FDE 与生态合作如何组织为联合方案。</p><b>查看合作方式 →</b></a>
      </div>
      <p class="collaboration-path__contact">直接联系：<a :href="`tel:${config.contact.phone}`" data-analytics-event="contact_intent">{{ config.contact.phone }}</a><span> · </span><a :href="`mailto:${config.contact.email}`" data-analytics-event="contact_intent">{{ config.contact.email }}</a><span> · 上海 / 徐州可跨区域合作</span></p>
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
