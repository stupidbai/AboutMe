import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const requiredFiles = [
  'site/index.md',
  'site/profile.md',
  'site/cooperation.md',
  'site/cases.md',
  'site/admin/cases.md',
  'site/insights.md',
  'site/knowledge.md',
  'site/life.md',
  'site/contact.md',
  'site/.vitepress/config.mts',
  'site/.vitepress/theme/index.ts',
  'site/.vitepress/theme/styles.css',
  'site/.vitepress/theme/components/CaseGrid.vue',
  'site/.vitepress/theme/components/CaseAdmin.vue',
  'site/data/portal.ts',
  'site/data/cases.ts',
  'config/cases.json',
  'site/data/life.ts',
  'site/data/knowledge.ts',
  'site/data/importedKnowledge.ts',
  'site/.vitepress/theme/components/ImportedKnowledge.vue',
  'scripts/import-arch3rpro-knowledge.mjs',
  'scripts/serve-with-admin.mjs',
  'scripts/database.mjs',
  'scripts/case-schema.mjs',
  'scripts/test-database.mjs',
  'scripts/test-admin-api.mjs',
  'scripts/build-release.mjs',
  'Dockerfile',
  'compose.yaml',
  '.dockerignore',
  'install/windows/install.ps1',
  'install/linux/install.sh',
  'bin/start-windows.cmd',
  'bin/start-linux.sh',
  'docs/DEPLOYMENT.md',
  'docs/knowledge-migration-manifest.json',
  'site/public/assets/wechat-qr.png',
  '.env.example'
]

const missingFiles = requiredFiles.filter(file => !existsSync(resolve(root, file)))
if (missingFiles.length) {
  throw new Error(`Missing required files:\n${missingFiles.join('\n')}`)
}

const cases = JSON.parse(readFileSync(resolve(root, 'config/cases.json'), 'utf8'))
const caseComponentSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/CaseGrid.vue'), 'utf8')
const caseAdminSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/CaseAdmin.vue'), 'utf8')
const adminServerSource = readFileSync(resolve(root, 'scripts/serve-with-admin.mjs'), 'utf8')
const databaseSource = readFileSync(resolve(root, 'scripts/database.mjs'), 'utf8')
const dockerfileSource = readFileSync(resolve(root, 'Dockerfile'), 'utf8')
const composeSource = readFileSync(resolve(root, 'compose.yaml'), 'utf8')
const packageMetadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
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

if (!Array.isArray(cases) || cases.length > 99) {
  throw new Error(`Case config must contain 0-99 entries, found ${Array.isArray(cases) ? cases.length : 'non-array'}`)
}

const caseIds = cases.map(item => item.id)
if (new Set(caseIds).size !== caseIds.length) throw new Error('Case IDs must be unique')

