import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { DatabaseConflictError, PortalDatabase } from './database.mjs'

const root = resolve(import.meta.dirname, '..')
const distRoot = resolve(root, 'dist')
const envFile = resolve(root, '.env.local')
const seedFile = resolve(root, 'config/cases.json')
const sessionCookieName = 'case_admin_session'
const sessions = new Map()
const loginAttempts = new Map()

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

if (!existsSync(distRoot)) throw new Error('缺少 dist 构建目录，请先运行 npm run build。')
if (!existsSync(seedFile)) throw new Error('缺少 config/cases.json。')
if (adminPassword.length < 8) throw new Error('请设置至少 8 位的 CASE_ADMIN_PASSWORD。')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CASE_ADMIN_PORT 必须是 1-65535 的端口号。')

const portalDatabase = new PortalDatabase({ dataDir, seedFile, backupLimit })

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
  response.end(status === 304 ? undefined : JSON.stringify(payload))
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
const revisionTag = revision => '"cases-' + revision + '"'
const parseRevisionTag = value => {
  const match = String(value || '').match(/^(?:W\/)?"cases-(\d+)"$/)
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
    const etag = revisionTag(snapshot.revision)
    if (request.headers['if-none-match'] === etag) {
      sendJson(response, 304, null, { etag })
      return
    }
    sendJson(response, 200, snapshot.cases, { etag })
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
      sendJson(response, 200, snapshot.cases, { etag: revisionTag(snapshot.revision) })
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: '请求来源无效。' })
        return
      }
      const expectedRevision = parseRevisionTag(request.headers['if-match'])
      if (expectedRevision === undefined) {
        sendJson(response, 428, { error: '缺少有效的配置版本，请刷新管理页后重试。' })
        return
      }
      try {
        const snapshot = await portalDatabase.replaceCases(await readJsonBody(request), {
          expectedRevision,
          actor: session.username
        })
        sendJson(response, 200, snapshot.cases, { etag: revisionTag(snapshot.revision) })
      } catch (error) {
        const status = error instanceof DatabaseConflictError ? 409 : 400
        sendJson(response, status, { error: error.message })
      }
      return
    }
    sendJson(response, 405, { error: '请求方法不支持。' }, { allow: 'GET, PUT' })
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
  console.log('SQLite ready: ' + health.caseCount + ' cases, revision ' + health.revision + ', ' + health.journalMode + ' mode.')
})
