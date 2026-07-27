/**
 * Blog Agent v5 — Artigo semanal de alta qualidade (DeepSeek)
 * + Editar e excluir artigos (via Boss Mode)
 * v5: DeepSeek pra texto + skills + OpenAI so pra imagens (DALL-E)
 */

import { query, queryOne, run } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chatContent } from './llm.js';
import { loadSkills } from './skillLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const BLOG_INTERVAL = 7 * 24 * 60 * 60_000;

function cleanJSON(str) {
  return (str || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

let running = false;

async function researchTopic() {
  const prompt = `Voce e um estrategista de conteudo B2B. Empresa: Viga Sales (automacao de atendimento, CRM, trafego pago para construtoras). Pesquise 1 tema em alta para artigo de blog. Responda APENAS o JSON, sem marcadores markdown: {"topic":"Titulo SEO","mainKeyword":"palavra-chave","painPoint":"dor do cliente","angle":"angulo unico"}`;
  try {
    const content = await chatContent({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: loadSkills('blog') }, { role: 'user', content: prompt }],
      temperature: 0.9, max_tokens: 300,
    });
    return JSON.parse(cleanJSON(content));
  } catch(e) { console.error('[Blog] research:', e.message); return null; }
}

async function generateImage(topic, painPoint) {
  if (!OPENAI_KEY) return null;
  try {
    const res = await axios.post('https://api.openai.com/v1/images/generations', {
      model:'gpt-image-1-mini', prompt:`Crie uma imagem de capa para artigo de blog sobre "${topic}". Mercado brasileiro de construcao civil. ${painPoint}. Estilo limpo e moderno, fundo azul marinho escuro com detalhes em laranja. IMPORTANTE: se houver texto na imagem, DEVE estar em portugues. NUNCA use texto em ingles. Proporcao 3:2. Sem marcas d'agua.`, n:1, size:'1536x1024',
    },{headers:{'Authorization':`Bearer ${OPENAI_KEY}`,'Content-Type':'application/json'},timeout:120000});
    const b64 = res.data?.data?.[0]?.b64_json;
    if (!b64) return null;
    const fn = `blog_${Date.now()}.png`;
    const dir = path.join(__dirname,'..','..','public','templates');
    if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,fn), Buffer.from(b64,'base64'));
    return `/templates/${fn}`;
  } catch(e) { console.error('[Blog] image:', e.message); return null; }
}

async function writeArticle(research, imageUrl) {
  if (!research) return null;
  const prompt = `Escreva um artigo de blog completo em HTML (tags <h2>, <h3>, <p>, <ul>, <strong>). 
Tema: ${research.topic}
Palavra-chave: ${research.mainKeyword}
Dor do cliente: ${research.painPoint}
Angulo: ${research.angle}
Requisitos:
- 3000-5000 palavras
- 6-8 secoes com H2
- Exemplos do mercado brasileiro de construcao civil
- Dados e estatisticas quando relevante
- Sem micro-CTAs no meio do texto
- Um CTA final natural
- Sem markdown, APENAS HTML (nao use code blocks)
Retorne apenas o corpo do artigo em HTML.`;
  try {
    const body = await chatContent({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: loadSkills('blog') }, { role: 'user', content: prompt }],
      temperature: 0.7, max_tokens: 6000,
    });
    if (!body) return null;
    const title = research.topic;
    const subtitle = `${research.painPoint}. ${research.angle}.`;
    const tags = [research.mainKeyword, 'construcao civil', 'automacao', '2026'];
    return {title, subtitle, body, tags, cover_image:imageUrl, slug:null};
  } catch(e) { console.error('[Blog] write:', e.message); return null; }
}

async function generateFAQ(title, body) {
  try {
    const content = await chatContent({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: `Gere 3-5 perguntas frequentes (FAQ) com respostas curtas sobre este artigo: "${title}". Retorne APENAS o JSON, sem marcadores: [{"question":"...","answer":"..."}]` }],
      temperature: 0.5, max_tokens: 500,
    });
    return cleanJSON(content) || '[]';
  } catch(e) { return '[]'; }
}

