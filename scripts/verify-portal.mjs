import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const requiredFiles = [
  'site/index.md',
  'site/profile.md',
  'site/cooperation.md',
  'site/cases.md',
  'site/insights.md',
  'site/knowledge.md',
  'site/life.md',
  'site/contact.md',
  'site/.vitepress/config.mts',
  'site/.vitepress/theme/index.ts',
  'site/.vitepress/theme/styles.css',
  'site/data/portal.ts',
  'site/data/cases.ts',
  'config/case-links.json',
  'site/data/life.ts',
  'site/data/knowledge.ts',
  'site/data/importedKnowledge.ts',
  'site/.vitepress/theme/components/ImportedKnowledge.vue',
  'scripts/import-arch3rpro-knowledge.mjs',
  'docs/knowledge-migration-manifest.json',
  'site/public/assets/wechat-qr.png'
]

const missingFiles = requiredFiles.filter(file => !existsSync(resolve(root, file)))
if (missingFiles.length) {
  throw new Error(`Missing required files:\n${missingFiles.join('\n')}`)
}

const caseSource = readFileSync(resolve(root, 'site/data/cases.ts'), 'utf8')
const caseComponentSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/CaseGrid.vue'), 'utf8')
const caseLinks = JSON.parse(readFileSync(resolve(root, 'config/case-links.json'), 'utf8'))
const knowledgeSource = readFileSync(resolve(root, 'site/data/knowledge.ts'), 'utf8')
const importedKnowledgeSource = readFileSync(resolve(root, 'site/data/importedKnowledge.ts'), 'utf8')
const importedKnowledgeComponent = readFileSync(
  resolve(root, 'site/.vitepress/theme/components/ImportedKnowledge.vue'),
  'utf8'
)
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

const expectedCaseIds = Array.from({ length: 9 }, (_, index) => String(index + 1).padStart(2, '0'))
const configuredCaseIds = Object.keys(caseLinks).sort()
if (JSON.stringify(configuredCaseIds) !== JSON.stringify(expectedCaseIds)) {
  throw new Error(`Case link config must contain exactly IDs 01-09, found: ${configuredCaseIds.join(', ')}`)
}
const invalidCaseLinks = Object.entries(caseLinks)
  .filter(([, url]) => typeof url !== 'string' || (url.trim() && !/^https?:\/\//i.test(url.trim())))
  .map(([id]) => id)
if (invalidCaseLinks.length) {
  throw new Error(`Case NAS links must be empty or use http/https: ${invalidCaseLinks.join(', ')}`)
}
if (!caseComponentSource.includes(':href="item.nasUrl || undefined"') || !caseComponentSource.includes('noopener noreferrer')) {
  throw new Error('Case cards must use configurable NAS links with safe new-tab navigation')
}
const webConfigAnchors = [
  'bai-yunfei-case-nas-links-v1',
  'window.localStorage.setItem',
  'window.localStorage.getItem',
  '保存网页配置',
  '恢复文件默认值'
]
const missingWebConfigAnchors = webConfigAnchors.filter(anchor => !caseComponentSource.includes(anchor))
if (missingWebConfigAnchors.length) {
  throw new Error(`Missing browser case-link configuration behavior: ${missingWebConfigAnchors.join(', ')}`)
}

const knowledgeCount = (knowledgeSource.match(/\n\s*id:\s*'k\d{2}'/g) || []).length
if (knowledgeCount !== 12) throw new Error(`Expected 12 knowledge entries, found ${knowledgeCount}`)

const importedKnowledgeCount = (importedKnowledgeSource.match(/"id":\s*"a\d{2}"/g) || []).length
const referenceKnowledgeCount = (importedKnowledgeSource.match(/"isReference":\s*true/g) || []).length
if (importedKnowledgeCount !== 17) throw new Error(`Expected 17 imported knowledge entries, found ${importedKnowledgeCount}`)
if (referenceKnowledgeCount !== 3) throw new Error(`Expected 3 reference-only entries, found ${referenceKnowledgeCount}`)

const migrationManifest = JSON.parse(readFileSync(resolve(root, 'docs/knowledge-migration-manifest.json'), 'utf8'))
if (migrationManifest.sourceCommit !== 'acf58fa03821905916b0fc605ec893eadf6063fe') {
  throw new Error(`Unexpected knowledge source commit: ${migrationManifest.sourceCommit}`)
}
if (migrationManifest.summary.fullArticles !== 14 || migrationManifest.summary.referenceOnly !== 3) {
  throw new Error('Knowledge migration manifest counts do not match the reviewed source boundary')
}
if (migrationManifest.summary.copiedAssets !== 63 || migrationManifest.assets.length !== 63) {
  throw new Error('Knowledge migration asset manifest must contain 63 entries')
}
const missingImportedAssets = migrationManifest.assets
  .map(asset => asset.destination)
  .filter(destination => !existsSync(resolve(root, destination)))
if (missingImportedAssets.length) {
  throw new Error(`Missing imported knowledge assets:\n${missingImportedAssets.join('\n')}`)
}

const knowledgePage = readFileSync(resolve(root, 'site/knowledge.md'), 'utf8')
if (!knowledgePage.includes('以下 12 条内容均为原创整理')) {
  throw new Error('Knowledge page must keep its original-content statement')
}
if (knowledgePage.includes('](http')) {
  throw new Error('Knowledge index must not link to external sites')
}
if (knowledgePage.includes('内容与来源边界') || knowledgePage.includes('原知识库名称')) {
  throw new Error('Knowledge index must not display the removed source-boundary section')
}
if (/原文入口|原文链接/.test(`${knowledgePage}\n${importedKnowledgeComponent}`)) {
  throw new Error('Knowledge index must describe sources as local records, not outbound links')
}

const importedMarkdownFiles = []
const collectMarkdownFiles = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name)
    if (entry.isDirectory()) collectMarkdownFiles(target)
    if (entry.isFile() && entry.name.endsWith('.md')) importedMarkdownFiles.push(target)
  }
}
collectMarkdownFiles(resolve(root, 'site/kb'))

