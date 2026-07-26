/**
 * TELEGRAM BOSS — Raul conversa com os agentes via Telegram
 * Usa long polling (sem webhook), mesma logica do BossMode WhatsApp
 */

import { handleBossCommand } from './bossMode.js';
import https from 'https';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BOSS_IDS = (process.env.TELEGRAM_BOSS_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

let lastUpdateId = 0;

function telegramApi(chatId) {
  return {
    sendText: async (id, text) => {
      const body = JSON.stringify({ chat_id: chatId || id, text, parse_mode: 'Markdown' });
      return new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.telegram.org',
          path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 15000,
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    },
  };
}

async function poll() {
  try {
    const body = JSON.stringify({ offset: lastUpdateId + 1, timeout: 30, allowed_updates: ['message'] });
    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_TOKEN}/getUpdates`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 35000,
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    if (!data.ok) return;

    for (const update of data.result || []) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;

      const chatId = String(msg.chat.id);
      const fromId = String(msg.from?.id || '');
      const name = msg.from?.first_name || 'Boss';

      console.log(`[Telegram] ${name} (${fromId}): "${msg.text.substring(0, 80)}"`);

      // Só responde se for um dos IDs autorizados
      if (BOSS_IDS.length && !BOSS_IDS.includes(fromId) && !BOSS_IDS.includes(chatId)) {
        await telegramApi(chatId).sendText(chatId, 'Nao autorizado.');
        continue;
      }

      const api = telegramApi(chatId);
      handleBossCommand(fromId, msg.text, name, api).catch(e => {
        console.error('[Telegram] Erro:', e.message);
        api.sendText(fromId, 'Erro ao processar.').catch(() => {});
      });
    }
  } catch (e) {
    console.error('[Telegram] Poll error:', e.message);
  }
  poll(); // loop infinito
}

export function startTelegramBoss() {
  if (!TELEGRAM_TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN nao configurado — offline');
    return;
  }
  console.log(`[Telegram] Bot iniciado — ${BOSS_IDS.length} IDs autorizados`);
  poll();
}
