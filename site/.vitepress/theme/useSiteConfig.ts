import { ref } from 'vue'
import { withBase } from 'vitepress'
import { defaultSiteConfig, type SiteConfig } from '../../data/siteConfig'

const cloneDefault = (): SiteConfig => JSON.parse(JSON.stringify(defaultSiteConfig))
const config = ref<SiteConfig>(cloneDefault())
let loadPromise: Promise<void> | undefined

export const portalHref = (value: string) => value.startsWith('/') ? withBase(value) : value

export const useSiteConfig = () => {
  const load = () => {
    if (typeof window === 'undefined') return Promise.resolve()
    if (!loadPromise) {
      loadPromise = fetch('/api/site-config', { headers: { accept: 'application/json' } })
        .then(async response => {
          if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
            config.value = await response.json() as SiteConfig
          }
        })
        .catch(() => undefined)
        .then(() => undefined)
    }
    return loadPromise
  }
  return { config, load }
}
