import axios from 'axios';

const N8N_URL = 'https://n8n.vigasales.shop';
const EMAIL = 'raulfs.sc@gmail.com';
const PASSWORD = process.env.N8N_PASSWORD || 'INSIRA_SENHA_AQUI';

const workflowPrefixes = [
  '2 - Viga Sales',
  '2b - Viga Sales',
  '3 - Viga Sales',
  '4 - Viga Sales'
];

async function main() {
  console.log('=== Iniciando Ativação de Fluxos n8n ===');
  
  // 1. Login no n8n
  let sessionCookie = '';
  try {
    console.log(`Logando em ${N8N_URL}/rest/login ...`);
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

  // 2. Buscar todos os fluxos
  let workflows = [];
  try {
    const listRes = await client.get('/rest/workflows');
    workflows = listRes.data?.data || listRes.data || [];
  } catch (err) {
    console.error('Erro ao buscar fluxos:', err.message);
    process.exit(1);
  }

  // 3. Filtrar e ativar
  const targetWorkflows = workflows.filter(w => 
    workflowPrefixes.some(prefix => w.name.startsWith(prefix))
  );

  console.log(`Encontrados ${targetWorkflows.length} fluxos do Viga Sales para ativar.\n`);

  for (const wf of targetWorkflows) {
    console.log(`Ativando fluxo "${wf.name}" (ID: ${wf.id})...`);
    let activated = false;
    
    let fullWf;
    try {
      // Busca os detalhes completos do fluxo para obter o versionId válido
      const detailRes = await client.get(`/rest/workflows/${wf.id}`);
      fullWf = detailRes.data?.data || detailRes.data;
      if (fullWf && fullWf.description === null) {
        fullWf.description = '';
      }
    } catch (err) {
      console.error(`❌ Erro ao obter detalhes do fluxo "${wf.name}":`, err.message);
      continue;
    }

    // Tentativa 1: POST /rest/workflows/:id/activate (Padrão do n8n v1+)
    try {
      await client.post(`/rest/workflows/${wf.id}/activate`, fullWf);
      console.log(`✅ Fluxo "${wf.name}" ativado com sucesso!`);
      activated = true;
    } catch (err) {
      console.error(`❌ Erro ao ativar fluxo "${wf.name}":`, err.response?.data || err.message);
    }
  }

  console.log('\n=== Ativação Concluída ===');
}

main();
