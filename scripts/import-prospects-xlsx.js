#!/usr/bin/env node
/**
 * Importa prospects de arquivo XLSX da CNPJá para a tabela `prospects`.
 *
 * Uso:
 *   node scripts/import-prospects-xlsx.js \
 *     --file="/caminho/arquivo.xlsx" \
 *     --campaign="Engenheiros 2020_2021" \
 *     [--segment=engenharia] [--city=Brasília] [--daily-limit=40] \
 *     [--db=db/crm.sqlite] [--dry-run] \
 *     [--enrich-api] [--mobile-only] [--enrich-rps=2]
 *
 * - Lê aba "Estabelecimentos" (linha 2 em diante é dado)
 * - Faz JOIN com aba "Sócios" por CNPJ para obter nome da pessoa (1º sócio)
 * - Normaliza telefone, valida (mín 10 dígitos com DDD), deduplica por phone
 * - Cria/reaproveita campanha em `prospecting_campaigns`
 * - Insere em `prospects` com source='xlsx_cnpja'
 *
 * Flags de enrichment (API pública CNPJá — open.cnpja.com):
 *   --enrich-api       Consulta a API para cada CNPJ (preenche tel faltante, cruza sócios, marca tipo de telefone)
 *   --mobile-only      Só insere prospects cujo telefone é celular (exige --enrich-api para validar)
 *   --enrich-rps=N     Requests/segundo ao consultar a API (default 2)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

if (!args.file || !args.campaign) {
  console.error('Uso: --file=<xlsx> --campaign="Nome" [--segment=...] [--city=...] [--daily-limit=40] [--db=db/crm.sqlite] [--dry-run]');
  process.exit(1);
}

const DB_PATH = path.resolve(args.db || path.join(__dirname, '..', 'db', 'crm.sqlite'));
const DRY = !!args['dry-run'];

function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\D/g, '');
  if (!s) return null;
  if (s.startsWith('55') && s.length >= 12) s = s.slice(2);
  if (s.length < 10 || s.length > 11) return null;
  return '55' + s;
}

function pickFirstName(fullName) {
  if (!fullName) return null;
  const parts = String(fullName).trim().split(/\s+/);
  const first = parts[0] || '';
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

console.log(`→ Lendo ${args.file}`);
const wb = XLSX.readFile(args.file);
const estSheet = wb.Sheets['Estabelecimentos'];
const socSheet = wb.Sheets['Sócios'];
if (!estSheet) { console.error('Aba "Estabelecimentos" não encontrada'); process.exit(1); }

const estRows = XLSX.utils.sheet_to_json(estSheet, { header: 1, defval: null });
const socRows = socSheet ? XLSX.utils.sheet_to_json(socSheet, { header: 1, defval: null }) : [];

// Header em estRows[1]; dados em 2+. Idem para sócios (header em [1]).
const EST_COL = {
  cnpj: 0, razao: 1, porte: 3, nome_fantasia: 10, telefone: 19, telefone2: 20,
  email: 21, cidade: 27, estado: 28, atividade: 33,
};
const SOC_COL = { cnpj: 0, nome: 4 };

// Mapa CNPJ → primeiro nome do sócio
const socByCnpj = new Map();
for (let i = 2; i < socRows.length; i++) {
  const r = socRows[i]; if (!r) continue;
  const cnpj = r[SOC_COL.cnpj]; const nome = r[SOC_COL.nome];
  if (!cnpj || !nome) continue;
  if (!socByCnpj.has(String(cnpj))) socByCnpj.set(String(cnpj), nome);
}

// Montar prospects
const prospects = [];
let skipNoPhone = 0, skipBadPhone = 0;
for (let i = 2; i < estRows.length; i++) {
  const r = estRows[i]; if (!r) continue;
  const tel = r[EST_COL.telefone] || r[EST_COL.telefone2];
  if (!tel) { skipNoPhone++; continue; }
  const phone = normalizePhone(tel);
  if (!phone) { skipBadPhone++; continue; }
  const cnpj = r[EST_COL.cnpj] ? String(r[EST_COL.cnpj]) : null;
  const socio = cnpj ? socByCnpj.get(cnpj) : null;
  const personFirst = pickFirstName(socio);
  const razao = r[EST_COL.razao] || null;
  const fantasia = r[EST_COL.nome_fantasia] && r[EST_COL.nome_fantasia] !== '-' ? r[EST_COL.nome_fantasia] : null;
  prospects.push({
    phone,
    name: personFirst || pickFirstName(fantasia) || null,
    company: fantasia || razao,
    email: r[EST_COL.email] && r[EST_COL.email] !== '-' ? r[EST_COL.email] : null,
    city: r[EST_COL.cidade] || null,
    segment: r[EST_COL.atividade] || null,
    raw: {
      cnpj, razao_social: razao, porte: r[EST_COL.porte],
      estado: r[EST_COL.estado], socio_nome: socio,
    },
  });
}

console.log(`  ${estRows.length - 2} registros lidos | ${prospects.length} com tel no XLSX | ${skipNoPhone} sem tel | ${skipBadPhone} tel inválido`);

// Enrichment via API pública CNPJá (open.cnpja.com)
const ENRICH = !!args['enrich-api'];
const MOBILE_ONLY = !!args['mobile-only'];
const RPS = Number(args['enrich-rps'] || 2);

if (ENRICH) {
  console.log(`→ Enrichment CNPJá ligado (rps=${RPS}${MOBILE_ONLY ? ', mobile-only' : ''})`);

  // Se mobile-only, também enriquecer quem já tem telefone pra validar tipo.
  // Caso contrário, enriquecer apenas quem não tem telefone no XLSX.
  // Para isso precisamos também considerar linhas do XLSX que foram skipped por falta de tel.
  const targets = [];
  if (MOBILE_ONLY) {
    for (const p of prospects) targets.push(p);
  }
  // Adicionar linhas sem telefone no XLSX (pra tentar recuperar via API)
  for (let i = 2; i < estRows.length; i++) {
    const r = estRows[i]; if (!r) continue;
    if (r[EST_COL.telefone] || r[EST_COL.telefone2]) continue; // já tem tel
    const cnpj = r[EST_COL.cnpj] ? String(r[EST_COL.cnpj]) : null;
    if (!cnpj) continue;
    const razao = r[EST_COL.razao] || null;
    const fantasia = r[EST_COL.nome_fantasia] && r[EST_COL.nome_fantasia] !== '-' ? r[EST_COL.nome_fantasia] : null;
    targets.push({
      phone: null, name: null, company: fantasia || razao,
      email: null, city: r[EST_COL.cidade] || null,
      segment: r[EST_COL.atividade] || null,
      raw: { cnpj, razao_social: razao, estado: r[EST_COL.estado] },
      _needsPhone: true,
    });
  }

  const delayMs = Math.ceil(1000 / RPS);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let ok = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const cnpj = t.raw?.cnpj; if (!cnpj) continue;
    try {
      const res = await fetch(`https://open.cnpja.com/office/${cnpj}`, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) { fail++; continue; }
      const data = await res.json();
      // telefones
      const phones = Array.isArray(data.phones) ? data.phones : [];
      const mobile = phones.find(p => p.type === 'MOBILE');
      const landline = phones.find(p => p.type === 'LANDLINE');
      const apiPhoneRaw = mobile ? `${mobile.area}${mobile.number}` : (landline ? `${landline.area}${landline.number}` : null);
      const apiPhone = apiPhoneRaw ? normalizePhone(apiPhoneRaw) : null;
      // preencher tel faltante
      if (t._needsPhone && apiPhone) {
        t.phone = apiPhone;
        t.raw.phone_type = mobile ? 'MOBILE' : 'LANDLINE';
        prospects.push(t);
      } else if (t.phone) {
        // Cruza tipo (se o tel do XLSX bate com algum tel da API, pegamos o tipo)
        const match = phones.find(p => normalizePhone(`${p.area}${p.number}`) === t.phone);
        if (match) t.raw.phone_type = match.type;
        else if (mobile) t.raw.phone_type = 'UNKNOWN_XLSX';
      }
      // sócios
      const members = data.company?.members || [];
      if (!t.name && members.length) t.name = pickFirstName(members[0].person?.name);
      if (!t.raw.socio_nome && members.length) t.raw.socio_nome = members[0].person?.name;
      ok++;
    } catch (e) {
      fail++;
    }
    if (i % 50 === 0) console.log(`  enrichment ${i}/${targets.length} (ok=${ok} fail=${fail})`);
    await sleep(delayMs);
  }
  console.log(`  enrichment done: ok=${ok} fail=${fail}`);

  if (MOBILE_ONLY) {
    const before = prospects.length;
    for (let i = prospects.length - 1; i >= 0; i--) {
      if (prospects[i].raw?.phone_type !== 'MOBILE') prospects.splice(i, 1);
    }
    console.log(`  mobile-only: ${before} → ${prospects.length}`);
  }
}

if (DRY) {
  console.log('DRY-RUN — amostra dos 3 primeiros:');
  console.log(JSON.stringify(prospects.slice(0, 3), null, 2));
  process.exit(0);
}

console.log(`→ Abrindo banco ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Campanha (reaproveita se já existe por nome)
let campaign = db.prepare('SELECT * FROM prospecting_campaigns WHERE name = ?').get(args.campaign);
if (!campaign) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO prospecting_campaigns
    (id, name, segment, city, daily_limit, use_ai, status, last_reset_date)
    VALUES (?, ?, ?, ?, ?, 0, 'active', ?)`
  ).run(
    id, args.campaign, args.segment || null, args.city || null,
    Number(args['daily-limit'] || 40), new Date().toISOString().slice(0, 10)
  );
  campaign = db.prepare('SELECT * FROM prospecting_campaigns WHERE id = ?').get(id);
  console.log(`  campanha criada: ${campaign.id}`);
} else {
  console.log(`  campanha reaproveitada: ${campaign.id} (${campaign.name})`);
}

const insertStmt = db.prepare(`INSERT INTO prospects
  (id, name, phone, email, company, segment, city, source, campaign_id, raw_data)
  VALUES (@id, @name, @phone, @email, @company, @segment, @city, 'xlsx_cnpja', @campaign_id, @raw_data)`);
const existsStmt = db.prepare('SELECT 1 FROM prospects WHERE phone = ?');

let inserted = 0, dup = 0, errors = 0;
const tx = db.transaction((list) => {
  for (const p of list) {
    try {
      if (existsStmt.get(p.phone)) { dup++; continue; }
      insertStmt.run({
        id: crypto.randomUUID(),
        name: p.name, phone: p.phone, email: p.email, company: p.company,
        segment: p.segment, city: p.city, campaign_id: campaign.id,
        raw_data: JSON.stringify(p.raw),
      });
      inserted++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.error('  erro:', e.message, p.phone);
    }
  }
});
tx(prospects);

console.log(`✓ inseridos: ${inserted} | duplicados: ${dup} | erros: ${errors}`);
console.log(`  campaign_id = ${campaign.id}`);
db.close();
