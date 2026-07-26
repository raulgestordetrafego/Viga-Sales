/**
 * INSTAGRAM OUTREACH WORKER — Prospecção via Instagram
 * 
 * Estratégia: Follow + Like + DM coordenados
 * - Dia 1: Segue perfil
 * - Dia 2: Curte 2 posts
 * - Dia 3: Envia DM personalizada
 * 
 * Limite: 20 ações/dia (seg-sex, 10h-17h)
 * Cookies: exportar do navegador → db/instagram_cookies.json
 */

import { chromium } from 'playwright';
import { query, queryOne, run } from '../db/database.js';
import { chatContent } from './llm.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '..', '..', 'db', 'instagram_cookies.json');
const STATE_FILE = path.join(__dirname, '..', '..', 'db', 'instagram_state.json');
const DAILY_LIMIT = 20;
const HASHTAGS = [
  'construtoraBrasilia',
  'engenhariaDF',
  'arquiteturaBrasilia',
  'construcaoCivilDF',
  'engenheiroCivil',
  'reformaBrasilia',
  'obrasDF',
  'constructora',
  'engenhariaCivil',
  'projetosarquitetura',
];

let running = false;
let dailyCount = 0;
let dailyResetDate = new Date().toDateString();

function resetDailyIfNewDay() {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyCount = 0;
    dailyResetDate = today;
  }
}

function isWithinWindow() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 10 && hour < 20;
}

async function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return { followed: {}, liked: {}, dmSent: {} };
}

async function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadCookies(context) {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
      await context.addCookies(cookies);
      console.log(`[Instagram] ${cookies.length} cookies`);
      return true;
    }
  } catch (err) {
    console.error('[Instagram] Erro cookies:', err.message);
  }
  return false;
}

