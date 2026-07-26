import axios from 'axios';

const N8N_URL = 'https://n8n.vigasales.shop';
const EMAIL = 'raulfs.sc@gmail.com';
const PASSWORD = process.env.N8N_PASSWORD || 'INSIRA_SENHA_AQUI';
const FLOW_ID = 'ESQYI7HOWbVWfzY6';

async function main() {
  console.log('=== Executando manual do fluxo ===');
  
  // 1. Login no n8n
  let sessionCookie = '';
  try {
    const loginRes = await axios.post(`${N8N_URL}/rest/login`, {
      emailOrLdapLoginId: EMAIL,
      password: PASSWORD
    });

    const setCookie = loginRes.headers['set-cookie'];
    if (!setCookie) {
      if (loginRes.data?.data?.token) {
        sessionCookie = `n8n-auth=${loginRes.data.data.token}`;
      } else {
        console.error('Erro: Token não encontrado.');
        process.exit(1);
      }
    } else {
      sessionCookie = setCookie.map(c => c.split(';')[0]).join('; ');
    }
    console.log('✅ Login efetuado com sucesso!');
  } catch (err) {
    console.error('Erro no login:', err.message);
    process.exit(1);
  }

  const client = axios.create({
    baseURL: N8N_URL,
    headers: {
      'Cookie': sessionCookie,
      'Content-Type': 'application/json'
    }
  });

  // 2. Executar workflow
  try {
    console.log(`Disparando execução para ID: ${FLOW_ID}...`);
    // n8n private execution endpoint: POST /rest/workflows/:id/run
    const runRes = await client.post(`/rest/workflows/${FLOW_ID}/run`, {});
    console.log('✅ Execução manual iniciada com sucesso!', runRes.status);
  } catch (err) {
    console.error('❌ Erro ao disparar execução:', err.response?.data || err.message);
  }
}

main();
