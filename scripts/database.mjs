import { backup, DatabaseSync } from 'node:sqlite'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { validateCases } from './case-schema.mjs'
import { validateSiteConfig } from './site-config-schema.mjs'
import { defaultAiSettings, validateAiSettings, validateKnowledgeEntries } from './knowledge-schema.mjs'
import { defaultCommunitySettings, validateCommunitySettings } from './community-settings.mjs'

const SCHEMA_VERSION = 7

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
    this.lastAnalyticsPruneAt = 0
    this.configure()
    this.migrate()
    this.seedIfEmpty()
    this.seedSiteConfigIfEmpty()
    this.seedKnowledgeIfEmpty()
    this.seedAiSettingsIfEmpty()
    this.seedCommunitySettingsIfEmpty()
    this.seedAnalyticsSettingsIfEmpty()
    this.seedCommunityIfEmpty()
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
    if (currentVersion < 5) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS community_users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          email TEXT NOT NULL COLLATE NOCASE UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator')),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
          bio TEXT NOT NULL DEFAULT '',
          terms_accepted_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login_at TEXT
        ) STRICT;
        CREATE TABLE IF NOT EXISTS community_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
          ip_hash TEXT NOT NULL DEFAULT '',
          user_agent_hash TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS article_comments (
          id TEXT PRIMARY KEY,
          article_path TEXT NOT NULL,
          user_id TEXT REFERENCES community_users(id) ON DELETE SET NULL,
          parent_id TEXT REFERENCES article_comments(id) ON DELETE SET NULL,
          body_md TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS article_comment_likes (
          comment_id TEXT NOT NULL REFERENCES article_comments(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (comment_id, user_id)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS forum_categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS forum_posts (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL REFERENCES forum_categories(id),
          user_id TEXT REFERENCES community_users(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          body_md TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'locked', 'deleted')),
          view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS forum_replies (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES community_users(id) ON DELETE SET NULL,
          parent_id TEXT REFERENCES forum_replies(id) ON DELETE SET NULL,
          body_md TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS forum_post_likes (
          post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (post_id, user_id)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS forum_reply_likes (
          reply_id TEXT NOT NULL REFERENCES forum_replies(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (reply_id, user_id)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS community_audit (
          id INTEGER PRIMARY KEY,
          actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'user', 'system')),
          actor_id TEXT NOT NULL DEFAULT '',
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL DEFAULT '',
          detail TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_community_users_status_created ON community_users(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_community_sessions_user ON community_sessions(user_id, expires_at DESC);
        CREATE INDEX IF NOT EXISTS idx_community_sessions_expiry ON community_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_article_comments_path_created ON article_comments(article_path, created_at);
        CREATE INDEX IF NOT EXISTS idx_article_comments_user ON article_comments(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_forum_posts_category_activity ON forum_posts(category_id, last_activity_at DESC);
        CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON forum_posts(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_forum_replies_post_created ON forum_replies(post_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_forum_replies_user ON forum_replies(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_community_audit_created ON community_audit(created_at DESC);
        PRAGMA user_version = 5;
        COMMIT;
      `)
    }
    if (currentVersion < 6) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE community_users ADD COLUMN email_verified_at TEXT;
        UPDATE community_users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
        ALTER TABLE forum_categories ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1));
        ALTER TABLE forum_posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1));
        ALTER TABLE forum_posts ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1));
        CREATE TABLE IF NOT EXISTS community_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          registration_enabled INTEGER NOT NULL DEFAULT 1 CHECK (registration_enabled IN (0, 1)),
          require_email_verification INTEGER NOT NULL DEFAULT 0 CHECK (require_email_verification IN (0, 1)),
          public_site_url TEXT NOT NULL,
          smtp_host TEXT NOT NULL DEFAULT '',
          smtp_port INTEGER NOT NULL DEFAULT 587 CHECK (smtp_port BETWEEN 1 AND 65535),
          smtp_secure INTEGER NOT NULL DEFAULT 0 CHECK (smtp_secure IN (0, 1)),
          smtp_user TEXT NOT NULL DEFAULT '',
          smtp_from TEXT NOT NULL DEFAULT '',
          smtp_password_cipher TEXT NOT NULL DEFAULT '',
          smtp_password_iv TEXT NOT NULL DEFAULT '',
          smtp_password_tag TEXT NOT NULL DEFAULT '',
          turnstile_enabled INTEGER NOT NULL DEFAULT 0 CHECK (turnstile_enabled IN (0, 1)),
          turnstile_site_key TEXT NOT NULL DEFAULT '',
          turnstile_secret_cipher TEXT NOT NULL DEFAULT '',
          turnstile_secret_iv TEXT NOT NULL DEFAULT '',
          turnstile_secret_tag TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL CHECK (revision > 0),
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS community_tokens (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK (type IN ('verify_email', 'reset_password')),
          user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS product_events (
          id INTEGER PRIMARY KEY,
          user_id TEXT REFERENCES community_users(id) ON DELETE SET NULL,
          event_name TEXT NOT NULL,
          context TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_community_tokens_lookup ON community_tokens(token_hash, type, expires_at);
        CREATE INDEX IF NOT EXISTS idx_product_events_name_created ON product_events(event_name, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_product_events_user_created ON product_events(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_forum_posts_pinned_activity ON forum_posts(is_pinned DESC, last_activity_at DESC);
        PRAGMA user_version = 6;
        COMMIT;
      `)
    }
    if (currentVersion < 7) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS analytics_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          respect_dnt INTEGER NOT NULL DEFAULT 1 CHECK (respect_dnt IN (0, 1)),
          retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 30 AND 1825),
          revision INTEGER NOT NULL CHECK (revision > 0),
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS analytics_settings_changes (
          id INTEGER PRIMARY KEY,
          revision INTEGER NOT NULL,
          changed_at TEXT NOT NULL,
          actor TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS site_events (
          id INTEGER PRIMARY KEY,
          event_id TEXT NOT NULL UNIQUE,
          visitor_hash TEXT NOT NULL,
          session_hash TEXT NOT NULL,
          event_name TEXT NOT NULL CHECK (event_name IN (
            'page_view', 'page_engaged', 'contact_intent', 'case_open',
            'forum_open', 'rag_query', 'account_open', 'knowledge_open'
          )),
          page_path TEXT NOT NULL,
          referrer_domain TEXT NOT NULL DEFAULT '',
          acquisition_source TEXT NOT NULL DEFAULT 'direct',
          device_type TEXT NOT NULL DEFAULT 'other' CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'other')),
          load_ms INTEGER NOT NULL DEFAULT 0 CHECK (load_ms BETWEEN 0 AND 120000),
          ttfb_ms INTEGER NOT NULL DEFAULT 0 CHECK (ttfb_ms BETWEEN 0 AND 120000),
          fcp_ms INTEGER NOT NULL DEFAULT 0 CHECK (fcp_ms BETWEEN 0 AND 120000),
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_analytics_settings_changes_revision ON analytics_settings_changes(revision DESC);
        CREATE INDEX IF NOT EXISTS idx_site_events_created ON site_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_site_events_name_created ON site_events(event_name, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_site_events_visitor_created ON site_events(visitor_hash, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_site_events_session_created ON site_events(session_hash, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_site_events_page_created ON site_events(page_path, created_at DESC);
        PRAGMA user_version = 7;
        COMMIT;
      `)
    }
  }

  seedCommunitySettingsIfEmpty() {
    if (this.database.prepare('SELECT id FROM community_settings WHERE id = 1').get()) return
    const settings = validateCommunitySettings(defaultCommunitySettings)
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO community_settings (
        id, registration_enabled, require_email_verification, public_site_url,
        smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from,
        turnstile_enabled, turnstile_site_key, revision, updated_at, updated_by
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'default-seed')
    `).run(settings.registrationEnabled ? 1 : 0, settings.requireEmailVerification ? 1 : 0,
      settings.publicSiteUrl, settings.smtpHost, settings.smtpPort, settings.smtpSecure ? 1 : 0,
      settings.smtpUser, settings.smtpFrom, settings.turnstileEnabled ? 1 : 0,
      settings.turnstileSiteKey, now)
  }

  seedAnalyticsSettingsIfEmpty() {
    if (this.database.prepare('SELECT id FROM analytics_settings WHERE id = 1').get()) return
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO analytics_settings (id, enabled, respect_dnt, retention_days, revision, updated_at, updated_by)
      VALUES (1, 1, 1, 365, 1, ?, 'default-seed')
    `).run(now)
    this.database.prepare('INSERT INTO analytics_settings_changes (revision, changed_at, actor) VALUES (1, ?, ?)')
      .run(now, 'default-seed')
  }

  seedCommunityIfEmpty() {
    const siteConfig = this.database.prepare('SELECT json_value, revision FROM site_config WHERE id = 1').get()
    if (siteConfig) {
      const config = JSON.parse(siteConfig.json_value)
      if (!config.routes?.some(route => route.link === '/forum')) {
        config.routes = (config.routes || []).map(route => route.link === '/contact' ? { ...route, code: '08 · CONTACT' } : route)
        const forumRoute = {
          code: '07 · FORUM', title: '交流论坛与社区共创',
          description: '围绕企业 AI、工程实践、商业合作和生态连接持续讨论。',
          link: '/forum', tags: ['开放讨论', '经验互助', '合作连接'], accent: 'violet', enabled: true
        }
        const contactIndex = config.routes.findIndex(route => route.link === '/contact')
        if (contactIndex >= 0) config.routes.splice(contactIndex, 0, forumRoute)
        else config.routes.push(forumRoute)
        this.database.prepare('UPDATE site_config SET json_value = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = 1')
          .run(JSON.stringify(validateSiteConfig(config)), Number(siteConfig.revision) + 1, new Date().toISOString(), 'v4.1-migration')
      }
    }
    const categories = [
      ['ai', '企业 AI', '讨论企业 AI 场景、RAG、Agent、模型治理与落地。'],
      ['engineering', '技术实践', '分享工程实现、架构设计、工具链和排障经验。'],
      ['cooperation', '商业合作', '发布合作需求、资源对接、解决方案和项目讨论。'],
      ['chat', '交流广场', '开放交流、经验分享与社区建议。']
    ]
    const insert = this.database.prepare('INSERT OR IGNORE INTO forum_categories (id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    const now = new Date().toISOString()
    categories.forEach((category, index) => insert.run(category[0], category[1], category[2], index, now))
    if (Number(this.database.prepare('SELECT COUNT(*) AS count FROM forum_posts').get().count) === 0) {
      const welcomePosts = [
        ['100000000000000000000001', 'ai', '欢迎来到企业 AI 讨论区', '这里适合交流企业知识库、RAG、Agent、模型治理与业务落地。欢迎先介绍你的行业、场景与当前问题。', 1, 1],
        ['100000000000000000000002', 'engineering', '工程实践：从可运行到可运营', '分享架构取舍、部署经验、质量保障和排障记录。请尽量补充环境、约束和验证结果，让经验能够复用。', 1, 1],
        ['100000000000000000000003', 'cooperation', '如何发布一条高质量合作需求', '建议写明客户或行业、当前问题、已有资源、期望结果、时间窗口，以及希望合作方承担的角色。涉及敏感信息时请先脱敏。', 1, 0],
        ['100000000000000000000004', 'chat', '社区共建建议收集', '你希望知识库、论坛和案例库下一步增加什么能力？欢迎提交具体使用场景与优先级建议。', 0, 1]
      ]
      const insertPost = this.database.prepare(`
        INSERT INTO forum_posts (
          id, category_id, user_id, title, body_md, status, view_count,
          created_at, updated_at, last_activity_at, is_pinned, is_featured
        ) VALUES (?, ?, NULL, ?, ?, 'active', 0, ?, ?, ?, ?, ?)
      `)
      welcomePosts.forEach((post, index) => {
        const time = new Date(Date.now() - index * 60_000).toISOString()
        insertPost.run(post[0], post[1], post[2], post[3], time, time, time, post[4], post[5])
      })
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
      throw new Error('加密配置无法解密，请在管理页重新填写。')
    }
  }

  getCommunitySettings({ includeSecrets = false } = {}) {
    const row = this.database.prepare('SELECT * FROM community_settings WHERE id = 1').get()
    if (!row) throw new Error('社区配置尚未初始化。')
    const settings = {
      registrationEnabled: Boolean(row.registration_enabled),
      requireEmailVerification: Boolean(row.require_email_verification),
      publicSiteUrl: row.public_site_url,
      smtpHost: row.smtp_host,
      smtpPort: Number(row.smtp_port),
      smtpSecure: Boolean(row.smtp_secure),
      smtpUser: row.smtp_user,
      smtpFrom: row.smtp_from,
      smtpPasswordSet: Boolean(row.smtp_password_cipher),
      turnstileEnabled: Boolean(row.turnstile_enabled),
      turnstileSiteKey: row.turnstile_site_key,
      turnstileSecretSet: Boolean(row.turnstile_secret_cipher),
      revision: Number(row.revision)
    }
    if (includeSecrets) {
      settings.smtpPassword = this.decryptSecret(row.smtp_password_cipher, row.smtp_password_iv, row.smtp_password_tag)
      settings.turnstileSecret = this.decryptSecret(row.turnstile_secret_cipher, row.turnstile_secret_iv, row.turnstile_secret_tag)
    }
    return settings
  }

  getAnalyticsSettings() {
    const row = this.database.prepare('SELECT * FROM analytics_settings WHERE id = 1').get()
    if (!row) throw new Error('访问监控配置尚未初始化。')
    return {
      enabled: Boolean(row.enabled),
      respectDnt: Boolean(row.respect_dnt),
      retentionDays: Number(row.retention_days),
      revision: Number(row.revision),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
    }
  }

  validateAnalyticsSettings(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('访问监控配置格式无效。')
    const retentionDays = Number(payload.retentionDays)
    if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 1825) {
      throw new Error('统计数据保留天数必须是 30-1825 之间的整数。')
    }
    return {
      enabled: Boolean(payload.enabled),
      respectDnt: Boolean(payload.respectDnt),
      retentionDays
    }
  }

  async replaceAnalyticsSettings(payload, { expectedRevision, actor = 'admin' } = {}) {
    const operation = async () => {
      const settings = this.validateAnalyticsSettings(payload)
      const current = this.getAnalyticsSettings()
      if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
        throw new DatabaseConflictError('访问监控配置已被其他管理员更新，请刷新后重试。')
      }
      await this.createBackup()
      const revision = current.revision + 1
      const now = new Date().toISOString()
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.prepare(`
          UPDATE analytics_settings
          SET enabled = ?, respect_dnt = ?, retention_days = ?, revision = ?, updated_at = ?, updated_by = ?
          WHERE id = 1
        `).run(settings.enabled ? 1 : 0, settings.respectDnt ? 1 : 0, settings.retentionDays,
          revision, now, String(actor).slice(0, 100))
        this.database.prepare('INSERT INTO analytics_settings_changes (revision, changed_at, actor) VALUES (?, ?, ?)')
          .run(revision, now, String(actor).slice(0, 100))
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
      this.pruneAnalyticsEvents()
      return this.getAnalyticsSettings()
    }
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  recordSiteEvent({ eventId, visitorHash, sessionHash, eventName, pagePath, referrerDomain = '', acquisitionSource = 'direct', deviceType = 'other', loadMs = 0, ttfbMs = 0, fcpMs = 0 }) {
    const allowedEvents = new Set(['page_view', 'page_engaged', 'contact_intent', 'case_open', 'forum_open', 'rag_query', 'account_open', 'knowledge_open'])
    if (!allowedEvents.has(eventName)) throw new Error('访问事件类型无效。')
    const normalized = value => Math.max(0, Math.min(120000, Math.round(Number(value) || 0)))
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO site_events (
        event_id, visitor_hash, session_hash, event_name, page_path, referrer_domain,
        acquisition_source, device_type, load_ms, ttfb_ms, fcp_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId, visitorHash, sessionHash, eventName, pagePath, referrerDomain,
      acquisitionSource, deviceType, normalized(loadMs), normalized(ttfbMs), normalized(fcpMs), new Date().toISOString()
    )
    return Boolean(result.changes)
  }

  pruneAnalyticsEvents() {
    const settings = this.getAnalyticsSettings()
    const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000).toISOString()
    this.lastAnalyticsPruneAt = Date.now()
    return Number(this.database.prepare('DELETE FROM site_events WHERE created_at < ?').run(cutoff).changes)
  }

  maybePruneAnalyticsEvents() {
    if (Date.now() - this.lastAnalyticsPruneAt < 60 * 60 * 1000) return 0
    return this.pruneAnalyticsEvents()
  }

  getSiteAnalytics(days = 30) {
    const safeDays = Math.max(1, Math.min(Number(days) || 30, 365))
    const currentSince = new Date(Date.now() - safeDays * 86_400_000).toISOString()
    const previousSince = new Date(Date.now() - safeDays * 2 * 86_400_000).toISOString()
    const dayExpression = "strftime('%Y-%m-%d', created_at, '+8 hours')"
    const aggregate = (from, until = null, returnBefore = from) => {
      const range = until ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
      const params = until ? [from, until] : [from]
      const row = this.database.prepare(`
        SELECT
          SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
          COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_hash END) AS visitors,
          COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN session_hash END) AS sessions,
          COUNT(DISTINCT CASE WHEN event_name = 'page_engaged' THEN session_hash END) AS engaged_sessions,
          SUM(CASE WHEN event_name = 'contact_intent' THEN 1 ELSE 0 END) AS contact_intents,
          SUM(CASE WHEN event_name = 'case_open' THEN 1 ELSE 0 END) AS case_opens,
          SUM(CASE WHEN event_name = 'rag_query' THEN 1 ELSE 0 END) AS rag_queries,
          COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND visitor_hash IN (
            SELECT DISTINCT visitor_hash FROM site_events WHERE event_name = 'page_view' AND created_at < ?
          ) THEN visitor_hash END) AS returning_visitors
        FROM site_events WHERE ${range}
      `).get(returnBefore, ...params)
      return {
        pageViews: Number(row.page_views || 0), visitors: Number(row.visitors || 0), sessions: Number(row.sessions || 0),
        engagedSessions: Number(row.engaged_sessions || 0), contactIntents: Number(row.contact_intents || 0),
        caseOpens: Number(row.case_opens || 0), ragQueries: Number(row.rag_queries || 0), returningVisitors: Number(row.returning_visitors || 0)
      }
    }
    const current = aggregate(currentSince)
    const previous = aggregate(previousSince, currentSince)
    const percent = (value, base) => base ? Math.round(((value - base) / base) * 1000) / 10 : null
    const daily = this.database.prepare(`
      SELECT ${dayExpression} AS date,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_hash END) AS visitors,
        COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN session_hash END) AS sessions,
        COUNT(DISTINCT CASE WHEN event_name = 'page_engaged' THEN session_hash END) AS engaged_sessions,
        SUM(CASE WHEN event_name = 'contact_intent' THEN 1 ELSE 0 END) AS contact_intents
      FROM site_events WHERE created_at >= ? GROUP BY ${dayExpression} ORDER BY date
    `).all(currentSince).map(row => ({
      date: row.date, pageViews: Number(row.page_views || 0), visitors: Number(row.visitors || 0),
      sessions: Number(row.sessions || 0), engagedSessions: Number(row.engaged_sessions || 0), contactIntents: Number(row.contact_intents || 0)
    }))
    const topPages = this.database.prepare(`
      SELECT page_path, SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_hash END) AS visitors,
        COUNT(DISTINCT CASE WHEN event_name = 'page_engaged' THEN session_hash END) AS engaged_sessions
      FROM site_events WHERE created_at >= ? AND event_name IN ('page_view', 'page_engaged')
      GROUP BY page_path ORDER BY page_views DESC, visitors DESC LIMIT 12
    `).all(currentSince).map(row => ({
      pagePath: row.page_path, pageViews: Number(row.page_views || 0), visitors: Number(row.visitors || 0),
      engagedSessions: Number(row.engaged_sessions || 0)
    }))
    const sources = this.database.prepare(`
      SELECT acquisition_source, COUNT(DISTINCT visitor_hash) AS visitors,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views
      FROM site_events WHERE created_at >= ? AND event_name = 'page_view'
      GROUP BY acquisition_source ORDER BY visitors DESC, page_views DESC LIMIT 12
    `).all(currentSince).map(row => ({ source: row.acquisition_source, visitors: Number(row.visitors || 0), pageViews: Number(row.page_views || 0) }))
    const devices = this.database.prepare(`
      SELECT device_type, COUNT(DISTINCT visitor_hash) AS visitors,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views
      FROM site_events WHERE created_at >= ? AND event_name = 'page_view'
      GROUP BY device_type ORDER BY visitors DESC
    `).all(currentSince).map(row => ({ device: row.device_type, visitors: Number(row.visitors || 0), pageViews: Number(row.page_views || 0) }))
    const conversions = this.database.prepare(`
      SELECT event_name, COUNT(*) AS events, COUNT(DISTINCT visitor_hash) AS visitors
      FROM site_events WHERE created_at >= ? AND event_name IN ('contact_intent', 'case_open', 'forum_open', 'rag_query', 'account_open', 'knowledge_open')
      GROUP BY event_name ORDER BY events DESC
    `).all(currentSince).map(row => ({ eventName: row.event_name, events: Number(row.events || 0), visitors: Number(row.visitors || 0) }))
    const performanceRows = this.database.prepare(`
      SELECT load_ms, ttfb_ms, fcp_ms FROM site_events
      WHERE created_at >= ? AND event_name = 'page_view' AND load_ms > 0
      ORDER BY created_at DESC LIMIT 10000
    `).all(currentSince)
    const average = field => performanceRows.length ? Math.round(performanceRows.reduce((total, row) => total + Number(row[field] || 0), 0) / performanceRows.length) : 0
    const percentile = field => {
      if (!performanceRows.length) return 0
      const values = performanceRows.map(row => Number(row[field] || 0)).sort((left, right) => left - right)
      return values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)]
    }
    return {
      days: safeDays, timezone: 'Asia/Shanghai', collectedAt: new Date().toISOString(),
      summary: {
        ...current,
        engagementRate: current.sessions ? Math.round((current.engagedSessions / current.sessions) * 1000) / 10 : 0,
        contactRate: current.visitors ? Math.round((current.contactIntents / current.visitors) * 1000) / 10 : 0,
        pagesPerSession: current.sessions ? Math.round((current.pageViews / current.sessions) * 100) / 100 : 0
      },
      comparison: {
        previous,
        pageViewsChange: percent(current.pageViews, previous.pageViews),
        visitorsChange: percent(current.visitors, previous.visitors),
        sessionsChange: percent(current.sessions, previous.sessions),
        contactIntentsChange: percent(current.contactIntents, previous.contactIntents)
      },
      daily, topPages, sources, devices, conversions,
      performance: { samples: performanceRows.length, averageLoadMs: average('load_ms'), p95LoadMs: percentile('load_ms'), averageTtfbMs: average('ttfb_ms'), averageFcpMs: average('fcp_ms') }
    }
  }

  async replaceCommunitySettings(payload, { expectedRevision, actor = 'admin' } = {}) {
    const operation = async () => {
      const settings = validateCommunitySettings(payload)
      const current = this.getCommunitySettings({ includeSecrets: true })
      if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
        throw new DatabaseConflictError('社区配置已被其他管理员更新，请刷新后重试。')
      }
      const smtpPassword = settings.clearSmtpPassword ? '' : (settings.smtpPassword || current.smtpPassword)
      const turnstileSecret = settings.clearTurnstileSecret ? '' : (settings.turnstileSecret || current.turnstileSecret)
      if (settings.requireEmailVerification && !smtpPassword && settings.smtpUser) throw new Error('启用邮箱验证前，请填写 SMTP 密码。')
      if (settings.turnstileEnabled && !turnstileSecret) throw new Error('启用 Turnstile 前，请填写服务端密钥。')
      await this.createBackup()
      const smtpEncrypted = this.encryptSecret(smtpPassword)
      const turnstileEncrypted = this.encryptSecret(turnstileSecret)
      const revision = current.revision + 1
      const now = new Date().toISOString()
      this.database.prepare(`
        UPDATE community_settings SET
          registration_enabled = ?, require_email_verification = ?, public_site_url = ?,
          smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_from = ?,
          smtp_password_cipher = ?, smtp_password_iv = ?, smtp_password_tag = ?,
          turnstile_enabled = ?, turnstile_site_key = ?, turnstile_secret_cipher = ?,
          turnstile_secret_iv = ?, turnstile_secret_tag = ?, revision = ?, updated_at = ?, updated_by = ?
        WHERE id = 1
      `).run(settings.registrationEnabled ? 1 : 0, settings.requireEmailVerification ? 1 : 0,
        settings.publicSiteUrl, settings.smtpHost, settings.smtpPort, settings.smtpSecure ? 1 : 0,
        settings.smtpUser, settings.smtpFrom, smtpEncrypted.cipher, smtpEncrypted.iv, smtpEncrypted.tag,
        settings.turnstileEnabled ? 1 : 0, settings.turnstileSiteKey, turnstileEncrypted.cipher,
        turnstileEncrypted.iv, turnstileEncrypted.tag, revision, now, String(actor).slice(0, 100))
      this.recordCommunityAudit({ actorType: 'admin', actorId: actor, action: 'update_community_settings', targetType: 'settings', targetId: 'community' })
      return this.getCommunitySettings()
    }
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.catch(() => undefined)
    return result
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
      siteEventCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM site_events').get().count),
      analyticsEnabled: Boolean(this.database.prepare('SELECT enabled FROM analytics_settings WHERE id = 1').get()?.enabled),
      communityUserCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM community_users').get().count),
      forumPostCount: Number(this.database.prepare("SELECT COUNT(*) AS count FROM forum_posts WHERE status IN ('active', 'locked')").get().count),
      articleCommentCount: Number(this.database.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'active'").get().count),
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

  mapCommunityUser(row, { includePrivate = false } = {}) {
    if (!row) return null
    const user = {
      id: row.id, username: row.username, displayName: row.display_name, role: row.role,
      status: row.status, bio: row.bio || '', createdAt: row.created_at,
      updatedAt: row.updated_at, lastLoginAt: row.last_login_at || '',
      emailVerified: Boolean(row.email_verified_at)
    }
    if (includePrivate) {
      user.email = row.email
      user.passwordHash = row.password_hash
      user.termsAcceptedAt = row.terms_accepted_at
    }
    return user
  }

  createCommunityUser({ id, username, email, displayName, passwordHash, emailVerified = true }) {
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO community_users (
        id, username, email, display_name, password_hash, role, status, bio,
        terms_accepted_at, created_at, updated_at, email_verified_at
      ) VALUES (?, ?, ?, ?, ?, 'member', 'active', '', ?, ?, ?, ?)
    `).run(id, username, email, displayName, passwordHash, now, now, now, emailVerified ? now : null)
    this.recordCommunityAudit({ actorType: 'user', actorId: id, action: 'register', targetType: 'user', targetId: id })
    return this.getCommunityUserById(id)
  }

  getCommunityUserById(id, { includePrivate = false } = {}) {
    return this.mapCommunityUser(this.database.prepare('SELECT * FROM community_users WHERE id = ?').get(id), { includePrivate })
  }

  getCommunityUserByIdentity(identity, { includePrivate = true } = {}) {
    return this.mapCommunityUser(this.database.prepare('SELECT * FROM community_users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE').get(identity, identity), { includePrivate })
  }

  updateCommunityLastLogin(userId) {
    const now = new Date().toISOString()
    this.database.prepare('UPDATE community_users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, userId)
  }

  updateCommunityProfile(userId, { displayName, bio }) {
    const now = new Date().toISOString()
    this.database.prepare('UPDATE community_users SET display_name = ?, bio = ?, updated_at = ? WHERE id = ?')
      .run(displayName, bio, now, userId)
    this.recordCommunityAudit({ actorType: 'user', actorId: userId, action: 'update_profile', targetType: 'user', targetId: userId })
    return this.getCommunityUserById(userId, { includePrivate: true })
  }

  updateCommunityPassword(userId, passwordHash) {
    this.database.prepare('UPDATE community_users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, new Date().toISOString(), userId)
    this.recordCommunityAudit({ actorType: 'user', actorId: userId, action: 'change_password', targetType: 'user', targetId: userId })
  }

  markCommunityEmailVerified(userId) {
    const now = new Date().toISOString()
    const result = this.database.prepare('UPDATE community_users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
      .run(now, now, userId)
    if (!result.changes) throw new Error('用户不存在。')
    this.recordCommunityAudit({ actorType: 'user', actorId: userId, action: 'verify_email', targetType: 'user', targetId: userId })
    return this.getCommunityUserById(userId, { includePrivate: true })
  }

  createCommunityToken({ id, tokenHash, type, userId, expiresAt }) {
    if (!['verify_email', 'reset_password'].includes(type)) throw new Error('令牌类型无效。')
    const now = new Date().toISOString()
    this.database.prepare('DELETE FROM community_tokens WHERE user_id = ? AND type = ? AND used_at IS NULL').run(userId, type)
    this.database.prepare(`
      INSERT INTO community_tokens (id, token_hash, type, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, tokenHash, type, userId, expiresAt, now)
  }

  consumeCommunityToken(type, tokenHash) {
    const now = new Date().toISOString()
    const row = this.database.prepare(`
      SELECT id, user_id FROM community_tokens
      WHERE type = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ?
    `).get(type, tokenHash, now)
    if (!row) return null
    const result = this.database.prepare('UPDATE community_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, row.id)
    return result.changes ? this.getCommunityUserById(row.user_id, { includePrivate: true }) : null
  }

  pruneCommunityTokens() {
    return Number(this.database.prepare('DELETE FROM community_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(new Date().toISOString()).changes)
  }

  createCommunitySession({ tokenHash, userId, ipHash = '', userAgentHash = '', expiresAt }) {
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO community_sessions (token_hash, user_id, ip_hash, user_agent_hash, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tokenHash, userId, ipHash, userAgentHash, now, now, expiresAt)
  }

  getCommunitySession(tokenHash) {
    const row = this.database.prepare(`
      SELECT s.token_hash, s.expires_at, s.last_seen_at,
             u.id, u.username, u.email, u.display_name, u.password_hash, u.role, u.status,
             u.bio, u.terms_accepted_at, u.created_at, u.updated_at, u.last_login_at, u.email_verified_at
      FROM community_sessions s
      JOIN community_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash, new Date().toISOString())
    if (!row) return null
    const lastSeen = Date.parse(row.last_seen_at)
    if (!Number.isFinite(lastSeen) || lastSeen < Date.now() - 5 * 60 * 1000) {
      this.database.prepare('UPDATE community_sessions SET last_seen_at = ? WHERE token_hash = ?')
        .run(new Date().toISOString(), tokenHash)
    }
    return { tokenHash: row.token_hash, expiresAt: row.expires_at, user: this.mapCommunityUser(row, { includePrivate: true }) }
  }

  deleteCommunitySession(tokenHash) {
    return Number(this.database.prepare('DELETE FROM community_sessions WHERE token_hash = ?').run(tokenHash).changes) > 0
  }

  deleteCommunitySessions(userId, exceptTokenHash = '') {
    if (exceptTokenHash) return Number(this.database.prepare('DELETE FROM community_sessions WHERE user_id = ? AND token_hash <> ?').run(userId, exceptTokenHash).changes)
    return Number(this.database.prepare('DELETE FROM community_sessions WHERE user_id = ?').run(userId).changes)
  }

  pruneCommunitySessions() {
    return Number(this.database.prepare('DELETE FROM community_sessions WHERE expires_at <= ?').run(new Date().toISOString()).changes)
  }

  listCommunityUsers({ search = '', limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500))
    const term = `%${String(search).trim().slice(0, 100)}%`
    return this.database.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM article_comments c WHERE c.user_id = u.id AND c.status = 'active') AS comment_count,
        (SELECT COUNT(*) FROM forum_posts p WHERE p.user_id = u.id AND p.status IN ('active', 'locked')) AS post_count,
        (SELECT COUNT(*) FROM forum_replies r WHERE r.user_id = u.id AND r.status = 'active') AS reply_count
      FROM community_users u
      WHERE (? = '%%' OR u.username LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE OR u.display_name LIKE ? COLLATE NOCASE)
      ORDER BY u.created_at DESC LIMIT ?
    `).all(term, term, term, term, safeLimit).map(row => ({
      ...this.mapCommunityUser(row, { includePrivate: true }),
      commentCount: Number(row.comment_count), postCount: Number(row.post_count), replyCount: Number(row.reply_count)
    }))
  }

  updateCommunityUserByAdmin(userId, { role, status }, actor = 'admin') {
    if (!['member', 'moderator'].includes(role) || !['active', 'suspended'].includes(status)) throw new Error('用户角色或状态无效。')
    const result = this.database.prepare('UPDATE community_users SET role = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(role, status, new Date().toISOString(), userId)
    if (!result.changes) throw new Error('用户不存在。')
    if (status === 'suspended') this.deleteCommunitySessions(userId)
    this.recordCommunityAudit({ actorType: 'admin', actorId: actor, action: 'update_user', targetType: 'user', targetId: userId, detail: JSON.stringify({ role, status }) })
    return this.getCommunityUserById(userId, { includePrivate: true })
  }

  deleteCommunityUserByAdmin(userId, actor = 'admin') {
    const user = this.getCommunityUserById(userId, { includePrivate: true })
    if (!user) throw new Error('用户不存在。')
    this.recordCommunityAudit({ actorType: 'admin', actorId: actor, action: 'delete_user', targetType: 'user', targetId: userId, detail: user.username })
    this.database.prepare('DELETE FROM community_users WHERE id = ?').run(userId)
    return user
  }

  listArticleComments(articlePath, viewerUserId = '') {
    return this.database.prepare(`
      SELECT c.id, c.article_path, c.parent_id, c.body_md, c.status, c.created_at, c.updated_at,
             u.id AS user_id, u.username, u.display_name, u.role,
             (SELECT COUNT(*) FROM article_comment_likes l WHERE l.comment_id = c.id) AS like_count,
             EXISTS(SELECT 1 FROM article_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS viewer_liked
      FROM article_comments c
      LEFT JOIN community_users u ON u.id = c.user_id
      WHERE c.article_path = ? AND c.status <> 'hidden'
      ORDER BY c.created_at ASC
    `).all(viewerUserId, articlePath).map(row => ({
      id: row.id, articlePath: row.article_path, parentId: row.parent_id || '',
      body: row.status === 'deleted' ? '' : row.body_md, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at,
      author: row.status === 'deleted' || !row.user_id ? null : {
        id: row.user_id, username: row.username, displayName: row.display_name, role: row.role
      },
      likeCount: Number(row.like_count), viewerLiked: Boolean(row.viewer_liked)
    }))
  }

  createArticleComment({ id, articlePath, userId, parentId = '', body }) {
    if (parentId) {
      const parent = this.database.prepare("SELECT id FROM article_comments WHERE id = ? AND article_path = ? AND status = 'active'").get(parentId, articlePath)
      if (!parent) throw new Error('要回复的评论不存在或已不可用。')
    }
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO article_comments (id, article_path, user_id, parent_id, body_md, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, articlePath, userId, parentId || null, body, now, now)
    this.recordCommunityAudit({ actorType: 'user', actorId: userId, action: parentId ? 'reply_comment' : 'create_comment', targetType: 'comment', targetId: id, detail: articlePath })
    return this.database.prepare('SELECT * FROM article_comments WHERE id = ?').get(id)
  }

  getArticleComment(id) {
    return this.database.prepare('SELECT * FROM article_comments WHERE id = ?').get(id) || null
  }

  setArticleCommentStatus(id, status, { actorType = 'user', actorId = '' } = {}) {
    if (!['active', 'hidden', 'deleted'].includes(status)) throw new Error('评论状态无效。')
    const result = this.database.prepare('UPDATE article_comments SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id)
    if (!result.changes) throw new Error('评论不存在。')
    this.recordCommunityAudit({ actorType, actorId, action: 'set_comment_status', targetType: 'comment', targetId: id, detail: status })
  }

  toggleArticleCommentLike(commentId, userId) {
    const comment = this.database.prepare("SELECT id FROM article_comments WHERE id = ? AND status = 'active'").get(commentId)
    if (!comment) throw new Error('评论不存在或已不可用。')
    const existing = this.database.prepare('SELECT 1 FROM article_comment_likes WHERE comment_id = ? AND user_id = ?').get(commentId, userId)
    if (existing) this.database.prepare('DELETE FROM article_comment_likes WHERE comment_id = ? AND user_id = ?').run(commentId, userId)
    else this.database.prepare('INSERT INTO article_comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)').run(commentId, userId, new Date().toISOString())
    return {
      liked: !existing,
      likeCount: Number(this.database.prepare('SELECT COUNT(*) AS count FROM article_comment_likes WHERE comment_id = ?').get(commentId).count)
    }
  }

  getForumCategories() {
    return this.database.prepare(`
      SELECT c.id, c.name, c.description, c.enabled,
        (SELECT COUNT(*) FROM forum_posts p WHERE p.category_id = c.id AND p.status IN ('active', 'locked')) AS post_count
      FROM forum_categories c WHERE c.enabled = 1 ORDER BY c.sort_order
    `).all().map(row => ({ id: row.id, name: row.name, description: row.description, enabled: Boolean(row.enabled), postCount: Number(row.post_count) }))
  }

  listForumPosts({ categoryId = '', query = '', page = 1, pageSize = 20, viewerUserId = '' } = {}) {
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.max(1, Math.min(Number(pageSize) || 20, 50))
    const term = `%${String(query).trim().slice(0, 100)}%`
    const conditions = ["p.status IN ('active', 'locked')"]
    const params = []
    if (categoryId) { conditions.push('p.category_id = ?'); params.push(categoryId) }
    if (term !== '%%') { conditions.push('(p.title LIKE ? COLLATE NOCASE OR p.body_md LIKE ? COLLATE NOCASE)'); params.push(term, term) }
    const where = conditions.join(' AND ')
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM forum_posts p WHERE ${where}`).get(...params).count)
    const rows = this.database.prepare(`
      SELECT p.id, p.category_id, p.title, p.body_md, p.status, p.view_count, p.created_at, p.last_activity_at,
             p.is_pinned, p.is_featured,
             c.name AS category_name, u.id AS user_id, u.username, u.display_name, u.role,
             (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id AND r.status = 'active') AS reply_count,
             (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS like_count,
             EXISTS(SELECT 1 FROM forum_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS viewer_liked
      FROM forum_posts p
      JOIN forum_categories c ON c.id = p.category_id
      LEFT JOIN community_users u ON u.id = p.user_id
      WHERE ${where}
      ORDER BY p.is_pinned DESC, p.last_activity_at DESC LIMIT ? OFFSET ?
    `).all(viewerUserId, ...params, safePageSize, (safePage - 1) * safePageSize)
    return {
      page: safePage, pageSize: safePageSize, total,
      posts: rows.map(row => ({
        id: row.id, categoryId: row.category_id, categoryName: row.category_name,
        title: row.title, excerpt: row.body_md.slice(0, 220), status: row.status,
        pinned: Boolean(row.is_pinned), featured: Boolean(row.is_featured),
        viewCount: Number(row.view_count), replyCount: Number(row.reply_count), likeCount: Number(row.like_count), viewerLiked: Boolean(row.viewer_liked),
        createdAt: row.created_at, lastActivityAt: row.last_activity_at,
        author: row.user_id ? { id: row.user_id, username: row.username, displayName: row.display_name, role: row.role } : null
      }))
    }
  }

  createForumPost({ id, categoryId, userId, title, body }) {
    if (!this.database.prepare('SELECT id FROM forum_categories WHERE id = ? AND enabled = 1').get(categoryId)) throw new Error('论坛板块不存在或已停用。')
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO forum_posts (id, category_id, user_id, title, body_md, status, created_at, updated_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, categoryId, userId, title, body, now, now, now)
    this.recordCommunityAudit({ actorType: 'user', actorId: userId, action: 'create_post', targetType: 'post', targetId: id, detail: categoryId })
    return id
  }

  getForumPost(postId, viewerUserId = '', { incrementView = false } = {}) {
    if (incrementView) this.database.prepare("UPDATE forum_posts SET view_count = view_count + 1 WHERE id = ? AND status IN ('active', 'locked')").run(postId)
    const row = this.database.prepare(`
      SELECT p.*, c.name AS category_name, u.id AS author_id, u.username, u.display_name, u.role,
             (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id AND r.status = 'active') AS reply_count,
             (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS like_count,
             EXISTS(SELECT 1 FROM forum_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS viewer_liked
      FROM forum_posts p JOIN forum_categories c ON c.id = p.category_id
      LEFT JOIN community_users u ON u.id = p.user_id
      WHERE p.id = ? AND p.status IN ('active', 'locked')
    `).get(viewerUserId, postId)
    if (!row) return null
    return {
      id: row.id, categoryId: row.category_id, categoryName: row.category_name,
      title: row.title, body: row.body_md, status: row.status, viewCount: Number(row.view_count),
      pinned: Boolean(row.is_pinned), featured: Boolean(row.is_featured),
      replyCount: Number(row.reply_count), likeCount: Number(row.like_count), viewerLiked: Boolean(row.viewer_liked),
      createdAt: row.created_at, updatedAt: row.updated_at, lastActivityAt: row.last_activity_at,
      author: row.author_id ? { id: row.author_id, username: row.username, displayName: row.display_name, role: row.role } : null
    }
  }

  listForumReplies(postId, viewerUserId = '') {
    return this.database.prepare(`
      SELECT r.id, r.post_id, r.parent_id, r.body_md, r.status, r.created_at, r.updated_at,
             u.id AS user_id, u.username, u.display_name, u.role,
             (SELECT COUNT(*) FROM forum_reply_likes l WHERE l.reply_id = r.id) AS like_count,
             EXISTS(SELECT 1 FROM forum_reply_likes l WHERE l.reply_id = r.id AND l.user_id = ?) AS viewer_liked
      FROM forum_replies r LEFT JOIN community_users u ON u.id = r.user_id
      WHERE r.post_id = ? AND r.status <> 'hidden' ORDER BY r.created_at ASC
    `).all(viewerUserId, postId).map(row => ({
      id: row.id, postId: row.post_id, parentId: row.parent_id || '', body: row.status === 'deleted' ? '' : row.body_md,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
      author: row.status === 'deleted' || !row.user_id ? null : { id: row.user_id, username: row.username, displayName: row.display_name, role: row.role },
      likeCount: Number(row.like_count), viewerLiked: Boolean(row.viewer_liked)
    }))
  }

  createForumReply({ id, postId, userId, parentId = '', body }) {
    const post = this.database.prepare("SELECT id FROM forum_posts WHERE id = ? AND status = 'active'").get(postId)
    if (!post) throw new Error('帖子不存在、已锁定或已不可用。')
    if (parentId && !this.database.prepare("SELECT id FROM forum_replies WHERE id = ? AND post_id = ? AND status = 'active'").get(parentId, postId)) {
      throw new Error('要回复的内容不存在或已不可用。')
    }
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        INSERT INTO forum_replies (id, post_id, user_id, parent_id, body_md, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(id, postId, userId, parentId || null, body, now, now)
      this.database.prepare('UPDATE forum_posts SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, postId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    this.recordCommunityAudit({ actorType: 'user', actorId: userId, action: 'create_reply', targetType: 'reply', targetId: id, detail: postId })
    return id
  }

  getForumReply(id) {
    return this.database.prepare('SELECT * FROM forum_replies WHERE id = ?').get(id) || null
  }

  getForumPostRecord(id) {
    return this.database.prepare('SELECT * FROM forum_posts WHERE id = ?').get(id) || null
  }

  setForumPostStatus(id, status, { actorType = 'user', actorId = '' } = {}) {
    if (!['active', 'hidden', 'locked', 'deleted'].includes(status)) throw new Error('帖子状态无效。')
    const result = this.database.prepare('UPDATE forum_posts SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
    if (!result.changes) throw new Error('帖子不存在。')
    this.recordCommunityAudit({ actorType, actorId, action: 'set_post_status', targetType: 'post', targetId: id, detail: status })
  }

  setForumPostFlags(id, { pinned, featured }, actor = 'admin') {
    const result = this.database.prepare('UPDATE forum_posts SET is_pinned = ?, is_featured = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? 1 : 0, featured ? 1 : 0, new Date().toISOString(), id)
    if (!result.changes) throw new Error('帖子不存在。')
    this.recordCommunityAudit({ actorType: 'admin', actorId: actor, action: 'set_post_flags', targetType: 'post', targetId: id, detail: JSON.stringify({ pinned: Boolean(pinned), featured: Boolean(featured) }) })
  }

  setForumReplyStatus(id, status, { actorType = 'user', actorId = '' } = {}) {
    if (!['active', 'hidden', 'deleted'].includes(status)) throw new Error('回复状态无效。')
    const result = this.database.prepare('UPDATE forum_replies SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
    if (!result.changes) throw new Error('回复不存在。')
    this.recordCommunityAudit({ actorType, actorId, action: 'set_reply_status', targetType: 'reply', targetId: id, detail: status })
  }

  toggleForumLike(type, targetId, userId) {
    const config = type === 'post'
      ? { source: 'forum_posts', likes: 'forum_post_likes', id: 'post_id', states: "('active', 'locked')" }
      : type === 'reply'
        ? { source: 'forum_replies', likes: 'forum_reply_likes', id: 'reply_id', states: "('active')" }
        : null
    if (!config || !this.database.prepare(`SELECT id FROM ${config.source} WHERE id = ? AND status IN ${config.states}`).get(targetId)) throw new Error('互动目标不存在或已不可用。')
    const existing = this.database.prepare(`SELECT 1 FROM ${config.likes} WHERE ${config.id} = ? AND user_id = ?`).get(targetId, userId)
    if (existing) this.database.prepare(`DELETE FROM ${config.likes} WHERE ${config.id} = ? AND user_id = ?`).run(targetId, userId)
    else this.database.prepare(`INSERT INTO ${config.likes} (${config.id}, user_id, created_at) VALUES (?, ?, ?)`).run(targetId, userId, new Date().toISOString())
    return {
      liked: !existing,
      likeCount: Number(this.database.prepare(`SELECT COUNT(*) AS count FROM ${config.likes} WHERE ${config.id} = ?`).get(targetId).count)
    }
  }

  getCommunityStats() {
    const count = (table, where = '') => Number(this.database.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get().count)
    return {
      users: count('community_users'), activeUsers: count('community_users', "WHERE status = 'active'"),
      suspendedUsers: count('community_users', "WHERE status = 'suspended'"),
      comments: count('article_comments', "WHERE status = 'active'"),
      posts: count('forum_posts', "WHERE status IN ('active', 'locked')"),
      replies: count('forum_replies', "WHERE status = 'active'"),
      hiddenContent: count('article_comments', "WHERE status = 'hidden'") + count('forum_posts', "WHERE status = 'hidden'") + count('forum_replies', "WHERE status = 'hidden'")
    }
  }

  recordProductEvent(eventName, { userId = null, context = '' } = {}) {
    const allowed = new Set(['register_complete', 'email_verified', 'login', 'comment_created', 'forum_post_created', 'forum_reply_created', 'rag_query'])
    if (!allowed.has(eventName)) return
    this.database.prepare('INSERT INTO product_events (user_id, event_name, context, created_at) VALUES (?, ?, ?, ?)')
      .run(userId || null, eventName, String(context).slice(0, 500), new Date().toISOString())
  }

  getProductMetrics(days = 30) {
    const safeDays = Math.max(1, Math.min(Number(days) || 30, 365))
    const since = new Date(Date.now() - safeDays * 86_400_000).toISOString()
    const eventCount = name => Number(this.database.prepare('SELECT COUNT(*) AS count FROM product_events WHERE event_name = ? AND created_at >= ?').get(name, since).count)
    const newUsers = Number(this.database.prepare('SELECT COUNT(*) AS count FROM community_users WHERE created_at >= ?').get(since).count)
    const activeUsers = Number(this.database.prepare('SELECT COUNT(DISTINCT user_id) AS count FROM product_events WHERE user_id IS NOT NULL AND created_at >= ?').get(since).count)
    const activatedUsers = Number(this.database.prepare(`
      SELECT COUNT(DISTINCT user_id) AS count FROM product_events
      WHERE user_id IS NOT NULL AND event_name IN ('comment_created', 'forum_post_created', 'forum_reply_created') AND created_at >= ?
    `).get(since).count)
    const unansweredPosts = Number(this.database.prepare(`
      SELECT COUNT(*) AS count FROM forum_posts p
      WHERE p.status IN ('active', 'locked') AND NOT EXISTS (
        SELECT 1 FROM forum_replies r WHERE r.post_id = p.id AND r.status = 'active'
      )
    `).get().count)
    return {
      days: safeDays,
      newUsers,
      activeUsers,
      activatedUsers,
      activationRate: newUsers ? Math.round((activatedUsers / newUsers) * 1000) / 10 : 0,
      registrations: eventCount('register_complete'),
      logins: eventCount('login'),
      comments: eventCount('comment_created'),
      posts: eventCount('forum_post_created'),
      replies: eventCount('forum_reply_created'),
      ragQueries: eventCount('rag_query'),
      unansweredPosts
    }
  }

  getModerationItems(limit = 100) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 300))
    const comments = this.database.prepare(`
      SELECT c.id, 'comment' AS type, c.body_md AS content, c.status, c.created_at, c.article_path AS context,
             u.username, u.display_name FROM article_comments c LEFT JOIN community_users u ON u.id = c.user_id
      ORDER BY c.created_at DESC LIMIT ?
    `).all(safeLimit)
    const posts = this.database.prepare(`
      SELECT p.id, 'post' AS type, p.title || char(10) || p.body_md AS content, p.status, p.created_at, p.category_id AS context,
             p.is_pinned, p.is_featured, u.username, u.display_name FROM forum_posts p LEFT JOIN community_users u ON u.id = p.user_id
      ORDER BY p.created_at DESC LIMIT ?
    `).all(safeLimit)
    const replies = this.database.prepare(`
      SELECT r.id, 'reply' AS type, r.body_md AS content, r.status, r.created_at, r.post_id AS context,
             u.username, u.display_name FROM forum_replies r LEFT JOIN community_users u ON u.id = r.user_id
      ORDER BY r.created_at DESC LIMIT ?
    `).all(safeLimit)
    return [...comments, ...posts, ...replies]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, safeLimit)
      .map(row => ({ id: row.id, type: row.type, content: row.content.slice(0, 500), status: row.status, createdAt: row.created_at,
        context: row.context, author: row.display_name || row.username || (row.type === 'post' ? '站点发起' : '已注销用户'),
        pinned: Boolean(row.is_pinned), featured: Boolean(row.is_featured) }))
  }

  recordCommunityAudit({ actorType, actorId = '', action, targetType, targetId = '', detail = '' }) {
    this.database.prepare(`
      INSERT INTO community_audit (actor_type, actor_id, action, target_type, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(actorType, String(actorId).slice(0, 100), String(action).slice(0, 100), String(targetType).slice(0, 100), String(targetId).slice(0, 100), String(detail).slice(0, 1000), new Date().toISOString())
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
