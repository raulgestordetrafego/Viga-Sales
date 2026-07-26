/**
 * TELEGRAM BOSS — Raul conversa com os agentes via Telegram
 * Usa long polling (sem webhook), mesma logica do BossMode WhatsApp
 */

import { handleBossCommand } from './bossMode.js';
import { query, queryOne } from '../db/database.js';
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
      const lower = msg.text.toLowerCase();

      if (lower === '/ajuda' || lower === 'ajuda') {
        await api.sendText(fromId,
          `*Comandos disponiveis:*\n\n` +
          `/briefing — Aciona o Chief, tarefas e panorama\n` +
          `/planejar — Planejamento semanal com OKRs\n` +
          `/tarefas — Tarefas pendentes\n` +
          `/cerebro — Consulta o cerebro de trafego\n` +
          `/status — Numeros rapidos\n\n` +
          `Ou so manda um "oi" pra conversar.`
        );
        continue;
      }

      if (lower === '/tarefas' || lower === 'tarefas') {
        const tasks = await query("SELECT title, priority, category FROM chief_tasks WHERE status='pendente' ORDER BY created_at DESC LIMIT 10").catch(()=>[]);
        if (!tasks.length) return api.sendText(fromId, 'Nenhuma tarefa pendente.');
        let m = '*Tarefas pendentes:*\n\n';
        tasks.forEach((t,i) => { m += `${i+1}\\. ${t.priority==='alta'?'🔴':'🟡'} ${t.title} _${t.category}_\n`; });
        await api.sendText(fromId, m);
        continue;
      }

      if (lower === '/status' || lower === 'status') {
        const [wppHj, wppSem, respSem, fila, reunioes] = await Promise.all([
          queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND DATE(created_at)=CURRENT_DATE"),
          queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND created_at>=NOW()-INTERVAL'7 days'"),
          queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='respondeu' AND responded_at::timestamp>=NOW()-INTERVAL'7 days'"),
          queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='novo'"),
          queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='reuniao_agendada' AND updated_at::timestamp>=NOW()-INTERVAL'7 days'"),
        ]);
        const C=v=>parseInt(v?.cnt||'0');
        const rate = C(wppSem)>0 ? (C(respSem)/C(wppSem)*100).toFixed(1) : '0';
        await api.sendText(fromId,
          `📊 *Status*\n\n` +
          `📱 WPP: ${C(wppHj)} hj \\| ${C(wppSem)} sem\n` +
          `📥 Respostas: ${C(respSem)} \\(${rate}%\\)\n` +
          `📦 Fila: ${C(fila)} leads\n` +
          `🤝 Reunioes: ${C(reunioes)} semana`
        );
        continue;
      }

      if (lower === '/cerebro' || lower === 'cerebro') {
        const question = msg.text.replace(/^\/?cerebro\s*/i, '') || 'otimizacao campanhas';
        try {
          const { queryBrain } = await import('./trafficAgent.js');
          const result = queryBrain(question);
          if (result.error || !result.matched_topics?.length) {
            return api.sendText(fromId, '🧠 Nao encontrei nada sobre isso.');
          }
          let resp = '🧠 *Cerebro de Trafego:*\n\n';
          for (const t of result.matched_topics.slice(0, 2)) {
            resp += `*${t.topic}*: ${t.summary?.substring(0, 150) || t.description}\n\n`;
          }
          await api.sendText(fromId, resp);
        } catch (e) {
          await api.sendText(fromId, 'Erro ao consultar cerebro.');
        }
        continue;
      }

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
