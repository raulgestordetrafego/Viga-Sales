/**
 * Corrige imagens quebradas do blog — regenera via OpenAI
 * Uso: node scripts/fix-blog-images.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const env = dotenv.parse(fs.readFileSync(envPath));
  for (const k in env) process.env[k] = env[k];
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY não configurada');
  process.exit(1);
}

const TEMPLATES_DIR = path.join(__dirname, '..', 'public', 'templates');
fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

const articles = [
  {
    slug: 'crm-para-construtoras-potencializando-o-relacionamento-com-clientes-e-aumentando',
    prompt: 'A modern CRM dashboard interface for construction companies, showing client pipeline, message automation, and sales metrics. Professional, clean design with orange and navy colors. No text.',
  },
  {
    slug: 'dificuldade-empresas-construcao-atender-leads',
    prompt: 'A busy construction company office with phones ringing and unanswered messages floating, symbolizing the difficulty of handling leads. Professional atmosphere, warm lighting. No text.',
  },
  {
    slug: 'como-montar-time-agentes-ia-automacao-comercial-2026',
    prompt: 'A futuristic AI agent team hub with multiple digital assistants managing commercial automation, showing chat interfaces, calendars, and analytics dashboards. Dark theme with orange accents. No text.',
  },
];

async function generateImage(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1-mini',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Erro OpenAI');
  return data.data?.[0]?.b64_json;
}

async function main() {
  for (const article of articles) {
    // Check if Postgres is available
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.log('DATABASE_URL não configurada — gerando imagens localmente apenas');
    }

    const filename = `blog_${Date.now()}.png`;
    const filepath = path.join(TEMPLATES_DIR, filename);

    console.log(`Gerando imagem para: ${article.slug}`);
    try {
      const b64 = await generateImage(article.prompt);
      fs.writeFileSync(filepath, Buffer.from(b64, 'base64'));
      console.log(`  ✅ Salva: ${filename} (${fs.statSync(filepath).size} bytes)`);
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\nPronto! Imagens salvas em public/templates/');
  console.log('Agora atualize o banco com os novos nomes de arquivo.');
}

main().catch(console.error);
