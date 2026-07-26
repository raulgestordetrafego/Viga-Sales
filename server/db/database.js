import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../db/crm.sqlite');

let dbInstance = null;

class DatabaseWrapper {
  constructor() {
    this.init();
  }

  init() {
    this.isPostgres = !!DATABASE_URL;
    if (this.isPostgres) {
      try {
        this.pool = new Pool({
          connectionString: DATABASE_URL,
      connectionTimeoutMillis: 5000 // 5 seconds timeout
        });
        console.log('Using PostgreSQL database');
      } catch (err) {
        console.error('Failed to initialize Postgres Pool:', err.message);
        this.fallbackToSqlite();
      }
    } else {
      this.initSqlite();
    }
  }

  initSqlite() {
    try {
      // Ensure directory exists
      const dir = path.dirname(path.resolve(DB_PATH));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.sqlite = new Database(path.resolve(DB_PATH));
      this.sqlite.pragma('journal_mode = WAL');
      this.sqlite.pragma('foreign_keys = ON');
      console.log('Using SQLite database at:', path.resolve(DB_PATH));
      this.isPostgres = false;
    } catch (err) {
      console.error('Failed to initialize SQLite:', err.message);
      throw err;
    }
  }

  fallbackToSqlite() {
    console.warn('FALLING BACK TO SQLITE DUE TO POSTGRES ERROR');
    this.isPostgres = false;
    this.initSqlite();
  }

