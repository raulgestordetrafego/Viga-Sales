/**
 * Meta Hub Service — leitura on-demand da Meta Marketing API para o Hub.
 *
 * Usa o token de System User do servidor (env META_ADS_ACCESS_TOKEN), que enxerga
 * as contas de anúncio compartilhadas com a BM AB Capital. Assim o Hub não precisa
 * guardar token por cliente — só o `metaAdAccountId`.
 *
 * Espelha a lógica que antes rodava no frontend (hub/src/services/metaApi.ts).
 */

import axios from 'axios';

const GRAPH = 'https://graph.facebook.com/v26.0';

function token() { return process.env.META_ADS_ACCESS_TOKEN || ''; }
export function isConfigured() { return !!token(); }

function cleanAccount(accountId) {
  return String(accountId || '').replace(/[^0-9]/g, '').trim();
}

// Códigos de account_status da Graph API → rótulo legível
const ACCOUNT_STATUS = {
  1: 'Ativa',
  2: 'Desativada',
  3: 'Não paga',
  7: 'Em análise',
  8: 'Aguardando pagamento',
  9: 'Período de carência',
  100: 'Encerramento pendente',
  101: 'Fechada',
  201: 'Ativa',
  202: 'Fechada',
};

export function accountStatusLabel(status) {
  return ACCOUNT_STATUS[Number(status)] || 'Desconhecido';
}

