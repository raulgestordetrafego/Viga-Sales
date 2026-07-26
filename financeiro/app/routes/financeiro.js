/**
 * Viga Sales Financeiro — Rotas da API
 * Auth | Clientes | Contratos | Custos | IA de Extratos Bancários
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { query, queryOne, run, transaction } from '../db/database.js';
import { vsSessions } from '../services/sessions.js';

const router = express.Router();

// ── Constantes de sessão ──────────────────────────────────────────────────────
const SESSION_TTL_MS      = 8 * 60 * 60 * 1000;  // 8h
const INACTIVITY_TTL_MS   = 30 * 60 * 1000;       // 30 min

// ── Upload de arquivos ────────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads', 'financeiro');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Formato não suportado. Use JPG, PNG, WEBP ou PDF.'));
  },
});

router.use('/files', express.static(uploadDir));

// ── Middlewares de sessão ─────────────────────────────────────────────────────
function getSession(req) {
  let token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) return undefined;
  const s = vsSessions.get(token);
  if (!s) return undefined;
  const now = Date.now();
  if (now > s.expiresAt || now - s.lastActivity > INACTIVITY_TTL_MS) {
    vsSessions.delete(token);
    return undefined;
  }
  s.lastActivity = now;
  return s;
}

function auth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Não autenticado' });
  req.session = s;
  next();
}

function isMaster(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Não autenticado' });
  if (s.role !== 'master' && s.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  req.session = s;
  next();
}

// Helper: verifica se a sessão é admin ou master (vê tudo)
function isAdminOrMaster(session) {
  return session.role === 'master' || session.role === 'admin';
}

// Limpeza periódica de sessões
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of vsSessions.entries()) {
    if (now > s.expiresAt || now - s.lastActivity > INACTIVITY_TTL_MS) {
      vsSessions.delete(token);
    }
  }
}, 15 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const user = await queryOne('SELECT * FROM vs_users WHERE email = ?', [email]);
    if (!user) {
      await bcrypt.compare('dummy', '$2b$12$dummydummydummydummydudummydummydummydummydum');
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    if (user.status !== 'active') return res.status(403).json({ error: 'Conta inativa' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' });

    const token = uuidv4();
    const now   = Date.now();
    vsSessions.set(token, {
      userId: user.id, name: user.name, email: user.email, role: user.role,
      expiresAt: now + SESSION_TTL_MS, lastActivity: now,
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  vsSessions.delete(token);
  res.json({ ok: true });
});

router.get('/auth/me', auth, async (req, res) => {
  try {
    const user = await queryOne('SELECT id, name, email, role, status FROM vs_users WHERE id = ?', [req.session.userId]);
    res.json({ user: { ...req.session, ...user } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Preencha todos os campos' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
    const user = await queryOne('SELECT * FROM vs_users WHERE email = ?', [req.session.email]);
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });
    const hash = await bcrypt.hash(newPassword, 12);
    await run('UPDATE vs_users SET password_hash = ?, updated_at = ? WHERE email = ?',
      [hash, new Date().toISOString(), req.session.email]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USUÁRIOS (master only)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/users', isMaster, async (req, res) => {
  try {
    const users = await query('SELECT id, name, email, role, status, created_at FROM vs_users ORDER BY created_at DESC', []);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', isMaster, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha obrigatórios' });
    const exists = await queryOne('SELECT id FROM vs_users WHERE email = ?', [email]);
    if (exists) return res.status(409).json({ error: 'Email já cadastrado' });
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await run(
      `INSERT INTO vs_users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [id, name, email, hash, role || 'user']
    );
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', isMaster, async (req, res) => {
  try {
    if (req.session.userId === req.params.id) return res.status(400).json({ error: 'Não pode deletar sua própria conta' });
    await run('DELETE FROM vs_users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', isMaster, async (req, res) => {
  try {
    const { name, email, role, status, password } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios' });

    // Verifica se e-mail já existe em outro usuário
    const exists = await queryOne('SELECT id FROM vs_users WHERE email = ? AND id != ?', [email, req.params.id]);
    if (exists) return res.status(409).json({ error: 'Email já cadastrado em outro usuário' });

    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
      const hash = await bcrypt.hash(password, 12);
      await run(
        `UPDATE vs_users SET name = ?, email = ?, role = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
        [name, email, role || 'user', status || 'active', hash, new Date().toISOString(), req.params.id]
      );
    } else {
      await run(
        `UPDATE vs_users SET name = ?, email = ?, role = ?, status = ?, updated_at = ? WHERE id = ?`,
        [name, email, role || 'user', status || 'active', new Date().toISOString(), req.params.id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────────────────────────────────────────

router.get('/clientes', auth, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const clauses = ['1=1'];
    const params  = [];
    if (!isAdminOrMaster(req.session)) {
      clauses.push('c.user_id = ?');
      params.push(req.session.userId);
    }
    if (search) {
      clauses.push('(c.nome LIKE ? OR c.telefone LIKE ? OR c.email LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const where = clauses.join(' AND ');
    const sql = `
      SELECT c.*,
        COUNT(ct.id) as total_contratos,
        COALESCE(SUM(ct.valor_credito), 0) as total_credito,
        COUNT(CASE WHEN ct.em_atraso = 1 THEN 1 END) as contratos_atraso
      FROM vs_clientes c
      LEFT JOIN vs_contratos ct ON ct.cliente_id = c.id
      WHERE ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const clientes = await query(sql, params);
    const [{ total }] = await query(`SELECT COUNT(*) as total FROM vs_clientes c WHERE ${where}`,
      params.slice(0, params.length - 2));
    res.json({ clientes, total, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clientes/stats', auth, async (req, res) => {
  try {
    const userFilter = isAdminOrMaster(req.session) ? '' : 'WHERE c.user_id = ?';
    const userParams = isAdminOrMaster(req.session) ? [] : [req.session.userId];
    const [row] = await query(`
      SELECT
        COUNT(DISTINCT c.id)                                                                         AS total,
        COUNT(DISTINCT CASE WHEN ct.status = 'ativo' THEN c.id END)                                AS ativos,
        COUNT(DISTINCT CASE WHEN ct.em_atraso = 1 THEN c.id END)                                   AS em_atraso,
        COUNT(DISTINCT CASE WHEN ct.status = 'cancelado' THEN c.id END)                            AS cancelados,
        COALESCE(SUM(ct.valor_credito), 0)                                                          AS total_credito,
        COALESCE(SUM(ct.valor_credito * COALESCE(ct.percentual_comissao, 4) / 100), 0)             AS total_comissao,
        COALESCE(SUM(ct.valor_parcela * (COALESCE(ct.total_parcelas,0) - COALESCE(ct.parcelas_pagas,0))), 0) AS saldo_a_receber
      FROM vs_clientes c
      LEFT JOIN vs_contratos ct ON ct.cliente_id = c.id
      ${userFilter}
    `, userParams);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clientes/:id', auth, async (req, res) => {
  try {
    const cliente = await queryOne('SELECT * FROM vs_clientes WHERE id = ?', [req.params.id]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!isAdminOrMaster(req.session) && cliente.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão para acessar este cliente' });
    }
    const contratos = await query('SELECT * FROM vs_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...cliente, contratos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clientes', auth, async (req, res) => {
  try {
    const { nome, telefone, email, cpf_cnpj, responsavel, notas, nome_contato, cnpj, cpf, endereco } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const id  = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO vs_clientes (id, nome, telefone, email, cpf_cnpj, responsavel, notas, nome_contato, cnpj, cpf, endereco, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome.trim(), telefone || null, email || null, cpf_cnpj || null, responsavel || null, notas || null,
       nome_contato || null, cnpj || null, cpf || null, endereco || null, req.session.userId, now, now]
    );
    const cliente  = await queryOne('SELECT * FROM vs_clientes WHERE id = ?', [id]);
    const contratos = await query('SELECT * FROM vs_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [id]);
    res.json({ ...cliente, contratos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clientes/:id', auth, async (req, res) => {
  try {
    // Verificar ownership
    const existing = await queryOne('SELECT user_id FROM vs_clientes WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!isAdminOrMaster(req.session) && existing.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão para editar este cliente' });
    }
    const { nome, telefone, email, cpf_cnpj, responsavel, notas, nome_contato, cnpj, cpf, endereco } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE vs_clientes SET
         nome=COALESCE(?,nome), telefone=?, email=?, cpf_cnpj=?,
         responsavel=?, notas=?, nome_contato=?, cnpj=?, cpf=?, endereco=?, updated_at=?
       WHERE id=?`,
      [nome || null, telefone || null, email || null, cpf_cnpj || null,
       responsavel || null, notas || null, nome_contato || null, cnpj || null, cpf || null, endereco || null, now, req.params.id]
    );
    const cliente  = await queryOne('SELECT * FROM vs_clientes WHERE id = ?', [req.params.id]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    const contratos = await query('SELECT * FROM vs_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...cliente, contratos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/clientes/:id', auth, async (req, res) => {
  try {
    const client = await queryOne('SELECT user_id FROM vs_clientes WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!isAdminOrMaster(req.session) && client.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão para deletar este cliente' });
    }
    await run('DELETE FROM vs_recebimentos WHERE contrato_id IN (SELECT id FROM vs_contratos WHERE cliente_id = ?)', [req.params.id]);
    await run('DELETE FROM vs_contratos WHERE cliente_id = ?', [req.params.id]);
    await run('DELETE FROM vs_clientes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS
// ─────────────────────────────────────────────────────────────────────────────

router.post('/clientes/:id/contratos', auth, async (req, res) => {
  try {
    const clienteId = req.params.id;
    const cliente = await queryOne('SELECT id, user_id FROM vs_clientes WHERE id = ?', [clienteId]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!isAdminOrMaster(req.session) && cliente.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const {
      administradora, grupo, cota, numero_contrato,
      valor_credito, percentual_comissao, total_parcelas, valor_parcela,
      parcelas_pagas, status, em_atraso, cancelado,
      data_adesao, comissao_total, comissao_recebida, status_comissao,
      empresa, nf_emitida, data_boleto, data_lance,
      parceria_pct, parceria_obs, responsavel, notas, recorrente,
      recebimentos,
    } = req.body;

    const id  = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO vs_contratos
        (id, cliente_id, administradora, grupo, cota, numero_contrato,
         valor_credito, percentual_comissao, total_parcelas, valor_parcela,
         parcelas_pagas, status, em_atraso, cancelado,
         data_adesao, comissao_total, comissao_recebida, status_comissao,
         empresa, nf_emitida, data_boleto, data_lance,
         parceria_pct, parceria_obs, responsavel, notas, recorrente, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, clienteId, administradora || null, grupo || null, cota || null, numero_contrato || null,
       valor_credito || null, percentual_comissao || 4, total_parcelas || null, valor_parcela || null,
       parcelas_pagas || 0, status || 'ativo',
       em_atraso ? 1 : 0, cancelado ? 1 : 0,
       data_adesao || null, comissao_total || null, comissao_recebida || 0,
       status_comissao || 'pendente', empresa || 'VS', nf_emitida ? 1 : 0,
       data_boleto || null, data_lance || null,
       parceria_pct || null, parceria_obs || null, responsavel || null, notas || null,
       recorrente != null ? Number(recorrente) : 1,
       now, now]
    );

    let actualComissaoRecebida = comissao_recebida || 0;
    let actualParcelasPagas = parcelas_pagas || 0;
    
    if (Array.isArray(recebimentos)) {
      actualComissaoRecebida = 0;
      actualParcelasPagas = 0;
      for (const rec of recebimentos) {
        const recId = uuidv4();
        await run(
          `INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`,
          [recId, id, Number(rec.valor) || 0, rec.data_pagamento]
        );
        actualComissaoRecebida += Number(rec.valor) || 0;
        actualParcelasPagas += 1;
      }
      await run(
        `UPDATE vs_contratos SET comissao_recebida = ?, parcelas_pagas = ? WHERE id = ?`,
        [actualComissaoRecebida, actualParcelasPagas, id]
      );
    } else if (Number(comissao_recebida) > 0) {
      const recId = uuidv4();
      const payDate = data_adesao ? data_adesao.split('T')[0] : new Date().toISOString().split('T')[0];
      await run(
        `INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`,
        [recId, id, Number(comissao_recebida), payDate]
      );
    }

    const ct = await queryOne('SELECT * FROM vs_contratos WHERE id = ?', [id]);
    res.json(ct);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/contratos/:id', auth, async (req, res) => {
  try {
    const {
      administradora, grupo, cota, numero_contrato,
      valor_credito, percentual_comissao, total_parcelas, valor_parcela,
      parcelas_pagas, status, em_atraso, cancelado,
      data_adesao, comissao_total, comissao_recebida, status_comissao,
      empresa, nf_emitida, data_boleto, data_lance,
      parceria_pct, parceria_obs, responsavel, notas, recorrente,
      recebimentos,
    } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE vs_contratos SET
         administradora=?, grupo=?, cota=?, numero_contrato=?,
         valor_credito=?, percentual_comissao=COALESCE(?,percentual_comissao),
         total_parcelas=?, valor_parcela=?,
         parcelas_pagas=COALESCE(?,parcelas_pagas),
         status=COALESCE(?,status),
         em_atraso=COALESCE(?,em_atraso), cancelado=COALESCE(?,cancelado),
         data_adesao=?, comissao_total=?,
         comissao_recebida=COALESCE(?,comissao_recebida),
         status_comissao=COALESCE(?,status_comissao),
         empresa=COALESCE(?,empresa), nf_emitida=COALESCE(?,nf_emitida),
         data_boleto=?, data_lance=?,
         parceria_pct=?, parceria_obs=?, responsavel=?, notas=?, recorrente=COALESCE(?,recorrente),
         updated_at=?
       WHERE id=?`,
      [
        administradora || null, grupo || null, cota || null, numero_contrato || null,
        valor_credito || null, percentual_comissao || null,
        total_parcelas || null, valor_parcela || null,
        parcelas_pagas != null ? Number(parcelas_pagas) : null,
        status || null,
        em_atraso != null ? (em_atraso ? 1 : 0) : null,
        cancelado  != null ? (cancelado  ? 1 : 0) : null,
        data_adesao || null, comissao_total || null,
        comissao_recebida != null ? Number(comissao_recebida) : null,
        status_comissao || null, empresa || null,
        nf_emitida != null ? (nf_emitida ? 1 : 0) : null,
        data_boleto || null, data_lance || null,
        parceria_pct || null, parceria_obs || null, responsavel || null, notas || null,
        recorrente != null ? Number(recorrente) : null,
        now, req.params.id,
      ]
    );

    let actualComissaoRecebida = comissao_recebida;
    let actualParcelasPagas = parcelas_pagas;
    
    if (Array.isArray(recebimentos)) {
      await run('DELETE FROM vs_recebimentos WHERE contrato_id = ?', [req.params.id]);
      actualComissaoRecebida = 0;
      actualParcelasPagas = 0;
      for (const rec of recebimentos) {
        const recId = uuidv4();
        await run(
          `INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`,
          [recId, req.params.id, Number(rec.valor) || 0, rec.data_pagamento]
        );
        actualComissaoRecebida += Number(rec.valor) || 0;
        actualParcelasPagas += 1;
      }
      
      await run(
        `UPDATE vs_contratos SET comissao_recebida = ?, parcelas_pagas = ? WHERE id = ?`,
        [actualComissaoRecebida, actualParcelasPagas, req.params.id]
      );
    } else if (comissao_recebida != null) {
      const oldRecs = await query('SELECT SUM(valor) as total FROM vs_recebimentos WHERE contrato_id = ?', [req.params.id]);
      const oldTotal = oldRecs[0]?.total || 0;
      if (Number(comissao_recebida) !== oldTotal) {
        await run('DELETE FROM vs_recebimentos WHERE contrato_id = ?', [req.params.id]);
        if (Number(comissao_recebida) > 0) {
          const recId = uuidv4();
          const payDate = data_adesao ? data_adesao.split('T')[0] : new Date().toISOString().split('T')[0];
          await run(
            `INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`,
            [recId, req.params.id, Number(comissao_recebida), payDate]
          );
        }
      }
    }

    const ct = await queryOne('SELECT * FROM vs_contratos WHERE id = ?', [req.params.id]);
    if (!ct) return res.status(404).json({ error: 'Contrato não encontrado' });
    res.json(ct);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/contratos/:id', auth, async (req, res) => {
  try {
    const contrato = await queryOne(
      'SELECT c.user_id FROM vs_contratos ct JOIN vs_clientes c ON c.id = ct.cliente_id WHERE ct.id = ?',
      [req.params.id]
    );
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    if (!isAdminOrMaster(req.session) && contrato.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão para deletar este contrato' });
    }
    await run('DELETE FROM vs_recebimentos WHERE contrato_id = ?', [req.params.id]);
    await run('DELETE FROM vs_contratos WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/contratos/:id/recebimentos', auth, async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM vs_recebimentos WHERE contrato_id = ? ORDER BY data_pagamento ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/recebimentos/:id', auth, async (req, res) => {
  try {
    await transaction(async () => {
      const rec = await queryOne('SELECT contrato_id FROM vs_recebimentos WHERE id = ?', [req.params.id]);
      if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });
      
      await run('DELETE FROM vs_recebimentos WHERE id = ?', [req.params.id]);
      
      const [sums] = await query('SELECT SUM(valor) as total, COUNT(*) as c FROM vs_recebimentos WHERE contrato_id = ?', [rec.contrato_id]);
      const [ct] = await query('SELECT total_parcelas FROM vs_contratos WHERE id = ?', [rec.contrato_id]);
      const total = ct?.total_parcelas || 12;
      const status = (sums.c || 0) >= total ? 'recebida' : ((sums.c || 0) > 0 ? 'parcial' : 'pendente');
      
      await run(
        'UPDATE vs_contratos SET comissao_recebida = ?, parcelas_pagas = ?, status_comissao = ? WHERE id = ?',
        [sums.total || 0, sums.c || 0, status, rec.contrato_id]
      );
    });
    
    res.json({ ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/chat/process', auth, async (req, res) => {
  try {
    const { text, file, history = [] } = req.body;
    if (!text && !file) {
      return res.status(400).json({ error: 'Nenhum texto ou arquivo enviado' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' });
    }

    let clientesList, contratosList;
    if (isAdminOrMaster(req.session)) {
      clientesList = await query('SELECT id, nome FROM vs_clientes', []);
      contratosList = await query(
        `SELECT c.id, c.cliente_id, c.administradora, c.valor_parcela, c.valor_credito, cl.nome as cliente_nome 
         FROM vs_contratos c 
         JOIN vs_clientes cl ON cl.id = c.cliente_id 
         WHERE c.status = 'ativo'`, []);
    } else {
      clientesList = await query('SELECT id, nome FROM vs_clientes WHERE user_id = ?', [req.session.userId]);
      contratosList = await query(
        `SELECT c.id, c.cliente_id, c.administradora, c.valor_parcela, c.valor_credito, cl.nome as cliente_nome 
         FROM vs_contratos c 
         JOIN vs_clientes cl ON cl.id = c.cliente_id 
         WHERE c.status = 'ativo' AND cl.user_id = ?`, [req.session.userId]);
    }

    const systemPrompt = `Você é o assistente financeiro inteligente da Viga Sales.
Sua tarefa é analisar a mensagem de texto e/ou o arquivo enviado e classificar/alocar a transação financeira da forma mais inteligente possível.

REGRA MAIS IMPORTANTE: Você tem MEMÓRIA. Toda a conversa anterior está disponível no histórico de mensagens. NUNCA repita uma pergunta que o usuário já respondeu no histórico. Se o usuário já disse o nome do cliente, o valor, se é recorrente ou não, ou qualquer outro dado — USE essa informação diretamente sem perguntar de novo. Quando tiver dados suficientes, REGISTRE a transação imediatamente.

Hoje é dia ${new Date().toISOString().split('T')[0]} (dia da semana: ${new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}).

Clientes cadastrados: ${JSON.stringify(clientesList)}
Contratos ativos: ${JSON.stringify(contratosList)}

Classifique a transação:
1. Custo/despesa (saída) → retorne:
{"action":"cost","data":{"descricao":"...","categoria":"Marketing|Infraestrutura|Freelancer|Administrativo|Comercial|Outro","valor":150.00,"data":"YYYY-MM-DD","tipo":"fixo|variavel","notas":"..."},"explanation":"Mensagem curta confirmando."}

2. Recebimento de cliente EXISTENTE (entrada) → retorne:
{"action":"revenue","data":{"contrato_id":"ID","valor":1600.00,"data_pagamento":"YYYY-MM-DD"},"explanation":"Mensagem curta confirmando."}

3. Recebimento de cliente NOVO (entrada):
   - Se FALTAM dados essenciais (nome OU valor) que NÃO foram mencionados em NENHUMA mensagem anterior do histórico, peça APENAS os dados que faltam (máximo 1 pergunta):
   {"action":"clarification","message":"Sua pergunta ÚNICA e objetiva"}
   - Se o nome e valor já foram fornecidos (na mensagem atual ou em mensagens anteriores do histórico), REGISTRE IMEDIATAMENTE sem perguntar mais nada. Use valores padrão se necessário (recorrente=false, duracao_meses=1 para venda única):
   {"action":"new_client_revenue","data":{"cliente_nome":"...","descricao_servico":"...","valor":1600.00,"data_pagamento":"YYYY-MM-DD","recorrente":false,"cpf_cnpj":"","duracao_meses":1},"explanation":"Mensagem curta confirmando cadastro e registro."}

4. Se NÃO tem certeza sobre qual contrato/cliente:
{"action":"clarification","message":"Pergunta curta e objetiva"}

REGRAS CRÍTICAS:
- NUNCA faça mais de 1 pergunta por vez. Seja direto.
- Se o usuário responde algo como "é o Sidney, venda única, 100 reais, consultoria" — isso tem TUDO que você precisa. Registre na hora.
- Se o usuário demonstra irritação ("ja falei", "eu disse", "porra"), registre imediatamente com os dados que tem. Use valores padrão para campos opcionais.
- Retorne APENAS JSON puro, sem markdown, sem \`\`\`json.`;

    // Montar mensagens para OpenAI
    const userContent = [];
    if (text) {
      userContent.push({ type: 'text', text: `Mensagem do usuário: "${text}"` });
    }
    if (file && file.base64 && file.mimeType) {
      if (file.mimeType.startsWith('image/')) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${file.mimeType};base64,${file.base64}` }
        });
      } else {
        userContent.push({ type: 'text', text: `[Arquivo anexado: ${file.mimeType}, tamanho: ${Math.round(file.base64.length * 0.75 / 1024)}KB. Analise o conteúdo descrito pelo usuário.]` });
      }
    }

    // Montar array de mensagens: system + history completo (que já inclui a msg atual do user)
    // Se history estiver vazio (primeira msg), adiciona o userContent como user
    const messages = [{ role: 'system', content: systemPrompt }];
    if (history.length > 0) {
      // History já contém as mensagens do user e assistant, incluindo a atual
      messages.push(...history);
    }
    // Sempre adicionar a mensagem atual formatada (pode ter imagem)
    messages.push({ role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent });

    const openaiPayload = {
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 2048,
      messages: messages
    };

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      openaiPayload,
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` }, timeout: 60000 }
    );

    const replyText = response.data?.choices?.[0]?.message?.content || '';
    
    let cleanJsonStr = replyText.trim();
    if (cleanJsonStr.includes('```')) {
      const match = cleanJsonStr.match(/\{[\s\S]*\}/);
      if (match) cleanJsonStr = match[0];
    }
    
    let result;
    try {
      result = JSON.parse(cleanJsonStr);
    } catch (err) {
      console.error('[Chat AI] Falha ao analisar resposta da IA:', replyText);
      return res.status(500).json({ error: 'Falha na resposta inteligente da IA. Formato inválido.', raw: replyText });
    }

    if (result.action === 'cost' && result.data) {
      const d = result.data;
      const id = uuidv4();
      await run(
        `INSERT INTO vs_custos (id, descricao, categoria, valor, data, tipo, notas, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, d.descricao || 'Custo não especificado', d.categoria || 'Outro', Number(d.valor) || 0, d.data || new Date().toISOString().split('T')[0], d.tipo || 'variavel', d.notas || null, req.session.userId]
      );
      result.inserted = {
        id,
        descricao: d.descricao,
        categoria: d.categoria,
        valor: d.valor,
        data: d.data,
        tipo: d.tipo
      };
    } else if (result.action === 'new_client_revenue' && result.data) {
      const d = result.data;
      const clienteId = uuidv4();
      const contratoId = uuidv4();
      const recebimentoId = uuidv4();
      const payDate = d.data_pagamento || new Date().toISOString().split('T')[0];
      const val = Number(d.valor) || 0;
      const rec = d.recorrente ? 1 : 0;

      // 1. Inserir Cliente
      await run(
        `INSERT INTO vs_clientes (id, nome, cpf_cnpj, user_id) VALUES (?, ?, ?, ?)`,
        [clienteId, d.cliente_nome || 'Cliente Novo', d.cpf_cnpj || null, req.session.userId]
      );

      // 2. Inserir Contrato
      const valor_parcela = rec ? val : 0;
      const valor_credito = rec ? 0 : val;
      const total_parcelas = Number(d.duracao_meses) || (rec ? 12 : 1);
      const comissao_total = rec ? (valor_parcela * total_parcelas) : valor_credito;
      const parcelas_pagas = 1;
      const status_comissao = rec ? 'parcial' : 'recebida';

      await run(
        `INSERT INTO vs_contratos (
          id, cliente_id, administradora, valor_parcela, valor_credito, 
          recorrente, total_parcelas, parcelas_pagas, comissao_recebida, comissao_total, status_comissao, status, data_adesao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contratoId, clienteId, d.descricao_servico || 'Venda', valor_parcela, valor_credito,
          rec, total_parcelas, parcelas_pagas, val, comissao_total, status_comissao, 'ativo', payDate
        ]
      );

      // 3. Inserir Recebimento
      await run(
        `INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`,
        [recebimentoId, contratoId, val, payDate]
      );

      result.inserted = {
        id: recebimentoId,
        contrato_id: contratoId,
        cliente_id: clienteId,
        valor: val,
        data_pagamento: payDate,
        cliente_nome: d.cliente_nome || 'Cliente Novo',
        contrato_desc: d.descricao_servico || 'Venda'
      };
      
      // Sobrescrever a action para "revenue" para o frontend tratar normalmente
      result.action = 'revenue';
    } else if (result.action === 'revenue' && result.data && result.data.contrato_id) {
      const d = result.data;
      const id = uuidv4();
      const payDate = d.data_pagamento || new Date().toISOString().split('T')[0];
      await run(
        `INSERT INTO vs_recebimentos (id, contrato_id, valor, data_pagamento) VALUES (?, ?, ?, ?)`,
        [id, d.contrato_id, Number(d.valor) || 0, payDate]
      );

      const [sums] = await query('SELECT SUM(valor) as total, COUNT(*) as c FROM vs_recebimentos WHERE contrato_id = ?', [d.contrato_id]);
      const [ct] = await query(
        `SELECT c.total_parcelas, c.valor_parcela, c.valor_credito, c.administradora, cl.nome as cliente_nome 
         FROM vs_contratos c 
         JOIN vs_clientes cl ON cl.id = c.cliente_id 
         WHERE c.id = ?`,
        [d.contrato_id]
      );
      
      const total = ct?.total_parcelas || 12;
      const status = (sums.c || 0) >= total ? 'recebida' : ((sums.c || 0) > 0 ? 'parcial' : 'pendente');
      
      await run(
        'UPDATE vs_contratos SET comissao_recebida = ?, parcelas_pagas = ?, status_comissao = ? WHERE id = ?',
        [sums.total || 0, sums.c || 0, status, d.contrato_id]
      );

      result.inserted = {
        id,
        contrato_id: d.contrato_id,
        valor: d.valor,
        data_pagamento: payDate,
        cliente_nome: ct?.cliente_nome || 'Cliente',
        contrato_desc: ct?.administradora || 'Contrato'
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOS / DESPESAS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/custos', auth, async (req, res) => {
  try {
    const { month, year, page = 1, limit = 100 } = req.query;
    const offset  = (Number(page) - 1) * Number(limit);
    const clauses = ['1=1'];
    const params  = [];
    if (month && year) {
      clauses.push("strftime('%Y-%m', data) = ?");
      params.push(`${year}-${String(month).padStart(2,'0')}`);
    } else if (year) {
      clauses.push("strftime('%Y', data) = ?");
      params.push(String(year));
    } else if (month) {
      clauses.push("strftime('%m', data) = ?");
      params.push(String(month).padStart(2,'0'));
    }
    if (!isAdminOrMaster(req.session)) {
      clauses.push('user_id = ?');
      params.push(req.session.userId);
    }
    const where = clauses.join(' AND ');
    const custos = await query(`SELECT * FROM vs_custos WHERE ${where} ORDER BY data DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]);
    const [{ total }] = await query(`SELECT COUNT(*) as total FROM vs_custos WHERE ${where}`, params);
    const [{ soma }]  = await query(`SELECT COALESCE(SUM(valor), 0) as soma FROM vs_custos WHERE ${where}`, params);
    res.json({ custos, total, soma, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/custos', auth, async (req, res) => {
  try {
    const { descricao, categoria, valor, data, notas, tipo } = req.body;
    if (!descricao || !valor || !data) return res.status(400).json({ error: 'Descrição, valor e data obrigatórios' });
    const id = uuidv4();
    await run(
      `INSERT INTO vs_custos (id, descricao, categoria, valor, data, notas, tipo, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, descricao, categoria || 'outros', Number(valor), data, notas || null, tipo || 'variavel', req.session.userId]
    );
    const custo = await queryOne('SELECT * FROM vs_custos WHERE id = ?', [id]);
    res.json(custo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/custos/bulk', auth, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items deve ser um array' });
    
    const now = new Date().toISOString();
    for (const item of items) {
      const { descricao, categoria, valor, data, notas, tipo } = item;
      if (!descricao || !valor || !data) continue;
      const id = uuidv4();
      await run(
        `INSERT INTO vs_custos (id, descricao, categoria, valor, data, notas, tipo, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, descricao.trim(), categoria || 'outros', Number(valor), data, notas || null, tipo || 'variavel', req.session.userId, now]
      );
    }
    res.json({ ok: true, count: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/custos/:id', auth, async (req, res) => {
  try {
    const existingCusto = await queryOne('SELECT user_id FROM vs_custos WHERE id = ?', [req.params.id]);
    if (!existingCusto) return res.status(404).json({ error: 'Custo não encontrado' });
    if (!isAdminOrMaster(req.session) && existingCusto.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão para editar este custo' });
    }
    const { descricao, categoria, valor, data, notas, tipo } = req.body;
    await run(
      `UPDATE vs_custos SET descricao=COALESCE(?,descricao), categoria=?, valor=COALESCE(?,valor), data=COALESCE(?,data), notas=?, tipo=COALESCE(?,tipo) WHERE id=?`,
      [descricao || null, categoria || null, valor ? Number(valor) : null, data || null, notas || null, tipo || null, req.params.id]
    );
    const custo = await queryOne('SELECT * FROM vs_custos WHERE id = ?', [req.params.id]);
    if (!custo) return res.status(404).json({ error: 'Custo não encontrado' });
    res.json(custo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/custos/:id', auth, async (req, res) => {
  try {
    const existingCusto = await queryOne('SELECT user_id FROM vs_custos WHERE id = ?', [req.params.id]);
    if (existingCusto && !isAdminOrMaster(req.session) && existingCusto.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Sem permissão para deletar este custo' });
    }
    await run('DELETE FROM vs_custos WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 🤖 IA — LEITURA DE EXTRATO BANCÁRIO POR IMAGEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/financeiro/ia/extrato
 *
 * Recebe uma imagem (upload multipart OU base64 no body) e usa o
 * Google Gemini Vision para extrair as transações do extrato bancário.
 *
 * Retorna:
 *  - banco, conta, periodo, saldo_inicial, saldo_final
 *  - lista de transações (data, descrição, valor, tipo, categoria)
 *  - resumo textual gerado pela IA
 */

