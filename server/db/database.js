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
          ssl: { rejectUnauthorized: false },
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
      return result;
    } else {
      // Convert Postgres ILIKE to SQLite LIKE (SQLite LIKE is case-insensitive by default)
      return sql.replace(/ILIKE/gi, 'LIKE');
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
    `CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      position INTEGER NOT NULL,
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
    )`
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

  // Seed default stages
  const stages = [
    ['stage_lead',       'Lead',          '#64748b', 1],
    ['stage_contact',    'Contato Feito', '#3b82f6', 2],
    ['stage_proposal',   'Proposta',      '#f59e0b', 3],
    ['stage_negotiation','Negociação',    '#8b5cf6', 4],
    ['stage_won',        'Ganho',         '#22c55e', 5],
    ['stage_lost',       'Perdido',       '#ef4444', 6]
  ];

  for (const [id, name, color, pos] of stages) {
    try {
      if (db.isPostgres) {
        await db.run(`INSERT INTO pipeline_stages (id, name, color, position) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [id, name, color, pos]);
      } else {
        await db.run(`INSERT OR IGNORE INTO pipeline_stages (id, name, color, position) VALUES (?, ?, ?, ?)`, [id, name, color, pos]);
      }
    } catch (err) {
      // Ignore errors during seeding
    }
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
