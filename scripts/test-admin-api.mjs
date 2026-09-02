import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const envFile = resolve(root, '.env.local')
const casesFile = resolve(root, 'config/cases.json')

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
const host = env.CASE_ADMIN_HOST === '0.0.0.0' ? '127.0.0.1' : (env.CASE_ADMIN_HOST || '127.0.0.1')
const port = env.CASE_ADMIN_PORT || '4173'
const baseUrl = `http://${host}:${port}`
const originalCases = JSON.parse(readFileSync(casesFile, 'utf8'))
const testId = 'qa-temp'
let cookie = ''

const expectStatus = async (response, expected, label) => {
  if (response.status !== expected) {
    const detail = await response.text()
    throw new Error(`${label}: expected ${expected}, received ${response.status} ${detail}`)
  }
  return response
}

const adminFetch = (path, options = {}) => fetch(`${baseUrl}${path}`, {
  ...options,
  headers: {
    accept: 'application/json',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(cookie ? { cookie } : {}),
    ...options.headers
  }
})

const save = payload => adminFetch('/api/admin/cases', {
  method: 'PUT',
  body: JSON.stringify(payload)
})

try {
  const publicResponse = await expectStatus(await fetch(`${baseUrl}/api/cases`), 200, '公开读取')
  const publicCases = await publicResponse.json()
  if (!Array.isArray(publicCases) || publicCases.length !== originalCases.length) {
    throw new Error('公开 API 的案例数量与配置文件不一致。')
  }

  await expectStatus(await adminFetch('/api/admin/cases'), 401, '未登录访问管理 API')
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
  const managedCases = await managedResponse.json()
  if (!Array.isArray(managedCases) || managedCases.length !== originalCases.length) {
    throw new Error('管理 API 的案例数量与配置文件不一致。')
  }

  const temporaryCase = {
    id: testId,
    category: 'delivery',
    title: '管理端验收临时案例',
    kicker: '自动化验收',
    description: '该记录只用于验证新增和删除持久化，测试完成后自动恢复。',
    image: '/assets/cases/rag-knowledge-system.png',
    imageAlt: '管理端验收临时案例',
    tags: ['验收'],
    nasUrl: 'https://nas.example.invalid/qa'
  }
  await expectStatus(await save([...originalCases, temporaryCase]), 200, '新增案例')
  const afterAdd = await (await expectStatus(await fetch(`${baseUrl}/api/cases`), 200, '新增后公开读取')).json()
  if (afterAdd.length !== originalCases.length + 1 || !afterAdd.some(item => item.id === testId)) {
    throw new Error('新增案例未通过公开 API 生效。')
  }

  await expectStatus(await save(originalCases), 200, '删除临时案例')
  const afterDelete = await (await expectStatus(await fetch(`${baseUrl}/api/cases`), 200, '删除后公开读取')).json()
  if (afterDelete.length !== originalCases.length || afterDelete.some(item => item.id === testId)) {
    throw new Error('删除案例后配置未恢复。')
  }

  await expectStatus(await save(originalCases), 200, '同步最近备份')
  await expectStatus(await adminFetch('/api/admin/logout', { method: 'POST' }), 200, '退出登录')
  cookie = ''
  await expectStatus(await adminFetch('/api/admin/cases'), 401, '退出后访问管理 API')

  console.log(`Public API: 200 (${originalCases.length} cases)`)
  console.log('Unauthenticated admin API: 401')
  console.log('Cross-origin login: 403')
  console.log('Protected session cookie: verified')
  console.log(`Create/delete persistence: verified (${originalCases.length} -> ${originalCases.length + 1} -> ${originalCases.length})`)
  console.log('Logout invalidation: verified')
} finally {
  if (cookie) {
    await save(originalCases).catch(() => undefined)
    await save(originalCases).catch(() => undefined)
    await adminFetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined)
  }
}
