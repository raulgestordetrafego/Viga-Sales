import axios from 'axios';

const N8N_URL = 'https://n8n.vigasales.shop';
const EMAIL = 'raulfs.sc@gmail.com';
const PASSWORD = process.env.N8N_PASSWORD || 'INSIRA_SENHA_AQUI';

const FLOWS_TO_ACTIVATE = [
  { id: 'ESQYI7HOWbVWfzY6', name: '2 - Viga Sales | Disparo WhatsApp com IA (20/dia)' },
  { id: 'haOqkk19aJYB9WVG', name: '3 - Viga Sales | Áudio de Prospecção' },
  { id: 'MPv6cdlaCqJqH5tp', name: '3 - Viga Sales | Follow-up Automático (3 dias)' },
  { id: 'r36f96fg6jmKK914', name: '4 - Viga Sales | Relatório Diário de Prospecção' }
];

async function main() {
  console.log('=== Verificando e Ativando Fluxos Necessários ===');
  
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

  for (const wf of FLOWS_TO_ACTIVATE) {
    try {
      const detailRes = await client.get(`/rest/workflows/${wf.id}`);
      const currentWf = detailRes.data?.data || detailRes.data;
      
      if (currentWf.description === null) {
        currentWf.description = '';
      }

      console.log(`Fluxo "${wf.name}" (ID: ${wf.id}) | Estado Atual: ${currentWf.active ? 'ATIVO' : 'INATIVO'}`);
      
      // Sempre tenta reativar para forçar o registro correto do cron se estiver desligado ou com erro
      console.log(`-> Forçando reativação de "${wf.name}"...`);
      try {
        await client.post(`/rest/workflows/${wf.id}/deactivate`, currentWf);
      } catch (e) {} // Ignora se já estiver inativo
      
      await client.post(`/rest/workflows/${wf.id}/activate`, currentWf);
      console.log(`   ✅ Ativado e registrado com sucesso!`);
    } catch (err) {
      console.error(`❌ Erro no fluxo "${wf.name}":`, err.response?.data || err.message);
    }
  }

  console.log('\n=== Verificação Concluída ===');
}

main();
