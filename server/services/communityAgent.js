/**
 * Comunidade Zap — Worker de conteúdo diário para grupo WhatsApp
 * Envia dicas, enquetes e conteúdos programados via Evolution API
 */

import evolutionApi from './evolutionApi.js';
import { query, queryOne, run } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const COMMUNITY_GROUP_ID = process.env.COMMUNITY_GROUP_ID || '';
const COMMUNITY_INSTANCE = process.env.COMMUNITY_INSTANCE || 'Raul Santos';
const CONTENT_HOUR = parseInt(process.env.COMMUNITY_HOUR || '9');

// Pool de conteúdos (rotativo)
const CONTENTS = [
  {
    type: 'text',
    body: `📢 *Dica do Dia — Orçamento Rápido*\n\nO cliente que espera mais de 30 minutos por um orçamento tem 70% de chance de já ter pedido pro concorrente.\n\nResponda em até 5 minutos e aumente sua conversão em até 3x.\n\nQuer automatizar isso? Mande um "oi" no privado.`,
  },
  {
    type: 'text',
    body: `🏗️ *Segunda-feira de Obra*\n\nEngenheiros que delegam a triagem de leads economizam em média 2h30 por dia.\n\nEsse tempo volta pra obra, pra família ou pra fechar novos contratos.\n\nA Viga Sales faz essa triagem pra você.`,
  },
  {
    type: 'text',
    body: `📊 *Métrica da Semana*\n\nA taxa média de resposta no WhatsApp da construção civil é de apenas 12%.\n\nCom automação de follow-up, sobe pra 41%.\n\nO que você está deixando na mesa?`,
  },
  {
    type: 'text',
    body: `💡 *Pergunta do Dia*\n\nQual o maior gargalo do seu negócio hoje?\n\nA) Captar leads\nB) Responder orçamentos\nC) Fechar contratos\nD) Cobrar clientes\n\nResponde aí que eu trago uma solução na próxima mensagem.`,
  },
  {
    type: 'text',
    body: `🔧 *Ferramenta da Semana*\n\nVocê sabia que dá pra ter um assistente virtual que responde cliente 24h por dia no WhatsApp?\n\nEle entende o que o cliente precisa, faz perguntas e já envia o orçamento no automático.\n\nTudo sem pagar comissão.`,
  },
  {
    type: 'text',
    body: `📈 *Resultado Real*\n\nUma construtora parceira nossa em Brasília aumentou em 40% os contratos fechados depois que automatizou o atendimento no WhatsApp.\n\nO funil que antes perdia 6 de 10 leads agora perde só 2.\n\nQuer ver como? Chama no privado.`,
  },
  {
    type: 'text',
    body: `🎯 *Foco em Obra*\n\nSeu WhatsApp não pode ser inimigo da sua obra.\n\nCada interrupção pra responder "preço do m2?" custa 15 minutos de concentração.\n\nA Viga Sales blinda seu foco e deixa o atendimento com a gente.`,
  },
];

let contentIndex = -1;
let running = false;

function getNextContent() {
  contentIndex = (contentIndex + 1) % CONTENTS.length;
  return CONTENTS[contentIndex];
}

async function sendCommunityMessage() {
  if (!COMMUNITY_GROUP_ID) {
    console.log('[Community] COMMUNITY_GROUP_ID não configurado.');
    return;
  }
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
    console.log('[Community] Evolution API não configurada.');
    return;
  }

  const content = getNextContent();
  try {
    await evolutionApi.sendTextMessageFromInstance(COMMUNITY_INSTANCE, COMMUNITY_GROUP_ID, content.body);
    console.log(`[Community] Enviado: ${content.body.substring(0, 50)}...`);

    // Registra no banco
    await run(
      `INSERT INTO community_logs (id, content_type, body, sent_at) VALUES (?, ?, ?, datetime('now'))`,
      [uuidv4(), content.type, content.body]
    );
  } catch (err) {
    console.error('[Community] Erro ao enviar:', err.message);
  }
}

// Verifica se está na hora certa (Brasília = UTC-3)
function isBrazilTime(hour) {
  const now = new Date();
  // Ajusta para Brasília manualmente
  const brHour = (now.getUTCHours() - 3 + 24) % 24;
  return brHour === hour && now.getMinutes() < 10; // janela de 10 min
}

export function startCommunityAgent() {
  const run = async () => {
    if (!isBrazilTime(CONTENT_HOUR)) return;
    if (running) return;
    running = true;
    try {
      await sendCommunityMessage();
    } catch (err) {
      console.error('[Community] Erro:', err.message);
    }
    running = false;
  };

  // Verifica a cada 5 minutos
  setInterval(run, 300_000);
  console.log(`[Community] Agente iniciado — envia conteúdo às ${CONTENT_HOUR}h (Brasília)`);
}
