import rawConfig from '../../config/site-config.json'

export interface ActionLink { label: string; link: string }
export interface TextCard { title: string; description: string }
export interface CodeCard extends TextCard { code: string }
export interface Metric { value: string; label: string }
export interface PortalRoute extends CodeCard {
  link: string
  tags: string[]
  accent: 'cyan' | 'blue' | 'violet' | 'orange' | 'green'
  enabled: boolean
}
export interface TimelineItem {
  period: string
  organization: string
  role: string
  description: string
  current: boolean
}
export interface CooperationDirection extends TextCard { items: string[] }

export interface SiteConfig {
  identity: {
    name: string
    currentRole: string
    subtitle: string
    focus: string
    capabilities: string
    city: string
  }
  home: {
    kicker: string
    title: string
    highlight: string
    lead: string
    primaryAction: ActionLink
    secondaryAction: ActionLink
    directoryTitle: string
    directoryDescription: string
    focusTitle: string
    focusDescription: string
  }
  contact: {
    title: string
    description: string
    phone: string
    email: string
    city: string
    publicAccount: string
    wechatQr: string
    wechatLabel: string
    wechatHint: string
  }
  metrics: Metric[]
  routes: PortalRoute[]
  focusAreas: CodeCard[]
  timeline: TimelineItem[]
  cooperation: {
    title: string
    description: string
    stages: CodeCard[]
    directions: CooperationDirection[]
    process: TextCard[]
  }
}

export const defaultSiteConfig = rawConfig as SiteConfig
