/**
 * Viga Sales Financeiro — Banco de Dados SQLite
 * Tabelas: vs_* (controle financeiro interno)
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'db', 'financeiro.sqlite');

let db = null;

export function getDb() {
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

export async function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = await fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

async function hashPwd(pwd) {
  const bcrypt = await import('bcrypt');
  return bcrypt.default.hash(pwd, 12);
}

async function initializeSchema() {
  // ── Usuários do sistema ──────────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Clientes / consorciados ──────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_clientes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    telefone TEXT,
    email TEXT,
    cpf_cnpj TEXT,
    responsavel TEXT,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Contratos ────────────────────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_contratos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL REFERENCES vs_clientes(id),
    administradora TEXT,
    grupo TEXT,
    cota TEXT,
    numero_contrato TEXT,
    valor_credito REAL DEFAULT 0,
    percentual_comissao REAL DEFAULT 4,
    total_parcelas INTEGER DEFAULT 0,
    parcelas_pagas INTEGER DEFAULT 0,
    valor_parcela REAL DEFAULT 0,
    status TEXT DEFAULT 'ativo',
    em_atraso INTEGER DEFAULT 0,
    cancelado INTEGER DEFAULT 0,
    data_adesao TEXT,
    comissao_total REAL,
    comissao_recebida REAL DEFAULT 0,
    status_comissao TEXT DEFAULT 'pendente',
    empresa TEXT DEFAULT 'VS',
    nf_emitida INTEGER DEFAULT 0,
    data_boleto TEXT,
    data_lance TEXT,
    parceria_pct REAL,
    parceria_obs TEXT,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Custos / despesas operacionais ──────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_custos (
    id TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    categoria TEXT,
    valor REAL NOT NULL,
    data TEXT NOT NULL,
    notas TEXT,
    tipo TEXT DEFAULT 'variavel',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Extratos bancários analisados por IA ─────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_extratos (
    id TEXT PRIMARY KEY,
    nome_arquivo TEXT,
    data_analise TEXT DEFAULT (datetime('now')),
    periodo_inicio TEXT,
    periodo_fim TEXT,
    banco TEXT,
    conta TEXT,
    saldo_inicial REAL,
    saldo_final REAL,
    total_entradas REAL DEFAULT 0,
    total_saidas REAL DEFAULT 0,
    resumo_ia TEXT,
    raw_json TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Transações extraídas dos extratos ───────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_transacoes (
    id TEXT PRIMARY KEY,
    extrato_id TEXT REFERENCES vs_extratos(id),
    data TEXT,
    descricao TEXT,
    valor REAL,
    tipo TEXT,
    categoria TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Recebimentos de contratos ──────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS vs_recebimentos (
    id TEXT PRIMARY KEY,
    contrato_id TEXT REFERENCES vs_contratos(id),
    valor REAL NOT NULL,
    data_pagamento TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── Migrações incrementais (verificação robusta) ──────────────────────────────
  function addColumnIfNotExists(table, column, definition) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      const exists = columns.some(c => c.name === column);
      if (!exists) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`[DB Migration] Coluna '${column}' adicionada à tabela '${table}'`);
      }
    } catch (err) {
      console.error(`[DB Migration Error] Erro ao adicionar coluna '${column}' na tabela '${table}': ${err.message}`);
    }
  }

  addColumnIfNotExists('vs_clientes', 'foto_path', 'TEXT');
  addColumnIfNotExists('vs_clientes', 'documento_path', 'TEXT');
  addColumnIfNotExists('vs_contratos', 'responsavel', 'TEXT');
  addColumnIfNotExists('vs_custos', 'tipo', "TEXT DEFAULT 'variavel'");
  addColumnIfNotExists('vs_clientes', 'endereco', 'TEXT');
  addColumnIfNotExists('vs_clientes', 'nome_contato', 'TEXT');
  addColumnIfNotExists('vs_clientes', 'cnpj', 'TEXT');
  addColumnIfNotExists('vs_clientes', 'cpf', 'TEXT');
  addColumnIfNotExists('vs_contratos', 'recorrente', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('vs_clientes', 'user_id', 'TEXT');
  addColumnIfNotExists('vs_custos', 'user_id', 'TEXT');

  // ── Migrar dados antigos sem user_id para o master ──────────────────────────
  try {
    const masterUser = db.prepare("SELECT id FROM vs_users WHERE role = 'master' LIMIT 1").get();
    if (masterUser) {
      const masterId = masterUser.id;
      const r1 = db.prepare('UPDATE vs_clientes SET user_id = ? WHERE user_id IS NULL').run(masterId);
      if (r1.changes > 0) console.log(`[DB Migration] ${r1.changes} clientes atribuídos ao master.`);
      const r2 = db.prepare('UPDATE vs_custos SET user_id = ? WHERE user_id IS NULL').run(masterId);
      if (r2.changes > 0) console.log(`[DB Migration] ${r2.changes} custos atribuídos ao master.`);
      const r3 = db.prepare('UPDATE vs_extratos SET created_by = ? WHERE created_by IS NULL').run(masterId);
      if (r3.changes > 0) console.log(`[DB Migration] ${r3.changes} extratos atribuídos ao master.`);
    }
  } catch (err) {
    console.error('[DB Migration Error] Erro ao migrar dados para master:', err.message);
  }

  // ── Seed: recebimentos históricos ─────────────────────────────────────────────
  try {
    const [{ count }] = db.prepare("SELECT COUNT(*) as count FROM vs_recebimentos").all();
    if (count === 0) {
      const contracts = db.prepare("SELECT id, comissao_recebida, data_adesao, administradora FROM vs_contratos").all();
      const { v4: uuidv4 } = await import('uuid');
      for (const c of contracts) {
        if (c.comissao_recebida > 0) {
          let date = c.data_adesao ? c.data_adesao.split('T')[0] : new Date().toISOString().split('T')[0];
          
          if (c.administradora === 'Tráfego Pago' && c.comissao_recebida === 1000) {
            date = '2026-05-18';
          } else if (c.administradora === 'Outro') {
            date = '2026-05-20';
          } else if (c.comissao_recebida === 1600) {
            date = '2026-06-04';
          } else if (c.comissao_recebida === 200) {
            date = '2026-06-05';
          }

          db.prepare(`INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`).run(
            uuidv4(), c.id, c.comissao_recebida, date
          );
        }
      }
      console.log('[DB Migration] Recebimentos históricos populados.');
    }
  } catch (err) {
    console.error('[DB Migration Error] Erro ao popular recebimentos históricos:', err.message);
  }

  // ── Seed: usuário master ──────────────────────────────────────────────────────
  const seedUsers = [
    { name: 'Master',  email: 'raulfs.sc@gmail.com',      password: process.env.MASTER_PASSWORD || 'Vs@2026*', role: 'master' },
    { name: 'Admin',   email: 'contato@vigasales.com.br',  password: process.env.ADMIN_PASSWORD  || 'Viga@2026', role: 'admin' },
  ];

  for (const u of seedUsers) {
    try {
      const exists = db.prepare('SELECT id FROM vs_users WHERE email = ?').get(u.email);
      if (!exists) {
        const { v4: uuidv4 } = await import('uuid');
        const hash = await hashPwd(u.password);
        db.prepare(
          `INSERT INTO vs_users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')`
        ).run(uuidv4(), u.name, u.email, hash, u.role);
        console.log('[DB] Usuário criado:', u.email);
      }
    } catch (err) {
      console.error('[DB] Erro ao criar usuário:', err.message);
    }
  }
}
