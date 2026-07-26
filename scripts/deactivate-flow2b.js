import axios from 'axios';

const N8N_URL = 'https://n8n.vigasales.shop';
const EMAIL = 'raulfs.sc@gmail.com';
const PASSWORD = process.env.N8N_PASSWORD || 'INSIRA_SENHA_AQUI';
const FLOW_2B_ID = 'PUMVrvOjqgifNpi5';

async function main() {
  console.log('=== Desativando Fluxo 2b no n8n ===');
  
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
        console.error('Erro: Token de sessão não encontrado.');
        process.exit(1);
      }
    } else {
      sessionCookie = setCookie.map(c => c.split(';')[0]).join('; ');
    }
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

  // 2. Obter detalhes
  let fullWf;
  try {
    const detailRes = await client.get(`/rest/workflows/${FLOW_2B_ID}`);
    fullWf = detailRes.data?.data || detailRes.data;
    if (fullWf && fullWf.description === null) {
      fullWf.description = '';
    }
  } catch (err) {
    console.error('Erro ao obter detalhes do fluxo:', err.message);
    process.exit(1);
  }

  // 3. Desativar
  try {
    await client.post(`/rest/workflows/${FLOW_2B_ID}/deactivate`, fullWf);
    console.log('✅ Fluxo 2b (Disparo Engenheiros) desativado com sucesso!');
  } catch (err) {
    console.error('Erro ao desativar fluxo:', err.response?.data || err.message);
  }
}

main();
