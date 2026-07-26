/**
 * Exporta cookies do Instagram após login manual.
 * Detecta automaticamente quando logar.
 * 
 * Uso: node scripts/instagram-export-cookies.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '..', 'db', 'instagram_cookies.json');

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

await page.goto('https://www.instagram.com/accounts/login/');

console.log('\n📸 Faça login no Instagram na janela que abriu.');
console.log('   Aguarde até ver o feed. O script detecta automaticamente.\n');

let attempts = 0;
while (attempts < 120) {
  await new Promise(r => setTimeout(r, 2000));
  const cookies = await context.cookies();
  const sessionId = cookies.find(c => c.name === 'sessionid');
  
  if (sessionId && sessionId.value?.length > 10) {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log(`\n✅ Login detectado! ${cookies.length} cookies salvos (sessionid presente)`);
    console.log(`   Arquivo: db/instagram_cookies.json`);
    console.log(`   Copie pra VPS: scp db/instagram_cookies.json root@187.77.235.195:/opt/viga-sales/db/`);
    await browser.close();
    process.exit(0);
  }
  
  if (attempts % 10 === 0 && attempts > 0) {
    console.log(`   Aguardando login... (${Math.floor(attempts * 2)}s)`);
  }
  attempts++;
}

console.log('\n⏱️ Timeout. Feche o navegador e tente novamente.');
await browser.close();
process.exit(1);
