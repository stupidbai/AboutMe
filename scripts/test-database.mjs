import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { PortalDatabase } from './database.mjs'
import { validateCases } from './case-schema.mjs'
import { validateSiteConfig } from './site-config-schema.mjs'

const root = resolve(import.meta.dirname, '..')
const dataDir = mkdtempSync(join(tmpdir(), 'byf-portal-db-test-'))
const seedFile = resolve(root, 'config/cases.json')
const siteConfigSeedFile = resolve(root, 'config/site-config.json')
const knowledgeSeedFile = resolve(root, 'config/knowledge.json')
const seedCases = JSON.parse(readFileSync(seedFile, 'utf8'))
const seedSiteConfig = JSON.parse(readFileSync(siteConfigSeedFile, 'utf8'))
const seedKnowledge = JSON.parse(readFileSync(knowledgeSeedFile, 'utf8'))
let database

try {
  database = new PortalDatabase({ dataDir, seedFile, siteConfigSeedFile, knowledgeSeedFile, encryptionSecret: 'database-test-secret', backupLimit: 2 })
  const initial = database.getSnapshot()
  if (initial.revision !== 1 || !isDeepStrictEqual(initial.cases, validateCases(seedCases))) {
    throw new Error('首次 JSON 到 SQLite 迁移失败。')
  }
  const initialSite = database.getSiteConfigSnapshot()
  if (initialSite.revision !== 1 || !isDeepStrictEqual(initialSite.config, validateSiteConfig(seedSiteConfig))) {
    throw new Error('站点配置首次 JSON 到 SQLite 迁移失败。')
  }
  const initialKnowledge = database.getKnowledgeSnapshot()
  if (initialKnowledge.revision !== 1 || initialKnowledge.entries.length !== seedKnowledge.length) {
    throw new Error('知识库首次 JSON 到 SQLite 迁移失败。')
  }
  const changedKnowledge = structuredClone(initialKnowledge.entries)
  changedKnowledge[0].summary += ' 数据库测试。'
  const savedKnowledge = await database.replaceKnowledge(changedKnowledge, { expectedRevision: 1, actor: 'database-test' })
  if (savedKnowledge.revision !== 2 || !savedKnowledge.entries[0].summary.endsWith('数据库测试。')) throw new Error('知识库更新事务失败。')

  const initialAi = database.getAiSettings()
  const analyticsSettings = database.getAnalyticsSettings()
  if (database.getHealth().schemaVersion !== 7 || initialAi.dailyLimit !== 200 || initialAi.allowPrivateNetwork !== false || !analyticsSettings.enabled || !analyticsSettings.respectDnt || analyticsSettings.retentionDays !== 365) {
    throw new Error('数据库 v7、AI 安全或访问监控默认值迁移失败。')
  }
  const savedAnalyticsSettings = await database.replaceAnalyticsSettings({ enabled: true, respectDnt: true, retentionDays: 90 }, { expectedRevision: analyticsSettings.revision, actor: 'database-test' })
  if (savedAnalyticsSettings.revision !== 2 || savedAnalyticsSettings.retentionDays !== 90) throw new Error('访问监控配置更新失败。')
  database.recordSiteEvent({ eventId: 'database-analytics-event-0001', visitorHash: 'visitor-a', sessionHash: 'session-a', eventName: 'page_view', pagePath: '/knowledge', deviceType: 'desktop', loadMs: 820, ttfbMs: 110, fcpMs: 310 })
  database.recordSiteEvent({ eventId: 'database-analytics-event-0002', visitorHash: 'visitor-a', sessionHash: 'session-a', eventName: 'page_engaged', pagePath: '/knowledge', deviceType: 'desktop' })
  database.recordSiteEvent({ eventId: 'database-analytics-event-0003', visitorHash: 'visitor-b', sessionHash: 'session-b', eventName: 'contact_intent', pagePath: '/contact', acquisitionSource: 'search', deviceType: 'mobile' })
  const analytics = database.getSiteAnalytics(1)
  if (analytics.summary.pageViews !== 1 || analytics.summary.visitors !== 1 || analytics.summary.engagedSessions !== 1 || analytics.summary.contactIntents !== 1 || analytics.performance.averageLoadMs !== 820 || analytics.devices.find(item => item.device === 'desktop')?.visitors !== 1) {
    throw new Error('访问监控事件或统计聚合失败。')
  }
  const savedAi = await database.replaceAiSettings({
    ...initialAi, apiKey: 'test-secret-api-key', apiKeySet: undefined, clearApiKey: false,
    enabled: true, apiUrl: 'http://127.0.0.1:65535/v1/chat/completions'
  }, { expectedRevision: initialAi.revision, actor: 'database-test' })
  if (savedAi.revision !== 2 || !savedAi.apiKeySet || database.getAiSettings({ includeSecret: true }).apiKey !== 'test-secret-api-key') {
    throw new Error('AI 配置加密保存失败。')
  }
  const queryId = '0123456789abcdef01234567'
  const clientHash = 'database-test-client'
  database.recordRagQuery({ id: queryId, clientHash, question: '知识库如何配置？', mode: 'search', sourceCount: 2, durationMs: 12, status: 'ok' })
  if (database.getRagQueryCount(clientHash, new Date(Date.now() - 60_000).toISOString()) !== 1 || !database.setRagFeedback(queryId, 1)) {
    throw new Error('RAG 问答记录或反馈写入失败。')
  }
  const ragStats = database.getRagStats(1)
  if (ragStats.summary.total !== 1 || ragStats.summary.helpful !== 1 || ragStats.recent[0]?.question !== '知识库如何配置？') {
    throw new Error('RAG 统计聚合失败。')
  }

  const userId = '111111111111111111111111'
  const commentId = '222222222222222222222222'
  const postId = '333333333333333333333333'
  const replyId = '444444444444444444444444'
  database.createCommunityUser({ id: userId, username: 'database_user', email: 'database@example.com', displayName: '数据库用户', passwordHash: 'test-hash' })
  database.createCommunitySession({ tokenHash: 'session-hash', userId, expiresAt: new Date(Date.now() + 60_000).toISOString() })
  if (database.getCommunitySession('session-hash')?.user.id !== userId || database.getForumCategories().length !== 4) throw new Error('用户会话或论坛板块初始化失败。')
  database.createArticleComment({ id: commentId, articlePath: '/kb/blog/test', userId, body: '数据库评论' })
  if (!database.toggleArticleCommentLike(commentId, userId).liked || database.listArticleComments('/kb/blog/test', userId)[0]?.likeCount !== 1) throw new Error('文章评论或点赞事务失败。')
  database.createForumPost({ id: postId, categoryId: 'ai', userId, title: '数据库论坛测试', body: '这是用于验证数据库论坛功能的正文。' })
  database.createForumReply({ id: replyId, postId, userId, body: '数据库论坛回复' })
  if (!database.toggleForumLike('post', postId, userId).liked || database.getForumPost(postId, userId)?.replyCount !== 1) throw new Error('论坛发帖、回复或点赞事务失败。')
  const communityStats = database.getCommunityStats()
  if (communityStats.users !== 1 || communityStats.comments !== 1 || communityStats.posts !== 5 || communityStats.replies !== 1) throw new Error('社区统计聚合失败。')

  const changedSiteConfig = structuredClone(initialSite.config)
  changedSiteConfig.identity.city = '上海 / 徐州 / 自动化测试'
  const changedSite = await database.replaceSiteConfig(changedSiteConfig, { expectedRevision: 1, actor: 'database-test' })
  if (changedSite.revision !== 2 || changedSite.config.identity.city !== changedSiteConfig.identity.city) {
    throw new Error('站点配置更新事务失败。')
  }

  const empty = await database.replaceCases([], { expectedRevision: initial.revision, actor: 'database-test' })
  if (empty.revision !== 2 || empty.cases.length !== 0) throw new Error('清空案例事务失败。')
  database.close()

  database = new PortalDatabase({ dataDir, seedFile, siteConfigSeedFile, knowledgeSeedFile, encryptionSecret: 'database-test-secret', backupLimit: 2 })
  const reopened = database.getSnapshot()
  if (reopened.revision !== 2 || reopened.cases.length !== 0) {
    throw new Error('空数据库重启后被错误地重新填充。')
  }
  if (database.getSiteConfigSnapshot().revision !== 2 || database.getSiteConfigSnapshot().config.identity.city !== changedSiteConfig.identity.city) {
    throw new Error('站点配置重启后未持久化。')
  }
  if (database.getKnowledgeSnapshot().revision !== 2 || database.getAiSettings().revision !== 2) {
    throw new Error('知识库或 AI 配置重启后未持久化。')
  }
  if (database.getCommunityStats().users !== 1 || database.getForumPost(postId)?.replyCount !== 1) {
    throw new Error('用户、评论或论坛数据重启后未持久化。')
  }

  const restored = await database.replaceCases(seedCases, { expectedRevision: reopened.revision, actor: 'database-test' })
  if (restored.revision !== 3 || restored.cases.length !== seedCases.length) {
    throw new Error('数据库恢复事务失败。')
  }
  database.close()
  database = undefined

  console.log('JSON seed migration: verified')
  console.log('Empty dataset persistence across restart: verified')
  console.log('Revisioned restore transaction: verified')
  console.log('Revisioned site configuration persistence: verified')
  console.log('Knowledge configuration persistence: verified')
  console.log('Encrypted AI configuration persistence: verified')
  console.log('RAG query statistics and feedback persistence: verified')
  console.log('Community users, sessions, comments, likes and forum persistence: verified')
  console.log('Anonymous traffic monitoring settings and daily aggregates: verified')
} finally {
  database?.close()
  rmSync(dataDir, { recursive: true, force: true })
}
