import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const N8N_URL = 'https://n8n.vigasales.shop';
const EMAIL = 'raulfs.sc@gmail.com';
const PASSWORD = process.env.N8N_PASSWORD || 'INSIRA_SENHA_AQUI';

const workflowFiles = [
  { path: '../deploy/n8n-flows/flow2-whatsapp-dispatch.json', name: '2 - Viga Sales | Disparo WhatsApp com IA (40/dia)' },
  { path: '../deploy/n8n-flows/flow2b-engenheiros-xlsx.json', name: '2b - Viga Sales | Disparo Engenheiros (XLSX, 40/dia)' },
  { path: '../deploy/n8n-flows/flow3-followup.json', name: '3 - Viga Sales | Follow-up Automático (3 dias)' },
  { path: '../deploy/n8n-flows/flow4-relatorio-diario.json', name: '4 - Viga Sales | Relatório Diário de Prospecção' },
  { path: '../n8n-audio-workflow.json', name: '3 - Viga Sales | Áudio de Prospecção' }
];

async function main() {
  console.log('=== Iniciando Importação de Fluxos n8n ===');
  
  // 1. Login no n8n para obter o cookie de sessão
  let sessionCookie = '';
  try {
    console.log(`Tentando logar em ${N8N_URL}/rest/login ...`);
    const loginRes = await axios.post(`${N8N_URL}/rest/login`, {
      emailOrLdapLoginId: EMAIL,
      password: PASSWORD
    }, {
      validateStatus: false
    });

    if (loginRes.status !== 200) {
      console.error(`Erro de login: Status ${loginRes.status}`);
      console.error('Resposta:', loginRes.data);
      process.exit(1);
    }

    const setCookie = loginRes.headers['set-cookie'];
    if (!setCookie || setCookie.length === 0) {
      // Tenta ler token de auth no corpo do json se não vier no set-cookie
      if (loginRes.data?.data?.token) {
        sessionCookie = `n8n-auth=${loginRes.data.data.token}`;
      } else {
        console.error('Erro: Cookie de sessão ou token não encontrado na resposta.');
        process.exit(1);
      }
    } else {
      sessionCookie = setCookie.map(c => c.split(';')[0]).join('; ');
    }
    
    console.log('✅ Login efetuado com sucesso!');
  } catch (err) {
    console.error('Erro ao conectar ao n8n:', err.message);
    process.exit(1);
  }

  const client = axios.create({
    baseURL: N8N_URL,
    headers: {
      'Cookie': sessionCookie,
      'Content-Type': 'application/json'
    }
  });

  // 2. Buscar fluxos existentes no n8n
  let existingWorkflows = [];
  try {
    console.log('Buscando fluxos existentes no n8n...');
    const listRes = await client.get('/rest/workflows');
    existingWorkflows = listRes.data?.data || listRes.data || [];
    console.log(`✅ Encontrados ${existingWorkflows.length} fluxos no n8n.`);
  } catch (err) {
    console.error('Erro ao buscar fluxos do n8n:', err.message);
    process.exit(1);
  }

  // 3. Processar cada fluxo
  for (const wf of workflowFiles) {
    const fullPath = path.resolve(__dirname, wf.path);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ Arquivo não encontrado: ${wf.path}. Pulando...`);
      continue;
    }

    let localWf;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      localWf = JSON.parse(content);
    } catch (err) {
      console.error(`❌ Erro ao ler/parsear arquivo ${wf.path}:`, err.message);
      continue;
    }

    // Procura por um fluxo existente com o mesmo nome
    const targetName = localWf.name || wf.name;
    const existing = existingWorkflows.find(w => w.name === targetName);

    const payload = {
      name: targetName,
      nodes: localWf.nodes || [],
      connections: localWf.connections || {},
      settings: localWf.settings || {},
      staticData: localWf.staticData || null,
      meta: localWf.meta || {},
      tags: [] // Esvazia tags para evitar erro de validação Zod no n8n
    };

    if (existing) {
      console.log(`Atualizando fluxo existente "${targetName}" (ID: ${existing.id})...`);
      try {
        await client.patch(`/rest/workflows/${existing.id}`, payload);
        console.log(`✅ Fluxo "${targetName}" atualizado com sucesso!`);
      } catch (err) {
        console.error(`❌ Erro ao atualizar fluxo "${targetName}":`, err.response?.data || err.message);
      }
    } else {
      console.log(`Criando novo fluxo "${targetName}"...`);
      try {
        await client.post('/rest/workflows', payload);
        console.log(`✅ Fluxo "${targetName}" criado com sucesso!`);
      } catch (err) {
        console.error(`❌ Erro ao criar fluxo "${targetName}":`, err.response?.data || err.message);
      }
    }
  }

  console.log('\n=== Processo de Importação Concluído ===');
}

main();
