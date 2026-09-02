import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import { useData } from 'vitepress'
import HomePortal from './components/HomePortal.vue'
import ProfileTimeline from './components/ProfileTimeline.vue'
import CaseGrid from './components/CaseGrid.vue'
import CaseAdmin from './components/CaseAdmin.vue'
import SiteAdmin from './components/SiteAdmin.vue'
import CooperationContent from './components/CooperationContent.vue'
import InsightGrid from './components/InsightGrid.vue'
import LifeGallery from './components/LifeGallery.vue'
import ContactPanel from './components/ContactPanel.vue'
import KnowledgeLibrary from './components/KnowledgeLibrary.vue'
import ImportedKnowledge from './components/ImportedKnowledge.vue'
import RagAssistant from './components/RagAssistant.vue'
import KnowledgeAdmin from './components/KnowledgeAdmin.vue'
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
    app.component('CaseAdmin', CaseAdmin)
    app.component('SiteAdmin', SiteAdmin)
    app.component('CooperationContent', CooperationContent)
    app.component('InsightGrid', InsightGrid)
    app.component('LifeGallery', LifeGallery)
    app.component('ContactPanel', ContactPanel)
    app.component('KnowledgeLibrary', KnowledgeLibrary)
    app.component('ImportedKnowledge', ImportedKnowledge)
    app.component('RagAssistant', RagAssistant)
    app.component('KnowledgeAdmin', KnowledgeAdmin)
  }
} satisfies Theme
