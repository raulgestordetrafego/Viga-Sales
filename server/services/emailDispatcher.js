/**
 * Email Dispatcher — Worker autônomo para campanhas de email
 * Similar ao metaDispatcher: atomic reserve, dedup, auto-complete, limites
 */

import { query, queryOne, run, getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import * as emailService from './emailService.js';
import pg from 'pg';

const EMAIL_INTERVAL = 90_000;
const EMAIL_BATCH_SIZE = 3;
const EMAIL_DAYS = [1, 2, 3, 4, 5];
const EMAIL_TIME_START = '08:00';
const EMAIL_TIME_END = '20:00';

let dispatchRunning = false;

// Pool para banco de leads (dedup cross-database)
const LEADS_DB_URL = process.env.DATABASE_LEADS_URL;
let leadsPool = null;
function getLeadsPool() {
  if (!leadsPool && LEADS_DB_URL) {
    leadsPool = new pg.Pool({
      connectionString: LEADS_DB_URL,
      connectionTimeoutMillis: 5000,
      max: 2,
    });
  }
  return leadsPool;
}

// Verifica se email já foi contatado por qualquer canal
async function isAlreadyContacted(email) {
  return false; // cross-database dedup desabilitado
}

// Reserva recipients atomicamente (UPDATE com LIMIT + subquery)
async function atomicReserve(campaign, limit) {
  // Marca como 'reserved' para evitar que outro worker pegue os mesmos
  const recipients = await query(
    `UPDATE email_recipients SET status = 'reserved', updated_at = datetime('now')
     WHERE id IN (
       SELECT id FROM email_recipients
       WHERE list_id = ? AND status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM email_send_logs l WHERE l.recipient_id = email_recipients.id AND l.status = 'sent')
       ORDER BY created_at ASC LIMIT ?
     )
     RETURNING *`,
    [campaign.list_id, limit]
  );
  return recipients || [];
}

// Verifica janela de horário (Brasília)
function isWithinTimeWindow() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  if (!EMAIL_DAYS.includes(dayOfWeek)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = EMAIL_TIME_START.split(':').map(Number);
  const [eh, em] = EMAIL_TIME_END.split(':').map(Number);
  return currentMinutes >= sh * 60 + sm && currentMinutes <= eh * 60 + em;
}

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function processEmailDispatch() {
  try {
    if (!isConfigured()) return { sent: 0, reason: 'smtp_not_configured' };
    if (!isWithinTimeWindow()) return { sent: 0, reason: 'outside_hours' };

    const campaigns = await query("SELECT * FROM email_campaigns WHERE status = 'active'");
    if (!campaigns.length) return { sent: 0, reason: 'no_active_campaign' };

    const appUrl = process.env.APP_URL || 'https://vigasales.shop';
    let totalSent = 0;

    for (const campaign of campaigns) {
      // Reset diário se necessário
      const now = new Date();
      const resetDate = campaign.send_count_reset_date ? new Date(campaign.send_count_reset_date) : null;
      if (!resetDate || resetDate.toDateString() !== now.toDateString()) {
        await run(`UPDATE email_campaigns SET sent_today = 0, send_count_reset_date = datetime('now') WHERE id = ?`, [campaign.id]);
        campaign.sent_today = 0;
      }

      if ((campaign.sent_today || 0) >= campaign.daily_limit) continue;

      const remaining = campaign.daily_limit - (campaign.sent_today || 0);
      const toSend = Math.min(remaining, EMAIL_BATCH_SIZE);

      const recipients = await atomicReserve(campaign, toSend);
      if (!recipients.length) continue;

      let campaignSent = 0;
      for (const recipient of recipients) {
        // Dedup cross-database
        if (await isAlreadyContacted(recipient.email)) {
          await run(`UPDATE email_recipients SET status = 'descartado' WHERE id = ?`, [recipient.id]);
          console.log(`[EmailDispatch] Skip duplicate: ${recipient.email}`);
          continue;
        }

        const result = await emailService.sendCampaignEmail(campaign, recipient, appUrl);
        if (result.success) {
          totalSent++;
          campaignSent++;
        } else {
          await run(`UPDATE email_recipients SET status = 'pending' WHERE id = ?`, [recipient.id]);
        }

        // Delay entre emails (configurável por campanha)
        const delay = (campaign.min_delay_sec || 30) + Math.floor(Math.random() * ((campaign.max_delay_sec || 120) - (campaign.min_delay_sec || 30) + 1));
        await new Promise(r => setTimeout(r, delay * 1000));
      }

      if (campaignSent > 0) {
        await run(`UPDATE email_campaigns SET sent_today = sent_today + ? WHERE id = ?`, [campaignSent, campaign.id]);
      }

      // Auto-complete: se já enviou todos, marca como concluída
      const { total: campaignTotal } = campaign;
      const sentCount = (campaign.sent_count || 0) + campaignSent;
      const totalRecipients = campaign.total_recipients || campaignTotal;
      if (totalRecipients > 0 && sentCount >= totalRecipients) {
        await run(`UPDATE email_campaigns SET status = 'completed', finished_at = datetime('now') WHERE id = ?`, [campaign.id]);
        console.log(`[EmailDispatch] Campanha "${campaign.name}" concluída (${sentCount}/${totalRecipients})`);
      }
    }

    return { sent: totalSent };
  } catch (err) {
    console.error('[EmailDispatch] Error:', err.message);
    return { sent: 0, error: err.message };
  }
}

export function startEmailDispatcher() {
  const run = async () => {
    if (dispatchRunning) return;
    dispatchRunning = true;
    try {
      const result = await processEmailDispatch();
      if (result.sent > 0) console.log(`[EmailDispatch] ${result.sent} emails enviados`);
      else if (result.reason) {
        // silent skip for common reasons
        if (!['outside_hours', 'no_active_campaign', 'queue_empty'].includes(result.reason)) {
          console.log(`[EmailDispatch] Skipped: ${result.reason}`);
        }
      }
    } catch (err) {
      console.error('[EmailDispatch] Error:', err.message);
    }
    dispatchRunning = false;
  };

  if (isConfigured()) {
    setTimeout(run, 15_000);
    setInterval(run, EMAIL_INTERVAL);
    console.log('[EmailDispatch] Worker iniciado — a cada 90s, seg-sex, 08h-20h');
  } else {
    console.log('[EmailDispatch] SMTP não configurado — dispatcher offline');
  }
}
