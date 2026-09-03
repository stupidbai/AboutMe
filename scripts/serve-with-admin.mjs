import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { DatabaseConflictError, PortalDatabase } from './database.mjs'
import { RagService } from './rag-service.mjs'
import {
  contentExcerpt, hashPassword, normalizeArticlePath, publicUser, renderCommunityContent, validateComment,
  validateForumPost, validateForumReply, validateLogin, validatePasswordChange,
  validateProfile, validateRegistration, validateResetPassword, verifyPassword
} from './community-service.mjs'
import { publicCommunitySettings } from './community-settings.mjs'
import { sendPasswordResetEmail, sendVerificationEmail, testSmtpConnection } from './email-service.mjs'

const root = resolve(import.meta.dirname, '..')
const distRoot = resolve(root, 'dist')
const envFile = resolve(root, '.env.local')
const seedFile = resolve(root, 'config/cases.json')
const siteConfigSeedFile = resolve(root, 'config/site-config.json')
const knowledgeSeedFile = resolve(root, 'config/knowledge.json')
const sessionCookieName = 'case_admin_session'
const userSessionCookieName = 'portal_user_session'
const csrfCookieName = 'portal_csrf'
const analyticsVisitorCookieName = 'portal_visitor'
const analyticsSessionCookieName = 'portal_visit_session'
const sessions = new Map()
const loginAttempts = new Map()
const ragAttempts = new Map()
const registrationAttempts = new Map()
const userLoginAttempts = new Map()
const communityWriteAttempts = new Map()
const telemetryAttempts = new Map()

if (existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    if (/^[A-Z0-9_]+$/.test(key) && process.env[key] === undefined) process.env[key] = value
  }
}

const adminUsername = process.env.CASE_ADMIN_USERNAME || 'admin'
const adminPassword = process.env.CASE_ADMIN_PASSWORD || ''
const host = process.env.CASE_ADMIN_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.CASE_ADMIN_PORT || '4173', 10)
const dataDir = resolve(root, process.env.CASE_DATA_DIR || 'data')
const backupLimit = Number.parseInt(process.env.CASE_BACKUP_LIMIT || '10', 10)
const sessionHours = Math.max(1, Math.min(Number.parseInt(process.env.CASE_SESSION_HOURS || '8', 10) || 8, 72))
const sessionLifetimeMs = sessionHours * 60 * 60 * 1000
const userSessionDays = Math.max(1, Math.min(Number.parseInt(process.env.COMMUNITY_SESSION_DAYS || '30', 10) || 30, 90))
const userSessionLifetimeMs = userSessionDays * 24 * 60 * 60 * 1000
const analyticsSessionLifetimeSeconds = 30 * 60
const weakAdminPassword = ['admin123', 'password', '12345678', 'replace-with-at-least-8-characters'].includes(adminPassword.toLowerCase())
const localOnlyHost = ['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase())

if (!existsSync(distRoot)) throw new Error('缺少 dist 构建目录，请先运行 npm run build。')
if (!existsSync(seedFile)) throw new Error('缺少 config/cases.json。')
if (!existsSync(siteConfigSeedFile)) throw new Error('缺少 config/site-config.json。')
if (!existsSync(knowledgeSeedFile)) throw new Error('缺少 config/knowledge.json。')
if (adminPassword.length < 8) throw new Error('请设置至少 8 位的 CASE_ADMIN_PASSWORD。')
if (!localOnlyHost && weakAdminPassword && process.env.ALLOW_INSECURE_ADMIN !== 'true') {
  throw new Error('非本机监听禁止使用默认弱密码，请设置强 CASE_ADMIN_PASSWORD。')
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CASE_ADMIN_PORT 必须是 1-65535 的端口号。')

const loadEncryptionSecret = () => {
  if (process.env.PORTAL_ENCRYPTION_KEY) return { secret: process.env.PORTAL_ENCRYPTION_KEY, source: 'environment' }
  mkdirSync(dataDir, { recursive: true })
  const keyFile = join(dataDir, '.portal-encryption-key')
  if (!existsSync(keyFile)) {
    writeFileSync(keyFile, randomBytes(48).toString('hex'), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  }
  try { chmodSync(keyFile, 0o600) } catch {}
  return { secret: readFileSync(keyFile, 'utf8').trim(), source: 'data-file' }
}
const encryption = loadEncryptionSecret()

const portalDatabase = new PortalDatabase({
  dataDir,
  seedFile,
  siteConfigSeedFile,
  knowledgeSeedFile,
  encryptionSecret: encryption.secret,
  backupLimit
})
const ragService = new RagService({ distRoot })
const dummyPasswordHash = await hashPassword('Portal-Dummy-Password-1')

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
}

const securityHeaders = {
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
}

const sendJson = (response, status, payload, headers = {}) => {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...securityHeaders,
    ...headers
  })
  response.end([204, 304].includes(status) ? undefined : JSON.stringify(payload))
}

const readJsonBody = (request, limit = 1024 * 1024) => new Promise((resolveBody, rejectBody) => {
  const chunks = []
  let size = 0
  let settled = false
  request.on('data', chunk => {
    if (settled) return
    size += chunk.length
    if (size > limit) {
      settled = true
      rejectBody(new Error('请求内容过大。'))
      return
    }
    chunks.push(chunk)
  })
  request.on('end', () => {
    if (settled) return
    try {
      resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
    } catch {
      rejectBody(new Error('请求 JSON 格式无效。'))
    }
  })
  request.on('error', rejectBody)
})

const hashText = value => createHash('sha256').update(String(value)).digest()
const safeEqual = (left, right) => timingSafeEqual(hashText(left), hashText(right))
const revisionTag = (kind, revision) => `"${kind}-${revision}"`
const parseRevisionTag = (value, kind) => {
  const match = String(value || '').match(new RegExp(`^(?:W\\/)?"${kind}-(\\d+)"$`))
  return match ? Number(match[1]) : undefined
}

const getProtocol = request => {
  const forwarded = request.headers['x-forwarded-proto']
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  return request.socket.encrypted ? 'https' : 'http'
}

const sameOrigin = request => {
  const origin = request.headers.origin
  if (!origin) return true
  return origin === getProtocol(request) + '://' + request.headers.host
}

const trustedTelemetryOrigin = request => {
  const expectedOrigin = getProtocol(request) + '://' + request.headers.host
  if (request.headers.origin) return request.headers.origin === expectedOrigin
  try { return new URL(String(request.headers.referer || '')).origin === expectedOrigin } catch { return false }
}

const parseCookies = request => Object.fromEntries(
  String(request.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf('=')
      return separator < 0 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]
    })
)

const getSession = request => {
  const token = parseCookies(request)[sessionCookieName]
  if (!token) return null
  const session = sessions.get(token)
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return { token, ...session }
}

