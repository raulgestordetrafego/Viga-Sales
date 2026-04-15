const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = 3000;
const BASE = '/Users/raulysdyxyamferreirasantos/Documents/viga-sales';

// ── Dados mock variados por vendedor ────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
const lastMonth = new Date(Date.now() - 30*24*3600*1000).toISOString().split('T')[0];
const twoMonths = new Date(Date.now() - 60*24*3600*1000).toISOString().split('T')[0];

const MOCK_USERS = [
  { id: 'u1', name: 'Master',         email: 'master@abcapital.com', role: 'master', status: 'active' },
  { id: 'u2', name: 'João Vendedor',  email: 'joao@abcapital.com',   role: 'user',   status: 'active' },
  { id: 'u3', name: 'Ana Silva',      email: 'ana@abcapital.com',    role: 'user',   status: 'active' },
];

const MOCK_CLIENTES = [
  { id: 'c1', name: 'Carlos Eduardo Mendes', phone: '11987654321', responsible: 'Master',
    admin_company: 'Santander', consortium_name: 'Imóvel', credit_value: 500000,
    installment_value: 4200, installments: 120, parcelas_pagas: 24,
    commission_pct: 4, status: 'ativo', status_atraso: 0, status_cancelamento: 0,
    grupo: '0042', cota: '015', contrato: 'ABC-12345', created_at: today+'T10:00:00Z' },
  { id: 'c2', name: 'Adila Borges', phone: '61998765432', responsible: 'Master',
    admin_company: 'Itaú', consortium_name: 'Automóvel', credit_value: 500000,
    installment_value: 3800, installments: 60, parcelas_pagas: 10,
    commission_pct: 4, status: 'ativo', status_atraso: 0, status_cancelamento: 0, created_at: lastMonth+'T10:00:00Z' },
  { id: 'c3', name: 'Pedro Alves', phone: '11944445555', responsible: 'João Vendedor',
    admin_company: 'Porto Seguro', consortium_name: 'Imóvel', credit_value: 800000,
    installment_value: 5200, installments: 180, parcelas_pagas: 6,
    commission_pct: 4, status: 'ativo', status_atraso: 0, status_cancelamento: 0, created_at: today+'T09:00:00Z' },
  { id: 'c4', name: 'Lúcia Ferreira', phone: '21911112222', responsible: 'João Vendedor',
    admin_company: 'Banco do Brasil', consortium_name: 'Automóvel', credit_value: 200000,
    installment_value: 2100, installments: 60, parcelas_pagas: 0,
    commission_pct: 4, status: 'atraso', status_atraso: 1, status_cancelamento: 0, created_at: twoMonths+'T10:00:00Z' },
  { id: 'c5', name: 'Rodrigo Lima', phone: '31922223333', responsible: 'Ana Silva',
    admin_company: 'Remaza', consortium_name: 'Imóvel', credit_value: 350000,
    installment_value: 3000, installments: 120, parcelas_pagas: 12,
    commission_pct: 4, status: 'ativo', status_atraso: 0, status_cancelamento: 0, created_at: lastMonth+'T10:00:00Z' },
];

