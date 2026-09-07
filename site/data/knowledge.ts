import rawEntries from '../../config/knowledge.json'

export interface KnowledgeEntry {
  id: string
  category: string
  title: string
  summary: string
  body: string
  takeaways: string[]
  stage: string
  updated: string
  published: boolean
}

export const knowledgeEntries = rawEntries as KnowledgeEntry[]
export const knowledgeCategories = ['全部', ...new Set(knowledgeEntries.map(entry => entry.category))]