const createSessionCookie = (request, token) => [
  sessionCookieName + '=' + encodeURIComponent(token),
  'HttpOnly',
  'SameSite=Strict',
  'Path=/',
  'Max-Age=' + Math.floor(sessionLifetimeMs / 1000),
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')

const clearSessionCookie = request => [
  sessionCookieName + '=',
  'HttpOnly',
  'SameSite=Strict',
  'Path=/',
  'Max-Age=0',
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')

const communitySessionTokenHash = token => createHash('sha256').update('community|' + token).digest('hex')
const requestHash = (request, kind) => createHash('sha256')
  .update(encryption.secret + '|' + kind + '|' + (request.socket.remoteAddress || 'unknown'))
  .digest('hex')

const analyticsTokenHash = (kind, token) => createHash('sha256')
  .update(encryption.secret + '|analytics|' + kind + '|' + token)
  .digest('hex')
const validAnalyticsToken = token => /^[a-f0-9]{64}$/.test(String(token || ''))
const createAnalyticsCookie = (request, name, value, maxAge, httpOnly = true) => [
  name + '=' + encodeURIComponent(value),
  ...(httpOnly ? ['HttpOnly'] : []),
  'SameSite=Lax',
  'Path=/',
  'Max-Age=' + maxAge,
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')
const analyticsIdentity = request => {
  const cookies = parseCookies(request)
  const visitor = validAnalyticsToken(cookies[analyticsVisitorCookieName]) ? cookies[analyticsVisitorCookieName] : randomBytes(32).toString('hex')
  const session = validAnalyticsToken(cookies[analyticsSessionCookieName]) ? cookies[analyticsSessionCookieName] : randomBytes(32).toString('hex')
  return {
    visitorHash: analyticsTokenHash('visitor', visitor),
    sessionHash: analyticsTokenHash('session', session),
    cookies: [
      createAnalyticsCookie(request, analyticsVisitorCookieName, visitor, 365 * 24 * 60 * 60),
      createAnalyticsCookie(request, analyticsSessionCookieName, session, analyticsSessionLifetimeSeconds)
    ]
  }
}

const normalizeTrackedPath = value => {
  const path = String(value || '').trim().split(/[?#]/, 1)[0]
  if (!path.startsWith('/') || path.startsWith('/api/') || path.startsWith('/admin/') || path.length > 300) return ''
  if (!/^\/[a-zA-Z0-9_./-]*$/.test(path)) return ''
  return path || '/'
}
const normalizeReferrerDomain = (value, request) => {
  if (!value) return ''
  try {
    const hostname = new URL(String(value)).hostname.toLowerCase().slice(0, 253)
    return hostname === String(request.headers.host || '').split(':')[0].toLowerCase() ? '' : hostname
  } catch { return '' }
}
const normalizeUtmSource = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80)
const classifyAcquisition = (domain, utmSource) => {
  if (utmSource) return 'utm:' + utmSource
  if (!domain) return 'direct'
  if (/(baidu|google|bing|sogou|so\.com|yandex)/.test(domain)) return 'search'
  if (/(weixin|wechat|douyin|xiaohongshu|zhihu|weibo|bilibili|linkedin|twitter|x\.com|github)/.test(domain)) return 'social'
  return 'referral'
}
const likelyBot = request => /bot|crawler|spider|slurp|facebookexternalhit|lighthouse|headlesschrome/i.test(String(request.headers['user-agent'] || ''))
const normalizeTelemetry = (payload, request) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('监控事件格式无效。')
  const eventId = String(payload.eventId || '')
  const eventName = String(payload.eventName || '')
  const pagePath = normalizeTrackedPath(payload.pagePath)
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(eventId)) throw new Error('监控事件标识无效。')
  if (!pagePath) throw new Error('监控页面地址无效。')
  if (!['page_view', 'page_engaged', 'contact_intent', 'case_open', 'forum_open', 'rag_query', 'account_open', 'knowledge_open'].includes(eventName)) {
    throw new Error('监控事件类型无效。')
  }
  const deviceType = ['desktop', 'mobile', 'tablet', 'other'].includes(payload.deviceType) ? payload.deviceType : 'other'
  const numeric = value => Math.max(0, Math.min(120000, Math.round(Number(value) || 0)))
  const referrerDomain = normalizeReferrerDomain(payload.referrer, request)
  const utmSource = normalizeUtmSource(payload.utmSource)
  return {
    eventId, eventName, pagePath, deviceType, referrerDomain: '',
    acquisitionSource: classifyAcquisition(referrerDomain, utmSource),
    loadMs: numeric(payload.loadMs), ttfbMs: numeric(payload.ttfbMs), fcpMs: numeric(payload.fcpMs)
  }
}

const createCommunitySession = (request, userId) => {
  const token = randomBytes(32).toString('hex')
  const tokenHash = communitySessionTokenHash(token)
  portalDatabase.createCommunitySession({
    tokenHash,
    userId,
    ipHash: requestHash(request, 'ip'),
    userAgentHash: createHash('sha256').update(String(request.headers['user-agent'] || '')).digest('hex'),
    expiresAt: new Date(Date.now() + userSessionLifetimeMs).toISOString()
  })
  return { token, tokenHash }
}

const createCommunitySessionCookie = (request, token) => [
  userSessionCookieName + '=' + encodeURIComponent(token),
  'HttpOnly',
  'SameSite=Lax',
  'Path=/',
  'Max-Age=' + Math.floor(userSessionLifetimeMs / 1000),
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')

const clearCommunitySessionCookie = request => [
  userSessionCookieName + '=',
  'HttpOnly',
  'SameSite=Lax',
  'Path=/',
  'Max-Age=0',
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')

const signCsrf = token => `${token}.${createHmac('sha256', encryption.secret).update('csrf|' + token).digest('base64url')}`
const validCsrfCookie = value => {
  const [token, signature] = String(value || '').split('.')
  if (!/^[a-f0-9]{32}$/.test(token || '') || !signature) return false
  return safeEqual(signature, signCsrf(token).split('.')[1])
}
const csrfForRequest = request => {
  const existing = parseCookies(request)[csrfCookieName]
  return validCsrfCookie(existing) ? existing : signCsrf(randomBytes(16).toString('hex'))
}
const createCsrfCookie = (request, value) => [
  csrfCookieName + '=' + encodeURIComponent(value),
  'SameSite=Strict',
  'Path=/',
  'Max-Age=' + Math.floor(userSessionLifetimeMs / 1000),
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')
const validCommunityWrite = request => {
  if (!sameOrigin(request)) return false
  const cookie = parseCookies(request)[csrfCookieName]
  return validCsrfCookie(cookie) && safeEqual(cookie, String(request.headers['x-csrf-token'] || ''))
}

const hashOneTimeToken = token => createHash('sha256').update('community-token|' + token).digest('hex')
const issueCommunityToken = (type, userId) => {
  const token = randomBytes(32).toString('base64url')
  portalDatabase.createCommunityToken({
    id: randomBytes(12).toString('hex'), tokenHash: hashOneTimeToken(token), type, userId,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  })
  return token
}

const verifyTurnstile = async (settings, token, request) => {
  if (!settings.turnstileEnabled) return true
  if (!settings.turnstileSecret || !token) return false
  const body = new URLSearchParams({ secret: settings.turnstileSecret, response: String(token), remoteip: request.socket.remoteAddress || '' })
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000)
  })
  return result.ok && Boolean((await result.json()).success)
}

const getCommunitySession = request => {
  const token = parseCookies(request)[userSessionCookieName]
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const session = portalDatabase.getCommunitySession(communitySessionTokenHash(token))
  if (!session || session.user.status !== 'active') {
    if (session) portalDatabase.deleteCommunitySession(session.tokenHash)
    return null
  }
  return session
}

const publicSessionUser = user => user ? ({ ...publicUser(user), email: user.email }) : null
const canModerate = session => session?.user?.role === 'moderator'

const checkRateLimit = (store, key, limit, windowMs) => {
  const now = Date.now()
  const current = store.get(key)
  const entry = current?.resetAt > now ? current : { count: 0, resetAt: now + windowMs }
  if (entry.count >= limit) return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  entry.count += 1
  store.set(key, entry)
  return { allowed: true, retryAfter: 0 }
}

const requireCommunityUser = (request, response) => {
  const session = getCommunitySession(request)
  if (!session) sendJson(response, 401, { error: '请先注册或登录后再参与互动。' })
  return session
}

const commentPayload = comment => ({
  ...comment,
  bodyHtml: comment.status === 'deleted' ? '' : renderCommunityContent(comment.body),
  body: undefined
})

const forumPostPayload = post => ({
  ...post,
  excerpt: contentExcerpt(post.excerpt ?? post.body, 220),
  bodyHtml: post.body === undefined ? undefined : renderCommunityContent(post.body),
  body: undefined
})

const forumReplyPayload = reply => ({
  ...reply,
  bodyHtml: reply.status === 'deleted' ? '' : renderCommunityContent(reply.body),
  body: undefined
})

const serveStatic = (request, response, pathname) => {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders })
    response.end('Bad request')
    return
  }
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidates = extname(relativePath)
    ? [relativePath]
    : [relativePath, relativePath + '.html', relativePath + '/index.html']
  const file = candidates
    .map(candidate => resolve(distRoot, candidate))
    .find(candidate => candidate.startsWith(distRoot + sep) && existsSync(candidate) && statSync(candidate).isFile())
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders })
    response.end('Not found')
    return
  }
  const stat = statSync(file)
  const etag = 'W/"' + stat.size + '-' + Math.floor(stat.mtimeMs) + '"'
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { etag, ...securityHeaders })
    response.end()
    return
  }
  response.writeHead(200, {
    'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'content-length': stat.size,
    'content-type': mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream',
    etag,
    ...securityHeaders
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(file).pipe(response)
}

const handleRequest = async (request, response) => {
  const url = new URL(request.url || '/', 'http://' + (request.headers.host || 'localhost'))
  const pathname = url.pathname

  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, {
      status: 'ok',
      database: portalDatabase.getHealth(),
      uptimeSeconds: Math.floor(process.uptime()),
      platform: process.platform,
      node: process.version
    })
    return
  }

  if (pathname === '/api/cases' && request.method === 'GET') {
    const snapshot = portalDatabase.getSnapshot()
    const etag = revisionTag('cases', snapshot.revision)
    if (request.headers['if-none-match'] === etag) {
      sendJson(response, 304, null, { etag })
      return
    }
    sendJson(response, 200, snapshot.cases, { etag })
    return
  }

  if (pathname === '/api/site-config' && request.method === 'GET') {
    const snapshot = portalDatabase.getSiteConfigSnapshot()
    const etag = revisionTag('site-config', snapshot.revision)
    if (request.headers['if-none-match'] === etag) {
      sendJson(response, 304, null, { etag })
      return
    }
    sendJson(response, 200, snapshot.config, { etag })
    return
  }

  if (pathname === '/api/knowledge' && request.method === 'GET') {
    const snapshot = portalDatabase.getKnowledgeSnapshot({ publishedOnly: true })
    const etag = revisionTag('knowledge', snapshot.revision)
    if (request.headers['if-none-match'] === etag) {
      sendJson(response, 304, null, { etag })
      return
    }
    sendJson(response, 200, snapshot.entries, { etag })
    return
  }

  if (pathname === '/api/ai/status' && request.method === 'GET') {
    const settings = portalDatabase.getAiSettings()
    sendJson(response, 200, {
      enabled: settings.enabled,
      provider: settings.enabled ? settings.provider : '',
      model: settings.enabled ? settings.model : '',
      localDocuments: ragService.staticDocuments.length,
      knowledgeEntries: portalDatabase.getHealth().knowledgeCount,
      retrievalEngine: 'MiniSearch 7.2.0'
    })
    return
  }

  if (pathname === '/api/analytics/status' && request.method === 'GET') {
    const settings = portalDatabase.getAnalyticsSettings()
    sendJson(response, 200, { enabled: settings.enabled, respectDnt: settings.respectDnt })
    return
  }

  if (pathname === '/api/telemetry' && request.method === 'POST') {
    if (!trustedTelemetryOrigin(request)) { sendJson(response, 403, { error: '请求来源无效。' }); return }
    const settings = portalDatabase.getAnalyticsSettings()
    if (!settings.enabled || (settings.respectDnt && String(request.headers.dnt || '') === '1') || likelyBot(request)) {
      sendJson(response, 204, null)
      return
    }
    const limit = checkRateLimit(telemetryAttempts, requestHash(request, 'telemetry'), 180, 10 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '访问事件过多，请稍后再试。' }, { 'retry-after': String(limit.retryAfter) }); return }
    try {
      const event = normalizeTelemetry(await readJsonBody(request, 8 * 1024), request)
      const identity = analyticsIdentity(request)
      portalDatabase.recordSiteEvent({ ...event, visitorHash: identity.visitorHash, sessionHash: identity.sessionHash })
      portalDatabase.maybePruneAnalyticsEvents()
      sendJson(response, 204, null, { 'set-cookie': identity.cookies })
    } catch (error) {
      sendJson(response, 400, { error: error.message || '访问事件无效。' })
    }
    return
  }

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const session = getCommunitySession(request)
    const csrfToken = csrfForRequest(request)
    sendJson(response, 200, { authenticated: Boolean(session), user: publicSessionUser(session?.user), sessionDays: userSessionDays, csrfToken }, {
      'set-cookie': createCsrfCookie(request, csrfToken)
    })
    return
  }

  if (pathname === '/api/community/status' && request.method === 'GET') {
    sendJson(response, 200, publicCommunitySettings(portalDatabase.getCommunitySettings()))
    return
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const limit = checkRateLimit(registrationAttempts, requestHash(request, 'register'), 5, 60 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '注册尝试过多，请稍后再试。' }, { 'retry-after': String(limit.retryAfter) }); return }
    try {
      const body = await readJsonBody(request, 32 * 1024)
      const settings = portalDatabase.getCommunitySettings({ includeSecrets: true })
      if (!settings.registrationEnabled) { sendJson(response, 403, { error: '当前暂未开放新用户注册。' }); return }
      if (!await verifyTurnstile(settings, body.turnstileToken, request)) { sendJson(response, 400, { error: '人机验证未通过，请重试。' }); return }
      const registration = validateRegistration(body)
      const id = randomBytes(12).toString('hex')
      const user = portalDatabase.createCommunityUser({
        id, username: registration.username, email: registration.email, displayName: registration.displayName,
        passwordHash: await hashPassword(registration.password), emailVerified: !settings.requireEmailVerification
      })
      portalDatabase.recordProductEvent('register_complete', { userId: id })
      if (settings.requireEmailVerification) {
        const token = issueCommunityToken('verify_email', id)
        await sendVerificationEmail(settings, { to: registration.email, displayName: registration.displayName, token })
        sendJson(response, 201, { ok: true, requiresEmailVerification: true, message: '验证邮件已发送，请在 30 分钟内完成验证。' })
        return
      }
      const session = createCommunitySession(request, id)
      sendJson(response, 201, { ok: true, user: publicSessionUser({ ...user, email: registration.email }) }, {
        'set-cookie': createCommunitySessionCookie(request, session.token)
      })
    } catch (error) {
      const message = String(error.message || '')
      if (/community_users\.username|UNIQUE constraint failed: community_users\.username/i.test(message)) sendJson(response, 409, { error: '该用户名已被使用。' })
      else if (/community_users\.email|UNIQUE constraint failed: community_users\.email/i.test(message)) sendJson(response, 409, { error: '该邮箱已注册。' })
      else sendJson(response, 400, { error: message || '注册失败。' })
    }
    return
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const addressKey = requestHash(request, 'user-login')
    const limit = checkRateLimit(userLoginAttempts, addressKey, 10, 15 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '登录尝试过多，请十五分钟后再试。' }, { 'retry-after': String(limit.retryAfter) }); return }
    try {
      const credentials = validateLogin(await readJsonBody(request, 16 * 1024))
      const user = portalDatabase.getCommunityUserByIdentity(credentials.identity, { includePrivate: true })
      const valid = await verifyPassword(credentials.password, user?.passwordHash || dummyPasswordHash)
      if (!user || !valid) { sendJson(response, 401, { error: '账号或密码错误。' }); return }
      if (user.status !== 'active') { sendJson(response, 403, { error: '账号已被停用，请联系管理员。' }); return }
      if (portalDatabase.getCommunitySettings().requireEmailVerification && !user.emailVerified) { sendJson(response, 403, { error: '请先通过验证邮件完成邮箱验证。', code: 'email_unverified' }); return }
      userLoginAttempts.delete(addressKey)
      portalDatabase.updateCommunityLastLogin(user.id)
      portalDatabase.recordProductEvent('login', { userId: user.id })
      const session = createCommunitySession(request, user.id)
      sendJson(response, 200, { ok: true, user: publicSessionUser(user) }, { 'set-cookie': createCommunitySessionCookie(request, session.token) })
    } catch (error) {
      sendJson(response, 400, { error: error.message })
    }
    return
  }

  if (pathname === '/api/auth/verify-email' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    try {
      const body = await readJsonBody(request, 8 * 1024)
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      const user = token && portalDatabase.consumeCommunityToken('verify_email', hashOneTimeToken(token))
      if (!user) { sendJson(response, 400, { error: '验证链接无效或已过期。' }); return }
      const verified = portalDatabase.markCommunityEmailVerified(user.id)
      portalDatabase.recordProductEvent('email_verified', { userId: user.id })
      const session = createCommunitySession(request, user.id)
      sendJson(response, 200, { ok: true, user: publicSessionUser(verified) }, { 'set-cookie': createCommunitySessionCookie(request, session.token) })
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  if (pathname === '/api/auth/resend-verification' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const limit = checkRateLimit(registrationAttempts, requestHash(request, 'resend'), 3, 60 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '发送过于频繁，请稍后再试。' }); return }
    try {
      const body = await readJsonBody(request, 8 * 1024)
      const identity = String(body.identity || '').trim().toLowerCase()
      const user = portalDatabase.getCommunityUserByIdentity(identity, { includePrivate: true })
      const settings = portalDatabase.getCommunitySettings({ includeSecrets: true })
      if (user && !user.emailVerified && settings.requireEmailVerification) {
        await sendVerificationEmail(settings, { to: user.email, displayName: user.displayName, token: issueCommunityToken('verify_email', user.id) })
      }
      sendJson(response, 200, { ok: true, message: '如果账号需要验证，邮件将很快送达。' })
    } catch (error) { console.error('[email-error] ' + error.message); sendJson(response, 200, { ok: true, message: '如果账号需要验证，邮件将很快送达。' }) }
    return
  }

  if (pathname === '/api/auth/forgot-password' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const limit = checkRateLimit(userLoginAttempts, requestHash(request, 'forgot'), 3, 60 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '请求过于频繁，请稍后再试。' }); return }
    try {
      const body = await readJsonBody(request, 8 * 1024)
      const user = portalDatabase.getCommunityUserByIdentity(String(body.identity || '').trim().toLowerCase(), { includePrivate: true })
      const settings = portalDatabase.getCommunitySettings({ includeSecrets: true })
      if (user && settings.smtpHost && settings.smtpFrom) {
        await sendPasswordResetEmail(settings, { to: user.email, displayName: user.displayName, token: issueCommunityToken('reset_password', user.id) })
      }
    } catch (error) { console.error('[email-error] ' + error.message) }
    sendJson(response, 200, { ok: true, message: '如果账号存在，重置邮件将很快送达。' })
    return
  }

  if (pathname === '/api/auth/reset-password' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    try {
      const reset = validateResetPassword(await readJsonBody(request, 16 * 1024))
      const user = portalDatabase.consumeCommunityToken('reset_password', hashOneTimeToken(reset.token))
      if (!user) { sendJson(response, 400, { error: '重置链接无效或已过期。' }); return }
      portalDatabase.updateCommunityPassword(user.id, await hashPassword(reset.password))
      portalDatabase.deleteCommunitySessions(user.id)
      sendJson(response, 200, { ok: true, message: '密码已重置，请使用新密码登录。' })
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const token = parseCookies(request)[userSessionCookieName]
    if (token) portalDatabase.deleteCommunitySession(communitySessionTokenHash(token))
    sendJson(response, 200, { ok: true }, { 'set-cookie': clearCommunitySessionCookie(request) })
    return
  }

  if (pathname === '/api/auth/profile' && request.method === 'PUT') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    try {
      const profile = validateProfile(await readJsonBody(request, 16 * 1024))
      const user = portalDatabase.updateCommunityProfile(session.user.id, profile)
      sendJson(response, 200, { ok: true, user: publicSessionUser(user) })
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  if (pathname === '/api/auth/password' && request.method === 'PUT') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    try {
      const passwords = validatePasswordChange(await readJsonBody(request, 16 * 1024))
      if (!await verifyPassword(passwords.currentPassword, session.user.passwordHash)) { sendJson(response, 401, { error: '当前密码不正确。' }); return }
      portalDatabase.updateCommunityPassword(session.user.id, await hashPassword(passwords.newPassword))
      portalDatabase.deleteCommunitySessions(session.user.id, session.tokenHash)
      sendJson(response, 200, { ok: true })
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  if (pathname === '/api/comments' && request.method === 'GET') {
    try {
      const articlePath = normalizeArticlePath(url.searchParams.get('article') || '')
      const viewer = getCommunitySession(request)
      const comments = portalDatabase.listArticleComments(articlePath, viewer?.user.id || '').map(commentPayload)
      sendJson(response, 200, { articlePath, count: comments.filter(item => item.status === 'active').length, comments })
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  if (pathname === '/api/comments' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    const limit = checkRateLimit(communityWriteAttempts, `comment|${session.user.id}`, 20, 10 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '评论过于频繁，请稍后再试。' }); return }
    try {
      const comment = validateComment(await readJsonBody(request, 32 * 1024))
      const id = randomBytes(12).toString('hex')
      portalDatabase.createArticleComment({ id, ...comment, userId: session.user.id })
      portalDatabase.recordProductEvent('comment_created', { userId: session.user.id, context: comment.articlePath })
      const created = portalDatabase.listArticleComments(comment.articlePath, session.user.id).find(item => item.id === id)
      sendJson(response, 201, commentPayload(created))
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  const commentLikeMatch = pathname.match(/^\/api\/comments\/([a-f0-9]{24})\/like$/)
  if (commentLikeMatch && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    try { sendJson(response, 200, portalDatabase.toggleArticleCommentLike(commentLikeMatch[1], session.user.id)) }
    catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  const commentDeleteMatch = pathname.match(/^\/api\/comments\/([a-f0-9]{24})$/)
  if (commentDeleteMatch && request.method === 'DELETE') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    const comment = portalDatabase.getArticleComment(commentDeleteMatch[1])
    if (!comment) { sendJson(response, 404, { error: '评论不存在。' }); return }
    if (comment.user_id !== session.user.id && !canModerate(session)) { sendJson(response, 403, { error: '无权删除该评论。' }); return }
    portalDatabase.setArticleCommentStatus(comment.id, 'deleted', { actorType: 'user', actorId: session.user.id })
    sendJson(response, 200, { ok: true })
    return
  }

  if (pathname === '/api/forum/categories' && request.method === 'GET') {
    sendJson(response, 200, portalDatabase.getForumCategories())
    return
  }

  if (pathname === '/api/forum/posts' && request.method === 'GET') {
    const viewer = getCommunitySession(request)
    const result = portalDatabase.listForumPosts({
      categoryId: String(url.searchParams.get('category') || '').slice(0, 40),
      query: String(url.searchParams.get('q') || '').slice(0, 100),
      page: url.searchParams.get('page') || 1,
      viewerUserId: viewer?.user.id || ''
    })
    sendJson(response, 200, { ...result, posts: result.posts.map(forumPostPayload) })
    return
  }

  if (pathname === '/api/forum/posts' && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    const limit = checkRateLimit(communityWriteAttempts, `post|${session.user.id}`, 8, 60 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '发帖过于频繁，请稍后再试。' }); return }
    try {
      const post = validateForumPost(await readJsonBody(request, 64 * 1024))
      const id = randomBytes(12).toString('hex')
      portalDatabase.createForumPost({ id, ...post, userId: session.user.id })
      portalDatabase.recordProductEvent('forum_post_created', { userId: session.user.id, context: post.categoryId })
      sendJson(response, 201, forumPostPayload(portalDatabase.getForumPost(id, session.user.id)))
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  const forumPostMatch = pathname.match(/^\/api\/forum\/posts\/([a-f0-9]{24})$/)
  if (forumPostMatch && request.method === 'GET') {
    const viewer = getCommunitySession(request)
    const post = portalDatabase.getForumPost(forumPostMatch[1], viewer?.user.id || '', { incrementView: true })
    if (!post) { sendJson(response, 404, { error: '帖子不存在或已不可用。' }); return }
    sendJson(response, 200, {
      post: forumPostPayload(post),
      replies: portalDatabase.listForumReplies(post.id, viewer?.user.id || '').map(forumReplyPayload)
    })
    return
  }

  const forumReplyCreateMatch = pathname.match(/^\/api\/forum\/posts\/([a-f0-9]{24})\/replies$/)
  if (forumReplyCreateMatch && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    const limit = checkRateLimit(communityWriteAttempts, `reply|${session.user.id}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) { sendJson(response, 429, { error: '回复过于频繁，请稍后再试。' }); return }
    try {
      const reply = validateForumReply(await readJsonBody(request, 48 * 1024))
      const id = randomBytes(12).toString('hex')
      portalDatabase.createForumReply({ id, postId: forumReplyCreateMatch[1], userId: session.user.id, ...reply })
      portalDatabase.recordProductEvent('forum_reply_created', { userId: session.user.id, context: forumReplyCreateMatch[1] })
      const created = portalDatabase.listForumReplies(forumReplyCreateMatch[1], session.user.id).find(item => item.id === id)
      sendJson(response, 201, forumReplyPayload(created))
    } catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  const forumLikeMatch = pathname.match(/^\/api\/forum\/(posts|replies)\/([a-f0-9]{24})\/like$/)
  if (forumLikeMatch && request.method === 'POST') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    try { sendJson(response, 200, portalDatabase.toggleForumLike(forumLikeMatch[1] === 'posts' ? 'post' : 'reply', forumLikeMatch[2], session.user.id)) }
    catch (error) { sendJson(response, 400, { error: error.message }) }
    return
  }

  const forumContentDeleteMatch = pathname.match(/^\/api\/forum\/(posts|replies)\/([a-f0-9]{24})$/)
  if (forumContentDeleteMatch && request.method === 'DELETE') {
    if (!validCommunityWrite(request)) { sendJson(response, 403, { error: '安全令牌无效，请刷新页面后重试。' }); return }
    const session = requireCommunityUser(request, response)
    if (!session) return
    const type = forumContentDeleteMatch[1] === 'posts' ? 'post' : 'reply'
    const record = type === 'post' ? portalDatabase.getForumPostRecord(forumContentDeleteMatch[2]) : portalDatabase.getForumReply(forumContentDeleteMatch[2])
    if (!record) { sendJson(response, 404, { error: '内容不存在。' }); return }
    if (record.user_id !== session.user.id && !canModerate(session)) { sendJson(response, 403, { error: '无权删除该内容。' }); return }
    if (type === 'post') portalDatabase.setForumPostStatus(record.id, 'deleted', { actorType: 'user', actorId: session.user.id })
    else portalDatabase.setForumReplyStatus(record.id, 'deleted', { actorType: 'user', actorId: session.user.id })
    sendJson(response, 200, { ok: true })
    return
  }

  if (pathname === '/api/rag/query' && request.method === 'POST') {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    const address = request.socket.remoteAddress || 'unknown'
    const existingAttempt = ragAttempts.get(address)
    const attempt = existingAttempt?.resetAt > Date.now()
      ? existingAttempt
      : { count: 0, resetAt: Date.now() + 10 * 60 * 1000 }
    if (attempt.count >= 30) {
      sendJson(response, 429, { error: '问答请求过多，请稍后再试。' })
      return
    }
    attempt.count += 1
    ragAttempts.set(address, attempt)
    let question = ''
    let queryId = ''
    let clientHash = ''
    const startedAt = Date.now()
    try {
      const body = await readJsonBody(request, 32 * 1024)
      question = typeof body.question === 'string' ? body.question.trim() : ''
      if (question.length < 2 || question.length > 500) {
        sendJson(response, 400, { error: '问题长度必须为 2-500 个字符。' })
        return
      }
      queryId = randomBytes(12).toString('hex')
      clientHash = createHash('sha256').update(encryption.secret + '|' + address).digest('hex')
      const settings = portalDatabase.getAiSettings({ includeSecret: true })
      const rollingDayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      if (portalDatabase.getRagQueryCount(clientHash, rollingDayStart) >= settings.dailyLimit) {
        sendJson(response, 429, { error: '今日问答额度已用完，请明天再试。' })
        return
      }
      const result = await ragService.query(
        question,
        portalDatabase.getKnowledgeEntries({ publishedOnly: true }),
        settings
      )
      portalDatabase.recordRagQuery({
        id: queryId, clientHash, question, mode: result.mode, sourceCount: result.sources.length,
        durationMs: Date.now() - startedAt, status: result.sources.length ? 'ok' : 'no_results'
      })
      portalDatabase.recordProductEvent('rag_query', { userId: getCommunitySession(request)?.user.id || null, context: result.mode })
      sendJson(response, 200, { ...result, queryId })
    } catch (error) {
      console.error('[rag-error] ' + (error.stack || error.message))
      if (queryId && clientHash && question) {
        portalDatabase.recordRagQuery({ id: queryId, clientHash, question, mode: 'error', sourceCount: 0,
          durationMs: Date.now() - startedAt, status: 'error', errorMessage: error.message })
      }
      sendJson(response, 502, { error: 'AI 问答服务暂时不可用，请稍后重试或联系管理员检查接口配置。' })
    }
    return
  }

  if (pathname === '/api/rag/feedback' && request.method === 'POST') {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    try {
      const body = await readJsonBody(request, 8 * 1024)
      if (!/^[a-f0-9]{24}$/.test(String(body.queryId || '')) || ![-1, 1].includes(Number(body.feedback))) {
        sendJson(response, 400, { error: '反馈参数无效。' })
        return
      }
      if (!portalDatabase.setRagFeedback(body.queryId, Number(body.feedback))) {
        sendJson(response, 404, { error: '未找到对应问答记录。' })
        return
      }
      sendJson(response, 200, { ok: true })
    } catch (error) {
      sendJson(response, 400, { error: error.message })
    }
    return
  }

  if (pathname === '/api/admin/login' && request.method === 'POST') {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    const address = request.socket.remoteAddress || 'unknown'
    const existingAttempt = loginAttempts.get(address)
    const attempt = existingAttempt?.resetAt > Date.now()
      ? existingAttempt
      : { count: 0, resetAt: Date.now() + 10 * 60 * 1000 }
    if (attempt.count >= 5) {
      sendJson(response, 429, { error: '登录尝试过多，请十分钟后再试。' })
      return
    }
    try {
      const body = await readJsonBody(request, 16 * 1024)
      if (!safeEqual(body.username || '', adminUsername) || !safeEqual(body.password || '', adminPassword)) {
        attempt.count += 1
        loginAttempts.set(address, attempt)
        sendJson(response, 401, { error: '账号或密码错误。' })
        return
      }
      loginAttempts.delete(address)
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { username: adminUsername, expiresAt: Date.now() + sessionLifetimeMs })
      sendJson(response, 200, { ok: true }, { 'set-cookie': createSessionCookie(request, token) })
    } catch (error) {
      sendJson(response, 400, { error: error.message })
    }
    return
  }

  if (pathname === '/api/admin/logout' && request.method === 'POST') {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    const session = getSession(request)
    if (session) sessions.delete(session.token)
    sendJson(response, 200, { ok: true }, { 'set-cookie': clearSessionCookie(request) })
    return
  }

  if (pathname === '/api/admin/cases') {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (request.method === 'GET') {
      const snapshot = portalDatabase.getSnapshot()
      sendJson(response, 200, snapshot.cases, { etag: revisionTag('cases', snapshot.revision) })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: '请求来源无效。' })
        return
      }
      const expectedRevision = parseRevisionTag(request.headers['if-match'], 'cases')
      if (expectedRevision === undefined) {
        sendJson(response, 428, { error: '缺少有效的配置版本，请刷新管理页后重试。' })
        return
      }
      try {
        const snapshot = await portalDatabase.replaceCases(await readJsonBody(request), {
          expectedRevision,
          actor: session.username
        })
        sendJson(response, 200, snapshot.cases, { etag: revisionTag('cases', snapshot.revision) })
      } catch (error) {
        const status = error instanceof DatabaseConflictError ? 409 : 400
        sendJson(response, status, { error: error.message })
      }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
    return
  }

  if (pathname === '/api/admin/site-config') {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (request.method === 'GET') {
      const snapshot = portalDatabase.getSiteConfigSnapshot()
      sendJson(response, 200, snapshot.config, { etag: revisionTag('site-config', snapshot.revision) })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: '请求来源无效。' })
        return
      }
      const expectedRevision = parseRevisionTag(request.headers['if-match'], 'site-config')
      if (expectedRevision === undefined) {
        sendJson(response, 428, { error: '缺少有效的配置版本，请刷新管理页后重试。' })
        return
      }
      try {
        const snapshot = await portalDatabase.replaceSiteConfig(await readJsonBody(request), {
          expectedRevision,
          actor: session.username
        })
        sendJson(response, 200, snapshot.config, { etag: revisionTag('site-config', snapshot.revision) })
      } catch (error) {
        const status = error instanceof DatabaseConflictError ? 409 : 400
        sendJson(response, status, { error: error.message })
      }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
    return
  }

  if (pathname === '/api/admin/knowledge') {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (request.method === 'GET') {
      const snapshot = portalDatabase.getKnowledgeSnapshot()
      sendJson(response, 200, snapshot.entries, { etag: revisionTag('knowledge', snapshot.revision) })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: '请求来源无效。' })
        return
      }
      const expectedRevision = parseRevisionTag(request.headers['if-match'], 'knowledge')
      if (expectedRevision === undefined) {
        sendJson(response, 428, { error: '缺少有效的配置版本，请刷新管理页后重试。' })
        return
      }
      try {
        const snapshot = await portalDatabase.replaceKnowledge(await readJsonBody(request, 8 * 1024 * 1024), {
          expectedRevision,
          actor: session.username
        })
        sendJson(response, 200, snapshot.entries, { etag: revisionTag('knowledge', snapshot.revision) })
      } catch (error) {
        sendJson(response, error instanceof DatabaseConflictError ? 409 : 400, { error: error.message })
      }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
    return
  }

  if (pathname === '/api/admin/ai-settings') {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (request.method === 'GET') {
      const settings = portalDatabase.getAiSettings()
      const { revision, ...publicSettings } = settings
      sendJson(response, 200, { ...publicSettings, apiKey: '', clearApiKey: false }, { etag: revisionTag('ai-settings', revision) })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: '请求来源无效。' })
        return
      }
      const expectedRevision = parseRevisionTag(request.headers['if-match'], 'ai-settings')
      if (expectedRevision === undefined) {
        sendJson(response, 428, { error: '缺少有效的配置版本，请刷新管理页后重试。' })
        return
      }
      try {
        const saved = await portalDatabase.replaceAiSettings(await readJsonBody(request, 64 * 1024), {
          expectedRevision,
          actor: session.username
        })
        const { revision, ...publicSettings } = saved
        sendJson(response, 200, { ...publicSettings, apiKey: '', clearApiKey: false }, { etag: revisionTag('ai-settings', revision) })
      } catch (error) {
        sendJson(response, error instanceof DatabaseConflictError ? 409 : 400, { error: error.message })
      }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
    return
  }

  if (pathname === '/api/admin/ai-test' && request.method === 'POST') {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    try {
      const settings = portalDatabase.getAiSettings({ includeSecret: true })
      const answer = await ragService.askAi('请用一句中文回复：AI 接口连接成功。', [{
        title: '连接测试', excerpt: '这是管理后台发起的 AI 接口连接测试。'
      }], settings)
      sendJson(response, 200, { ok: true, answer })
    } catch (error) {
      sendJson(response, 502, { error: error.message })
    }
    return
  }

  if (pathname === '/api/admin/rag-stats' && request.method === 'GET') {
    if (!getSession(request)) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    sendJson(response, 200, portalDatabase.getRagStats(url.searchParams.get('days') || 30))
    return
  }

  if (pathname === '/api/admin/security-status' && request.method === 'GET') {
    if (!getSession(request)) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    sendJson(response, 200, {
      localOnlyHost,
      weakAdminPassword,
      encryptionKeySource: encryption.source,
      warnings: [
        ...(weakAdminPassword ? ['当前管理员密码为默认弱密码；对外部署前必须更换。'] : []),
        ...(!localOnlyHost ? ['服务正在监听非本机地址，请确保已配置 HTTPS 和访问控制。'] : [])
      ]
    })
    return
  }

  if (pathname === '/api/admin/community/stats' && request.method === 'GET') {
    if (!getSession(request)) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    sendJson(response, 200, portalDatabase.getCommunityStats())
    return
  }

  if (pathname === '/api/admin/community-settings') {
    const session = getSession(request)
    if (!session) { sendJson(response, 401, { error: '请先登录。' }); return }
    if (request.method === 'GET') {
      const settings = portalDatabase.getCommunitySettings()
      const { revision, ...safeSettings } = settings
      sendJson(response, 200, { ...safeSettings, smtpPassword: '', clearSmtpPassword: false, turnstileSecret: '', clearTurnstileSecret: false }, {
        etag: revisionTag('community-settings', revision)
      })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) { sendJson(response, 403, { error: '请求来源无效。' }); return }
      const expectedRevision = parseRevisionTag(request.headers['if-match'], 'community-settings')
      if (expectedRevision === undefined) { sendJson(response, 428, { error: '缺少有效的配置版本，请刷新后重试。' }); return }
      try {
        const saved = await portalDatabase.replaceCommunitySettings(await readJsonBody(request, 64 * 1024), { expectedRevision, actor: session.username })
        const { revision, ...safeSettings } = saved
        sendJson(response, 200, { ...safeSettings, smtpPassword: '', clearSmtpPassword: false, turnstileSecret: '', clearTurnstileSecret: false }, {
          etag: revisionTag('community-settings', revision)
        })
      } catch (error) { sendJson(response, error instanceof DatabaseConflictError ? 409 : 400, { error: error.message }) }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
    return
  }

  if (pathname === '/api/admin/community-settings/test-smtp' && request.method === 'POST') {
    if (!getSession(request)) { sendJson(response, 401, { error: '请先登录。' }); return }
    if (!sameOrigin(request)) { sendJson(response, 403, { error: '请求来源无效。' }); return }
    try { await testSmtpConnection(portalDatabase.getCommunitySettings({ includeSecrets: true })); sendJson(response, 200, { ok: true }) }
    catch (error) { sendJson(response, 502, { error: error.message }) }
    return
  }

  if (pathname === '/api/admin/product-metrics' && request.method === 'GET') {
    if (!getSession(request)) { sendJson(response, 401, { error: '请先登录。' }); return }
    sendJson(response, 200, portalDatabase.getProductMetrics(url.searchParams.get('days') || 30))
    return
  }

  if (pathname === '/api/admin/analytics' && request.method === 'GET') {
    if (!getSession(request)) { sendJson(response, 401, { error: '请先登录。' }); return }
    sendJson(response, 200, portalDatabase.getSiteAnalytics(url.searchParams.get('days') || 30))
    return
  }

  if (pathname === '/api/admin/analytics-settings') {
    const session = getSession(request)
    if (!session) { sendJson(response, 401, { error: '请先登录。' }); return }
    if (request.method === 'GET') {
      const settings = portalDatabase.getAnalyticsSettings()
      const { revision, ...publicSettings } = settings
      sendJson(response, 200, publicSettings, { etag: revisionTag('analytics-settings', revision) })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) { sendJson(response, 403, { error: '请求来源无效。' }); return }
      const expectedRevision = parseRevisionTag(request.headers['if-match'], 'analytics-settings')
      if (expectedRevision === undefined) { sendJson(response, 428, { error: '缺少有效的监控配置版本，请刷新后重试。' }); return }
      try {
        const saved = await portalDatabase.replaceAnalyticsSettings(await readJsonBody(request, 8 * 1024), { expectedRevision, actor: session.username })
        const { revision, ...publicSettings } = saved
        sendJson(response, 200, publicSettings, { etag: revisionTag('analytics-settings', revision) })
      } catch (error) { sendJson(response, error instanceof DatabaseConflictError ? 409 : 400, { error: error.message }) }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
    return
  }

  if (pathname === '/api/admin/users' && request.method === 'GET') {
    if (!getSession(request)) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    sendJson(response, 200, portalDatabase.listCommunityUsers({
      search: url.searchParams.get('search') || '',
      limit: url.searchParams.get('limit') || 100
    }))
    return
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([a-f0-9]{24})$/)
  if (adminUserMatch && ['PATCH', 'DELETE'].includes(request.method || '')) {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    try {
      if (request.method === 'PATCH') {
        const body = await readJsonBody(request, 8 * 1024)
        const user = portalDatabase.updateCommunityUserByAdmin(adminUserMatch[1], {
          role: String(body.role || ''),
          status: String(body.status || '')
        }, session.username)
        sendJson(response, 200, user)
      } else {
        const user = portalDatabase.deleteCommunityUserByAdmin(adminUserMatch[1], session.username)
        sendJson(response, 200, { ok: true, deleted: { id: user.id, username: user.username } })
      }
    } catch (error) {
      sendJson(response, /不存在/.test(error.message) ? 404 : 400, { error: error.message })
    }
    return
  }

  if (pathname === '/api/admin/moderation' && request.method === 'GET') {
    if (!getSession(request)) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    sendJson(response, 200, portalDatabase.getModerationItems(url.searchParams.get('limit') || 100))
    return
  }

  const moderationMatch = pathname.match(/^\/api\/admin\/moderation\/(comment|post|reply)\/([a-f0-9]{24})$/)
  if (moderationMatch && request.method === 'PATCH') {
    const session = getSession(request)
    if (!session) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: '请求来源无效。' })
      return
    }
    try {
      const body = await readJsonBody(request, 8 * 1024)
      const type = moderationMatch[1]
      const allowed = type === 'post' ? ['active', 'hidden', 'locked', 'deleted'] : ['active', 'hidden', 'deleted']
      const status = String(body.status || '')
      if (!allowed.includes(status)) throw new Error('内容状态无效。')
      const options = { actorType: 'admin', actorId: session.username }
      if (type === 'comment') portalDatabase.setArticleCommentStatus(moderationMatch[2], status, options)
      else if (type === 'post') {
        portalDatabase.setForumPostStatus(moderationMatch[2], status, options)
        if (typeof body.pinned === 'boolean' || typeof body.featured === 'boolean') {
          const existing = portalDatabase.getForumPostRecord(moderationMatch[2])
          portalDatabase.setForumPostFlags(moderationMatch[2], {
            pinned: typeof body.pinned === 'boolean' ? body.pinned : Boolean(existing.is_pinned),
            featured: typeof body.featured === 'boolean' ? body.featured : Boolean(existing.is_featured)
          }, session.username)
        }
      }
      else portalDatabase.setForumReplyStatus(moderationMatch[2], status, options)
      sendJson(response, 200, { ok: true, id: moderationMatch[2], type, status })
    } catch (error) {
      sendJson(response, /不存在/.test(error.message) ? 404 : 400, { error: error.message })
    }
    return
  }

  if (pathname === '/api/admin/export' && request.method === 'GET') {
    if (!getSession(request)) {
      sendJson(response, 401, { error: '请先登录。' })
      return
    }
    const aiSettings = portalDatabase.getAiSettings()
    const { revision: aiRevision, apiKeySet, ...safeAiSettings } = aiSettings
    const communitySettings = portalDatabase.getCommunitySettings()
    const { smtpPasswordSet, turnstileSecretSet, ...safeCommunitySettings } = communitySettings
    const analyticsSettings = portalDatabase.getAnalyticsSettings()
    const { revision: analyticsRevision, ...safeAnalyticsSettings } = analyticsSettings
    sendJson(response, 200, {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      cases: portalDatabase.getSnapshot(),
      site: portalDatabase.getSiteConfigSnapshot(),
      knowledge: portalDatabase.getKnowledgeSnapshot(),
      ai: { settings: safeAiSettings, revision: aiRevision, apiKeyIncluded: false, hadApiKey: apiKeySet },
      community: {
        statistics: portalDatabase.getCommunityStats(),
        configuration: { ...safeCommunitySettings, smtpPasswordIncluded: false, turnstileSecretIncluded: false },
        secretStatus: { smtpPasswordSet, turnstileSecretSet },
        personalDataIncluded: false
      },
      analytics: {
        configuration: safeAnalyticsSettings,
        revision: analyticsRevision,
        dataIncluded: false,
        privacy: 'first-party anonymous event aggregates; no IP address or full referrer URL is exported'
      }
    }, { 'content-disposition': `attachment; filename="portal-export-${new Date().toISOString().slice(0, 10)}.json"` })
    return
  }

  if (!['GET', 'HEAD'].includes(request.method || '')) {
    sendJson(response, 405, { error: '请求方法不支持。' })
    return
  }
  serveStatic(request, response, pathname)
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error('[request-error] ' + (error.stack || error.message))
    if (!response.headersSent) sendJson(response, 500, { error: '服务暂时不可用。' })
    else response.destroy()
  })
})
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token)
  for (const [address, attempt] of loginAttempts) if (attempt.resetAt <= now) loginAttempts.delete(address)
  for (const [address, attempt] of ragAttempts) if (attempt.resetAt <= now) ragAttempts.delete(address)
  for (const [address, attempt] of registrationAttempts) if (attempt.resetAt <= now) registrationAttempts.delete(address)
  for (const [address, attempt] of userLoginAttempts) if (attempt.resetAt <= now) userLoginAttempts.delete(address)
  for (const [address, attempt] of communityWriteAttempts) if (attempt.resetAt <= now) communityWriteAttempts.delete(address)
  for (const [address, attempt] of telemetryAttempts) if (attempt.resetAt <= now) telemetryAttempts.delete(address)
  portalDatabase.pruneCommunitySessions()
  portalDatabase.pruneCommunityTokens()
  portalDatabase.maybePruneAnalyticsEvents()
}, 10 * 60 * 1000)
cleanupTimer.unref()

const shutdown = signal => {
  console.log('Received ' + signal + '; closing service.')
  server.close(() => {
    portalDatabase.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

server.listen(port, host, () => {
  const health = portalDatabase.getHealth()
  console.log('Public site: http://' + host + ':' + port + '/cases')
  console.log('Case admin: http://' + host + ':' + port + '/admin/cases')
  console.log('Site admin: http://' + host + ':' + port + '/admin/site')
  console.log('Knowledge admin: http://' + host + ':' + port + '/admin/knowledge')
  console.log('Forum: http://' + host + ':' + port + '/forum')
  console.log('User admin: http://' + host + ':' + port + '/admin/users')
  console.log('Analytics admin: http://' + host + ':' + port + '/admin/analytics')
  if (weakAdminPassword) console.warn('Security warning: default weak admin password is allowed only because the service listens locally.')
  console.log('Encryption key source: ' + encryption.source + '.')
  console.log('SQLite ready: ' + health.caseCount + ' cases/' + health.knowledgeCount + ' knowledge entries/' + health.communityUserCount + ' users/' + health.forumPostCount + ' posts/' + health.siteEventCount + ' anonymous events, revisions cases=' + health.revision + '/site=' + health.siteConfigRevision + '/knowledge=' + health.knowledgeRevision + ', ' + health.journalMode + ' mode.')
})