const MOCK_LEADS = [
  { id: 'l1', name: 'João Silva', phone: '11911112222', pipeline_stage: 'qualificacao',
    admin_company: 'Porto Seguro', credit_value: 200000, responsible: 'Master',
    traffic_source: 'Instagram', created_at: today+'T08:00:00Z' },
  { id: 'l2', name: 'Maria Santos', phone: '21933334444', pipeline_stage: 'analise',
    admin_company: 'Banco do Brasil', credit_value: 350000, responsible: 'João Vendedor',
    created_at: lastMonth+'T10:00:00Z' },
  { id: 'l3', name: 'Fernanda Costa', phone: '31955556666', pipeline_stage: 'reuniao_agendada',
    admin_company: 'Santander', credit_value: 500000, responsible: 'Ana Silva',
    created_at: twoMonths+'T10:00:00Z' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function filterByParams(list, q) {
  let r = [...list];
  if (q.responsible) r = r.filter(x => x.responsible === q.responsible);
  if (q.date_from)   r = r.filter(x => x.created_at >= q.date_from);
  if (q.date_to)     r = r.filter(x => x.created_at.split('T')[0] <= q.date_to);
  return r;
}

function clientStats(clientes) {
  return {
    total:             clientes.length,
    ativos:            clientes.filter(c => c.status === 'ativo').length,
    em_atraso:         clientes.filter(c => c.status_atraso).length,
    cancelados:        clientes.filter(c => c.status === 'cancelado').length,
    quitados:          clientes.filter(c => c.status === 'quitado').length,
    total_credit:      clientes.reduce((s,c) => s + (c.credit_value||0), 0),
    total_commission:  clientes.reduce((s,c) => s + (c.credit_value||0) * (c.commission_pct||4) / 100, 0),
    remaining_balance: clientes.reduce((s,c) => s + ((c.installments||0)-(c.parcelas_pagas||0)) * (c.installment_value||0), 0),
    revenue_target:    3_000_000,
  };
}

function mockApi(urlPath, query, res) {
  const json = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
    return true;
  };

  // Session
  if (urlPath === '/api/ab-capital/session')
    return json({ id: 'u1', name: 'Master', email: 'master@abcapital.com', role: 'master', status: 'active' });

  if (urlPath === '/api/ab-capital/logo') return false;

  // Users
  if (urlPath === '/api/ab-capital/users') return json(MOCK_USERS);

  // Leads stats — filtrado
  if (urlPath === '/api/ab-capital/leads/stats') {
    const leads = filterByParams(MOCK_LEADS, query);
    const stageMap = {};
    leads.forEach(l => { stageMap[l.pipeline_stage] = (stageMap[l.pipeline_stage]||0)+1; });
    const stages = Object.entries(stageMap).map(([pipeline_stage, c]) => ({ pipeline_stage, c }));
    const cs = clientStats(filterByParams(MOCK_CLIENTES, query));
    return json({
      total_leads:  leads.length,
      leads_today:  leads.filter(l => l.created_at.startsWith(today)).length,
      stages,
      total_prospects: 0,
      financials: cs,
    });
  }

  // Leads list
  if (urlPath.startsWith('/api/ab-capital/leads') && !urlPath.includes('/convert') && !urlPath.includes('/upload')) {
    const seg = urlPath.replace('/api/ab-capital/leads/', '').replace('/api/ab-capital/leads', '');
    if (seg && !seg.startsWith('?')) {
      const lead = MOCK_LEADS.find(l => l.id === seg);
      return lead ? json(lead) : json({ error: 'not found' }, 404);
    }
    const leads = filterByParams(MOCK_LEADS, query);
    return json({ leads, total: leads.length, page: 1, pages: 1 });
  }

  // Clientes stats — filtrado
  if (urlPath === '/api/ab-capital/clientes/stats') {
    return json(clientStats(filterByParams(MOCK_CLIENTES, query)));
  }

  // Clientes list
  if (urlPath.startsWith('/api/ab-capital/clientes') && !urlPath.includes('/upload')) {
    const seg = urlPath.replace('/api/ab-capital/clientes/', '').replace('/api/ab-capital/clientes', '');
    if (seg && !seg.startsWith('?')) {
      const c = MOCK_CLIENTES.find(c => c.id === seg);
      return c ? json(c) : json({ error: 'not found' }, 404);
    }
    const clientes = filterByParams(MOCK_CLIENTES, query);
    return json({ clientes, total: clientes.length, page: 1, pages: 1 });
  }

  // Prospects
  if (urlPath.startsWith('/api/ab-capital/prospects'))
    return json({ prospects: [], total: 0, page: 1, pages: 1 });

  return false;
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  const parsed  = url.parse(req.url, true);
  const urlPath = parsed.pathname;
  const query   = parsed.query; // { responsible, date_from, date_to, ... }

  if (urlPath.startsWith('/api/ab-capital/')) {
    if (mockApi(urlPath, query, res)) return;
  }

  // AB Capital CRM
  if (urlPath === '/abcapital' || urlPath.startsWith('/abcapital/')) {
    const sub = urlPath.replace(/^\/abcapital\/?/, '') || 'index.html';
    const filePath = path.join(BASE, 'public', 'abcapital', sub.includes('.') ? sub : 'index.html');
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/html' });
      res.end(content); return;
    } catch (e) {}
  }

  // Landing
  const file     = urlPath === '/' ? '/landing.html' : urlPath;
  const filePath = path.join(BASE, file);
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  } catch (e) { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log('Mock server running on port ' + PORT));
