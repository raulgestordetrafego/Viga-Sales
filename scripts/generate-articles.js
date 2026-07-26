/**
 * Generate 3 blog articles about gestão de tráfego, aumento de vendas, leads qualificados
 * Uses the same writeArticle / publish functions as blogAgent.js
 */
import { query, run, initDb } from '../server/db/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const APP_URL = process.env.APP_URL || 'https://vigasales.shop';

const topics = [
  {
    topic: "Gestão de Tráfego para Construtoras: Guia Completo 2026",
    mainKeyword: "gestão de tráfego construtoras",
    secondaryKeywords: ["tráfego pago construção civil", "Google Ads construtoras", "Meta Ads engenharia"],
    painPoint: "Construtoras investem em tráfego pago mas não convertem leads em clientes por falta de gestão profissional",
    searchIntent: "Como usar tráfego pago para conseguir clientes qualificados na construção civil",
    uniqueAngle: "Guia focado em métricas de conversão específicas do setor de construção civil, não copy-paste de agência genérica"
  },
  {
    topic: "Como Aumentar Vendas na Construção Civil: Guia Completo 2026",
    mainKeyword: "aumentar vendas construção civil",
    secondaryKeywords: ["vendas B2B construção", "funil de vendas construtoras", "aumentar demanda construção"],
    painPoint: "Donos de construtora dependem de indicação e não têm processo de vendas escalável",
    searchIntent: "Estratégias práticas para aumentar o volume de vendas de uma construtora",
    uniqueAngle: "Método prático com 5 etapas testadas em construtoras brasileiras que saíram de 2 para 15 vendas/mês"
  },
  {
    topic: "Atração de Leads Qualificados para Construtoras: Guia Completo 2026",
    mainKeyword: "atração de leads qualificados construtoras",
    secondaryKeywords: ["leads construção civil", "captação de clientes engenharia", "lead qualificado obra"],
    painPoint: "Construtoras recebem muitos contatos mas 80% não têm perfil — perdem tempo com leads desqualificados",
    searchIntent: "Como atrair apenas leads com potencial real de compra no setor de construção",
    uniqueAngle: "Sistema de qualificação automática com IA que filtra leads antes mesmo do primeiro contato humano"
  }
];

async function generateImage(topic, painPoint) {
  if (!OPENAI_KEY) return null;
  const prompt = `Professional blog header image for B2B article: "${topic}". Context: ${painPoint?.substring(0, 100) || ''}. Style: modern corporate, dark blue (#0b1120) and orange (#f97316) palette, clean, Brazilian business, 16:9. No text. High quality.`;

  try {
    // Try gpt-image-1-mini first (returns b64_json)
    const res = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'gpt-image-1-mini', prompt, n: 1, size: '1024x1024',
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, timeout: 120000 });

    const b64 = res.data?.data?.[0]?.b64_json;
    if (b64) {
      const filename = `blog_${Date.now()}.png`;
      const dir = path.join(__dirname, '..', 'public', 'templates');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), Buffer.from(b64, 'base64'));
      console.log(`  🖼️ Imagem salva: ${filename}`);
      return `${APP_URL}/templates/${filename}`;
    }
    return null;
  } catch (err) {
    console.log(`  ⚠️ Imagem falhou: ${err.response?.status || err.message}`);
    return null;
  }
}

async function writeArticle(research, imageUrl) {
  if (!OPENAI_KEY || !research) return null;
  const prompt = `Você é um redator B2B sênior especializado em marketing digital, gestão de tráfego e vendas para construção civil.

ESCREVA UM ARTIGO seguindo EXATAMENTE esta estrutura (formato "Guia Completo"):

TEMA: ${research.topic}
KEYWORD: ${research.mainKeyword}
DOR: ${research.painPoint}

ESTRUTURA OBRIGATÓRIA DO HTML:
1. <h2>O que é [tema] e por que [dono de construtora/engenheiro] precisa disso</h2> — contexto + estatística
2. <h2>Os [3-5] maiores problemas que [tema] resolve</h2> — dores reais, cada uma com <h3>
3. <h2>Como implementar [tema] em [3-5] passos práticos</h2> — passo a passo com <h3>
4. <h2>[Tema]: quanto custa e qual o retorno esperado</h2> — dados, comparação, ROI
5. <h2>Perguntas frequentes sobre [tema]</h2> — 4-5 Q&A com <h3> para pergunta e <p> para resposta

Tom: consultivo, direto, amigo inteligente que entende de obra e negócio.
Mínimo 2000 palavras. Use <strong> para destacar pontos-chave.
NÃO use micro-CTA nem div class='cta-box' no corpo.

RETORNE APENAS o HTML do corpo do artigo. Sem <!DOCTYPE>, sem <head>, sem <body>.`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8, max_tokens: 3500,
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } });

    const body = res.data?.choices?.[0]?.message?.content || '';
    if (!body || body.length < 500) return null;

    return {
      title: research.topic,
      subtitle: `${research.mainKeyword}. ${research.painPoint}`.substring(0, 160),
      body: body,
      tags: [research.mainKeyword, ...(research.secondaryKeywords || [])],
      keywords: research.secondaryKeywords || [],
      cover_image: imageUrl,
    };
  } catch (err) {
    console.error('  ❌ Erro artigo:', err.message);
    return null;
  }
}

async function generateFAQ(title, body) {
  if (!OPENAI_KEY) return '[]';
  const prompt = `Extraia 5 perguntas frequentes deste artigo e gere respostas curtas (max 150 chars cada).\nArtigo: "${title}"\n\nResponda APENAS JSON: [{"question": "...", "answer": "..."}]`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt + '\n\nCorpo: ' + body.substring(0, 3000) }],
      temperature: 0.5, max_tokens: 1000,
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } });

    const raw = res.data?.choices?.[0]?.message?.content || '[]';
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? match[0] : '[]';
  } catch { return '[]'; }
}

async function publish(article, faqJson) {
  if (!article) return false;
  const id = uuidv4();
  const slug = article.title
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);

  await run(
    `INSERT INTO blog_posts (id, title, subtitle, body, slug, tags, faq, cover_image, status, published_at)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, 'published', NOW())`,
    [id, article.title, article.subtitle, article.body, slug, JSON.stringify(article.tags || []), faqJson, article.cover_image || null]
  );
  console.log(`  ✅ Publicado: "${article.title}"`);
  return true;
}

async function main() {
  console.log('🔌 Conectando ao banco...');
  await initDb();
  console.log('🚀 Gerando 3 artigos sobre tráfego, vendas e leads qualificados...\n');

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    console.log(`📝 ${i + 1}/3: ${t.topic}`);
    console.log(`   KW: ${t.mainKeyword}`);

    console.log('   🎨 Gerando imagem...');
    const imageUrl = await generateImage(t.topic, t.painPoint);

    console.log('   ✍️ Escrevendo artigo...');
    const article = await writeArticle(t, imageUrl);
    if (!article) { console.log('   ❌ Falhou\n'); continue; }

    console.log('   ❓ Gerando FAQ...');
    const faqJson = await generateFAQ(article.title, article.body);

    await publish(article, faqJson);
    console.log('');
  }

  console.log('🏁 Concluído!');
}

main().catch(console.error);
