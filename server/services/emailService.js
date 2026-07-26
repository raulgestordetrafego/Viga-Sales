import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { query, queryOne, run } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const SMTP_HOST = process.env.SMTP_HOST || 'mail.vigasales.com.br';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || 'contato@vigasales.com.br';
const SMTP_PASS = process.env.SMTP_PASSWORD || '';
const IMAP_HOST = process.env.IMAP_HOST || 'mail.vigasales.com.br';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993');
const IMAP_USER = process.env.IMAP_USER || 'contato@vigasales.com.br';
const IMAP_PASS = process.env.IMAP_PASSWORD || '';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false, servername: SMTP_HOST },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
  });
  return transporter;
}

export function resolveSpintax(text) {
  if (!text) return text;
  return text.replace(/\{(?!\{)([^{}]+)\}(?!\})/g, (match, options) => {
    const parts = options.split('|');
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

export function resolveVariables(text, recipient) {
  if (!text || !recipient) return text;
  const extras = (() => { try { return JSON.parse(recipient.extra_data || '{}'); } catch { return {}; } })();
  return text
    .replace(/\{\{name\}\}/g, recipient.name || '')
    .replace(/\{\{company\}\}/g, recipient.company || '')
    .replace(/\{\{email\}\}/g, recipient.email || '')
    .replace(/\{\{primeiro_nome\}\}/g, (recipient.name || '').split(' ')[0] || '')
    .replace(/\{\{cidade\}\}/g, extras.cidade || extras.city || '')
    .replace(/\{\{cargo\}\}/g, extras.cargo || '');
}

export function applyVariations(text, recipient) {
  let result = resolveSpintax(text);
  result = resolveVariables(result, recipient);
  return result;
}

export async function generateAIVariation(template, recipient, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { subject: template.subject, body: template.body_html };
  }
  const extras = (() => { try { return JSON.parse(recipient.extra_data || '{}'); } catch { return {}; } })();
  const ctx = {
    name: recipient.name || 'não informado',
    company: recipient.company || 'não informada',
    primeiro_nome: (recipient.name || '').split(' ')[0],
    ...extras,
  };
  const variationPrompt = prompt || `Reescreva o assunto e corpo deste email de prospecção de forma diferente (mesmo tom, mesma oferta) para que pareça único e natural. Use o nome/empresa do destinatário. Retorne APENAS JSON: {"subject": "...", "body": "..."}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${variationPrompt}\n\n--- DESTINATÁRIO ---\nNome: ${ctx.name}\nEmpresa: ${ctx.company}\nPrimeiro nome: ${ctx.primeiro_nome}\n\n--- TEMPLATE ORIGINAL ---\nAssunto: ${template.subject}\nCorpo:\n${template.body_html}` }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 800 },
      }),
    });
    if (!geminiRes.ok) throw new Error(`Gemini error ${geminiRes.status}`);
    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        subject: applyVariations(parsed.subject || template.subject, recipient),
        body: applyVariations(parsed.body || template.body_html, recipient),
      };
    }
    return { subject: applyVariations(template.subject, recipient), body: applyVariations(template.body_html, recipient) };
  } catch (err) {
    return { subject: applyVariations(template.subject, recipient), body: applyVariations(template.body_html, recipient) };
  }
}

function injectTracking(bodyHtml, logId, appUrl) {
  const baseUrl = appUrl || process.env.APP_URL || 'https://vigasales.shop';
  const pixelUrl = `${baseUrl}/api/email/track/open/${logId}.gif`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
  let result = bodyHtml;

  result = result.replace(/(<a\s+[^>]*href=")([^"]+)("[^>]*>)/gi, (match, prefix, url, suffix) => {
    const encodedUrl = encodeURIComponent(url);
    const clickUrl = `${baseUrl}/api/email/track/click/${logId}?url=${encodedUrl}`;
    return `${prefix}${clickUrl}${suffix}`;
  });

  if (result.includes('</body>')) {
    result = result.replace('</body>', `${pixelTag}</body>`);
  } else {
    result += pixelTag;
  }
  return result;
}

