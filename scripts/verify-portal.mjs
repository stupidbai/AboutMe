import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const requiredFiles = [
  'site/index.md',
  'site/profile.md',
  'site/cooperation.md',
  'site/cases.md',
  'site/admin/cases.md',
  'site/admin/site.md',
  'site/admin/knowledge.md',
  'site/admin/users.md',
  'site/account.md',
  'site/forum.md',
  'site/insights.md',
  'site/knowledge.md',
  'site/knowledge/archive.md',
  'site/life.md',
  'site/contact.md',
  'site/.vitepress/config.mts',
  'site/.vitepress/theme/index.ts',
  'site/.vitepress/theme/styles.css',
  'site/.vitepress/theme/components/CaseGrid.vue',
  'site/.vitepress/theme/components/CaseAdmin.vue',
  'site/.vitepress/theme/components/SiteAdmin.vue',
  'site/.vitepress/theme/components/CooperationContent.vue',
  'site/.vitepress/theme/components/KnowledgeAdmin.vue',
  'site/.vitepress/theme/components/RagAssistant.vue',
  'site/.vitepress/theme/components/CommunityAccount.vue',
  'site/.vitepress/theme/components/ArticleComments.vue',
  'site/.vitepress/theme/components/ForumBoard.vue',
  'site/.vitepress/theme/components/UserAdmin.vue',
  'site/.vitepress/theme/useCommunityAuth.ts',
  'site/.vitepress/theme/useSiteConfig.ts',
  'site/data/siteConfig.ts',
  'site/data/portal.ts',
  'site/data/cases.ts',
  'config/cases.json',
  'config/site-config.json',
  'config/knowledge.json',
  'site/data/life.ts',
  'site/data/knowledge.ts',
  'site/data/importedKnowledge.ts',
  'site/.vitepress/theme/components/ImportedKnowledge.vue',
  'scripts/import-arch3rpro-knowledge.mjs',
  'scripts/serve-with-admin.mjs',
  'scripts/database.mjs',
  'scripts/case-schema.mjs',
  'scripts/site-config-schema.mjs',
  'scripts/knowledge-schema.mjs',
  'scripts/rag-service.mjs',
  'scripts/network-security.mjs',
  'scripts/community-service.mjs',
  'scripts/test-community-service.mjs',
  'scripts/test-rag-service.mjs',
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
  'THIRD_PARTY_NOTICES.md',
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
const siteAdminSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/SiteAdmin.vue'), 'utf8')
const knowledgeAdminSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/KnowledgeAdmin.vue'), 'utf8')
const ragAssistantSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/RagAssistant.vue'), 'utf8')
const accountSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/CommunityAccount.vue'), 'utf8')
const commentsSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/ArticleComments.vue'), 'utf8')
const forumSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/ForumBoard.vue'), 'utf8')
const userAdminSource = readFileSync(resolve(root, 'site/.vitepress/theme/components/UserAdmin.vue'), 'utf8')
const communityServiceSource = readFileSync(resolve(root, 'scripts/community-service.mjs'), 'utf8')
const ragServiceSource = readFileSync(resolve(root, 'scripts/rag-service.mjs'), 'utf8')
const networkSecuritySource = readFileSync(resolve(root, 'scripts/network-security.mjs'), 'utf8')
const adminServerSource = readFileSync(resolve(root, 'scripts/serve-with-admin.mjs'), 'utf8')
const databaseSource = readFileSync(resolve(root, 'scripts/database.mjs'), 'utf8')
const dockerfileSource = readFileSync(resolve(root, 'Dockerfile'), 'utf8')
const composeSource = readFileSync(resolve(root, 'compose.yaml'), 'utf8')
const packageMetadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const siteConfig = JSON.parse(readFileSync(resolve(root, 'config/site-config.json'), 'utf8'))
const knowledgeConfig = JSON.parse(readFileSync(resolve(root, 'config/knowledge.json'), 'utf8'))
const knowledgeSource = readFileSync(resolve(root, 'site/data/knowledge.ts'), 'utf8')
const importedKnowledgeSource = readFileSync(resolve(root, 'site/data/importedKnowledge.ts'), 'utf8')
const importedKnowledgeComponent = readFileSync(
  resolve(root, 'site/.vitepress/theme/components/ImportedKnowledge.vue'),
  'utf8'
)
const portalSource = readFileSync(resolve(root, 'site/data/portal.ts'), 'utf8')
const contentSource = [
  portalSource,
  JSON.stringify(siteConfig),
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
const requiredSiteAdminAnchors = ['/api/admin/site-config', '首页目录与版块显隐', '职业时间线', '保存全部修改', "'if-match': revision.value"]
const missingSiteAdminAnchors = requiredSiteAdminAnchors.filter(anchor => !siteAdminSource.includes(anchor))
if (missingSiteAdminAnchors.length) throw new Error(`Missing site admin behavior: ${missingSiteAdminAnchors.join(', ')}`)
if (siteAdminSource.includes('localStorage')) throw new Error('Site admin must use server persistence, not browser localStorage')
if (!Array.isArray(siteConfig.routes) || !Array.isArray(siteConfig.timeline) || !Array.isArray(siteConfig.cooperation?.directions)) {
  throw new Error('Site configuration seed is incomplete')
}
const requiredKnowledgeAdminAnchors = ['/api/admin/knowledge', '/api/admin/ai-settings', '/api/admin/ai-test', '/api/admin/rag-stats', '/api/admin/export', '导入 Markdown/TXT', '保存知识库', 'API Key']
const missingKnowledgeAdminAnchors = requiredKnowledgeAdminAnchors.filter(anchor => !knowledgeAdminSource.includes(anchor))
if (missingKnowledgeAdminAnchors.length) throw new Error(`Missing knowledge admin behavior: ${missingKnowledgeAdminAnchors.join(', ')}`)
if (!ragAssistantSource.includes('/api/rag/query') || !ragAssistantSource.includes('/api/rag/feedback') || !ragAssistantSource.includes('引用的本地资料')) {
  throw new Error('RAG assistant must call the protected server endpoint and show local citations')
}
const requiredCommunityUiAnchors = [
  [accountSource, ['/api/auth/register', '/api/auth/login', '/api/auth/profile', '/api/auth/password']],
  [commentsSource, ['/api/comments', '/like', '注册或登录']],
  [forumSource, ['/api/forum/categories', '/api/forum/posts', '/replies', '/like']],
  [userAdminSource, ['/api/admin/users', '/api/admin/moderation', '/api/admin/community/stats']]
]
for (const [source, anchors] of requiredCommunityUiAnchors) {
  const missing = anchors.filter(anchor => !source.includes(anchor))
  if (missing.length) throw new Error(`Missing community UI behavior: ${missing.join(', ')}`)
}
if (!communityServiceSource.includes("from '@noble/hashes/scrypt.js'") || !communityServiceSource.includes("from 'marked'") || !communityServiceSource.includes("from 'sanitize-html'") || !communityServiceSource.includes('allowedSchemes')) {
  throw new Error('Community passwords and user content must reuse audited cryptography, Markdown and HTML sanitization packages')
}

const requiredServerAnchors = [
  'CASE_ADMIN_PASSWORD',
  'HttpOnly',
  'SameSite=Strict',
  '/api/admin/login',
  '/api/admin/cases',
  '/api/admin/site-config',
  '/api/site-config',
  '/api/knowledge',
  '/api/rag/query',
  '/api/admin/knowledge',
  '/api/admin/ai-settings',
  '/api/admin/ai-test',
  '/api/admin/rag-stats',
  '/api/admin/security-status',
  '/api/admin/export',
  '/api/rag/feedback',
  '/api/auth/register',
  '/api/auth/login',
  '/api/comments',
  '/api/forum/posts',
  '/api/admin/users',
  '/api/admin/moderation',
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
  'CREATE TABLE IF NOT EXISTS site_config',
  'CREATE TABLE IF NOT EXISTS site_config_changes',
  'CREATE TABLE IF NOT EXISTS knowledge_entries',
  'CREATE TABLE IF NOT EXISTS knowledge_takeaways',
  'CREATE TABLE IF NOT EXISTS ai_settings',
  'CREATE TABLE IF NOT EXISTS rag_queries',
  'CREATE TABLE IF NOT EXISTS community_users',
  'CREATE TABLE IF NOT EXISTS community_sessions',
  'CREATE TABLE IF NOT EXISTS article_comments',
  'CREATE TABLE IF NOT EXISTS forum_posts',
  'CREATE TABLE IF NOT EXISTS forum_replies',
  "createCipheriv('aes-256-gcm'",
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
if (packageMetadata.version !== '4.0.0' || packageMetadata.engines?.node !== '>=22.16' || packageMetadata.dependencies?.minisearch !== '^7.2.0' || packageMetadata.dependencies?.['@noble/hashes'] !== '^2.4.0' || packageMetadata.dependencies?.marked !== '^18.0.11' || packageMetadata.dependencies?.['sanitize-html'] !== '^2.17.7') {
  throw new Error('Package version or Node.js SQLite runtime requirement is incorrect')
}
if (!ragServiceSource.includes("from 'minisearch'") || !ragServiceSource.includes('new MiniSearch') || !networkSecuritySource.includes('assertSafeOutboundUrl')) {
  throw new Error('MiniSearch retrieval or outbound network guard is missing')
}

const knowledgeCount = knowledgeConfig.length
if (knowledgeCount !== 12) throw new Error(`Expected 12 knowledge entries, found ${knowledgeCount}`)
if (knowledgeConfig.some(entry => !entry.body || typeof entry.published !== 'boolean')) throw new Error('Configurable knowledge entries require body and published fields')

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
if (!knowledgePage.includes('可通过管理后台新增、编辑、排序和控制发布状态')) {
  throw new Error('Knowledge page must describe its configurable content workflow')
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

const pageCount = ['index', 'profile', 'cooperation', 'cases', 'insights', 'knowledge', 'knowledge/archive', 'forum', 'account', 'life', 'contact'].length
console.log(`Content pages: ${pageCount}`)
console.log(`Case entries: ${cases.length}`)
console.log(`Configured NAS case links: ${cases.filter(item => item.nasUrl.trim()).length}`)
console.log('Case management mode: protected server admin')
console.log(`Configurable homepage routes: ${siteConfig.routes.length}`)
console.log(`Configurable timeline entries: ${siteConfig.timeline.length}`)
console.log(`Knowledge entries: ${knowledgeCount}`)
console.log(`Imported knowledge entries: ${importedKnowledgeCount} (${referenceKnowledgeCount} reference-only)`)
console.log(`Imported knowledge pages without external navigation/media: ${importedMarkdownFiles.length}`)
console.log(`Local asset references: ${localRefs.length}`)
console.log(`Missing local assets: ${missingAssets.length}`)
console.log('Critical career and contact facts: verified')
console.log('Visitor, account, comments, forum and user administration: verified')
