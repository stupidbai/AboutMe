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
const seedCases = JSON.parse(readFileSync(seedFile, 'utf8'))
const seedSiteConfig = JSON.parse(readFileSync(siteConfigSeedFile, 'utf8'))
let database

try {
  database = new PortalDatabase({ dataDir, seedFile, siteConfigSeedFile, backupLimit: 2 })
  const initial = database.getSnapshot()
  if (initial.revision !== 1 || !isDeepStrictEqual(initial.cases, validateCases(seedCases))) {
    throw new Error('首次 JSON 到 SQLite 迁移失败。')
  }
  const initialSite = database.getSiteConfigSnapshot()
  if (initialSite.revision !== 1 || !isDeepStrictEqual(initialSite.config, validateSiteConfig(seedSiteConfig))) {
    throw new Error('站点配置首次 JSON 到 SQLite 迁移失败。')
  }

  const changedSiteConfig = structuredClone(initialSite.config)
  changedSiteConfig.identity.city = '上海 / 徐州 / 自动化测试'
  const changedSite = await database.replaceSiteConfig(changedSiteConfig, { expectedRevision: 1, actor: 'database-test' })
  if (changedSite.revision !== 2 || changedSite.config.identity.city !== changedSiteConfig.identity.city) {
    throw new Error('站点配置更新事务失败。')
  }

  const empty = await database.replaceCases([], { expectedRevision: initial.revision, actor: 'database-test' })
  if (empty.revision !== 2 || empty.cases.length !== 0) throw new Error('清空案例事务失败。')
  database.close()

  database = new PortalDatabase({ dataDir, seedFile, siteConfigSeedFile, backupLimit: 2 })
  const reopened = database.getSnapshot()
  if (reopened.revision !== 2 || reopened.cases.length !== 0) {
    throw new Error('空数据库重启后被错误地重新填充。')
  }
  if (database.getSiteConfigSnapshot().revision !== 2 || database.getSiteConfigSnapshot().config.identity.city !== changedSiteConfig.identity.city) {
    throw new Error('站点配置重启后未持久化。')
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
} finally {
  database?.close()
  rmSync(dataDir, { recursive: true, force: true })
}
