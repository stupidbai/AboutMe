import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { PortalDatabase } from './database.mjs'
import { validateCases } from './case-schema.mjs'

const root = resolve(import.meta.dirname, '..')
const dataDir = mkdtempSync(join(tmpdir(), 'byf-portal-db-test-'))
const seedFile = resolve(root, 'config/cases.json')
const seedCases = JSON.parse(readFileSync(seedFile, 'utf8'))
let database

try {
  database = new PortalDatabase({ dataDir, seedFile, backupLimit: 2 })
  const initial = database.getSnapshot()
  if (initial.revision !== 1 || !isDeepStrictEqual(initial.cases, validateCases(seedCases))) {
    throw new Error('首次 JSON 到 SQLite 迁移失败。')
  }

  const empty = await database.replaceCases([], { expectedRevision: initial.revision, actor: 'database-test' })
  if (empty.revision !== 2 || empty.cases.length !== 0) throw new Error('清空案例事务失败。')
  database.close()

  database = new PortalDatabase({ dataDir, seedFile, backupLimit: 2 })
  const reopened = database.getSnapshot()
  if (reopened.revision !== 2 || reopened.cases.length !== 0) {
    throw new Error('空数据库重启后被错误地重新填充。')
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
} finally {
  database?.close()
  rmSync(dataDir, { recursive: true, force: true })
}
