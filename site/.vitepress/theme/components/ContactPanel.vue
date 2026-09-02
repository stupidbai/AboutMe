<script setup lang="ts">
import { onMounted } from 'vue'
import { portalHref, useSiteConfig } from '../useSiteConfig'

const { config, load } = useSiteConfig()
onMounted(load)
</script>

<template>
  <section class="contact-panel">
    <div>
      <span class="portal-kicker">START A CONVERSATION</span>
      <h2>{{ config.contact.title }}</h2>
      <p>{{ config.contact.description }}</p>
      <dl>
        <div><dt>电话</dt><dd><a :href="`tel:${config.contact.phone}`">{{ config.contact.phone }}</a></dd></div>
        <div><dt>邮箱</dt><dd><a :href="`mailto:${config.contact.email}`">{{ config.contact.email }}</a></dd></div>
        <div><dt>城市</dt><dd>{{ config.contact.city }}</dd></div>
        <div><dt>公众号</dt><dd>{{ config.contact.publicAccount }}</dd></div>
      </dl>
    </div>
    <aside>
      <img :src="portalHref(config.contact.wechatQr)" :alt="`${config.identity.name}微信联系二维码`" width="620" height="620">
      <strong>{{ config.contact.wechatLabel }}</strong>
      <span>{{ config.contact.wechatHint }}</span>
    </aside>
  </section>
</template>
