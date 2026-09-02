<script setup lang="ts">
import { withBase } from 'vitepress'
</script>

<template>
  <section class="contact-panel">
    <div>
      <span class="portal-kicker">START A CONVERSATION</span>
      <h2>如果你有真实场景或互补资源，我们可以聊一聊</h2>
      <p>首次联系时请简单说明面向的客户或行业、当前问题、已有资源、期望结果，以及希望我参与的角色。</p>
      <dl>
        <div><dt>电话</dt><dd><a href="tel:17327057075">17327057075</a></dd></div>
        <div><dt>邮箱</dt><dd><a href="mailto:616169394@qq.com">616169394@qq.com</a></dd></div>
        <div><dt>城市</dt><dd>上海 / 徐州</dd></div>
        <div><dt>公众号</dt><dd>白哥非白</dd></div>
      </dl>
    </div>
    <aside>
      <img :src="withBase('/assets/wechat-qr.png')" alt="白云飞微信联系二维码" width="620" height="620">
      <strong>微信扫码联系</strong>
      <span>添加时请备注合作方向或业务场景</span>
    </aside>
  </section>
</template>