  translateSql(sql) {
    if (this.isPostgres) {
      // Convert SQLite ? to Postgres $1, $2...
      // We use a more careful approach to avoid replacing ? inside strings
      let i = 1;
      let inString = false;
      let result = '';
      for (let j = 0; j < sql.length; j++) {
        const char = sql[j];
        if (char === "'") inString = !inString;
        if (char === '?' && !inString) {
          result += `$${i++}`;
        } else {
          result += char;
        }
      }
      // Convert SQLite datetime() to Postgres equivalents
      result = result.replace(/datetime\('now'(,\s*'([+-]\d+)\s+(\w+)')?\)/g, (match, fullExpr, amount, unit) => {
        if (!fullExpr) return 'NOW()';
        const sign = amount.startsWith('-') ? '-' : '+';
        const val = amount.replace(/[+-]/, '');
        return `NOW() ${sign} INTERVAL '${val} ${unit}'`;
      });
      // datetime(column) -> column::timestamp (for comparison in WHERE)
      result = result.replace(/datetime\((\w+)\)/g, '$1::timestamp');
      // date(column) -> column::date (for comparison in WHERE)
      result = result.replace(/date\(([\w.]+)\)/g, '$1::date');
      return result;
    } else {
      // Convert Postgres syntax → SQLite
      let result = sql;

      // 1. $N parameter placeholders → ?
      let j = 0;
      let inStr = false;
      let out = '';
      for (let k = 0; k < result.length; k++) {
        const ch = result[k];
        if (ch === "'") inStr = !inStr;
        if (ch === '$' && !inStr && /\d/.test(result[k + 1] || '')) {
          out += '?';
          k++; // skip digit
          while (k + 1 < result.length && /\d/.test(result[k + 1])) k++; // skip more digits
        } else {
          out += ch;
        }
      }
      result = out;

      // 2. column::date → date(column)
      result = result.replace(/([\w.]+)::date/gi, 'date($1)');

      // 3. Remove remaining Postgres type casts: ::int, ::text, ::timestamp, ::bigint, etc.
      result = result.replace(/::\w+(\s*\[\])?/g, '');

      // 4. CURRENT_DATE ± INTERVAL 'N unit' → date('now', '±N unit')
      result = result.replace(/CURRENT_DATE\s*-\s*INTERVAL\s*'(\d+)\s*(\w+)'/gi,
        "date('now', '-$1 $2')");
      result = result.replace(/CURRENT_DATE\s*\+\s*INTERVAL\s*'(\d+)\s*(\w+)'/gi,
        "date('now', '+$1 $2')");

      // 5. CURRENT_DATE → date('now')
      result = result.replace(/CURRENT_DATE/gi, "date('now')");

      // 6. NOW() ± INTERVAL 'N unit' → datetime('now', '±N unit')
      result = result.replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*(\w+)'/gi,
        "datetime('now', '-$1 $2')");
      result = result.replace(/NOW\(\)\s*\+\s*INTERVAL\s*'(\d+)\s*(\w+)'/gi,
        "datetime('now', '+$1 $2')");

      // 7. NOW() → datetime('now')
      result = result.replace(/NOW\(\)/gi, "datetime('now')");

      // 8. ILIKE → LIKE (SQLite LIKE is case-insensitive for ASCII)
      result = result.replace(/ILIKE/gi, 'LIKE');

      return result;
    }
  }

  async query(sql, params = []) {
    const translatedSql = this.translateSql(sql);
    try {
      if (this.isPostgres) {
        if (!this.pool) throw new Error('Postgres pool not initialized');
        const res = await this.pool.query(translatedSql, params);
        return res.rows;
      } else {
        if (!this.sqlite) throw new Error('SQLite database not initialized');
        return this.sqlite.prepare(translatedSql).all(...params);
      }
    } catch (err) {
      console.error(`Query Error [${translatedSql}]:`, err.message);
      throw err;
    }
  }

  async get(sql, params = []) {
    const translatedSql = this.translateSql(sql);
    try {
      if (this.isPostgres) {
        if (!this.pool) throw new Error('Postgres pool not initialized');
        const res = await this.pool.query(translatedSql, params);
        return res.rows[0];
      } else {
        if (!this.sqlite) throw new Error('SQLite database not initialized');
        return this.sqlite.prepare(translatedSql).get(...params);
      }
    } catch (err) {
      console.error(`Get Error [${translatedSql}]:`, err.message);
      throw err;
    }
  }

  async run(sql, params = []) {
    const translatedSql = this.translateSql(sql);
    try {
      if (this.isPostgres) {
        if (!this.pool) throw new Error('Postgres pool not initialized');
        const res = await this.pool.query(translatedSql, params);
        return { lastInsertRowid: null, changes: res.rowCount };
      } else {
        if (!this.sqlite) throw new Error('SQLite database not initialized');
        const info = this.sqlite.prepare(translatedSql).run(...params);
        return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
      }
    } catch (err) {
      console.error(`Run Error [${translatedSql}]:`, err.message);
      throw err;
    }
  }

  // Reserva atômica: SELECT + UPDATE em transação única — impossível duplicar
  async atomicReserve(campaignId, limit) {
    if (this.isPostgres) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
           `SELECT * FROM prospects
           WHERE status = 'novo'
             ${campaignId ? "AND campaign_id = $2" : ""}
             AND NOT EXISTS (
               SELECT 1 FROM prospecting_logs
               WHERE prospect_id = prospects.id AND action IN ('enviado', 'enviado_meta')
                 AND date(created_at) = CURRENT_DATE
             )
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          campaignId ? [limit, campaignId] : [limit]
        );
        if (result.rows.length > 0) {
          const ids = result.rows.map(r => `'${r.id}'`).join(',');
          await client.query(
            `UPDATE prospects SET status = 'reservado', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ids})`
          );
        }
        await client.query('COMMIT');
        return result.rows;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // SQLite: transação síncrona — atomicidade garantida
      const db = this.sqlite;
      const reserve = db.transaction((campaignId, limit) => {
         const rows = db.prepare(
          `SELECT * FROM prospects
           WHERE status = 'novo'
             ${campaignId ? "AND campaign_id = ?" : ""}
             AND NOT EXISTS (
               SELECT 1 FROM prospecting_logs
               WHERE prospect_id = prospects.id AND action IN ('enviado', 'enviado_meta')
                 AND date(created_at) = date('now')
             )
           ORDER BY created_at ASC
           LIMIT ?`
        ).all(...(campaignId ? [campaignId, limit] : [limit]));

        if (rows.length > 0) {
          const ph = rows.map(() => '?').join(', ');
          db.prepare(
            `UPDATE prospects SET status = 'reservado', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`
          ).run(...rows.map(r => r.id));
        }
        return rows;
      });
      return reserve(campaignId || null, limit);
    }
  }

  async exec(sql) {
    if (this.isPostgres) {
      if (!this.pool) throw new Error('Postgres pool not initialized');
      // Basic translation for schema initialization
      let pgSql = sql
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
        .replace(/DATETIME\('NOW'\)/gi, 'CURRENT_TIMESTAMP')
        .replace(/INSERT OR IGNORE/gi, 'INSERT') // Postgres needs ON CONFLICT for this, but for simple seeds it might be okay or handled separately
        .replace(/TEXT UNIQUE NOT NULL/gi, 'TEXT UNIQUE NOT NULL')
        .replace(/REAL/gi, 'DECIMAL');
      
      await this.pool.query(pgSql);
    } else {
      this.sqlite.exec(sql);
    }
  }
}

export async function initDb() {
  console.log('Initializing database...');
  if (!dbInstance) {
    console.log('Creating DatabaseWrapper...');
    const instance = new DatabaseWrapper();
    
    // Test connection
    try {
      if (instance.isPostgres) {
        console.log('Testing Postgres connection...');
        try {
          await instance.pool.query('SELECT 1');
          console.log('PostgreSQL connection successful');
        } catch (err) {
          console.error('PostgreSQL connection failed:', err.message);
          instance.fallbackToSqlite();
        }
      } else {
        console.log('Testing SQLite connection...');
        instance.sqlite.prepare('SELECT 1').get();
        console.log('SQLite connection successful');
      }
    } catch (err) {
      console.error('DATABASE CONNECTION ERROR:', err.message);
      throw new Error(`Falha ao conectar ao banco de dados: ${err.message}`);
    }

    console.log('Initializing schema...');
    dbInstance = instance; // Assign to global only after basic checks
    await initializeSchema();
    console.log('Schema initialized successfully');
  }
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export async function query(sql, params = []) {
  return getDb().query(sql, params);
}

export async function queryOne(sql, params = []) {
  return getDb().get(sql, params);
}

export async function run(sql, params = []) {
  return getDb().run(sql, params);
}

async function hashPwd(pwd) {
  const bcrypt = await import('bcrypt');
  return bcrypt.default.hash(pwd, 12);
}

export { hashPwd };

async function initializeSchema() {
  const db = dbInstance;
  
  // Create tables one by one for better compatibility
  const tables = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      plan TEXT DEFAULT 'starter',
      max_users INTEGER DEFAULT 3,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      company TEXT,
      tags TEXT DEFAULT '[]',
      notes TEXT,
      avatar TEXT,
      status TEXT DEFAULT 'active',
      pipeline_stage TEXT DEFAULT 'stage_lead',
      pipeline_value DECIMAL DEFAULT 0,
      assigned_to TEXT,
      last_interaction TEXT,
      tenant_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      whatsapp_chat_id TEXT UNIQUE,
      status TEXT DEFAULT 'open',
      unread_count INTEGER DEFAULT 0,
      last_message TEXT,
      last_message_at TEXT,
      assigned_to TEXT,
      tenant_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      whatsapp_message_id TEXT UNIQUE,
      direction TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      content TEXT,
      media_url TEXT,
      media_type TEXT,
      status TEXT DEFAULT 'sent',
      timestamp TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS funnels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      position INTEGER NOT NULL,
      funnel_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT,
      target_tags TEXT DEFAULT '[]',
      target_contacts TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      scheduled_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS broadcast_logs (
      id TEXT PRIMARY KEY,
      broadcast_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      error TEXT,
      sent_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      completed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS raw_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      user_id TEXT,
      ip TEXT,
      meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prospecting_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      segment TEXT,
      city TEXT,
      status TEXT DEFAULT 'active',
      daily_limit INTEGER DEFAULT 40,
      message_template TEXT,
      use_ai INTEGER DEFAULT 1,
      sent_today INTEGER DEFAULT 0,
      last_reset_date TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      company TEXT,
      segment TEXT,
      city TEXT,
      address TEXT,
      website TEXT,
      instagram TEXT,
      rating DECIMAL,
      reviews_count INTEGER,
      source TEXT DEFAULT 'manual',
      raw_data TEXT,
      status TEXT DEFAULT 'novo',
      ai_message TEXT,
      campaign_id TEXT,
      sent_at TEXT,
      follow_up_at TEXT,
      responded_at TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prospecting_logs (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL,
      campaign_id TEXT,
      action TEXT NOT NULL,
      message TEXT,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS meta_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      vars TEXT NOT NULL DEFAULT '[]',
      body TEXT NOT NULL,
      segment TEXT DEFAULT 'geral',
      max_sends INTEGER DEFAULT 50,
      sent_count INTEGER DEFAULT 0,
      paused INTEGER DEFAULT 0,
      media_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS meta_template_logs (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      prospect_id TEXT,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS community_logs (
      id TEXT PRIMARY KEY,
      content_type TEXT DEFAULT 'text',
      body TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT,
      body TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      tags TEXT DEFAULT '[]',
      faq JSONB DEFAULT '[]',
      cover_image TEXT,
      status TEXT DEFAULT 'draft',
      published_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS whatsapp_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instance_name TEXT NOT NULL,
      api_url TEXT,
      api_key TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_instance_permissions (
      user_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      PRIMARY KEY (user_id, instance_id)
    )`,
    `CREATE TABLE IF NOT EXISTS custom_fields (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      field_key TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'text',
      options TEXT,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS contact_custom_values (
      contact_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (contact_id, field_id)
    )`,
    `CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT,
      recipient_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_recipients (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      company TEXT,
      extra_data TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template_id TEXT,
      list_id TEXT,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      sender_name TEXT DEFAULT 'Viga Sales',
      sender_email TEXT DEFAULT 'contato@vigasales.com.br',
      reply_to TEXT,
      status TEXT DEFAULT 'draft',
      daily_limit INTEGER DEFAULT 50,
      time_start TEXT DEFAULT '08:00',
      time_end TEXT DEFAULT '18:00',
      days_of_week TEXT DEFAULT '[1,2,3,4,5]',
      min_delay_sec INTEGER DEFAULT 30,
      max_delay_sec INTEGER DEFAULT 120,
      use_ai_variation INTEGER DEFAULT 0,
      ai_variation_prompt TEXT,
      sent_count INTEGER DEFAULT 0,
      bounced_count INTEGER DEFAULT 0,
      opened_count INTEGER DEFAULT 0,
      clicked_count INTEGER DEFAULT 0,
      total_recipients INTEGER DEFAULT 0,
      last_sent_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_send_logs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      smtp_message_id TEXT,
      status TEXT DEFAULT 'pending',
      subject_sent TEXT,
      body_sent TEXT,
      error TEXT,
      sent_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      replied_at TEXT,
      bounced_at TEXT,
      complained_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS chief_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'geral',
      priority TEXT DEFAULT 'media',
      status TEXT DEFAULT 'pendente',
      week_start DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS boss_memory (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS chief_briefings (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'daily',
      panorama TEXT,
      alerta TEXT,
      estrategia TEXT,
      acao_principal TEXT,
      coaching TEXT,
      financeiro TEXT,
      score INTEGER,
      tarefas JSONB DEFAULT '[]',
      intel JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS chief_okrs (
      id TEXT PRIMARY KEY,
      objetivo TEXT NOT NULL,
      key_result TEXT NOT NULL,
      meta_numerica TEXT,
      progresso_atual TEXT,
      semana_referencia DATE NOT NULL,
      status TEXT DEFAULT 'ativo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      email TEXT,
      success INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip)`,
    `CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_chief_briefings_type ON chief_briefings(type)`,
    `CREATE INDEX IF NOT EXISTS idx_chief_briefings_created ON chief_briefings(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_chief_okrs_semana ON chief_okrs(semana_referencia)`,
    `CREATE INDEX IF NOT EXISTS idx_chief_okrs_status ON chief_okrs(status)`,

  ];

  for (const table of tables) {
    try {
      await db.exec(table);
    } catch (err) {
      console.error('Error creating table:', err.message);
    }
  }

  // Migrações incrementais
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN notes TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN audio_batch_sent INTEGER DEFAULT 0`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN cnpj TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN trade_name TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN phone2 TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN state TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN neighborhood TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN zip_code TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN company_size TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN capital_social TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN legal_nature TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN opening_date TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN cnpj_status TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE prospects ADD COLUMN main_activity_code TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE pipeline_stages ADD COLUMN funnel_id TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE conversations ADD COLUMN instance_id TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}'`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_convs_instance ON conversations(instance_id)`); } catch {}

  // Índices de performance
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_convs_contact ON conversations(contact_id)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_convs_status ON conversations(status)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(pipeline_stage)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_email_recipients_list ON email_recipients(list_id)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON email_send_logs(campaign_id)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_send_logs(recipient_id)`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_send_logs(status)`); } catch {}
  // Migrações email
  try { await db.exec(`ALTER TABLE email_campaigns ADD COLUMN sent_today INTEGER DEFAULT 0`); } catch {}
  try { await db.exec(`ALTER TABLE email_campaigns ADD COLUMN send_count_reset_date TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE email_campaigns ADD COLUMN replied_count INTEGER DEFAULT 0`); } catch {}
  try { await db.exec(`ALTER TABLE email_send_logs ADD COLUMN smtp_message_id TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE email_send_logs ADD COLUMN replied_at TEXT`); } catch {}
  // Meta WhatsApp delivery tracking
  try { await db.exec(`ALTER TABLE meta_template_logs ADD COLUMN wamid TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE meta_template_logs ADD COLUMN delivered_at TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE meta_template_logs ADD COLUMN read_at TEXT`); } catch {}
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_meta_logs_wamid ON meta_template_logs(wamid)`); } catch {}
  // Corrigir campaign_id dos prospects importados antes da criação da campanha
  try {
    await db.run(
      `UPDATE prospects SET campaign_id = '5f31cd5b-e90f-4dd9-b956-79e0edd40b07' WHERE campaign_id = '3d3d099e-f232-4b22-b93f-5282c5fd95f5'`
    );
  } catch {}

  // Seed instância padrão do WhatsApp
  try {
    const existing = await db.get('SELECT id FROM whatsapp_instances WHERE id = ?', ['instance_default']);
    if (!existing) {
      await db.run(
        `INSERT INTO whatsapp_instances (id, name, instance_name, api_url, api_key, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
        ['instance_default', 'Principal', process.env.EVOLUTION_INSTANCE || 'Raul', process.env.EVOLUTION_API_URL || '', process.env.EVOLUTION_API_KEY || '']
      );
    }
    // Atribui instância padrão a conversas que ainda não têm
    await db.run(`UPDATE conversations SET instance_id = 'instance_default' WHERE instance_id IS NULL`);
  } catch {}

  // Seed funnels
  const funnels = [
    ['funnel_default',  'Funil Padrão',   1],
    ['funnel_outbound', 'Funil Outbound',  2],
  ];
  for (const [id, name, pos] of funnels) {
    try {
      if (db.isPostgres) {
        await db.run(`INSERT INTO funnels (id, name, position) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING`, [id, name, pos]);
      } else {
        await db.run(`INSERT OR IGNORE INTO funnels (id, name, position) VALUES (?, ?, ?)`, [id, name, pos]);
      }
    } catch {}
  }

  // Seed default stages (Funil Padrão)
  const stages = [
    ['stage_lead',       'Lead',          '#64748b', 1, 'funnel_default'],
    ['stage_contact',    'Contato Feito', '#3b82f6', 2, 'funnel_default'],
    ['stage_proposal',   'Proposta',      '#f59e0b', 3, 'funnel_default'],
    ['stage_negotiation','Negociação',    '#8b5cf6', 4, 'funnel_default'],
    ['stage_won',        'Ganho',         '#22c55e', 5, 'funnel_default'],
    ['stage_lost',       'Perdido',       '#ef4444', 6, 'funnel_default'],
  ];

  for (const [id, name, color, pos, fid] of stages) {
    try {
      if (db.isPostgres) {
        await db.run(`INSERT INTO pipeline_stages (id, name, color, position, funnel_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [id, name, color, pos, fid]);
      } else {
        await db.run(`INSERT OR IGNORE INTO pipeline_stages (id, name, color, position, funnel_id) VALUES (?, ?, ?, ?, ?)`, [id, name, color, pos, fid]);
      }
      // Ensure existing stages get their funnel_id set
      await db.run(`UPDATE pipeline_stages SET funnel_id = ? WHERE id = ? AND (funnel_id IS NULL OR funnel_id = '')`, [fid, id]);
    } catch {}
  }

  // Seed Funil Outbound stages
  const outboundStages = [
    ['stage_ob_entrada',    'Entrada de Prospects', '#64748b', 1],
    ['stage_ob_tentando',   'Tentando Contato',     '#3b82f6', 2],
    ['stage_ob_contato',    'Contato Realizado',    '#2E6DA4', 3],
    ['stage_ob_reuniao_ag', 'Reunião Agendada',     '#8b5cf6', 4],
    ['stage_ob_reuniao_re', 'Reunião Realizada',    '#6366f1', 5],
    ['stage_ob_proposta',   'Proposta Agendada',    '#f59e0b', 6],
    ['stage_ob_negociacao', 'Negociação',           '#E67E22', 7],
    ['stage_ob_contrato',   'Contrato',             '#14b8a6', 8],
    ['stage_ob_venda',      'Venda',                '#22c55e', 9],
  ];

  for (const [id, name, color, pos] of outboundStages) {
    try {
      if (db.isPostgres) {
        await db.run(`INSERT INTO pipeline_stages (id, name, color, position, funnel_id) VALUES (?, ?, ?, ?, 'funnel_outbound') ON CONFLICT (id) DO NOTHING`, [id, name, color, pos]);
      } else {
        await db.run(`INSERT OR IGNORE INTO pipeline_stages (id, name, color, position, funnel_id) VALUES (?, ?, ?, ?, 'funnel_outbound')`, [id, name, color, pos]);
      }
    } catch {}
  }

  // Seed master admin
  try {
    const masterEmail = process.env.CRM_MASTER_EMAIL || 'raulgestor@gmail';
    const masterPass  = process.env.CRM_MASTER_PASSWORD || '12345678';
    const masterHash  = await hashPwd(masterPass);
    const existing    = await db.get('SELECT id FROM users WHERE email = ?', [masterEmail]);
    if (!existing) {
      const { v4: uuidv4 } = await import('uuid');
      await db.run(
        `INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'master', 'active')`,
        [uuidv4(), 'Raul Santos', masterEmail, masterHash]
      );
      console.log('[Auth] Master admin criado:', masterEmail);
    }
  } catch (err) {
    console.error('[Auth] Erro ao criar master admin:', err.message);
  }

}