const allowedCategories = new Set(['delivery', 'community', 'ecosystem'])
const invalidCases = cases.filter(item => (
  !/^[a-zA-Z0-9_-]{1,8}$/.test(item.id ?? '') ||
  !allowedCategories.has(item.category) ||
  typeof item.title !== 'string' || !item.title.trim() ||
  typeof item.kicker !== 'string' || !item.kicker.trim() ||
  typeof item.description !== 'string' || !item.description.trim() ||
  typeof item.image !== 'string' || !item.image.trim() ||
  typeof item.imageAlt !== 'string' ||
  !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string' || !tag.trim()) ||
  typeof item.nasUrl !== 'string' || (item.nasUrl.trim() && !/^https?:\/\//i.test(item.nasUrl.trim()))
))
if (invalidCases.length) {
  throw new Error(`Invalid case entries: ${invalidCases.map(item => item.id || '(missing id)').join(', ')}`)
}

if (!caseComponentSource.includes("fetch('/api/cases'") || !caseComponentSource.includes('noopener noreferrer')) {
  throw new Error('Public case cards must read the case API and use safe new-tab navigation')
}
const forbiddenPublicEditorAnchors = ['localStorage', '保存网页配置', '配置 NAS 链接', '/api/admin/']
const exposedEditorAnchors = forbiddenPublicEditorAnchors.filter(anchor => caseComponentSource.includes(anchor))
if (exposedEditorAnchors.length) {
  throw new Error(`Public case page must not expose editing behavior: ${exposedEditorAnchors.join(', ')}`)
}

const requiredAdminAnchors = [
  '/api/admin/login',
  '/api/admin/cases',
  '新增案例',
  '删除',
  '保存全部修改',
  "'if-match': revision.value",
  'response.status === 409'
]
const missingAdminAnchors = requiredAdminAnchors.filter(anchor => !caseAdminSource.includes(anchor))
if (missingAdminAnchors.length) {
  throw new Error(`Missing case admin behavior: ${missingAdminAnchors.join(', ')}`)
}
if (caseAdminSource.includes('localStorage')) {
  throw new Error('Case admin must use server persistence, not browser localStorage')
}

const requiredServerAnchors = [
  'CASE_ADMIN_PASSWORD',
  'HttpOnly',
  'SameSite=Strict',
  '/api/admin/login',
  '/api/admin/cases',
  'config/cases.json',
  '/api/health',
  'PortalDatabase',
  'if-match',
  'DatabaseConflictError',
  'loginAttempts',
  'attempt.count >= 5'
]
const missingServerAnchors = requiredServerAnchors.filter(anchor => !adminServerSource.includes(anchor))
if (missingServerAnchors.length) {
  throw new Error(`Missing protected admin server behavior: ${missingServerAnchors.join(', ')}`)
}

const requiredDatabaseAnchors = [
  "from 'node:sqlite'",
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'BEGIN IMMEDIATE',
  'CREATE TABLE IF NOT EXISTS cases',
  'CREATE TABLE IF NOT EXISTS case_tags',
  'CREATE TABLE IF NOT EXISTS case_partners',
  'CREATE TABLE IF NOT EXISTS case_changes',
  'CREATE INDEX IF NOT EXISTS',
  'await backup',
  'DatabaseConflictError'
]
const missingDatabaseAnchors = requiredDatabaseAnchors.filter(anchor => !databaseSource.includes(anchor))
if (missingDatabaseAnchors.length) {
  throw new Error(`Missing SQLite behavior: ${missingDatabaseAnchors.join(', ')}`)
}

const requiredDockerAnchors = ['FROM node:24-bookworm-slim', 'USER node', 'VOLUME ["/data"]', 'HEALTHCHECK']
const missingDockerAnchors = requiredDockerAnchors.filter(anchor => !dockerfileSource.includes(anchor))
if (missingDockerAnchors.length) throw new Error(`Missing Docker behavior: ${missingDockerAnchors.join(', ')}`)
if (!composeSource.includes('portal-data:/data') || !composeSource.includes('read_only: true') || !composeSource.includes('no-new-privileges:true')) {
  throw new Error('Compose must keep SQLite in a volume and apply container hardening')
}
if (packageMetadata.version !== '3.6.0' || packageMetadata.engines?.node !== '>=22.16') {
  throw new Error('Package version or Node.js SQLite runtime requirement is incorrect')
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

const localRefs = [
  ...cases.flatMap(item => [
    item.image,
    ...(Array.isArray(item.partners) ? item.partners.map(partner => partner.logo) : [])
  ]),
  ...[...readFileSync(resolve(root, 'site/data/life.ts'), 'utf8').matchAll(/(?:image|logo|src):\s*'(\/[^']+)'/g)]
    .map(match => match[1])
].filter(ref => typeof ref === 'string' && ref.startsWith('/'))

const missingAssets = localRefs.filter(ref => !existsSync(resolve(root, 'site/public', ref.slice(1))))
if (missingAssets.length) throw new Error(`Missing local assets:\n${missingAssets.join('\n')}`)

const pageCount = ['index', 'profile', 'cooperation', 'cases', 'insights', 'knowledge', 'life', 'contact'].length
console.log(`Content pages: ${pageCount}`)
console.log(`Case entries: ${cases.length}`)
console.log(`Configured NAS case links: ${cases.filter(item => item.nasUrl.trim()).length}`)
console.log('Case management mode: protected server admin')
console.log(`Knowledge entries: ${knowledgeCount}`)
console.log(`Imported knowledge entries: ${importedKnowledgeCount} (${referenceKnowledgeCount} reference-only)`)
console.log(`Imported knowledge pages without external navigation/media: ${importedMarkdownFiles.length}`)
console.log(`Local asset references: ${localRefs.length}`)
console.log(`Missing local assets: ${missingAssets.length}`)
console.log('Critical career and contact facts: verified')
