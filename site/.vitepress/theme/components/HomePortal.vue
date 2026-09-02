<script setup lang="ts">
import { withBase } from 'vitepress'
import { focusAreas, metrics, portalRoutes } from '../../../data/portal'
</script>

<template>
  <div class="home-portal">
    <section class="portal-hero">
      <div class="portal-hero__copy">
        <p class="portal-kicker">CIO · ENTERPRISE AI · TRUSTED DIGITALIZATION</p>
        <h1>把复杂业务、技术与资源，<span>组织成可以落地的结果。</span></h1>
        <p class="portal-lead">
          我是白云飞，现任上海莲证科技有限公司 CIO。这里不是一张需要连续下滑的介绍，
          而是一份可以按目的进入的个人知识与合作地图。
        </p>
        <div class="portal-actions">
          <a class="portal-button portal-button--primary" :href="withBase('/cases')">查看项目案例</a>
          <a class="portal-button" :href="withBase('/contact')">发起合作沟通</a>
        </div>
      </div>
      <aside class="identity-panel">
        <span class="identity-panel__label">CURRENT ROLE</span>
        <strong>白云飞</strong>
        <p>上海莲证科技 CIO<br>解决方案架构师 · AI 生态建设者</p>
        <dl>
          <div><dt>聚焦</dt><dd>公证系统、可信数字化、企业 AI</dd></div>
          <div><dt>能力</dt><dd>产品架构、研发交付、团队与生态</dd></div>
          <div><dt>城市</dt><dd>上海 / 徐州</dd></div>
        </dl>
      </aside>
    </section>

    <section class="metric-grid" aria-label="核心数据">
      <article v-for="metric in metrics" :key="metric.label">
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.label }}</span>
      </article>
    </section>

    <section class="portal-section">
      <header class="portal-section__head">
        <div><p class="portal-kicker">DIRECTORY / 目录</p><h2>按你的目的，进入对应版块</h2></div>
        <p>每个版块都是独立页面，支持站内搜索、右侧目录和直接分享。</p>
      </header>
      <div class="route-grid">
        <a v-for="route in portalRoutes" :key="route.code" class="route-card" :class="`route-card--${route.accent}`" :href="withBase(route.link)">
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
        <div><p class="portal-kicker">FOCUS MAP</p><h2>四条长期工作主线</h2></div>
        <p>从业务理解，到能力组织，再到工程交付和生态复制。</p>
      </header>
      <div class="focus-grid">
        <article v-for="focus in focusAreas" :key="focus.code">
          <span>{{ focus.code }}</span><h3>{{ focus.title }}</h3><p>{{ focus.description }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
