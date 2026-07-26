/**
 * Media Agent — Gera imagens e sugere thumbnails para templates
 * Roda 1x por semana (sábado) e envia pro grupo
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.AGENTS_GROUP_ID || '120363428115495870@g.us';
const APP_URL = process.env.APP_URL || 'https://vigasales.shop';

const IMAGE_CONCEPTS = [
  { 
    idea: 'Gráfico mostrando queda de 40% nas vendas de construtoras sem automação',
    template: 'modelo_09_imagem',
    style: 'corporate clean chart, blue and orange, professional'
  },
  {
    idea: 'Dashboard de CRM com métricas subindo: leads captados, resposta automática, contratos fechados',
    template: 'modelo_04_imagem_01',
    style: 'modern dashboard UI, dark theme, green indicators'
  },
  {
    idea: 'Celular com tela de WhatsApp mostrando mensagem automática "Orçamento enviado em 5 segundos"',
    template: 'modelo_04_imagem_01',
    style: 'realistic phone mockup, whatsapp interface, brazilian portuguese'
  },
  {
    idea: 'Engenheiro feliz no canteiro de obra com capacete, texto: "Foco na obra. A Viga Sales cuida do resto"',
    template: 'modelo_09_imagem',
    style: 'professional photography, construction site, warm lighting, brazilian'
  },
  {
    idea: 'Gráfico comparativo: Tempo médio de resposta — Sem automação: 3 horas | Com Viga Sales: 2 minutos',
    template: null,
    style: 'infographic style, clean, modern, blue gradient'
  },
];

let running = false;

async function generateImage(concept) {
  if (!OPENAI_KEY) return null;

  try {
    const res = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'dall-e-3',
      prompt: concept.style + '. ' + concept.idea + '. No text overlay unless specified. Professional, high quality.',
      n: 1,
      size: '1024x1024',
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, timeout: 60000 });

    const imageUrl = res.data?.data?.[0]?.url;
    if (!imageUrl) return null;

    // Download and save locally
    const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const filename = `agent_media_${Date.now()}.png`;
    const mediaDir = path.join(__dirname, '..', '..', 'public', 'templates');
    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(path.join(mediaDir, filename), imageRes.data);

    return `${APP_URL}/templates/${filename}`;
  } catch (err) {
    console.error('[MediaAgent] DALL-E error:', err.message);
    return null;
  }
}

async function generateConceptSuggestions() {
  if (!OPENAI_KEY) return null;

  const prompt = `Você é um diretor de arte para uma empresa de automação comercial para construtoras (Viga Sales).
Sugira 3 novos conceitos visuais para templates de WhatsApp. Cada conceito deve incluir:
- Descrição da imagem
- Por que funcionaria (gatilho mental)
- Tipo de template que combinaria (imagem ou vídeo)
- Público-alvo (empreiteiro, engenheiro, dono de construtora)

Responda em português, formato direto.`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 1000,
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } });

    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[MediaAgent] OpenAI error:', err.message);
    return null;
  }
}

async function sendToGroup(text, imageUrl = null) {
  let msg = `🎨 *Agente de Mídia*\n\n${text}`;
  if (imageUrl) msg += `\n\n🖼️ Preview: ${imageUrl}`;

  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP, text: msg, delay: 1200,
    }, { headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log('[MediaAgent] Enviado para o grupo');
  } catch (err) {
    console.error('[MediaAgent] Erro ao enviar:', err.message);
  }
}

export async function runMediaAgent() {
  if (running) return;
  running = true;
  try {
    console.log('[MediaAgent] Gerando mídia...');

    // Pega 1 conceito rotativo
    const idx = Math.floor(Math.random() * IMAGE_CONCEPTS.length);
    const concept = IMAGE_CONCEPTS[idx];

    let report = '';
    const imageUrl = await generateImage(concept);
    if (imageUrl) {
      report += `✅ Nova imagem gerada: "${concept.idea}"\n🔗 ${imageUrl}\n📋 Template sugerido: ${concept.template || 'novo'}\n\n`;
    }

    // Também gera sugestões de novos conceitos
    const suggestions = await generateConceptSuggestions();
    if (suggestions) {
      report += `💡 *Novos Conceitos:*\n${suggestions}`;
    }

    await sendToGroup(report, imageUrl);
  } catch (err) {
    console.error('[MediaAgent] Erro:', err.message);
  }
  running = false;
}

export function startMediaAgent() {
  if (!OPENAI_KEY) {
    console.log('[MediaAgent] OpenAI não configurada — offline');
    return;
  }

  const check = () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brDay = now.getUTCDay();
    const brMin = now.getMinutes();
    // Sábado, 11:00
    if (brDay === 6 && brHour === 11 && brMin < 5) {
      runMediaAgent();
    }
  };

  setInterval(check, 300_000);
  console.log('[MediaAgent] Agente iniciado — sáb às 11h');
}
