import { MetaInsightsData, MetaCampaignData, DateRange, DailyPerformance } from '../types';
import { hubApi } from '../api';

/**
 * Leitura da Meta via BACKEND (token do System User no servidor).
 * O frontend não guarda nem envia token — só o id da conta de anúncios.
 * As métricas/derivações (Single Result Rule etc.) rodam no servidor
 * (server/services/metaHubService.js).
 */

const cleanAccount = (adAccountId: string) => (adAccountId || '').toString().replace(/[^0-9]/g, '').trim();

const rangeParams = (range?: DateRange) =>
  range?.since && range?.until ? { since: range.since, until: range.until } : {};

export const fetchMetaDailyHistory = async (
  adAccountId: string,
  range: DateRange,
  filterKeyword?: string
): Promise<DailyPerformance[]> => {
  try {
    const cleanId = cleanAccount(adAccountId);
    if (!cleanId) return [];
    return await hubApi.meta.liveDailyHistory(cleanId, { ...rangeParams(range), filterKeyword });
  } catch (error) { return []; }
};

export const fetchMetaInsights = async (
  adAccountId: string,
  range?: DateRange,
  filterKeyword?: string,
  filterType?: string
): Promise<MetaInsightsData | null> => {
  try {
    const cleanId = cleanAccount(adAccountId);
    if (!cleanId) return null;
    return await hubApi.meta.liveInsights(cleanId, { ...rangeParams(range), filterKeyword, filterType });
  } catch (error) { return null; }
};

export const fetchMetaCampaigns = async (
  adAccountId: string,
  range?: DateRange,
  filterKeyword?: string
): Promise<MetaCampaignData[]> => {
  try {
    const cleanId = cleanAccount(adAccountId);
    if (!cleanId) return [];
    return await hubApi.meta.liveCampaigns(cleanId, { ...rangeParams(range), filterKeyword });
  } catch (error) { return []; }
};
