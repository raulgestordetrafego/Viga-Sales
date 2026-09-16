#!/usr/bin/env node
/**
 * Sincroniza os blocos "🔌 Contas de Anúncios" das notas do Obsidian com a
 * fonte da verdade (`hub_clientes` + descoberta Meta/Google no CRM).
 *
 * Uso:
 *   node scripts/sync-obsidian-blocks.mjs           # dry-run (mostra o que muda)
 *   node scripts/sync-obsidian-blocks.mjs --write    # grava nas notas
 *
 * Só substitui o conteúdo entre os marcadores:
 *   <!-- BEGIN:AUTO contas --> ... <!-- END:AUTO contas -->
 * As notas humanas fora dos marcadores são preservadas.
 *
 * Requer VIGA_INTERNAL_TOKEN no .env (local) para autenticar na API do CRM.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VAULT = process.env.OBSIDIAN_VAULT
  || path.join(os.homedir(), 'Documents/Obsidian/obsidian/00 - Viga Sales');
const API = process.env.CRM_API_BASE || 'https://vigasales.shop/api';

// ── mapa: arquivo da nota ← clientes do Hub ──────────────────────────────────
const PROJECTS = [
  { file: '01 - Aura Lava Jato/01 - Aura Lava Jato.md', clients: ['Aura Lava Jato'] },
  { file: '01 - Casa da Fé/01 - Casa da Fé.md', clients: ['Casa da Fé'] },
  { file: '01 - Bora Costurar/01 - Bora Costurar.md', clients: [
    'Bora Costurar 01 - Suerlania e Valeria',
    'Bora Costurar 02 - Suerlania e Romédio',
    'Bora Costurar 04 - Suerlania Ecommerce',
  ] },
  { file: '01 - Total Maq/01 - Total Maq.md', clients: ['Total Maq'] },
  { file: '01 - Alfa Film/01 - Alfa Film.md', clients: ['Alfa Film'] },
  { file: '01 - Refrigeração Brasília/01 - Refrigeração Brasília.md', clients: ['Refrigeração Brasília'] },
  // Ab Capital é a BM da agência (não é cliente no Hub) — bloco manual, fora da automação.
];

const BEGIN = '<!-- BEGIN:AUTO contas -->';
const END = '<!-- END:AUTO contas -->';

function env(key) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    const line = txt.split('\n').find(l => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim() : '';
  } catch { return ''; }
}

function gStatus(s) {
  const m = { ENABLED: 'Ativa', SUSPENDED: 'Suspensa', CANCELED: 'Cancelada', CLOSED: 'Encerrada', PAUSED: 'Pausada' };
  return m[String(s || '').toUpperCase()] || (s || '—');
}

function blockFor(group, clients) {
  const rows = [];
  for (const c of clients) {
    for (const a of (c.meta || [])) {
      rows.push(`| Meta Ads | ${a.name || c.nome} | \`act_${a.id}\` | ${a.statusLabel || '—'} | \`hub_clientes.metaAdAccountId\` |`);
    }
    for (const a of (c.google || [])) {
      rows.push(`| Google Ads | ${a.name || c.nome} | \`${a.id}\` | ${gStatus(a.status)} | \`hub_clientes.googleAdsAccountId\` |`);
    }
  }
  if (!rows.length) rows.push('| — | — | — | — | — |');
  const now = new Date().toISOString().slice(0, 10);
  return [
    BEGIN,
    '> Referência técnica: [[05 - Integrações de Contas de Anúncios (Meta e Google)]]',
    '',
    '| Plataforma | Conta | ID | Status | Vínculo |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `<sub>Gerado por \`scripts/sync-obsidian-blocks.mjs\` em ${now} — não editar à mão.</sub>`,
    END,
  ].join('\n');
}

async function main() {
  const token = process.env.VIGA_INTERNAL_TOKEN || env('VIGA_INTERNAL_TOKEN');
  if (!token) { console.error('Falta VIGA_INTERNAL_TOKEN (env ou .env).'); process.exit(1); }

  const { data } = await axios.get(`${API}/hub/accounts-map`, {
    params: { token }, timeout: 45000,
  });
  const byName = new Map((data.clients || []).map(c => [c.nome, c]));
  console.log(`accounts-map: ${data.clients?.length || 0} clientes · ${data.generatedAt}\n`);

  let changed = 0;
  for (const proj of PROJECTS) {
    const p = path.join(VAULT, proj.file);
    if (!fs.existsSync(p)) { console.log(`— ausente: ${proj.file}`); continue; }
    const clients = proj.clients.map(n => byName.get(n)).filter(Boolean);
    const missing = proj.clients.filter(n => !byName.get(n));
    if (missing.length) console.log(`  ⚠ cliente não encontrado no Hub: ${missing.join(', ')}`);

    const newBlock = blockFor(proj.clients, clients);
    const txt = fs.readFileSync(p, 'utf-8');
    const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
    if (!re.test(txt)) { console.log(`  ⚠ sem marcadores: ${proj.file}`); continue; }
    const out = txt.replace(re, newBlock);

    if (out === txt) { console.log(`  = ${proj.file} (sem mudança)`); continue; }
    changed++;
    console.log(`  ~ ${proj.file}`);
    if (WRITE) fs.writeFileSync(p, out);
  }
  console.log(`\n${changed} arquivo(s) ${WRITE ? 'atualizado(s)' : 'a mudar'}${WRITE ? '' : ' (dry-run — use --write)'}.`);
}

main().catch(e => { console.error('ERRO:', e?.response?.data || e.message); process.exit(1); });
