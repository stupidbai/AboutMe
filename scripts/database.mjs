import { backup, DatabaseSync } from 'node:sqlite'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { validateCases } from './case-schema.mjs'
import { validateSiteConfig } from './site-config-schema.mjs'
import { defaultAiSettings, validateAiSettings, validateKnowledgeEntries } from './knowledge-schema.mjs'

const SCHEMA_VERSION = 4

export class DatabaseConflictError extends Error {
  constructor(message = '配置已被其他管理员更新，请刷新后重试。') {
    super(message)
    this.name = 'DatabaseConflictError'
  }
}

export class PortalDatabase {
  constructor({ dataDir, seedFile, siteConfigSeedFile, knowledgeSeedFile, encryptionSecret, backupLimit = 10 }) {
    this.dataDir = resolve(dataDir)
    this.seedFile = resolve(seedFile)
    this.siteConfigSeedFile = resolve(siteConfigSeedFile)
    this.knowledgeSeedFile = resolve(knowledgeSeedFile)
    this.encryptionKey = createHash('sha256').update(String(encryptionSecret || '')).digest()
    this.backupLimit = Math.max(1, Math.min(Number(backupLimit) || 10, 50))
    this.backupDir = join(this.dataDir, 'backups')
    this.databaseFile = join(this.dataDir, 'portal.sqlite')
    mkdirSync(this.backupDir, { recursive: true })
    this.database = new DatabaseSync(this.databaseFile, { timeout: 5000 })
    this.writeQueue = Promise.resolve()
    this.configure()
    this.migrate()
    this.seedIfEmpty()
    this.seedSiteConfigIfEmpty()
    this.seedKnowledgeIfEmpty()
    this.seedAiSettingsIfEmpty()
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
    if (currentVersion < 2) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS site_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          json_value TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision > 0),
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS site_config_changes (
          id INTEGER PRIMARY KEY,
          revision INTEGER NOT NULL,
          changed_at TEXT NOT NULL,
          actor TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_site_config_changes_revision ON site_config_changes(revision DESC);
        PRAGMA user_version = 2;
        COMMIT;
      `)
    }
    if (currentVersion < 3) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS knowledge_entries (
          id TEXT PRIMARY KEY,
          sort_order INTEGER NOT NULL UNIQUE,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          body TEXT NOT NULL,
          stage TEXT NOT NULL,
          updated_label TEXT NOT NULL,
          published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS knowledge_takeaways (
          entry_id TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          takeaway TEXT NOT NULL,
          PRIMARY KEY (entry_id, position)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS knowledge_changes (
          id INTEGER PRIMARY KEY,
          revision INTEGER NOT NULL,
          changed_at TEXT NOT NULL,
          actor TEXT NOT NULL,
          entry_count INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS ai_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
          provider TEXT NOT NULL,
          api_url TEXT NOT NULL,
          model TEXT NOT NULL,
          api_key_cipher TEXT NOT NULL DEFAULT '',
          api_key_iv TEXT NOT NULL DEFAULT '',
          api_key_tag TEXT NOT NULL DEFAULT '',
          top_k INTEGER NOT NULL,
          temperature REAL NOT NULL,
          max_tokens INTEGER NOT NULL,
          system_prompt TEXT NOT NULL,
          revision INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS ai_settings_changes (
          id INTEGER PRIMARY KEY,
          revision INTEGER NOT NULL,
          changed_at TEXT NOT NULL,
          actor TEXT NOT NULL,
          enabled INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_knowledge_category_order ON knowledge_entries(category, sort_order);
        CREATE INDEX IF NOT EXISTS idx_knowledge_published_order ON knowledge_entries(published, sort_order);
        CREATE INDEX IF NOT EXISTS idx_knowledge_changes_revision ON knowledge_changes(revision DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_settings_changes_revision ON ai_settings_changes(revision DESC);
        PRAGMA user_version = 3;
        COMMIT;
      `)
    }
    if (currentVersion < 4) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE ai_settings ADD COLUMN daily_limit INTEGER NOT NULL DEFAULT 200 CHECK (daily_limit BETWEEN 1 AND 100000);
        ALTER TABLE ai_settings ADD COLUMN allow_private_network INTEGER NOT NULL DEFAULT 0 CHECK (allow_private_network IN (0, 1));
        CREATE TABLE IF NOT EXISTS rag_queries (
          id TEXT PRIMARY KEY,
          client_hash TEXT NOT NULL,
          question TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('search', 'ai', 'error')),
          source_count INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          error_message TEXT NOT NULL DEFAULT '',
          feedback INTEGER CHECK (feedback IN (-1, 1)),
          feedback_at TEXT,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_rag_queries_client_created ON rag_queries(client_hash, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rag_queries_created ON rag_queries(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rag_queries_status ON rag_queries(status, created_at DESC);
        PRAGMA user_version = 4;
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

  seedSiteConfigIfEmpty() {
    const initialized = this.database.prepare('SELECT revision FROM site_config WHERE id = 1').get()
    if (initialized) return
    if (!existsSync(this.siteConfigSeedFile)) throw new Error(`缺少站点配置种子文件：${this.siteConfigSeedFile}`)
    const config = validateSiteConfig(JSON.parse(readFileSync(this.siteConfigSeedFile, 'utf8')))
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO site_config (id, json_value, revision, updated_at, updated_by)
      VALUES (1, ?, 1, ?, 'json-seed')
    `).run(JSON.stringify(config), now)
    this.database.prepare('INSERT INTO site_config_changes (revision, changed_at, actor) VALUES (1, ?, ?)')
      .run(now, 'json-seed')
  }

  seedKnowledgeIfEmpty() {
    const initialized = this.database.prepare("SELECT value FROM metadata WHERE key = 'knowledge_revision'").get()
    if (initialized) return
    if (!existsSync(this.knowledgeSeedFile)) throw new Error(`缺少知识库种子文件：${this.knowledgeSeedFile}`)
    const entries = validateKnowledgeEntries(JSON.parse(readFileSync(this.knowledgeSeedFile, 'utf8')))
    this.replaceKnowledgeInsideTransaction(entries, 1, 'json-seed')
  }

  seedAiSettingsIfEmpty() {
    if (this.database.prepare('SELECT revision FROM ai_settings WHERE id = 1').get()) return
    const settings = validateAiSettings(defaultAiSettings)
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO ai_settings (
        id, enabled, provider, api_url, model, top_k, temperature, max_tokens,
      system_prompt, daily_limit, allow_private_network, revision, updated_at, updated_by
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'default-seed')
    `).run(settings.enabled ? 1 : 0, settings.provider, settings.apiUrl, settings.model, settings.topK,
      settings.temperature, settings.maxTokens, settings.systemPrompt, settings.dailyLimit,
      settings.allowPrivateNetwork ? 1 : 0, now)
    this.database.prepare('INSERT INTO ai_settings_changes (revision, changed_at, actor, enabled) VALUES (1, ?, ?, ?)')
      .run(now, 'default-seed', 0)
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

  getSiteConfigSnapshot() {
    const row = this.database.prepare('SELECT json_value, revision FROM site_config WHERE id = 1').get()
    if (!row) throw new Error('站点配置尚未初始化。')
    return { config: validateSiteConfig(JSON.parse(row.json_value)), revision: Number(row.revision) }
  }

  getKnowledgeRevision() {
    const row = this.database.prepare("SELECT value FROM metadata WHERE key = 'knowledge_revision'").get()
    return Number(row?.value || 0)
  }

  getKnowledgeEntries({ publishedOnly = false } = {}) {
    const rows = this.database.prepare(`
      SELECT id, category, title, summary, body, stage, updated_label, published
      FROM knowledge_entries
      ${publishedOnly ? 'WHERE published = 1' : ''}
      ORDER BY sort_order
    `).all()
    const takeaways = this.database.prepare('SELECT entry_id, takeaway FROM knowledge_takeaways ORDER BY entry_id, position').all()
    const byEntry = Map.groupBy(takeaways, row => row.entry_id)
    return rows.map(row => ({
      id: row.id,
      category: row.category,
      title: row.title,
      summary: row.summary,
      body: row.body,
      takeaways: (byEntry.get(row.id) || []).map(item => item.takeaway),
      stage: row.stage,
      updated: row.updated_label,
      published: Boolean(row.published)
    }))
  }

  getKnowledgeSnapshot(options) {
    return { entries: this.getKnowledgeEntries(options), revision: this.getKnowledgeRevision() }
  }

  encryptSecret(value) {
    if (!value) return { cipher: '', iv: '', tag: '' }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return { cipher: encrypted.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
  }

  decryptSecret(cipherText, ivText, tagText) {
    if (!cipherText) return ''
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivText, 'base64'))
      decipher.setAuthTag(Buffer.from(tagText, 'base64'))
      return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()]).toString('utf8')
    } catch {
      throw new Error('AI API Key 无法解密，请在管理页重新填写。')
    }
  }

  getAiSettings({ includeSecret = false } = {}) {
    const row = this.database.prepare('SELECT * FROM ai_settings WHERE id = 1').get()
    if (!row) throw new Error('AI 配置尚未初始化。')
    const settings = {
      enabled: Boolean(row.enabled), provider: row.provider, apiUrl: row.api_url, model: row.model,
      topK: Number(row.top_k), temperature: Number(row.temperature), maxTokens: Number(row.max_tokens),
      dailyLimit: Number(row.daily_limit), allowPrivateNetwork: Boolean(row.allow_private_network),
      systemPrompt: row.system_prompt, apiKeySet: Boolean(row.api_key_cipher), revision: Number(row.revision)
    }
    if (includeSecret) settings.apiKey = this.decryptSecret(row.api_key_cipher, row.api_key_iv, row.api_key_tag)
    return settings
  }

  getHealth() {
    this.database.prepare('SELECT 1 AS ok').get()
    return {
      connected: true,
      schemaVersion: Number(this.database.prepare('PRAGMA user_version').get().user_version),
      caseCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM cases').get().count),
      revision: this.getRevision(),
      siteConfigRevision: Number(this.database.prepare('SELECT revision FROM site_config WHERE id = 1').get()?.revision || 0),
      knowledgeCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM knowledge_entries').get().count),
      knowledgeRevision: this.getKnowledgeRevision(),
      aiEnabled: Boolean(this.database.prepare('SELECT enabled FROM ai_settings WHERE id = 1').get()?.enabled),
      ragQueryCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM rag_queries').get().count),
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
        throw new DatabaseConflictError('案例配置已被其他管理员更新，请刷新后重试。')
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

  async replaceSiteConfig(payload, { expectedRevision, actor = 'admin' } = {}) {
    const operation = async () => {
      const config = validateSiteConfig(payload)
      const current = this.getSiteConfigSnapshot()
      if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
        throw new DatabaseConflictError('站点配置已被其他管理员更新，请刷新后重试。')
      }
      await this.createBackup()
      const nextRevision = current.revision + 1
      const now = new Date().toISOString()
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.prepare(`
          UPDATE site_config
          SET json_value = ?, revision = ?, updated_at = ?, updated_by = ?
          WHERE id = 1
        `).run(JSON.stringify(config), nextRevision, now, String(actor).slice(0, 100))
        this.database.prepare('INSERT INTO site_config_changes (revision, changed_at, actor) VALUES (?, ?, ?)')
          .run(nextRevision, now, String(actor).slice(0, 100))
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
      return this.getSiteConfigSnapshot()
    }
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  async replaceKnowledge(payload, { expectedRevision, actor = 'admin' } = {}) {
    const operation = async () => {
      const entries = validateKnowledgeEntries(payload)
      const currentRevision = this.getKnowledgeRevision()
      if (expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
        throw new DatabaseConflictError('知识库已被其他管理员更新，请刷新后重试。')
      }
      await this.createBackup()
      this.replaceKnowledgeInsideTransaction(entries, currentRevision + 1, actor)
      return this.getKnowledgeSnapshot()
    }
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  replaceKnowledgeInsideTransaction(entries, revision, actor) {
    const insertEntry = this.database.prepare(`
      INSERT INTO knowledge_entries (
        id, sort_order, category, title, summary, body, stage, updated_label,
        published, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertTakeaway = this.database.prepare('INSERT INTO knowledge_takeaways (entry_id, position, takeaway) VALUES (?, ?, ?)')
    const now = new Date().toISOString()
    const createdAt = new Map(this.database.prepare('SELECT id, created_at FROM knowledge_entries').all().map(row => [row.id, row.created_at]))
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.exec('DELETE FROM knowledge_entries')
      entries.forEach((item, index) => {
        insertEntry.run(item.id, index, item.category, item.title, item.summary, item.body, item.stage,
          item.updated, item.published ? 1 : 0, createdAt.get(item.id) || now, now)
        item.takeaways.forEach((takeaway, position) => insertTakeaway.run(item.id, position, takeaway))
      })
      this.database.prepare(`
        INSERT INTO metadata (key, value) VALUES ('knowledge_revision', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(revision))
      this.database.prepare('INSERT INTO knowledge_changes (revision, changed_at, actor, entry_count) VALUES (?, ?, ?, ?)')
        .run(revision, now, String(actor).slice(0, 100), entries.length)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async replaceAiSettings(payload, { expectedRevision, actor = 'admin' } = {}) {
    const operation = async () => {
      const incoming = validateAiSettings(payload)
      const current = this.getAiSettings({ includeSecret: true })
      if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
        throw new DatabaseConflictError('AI 配置已被其他管理员更新，请刷新后重试。')
      }
      const apiKey = incoming.clearApiKey ? '' : (incoming.apiKey || current.apiKey)
      const encrypted = this.encryptSecret(apiKey)
      await this.createBackup()
      const revision = current.revision + 1
      const now = new Date().toISOString()
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.prepare(`
          UPDATE ai_settings SET enabled = ?, provider = ?, api_url = ?, model = ?,
            api_key_cipher = ?, api_key_iv = ?, api_key_tag = ?, top_k = ?, temperature = ?,
            max_tokens = ?, system_prompt = ?, daily_limit = ?, allow_private_network = ?,
            revision = ?, updated_at = ?, updated_by = ? WHERE id = 1
        `).run(incoming.enabled ? 1 : 0, incoming.provider, incoming.apiUrl, incoming.model,
          encrypted.cipher, encrypted.iv, encrypted.tag, incoming.topK, incoming.temperature,
          incoming.maxTokens, incoming.systemPrompt, incoming.dailyLimit, incoming.allowPrivateNetwork ? 1 : 0,
          revision, now, String(actor).slice(0, 100))
        this.database.prepare('INSERT INTO ai_settings_changes (revision, changed_at, actor, enabled) VALUES (?, ?, ?, ?)')
          .run(revision, now, String(actor).slice(0, 100), incoming.enabled ? 1 : 0)
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
      return this.getAiSettings()
    }
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  getRagQueryCount(clientHash, since) {
    return Number(this.database.prepare('SELECT COUNT(*) AS count FROM rag_queries WHERE client_hash = ? AND created_at >= ?').get(clientHash, since).count)
  }

  recordRagQuery({ id, clientHash, question, mode, sourceCount, durationMs, status, errorMessage = '' }) {
    this.database.prepare(`
      INSERT INTO rag_queries (id, client_hash, question, mode, source_count, duration_ms, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, clientHash, String(question).slice(0, 500), mode, Number(sourceCount) || 0,
      Math.max(0, Number(durationMs) || 0), String(status).slice(0, 40), String(errorMessage).slice(0, 500), new Date().toISOString())
  }

  setRagFeedback(queryId, feedback) {
    const result = this.database.prepare('UPDATE rag_queries SET feedback = ?, feedback_at = ? WHERE id = ?')
      .run(feedback, new Date().toISOString(), queryId)
    return Number(result.changes) > 0
  }

  getRagStats(days = 30) {
    const safeDays = Math.max(1, Math.min(Number(days) || 30, 365))
    const since = new Date(Date.now() - safeDays * 86400000).toISOString()
    const summary = this.database.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'no_results' THEN 1 ELSE 0 END) AS no_results,
             SUM(CASE WHEN mode = 'ai' AND status = 'ok' THEN 1 ELSE 0 END) AS ai_answers,
             ROUND(AVG(duration_ms)) AS average_ms,
             SUM(CASE WHEN feedback = 1 THEN 1 ELSE 0 END) AS helpful,
             SUM(CASE WHEN feedback = -1 THEN 1 ELSE 0 END) AS unhelpful
      FROM rag_queries WHERE created_at >= ?
    `).get(since)
    const recent = this.database.prepare(`
      SELECT id, question, mode, source_count, duration_ms, status, feedback, created_at
      FROM rag_queries WHERE created_at >= ? ORDER BY created_at DESC LIMIT 50
    `).all(since).map(row => ({
      id: row.id, question: row.question, mode: row.mode, sourceCount: row.source_count,
      durationMs: row.duration_ms, status: row.status, feedback: row.feedback, createdAt: row.created_at
    }))
    return {
      days: safeDays,
      summary: {
        total: Number(summary.total || 0), noResults: Number(summary.no_results || 0),
        aiAnswers: Number(summary.ai_answers || 0), averageMs: Number(summary.average_ms || 0),
        helpful: Number(summary.helpful || 0), unhelpful: Number(summary.unhelpful || 0)
      },
      recent
    }
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
