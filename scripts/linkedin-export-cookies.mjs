/**
 * Exporta cookies do LinkedIn após login manual.
 * Aguarda automaticamente o cookie li_at (auth token) aparecer.
 * 
 * Uso: node scripts/linkedin-export-cookies.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '..', 'db', 'linkedin_cookies.json');

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://www.linkedin.com/login');

console.log('\n🔐 Faça login no LinkedIn na janela que abriu.');
console.log('   Aguarde até ver a página inicial (feed de notícias).');
console.log('   O script detecta automaticamente quando você logar.\n');

// Aguarda o cookie li_at aparecer (sinal de login bem-sucedido)
let attempts = 0;
while (attempts < 120) {
  await new Promise(r => setTimeout(r, 2000));
  const cookies = await context.cookies();
  const liAt = cookies.find(c => c.name === 'li_at');
  
  if (liAt) {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log(`\n✅ Login detectado! ${cookies.length} cookies salvos (li_at presente)`);
    console.log(`   Arquivo: db/linkedin_cookies.json`);
    console.log(`   Copie pra VPS: scp db/linkedin_cookies.json root@187.77.235.195:/opt/viga-sales/db/`);
    console.log(`   Depois: ssh root@187.77.235.195 "docker cp /opt/viga-sales/db/linkedin_cookies.json viga-sales-viga-sales-1:/app/db/"`);
    await browser.close();
    process.exit(0);
  }
  
  if (attempts % 10 === 0 && attempts > 0) {
    console.log(`   Aguardando login... (${Math.floor(attempts * 2)}s)`);
  }
  attempts++;
}

console.log('\n⏱️ Timeout (4 min). Feche o navegador e tente novamente.');
await browser.close();
process.exit(1);
