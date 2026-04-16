/**
 * AB Capital CRM — banco de dados SQLite
 * Apenas tabelas ab_capital_*
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Por padrão usa o mesmo volume que o viga-sales (viga-sales-db montado em /app/db)
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'db', 'crm.sqlite');

let db = null;

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export async function initDb() {
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(path.resolve(DB_PATH));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('[DB] SQLite em:', path.resolve(DB_PATH));

  await initializeSchema();
  return db;
}

export async function query(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

export async function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

export async function run(sql, params = []) {
  const info = getDb().prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

async function hashPwd(pwd) {
  const bcrypt = await import('bcrypt');
  return bcrypt.default.hash(pwd, 12);
}

async function initializeSchema() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS ab_capital_clientes (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      cpf_cnpj TEXT,
      address TEXT,
      photo_path TEXT,
      attachment_path TEXT,
      responsible TEXT,
      traffic_source TEXT,
      general_info TEXT,
      notes TEXT,
      source TEXT DEFAULT 'conversao',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ab_capital_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ab_capital_leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      objective TEXT,
      source TEXT DEFAULT 'landing',
      pipeline_stage TEXT DEFAULT 'novo',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ab_capital_prospects (
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
    `CREATE TABLE IF NOT EXISTS ab_capital_campaigns (
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
    `CREATE TABLE IF NOT EXISTS ab_capital_prospecting_logs (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL,
      campaign_id TEXT,
      action TEXT NOT NULL,
      message TEXT,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ab_capital_contratos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      admin_company TEXT,
      grupo TEXT,
      cota TEXT,
      contrato TEXT,
      credit_value REAL,
      commission_pct REAL DEFAULT 4,
      installments INTEGER,
      installment_value REAL,
      parcelas_pagas INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ativo',
      status_atraso INTEGER DEFAULT 0,
      status_cancelamento INTEGER DEFAULT 0,
      data_adesao TEXT,
      comissao_valor REAL,
      comissao_recebida REAL DEFAULT 0,
      comissao_status TEXT DEFAULT 'pendente',
      empresa TEXT DEFAULT 'AB',
      nf_emitida INTEGER DEFAULT 0,
      data_boleto TEXT,
      data_lance TEXT,
      parceria_pct REAL,
      parceria_obs TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ab_capital_followups (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      cliente_name TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      note TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of tables) {
    try { db.exec(sql); } catch (err) { console.error('[DB] Erro ao criar tabela:', err.message); }
  }

  // ── Migrações incrementais (idempotentes) ────────────────────────────────────
  const migrations = [
    `ALTER TABLE ab_capital_clientes ADD COLUMN cpf_cnpj TEXT`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN data_adesao TEXT`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN comissao_status TEXT DEFAULT 'pendente'`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN empresa TEXT DEFAULT 'AB'`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN nf_emitida INTEGER DEFAULT 0`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN data_boleto TEXT`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN data_lance TEXT`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN parceria_pct REAL`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN parceria_obs TEXT`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN comissao_valor REAL`,
    `ALTER TABLE ab_capital_clientes ADD COLUMN comissao_recebida REAL DEFAULT 0`,
    `ALTER TABLE ab_capital_leads ADD COLUMN address TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN consortium_name TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN installments INTEGER`,
    `ALTER TABLE ab_capital_leads ADD COLUMN installment_value REAL`,
    `ALTER TABLE ab_capital_leads ADD COLUMN admin_profit_pct REAL`,
    `ALTER TABLE ab_capital_leads ADD COLUMN admin_company TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN attachment_path TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN photo_path TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN general_info TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN traffic_source TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN responsible TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN credit_value REAL`,
    `ALTER TABLE ab_capital_leads ADD COLUMN grupo TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN cota TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN contrato TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN status_atraso INTEGER DEFAULT 0`,
    `ALTER TABLE ab_capital_leads ADD COLUMN status_cancelamento INTEGER DEFAULT 0`,
    `ALTER TABLE ab_capital_leads ADD COLUMN parcelas_pagas INTEGER DEFAULT 0`,
    `ALTER TABLE ab_capital_leads ADD COLUMN commission_pct REAL`,
    `ALTER TABLE ab_capital_leads ADD COLUMN converted_to_client_id TEXT`,
    `ALTER TABLE ab_capital_leads ADD COLUMN won_at TEXT`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch {} // ignora "duplicate column" — é esperado
  }

  // ── Migração: clientes → contratos (idempotente) ──────────────────────────────
  try {
    const contratoCount = db.prepare('SELECT COUNT(*) as cnt FROM ab_capital_contratos').get();
    const clienteCount  = db.prepare('SELECT COUNT(*) as cnt FROM ab_capital_clientes').get();
    if (contratoCount.cnt === 0 && clienteCount.cnt > 0) {
      const cols = db.prepare('PRAGMA table_info(ab_capital_clientes)').all().map(c => c.name);
      if (cols.includes('admin_company') || cols.includes('credit_value')) {
        const { v4: uuidv4 } = await import('uuid');
        const oldRows = db.prepare('SELECT * FROM ab_capital_clientes').all();
        const byPhone = {};
        for (const row of oldRows) {
          const key = (row.phone || '').trim() || (row.name || '').trim();
          if (!byPhone[key]) byPhone[key] = [];
          byPhone[key].push(row);
        }
        for (const rows of Object.values(byPhone)) {
          const primary = rows[0];
          for (const row of rows) {
            db.prepare(
              `INSERT OR IGNORE INTO ab_capital_contratos
                (id, cliente_id, admin_company, grupo, cota, contrato, credit_value,
                 commission_pct, installments, installment_value, parcelas_pagas,
                 status, status_atraso, status_cancelamento, data_adesao,
                 comissao_valor, comissao_recebida, comissao_status, empresa,
                 nf_emitida, data_boleto, data_lance, parceria_pct, parceria_obs, notes,
                 created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).run(
              uuidv4(), primary.id,
              row.admin_company || null, row.grupo || null, row.cota || null, row.contrato || null,
              row.credit_value || null, row.commission_pct || 4, row.installments || null,
              row.installment_value || null, row.parcelas_pagas || 0,
              row.status || 'ativo', row.status_atraso || 0, row.status_cancelamento || 0,
              row.data_adesao || null, row.comissao_valor || null, row.comissao_recebida || 0,
              row.comissao_status || 'pendente', row.empresa || 'AB', row.nf_emitida || 0,
              row.data_boleto || null, row.data_lance || null, row.parceria_pct || null,
              row.parceria_obs || null, row.notes || null, row.created_at, row.updated_at
            );
          }
          for (let i = 1; i < rows.length; i++) {
            db.prepare('DELETE FROM ab_capital_clientes WHERE id = ?').run(rows[i].id);
          }
        }
        console.log('[DB] Migração clientes→contratos concluída');
      }
    }
  } catch (err) {
    console.error('[DB] Erro na migração contratos:', err.message);
  }

  // ── Seeds de usuários AB Capital ──────────────────────────────────────────────
  const abUsers = [
    { name: 'Master', email: 'raulfs.sc@gmail.com', password: 'Ab@2026*', role: 'master' },
    { name: 'adm',    email: 'contato@abcapital.com.br', password: '12345678', role: 'admin' },
  ];
  for (const u of abUsers) {
    try {
      const exists = db.prepare('SELECT id FROM ab_capital_users WHERE email = ?').get(u.email);
      if (!exists) {
        const { v4: uuidv4 } = await import('uuid');
        const hash = await hashPwd(u.password);
        db.prepare(
          `INSERT INTO ab_capital_users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')`
        ).run(uuidv4(), u.name, u.email, hash, u.role);
        console.log('[DB] Usuário AB Capital criado:', u.email);
      }
    } catch (err) {
      console.error('[DB] Erro ao criar usuário AB Capital:', err.message);
    }
  }

  // ── Seed lead fictício ────────────────────────────────────────────────────────
  try {
    const demoExists = db.prepare("SELECT id FROM ab_capital_leads WHERE phone = '11987654321'").get();
    if (!demoExists) {
      const { v4: uuidv4 } = await import('uuid');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO ab_capital_leads
          (id, name, phone, email, address, consortium_name, installments, installment_value,
           admin_profit_pct, admin_company, general_info, traffic_source, responsible,
           pipeline_stage, source, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'qualificacao', 'manual', ?, ?, ?)`
      ).run(
        uuidv4(), 'Carlos Eduardo Mendes', '11987654321', 'carlos.mendes@email.com',
        'Rua das Flores, 123 - São Paulo/SP',
        'Consórcio Imóvel 280k', 120, 1850.00, 18.5, 'Administradora XYZ',
        'Cliente interessado em quitar imóvel. Já possui entrada de 30%. Muito receptivo.',
        'Instagram', 'Master',
        'Enviado proposta inicial. Aguardando retorno.', now, now
      );
      console.log('[DB] Lead fictício criado');
    }
  } catch (err) {
    console.error('[DB] Erro ao criar lead fictício:', err.message);
  }
}