const uploadExtrato = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Use JPG, PNG, WEBP ou PDF para envio de extratos.'));
  },
});



async function postWithRetry(url, payload, config, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await axios.post(url, payload, config);
    } catch (err) {
      attempt++;
      const isRateLimit = err.response && err.response.status === 429;
      if (isRateLimit && attempt < maxRetries) {
        const delay = attempt * 2000;
        console.warn(`[Gemini API] Rate limit (429) hit. Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

async function analisarExtratoComOpenAI(base64Image, mimeType = 'image/jpeg') {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error('OPENAI_API_KEY não configurada no servidor.');

  const prompt = `Você é um especialista em análise de extratos bancários brasileiros.
Analise cuidadosamente o extrato bancário (imagem ou documento PDF) e extraia TODAS as informações disponíveis.

Retorne SOMENTE um JSON válido com a seguinte estrutura (sem markdown, sem explicações fora do JSON):

{
  "banco": "nome do banco",
  "conta": "número da conta/agência se visível",
  "periodo_inicio": "YYYY-MM-DD ou null",
  "periodo_fim": "YYYY-MM-DD ou null",
  "saldo_inicial": 0.00,
  "saldo_final": 0.00,
  "total_entradas": 0.00,
  "total_saidas": 0.00,
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "descrição da transação",
      "valor": 0.00,
      "tipo": "entrada ou saida",
      "categoria": "transferência|pix|ted|doc|pagamento|compra|saque|tarifa|salário|outra"
    }
  ],
  "resumo": "Resumo em português: período, total de entradas, saídas, saldo final e observações relevantes sobre o extrato."
}

Regras importantes:
- Valores de SAÍDA devem ser NEGATIVOS (ex: -150.00)
- Valores de ENTRADA devem ser POSITIVOS (ex: 1500.00)
- O campo "tipo" deve ser "entrada" para créditos e "saida" para débitos
- Se não encontrar alguma informação, use null
- Datas devem estar no formato YYYY-MM-DD
- Identifique a categoria de cada transação baseado na descrição
- O resumo deve ser amigável e em português brasileiro`;

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' }
            }
          ]
        }
      ]
    },
    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` }, timeout: 90000 }
  );

  const text = response.data?.choices?.[0]?.message?.content || '';

  // Extrai o JSON da resposta (remove possíveis marcações markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('A IA não retornou um JSON válido. Tente com uma imagem mais nítida.');

  return JSON.parse(jsonMatch[0]);
}

