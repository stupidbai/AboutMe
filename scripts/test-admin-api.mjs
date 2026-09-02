import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
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

const portProbe = createServer()
await new Promise((resolveListen, rejectListen) => {
  portProbe.once('error', rejectListen)
  portProbe.listen(0, '127.0.0.1', resolveListen)
})
const port = portProbe.address().port
await new Promise(resolveClose => portProbe.close(resolveClose))

const testDataDir = mkdtempSync(join(tmpdir(), 'byf-portal-test-'))
const baseUrl = 'http://127.0.0.1:' + port
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
let revision = ''
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

try {
  const health = await waitForHealth()
  if (health.status !== 'ok' || health.database.schemaVersion !== 2 || health.database.siteConfigRevision !== 1 || health.database.journalMode !== 'wal') {
    throw new Error('SQLite 健康状态不符合预期。')
  }

  const publicResponse = await expectStatus(await fetch(baseUrl + '/api/cases'), 200, '公开读取')
  const publicCases = await publicResponse.json()
  const publicEtag = publicResponse.headers.get('etag')
  if (!Array.isArray(publicCases) || publicCases.length !== 9 || !publicEtag) {
    throw new Error('公开 API 未返回 9 个迁移案例或缺少 ETag。')
  }
  await expectStatus(await fetch(baseUrl + '/api/cases', {
    headers: { 'if-none-match': publicEtag }
  }), 304, '公开读取缓存协商')

  const publicSiteResponse = await expectStatus(await fetch(baseUrl + '/api/site-config'), 200, '公开读取站点配置')
  const publicSiteConfig = await publicSiteResponse.json()
  const publicSiteEtag = publicSiteResponse.headers.get('etag')
  if (publicSiteConfig.identity?.name !== '白云飞' || !publicSiteEtag) throw new Error('公开站点配置或 ETag 缺失。')
  await expectStatus(await fetch(baseUrl + '/api/site-config', { headers: { 'if-none-match': publicSiteEtag } }), 304, '站点配置缓存协商')

  await expectStatus(await adminFetch('/api/admin/cases'), 401, '未登录访问管理 API')
  await expectStatus(await adminFetch('/api/admin/site-config'), 401, '未登录访问站点配置 API')
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

  const managedResponse = await expectStatus(await adminFetch('/api/admin/cases'), 200, '登录后读取案例')
  const originalCases = await managedResponse.json()
  revision = managedResponse.headers.get('etag') || ''
  if (!revision || originalCases.length !== 9) throw new Error('管理 API 未返回数据库版本或完整案例。')

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
  if (afterAdd.length !== 10 || !afterAdd.some(item => ['qa-tmpa', 'qa-tmpb'].includes(item.id))) {
    throw new Error('新增案例未通过数据库公开读取生效。')
  }

  const remove = await expectStatus(await save(originalCases), 200, '删除临时案例')
  revision = remove.headers.get('etag') || ''
  const afterDelete = await (await expectStatus(await fetch(baseUrl + '/api/cases'), 200, '删除后公开读取')).json()
  if (afterDelete.length !== 9 || afterDelete.some(item => ['qa-tmpa', 'qa-tmpb'].includes(item.id))) {
    throw new Error('删除案例后数据库未恢复。')
  }

  await expectStatus(await adminFetch('/api/admin/logout', { method: 'POST' }), 200, '退出登录')
  cookie = ''
  await expectStatus(await adminFetch('/api/admin/cases'), 401, '退出后访问管理 API')
  await expectStatus(await adminFetch('/api/admin/site-config'), 401, '退出后访问站点配置 API')

  const databaseFile = join(testDataDir, 'portal.sqlite')
  const backups = readdirSync(join(testDataDir, 'backups')).filter(file => file.endsWith('.sqlite'))
  if (!existsSync(databaseFile) || statSync(databaseFile).size === 0 || backups.length < 2 || backups.length > 3) {
    throw new Error('数据库文件或轮换备份不符合预期。')
  }

  console.log('SQLite migration: 9 seed cases')
  console.log('SQLite WAL/schema/health: verified')
  console.log('Public API ETag/304: verified')
  console.log('Public site configuration ETag/304: verified')
  console.log('Unauthenticated admin API: 401')
  console.log('Cross-origin login: 403')
  console.log('Protected session cookie: verified')
  console.log('Optimistic concurrency and serialized writes: 428/409 verified')
  console.log('Site configuration update/restore: verified')
  console.log('Transactional create/delete: verified (9 -> 10 -> 9)')
  console.log('Rotating database backups: verified')
  console.log('Logout invalidation: verified')
} finally {
  if (child.exitCode === null) child.kill()
  await new Promise(resolveExit => {
    if (child.exitCode !== null) resolveExit()
    else child.once('exit', resolveExit)
  })
  rmSync(testDataDir, { recursive: true, force: true })
}