const removeNonRenderedExamples = markdown => markdown
  .replace(/^(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:`{3,}|~{3,})\s*$/gm, '')
  .replace(/`[^`\n]*`/g, '')

const externalNavigation = []
const externalMedia = []
for (const file of importedMarkdownFiles) {
  const renderedMarkdown = removeNonRenderedExamples(readFileSync(file, 'utf8'))
  if (/\]\(https?:\/\//i.test(renderedMarkdown)) externalNavigation.push(file)
  if (/<(?:img|iframe|video|audio|source)\b[^>]*(?:src|poster)=["'](?:https?:)?\/\//i.test(renderedMarkdown)) {
    externalMedia.push(file)
  }
}
if (externalNavigation.length) {
  throw new Error(`Imported knowledge must not render external links:\n${externalNavigation.join('\n')}`)
}
if (externalMedia.length) {
  throw new Error(`Imported knowledge must not load external media:\n${externalMedia.join('\n')}`)
}

const missingReferenceNotices = migrationManifest.articles
  .filter(article => article.isReference)
  .map(article => resolve(root, article.destination))
  .filter(file => !readFileSync(file, 'utf8').includes('不会跳转到外部网站'))
if (missingReferenceNotices.length) {
  throw new Error(`Reference pages must state the local-only boundary:\n${missingReferenceNotices.join('\n')}`)
}

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

const pageCount = ['index', 'profile', 'cooperation', 'cases', 'insights', 'knowledge', 'life', 'contact'].length
console.log(`Content pages: ${pageCount}`)
console.log(`Case entries: ${caseCount}`)
console.log(`Configured NAS case links: ${Object.values(caseLinks).filter(url => url.trim()).length}`)
console.log(`Knowledge entries: ${knowledgeCount}`)
console.log(`Imported knowledge entries: ${importedKnowledgeCount} (${referenceKnowledgeCount} reference-only)`)
console.log(`Imported knowledge pages without external navigation/media: ${importedMarkdownFiles.length}`)
console.log(`Local asset references: ${localRefs.length}`)
console.log(`Missing local assets: ${missingAssets.length}`)
console.log('Critical career and contact facts: verified')
