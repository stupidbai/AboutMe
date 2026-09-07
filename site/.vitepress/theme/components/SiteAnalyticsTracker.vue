<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

type EventName = 'page_view' | 'page_engaged' | 'contact_intent' | 'case_open' | 'forum_open' | 'rag_query' | 'account_open' | 'knowledge_open'

const route = useRoute()
let currentPagePath = ''
let engaged = false
let engagementTimer = 0
let engagementSent = false

const eventId = () => typeof crypto?.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}-portal`

const deviceType = () => {
  const ua = navigator.userAgent || ''
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet'
  if (/mobi|android|iphone|ipod/i.test(ua)) return 'mobile'
  return /windows|macintosh|linux|cros/i.test(ua) ? 'desktop' : 'other'
}

const trackedPath = () => {
  const path = window.location.pathname || route.path || '/'
  return path.startsWith('/admin/') || path.startsWith('/api/') ? '' : path
}

const acquisition = () => {
  const params = new URLSearchParams(window.location.search)
  return { referrer: document.referrer || '', utmSource: params.get('utm_source') || '' }
}

const performanceMetrics = () => {
  const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const paint = window.performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')
  return {
    loadMs: navigation ? Math.round(navigation.loadEventEnd || 0) : 0,
    ttfbMs: navigation ? Math.round(Math.max(0, navigation.responseStart - navigation.requestStart)) : 0,
    fcpMs: paint ? Math.round(paint.startTime) : 0
  }
}

const send = (eventName: EventName, options: { beacon?: boolean; includePerformance?: boolean } = {}) => {
  const pagePath = currentPagePath || trackedPath()
  if (!pagePath || pagePath.startsWith('/admin/')) return
  const isInitialView = eventName === 'page_view' && !sessionStorage.getItem('portal_analytics_referrer_sent')
  const payload = {
    eventId: eventId(), eventName, pagePath, deviceType: deviceType(),
    ...(isInitialView ? acquisition() : {}),
    ...(options.includePerformance ? performanceMetrics() : {})
  }
  if (isInitialView) sessionStorage.setItem('portal_analytics_referrer_sent', '1')
  const body = JSON.stringify(payload)
  if (options.beacon && navigator.sendBeacon?.('/api/telemetry', new Blob([body], { type: 'application/json' }))) return
  void fetch('/api/telemetry', {
    method: 'POST', credentials: 'same-origin', keepalive: options.beacon,
    headers: { 'content-type': 'application/json', accept: 'application/json' }, body
  }).catch(() => undefined)
}

const finishPage = () => {
  if (currentPagePath && engaged && !engagementSent) {
    send('page_engaged', { beacon: true })
    engagementSent = true
  }
  window.clearTimeout(engagementTimer)
}

const startPage = () => {
  currentPagePath = trackedPath()
  engaged = false
  engagementSent = false
  if (!currentPagePath) return
  send('page_view', { includePerformance: true })
  if (currentPagePath === '/forum') send('forum_open')
  else if (currentPagePath === '/account') send('account_open')
  else if (currentPagePath === '/knowledge' || currentPagePath.startsWith('/kb/') || currentPagePath === '/knowledge/item') send('knowledge_open')
  engagementTimer = window.setTimeout(() => { engaged = true }, 15_000)
}

const onSignal = (event: Event) => {
  const detail = (event as CustomEvent<{ eventName?: EventName }>).detail
  if (detail?.eventName) send(detail.eventName)
}

const onClick = (event: MouseEvent) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-analytics-event]')
  const eventName = target?.dataset.analyticsEvent as EventName | undefined
  if (eventName) send(eventName)
}

onMounted(() => {
  startPage()
  window.addEventListener('pagehide', finishPage)
  window.addEventListener('portal:analytics', onSignal as EventListener)
  document.addEventListener('click', onClick)
})

watch(() => route.path, () => {
  if (!currentPagePath) return
  finishPage()
  startPage()
})

onBeforeUnmount(() => {
  finishPage()
  window.removeEventListener('pagehide', finishPage)
  window.removeEventListener('portal:analytics', onSignal as EventListener)
  document.removeEventListener('click', onClick)
})
</script>

<template><span class="site-analytics-tracker" aria-hidden="true" /></template>
