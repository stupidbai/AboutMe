import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import { useData } from 'vitepress'
import HomePortal from './components/HomePortal.vue'
import ProfileTimeline from './components/ProfileTimeline.vue'
import CaseGrid from './components/CaseGrid.vue'
import InsightGrid from './components/InsightGrid.vue'
import LifeGallery from './components/LifeGallery.vue'
import ContactPanel from './components/ContactPanel.vue'
import './styles.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    const { frontmatter } = useData()
    return h('div', { class: frontmatter.value.layoutClass || undefined }, [h(DefaultTheme.Layout)])
  },
  enhanceApp({ app }) {
    app.component('HomePortal', HomePortal)
    app.component('ProfileTimeline', ProfileTimeline)
    app.component('CaseGrid', CaseGrid)
    app.component('InsightGrid', InsightGrid)
    app.component('LifeGallery', LifeGallery)
    app.component('ContactPanel', ContactPanel)
  }
} satisfies Theme