export async function sendEmail({ to, toName, subject, bodyHtml, senderName, senderEmail, replyTo, campaignId, logId, appUrl }) {
  try {
    const finalBody = injectTracking(bodyHtml, logId, appUrl);

    const mailOptions = {
      from: `"${senderName || 'Viga Sales'}" <${senderEmail || SMTP_USER}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      bcc: process.env.EMAIL_BCC || 'raulfs.sc@gmail.com',
      subject,
      html: finalBody,
      replyTo: replyTo || SMTP_USER,
      headers: {
        'X-Campaign-Id': campaignId || '',
        'X-Log-Id': logId,
      },
    };

    const t = getTransporter();
    const info = await t.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function sendCampaignEmail(campaign, recipient, appUrl) {
  const logId = uuidv4();
  let subjectSent, bodySent;

  try {
    const template = { subject: campaign.subject, body_html: campaign.body_html };

    if (campaign.use_ai_variation) {
      const variation = await generateAIVariation(template, recipient, campaign.ai_variation_prompt);
      subjectSent = variation.subject;
      bodySent = variation.body;
    } else {
      subjectSent = applyVariations(template.subject, recipient);
      bodySent = applyVariations(template.body_html, recipient);
    }

    const result = await sendEmail({
      to: recipient.email,
      toName: recipient.name,
      subject: subjectSent,
      bodyHtml: bodySent,
      senderName: campaign.sender_name,
      senderEmail: campaign.sender_email,
      replyTo: campaign.reply_to,
      campaignId: campaign.id,
      logId,
      appUrl,
    });

    if (result.success) {
      await run(
        `INSERT INTO email_send_logs (id, campaign_id, recipient_id, smtp_message_id, status, subject_sent, body_sent, sent_at) VALUES (?, ?, ?, ?, 'sent', ?, ?, datetime('now'))`,
        [logId, campaign.id, recipient.id, result.messageId, subjectSent, bodySent]
      );
      await run(`UPDATE email_recipients SET status = 'sent' WHERE id = ?`, [recipient.id]);
      await run(`UPDATE email_campaigns SET sent_count = sent_count + 1, last_sent_at = datetime('now') WHERE id = ?`, [campaign.id]);
      return { success: true, logId, messageId: result.messageId };
    } else {
      await run(
        `INSERT INTO email_send_logs (id, campaign_id, recipient_id, status, subject_sent, body_sent, error) VALUES (?, ?, ?, 'failed', ?, ?, ?)`,
        [logId, campaign.id, recipient.id, subjectSent, bodySent, result.error]
      );
      await run(`UPDATE email_recipients SET status = 'failed' WHERE id = ?`, [recipient.id]);
      return { success: false, logId, error: result.error };
    }
  } catch (err) {
    try {
      await run(
        `INSERT INTO email_send_logs (id, campaign_id, recipient_id, status, subject_sent, body_sent, error) VALUES (?, ?, ?, 'failed', ?, ?, ?)`,
        [logId, campaign.id, recipient.id, subjectSent || '', bodySent || '', err.message]
      );
      await run(`UPDATE email_recipients SET status = 'failed' WHERE id = ?`, [recipient.id]);
    } catch (_) {}
    return { success: false, logId, error: err.message };
  }
}

function isWithinTimeWindow(campaign) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  let allowedDays;
  try { allowedDays = JSON.parse(campaign.days_of_week || '[1,2,3,4,5]'); } catch { allowedDays = [1, 2, 3, 4, 5]; }
  if (!allowedDays.includes(dayOfWeek)) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (campaign.time_start || '08:00').split(':').map(Number);
  const [eh, em] = (campaign.time_end || '18:00').split(':').map(Number);
  return currentMinutes >= (sh * 60 + sm) && currentMinutes <= (eh * 60 + em);
}

function shouldResetDailyCount(campaign) {
  if (!campaign.send_count_reset_date) return true;
  return new Date(campaign.send_count_reset_date).toDateString() !== new Date().toDateString();
}

export async function processEmailQueue() {
  try {
    const campaigns = await query(`SELECT * FROM email_campaigns WHERE status = 'active'`);
    if (!campaigns.length) return { processed: 0 };

    let totalProcessed = 0;
    const appUrl = process.env.APP_URL || 'https://vigasales.shop';

    for (const campaign of campaigns) {
      if (!isWithinTimeWindow(campaign)) continue;
      if (shouldResetDailyCount(campaign)) {
        await run(`UPDATE email_campaigns SET sent_today = 0, send_count_reset_date = datetime('now') WHERE id = ?`, [campaign.id]);
        campaign.sent_today = 0;
      }
      if ((campaign.sent_today || 0) >= campaign.daily_limit) continue;

      const remaining = campaign.daily_limit - (campaign.sent_today || 0);
      const toSend = Math.min(remaining, 3);

      const recipients = await query(
        `SELECT r.* FROM email_recipients r
         WHERE r.list_id = ? AND r.status = 'pending'
         AND NOT EXISTS (SELECT 1 FROM email_send_logs l WHERE l.recipient_id = r.id AND l.status = 'sent')
         ORDER BY r.created_at ASC LIMIT ?`,
        [campaign.list_id, toSend]
      );

      let campaignSent = 0;
      for (const recipient of recipients) {
        const result = await sendCampaignEmail(campaign, recipient, appUrl);
        if (result.success) {
          totalProcessed++;
          campaignSent++;
        }
        const delay = (campaign.min_delay_sec || 30) + Math.floor(Math.random() * ((campaign.max_delay_sec || 120) - (campaign.min_delay_sec || 30) + 1));
        await new Promise(r => setTimeout(r, delay * 1000));
      }

      if (campaignSent > 0) {
        await run(`UPDATE email_campaigns SET sent_today = sent_today + ? WHERE id = ?`, [campaignSent, campaign.id]);
      }
    }
    return { processed: totalProcessed };
  } catch (err) {
    console.error('[EmailWorker] Error:', err.message);
    return { processed: 0, error: err.message };
  }
}

export async function handleOpenTracking(logId) {
  const log = await queryOne('SELECT * FROM email_send_logs WHERE id = ? AND opened_at IS NULL', [logId]);
  if (!log) return null;
  await run(`UPDATE email_send_logs SET status = 'opened', opened_at = datetime('now') WHERE id = ?`, [logId]);
  await run(`UPDATE email_campaigns SET opened_count = opened_count + 1 WHERE id = ?`, [log.campaign_id]);
  await run(`UPDATE email_recipients SET status = 'opened' WHERE id = ?`, [log.recipient_id]);
  return log;
}

export async function handleClickTracking(logId, url) {
  const log = await queryOne('SELECT * FROM email_send_logs WHERE id = ?', [logId]);
  if (!log) return null;
  if (!log.clicked_at) {
    await run(`UPDATE email_send_logs SET status = 'clicked', clicked_at = datetime('now') WHERE id = ?`, [logId]);
    await run(`UPDATE email_campaigns SET clicked_count = clicked_count + 1 WHERE id = ?`, [log.campaign_id]);
    await run(`UPDATE email_recipients SET status = 'clicked' WHERE id = ?`, [log.recipient_id]);
  }
  return url;
}

export async function checkImapReplies() {
  if (!IMAP_PASS || !IMAP_USER) {
    return { matched: 0 };
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: parseInt(IMAP_PORT) || 993,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    tls: { rejectUnauthorized: false },
  });

  let matched = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ seen: false }, { source: true })) {
        try {
          const parsed = await simpleParser(msg.source);
          const refs = [
            ...(parsed.inReplyTo ? [parsed.inReplyTo] : []),
            ...(parsed.references || []),
          ];

          for (const ref of refs) {
            if (!ref) continue;
            const cleanRef = ref.replace(/^<|>$/g, '');
            const log = await queryOne(
              `SELECT l.*, r.id as recipient_id, r.email FROM email_send_logs l
               JOIN email_recipients r ON l.recipient_id = r.id
               WHERE l.smtp_message_id = ? AND l.status IN ('sent','opened','clicked')`,
              [cleanRef]
            );
            if (log) {
              matched++;
              await run(`UPDATE email_send_logs SET status = 'replied', replied_at = datetime('now') WHERE id = ?`, [log.id]);
              await run(`UPDATE email_campaigns SET replied_count = COALESCE(replied_count, 0) + 1 WHERE id = ?`, [log.campaign_id]);
              await run(`UPDATE email_recipients SET status = 'replied' WHERE id = ?`, [log.recipient_id]);
            }
          }
        } catch (_) {
          // skip malformed emails
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('[Email IMAP] Error:', err.message);
  }
  return { matched };
}

export async function getDashboardStats() {
  const totalSent = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status != 'failed'`))?.cnt || 0;
  const totalOpened = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status IN ('opened','clicked','replied')`))?.cnt || 0;
  const totalClicked = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status IN ('clicked','replied')`))?.cnt || 0;
  const totalReplied = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'replied'`))?.cnt || 0;
  const totalFailed = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'failed'`))?.cnt || 0;
  const totalRecipients = (await queryOne(`SELECT COUNT(*) as cnt FROM email_recipients`))?.cnt || 0;
  const activeCampaigns = (await queryOne(`SELECT COUNT(*) as cnt FROM email_campaigns WHERE status = 'active'`))?.cnt || 0;
  const totalListas = (await queryOne(`SELECT COUNT(*) as cnt FROM email_lists`))?.cnt || 0;

  const today = new Date().toISOString().split('T')[0];
  const sentToday = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status != 'failed' AND date(created_at) = ?`, [today]))?.cnt || 0;
  const openedToday = (await queryOne(`SELECT COUNT(*) as cnt FROM email_send_logs WHERE status IN ('opened','clicked','replied') AND date(opened_at) = ?`, [today]))?.cnt || 0;

  return {
    totalSent, totalOpened, totalClicked, totalReplied, totalFailed,
    totalRecipients, activeCampaigns, totalListas, sentToday, openedToday,
    openRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : 0,
    replyRate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : 0,
  };
}
