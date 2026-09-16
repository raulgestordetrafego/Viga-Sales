/**
 * Gera o GOOGLE_ADS_REFRESH_TOKEN (escopo adwords) para o serviço do hub.
 *
 * Reusa o mesmo OAuth client do GTM/Search Console (GOOGLE_OAUTH_CLIENT_ID/SECRET,
 * projeto "Cliente Web 1_automacoes google ads"), cuja redirect URI registrada é
 * http://localhost:8765/.
 *
 * Uso:
 *   node scripts/google-ads-oauth.mjs
 *   (ou: GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/google-ads-oauth.mjs)
 *
 * Faça login com a conta Google que tem acesso ao Google Ads (MCC).
 * O refresh token é impresso e salvo em .google-ads-refresh-token.txt (não commitar).
 */
import http from 'http';
import fs from 'fs';
import { URL, URLSearchParams } from 'url';
import axios from 'axios';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const REDIRECT = 'http://localhost:8765/';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Faltam GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (veja o .env).');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
}).toString();

console.log('\n1) Abra esta URL no navegador (logado na conta com acesso ao Google Ads):\n');
console.log(authUrl + '\n');
console.log('2) Autorize. Você será redirecionado para localhost:8765.\n');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  const error = u.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro: ' + error);
    console.error('Erro no consentimento:', error);
    server.close();
    return;
  }
  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Aguardando o callback do Google...');
    return;
  }

  try {
    const { data } = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    );
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK! Pode fechar esta aba e voltar ao terminal.');

    if (!data.refresh_token) {
      console.error('\nO Google NÃO devolveu refresh_token. Rode de novo (o prompt=consent força novo).');
    } else {
      console.log('\n=== GOOGLE_ADS_REFRESH_TOKEN ===\n' + data.refresh_token + '\n');
      fs.writeFileSync('.google-ads-refresh-token.txt', data.refresh_token);
      console.log('Salvo em .google-ads-refresh-token.txt (não commitar).');
    }
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro ao trocar o code pelo token.');
    console.error(e?.response?.data || e.message);
  } finally {
    setTimeout(() => server.close(), 800);
  }
});

server.listen(8765, () => console.log('Aguardando callback em ' + REDIRECT + ' ...'));
