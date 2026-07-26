import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Raul';

const PHONES = ['5561981673657', '556181673657'];

async function main() {
  console.log('=== Verificando Números no WhatsApp via Evolution API ===');
  
  const api = axios.create({
    baseURL: EVOLUTION_API_URL,
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  try {
    console.log(`Verificando existência no WhatsApp para a instância ${EVOLUTION_INSTANCE}...`);
    // POST /chat/whatsappNumbers/:instance
    const res = await api.post(`/chat/whatsappNumbers/${EVOLUTION_INSTANCE}`, {
      numbers: PHONES
    });
    
    console.log('✅ Resposta de whatsappNumbers:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('❌ Erro no endpoint:', err.response?.data || err.message);
  }
}

main();
