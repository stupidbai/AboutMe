import { spawn } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const envFile = resolve(root, '.env.local')
if (!existsSync(envFile)) throw new Error('缺少 .env.local，无法执行管理 API 验收。')

const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2')]
    })
)
const username = env.CASE_ADMIN_USERNAME || 'admin'
const password = env.CASE_ADMIN_PASSWORD || ''

const portProbe = createNetServer()
await new Promise((resolveListen, rejectListen) => {
  portProbe.once('error', rejectListen)
  portProbe.listen(0, '127.0.0.1', resolveListen)
})
const port = portProbe.address().port
await new Promise(resolveClose => portProbe.close(resolveClose))

const testDataDir = mkdtempSync(join(tmpdir(), 'byf-portal-test-'))
const baseUrl = 'http://127.0.0.1:' + port
let mockRequests = 0
const mockAiServer = createHttpServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    mockRequests += 1
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: `模拟 AI 回答：${payload.model}` } }] }))
  })
})
await new Promise((resolveListen, rejectListen) => {
  mockAiServer.once('error', rejectListen)
  mockAiServer.listen(0, '127.0.0.1', resolveListen)
})
const mockAiUrl = `http://127.0.0.1:${mockAiServer.address().port}/v1/chat/completions`
let stdout = ''
let stderr = ''
const child = spawn(process.execPath, ['scripts/serve-with-admin.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    CASE_ADMIN_HOST: '127.0.0.1',
    CASE_ADMIN_PORT: String(port),
    CASE_ADMIN_USERNAME: username,
    CASE_ADMIN_PASSWORD: password,
    CASE_DATA_DIR: testDataDir,
    PORTAL_ENCRYPTION_KEY: 'api-test-encryption-key',
    CASE_BACKUP_LIMIT: '3'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.on('data', chunk => { stdout += chunk })
child.stderr.on('data', chunk => { stderr += chunk })

const expectStatus = async (response, expected, label) => {
  if (response.status !== expected) {
    const detail = await response.text()
    throw new Error(label + ': expected ' + expected + ', received ' + response.status + ' ' + detail)
  }
  return response
}

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('测试服务提前退出：' + stderr + stdout)
    try {
      const response = await fetch(baseUrl + '/api/health')
      if (response.ok) return response.json()
    } catch {
      // Service startup can take a moment on slower Windows disks.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  throw new Error('等待测试服务启动超时：' + stderr + stdout)
}

let cookie = ''
let userCookie = ''
let csrfCookie = ''
let csrfToken = ''
let revision = ''
let analyticsCookie = ''
const adminFetch = (path, options = {}) => fetch(baseUrl + path, {
  ...options,
  headers: {
    accept: 'application/json',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(cookie ? { cookie } : {}),
    ...options.headers
  }
})
const save = (payload, match = revision) => adminFetch('/api/admin/cases', {
  method: 'PUT',
  headers: match ? { 'if-match': match } : {},
  body: JSON.stringify(payload)
})
const communityFetch = (path, options = {}) => fetch(baseUrl + path, {
  ...options,
  headers: {
    accept: 'application/json',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...((userCookie || csrfCookie) ? { cookie: [userCookie, csrfCookie].filter(Boolean).join('; ') } : {}),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    ...options.headers
  }
})
const responseCookies = response => {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || '']
  return values.flatMap(value => String(value).split(/,(?=\s*[A-Za-z0-9_-]+=)/)).filter(Boolean)
}
const telemetryFetch = (payload, options = {}) => fetch(baseUrl + '/api/telemetry', {
  method: 'POST',
  ...options,
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: baseUrl,
    ...(analyticsCookie ? { cookie: analyticsCookie } : {}),
    ...options.headers
  },
  body: JSON.stringify(payload)
})