async function publish(article, faqJson) {
  if (!article) return false;
  const id = uuidv4();
  let slug = article.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,80);
  const existing = await queryOne("SELECT id FROM blog_posts WHERE slug = ?", [slug]).catch(()=>null);
  if (existing) slug = slug.substring(0,75)+'-'+Date.now().toString(36);

  let safeFaq = '[]';
  try { safeFaq = JSON.stringify(JSON.parse(faqJson)); } catch { safeFaq = '[]'; }

  await run("INSERT INTO blog_posts (id, title, subtitle, body, slug, tags, faq, cover_image, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, 'published', NOW())",
    [id, article.title, article.subtitle, article.body, slug, JSON.stringify(article.tags||[]), safeFaq, article.cover_image||null]);
  console.log(`[Blog] ✅ Publicado: "${article.title}"`);
  article.slug = slug;
  return article;
}

export async function generateAndPublish(userTopic = null) {
  if (running) return null;
  running = true;
  try {
    let research;
    if (userTopic) {
      research = {topic:userTopic, mainKeyword:userTopic.toLowerCase(), painPoint:'Solicitado pelo gestor', angle:'Abordagem pratica para construcao civil'};
      console.log(`[Blog] Tema via Chefe: "${userTopic}"`);
    } else {
      console.log('[Blog] 🔍 Pesquisando keyword + tendencia...');
      research = await researchTopic();
      if (!research) { running = false; return null; }
      console.log(`[Blog] Tema: ${research.topic} | KW: ${research.mainKeyword}`);
    }
    console.log('[Blog] 🎨 DALL-E 3...');
    const imageUrl = await generateImage(research.topic, research.painPoint);
    console.log(`[Blog] 🖼️ Imagem salva: ${imageUrl?.split('/').pop()}`);
    console.log('[Blog] ✍️ Escrevendo artigo estrategico...');
    const article = await writeArticle(research, imageUrl);
    if (!article) { running = false; return null; }
    console.log('[Blog] ❓ Gerando FAQ schema...');
    const faqJson = await generateFAQ(article.title, article.body);
    const result = await publish(article, faqJson);
    running = false;
    return result;
  } catch (err) {
    console.error('[Blog] Erro:', err.message);
    running = false;
    return null;
  }
}

export async function editArticle(slug, instructions) {
  if (!slug) return null;
  const article = await queryOne("SELECT * FROM blog_posts WHERE slug = ? OR slug LIKE ?", [slug, `%${slug}%`]).catch(() => null);
  if (!article) return null;
  console.log(`[Blog] ✏️ Editando: "${article.title}"`);
  try {
    const newBody = await chatContent({
      model: 'deepseek-chat', temperature: 0.5, max_tokens: 6000,
      messages: [{ role: 'system', content: 'Editor de artigos. Reescreva o artigo conforme instrucoes. Retorne APENAS HTML do corpo.' }, { role: 'user', content: `ARTIGO:\n${article.body||''}\n\nINSTRUCOES:\n${instructions}\n\nRetorne o artigo completo revisado em HTML.` }],
    });
    if (!newBody) return null;
    await run("UPDATE blog_posts SET body = ? WHERE id = ?", [newBody, article.id]);
    console.log(`[Blog] ✅ Editado: "${article.title}"`);
    return {...article, body:newBody};
  } catch(e) { console.error('[Blog] Erro edicao:', e.message); return null; }
}

export async function deleteArticle(slug) {
  if (!slug) return null;
  const article = await queryOne("SELECT * FROM blog_posts WHERE slug = ? OR slug LIKE ?", [slug, `%${slug}%`]).catch(() => null);
  if (!article) return null;
  await run("DELETE FROM blog_posts WHERE id = ?", [article.id]);
  console.log(`[Blog] 🗑️ Excluido: "${article.title}"`);
  return article;
}

export function startBlogAgent() {
  if (!process.env.DEEPSEEK_API_KEY) { console.log('[Blog] DeepSeek nao configurada — offline'); return; }
  const run = async () => { if (!running) await generateAndPublish(); };
  setTimeout(run, 5*60_000);
  setInterval(run, BLOG_INTERVAL);
  console.log('[Blog] Agente v5 — 1 artigo/semana, DeepSeek, 3k-5k palavras, sem micro-CTAs');
}
