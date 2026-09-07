import configuredCases from '../../config/cases.json'

export interface CasePartner {
  name: string
  logo: string
}

export interface CaseItem {
  id: string
  category: 'delivery' | 'community' | 'ecosystem'
  title: string
  kicker: string
  description: string
  image: string
  imageAlt: string
  tags: string[]
  outcome?: string
  outcomeLabel?: string
  contain?: boolean
  partners?: CasePartner[]
  nasUrl: string
}

export const cases = configuredCases as CaseItem[]
