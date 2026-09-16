/**
 * Google Ads Service — descoberta das contas de anúncio acessíveis (via MCC)
 * e leitura de métricas. Espelha o metaHubService.
 *
 * Lê do env:
 *  - GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET  (reuso do GTM/Search Console)
 *  - GOOGLE_ADS_REFRESH_TOKEN    (escopo https://www.googleapis.com/auth/adwords)
 *  - GOOGLE_ADS_DEVELOPER_TOKEN  (API Center do MCC)
 *  - GOOGLE_ADS_LOGIN_CUSTOMER_ID (ID da MCC, só dígitos)
 *  - GOOGLE_ADS_API_VERSION      (default v22)
 *
 * Descoberta:
 *  1. customers:listAccessibleCustomers → contas com acesso direto
 *  2. detalhe via GAQL `customer` (login = a própria conta; fallback MCC)
 *  3. contas MCC são expandidas via GAQL `customer_client`
 */

import axios from 'axios';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let accessToken = null;
let accessExp = 0;

function clientId() { return process.env.GOOGLE_OAUTH_CLIENT_ID || ''; }
function clientSecret() { return process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''; }
function refreshToken() { return process.env.GOOGLE_ADS_REFRESH_TOKEN || ''; }
function developerToken() { return process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''; }
function loginCustomerId() { return String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/[^0-9]/g, ''); }
function apiVersion() { return process.env.GOOGLE_ADS_API_VERSION || 'v22'; }
function base() { return `https://googleads.googleapis.com/${apiVersion()}`; }

export function isConfigured() {
  return !!(clientId() && clientSecret() && refreshToken() && developerToken());
}

export function isLinkedConfigured() {
  return isConfigured() && !!loginCustomerId();
}

function errMsg(e) {
  return e?.response?.data?.error?.message
    || (Array.isArray(e?.response?.data) ? e.response.data[0]?.error?.message : null)
    || e.message;
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessExp - 60_000) return accessToken;
  const { data } = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken(),
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30_000 }
  );
  accessToken = data.access_token;
  accessExp = Date.now() + (data.expires_in || 3600) * 1000;
  return accessToken;
}

// loginId: undefined = MCC do env · null = omite o header
function buildHeaders(token, loginId) {
  const h = { Authorization: `Bearer ${token}`, 'developer-token': developerToken() };
  const lcid = loginId === undefined ? loginCustomerId() : loginId;
  if (lcid) h['login-customer-id'] = String(lcid);
  return h;
}

async function gadsGet(path, loginId = undefined, params = {}) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${base()}${path}`, {
    headers: buildHeaders(token, loginId), params, timeout: 45_000,
  });
  return data;
}

async function gadsPost(path, body, loginId = undefined) {
  const token = await getAccessToken();
  const { data } = await axios.post(`${base()}${path}`, body, {
    headers: { ...buildHeaders(token, loginId), 'Content-Type': 'application/json' }, timeout: 60_000,
  });
  return data;
}

/**
 * GAQL via searchStream. Tenta o login informado (ou MCC do env) e, se der
 * 403, repete usando a própria conta como login (contas fora da MCC).
 */
async function searchStream(customerId, query, login) {
  const first = login === undefined ? (loginCustomerId() || customerId) : login;
  const attempts = [first];
  if (String(first) !== String(customerId)) attempts.push(customerId);
  let lastErr;
  for (const l of attempts) {
    try {
      const data = await gadsPost(`/customers/${customerId}/googleAds:searchStream`, { query }, l);
      const chunks = Array.isArray(data) ? data : [data];
      return chunks.flatMap(c => c.results || []);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function getCustomerInfo(id) {
  const q = 'SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code, customer.time_zone, customer.status FROM customer';
  for (const login of [id, loginCustomerId() || id]) {
    try {
      const rows = await searchStream(id, q, login);
      if (rows[0]?.customer) return rows[0].customer;
    } catch { /* tenta o próximo login */ }
  }
  return null;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Lista todas as contas de anúncio acessíveis (diretas + filhas das MCC).
 * @returns {Promise<Array<{id,name,currency,timezone,manager,status,parentId?}>>}
 */
export async function listAdAccounts() {
  if (!isConfigured()) return [];
  const byId = new Map();
  const add = (c) => { if (c?.id && !byId.has(String(c.id))) byId.set(String(c.id), c); };

  try {
    const res = await gadsGet('/customers:listAccessibleCustomers', null);
    const ids = (res.resourceNames || []).map(n => String(n).split('/').pop()).filter(Boolean);

    for (const id of ids) {
      const cust = await getCustomerInfo(id);
      const rec = cust ? {
        id,
        name: cust.descriptiveName || `Conta ${id}`,
        currency: cust.currencyCode || null,
        timezone: cust.timeZone || null,
        manager: !!cust.manager,
        status: cust.status || null,
      } : { id, name: `Conta ${id}`, currency: null, timezone: null, manager: false, status: null };
      add(rec);

      if (rec.manager) {
        try {
          const rows = await searchStream(id,
            `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.level
             FROM customer_client WHERE customer_client.status = 'ENABLED'`, id);
          for (const r of rows) {
            const cc = r.customerClient || {};
            if (String(cc.id) === String(id)) continue; // não duplica a própria MCC
            add({
              id: String(cc.id),
              name: cc.descriptiveName || `Conta ${cc.id}`,
              currency: cc.currencyCode || null,
              timezone: cc.timeZone || null,
              manager: !!cc.manager,
              status: cc.status || null,
              parentId: id,
            });
          }
        } catch (e) {
          console.warn(`[GoogleAds] customer_client ${id}:`, errMsg(e));
        }
      }
    }
  } catch (e) {
    console.error('[GoogleAds] listAdAccounts:', errMsg(e));
    return [];
  }

  return [...byId.values()].sort(
    (a, b) => (a.manager === b.manager ? 0 : a.manager ? 1 : -1) || norm(a.name).localeCompare(norm(b.name))
  );
}

/**
 * Métricas por campanha de uma conta (GAQL), para o Hub/relatórios.
 */
export async function fetchCampaigns(customerId, { since, until } = {}) {
  const id = String(customerId || '').replace(/[^0-9]/g, '');
  if (!id || !isConfigured()) return [];
  const start = since || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const end = until || new Date().toISOString().slice(0, 10);
  try {
    const rows = await searchStream(id,
      `SELECT campaign.id, campaign.name, campaign.status,
              metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions
       FROM campaign
       WHERE segments.date BETWEEN '${start}' AND '${end}'
       ORDER BY metrics.cost_micros DESC`);
    const map = new Map();
    for (const r of rows) {
      const c = r.campaign || {};
      const m = r.metrics || {};
      const key = String(c.id);
      const prev = map.get(key) || {
        id: key, name: c.name || '—', status: c.status || null,
        spend: 0, impressions: 0, clicks: 0, conversions: 0,
      };
      prev.spend += parseInt(m.costMicros || 0, 10) / 1e6;
      prev.impressions += parseInt(m.impressions || 0, 10);
      prev.clicks += parseInt(m.clicks || 0, 10);
      prev.conversions += parseFloat(m.conversions || 0);
      map.set(key, prev);
    }
    return [...map.values()].map(c => ({
      ...c,
      spend: Number(c.spend.toFixed(2)),
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      cpa: c.conversions > 0 ? c.spend / c.conversions : null,
    }));
  } catch (e) {
    console.error('[GoogleAds] fetchCampaigns:', errMsg(e));
    return [];
  }
}

export default { listAdAccounts, fetchCampaigns, isConfigured, isLinkedConfigured };