try {
  const health = await waitForHealth()
  if (health.status !== 'ok' || health.database.schemaVersion !== 7 || health.database.siteConfigRevision !== 1 || health.database.knowledgeCount !== 12 || health.database.ragQueryCount !== 0 || health.database.siteEventCount !== 0 || !health.database.analyticsEnabled || health.database.communityUserCount !== 0 || health.database.forumPostCount !== 4 || health.database.journalMode !== 'wal') {
    throw new Error('SQLite 健康状态不符合预期。')
  }

  const publicResponse = await expectStatus(await fetch(baseUrl + '/api/cases'), 200, '公开读取')
  const publicCases = await publicResponse.json()
  const publicEtag = publicResponse.headers.get('etag')
  if (!Array.isArray(publicCases) || publicCases.length !== 10 || !publicEtag) {
    throw new Error('公开 API 未返回 10 个迁移案例或缺少 ETag。')
  }
  await expectStatus(await fetch(baseUrl + '/api/cases', {
    headers: { 'if-none-match': publicEtag }
  }), 304, '公开读取缓存协商')

  const publicSiteResponse = await expectStatus(await fetch(baseUrl + '/api/site-config'), 200, '公开读取站点配置')
  const publicSiteConfig = await publicSiteResponse.json()
  const publicSiteEtag = publicSiteResponse.headers.get('etag')
  if (publicSiteConfig.identity?.name !== '白云飞' || publicSiteConfig.routes?.length !== 8 || !publicSiteEtag) throw new Error('公开站点配置、社区入口或 ETag 缺失。')
  await expectStatus(await fetch(baseUrl + '/api/site-config', { headers: { 'if-none-match': publicSiteEtag } }), 304, '站点配置缓存协商')

  const publicKnowledgeResponse = await expectStatus(await fetch(baseUrl + '/api/knowledge'), 200, '公开读取知识库')
  const publicKnowledge = await publicKnowledgeResponse.json()
  const publicKnowledgeEtag = publicKnowledgeResponse.headers.get('etag')
  if (publicKnowledge.length !== 12 || !publicKnowledgeEtag) throw new Error('公开知识库未返回 12 条种子数据或 ETag。')
  await expectStatus(await fetch(baseUrl + '/api/knowledge', { headers: { 'if-none-match': publicKnowledgeEtag } }), 304, '知识库缓存协商')
  const aiStatus = await (await expectStatus(await fetch(baseUrl + '/api/ai/status'), 200, '公开读取 AI 状态')).json()
  if (aiStatus.enabled || aiStatus.knowledgeEntries !== 12 || aiStatus.localDocuments < 10) throw new Error('AI 初始状态或本地文档索引无效。')

  const publicAnalyticsStatus = await (await expectStatus(await fetch(baseUrl + '/api/analytics/status'), 200, '公开读取访问监控状态')).json()
  if (!publicAnalyticsStatus.enabled || !publicAnalyticsStatus.respectDnt || Object.hasOwn(publicAnalyticsStatus, 'retentionDays')) {
    throw new Error('公开访问监控状态未正确脱敏或默认值无效。')
  }
  const trackedView = {
    eventId: 'analytics-view-0001', eventName: 'page_view', pagePath: '/knowledge', deviceType: 'desktop',
    referrer: 'https://www.baidu.com/s?wd=AI', loadMs: 840, ttfbMs: 120, fcpMs: 310
  }
  await expectStatus(await fetch(baseUrl + '/api/telemetry', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://invalid.example' }, body: JSON.stringify(trackedView)
  }), 403, '跨来源访问监控')
  const firstTelemetry = await expectStatus(await telemetryFetch(trackedView), 204, '记录匿名页面访问')
  const analyticsSetCookies = responseCookies(firstTelemetry)
  if (!analyticsSetCookies.some(value => value.startsWith('portal_visitor=') && value.includes('HttpOnly') && value.includes('SameSite=Lax')) ||
      !analyticsSetCookies.some(value => value.startsWith('portal_visit_session=') && value.includes('HttpOnly') && value.includes('SameSite=Lax'))) {
    throw new Error('匿名访问监控未签发受保护的访客与会话 Cookie。')
  }
  analyticsCookie = analyticsSetCookies.map(value => value.split(';', 1)[0]).join('; ')
  if (!analyticsCookie.includes('portal_visitor=') || !analyticsCookie.includes('portal_visit_session=')) throw new Error('匿名访问 Cookie 无法用于连续会话。')
  await expectStatus(await telemetryFetch(trackedView), 204, '访问事件幂等去重')
  await expectStatus(await telemetryFetch({
    eventId: 'analytics-engaged-001', eventName: 'page_engaged', pagePath: '/knowledge', deviceType: 'desktop'
  }), 204, '记录页面有效停留')
  await expectStatus(await telemetryFetch({
    eventId: 'analytics-contact-001', eventName: 'contact_intent', pagePath: '/contact', deviceType: 'desktop'
  }), 204, '记录联系意向')
  const secondTelemetry = await expectStatus(await fetch(baseUrl + '/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({
      eventId: 'analytics-view-0002', eventName: 'page_view', pagePath: '/cases', deviceType: 'mobile',
      referrer: 'https://github.com/example/project', loadMs: 1220, ttfbMs: 210, fcpMs: 460
    })
  }), 204, '记录第二位匿名访客')
  if (responseCookies(secondTelemetry).filter(value => value.startsWith('portal_')).length !== 2) throw new Error('第二位访客未获得独立匿名 Cookie。')
  await expectStatus(await telemetryFetch({
    eventId: 'analytics-case-open01', eventName: 'case_open', pagePath: '/cases', deviceType: 'desktop'
  }), 204, '记录案例访问意向')

  const anonymousResponse = await expectStatus(await communityFetch('/api/auth/session'), 200, '访客会话')
  const anonymousSession = await anonymousResponse.json()
  csrfToken = anonymousSession.csrfToken
  csrfCookie = (anonymousResponse.headers.get('set-cookie') || '').split(';', 1)[0]
  if (!csrfToken || !csrfCookie.startsWith('portal_csrf=')) throw new Error('访客 CSRF 令牌未签发。')
  if (anonymousSession.authenticated || anonymousSession.user) throw new Error('访客不应被识别为注册用户。')
  await expectStatus(await fetch(baseUrl + '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({})
  }), 403, '缺少 CSRF 令牌的注册请求')
  await expectStatus(await communityFetch('/api/comments', { method: 'POST', body: JSON.stringify({ articlePath: '/kb/blog/2025/vitepress-markdown', body: '未登录评论' }) }), 401, '访客禁止评论')
  await expectStatus(await communityFetch('/api/auth/register', {
    method: 'POST', headers: { origin: 'https://invalid.example' },
    body: JSON.stringify({ username: 'portal_user', displayName: '门户测试用户', email: 'portal@example.com', password: 'Secure-Portal-123', confirmPassword: 'Secure-Portal-123', acceptedTerms: true })
  }), 403, '跨来源注册')
  const register = await expectStatus(await communityFetch('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: 'portal_user', displayName: '门户测试用户', email: 'portal@example.com', password: 'Secure-Portal-123', confirmPassword: 'Secure-Portal-123', acceptedTerms: true, website: '' })
  }), 201, '注册社区用户')
  const registeredUser = (await register.json()).user
  const userSetCookie = register.headers.get('set-cookie') || ''
  if (!registeredUser?.id || !userSetCookie.includes('HttpOnly') || !userSetCookie.includes('SameSite=Lax')) throw new Error('注册响应或用户会话 Cookie 无效。')
  userCookie = userSetCookie.split(';', 1)[0]
  await expectStatus(await communityFetch('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: 'portal_user', displayName: '重复用户', email: 'another@example.com', password: 'Secure-Portal-123', confirmPassword: 'Secure-Portal-123', acceptedTerms: true })
  }), 409, '阻止重复用户名')
  const sessionAfterRegister = await (await expectStatus(await communityFetch('/api/auth/session'), 200, '注册后会话')).json()
  if (!sessionAfterRegister.authenticated || sessionAfterRegister.user.username !== 'portal_user') throw new Error('数据库用户会话未生效。')
  const profile = await (await expectStatus(await communityFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: '门户用户已更新', bio: '关注企业 AI 与工程实践。' }) }), 200, '更新社区资料')).json()
  if (profile.user.displayName !== '门户用户已更新' || profile.user.bio !== '关注企业 AI 与工程实践。') throw new Error('社区资料更新失败。')
  const comment = await (await expectStatus(await communityFetch('/api/comments', { method: 'POST', body: JSON.stringify({ articlePath: '/kb/blog/2025/vitepress-markdown', body: '**安全评论** <script>alert(1)</script>' }) }), 201, '注册用户发表评论')).json()
  if (!comment.id || /script/i.test(comment.bodyHtml) || !comment.bodyHtml.includes('<strong>安全评论</strong>')) throw new Error('评论内容未正确渲染或清洗。')
  const likedComment = await (await expectStatus(await communityFetch(`/api/comments/${comment.id}/like`, { method: 'POST' }), 200, '点赞文章评论')).json()
  if (!likedComment.liked || likedComment.likeCount !== 1) throw new Error('文章评论点赞失败。')
  const categories = await (await expectStatus(await communityFetch('/api/forum/categories'), 200, '读取论坛板块')).json()
  if (categories.length !== 4 || !categories.some(item => item.id === 'ai')) throw new Error('论坛默认板块缺失。')
  const post = await (await expectStatus(await communityFetch('/api/forum/posts', { method: 'POST', body: JSON.stringify({ categoryId: 'ai', title: '企业 AI 落地讨论', body: '讨论企业 AI 从知识治理到试点上线的实践路径。' }) }), 201, '注册用户发帖')).json()
  const reply = await (await expectStatus(await communityFetch(`/api/forum/posts/${post.id}/replies`, { method: 'POST', body: JSON.stringify({ body: '建议先定义可验证的业务指标。' }) }), 201, '注册用户回复')).json()
  if (!post.id || !reply.id) throw new Error('论坛发帖或回复失败。')
  const forumDetail = await (await expectStatus(await communityFetch(`/api/forum/posts/${post.id}`), 200, '读取论坛详情')).json()
  if (forumDetail.post.replyCount !== 1 || forumDetail.replies.length !== 1 || !forumDetail.post.bodyHtml.includes('实践路径')) throw new Error('论坛详情聚合失败。')
  const searchOnlyResult = await (await expectStatus(await fetch(baseUrl + '/api/rag/query', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'RAG 项目如何做知识治理？' })
  }), 200, '本地 RAG 检索')).json()
  if (searchOnlyResult.mode !== 'search' || !searchOnlyResult.sources.length || !searchOnlyResult.queryId) throw new Error('未启用 AI 时应返回本地检索结果和问答编号。')
  await expectStatus(await fetch(baseUrl + '/api/rag/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queryId: searchOnlyResult.queryId, feedback: 1 })
  }), 200, '提交问答反馈')

  await expectStatus(await adminFetch('/api/admin/cases'), 401, '未登录访问管理 API')
  await expectStatus(await adminFetch('/api/admin/site-config'), 401, '未登录访问站点配置 API')
  await expectStatus(await adminFetch('/api/admin/knowledge'), 401, '未登录访问知识管理 API')
  await expectStatus(await adminFetch('/api/admin/ai-settings'), 401, '未登录访问 AI 配置 API')
  await expectStatus(await adminFetch('/api/admin/rag-stats'), 401, '未登录访问问答统计 API')
  await expectStatus(await adminFetch('/api/admin/export'), 401, '未登录访问导出 API')
  await expectStatus(await adminFetch('/api/admin/users'), 401, '未登录访问用户管理 API')
  await expectStatus(await adminFetch('/api/admin/moderation'), 401, '未登录访问内容审核 API')
  await expectStatus(await adminFetch('/api/admin/community-settings'), 401, '未登录访问社区配置 API')
  await expectStatus(await adminFetch('/api/admin/product-metrics'), 401, '未登录访问产品指标 API')
  await expectStatus(await adminFetch('/api/admin/analytics'), 401, '未登录访问访问分析 API')
  await expectStatus(await adminFetch('/api/admin/analytics-settings'), 401, '未登录访问监控配置 API')
  await expectStatus(await adminFetch('/api/admin/login', {
    method: 'POST',
    headers: { origin: 'https://invalid.example' },
    body: JSON.stringify({ username, password })
  }), 403, '跨来源登录')

  const login = await expectStatus(await adminFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }), 200, '管理员登录')
  const setCookie = login.headers.get('set-cookie') || ''
  if (!setCookie.includes('HttpOnly') || !setCookie.includes('SameSite=Strict')) {
    throw new Error('管理会话 Cookie 缺少 HttpOnly 或 SameSite=Strict。')
  }
  cookie = setCookie.split(';', 1)[0]

  const analyticsSettingsResponse = await expectStatus(await adminFetch('/api/admin/analytics-settings'), 200, '读取访问监控配置')
  const originalAnalyticsSettings = await analyticsSettingsResponse.json()
  let analyticsSettingsRevision = analyticsSettingsResponse.headers.get('etag') || ''
  if (!originalAnalyticsSettings.enabled || !originalAnalyticsSettings.respectDnt || originalAnalyticsSettings.retentionDays !== 365 || !analyticsSettingsRevision) {
    throw new Error('访问监控配置默认值或 ETag 无效。')
  }
  const saveAnalyticsSettings = (payload, match = analyticsSettingsRevision) => adminFetch('/api/admin/analytics-settings', {
    method: 'PUT', headers: match ? { 'if-match': match } : {}, body: JSON.stringify(payload)
  })
  await expectStatus(await saveAnalyticsSettings(originalAnalyticsSettings, ''), 428, '访问监控配置缺少并发版本保护')
  const changedAnalyticsSettings = { ...originalAnalyticsSettings, retentionDays: 90 }
  const analyticsSettingsWrite = await expectStatus(await saveAnalyticsSettings(changedAnalyticsSettings), 200, '更新访问监控配置')
  analyticsSettingsRevision = analyticsSettingsWrite.headers.get('etag') || ''
  const savedAnalyticsSettings = await analyticsSettingsWrite.json()
  if (savedAnalyticsSettings.retentionDays !== 90 || !analyticsSettingsRevision || analyticsSettingsRevision === analyticsSettingsResponse.headers.get('etag')) {
    throw new Error('访问监控配置更新或 ETag 递增失败。')
  }
  await expectStatus(await saveAnalyticsSettings(originalAnalyticsSettings, analyticsSettingsResponse.headers.get('etag')), 409, '访问监控配置旧版本写入冲突')
  const analyticsReport = await (await expectStatus(await adminFetch('/api/admin/analytics?days=30'), 200, '读取访问分析')).json()
  if (analyticsReport.days !== 30 || analyticsReport.timezone !== 'Asia/Shanghai' || analyticsReport.summary.pageViews !== 2 ||
      analyticsReport.summary.visitors !== 2 || analyticsReport.summary.sessions !== 2 || analyticsReport.summary.engagedSessions !== 1 ||
      analyticsReport.summary.contactIntents !== 1 || analyticsReport.summary.caseOpens !== 1 || analyticsReport.performance.samples !== 2 ||
      analyticsReport.performance.averageLoadMs !== 1030 || analyticsReport.performance.p95LoadMs !== 1220 ||
      !analyticsReport.daily.some(item => item.pageViews === 2 && item.visitors === 2) ||
      !analyticsReport.topPages.some(item => item.pagePath === '/knowledge' && item.pageViews === 1) ||
      !analyticsReport.sources.some(item => item.source === 'search' && item.visitors === 1) ||
      !analyticsReport.sources.some(item => item.source === 'social' && item.visitors === 1) ||
      !analyticsReport.devices.some(item => item.device === 'desktop' && item.visitors === 1) ||
      !analyticsReport.devices.some(item => item.device === 'mobile' && item.visitors === 1) ||
      !analyticsReport.conversions.some(item => item.eventName === 'contact_intent' && item.events === 1)) {
    throw new Error('访问监控聚合、来源、设备、性能或转化分析无效。')
  }

  const communityStats = await (await expectStatus(await adminFetch('/api/admin/community/stats'), 200, '读取社区统计')).json()
  if (communityStats.users !== 1 || communityStats.comments !== 1 || communityStats.posts !== 5 || communityStats.replies !== 1) throw new Error('管理端社区统计无效。')
  const productMetrics = await (await expectStatus(await adminFetch('/api/admin/product-metrics?days=30'), 200, '读取产品漏斗')).json()
  if (productMetrics.registrations !== 1 || productMetrics.comments !== 1 || productMetrics.posts !== 1 || productMetrics.replies !== 1 || productMetrics.ragQueries < 1) throw new Error('产品漏斗统计无效。')
  const communitySettingsResponse = await expectStatus(await adminFetch('/api/admin/community-settings'), 200, '读取社区配置')
  const communitySettings = await communitySettingsResponse.json()
  let communitySettingsRevision = communitySettingsResponse.headers.get('etag') || ''
  if (!communitySettings.registrationEnabled || communitySettings.requireEmailVerification || !communitySettingsRevision || communitySettings.smtpPassword) throw new Error('社区安全配置默认值或脱敏无效。')
  const settingsWrite = await expectStatus(await adminFetch('/api/admin/community-settings', { method:'PUT', headers:{ 'if-match':communitySettingsRevision }, body:JSON.stringify({ ...communitySettings, publicSiteUrl:baseUrl }) }), 200, '更新社区配置')
  communitySettingsRevision = settingsWrite.headers.get('etag') || ''
  const managedUsers = await (await expectStatus(await adminFetch('/api/admin/users?search=portal'), 200, '搜索注册用户')).json()
  if (managedUsers.length !== 1 || managedUsers[0].id !== registeredUser.id) throw new Error('用户管理搜索失败。')
  const promoted = await (await expectStatus(await adminFetch(`/api/admin/users/${registeredUser.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'moderator', status: 'active' }) }), 200, '授予版主权限')).json()
  if (promoted.role !== 'moderator') throw new Error('用户角色更新失败。')
  const moderation = await (await expectStatus(await adminFetch('/api/admin/moderation'), 200, '读取待审核内容')).json()
  if (!moderation.some(item => item.id === comment.id) || !moderation.some(item => item.id === post.id)) throw new Error('内容审核列表不完整。')
  const managedPost = moderation.find(item => item.id === post.id)
  await expectStatus(await adminFetch(`/api/admin/moderation/post/${post.id}`, { method:'PATCH', body:JSON.stringify({ status:'active', pinned:true, featured:true }) }), 200, '设置论坛置顶精选')
  const pinnedPosts = await (await expectStatus(await communityFetch('/api/forum/posts'), 200, '读取置顶论坛列表')).json()
  if (!pinnedPosts.posts.find(item => item.id === post.id)?.pinned || !managedPost) throw new Error('论坛置顶精选未生效。')
  await expectStatus(await adminFetch(`/api/admin/moderation/comment/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'hidden' }) }), 200, '隐藏评论')
  const hiddenComments = await (await expectStatus(await communityFetch('/api/comments?article=%2Fkb%2Fblog%2F2025%2Fvitepress-markdown'), 200, '隐藏后读取评论')).json()
  if (hiddenComments.comments.some(item => item.id === comment.id)) throw new Error('隐藏评论仍出现在公开列表。')
  await expectStatus(await adminFetch(`/api/admin/moderation/comment/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }), 200, '恢复评论')

  const managedResponse = await expectStatus(await adminFetch('/api/admin/cases'), 200, '登录后读取案例')
  const originalCases = await managedResponse.json()
  revision = managedResponse.headers.get('etag') || ''
  if (!revision || originalCases.length !== 10) throw new Error('管理 API 未返回数据库版本或完整案例。')

  const managedSiteResponse = await expectStatus(await adminFetch('/api/admin/site-config'), 200, '登录后读取站点配置')
  const originalSiteConfig = await managedSiteResponse.json()
  let siteRevision = managedSiteResponse.headers.get('etag') || ''
  if (!siteRevision || originalSiteConfig.timeline.length !== 5) throw new Error('管理 API 未返回站点配置版本或完整时间线。')
  const saveSite = (payload, match = siteRevision) => adminFetch('/api/admin/site-config', {
    method: 'PUT', headers: match ? { 'if-match': match } : {}, body: JSON.stringify(payload)
  })
  await expectStatus(await saveSite(originalSiteConfig, ''), 428, '站点配置缺少并发版本保护')
  const changedSiteConfig = structuredClone(originalSiteConfig)
  changedSiteConfig.identity.city = '上海 / 徐州 / API 验收'
  const siteWrite = await expectStatus(await saveSite(changedSiteConfig), 200, '更新站点配置')
  siteRevision = siteWrite.headers.get('etag') || ''
  const publicChangedSite = await (await expectStatus(await fetch(baseUrl + '/api/site-config'), 200, '更新后公开读取站点配置')).json()
  if (publicChangedSite.identity.city !== changedSiteConfig.identity.city) throw new Error('站点配置更新未公开生效。')
  await expectStatus(await saveSite(originalSiteConfig, publicSiteEtag), 409, '站点配置旧版本写入冲突')
  const siteRestore = await expectStatus(await saveSite(originalSiteConfig), 200, '恢复站点配置')
  siteRevision = siteRestore.headers.get('etag') || ''

  const managedKnowledgeResponse = await expectStatus(await adminFetch('/api/admin/knowledge'), 200, '登录后读取知识库')
  const originalKnowledge = await managedKnowledgeResponse.json()
  let knowledgeRevision = managedKnowledgeResponse.headers.get('etag') || ''
  const saveKnowledge = (payload, match = knowledgeRevision) => adminFetch('/api/admin/knowledge', {
    method: 'PUT', headers: match ? { 'if-match': match } : {}, body: JSON.stringify(payload)
  })
  await expectStatus(await saveKnowledge(originalKnowledge, ''), 428, '知识库缺少并发版本保护')
  const temporaryKnowledge = {
    id: 'qa-knowledge', category: '自动化验收', title: 'RAG 验收知识', summary: '用于验证知识库配置与检索。',
    body: '星河验收词只存在于这条临时知识中，用于验证新增内容立即进入 RAG。', takeaways: ['配置生效'],
    stage: '测试', updated: '2026-09', published: true
  }
  const addKnowledge = await expectStatus(await saveKnowledge([...originalKnowledge, temporaryKnowledge]), 200, '新增知识条目')
  knowledgeRevision = addKnowledge.headers.get('etag') || ''
  const ragAfterAdd = await (await expectStatus(await fetch(baseUrl + '/api/rag/query', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: '星河验收词是什么？' })
  }), 200, '新增知识后 RAG 检索')).json()
  if (!ragAfterAdd.sources.some(source => source.id === 'qa-knowledge')) throw new Error('新增知识未进入 RAG 检索。')
  await expectStatus(await saveKnowledge(originalKnowledge, publicKnowledgeEtag), 409, '知识库旧版本写入冲突')
  const restoreKnowledge = await expectStatus(await saveKnowledge(originalKnowledge), 200, '恢复知识库')
  knowledgeRevision = restoreKnowledge.headers.get('etag') || ''

  const managedAiResponse = await expectStatus(await adminFetch('/api/admin/ai-settings'), 200, '登录后读取 AI 配置')
  const originalAi = await managedAiResponse.json()
  let aiRevision = managedAiResponse.headers.get('etag') || ''
  const saveAi = (payload, match = aiRevision) => adminFetch('/api/admin/ai-settings', {
    method: 'PUT', headers: match ? { 'if-match': match } : {}, body: JSON.stringify(payload)
  })
  await expectStatus(await saveAi(originalAi, ''), 428, 'AI 配置缺少并发版本保护')
  const configuredAi = { ...originalAi, enabled: true, provider: 'Mock AI', apiUrl: mockAiUrl, model: 'mock-rag-model', apiKey: 'encrypted-api-test-key', clearApiKey: false, allowPrivateNetwork: false }
  const aiWrite = await expectStatus(await saveAi(configuredAi), 200, '保存 AI 配置')
  aiRevision = aiWrite.headers.get('etag') || ''
  const savedAiPayload = await aiWrite.json()
  if (!savedAiPayload.apiKeySet || savedAiPayload.apiKey) throw new Error('AI 配置不应向管理前端返回 API Key 明文。')
  await expectStatus(await adminFetch('/api/admin/ai-test', { method: 'POST' }), 502, '默认阻止 AI 内网接口')
  const privateNetworkWrite = await expectStatus(await saveAi({ ...configuredAi, apiKey: '', allowPrivateNetwork: true }), 200, '显式允许 AI 内网接口')
  aiRevision = privateNetworkWrite.headers.get('etag') || ''
  await expectStatus(await adminFetch('/api/admin/ai-test', { method: 'POST' }), 200, 'AI 接口连接测试')
  const aiRagResult = await (await expectStatus(await fetch(baseUrl + '/api/rag/query', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'RAG 项目应该先做什么？' })
  }), 200, 'AI RAG 问答')).json()
  if (aiRagResult.mode !== 'ai' || !aiRagResult.answer.includes('mock-rag-model') || mockRequests < 2) throw new Error('AI RAG 调用未通过模拟接口。')

  const ragStats = await (await expectStatus(await adminFetch('/api/admin/rag-stats?days=30'), 200, '读取问答统计')).json()
  if (ragStats.summary.total < 3 || ragStats.summary.helpful !== 1 || !ragStats.recent.some(item => item.id === searchOnlyResult.queryId)) {
    throw new Error('问答统计或用户反馈未持久化。')
  }
  const securityStatus = await (await expectStatus(await adminFetch('/api/admin/security-status'), 200, '读取安全状态')).json()
  if (securityStatus.encryptionKeySource !== 'environment' || securityStatus.localOnlyHost !== true) throw new Error('安全状态信息不符合预期。')
  const exportResponse = await expectStatus(await adminFetch('/api/admin/export'), 200, '导出站点配置')
  const exported = await exportResponse.json()
  if (exported.formatVersion !== 1 || exported.ai.apiKeyIncluded !== false || exported.community.personalDataIncluded !== false || exported.analytics?.dataIncluded !== false ||
      Object.hasOwn(exported.analytics || {}, 'events') || JSON.stringify(exported).includes('encrypted-api-test-key') ||
      JSON.stringify(exported).includes('portal@example.com') || JSON.stringify(exported).includes('analytics-view-0001')) {
    throw new Error('配置导出必须完整且不能包含密钥、个人信息或匿名访问明细。')
  }
  const restoreAi = await expectStatus(await saveAi({ ...originalAi, clearApiKey: true }), 200, '恢复 AI 配置')
  aiRevision = restoreAi.headers.get('etag') || ''

  await expectStatus(await save(originalCases, ''), 428, '缺少并发版本保护')

  const temporaryCase = {
    id: 'qa-tmpa',
    category: 'delivery',
    title: '管理端验收临时案例',
    kicker: '自动化验收',
    description: '该记录只用于验证 SQLite 新增和删除事务，测试结束后销毁隔离数据库。',
    image: '/assets/cases/rag-knowledge-system.png',
    imageAlt: '管理端验收临时案例',
    tags: ['验收'],
    nasUrl: 'https://nas.example.invalid/qa'
  }
  const competingCase = { ...temporaryCase, id: 'qa-tmpb', title: '并发写入验收案例' }
  const [writeA, writeB] = await Promise.all([
    save([...originalCases, temporaryCase], revision),
    save([...originalCases, competingCase], revision)
  ])
  const writeStatuses = [writeA.status, writeB.status].sort((left, right) => left - right)
  if (writeStatuses[0] !== 200 || writeStatuses[1] !== 409) {
    throw new Error(`并发写入应分别返回 200/409，实际为 ${writeStatuses.join('/')}`)
  }
  const acceptedWrite = writeA.status === 200 ? writeA : writeB
  revision = acceptedWrite.headers.get('etag') || ''
  const afterAdd = await (await expectStatus(await fetch(baseUrl + '/api/cases'), 200, '新增后公开读取')).json()
  if (afterAdd.length !== originalCases.length + 1 || !afterAdd.some(item => ['qa-tmpa', 'qa-tmpb'].includes(item.id))) {
    throw new Error('新增案例未通过数据库公开读取生效。')
  }

  const remove = await expectStatus(await save(originalCases), 200, '删除临时案例')
  revision = remove.headers.get('etag') || ''
  const afterDelete = await (await expectStatus(await fetch(baseUrl + '/api/cases'), 200, '删除后公开读取')).json()
  if (afterDelete.length !== originalCases.length || afterDelete.some(item => ['qa-tmpa', 'qa-tmpb'].includes(item.id))) {
    throw new Error('删除案例后数据库未恢复。')
  }

  await expectStatus(await adminFetch(`/api/admin/users/${registeredUser.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'member', status: 'suspended' }) }), 200, '停用社区用户')
  const suspendedSession = await (await expectStatus(await communityFetch('/api/auth/session'), 200, '停用后会话失效')).json()
  if (suspendedSession.authenticated) throw new Error('停用账号未立即注销数据库会话。')
  userCookie = ''
  await expectStatus(await adminFetch(`/api/admin/users/${registeredUser.id}`, { method: 'DELETE' }), 200, '删除社区用户')
  await expectStatus(await communityFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identity: 'portal_user', password: 'Secure-Portal-123' }) }), 401, '已删除用户不能登录')

  await expectStatus(await adminFetch('/api/admin/logout', { method: 'POST' }), 200, '退出登录')
  cookie = ''
  await expectStatus(await adminFetch('/api/admin/cases'), 401, '退出后访问管理 API')
  await expectStatus(await adminFetch('/api/admin/site-config'), 401, '退出后访问站点配置 API')
  await expectStatus(await adminFetch('/api/admin/knowledge'), 401, '退出后访问知识管理 API')
  await expectStatus(await adminFetch('/api/admin/ai-settings'), 401, '退出后访问 AI 配置 API')

  const databaseFile = join(testDataDir, 'portal.sqlite')
  const backups = readdirSync(join(testDataDir, 'backups')).filter(file => file.endsWith('.sqlite'))
  if (!existsSync(databaseFile) || statSync(databaseFile).size === 0 || backups.length < 2 || backups.length > 3) {
    throw new Error('数据库文件或轮换备份不符合预期。')
  }

  console.log(`SQLite migration: ${originalCases.length} seed cases`)
  console.log('SQLite WAL/schema/health: verified')
  console.log('Public API ETag/304: verified')
  console.log('Public site configuration ETag/304: verified')
  console.log('Unauthenticated admin API: 401')
  console.log('Cross-origin login: 403')
  console.log('Protected session cookie: verified')
  console.log('Optimistic concurrency and serialized writes: 428/409 verified')
  console.log('Site configuration update/restore: verified')
  console.log('Knowledge CRUD and live RAG retrieval: verified')
  console.log('RAG query log, statistics and feedback: verified')
  console.log('Security status and secret-free export: verified')
  console.log('First-party anonymous analytics, aggregate dashboard and secret-free export: verified')
  console.log('Private-network AI endpoint opt-in: verified')
  console.log('Encrypted AI configuration and mock completion: verified')
  console.log(`Transactional create/delete: verified (${originalCases.length} -> ${originalCases.length + 1} -> ${originalCases.length})`)
  console.log('Rotating database backups: verified')
  console.log('Logout invalidation: verified')
  console.log('Visitor, registration, persistent session and profile: verified')
  console.log('Knowledge comments, likes and safe Markdown: verified')
  console.log('Forum categories, posts and replies: verified')
  console.log('User roles, suspension, deletion and content moderation: verified')
} finally {
  if (child.exitCode === null) child.kill()
  await new Promise(resolveExit => {
    if (child.exitCode !== null) resolveExit()
    else child.once('exit', resolveExit)
  })
  await new Promise(resolveClose => mockAiServer.close(resolveClose))
  rmSync(testDataDir, { recursive: true, force: true })
}
