import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Raul';

const PHONE = '556232887077'; // Barão's phone number

async function main() {
  console.log(`=== Verificando Mensagens para Barão (${PHONE}) ===`);
  const api = axios.create({
    baseURL: EVOLUTION_API_URL,
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  try {
    const chatId = `${PHONE}@s.whatsapp.net`;
    const res = await api.post(`/chat/findMessages/${EVOLUTION_INSTANCE}`, {
      where: { key: { remoteJid: chatId } },
      limit: 3
    });

    const records = res.data?.messages?.records || [];
    console.log(`Encontradas ${records.length} mensagens.`);
    
    for (const msg of records) {
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Mídia/Outro]';
      const fromMe = msg.key?.fromMe;
      const lastUpdate = msg.MessageUpdate && msg.MessageUpdate.length > 0 
        ? msg.MessageUpdate[msg.MessageUpdate.length - 1].status 
        : 'PENDING';
      const status = msg.status || lastUpdate || 'Desconhecido';
      console.log(`- ${fromMe ? 'Enviado' : 'Recebido'} | Status: ${status} | "${text.substring(0, 70)}..."`);
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

main();
