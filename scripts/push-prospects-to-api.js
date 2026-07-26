#!/usr/bin/env node
/**
 * Lê os prospects já importados no SQLite local e os envia para a API de produção
 * do Viga Sales (vigasales.shop), criando a campanha lá se necessário.
 *
 * Uso:
 *   node scripts/push-prospects-to-api.js \
 *     --campaign-id=<id-local> \
 *     --api-url=https://vigasales.shop \
 *     [--batch=100] [--db=db/crm.sqlite] [--dry-run]
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const CAMPAIGN_ID = args['campaign-id'];
const API_URL = (args['api-url'] || 'https://vigasales.shop').replace(/\/$/, '');
const BATCH = Number(args['batch'] || 100);
const DB_PATH = path.resolve(args.db || path.join(__dirname, '..', 'db', 'crm.sqlite'));
const DRY = !!args['dry-run'];

if (!CAMPAIGN_ID) {
  console.error('Uso: --campaign-id=<uuid> [--api-url=https://vigasales.shop] [--batch=100] [--dry-run]');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
const campaign = db.prepare('SELECT * FROM prospecting_campaigns WHERE id = ?').get(CAMPAIGN_ID);
if (!campaign) { console.error('Campanha não encontrada no SQLite local:', CAMPAIGN_ID); process.exit(1); }

const prospects = db.prepare("SELECT * FROM prospects WHERE campaign_id = ? AND source = 'xlsx_cnpja'").all(CAMPAIGN_ID);
console.log(`Campanha: "${campaign.name}" | ${prospects.length} prospects no SQLite local`);

if (DRY) {
  console.log('DRY-RUN. Primeiros 3:');
  console.log(JSON.stringify(prospects.slice(0, 3).map(p => ({ name: p.name, phone: p.phone, company: p.company })), null, 2));
  db.close(); process.exit(0);
}

// 1. Criar campanha em produção
console.log(`\n→ Criando campanha em ${API_URL}...`);
const campRes = await fetch(`${API_URL}/api/prospects/campaigns`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: campaign.name,
    segment: campaign.segment,
    city: campaign.city,
    daily_limit: campaign.daily_limit,
    use_ai: 0,
    message_template: null,
  }),
});
if (!campRes.ok) {
  const txt = await campRes.text();
  console.error('Erro ao criar campanha:', campRes.status, txt);
  process.exit(1);
}
const remoteCampaign = await campRes.json();
console.log(`  campanha criada em produção: ${remoteCampaign.id}`);

// 2. Enviar prospects em lotes
const list = prospects.map(p => ({
  name: p.name, phone: p.phone, email: p.email, company: p.company,
  segment: p.segment, city: p.city,
}));

let inserted = 0, skipped = 0;
for (let i = 0; i < list.length; i += BATCH) {
  const chunk = list.slice(i, i + BATCH);
  const r = await fetch(`${API_URL}/api/prospects/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospects: chunk, campaign_id: remoteCampaign.id, source: 'xlsx_cnpja' }),
  });
  if (!r.ok) { console.error('Erro lote', i, r.status, await r.text()); continue; }
  const res = await r.json();
  inserted += res.inserted || 0;
  skipped += res.skipped || 0;
  console.log(`  lote ${i + chunk.length}/${list.length} — inseridos: ${inserted} duplicados: ${skipped}`);
}

console.log(`\n✓ Concluído: inseridos=${inserted} duplicados=${skipped}`);
console.log(`  campaign_id em PRODUÇÃO = ${remoteCampaign.id}`);
console.log(`\n  Cole esse campaign_id no nó "Configurações" do flow no n8n:`);
console.log(`  ${remoteCampaign.id}`);
db.close();
