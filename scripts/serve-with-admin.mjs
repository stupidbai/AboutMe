import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const distRoot = resolve(root, 'dist')
const casesFile = resolve(root, 'config/cases.json')
const envFile = resolve(root, '.env.local')
const sessionCookieName = 'case_admin_session'
const sessionLifetimeMs = 8 * 60 * 60 * 1000
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

if (!existsSync(distRoot)) throw new Error('缺少 dist 构建目录，请先运行 npm run build。')
if (!existsSync(casesFile)) throw new Error('缺少 config/cases.json。')
if (adminPassword.length < 12) {
  throw new Error('请在 .env.local 中设置至少 12 位的 CASE_ADMIN_PASSWORD。')
}

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

const sendJson = (response, status, payload, headers = {}) => {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...headers
  })
  response.end(JSON.stringify(payload))
}

const readJsonBody = (request, limit = 1024 * 1024) => new Promise((resolveBody, rejectBody) => {
  const chunks = []
  let size = 0
  request.on('data', chunk => {
    size += chunk.length
    if (size > limit) {
      rejectBody(new Error('请求内容过大。'))
      request.destroy()
      return
    }
    chunks.push(chunk)
  })
  request.on('end', () => {
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

const getProtocol = request => {
  const forwarded = request.headers['x-forwarded-proto']
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  return request.socket.encrypted ? 'https' : 'http'
}

const sameOrigin = request => {
  const origin = request.headers.origin
  if (!origin) return true
  return origin === `${getProtocol(request)}://${request.headers.host}`
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
  `${sessionCookieName}=${encodeURIComponent(token)}`,
  'HttpOnly',
  'SameSite=Strict',
  'Path=/',
  `Max-Age=${Math.floor(sessionLifetimeMs / 1000)}`,
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')

const clearSessionCookie = request => [
  `${sessionCookieName}=`,
  'HttpOnly',
  'SameSite=Strict',
  'Path=/',
  'Max-Age=0',
  getProtocol(request) === 'https' ? 'Secure' : ''
].filter(Boolean).join('; ')

const readCases = () => JSON.parse(readFileSync(casesFile, 'utf8'))

const requiredText = (value, label, maxLength = 5000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空。`)
  if (value.trim().length > maxLength) throw new Error(`${label}内容过长。`)
  return value.trim()
}

const optionalText = (value, maxLength = 5000) => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new Error('可选文本字段格式无效。')
  return value.trim()
}

const isHttpUrl = value => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const sanitizeCase = (item, index) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第 ${index + 1} 个案例格式无效。`)
  const id = requiredText(item.id, '案例编号', 8)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`案例 ${id} 的编号只能包含字母、数字、下划线或连字符。`)
  const category = requiredText(item.category, `案例 ${id} 分类`, 20)
  if (!['delivery', 'community', 'ecosystem'].includes(category)) throw new Error(`案例 ${id} 的分类无效。`)
  const image = requiredText(item.image, `案例 ${id} 图片路径`, 1000)
  if (!image.startsWith('/') && !isHttpUrl(image)) throw new Error(`案例 ${id} 的图片路径必须以 / 开头或使用 http/https。`)
  const nasUrl = optionalText(item.nasUrl, 2000)
  if (nasUrl && !isHttpUrl(nasUrl)) throw new Error(`案例 ${id} 的 NAS 地址必须使用 http/https。`)
  const tags = Array.isArray(item.tags)
    ? item.tags.map(tag => requiredText(tag, `案例 ${id} 标签`, 50)).slice(0, 12)
    : []
  const partners = Array.isArray(item.partners)
    ? item.partners.slice(0, 12).map(partner => ({
        name: requiredText(partner?.name, `案例 ${id} 合作伙伴名称`, 80),
        logo: requiredText(partner?.logo, `案例 ${id} 合作伙伴标识`, 1000)
      }))
    : undefined

  const sanitized = {
    id,
    category,
    title: requiredText(item.title, `案例 ${id} 标题`, 200),
    kicker: requiredText(item.kicker, `案例 ${id} 分类说明`, 200),
    description: requiredText(item.description, `案例 ${id} 介绍`, 5000),
    image,
    imageAlt: optionalText(item.imageAlt, 500),
    tags,
    nasUrl
  }
  const outcome = optionalText(item.outcome, 80)
  const outcomeLabel = optionalText(item.outcomeLabel, 200)
  if (outcome) sanitized.outcome = outcome
  if (outcomeLabel) sanitized.outcomeLabel = outcomeLabel
  if (item.contain === true) sanitized.contain = true
  if (partners?.length) sanitized.partners = partners
  return sanitized
}

const validateCases = payload => {
  if (!Array.isArray(payload)) throw new Error('案例配置必须是数组。')
  if (payload.length > 99) throw new Error('案例数量不能超过 99 个。')
  const sanitized = payload.map(sanitizeCase)
  const ids = sanitized.map(item => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('案例编号不能重复。')
  return sanitized
}

const saveCases = cases => {
  copyFileSync(casesFile, `${casesFile}.bak`)
  writeFileSync(casesFile, `${JSON.stringify(cases, null, 2)}\n`, 'utf8')
}

const serveStatic = (request, response, pathname) => {
  const decoded = decodeURIComponent(pathname)
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidates = extname(relativePath)
    ? [relativePath]
    : [relativePath, `${relativePath}.html`, `${relativePath}/index.html`]
  const file = candidates
    .map(candidate => resolve(distRoot, candidate))
    .find(candidate => candidate.startsWith(`${distRoot}${sep}`) && existsSync(candidate) && statSync(candidate).isFile())
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }
  response.writeHead(200, {
    'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'content-type': mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream'
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(file).pipe(response)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname === '/api/cases' && request.method === 'GET') {
    sendJson(response, 200, readCases())
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
      sendJson(response, 200, readCases())
      return
    }
    if (request.method === 'PUT') {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: '请求来源无效。' })
        return
      }
      try {
        const cases = validateCases(await readJsonBody(request))
        saveCases(cases)
        sendJson(response, 200, cases)
      } catch (error) {
        sendJson(response, 400, { error: error.message })
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
})

server.listen(port, host, () => {
  console.log(`Public site: http://${host}:${port}/cases`)
  console.log(`Case admin: http://${host}:${port}/admin/cases`)
  console.log('Admin credentials are loaded from .env.local or environment variables.')
})
