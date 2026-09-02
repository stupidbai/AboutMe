import { backup, DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { validateCases } from './case-schema.mjs'

const SCHEMA_VERSION = 1

export class DatabaseConflictError extends Error {
  constructor(message = '案例配置已被其他管理员更新，请刷新后重试。') {
    super(message)
    this.name = 'DatabaseConflictError'
  }
}

export class PortalDatabase {
  constructor({ dataDir, seedFile, backupLimit = 10 }) {
    this.dataDir = resolve(dataDir)
    this.seedFile = resolve(seedFile)
    this.backupLimit = Math.max(1, Math.min(Number(backupLimit) || 10, 50))
    this.backupDir = join(this.dataDir, 'backups')
    this.databaseFile = join(this.dataDir, 'portal.sqlite')
    mkdirSync(this.backupDir, { recursive: true })
    this.database = new DatabaseSync(this.databaseFile, { timeout: 5000 })
    this.writeQueue = Promise.resolve()
    this.configure()
    this.migrate()
    this.seedIfEmpty()
  }

  configure() {
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA journal_mode = WAL')
    this.database.exec('PRAGMA synchronous = NORMAL')
    this.database.exec('PRAGMA busy_timeout = 5000')
    this.database.exec('PRAGMA temp_store = MEMORY')
  }

  migrate() {
    const currentVersion = Number(this.database.prepare('PRAGMA user_version').get().user_version)
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(`数据库版本 ${currentVersion} 高于当前程序支持的版本 ${SCHEMA_VERSION}。`)
    }
    if (currentVersion < 1) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY,
          sort_order INTEGER NOT NULL UNIQUE,
          category TEXT NOT NULL CHECK (category IN ('delivery', 'community', 'ecosystem')),
          title TEXT NOT NULL,
          kicker TEXT NOT NULL,
          description TEXT NOT NULL,
          image TEXT NOT NULL,
          image_alt TEXT NOT NULL DEFAULT '',
          nas_url TEXT NOT NULL DEFAULT '',
          outcome TEXT NOT NULL DEFAULT '',
          outcome_label TEXT NOT NULL DEFAULT '',
          contain INTEGER NOT NULL DEFAULT 0 CHECK (contain IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS case_tags (
          case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (case_id, position)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS case_partners (
          case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          name TEXT NOT NULL,
          logo TEXT NOT NULL,
          PRIMARY KEY (case_id, position)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS case_changes (
          id INTEGER PRIMARY KEY,
          revision INTEGER NOT NULL,
          changed_at TEXT NOT NULL,
          actor TEXT NOT NULL,
          case_count INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_cases_category_order ON cases(category, sort_order);
        CREATE INDEX IF NOT EXISTS idx_case_tags_tag ON case_tags(tag);
        CREATE INDEX IF NOT EXISTS idx_case_changes_revision ON case_changes(revision DESC);
        PRAGMA user_version = 1;
        COMMIT;
      `)
    }
  }

  seedIfEmpty() {
    const initialized = this.database.prepare("SELECT value FROM metadata WHERE key = 'case_revision'").get()
    if (initialized) return
    if (!existsSync(this.seedFile)) throw new Error(`缺少案例种子文件：${this.seedFile}`)
    const seedCases = validateCases(JSON.parse(readFileSync(this.seedFile, 'utf8')))
    this.replaceInsideTransaction(seedCases, 1, 'json-seed')
  }

  getRevision() {
    const row = this.database.prepare("SELECT value FROM metadata WHERE key = 'case_revision'").get()
    return Number(row?.value || 0)
  }

  getCases() {
    const rows = this.database.prepare(`
      SELECT id, category, title, kicker, description, image, image_alt, nas_url,
             outcome, outcome_label, contain
      FROM cases
      ORDER BY sort_order
    `).all()
    const tags = this.database.prepare('SELECT case_id, tag FROM case_tags ORDER BY case_id, position').all()
    const partners = this.database.prepare('SELECT case_id, name, logo FROM case_partners ORDER BY case_id, position').all()
    const tagsByCase = Map.groupBy(tags, row => row.case_id)
    const partnersByCase = Map.groupBy(partners, row => row.case_id)

    return rows.map(row => {
      const item = {
        id: row.id,
        category: row.category,
        title: row.title,
        kicker: row.kicker,
        description: row.description,
        image: row.image,
        imageAlt: row.image_alt,
        tags: (tagsByCase.get(row.id) || []).map(tag => tag.tag),
        nasUrl: row.nas_url
      }
      if (row.outcome) item.outcome = row.outcome
      if (row.outcome_label) item.outcomeLabel = row.outcome_label
      if (row.contain) item.contain = true
      const casePartners = partnersByCase.get(row.id)
      if (casePartners?.length) item.partners = casePartners.map(partner => ({ name: partner.name, logo: partner.logo }))
      return item
    })
  }

  getSnapshot() {
    return { cases: this.getCases(), revision: this.getRevision() }
  }

  getHealth() {
    this.database.prepare('SELECT 1 AS ok').get()
    return {
      connected: true,
      schemaVersion: Number(this.database.prepare('PRAGMA user_version').get().user_version),
      caseCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM cases').get().count),
      revision: this.getRevision(),
      journalMode: this.database.prepare('PRAGMA journal_mode').get().journal_mode
    }
  }

  async createBackup() {
    const revision = this.getRevision()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(this.backupDir, `portal-${timestamp}-r${revision}.sqlite`)
    await backup(this.database, target)
    const backups = readdirSync(this.backupDir)
      .filter(file => /^portal-.*-r\d+\.sqlite$/.test(file))
      .sort()
    for (const expired of backups.slice(0, Math.max(0, backups.length - this.backupLimit))) {
      unlinkSync(join(this.backupDir, expired))
    }
    return basename(target)
  }

  async replaceCases(payload, { expectedRevision, actor = 'admin' } = {}) {
    const operation = async () => {
      const cases = validateCases(payload)
      const currentRevision = this.getRevision()
      if (expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
        throw new DatabaseConflictError()
      }
      await this.createBackup()
      const nextRevision = currentRevision + 1
      this.replaceInsideTransaction(cases, nextRevision, actor)
      return this.getSnapshot()
    }
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  replaceInsideTransaction(cases, revision, actor) {
    const insertCase = this.database.prepare(`
      INSERT INTO cases (
        id, sort_order, category, title, kicker, description, image, image_alt,
        nas_url, outcome, outcome_label, contain, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertTag = this.database.prepare('INSERT INTO case_tags (case_id, position, tag) VALUES (?, ?, ?)')
    const insertPartner = this.database.prepare('INSERT INTO case_partners (case_id, position, name, logo) VALUES (?, ?, ?, ?)')
    const now = new Date().toISOString()
    const createdAt = new Map(this.database.prepare('SELECT id, created_at FROM cases').all().map(row => [row.id, row.created_at]))
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.exec('DELETE FROM cases')
      cases.forEach((item, index) => {
        insertCase.run(
          item.id,
          index,
          item.category,
          item.title,
          item.kicker,
          item.description,
          item.image,
          item.imageAlt,
          item.nasUrl,
          item.outcome || '',
          item.outcomeLabel || '',
          item.contain ? 1 : 0,
          createdAt.get(item.id) || now,
          now
        )
        item.tags.forEach((tag, position) => insertTag.run(item.id, position, tag))
        ;(item.partners || []).forEach((partner, position) => insertPartner.run(item.id, position, partner.name, partner.logo))
      })
      this.database.prepare(`
        INSERT INTO metadata (key, value) VALUES ('case_revision', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(revision))
      this.database.prepare('INSERT INTO case_changes (revision, changed_at, actor, case_count) VALUES (?, ?, ?, ?)')
        .run(revision, now, String(actor).slice(0, 100), cases.length)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  close() {
    if (!this.database.isOpen) return
    this.database.exec('PRAGMA optimize')
    this.database.close()
  }
}

export const schemaVersion = SCHEMA_VERSION