const normalizeText = (text) => String(text || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Single Result Rule — identifica o tipo de conversão e extrai APENAS o maior
 * valor entre eventos redundantes.
 */
export function extractActions(actions = [], campaignName = '') {
  const am = new Map();
  (actions || []).forEach(a => am.set(a.action_type, parseInt(a.value || '0', 10)));
  const name = normalizeText(campaignName);

  if (name.includes('lead form') || name.includes('formulario') || name.includes('cadastro')) {
    const lead = am.get('lead') || 0;
    const grouped = am.get('onsite_conversion.lead_grouped') || 0;
    return { total_leads: Math.max(lead, grouped) };
  }
  if (name.includes('mensagens') || name.includes('whatsapp') || name.includes('msg') || name.includes('zap') || name.includes('direct')) {
    const msg7d = am.get('onsite_conversion.messaging_conversation_started_7d') || 0;
    const msg1d = am.get('onsite_conversion.messaging_conversation_started_1d') || 0;
    const msgLegacy = am.get('messaging_conversation_started_7d') || 0;
    const firstReply = am.get('onsite_conversion.messaging_first_reply') || 0;
    return { total_leads: Math.max(msg7d, msg1d, msgLegacy, firstReply) };
  }
  if (name.includes('site') || name.includes('lp') || name.includes('landing') || name.includes('venda')) {
    const pixelLead = am.get('offsite_conversion.fb_pixel_lead') || 0;
    const completeReg = am.get('complete_registration') || 0;
    const contact = am.get('contact') || 0;
    const purchase = am.get('offsite_conversion.fb_pixel_purchase') || 0;
    return { total_leads: Math.max(pixelLead, completeReg, contact, purchase) };
  }

  const catForm = Math.max(am.get('lead') || 0, am.get('onsite_conversion.lead_grouped') || 0);
  const catMsg = Math.max(am.get('onsite_conversion.messaging_conversation_started_7d') || 0, am.get('onsite_conversion.messaging_first_reply') || 0);
  const catSite = Math.max(am.get('offsite_conversion.fb_pixel_lead') || 0, am.get('complete_registration') || 0);
  return { total_leads: Math.max(catForm, catMsg, catSite) };
}

async function graphGet(path, params = {}) {
  const { data } = await axios.get(`${GRAPH}/${path}`, {
    params: { ...params, access_token: token() },
    timeout: 45000,
  });
  return data;
}

function timeRange(range) {
  if (range?.since && range?.until) {
    return { time_range: JSON.stringify({ since: range.since, until: range.until }) };
  }
  return { date_preset: 'this_month' };
}

export async function fetchInsights(accountId, { range, filterKeyword, filterType } = {}) {
  const cleanId = cleanAccount(accountId);
  if (!cleanId || !token()) return null;
  try {
    const data = await graphGet(`act_${cleanId}/insights`, {
      level: 'campaign',
      fields: 'impressions,clicks,reach,frequency,spend,cpc,ctr,cpm,actions,campaign_name',
      limit: 500,
      ...timeRange(range),
    });
    if (data.error || !Array.isArray(data.data) || data.data.length === 0) return null;

    const initialTotals = { spend: 0, leads: 0, impressions: 0, clicks: 0, reach: 0 };
    const totals = data.data.reduce((acc, camp) => {
      if (filterKeyword) {
        const keyword = normalizeText(filterKeyword);
        const campName = normalizeText(camp.campaign_name || '');
        if (filterType === 'impressions') {
          const threshold = parseFloat(filterKeyword);
          const campImp = parseInt(camp.impressions || '0', 10);
          if (!isNaN(threshold) && campImp < threshold) return acc;
        } else if (!campName.includes(keyword)) {
          return acc;
        }
      }
      const { total_leads } = extractActions(camp.actions, camp.campaign_name);
      acc.spend += parseFloat(camp.spend || '0');
      acc.leads += total_leads;
      acc.impressions += parseInt(camp.impressions || '0', 10);
      acc.clicks += parseInt(camp.clicks || '0', 10);
      acc.reach += parseInt(camp.reach || '0', 10);
      return acc;
    }, initialTotals);

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    const frequency = totals.reach > 0 ? totals.impressions / totals.reach : 0;

    return {
      ...totals,
      ctr, cpc, cpm, frequency,
      date_start: range?.since || (data.data[0]?.date_start || ''),
      date_stop: range?.until || (data.data[0]?.date_stop || ''),
      currency: 'BRL',
    };
  } catch (e) {
    console.error('[MetaHub] insights:', e?.response?.data?.error?.message || e.message);
    return null;
  }
}

export async function fetchCampaigns(accountId, { range, filterKeyword } = {}) {
  const cleanId = cleanAccount(accountId);
  if (!cleanId || !token()) return [];
  try {
    const [campRes, insRes] = await Promise.all([
      graphGet(`act_${cleanId}/campaigns`, { fields: 'id,name,status', limit: 500 }),
      graphGet(`act_${cleanId}/insights`, {
        level: 'campaign',
        fields: 'campaign_id,spend,actions,impressions,clicks,reach',
        limit: 1000,
        ...timeRange(range),
      }),
    ]);
    if (campRes.error || insRes.error) return [];

    const insightsMap = new Map();
    (insRes.data || []).forEach(item => insightsMap.set(item.campaign_id, item));

    return (campRes.data || []).map(camp => {
      const insight = insightsMap.get(camp.id) || {};
      const { total_leads } = extractActions(insight.actions, camp.name);
      const spend = parseFloat(insight.spend || '0');
      const impressions = parseInt(insight.impressions || '0', 10);
      const clicks = parseInt(insight.clicks || '0', 10);
      const reach = parseInt(insight.reach || '0', 10);
      return {
        id: camp.id,
        name: camp.name,
        status: camp.status,
        spend,
        leads: total_leads,
        impressions,
        clicks,
        reach,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        frequency: reach > 0 ? impressions / reach : 0,
        category: 'OUTRO',
      };
    }).filter(c => !filterKeyword || normalizeText(c.name).includes(normalizeText(filterKeyword)));
  } catch (e) {
    console.error('[MetaHub] campaigns:', e?.response?.data?.error?.message || e.message);
    return [];
  }
}

export async function fetchDailyHistory(accountId, { range, filterKeyword } = {}) {
  const cleanId = cleanAccount(accountId);
  if (!cleanId || !token()) return [];
  try {
    const data = await graphGet(`act_${cleanId}/insights`, {
      level: 'campaign',
      fields: 'spend,actions,date_start,campaign_name',
      time_increment: 1,
      limit: 2000,
      ...timeRange(range),
    });
    if (data.error || !Array.isArray(data.data)) return [];

    const aggregatedByDate = data.data.reduce((acc, item) => {
      const campaignName = item.campaign_name || '';
      if (filterKeyword && !normalizeText(campaignName).includes(normalizeText(filterKeyword))) return acc;
      const date = item.date_start;
      const { total_leads } = extractActions(item.actions, campaignName);
      const spend = parseFloat(item.spend || '0');
      if (!acc[date]) acc[date] = { spend: 0, leads: 0 };
      acc[date].spend += spend;
      acc[date].leads += total_leads;
      return acc;
    }, {});

    return Object.keys(aggregatedByDate).map(date => ({
      id: `${cleanId}_${date}`,
      clienteId: '',
      data: date,
      canal: 'Meta',
      spend: aggregatedByDate[date].spend,
      leads: aggregatedByDate[date].leads,
      cpl: aggregatedByDate[date].leads > 0 ? aggregatedByDate[date].spend / aggregatedByDate[date].leads : 0,
    })).sort((a, b) => a.data.localeCompare(b.data));
  } catch (e) {
    console.error('[MetaHub] daily:', e?.response?.data?.error?.message || e.message);
    return [];
  }
}

/**
 * Lista todas as contas de anúncio visíveis para o token (System User).
 * É assim que o Hub descobre as contas sem precisar digitar o ID manualmente.
 */
export async function listAdAccounts() {
  if (!token()) return [];
  const fields = 'id,name,account_status,currency,business_name,timezone_name';
  const accounts = [];
  try {
    let page = await graphGet('me/adaccounts', { fields, limit: 200 });
    let guard = 0;
    while (page && guard < 10) {
      for (const a of page.data || []) {
        const id = cleanAccount(a.id);
        if (!id) continue;
        accounts.push({
          id,
          name: a.name || `Conta ${id}`,
          status: Number(a.account_status ?? 0),
          statusLabel: accountStatusLabel(a.account_status),
          currency: a.currency || 'BRL',
          businessName: a.business_name || null,
          timezone: a.timezone_name || null,
        });
      }
      const next = page.paging?.next;
      if (!next) break;
      const { data } = await axios.get(next, { timeout: 45000 });
      page = data;
      guard++;
    }
  } catch (e) {
    console.error('[MetaHub] accounts:', e?.response?.data?.error?.message || e.message);
    return [];
  }
  return accounts.sort((a, b) => (b.status === 1) - (a.status === 1) || a.name.localeCompare(b.name));
}

export default { fetchInsights, fetchCampaigns, fetchDailyHistory, listAdAccounts, extractActions, isConfigured };
