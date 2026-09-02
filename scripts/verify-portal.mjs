import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const requiredFiles = [
  'site/index.md',
  'site/profile.md',
  'site/cooperation.md',
  'site/cases.md',
  'site/insights.md',
  'site/life.md',
  'site/contact.md',
  'site/.vitepress/config.mts',
  'site/.vitepress/theme/index.ts',
  'site/.vitepress/theme/styles.css',
  'site/data/portal.ts',
  'site/data/cases.ts',
  'site/data/life.ts',
  'site/public/assets/wechat-qr.png'
]

const missingFiles = requiredFiles.filter(file => !existsSync(resolve(root, file)))
if (missingFiles.length) {
  throw new Error(`Missing required files:\n${missingFiles.join('\n')}`)
}

const caseSource = readFileSync(resolve(root, 'site/data/cases.ts'), 'utf8')
const portalSource = readFileSync(resolve(root, 'site/data/portal.ts'), 'utf8')
const contentSource = [
  portalSource,
  readFileSync(resolve(root, 'site/profile.md'), 'utf8'),
  readFileSync(resolve(root, 'site/cooperation.md'), 'utf8'),
  readFileSync(resolve(root, 'site/contact.md'), 'utf8'),
  readFileSync(resolve(root, 'site/.vitepress/theme/components/HomePortal.vue'), 'utf8'),
  readFileSync(resolve(root, 'site/.vitepress/theme/components/ContactPanel.vue'), 'utf8')
].join('\n')

const caseCount = (caseSource.match(/\n\s*id:\s*'\d{2}'/g) || []).length
if (caseCount !== 9) throw new Error(`Expected 9 cases, found ${caseCount}`)

const facts = [
  '上海莲证科技有限公司',
  '2026.07 — 至今',
  '京东云（徐州）AI 创新中心',
  '2025 — 2026.06',
  '技术总监 / 全栈工程师',
  '数十人研发团队',
  '上海 / 徐州',
  '公证系统开发',
  'FDE 团队培育'
]
const missingFacts = facts.filter(fact => !contentSource.includes(fact))
if (missingFacts.length) throw new Error(`Missing factual anchors: ${missingFacts.join(', ')}`)

const sourceFiles = ['site/data/cases.ts', 'site/data/life.ts']
const localRefs = sourceFiles.flatMap(file => {
  const text = readFileSync(resolve(root, file), 'utf8')
  return [...text.matchAll(/(?:image|logo|src):\s*'(\/[^']+)'/g)].map(match => match[1])
})

const missingAssets = localRefs.filter(ref => !existsSync(resolve(root, 'site/public', ref.slice(1))))
if (missingAssets.length) throw new Error(`Missing local assets:\n${missingAssets.join('\n')}`)

const pageCount = ['index', 'profile', 'cooperation', 'cases', 'insights', 'life', 'contact'].length
console.log(`Content pages: ${pageCount}`)
console.log(`Case entries: ${caseCount}`)
console.log(`Local asset references: ${localRefs.length}`)
console.log(`Missing local assets: ${missingAssets.length}`)
console.log('Critical career and contact facts: verified')
