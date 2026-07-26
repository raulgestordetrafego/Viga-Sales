/**
 * LINKEDIN OUTREACH WORKER — Prospecção orgânica via Playwright
 * 
 * Limite: 15 convites/dia (seg-sex, 10h-17h)
 * 
 * Cookies: exportar do navegador logado e salvar em db/linkedin_cookies.json
 * Para exportar: use extensão "EditThisCookie" no Chrome → export → copiar JSON
 * Ou: abra /api/linkedin/login em um navegador com display
 */

import { chromium } from 'playwright';
import { query, queryOne, run } from '../db/database.js';
import { chatContent } from './llm.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '..', '..', 'db', 'linkedin_cookies.json');
const DAILY_LIMIT = 15;
const SEARCH_QUERIES = [
  'engenheiro civil Brasília',
  'construtora Brasília DF',
  'engenharia construção Brasília',
  'arquiteto construtora Brasília',
  'diretor engenharia Brasília',
];

let running = false;
let dailySent = 0;
let dailyResetDate = new Date().toDateString();

function resetDailyIfNewDay() {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailySent = 0;
    dailyResetDate = today;
  }
}

function isWithinWindow() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 10 && hour < 17;
}

async function loadCookies(context) {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
      await context.addCookies(cookies);
      console.log(`[LinkedIn] ${cookies.length} cookies carregados`);
      return true;
    }
  } catch (err) {
    console.error('[LinkedIn] Erro ao carregar cookies:', err.message);
  }
  return false;
}

async function saveCookies(context) {
  try {
    const dir = path.dirname(COOKIES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  } catch (err) {
    console.error('[LinkedIn] Erro ao salvar cookies:', err.message);
  }
}

async function generateMessage(profile) {
  try {
    const prompt = `Gere uma nota de convite do LinkedIn em português, em nome de Raul Santos da Viga Sales (automação comercial para construtoras). Tom profissional, amigável, curto (máx 150 caracteres). NÃO use "Olá" nem emojis. Contexto: ${profile.name}, ${profile.headline || 'engenharia'}. Apenas o texto.`;
    const content = await chatContent({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7, max_tokens: 200,
    });
    return content?.trim()?.substring(0, 200) || 'Sou Raul da Viga Sales, atuamos com automação de atendimento para construtoras. Gostaria de conectar para trocarmos ideias sobre o mercado.';
  } catch {
    return 'Vi seu perfil e acredito que podemos trocar experiências sobre o mercado de construção civil. Abraço!';
  }
}

async function saveProspect(profile, message) {
  try {
    const phone = profile.phone || '';
    const name = profile.name || 'Sem nome';
    const existing = await queryOne(
      "SELECT id FROM prospects WHERE (phone = ? AND phone != '') OR name = ?",
      [phone, name]
    ).catch(() => null);
    if (existing) return;

    await run(
      `INSERT INTO prospects (id, name, phone, company, city, state, source, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'linkedin', 'novo', ?, datetime('now'))`,
      [uuidv4(), name, phone, profile.company || '', profile.location || 'Brasília', 'DF', message]
    );
    console.log(`[LinkedIn] Lead: ${name}`);
  } catch (err) {
    console.error('[LinkedIn] Erro lead:', err.message);
  }
}

async function runOutreach() {
  if (running) return { sent: 0, reason: 'already_running' };
  running = true;

  try {
    resetDailyIfNewDay();
    if (!isWithinWindow()) return { sent: 0, reason: 'outside_window' };
    if (dailySent >= DAILY_LIMIT) return { sent: 0, reason: 'daily_limit', sent_today: dailySent };
    if (!fs.existsSync(COOKIES_FILE)) return { sent: 0, reason: 'no_cookies' };

    console.log('[LinkedIn] Outreach...');
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    let sent = 0;

    try {
      await loadCookies(context);
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);

      const isLoggedIn = await page.title();
      if (isLoggedIn.includes('Entrar')) {
        // Tenta de novo com a ordem correta: navega → cookies → recarrega
        await context.clearCookies();
        await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (fs.existsSync(COOKIES_FILE)) {
          const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
          await context.addCookies(cookies);
        }
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
      }

      const title = await page.title();
      if (title.includes('Entrar')) {
        console.log('[LinkedIn] Cookies inválidos/expirados');
        return { sent: 0, reason: 'cookies_expired' };
      }
      console.log(`[LinkedIn] Logado: ${title}`);
      const remaining = DAILY_LIMIT - dailySent;

      for (const query of SEARCH_QUERIES) {
        if (sent >= remaining) break;
        try {
          await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`, 
            { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(4000);

          const connectBtns = await page.$$('button:has-text("Conectar")');
          for (const btn of connectBtns) {
            if (sent >= remaining) break;
            try {
              await btn.click();
              await page.waitForTimeout(2000);

              const addNote = await page.$('button:has-text("Adicionar nota")');
              if (addNote) {
                await addNote.click();
                await page.waitForTimeout(1000);
                const nameEl = await page.$('.send-invite__title, [class*="invite"] h2, [class*="modal"] strong');
                const name = nameEl ? (await nameEl.textContent())?.trim()?.split('\n')[0] || 'engenheiro' : 'engenheiro';
                const msg = await generateMessage({ name, headline: query });
                
                const textarea = await page.$('textarea[name="message"], textarea');
                if (textarea) {
                  await textarea.fill(msg.substring(0, 200));
                  await page.waitForTimeout(500);
                }

                const sendBtn = await page.$('button:has-text("Enviar")');
                if (sendBtn) {
                  await sendBtn.click();
                  sent++; dailySent++;
                  await saveProspect({ name, company: '' }, msg);
                  console.log(`[LinkedIn] ${name} (${sent}/${remaining})`);
                  await page.waitForTimeout(3000);
                }
              } else {
                const closeBtn = await page.$('button[aria-label="Fechar"], [class*="dismiss"]');
                if (closeBtn) await closeBtn.click();
                await page.waitForTimeout(1000);
              }
            } catch (e) {
              await page.waitForTimeout(2000);
            }
          }
        } catch (e) {
          console.error('[LinkedIn] Erro busca:', e.message);
        }
        await page.waitForTimeout(10000 + Math.random() * 15000);
      }
    } finally {
      await saveCookies(context);
      await browser.close();
    }

    console.log(`[LinkedIn] ${sent} convites (total hoje: ${dailySent})`);
    return { sent, daily_total: dailySent };
  } catch (err) {
    console.error('[LinkedIn] Fatal:', err.message);
    return { sent: 0, error: err.message };
  } finally {
    running = false;
  }
}

async function checkAcceptedAndFollowUp() {
  console.log('[LinkedIn] Verificando conexões...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  let followed = 0;

  try {
    await loadCookies(context);
    await page.goto('https://www.linkedin.com/mynetwork/invitation-manager/sent/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(5000);
    console.log(`[LinkedIn] Follow-up: ${followed}`);
  } catch (err) {
    console.error('[LinkedIn] Follow-up erro:', err.message);
  } finally {
    await browser.close();
  }
  return { followed };
}

function startLinkedInOutreach() {
  console.log('[LinkedIn] Worker iniciado — 15/dia, seg-sex, 10h-17h');
  setTimeout(async () => { await runOutreach(); }, 120_000);
  setInterval(async () => { await runOutreach(); }, 4 * 60 * 60_000);
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 11 && now.getMinutes() < 5) {
      await checkAcceptedAndFollowUp();
    }
  }, 5 * 60_000);
}

export { startLinkedInOutreach, runOutreach };