async function saveCookies(context) {
  try {
    const dir = path.dirname(COOKIES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  } catch (err) {}
}

async function generateDM(profile) {
  try {
    const prompt = `Mensagem de DM do Instagram em português, de Raul Santos da Viga Sales (automação comercial pra construtoras). Tom casual, NÃO parece venda fria. Curto (máx 120 caracteres). Contexto: perfil "${profile.username}", ${profile.bio || 'construção'}.`;
    const content = await chatContent({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8, max_tokens: 150,
    });
    return content?.trim()?.substring(0, 150) || 'Vi teu perfil e curti teus projetos! Trabalho com automação pra construtoras aqui em Brasília. Bora trocar ideia?';
  } catch {
    return 'Curto muito teu trabalho! Sou de Brasília também, bora se conectar?';
  }
}

async function saveLead(profile) {
  try {
    const name = profile.username || profile.fullName || 'Instagram';
    const existing = await queryOne("SELECT id FROM prospects WHERE instagram = ?", [profile.username]).catch(() => null);
    if (existing) return;

    await run(
      `INSERT INTO prospects (id, name, phone, company, city, state, instagram, source, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'instagram', 'novo', ?, datetime('now'))`,
      [uuidv4(), name, '', profile.bio || '', 'Brasília', 'DF', profile.username, profile.bio || '']
    );
  } catch (err) {
    console.error('[Instagram] Erro lead:', err.message);
  }
}

async function runInstagramOutreach() {
  if (running) return { actions: 0, reason: 'already_running' };
  running = true;

  try {
    resetDailyIfNewDay();
    if (!isWithinWindow()) return { actions: 0, reason: 'outside_window' };
    if (dailyCount >= DAILY_LIMIT) return { actions: 0, reason: 'daily_limit' };
    if (!fs.existsSync(COOKIES_FILE)) return { actions: 0, reason: 'no_cookies' };

    console.log('[Instagram] Outreach...');
    const state = await loadState();
    let actions = 0;

    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 390, height: 844 }, // mobile view (Instagram)
    });
    const page = await context.newPage();

    try {
      // Login via cookies
      await page.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      if (fs.existsSync(COOKIES_FILE)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
        await context.addCookies(cookies);
      }
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);

      const title = await page.title();
      if (title.includes('Login')) {
        console.log('[Instagram] Não logado — renove cookies');
        return { actions: 0, reason: 'not_logged_in' };
      }
      console.log(`[Instagram] Logado: ${title}`);

      // Processa cada hashtag
      for (const tag of HASHTAGS) {
        if (actions >= DAILY_LIMIT - dailyCount) break;

        try {
          await page.goto(`https://www.instagram.com/explore/tags/${tag}/`, 
            { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(5000);

          // Clica nos posts da hashtag
          const posts = await page.$$('article a[href*="/p/"], article a[href*="/reel/"]');
          for (const post of posts.slice(0, 5)) {
            if (actions >= DAILY_LIMIT - dailyCount) break;

            try {
              await post.click();
              await page.waitForTimeout(3000);

              // Pega username do dono do post
              const usernameEl = await page.$('header a[href*="/"][tabindex]');
              const username = usernameEl ? (await usernameEl.textContent())?.trim() : null;
              if (!username) { await page.waitForTimeout(1000); continue; }

              // Pula se já interagiu hoje
              if (state.followed[username] || state.dmSent[username]) {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
                continue;
              }

              // Dia 1: Follow
              if (!state.followed[username]) {
                const followBtn = await page.$('button:has-text("Seguir"), button:has-text("Follow")');
                if (followBtn) {
                  await followBtn.click();
                  state.followed[username] = new Date().toISOString();
                  actions++; dailyCount++;
                  console.log(`[Instagram] Follow: @${username} (${actions}/${DAILY_LIMIT - dailyCount + actions})`);
                  await page.waitForTimeout(2000);
                }
              }

              // Dia 2: Like (se já seguiu há mais de 24h)
              const followedDate = state.followed[username];
              if (followedDate && !state.liked[username]) {
                const hoursSinceFollow = (Date.now() - new Date(followedDate).getTime()) / 3600000;
                if (hoursSinceFollow >= 24) {
                  const likeBtn = await page.$('button svg[aria-label="Curtir"], button svg[aria-label="Like"], button[type="button"] svg[aria-label*="Like"]');
                  if (likeBtn) {
                    await likeBtn.click();
                    state.liked[username] = new Date().toISOString();
                    actions++; dailyCount++;
                    console.log(`[Instagram] Like: @${username}`);
                    await page.waitForTimeout(2000);
                  }
                }
              }

              // Dia 3: DM (se já curtiu há mais de 48h)
              const likedDate = state.liked[username];
              if (likedDate && !state.dmSent[username]) {
                const hoursSinceLike = (Date.now() - new Date(likedDate).getTime()) / 3600000;
                if (hoursSinceLike >= 48) {
                  // Navega pro perfil pra enviar DM
                  await page.goto(`https://www.instagram.com/${username}/`, 
                    { waitUntil: 'domcontentloaded', timeout: 10000 });
                  await page.waitForTimeout(3000);

                  const msgBtn = await page.$('button:has-text("Mensagem"), button:has-text("Message"), div[role="button"]:has-text("Enviar mensagem")');
                  if (msgBtn) {
                    await msgBtn.click();
                    await page.waitForTimeout(3000);

                    const textarea = await page.$('textarea, div[role="textbox"], p[data-lexical-editor]');
                    if (textarea) {
                      const msg = await generateDM({ username });
                      await textarea.fill(msg);
                      await page.waitForTimeout(1000);
                      
                      const sendBtn = await page.$('button:has-text("Enviar"), button svg[aria-label*="Enviar"]');
                      if (sendBtn) {
                        await sendBtn.click();
                        state.dmSent[username] = new Date().toISOString();
                        actions++; dailyCount++;
                        await saveLead({ username });
                        console.log(`[Instagram] DM: @${username}`);
                        await page.waitForTimeout(5000);
                      }
                    }
                  }
                }
              }

              // Fecha o post atual
              await page.keyboard.press('Escape');
              await page.waitForTimeout(2000);

            } catch (e) {
              await page.keyboard.press('Escape').catch(() => {});
              await page.waitForTimeout(2000);
            }
          }
        } catch (e) {
          console.error(`[Instagram] Erro #${tag}:`, e.message);
        }

        await page.waitForTimeout(15000 + Math.random() * 15000);
      }

    } finally {
      await saveState(state);
      await saveCookies(context);
      await browser.close();
    }

    console.log(`[Instagram] ${actions} ações (total hoje: ${dailyCount})`);
    return { actions, daily_total: dailyCount };
  } catch (err) {
    console.error('[Instagram] Fatal:', err.message);
    return { actions: 0, error: err.message };
  } finally {
    running = false;
  }
}

function startInstagramOutreach() {
  console.log('[Instagram] Worker iniciado — 20/dia, seg-sex, 10h-20h');
  setTimeout(async () => { await runInstagramOutreach(); }, 300_000); // 5 min
  setInterval(async () => { await runInstagramOutreach(); }, 6 * 60 * 60_000); // 6h
}

export { startInstagramOutreach, runInstagramOutreach };
