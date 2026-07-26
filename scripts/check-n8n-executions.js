import axios from 'axios';

const N8N_URL = 'https://n8n.vigasales.shop';
const EMAIL = 'raulfs.sc@gmail.com';
const PASSWORD = process.env.N8N_PASSWORD || 'INSIRA_SENHA_AQUI';
const FLOW_ID = 'ESQYI7HOWbVWfzY6';

async function main() {
  console.log('=== Buscando Histórico de Execuções do n8n ===');
  
  // 1. Login no n8n
  let sessionCookie = '';
  try {
    const loginRes = await axios.post(`${N8N_URL}/rest/login`, {
      emailOrLdapLoginId: EMAIL,
      password: PASSWORD
    });

    const setCookie = loginRes.headers['set-cookie'];
    if (setCookie) {
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

  // 2. Buscar execuções
  try {
    const execsRes = await client.get('/rest/executions', {
      params: { workflowId: FLOW_ID, limit: 10 }
    });
    
    console.log('Dados recebidos:', JSON.stringify(execsRes.data, null, 2));
  } catch (err) {
    console.error('❌ Erro ao buscar execuções:', err.response?.data || err.message);
  }
}

main();
