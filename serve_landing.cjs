const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE = '/Users/raulysdyxyamferreirasantos/Documents/viga-sales';

// ── Mock API para preview local ───────────────────────────────────────────────
const MOCK_CLIENTES = [
  { id: 'c1', name: 'Carlos Eduardo Mendes', phone: '11987654321', email: 'carlos@email.com',
    admin_company: 'Santander', consortium_name: 'Imóvel', credit_value: 500000,
    installment_value: 4200, installments: 120, parcelas_pagas: 24,
    commission_pct: 4, status: 'ativo', status_atraso: 0, status_cancelamento: 0,
    grupo: '0042', cota: '015', contrato: 'ABC-12345', responsible: 'Master',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'c2', name: 'Adila Borges', phone: '61998765432', email: 'adila@email.com',
    admin_company: 'Itaú', consortium_name: 'Automóvel', credit_value: 500000,
    installment_value: 3800, installments: 60, parcelas_pagas: 10,
    commission_pct: 4, status: 'ativo', status_atraso: 0, status_cancelamento: 0,
    responsible: 'Master', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const MOCK_LEADS = [
  { id: 'l1', name: 'João Silva', phone: '11911112222', email: 'joao@email.com',
    pipeline_stage: 'qualificacao', admin_company: 'Porto Seguro', credit_value: 200000,
    traffic_source: 'Instagram', responsible: 'Master',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'l2', name: 'Maria Santos', phone: '21933334444', pipeline_stage: 'analise',
    admin_company: 'Banco do Brasil', credit_value: 350000,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

function mockApi(urlPath, res) {
  const json = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
    return true;
  };

  // Session / Auth
  if (urlPath === '/api/ab-capital/session')
    return json({ id: 'u1', name: 'Master', email: 'master@abcapital.com', role: 'master', status: 'active' });
  if (urlPath === '/api/ab-capital/logo') return false; // serve como arquivo

  // Leads stats
  if (urlPath === '/api/ab-capital/leads/stats')
    return json({ total_leads: 2, leads_today: 1, stages: [
      { pipeline_stage: 'qualificacao', c: 1 },
      { pipeline_stage: 'analise', c: 1 },
    ], financials: { total_credit: 1000000, total_commission: 40000, remaining_balance: 0, overdue_count: 0, cancelled_count: 0, won_count: 2, revenue_target: 3000000 } });

  // Leads list
  if (urlPath.startsWith('/api/ab-capital/leads') && !urlPath.includes('/convert') && !urlPath.includes('/upload')) {
    const id = urlPath.replace('/api/ab-capital/leads/', '').replace('/api/ab-capital/leads', '');
    if (id && id !== '' && !id.startsWith('?')) {
      const lead = MOCK_LEADS.find(l => l.id === id);
      return lead ? json(lead) : json({ error: 'not found' }, 404);
    }
    return json({ leads: MOCK_LEADS, total: MOCK_LEADS.length, page: 1, pages: 1 });
  }

  // Clientes stats
  if (urlPath === '/api/ab-capital/clientes/stats')
    return json({ ativos: 2, em_atraso: 0, total_credit: 1000000, total_commission: 40000, remaining_balance: 0 });

  // Clientes list
  if (urlPath.startsWith('/api/ab-capital/clientes') && !urlPath.includes('/upload')) {
    const id = urlPath.replace('/api/ab-capital/clientes/', '').replace('/api/ab-capital/clientes', '');
    if (id && id !== '' && !id.startsWith('?')) {
      const c = MOCK_CLIENTES.find(c => c.id === id);
      return c ? json(c) : json({ error: 'not found' }, 404);
    }
    return json({ clientes: MOCK_CLIENTES, total: MOCK_CLIENTES.length, page: 1, pages: 1 });
  }

  // Users
  if (urlPath === '/api/ab-capital/users')
    return json([
      { id: 'u1', name: 'Master', email: 'master@abcapital.com', role: 'master', status: 'active' },
      { id: 'u2', name: 'João Vendedor', email: 'joao@abcapital.com', role: 'user', status: 'active' },
      { id: 'u3', name: 'Ana Silva', email: 'ana@abcapital.com', role: 'user', status: 'active' },
    ]);

  // Prospects
  if (urlPath.startsWith('/api/ab-capital/prospects'))
    return json({ prospects: [], total: 0, page: 1, pages: 1 });

  return false;
}

http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  let urlPath = req.url.split('?')[0];

  // Mock API (ignora querystring para matching)
  if (urlPath.startsWith('/api/ab-capital/')) {
    if (mockApi(urlPath, res)) return;
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
      res.end(content);
      return;
    } catch (e) {}
  }

  // Landing page
  const file = urlPath === '/' ? '/landing.html' : urlPath;
  const filePath = path.join(BASE, file);
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  } catch (e) {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log('Server running on port ' + PORT));
