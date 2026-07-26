import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '..', 'db', 'linkedin_cookies.json');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'pt-BR',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);

    const emailField = page.getByRole('textbox', { name: /e-mail|email|usuário|user/i }).first();
    const passField = page.getByRole('textbox', { name: /senha|password/i }).first();
    
    await emailField.fill('raulfs.sc@gmail.com');
    await passField.fill('Senhapple2026*');
    
    await page.getByRole('button', { name: /entrar|sign in|login/i }).first().click();
    await page.waitForTimeout(8000);

    // Tira screenshot pra ver o que aconteceu
    await page.screenshot({ path: path.join(__dirname, '..', 'db', 'linkedin_result.png') });
    
    // Verifica mensagens de erro
    const errorText = await page.textContent('[role="alert"], .alert, #error-for-username, #error-for-password').catch(() => '');
    console.log('Erro na página:', errorText || 'Nenhum');
    console.log('URL:', page.url().substring(0, 100));
    console.log('Title:', await page.title());
    
    // Verifica se há desafio ou captcha
    const hasCaptcha = await page.locator('#captcha-internal, [data-testid="recaptcha"], .challenge').count();
    console.log('Captcha:', hasCaptcha > 0 ? 'SIM' : 'Não');
    
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    await browser.close();
  }
})();