// Rota: análise via UPLOAD de arquivo
router.post('/ia/extrato', auth, (req, res, next) => {
  uploadExtrato.single('imagem')(req, res, (err) => {
    if (err) {
      console.error('[IA Extrato] Erro no upload:', err.message);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    let base64Image, mimeType;

    if (req.file) {
      // Upload de arquivo
      const fileBuffer = fs.readFileSync(req.file.path);
      base64Image = fileBuffer.toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
    } else if (req.body.imagem_base64) {
      // Base64 enviado diretamente no body
      const raw = req.body.imagem_base64;
      // Remove prefixo "data:image/xxx;base64," se existir
      const match = raw.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType    = match[1];
        base64Image = match[2];
      } else {
        base64Image = raw;
        mimeType    = 'image/jpeg';
      }
    } else {
      return res.status(400).json({ error: 'Envie uma imagem via multipart (campo "imagem") ou base64 (campo "imagem_base64")' });
    }

    console.log(`[IA Extrato] Analisando imagem... usuário: ${req.session.name}`);

    const resultado = await analisarExtratoComOpenAI(base64Image, mimeType);

    // Salva no banco de dados
    const id  = uuidv4();
    const now = new Date().toISOString();
    const nomeArquivo = req.file?.originalname || `extrato-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.jpg`;

    await run(
      `INSERT INTO vs_extratos
        (id, nome_arquivo, periodo_inicio, periodo_fim, banco, conta,
         saldo_inicial, saldo_final, total_entradas, total_saidas,
         resumo_ia, raw_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, nomeArquivo,
        resultado.periodo_inicio || null, resultado.periodo_fim || null,
        resultado.banco || null, resultado.conta || null,
        resultado.saldo_inicial || 0, resultado.saldo_final || 0,
        resultado.total_entradas || 0, resultado.total_saidas || 0,
        resultado.resumo || null,
        JSON.stringify(resultado),
        req.session.userId, now,
      ]
    );

    // Salva transações individuais
    if (Array.isArray(resultado.transacoes) && resultado.transacoes.length > 0) {
      for (const t of resultado.transacoes) {
        await run(
          `INSERT INTO vs_transacoes (id, extrato_id, data, descricao, valor, tipo, categoria) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), id, t.data || null, t.descricao || null, t.valor || 0, t.tipo || 'outra', t.categoria || 'outra']
        );
      }
    }

    // Remove arquivo temporário do disco
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }

    console.log(`[IA Extrato] ✅ Análise concluída. ${resultado.transacoes?.length || 0} transações extraídas.`);

    res.json({
      ok: true,
      extrato_id: id,
      resultado,
    });
  } catch (err) {
    console.error('[IA Extrato] Erro:', err.message);
    if (err.response?.status === 400) {
      return res.status(400).json({ error: 'Imagem inválida ou não reconhecida pelo Gemini. Use uma foto nítida do extrato.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Rota: listar extratos analisados
router.get('/ia/extratos', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let extratos;
    let total;
    if (isAdminOrMaster(req.session)) {
      extratos = await query('SELECT * FROM vs_extratos ORDER BY created_at DESC LIMIT ? OFFSET ?', [Number(limit), offset]);
      const [{ count }] = await query('SELECT COUNT(*) as count FROM vs_extratos', []);
      total = count;
    } else {
      extratos = await query('SELECT * FROM vs_extratos WHERE created_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [req.session.userId, Number(limit), offset]);
      const [{ count }] = await query('SELECT COUNT(*) as count FROM vs_extratos WHERE created_by = ?', [req.session.userId]);
      total = count;
    }
    res.json({ extratos, total, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rota: detalhe de um extrato (com transações)
router.get('/ia/extratos/:id', auth, async (req, res) => {
  try {
    const extrato = await queryOne('SELECT * FROM vs_extratos WHERE id = ?', [req.params.id]);
    if (!extrato) return res.status(404).json({ error: 'Extrato não encontrado' });
    const transacoes = await query('SELECT * FROM vs_transacoes WHERE extrato_id = ? ORDER BY data ASC, rowid ASC', [req.params.id]);
    res.json({ ...extrato, transacoes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rota: deletar extrato
router.delete('/ia/extratos/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM vs_transacoes WHERE extrato_id = ?', [req.params.id]);
    await run('DELETE FROM vs_extratos WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTAÇÃO CSV
// ─────────────────────────────────────────────────────────────────────────────

function csvRow(cells) {
  return cells.map(c => {
    const v = c == null ? '' : String(c);
    return v.includes(',') || v.includes('"') || v.includes('\n')
      ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',');
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('pt-BR');
}
function fmtMoney(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

router.get('/export/provisao', auth, async (req, res) => {
  try {
    const isFull = isAdminOrMaster(req.session);
    const sql = `SELECT c.nome, c.responsavel, ct.*
       FROM vs_contratos ct
       JOIN vs_clientes c ON c.id = ct.cliente_id
       WHERE ct.status != 'cancelado' ${isFull ? '' : 'AND c.user_id = ?'}
       ORDER BY ct.administradora, c.nome`;
    const params = isFull ? [] : [req.session.userId];
    const rows = await query(sql, params);
    const header = csvRow([
      'Administradora','Cliente','Grupo','Cota','Situação','Valor do Crédito','Contrato',
      'Data Adesão','Parcelas','Parcelas Pagas','Parcelas Restantes',
      '% Comissão','Comissão Total','Status Comissão','Comissão Recebida',
      'A Receber','Empresa','NF Emitida','Data Boleto','Data Lance',
      'Parceria %','Obs Parceria','Responsável',
    ]);
    const data = rows.map(c => {
      const parcRestantes = (c.total_parcelas || 0) - (c.parcelas_pagas || 0);
      const comissaoMensal = c.comissao_total && c.total_parcelas ? c.comissao_total / c.total_parcelas : null;
      const aReceber = comissaoMensal && parcRestantes ? comissaoMensal * parcRestantes : null;
      const situacao = c.em_atraso ? 'Em atraso' : c.status === 'quitado' ? 'Quitado' : 'Ativa';
      return csvRow([
        c.administradora || '', c.nome, c.grupo || '', c.cota || '', situacao,
        fmtMoney(c.valor_credito), c.numero_contrato || '',
        fmtDate(c.data_adesao || c.created_at), c.total_parcelas || '',
        c.parcelas_pagas || 0, parcRestantes,
        c.percentual_comissao ? c.percentual_comissao.toFixed(4) + '%' : '',
        fmtMoney(c.comissao_total),
        c.status_comissao || 'pendente',
        fmtMoney(c.comissao_recebida || 0),
        fmtMoney(aReceber),
        c.empresa || 'VS', c.nf_emitida ? 'Sim' : 'Não',
        c.data_boleto || '', c.data_lance || '',
        c.parceria_pct || '', c.parceria_obs || '', c.responsavel || '',
      ]);
    });
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="provisao_${new Date().toISOString().split('T')[0]}.csv"`);
    res.end(bom + [header, ...data].join('\r\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export/transacoes', auth, async (req, res) => {
  try {
    const { extrato_id } = req.query;
    const isFull = isAdminOrMaster(req.session);
    const clauses = ['1=1'];
    const params  = [];
    if (extrato_id) { clauses.push('t.extrato_id = ?'); params.push(extrato_id); }
    if (!isFull) { clauses.push('e.created_by = ?'); params.push(req.session.userId); }
    const rows = await query(
      `SELECT t.*, e.banco, e.conta, e.nome_arquivo
       FROM vs_transacoes t
       LEFT JOIN vs_extratos e ON e.id = t.extrato_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY t.data ASC`, params
    );
    const header = csvRow(['Data', 'Descrição', 'Valor', 'Tipo', 'Categoria', 'Banco', 'Conta', 'Arquivo']);
    const data = rows.map(t => csvRow([
      fmtDate(t.data), t.descricao || '', fmtMoney(t.valor), t.tipo || '',
      t.categoria || '', t.banco || '', t.conta || '', t.nome_arquivo || '',
    ]));
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transacoes_${new Date().toISOString().split('T')[0]}.csv"`);
    res.end(bom + [header, ...data].join('\r\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — resumo geral
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dashboard', auth, async (req, res) => {
  try {
    const isFull = isAdminOrMaster(req.session);
    const uid = req.session.userId;

    // Filtros condicionais por user_id
    const clienteFilter = isFull ? '' : 'WHERE user_id = ?';
    const clienteJoinFilter = isFull ? '' : 'AND c.user_id = ?';
    const custoFilter = isFull ? '' : 'AND user_id = ?';
    const extratoFilter = isFull ? '' : 'WHERE created_by = ?';
    const baseParams = isFull ? [] : [uid];

    const [clientes]    = await query(`SELECT COUNT(*) as c FROM vs_clientes ${clienteFilter}`, baseParams);
    const [contratos]   = await query(`SELECT COUNT(*) as c, COALESCE(SUM(ct.valor_credito),0) as total FROM vs_contratos ct ${isFull ? "WHERE ct.status = 'ativo'" : "JOIN vs_clientes c ON c.id = ct.cliente_id WHERE ct.status = 'ativo' AND c.user_id = ?"}`, baseParams);
    const [em_atraso]   = await query(`SELECT COUNT(*) as c FROM vs_contratos ct ${isFull ? 'WHERE ct.em_atraso = 1' : 'JOIN vs_clientes c ON c.id = ct.cliente_id WHERE ct.em_atraso = 1 AND c.user_id = ?'}`, baseParams);
    const [comissao]    = await query(`SELECT COALESCE(SUM(ct.comissao_total),0) as total, COALESCE(SUM(ct.comissao_recebida),0) as recebida FROM vs_contratos ct ${isFull ? '' : 'JOIN vs_clientes c ON c.id = ct.cliente_id WHERE c.user_id = ?'}`, baseParams);
    const [custos_mes]  = await query(`SELECT COALESCE(SUM(valor),0) as total FROM vs_custos WHERE strftime('%Y-%m', data) = strftime('%Y-%m', 'now') ${custoFilter}`, baseParams);
    const [extratos]    = await query(`SELECT COUNT(*) as c FROM vs_extratos ${extratoFilter}`, baseParams);

    // ── Indicadores Reais (Mês Atual) ───────────────────────────────────────
    const [recebido_mes] = await query(
      `SELECT COALESCE(SUM(r.valor), 0) as total FROM vs_recebimentos r ${isFull ? '' : 'JOIN vs_contratos ct ON ct.id = r.contrato_id JOIN vs_clientes c ON c.id = ct.cliente_id'} WHERE strftime('%Y-%m', r.data_pagamento) = strftime('%Y-%m', 'now') ${isFull ? '' : 'AND c.user_id = ?'}`,
      baseParams
    );
    const recebido_real = recebido_mes.total;
    const custo_real_total = custos_mes.total;
    const ebitda_real = recebido_real - custo_real_total;
    const margem_ebitda_real = recebido_real > 0 ? (ebitda_real / recebido_real) * 100 : 0;

    // ── Indicadores Projetados (Mensal / Recorrência) ────────────────────────
    // MRR: Receita Mensal Recorrente baseada em contratos ativos
    const [mrr_db] = await query(`SELECT COALESCE(SUM(ct.valor_parcela), 0) as total FROM vs_contratos ct ${isFull ? "WHERE ct.status = 'ativo'" : "JOIN vs_clientes c ON c.id = ct.cliente_id WHERE ct.status = 'ativo' AND c.user_id = ?"}`, baseParams);
    const mrr = mrr_db.total;

    // Recebíveis restantes totais em contratos que não estão cancelados ou encerrados
    const [recebiveis_db] = await query(`SELECT COALESCE(SUM(ct.valor_credito - ct.comissao_recebida), 0) as total FROM vs_contratos ct ${isFull ? "WHERE ct.status NOT IN ('cancelado', 'encerrado')" : "JOIN vs_clientes c ON c.id = ct.cliente_id WHERE ct.status NOT IN ('cancelado', 'encerrado') AND c.user_id = ?"}`, baseParams);
    const recebiveis_restantes = recebiveis_db.total;

    // Custos fixos e variáveis do mês atual
    const [custos_fixos_db] = await query(`SELECT COALESCE(SUM(valor), 0) as total FROM vs_custos WHERE strftime('%Y-%m', data) = strftime('%Y-%m', 'now') AND tipo = 'fixo' ${custoFilter}`, baseParams);
    const [custos_var_db] = await query(`SELECT COALESCE(SUM(valor), 0) as total FROM vs_custos WHERE strftime('%Y-%m', data) = strftime('%Y-%m', 'now') AND tipo = 'variavel' ${custoFilter}`, baseParams);
    
    const custos_fixos_mes = custos_fixos_db.total;
    const custos_variaveis_mes = custos_var_db.total;

    // EBITDA Projetado = MRR (receita recorrente mensal contratada) - Custos Fixos Mensais (base operacional)
    const ebitda_projetado = mrr - custos_fixos_mes;
    const margem_ebitda_projetada = mrr > 0 ? (ebitda_projetado / mrr) * 100 : 0;

    res.json({
      total_clientes:     clientes.c,
      contratos_ativos:   contratos.c,
      volume_credito:     contratos.total,
      em_atraso:          em_atraso.c,
      comissao_total:     comissao.total,
      comissao_recebida:  comissao.recebida,
      comissao_pendente:  comissao.total - comissao.recebida,
      custos_mes:         custos_mes.total,
      extratos_analisados: extratos.c,
      
      // Dupla visualização e indicadores adicionados
      recebido_real,
      custo_real_total,
      ebitda_real,
      margem_ebitda_real,
      mrr,
      recebiveis_restantes,
      custos_fixos_mes,
      custos_variaveis_mes,
      ebitda_projetado,
      margem_ebitda_projetada
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
