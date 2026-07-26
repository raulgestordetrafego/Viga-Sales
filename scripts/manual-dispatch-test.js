import axios from 'axios';

const VIGA_URL = 'https://vigasales.shop';
const INTERNAL_TOKEN = process.env.VIGA_INTERNAL_TOKEN || 'INSIRA_TOKEN_AQUI';
const EVO_URL = 'https://evolution.vigasales.shop';
const EVO_KEY = '95DCBAE58704-4635-B772-948B83A853E1';
const EVO_INSTANCE = 'Raul';

const PROSPECT_ID = '0318bd85-b713-492d-943c-d7716748e113';
const CAMPAIGN_ID = '31c7bfd3-092b-4fea-9278-a1b4027761cc';

async function main() {
  console.log('=== Iniciando Disparo de Teste Manual para Tania ===');

  try {
    // 1. Gerar mensagem com IA
    console.log(`1. Gerando mensagem de IA para o prospect ${PROSPECT_ID}...`);
    const genRes = await axios.post(`${VIGA_URL}/api/prospects/${PROSPECT_ID}/generate-message`, {}, {
      headers: { 'x-internal-key': INTERNAL_TOKEN }
    });
    const message = genRes.data.message;
    console.log(`✅ Mensagem Gerada:\n"${message}"\n`);

    // Fetch details to get phone
    console.log('Buscando telefone do prospect...');
    const detailRes = await axios.get(`${VIGA_URL}/api/prospects/${PROSPECT_ID}`, {
      headers: { 'x-internal-key': INTERNAL_TOKEN }
    });
    const phone = detailRes.data.phone;
    console.log(`Telefone: ${phone}`);

    // 2. Enviar via Evolution API
    console.log(`2. Enviando mensagem via Evolution API para ${phone}...`);
    const sendRes = await axios.post(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      number: phone,
      text: message
    }, {
      headers: {
        'apikey': EVO_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Resposta de envio:', JSON.stringify(sendRes.data));

    // 3. Atualizar status no Viga Sales para 'enviado'
    console.log('3. Atualizando status no Viga Sales para "enviado"...');
    const statusRes = await axios.patch(`${VIGA_URL}/api/prospects/${PROSPECT_ID}/status`, {
      status: 'enviado',
      campaign_id: CAMPAIGN_ID,
      message: message
    }, {
      headers: { 
        'x-internal-key': INTERNAL_TOKEN,
        'Content-Type': 'application/json' 
      }
    });
    console.log('✅ Status atualizado com sucesso!', JSON.stringify(statusRes.data));
    console.log('\n=== Teste Concluído com Sucesso! ===');
  } catch (err) {
    console.error('❌ Ocorreu um erro no teste:', err.response?.data || err.message);
  }
}

main();
