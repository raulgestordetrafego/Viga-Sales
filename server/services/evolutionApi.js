import axios from 'axios';

const getBaseUrl = () => process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const getApiKey = () => process.env.EVOLUTION_API_KEY || '';
const getInstance = () => process.env.EVOLUTION_INSTANCE || 'default';

const getApi = () => axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'apikey': getApiKey(),
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─── Instância ──────────────────────────────────────────────────────────────

export async function getInstanceStatus() {
  const instance = getInstance();
  const res = await getApi().get(`/instance/connectionState/${instance}`);
  return res.data;
}

export async function getQRCode() {
  const instance = getInstance();
  const res = await getApi().get(`/instance/connect/${instance}`);
  return res.data;
}

export async function configureWebhook(webhookUrl) {
  const instance = getInstance();
  const api = getApi();
  
  const events = [
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'CONNECTION_UPDATE',
    'SEND_MESSAGE'
  ];

  const attempts = [
    { 
      name: 'Wrapped Payload (v1/v2 Standard)', 
      url: `/webhook/set/${instance}`, 
      data: { 
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          events: events
        }
      } 
    },
    { 
      name: 'Flat Payload (v2 Alternative)', 
      url: `/webhook/set/${instance}`, 
      data: { 
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events: events
      } 
    },
    { 
      name: 'v2 Instance Set', 
      url: `/webhook/instance/set`, 
      data: { 
        instance: instance,
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events: events
      } 
    }
  ];

  let lastError = null;
  let lastResponseData = null;

  for (const attempt of attempts) {
    try {
      console.log(`[Evolution] Attempting ${attempt.name} at ${attempt.url}`);
      const res = await api.post(attempt.url, attempt.data);
      console.log(`[Evolution] Success with ${attempt.name}`);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.warn(`[Evolution] ${attempt.name} failed: ${status || err.message}`);
      if (data) console.warn(`[Evolution] Error details:`, JSON.stringify(data));
      lastError = err;
      lastResponseData = data;
    }
  }

  console.error(`[Evolution] All webhook configuration attempts failed.`);
  // Throw a more descriptive error if we have one
  if (lastResponseData && lastResponseData.message) {
    throw new Error(`Evolution API Error: ${lastResponseData.message}`);
  }
  throw lastError;
}

// ─── Enviar Mensagens ────────────────────────────────────────────────────────

export async function sendTextMessage(phone, text) {
  const instance = getInstance();
  const formattedPhone = formatPhone(phone);
  console.log(`[Evolution] Sending text to ${phone} (formatted: ${formattedPhone})`);
  const res = await getApi().post(`/message/sendText/${instance}`, {
    number: formattedPhone,
    text,
    delay: 1200,
  });
  return res.data;
}

export async function sendTextMessageFromInstance(instanceName, phone, text) {
  const formattedPhone = formatPhone(phone);
  console.log(`[Evolution] Sending text via instance "${instanceName}" to ${phone} (formatted: ${formattedPhone})`);
  const res = await getApi().post(`/message/sendText/${instanceName}`, {
    number: formattedPhone,
    text,
    delay: 1200,
  });
  return res.data;
}

export async function sendImageMessage(phone, imageData, caption = '', mimetype = 'image/jpeg') {
  const instance = getInstance();
  let media = imageData;
  let mt = mimetype;

  // Se for data URI, extrai base64 puro e mimetype
  if (imageData && imageData.startsWith('data:')) {
    const idx = imageData.indexOf(';base64,');
    if (idx !== -1) {
      mt = imageData.slice(5, idx).split(';')[0]; // ex: "image/jpeg"
      media = imageData.slice(idx + 8);           // base64 puro
    }
  }

  const ext = mt.split('/')[1] || 'jpg';
  console.log(`[Evolution] sendImageMessage: mediatype=image, mimetype=${mt}, mediaLen=${media.length}`);

  const res = await getApi().post(`/message/sendMedia/${instance}`, {
    number: formatPhone(phone),
    mediatype: 'image',
    mimetype: mt,
    media,
    caption: caption || '',
    fileName: `image.${ext}`,
  });
  return res.data;
}

export async function sendDocumentMessage(phone, documentUrl, fileName) {
  const instance = getInstance();
  const res = await getApi().post(`/message/sendMedia/${instance}`, {
    number: formatPhone(phone),
    mediatype: 'document',
    media: documentUrl,
    fileName,
  });
  return res.data;
}

export async function sendAudioMessage(phone, audioUrl) {
  const instance = getInstance();
  // sendWhatsAppAudio envia como mensagem de voz (PTT), encoding:true converte para opus/ogg
  const res = await getApi().post(`/message/sendWhatsAppAudio/${instance}`, {
    number: formatPhone(phone),
    audio: audioUrl,
    encoding: true,
  });
  return res.data;
}

export async function sendTemplateMessage(phone, template) {
  const instance = getInstance();
  const res = await getApi().post(`/message/sendButtons/${instance}`, {
    number: formatPhone(phone),
    ...template,
  });
  return res.data;
}

// ─── Buscar histórico ────────────────────────────────────────────────────────

export async function fetchMessages(chatId, limit = 50) {
  const instance = getInstance();
  const res = await getApi().get(`/chat/fetchMessages/${instance}`, {
    params: { where: { key: { remoteJid: chatId } }, limit },
  });
  return res.data;
}

export async function fetchChats(limit = 100) {
  const instance = getInstance();
  const res = await getApi().get(`/chat/findChats/${instance}`, {
    params: { limit },
  });
  return res.data;
}

// ─── Contatos ────────────────────────────────────────────────────────────────

export async function fetchContacts() {
  const instance = getInstance();
  const res = await getApi().get(`/contact/findContacts/${instance}`);
  return res.data;
}

export async function getContactInfo(phone) {
  const instance = getInstance();
  const res = await getApi().post(`/contact/fetchContacts/${instance}`, {
    where: { id: formatPhone(phone) },
  });
  return res.data;
}

export async function getBase64FromMediaMessage(rawMsg) {
  const instance = getInstance();
  const res = await getApi().post(`/chat/getBase64FromMediaMessage/${instance}`, {
    message: { key: rawMsg.key, message: rawMsg.message },
  });
  return res.data; // { base64: "...", mimetype: "audio/ogg; codecs=opus", ... }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatPhone(phone) {
  // Se já é um JID completo (grupo ou contato), retorna direto
  if (typeof phone === 'string' && (phone.endsWith('@g.us') || phone.endsWith('@s.whatsapp.net'))) {
    return phone;
  }
  // Remove tudo que não é número
  let cleaned = String(phone).replace(/\D/g, '');
  // Se não tem código do país, adiciona 55 (Brasil)
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  return cleaned + '@s.whatsapp.net';
}

export function parseIncomingWebhook(payload) {
  if (!payload) return null;

  console.log("RAW WEBHOOK EVENT:", payload.event || payload.type);

  // Evolution API v2 often nests data inside data
  const event = (payload.event || payload.type)?.toLowerCase();
  let data = payload.data || payload.body || payload;
  
  // If data has another data property, it's double nested
  if (data && data.data && !data.key && !data.messages) {
    data = data.data;
  }

  if (!event || !data) {
    console.log("Invalid webhook payload structure - Event:", event, "Data exists:", !!data);
    return null;
  }

  const isMessageUpsert = event.includes('messages.upsert') || 
                          event.includes('messages_upsert') || 
                          event === 'message' || 
                          event === 'messages';

  if (isMessageUpsert) {
    // Find the message object in various possible locations
    const msg = Array.isArray(data) ? data[0] : (data.messages ? data.messages[0] : data);
    
    if (!msg || !msg.key) {
      console.log("Message data not found in payload for event:", event, "Keys available:", Object.keys(data));
      return null;
    }

    const fromMe = msg.key?.fromMe || false;
    console.log(`Parsing message ID: ${msg.key?.id} | fromMe: ${fromMe} | Event: ${event}`);

    return {
      event: 'message',
      instance: payload.instance || payload.instanceName || data.instanceName || null,
      messageId: msg.key?.id,
      chatId: msg.key?.remoteJid,
      fromMe: fromMe,
      phone: msg.key?.remoteJid?.split('@')[0],
      pushName: msg.pushName || 'Contato WhatsApp',
      type: getMessageType(msg),
      content: extractContent(msg),
      timestamp: new Date((msg.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
      raw: msg,
    };
  }

  if (event.includes('connection.update') || event.includes('connection_update')) {
    const connData = data.data || data;
    console.log("Connection update event:", connData.state || connData.status);
    return {
      event: 'connection',
      state: connData.state || connData.status,
      statusReason: connData.statusReason,
    };
  }

  if (event.includes('contacts.upsert') || event.includes('contacts_upsert')) {
    const list = Array.isArray(data) ? data : [data];
    const contacts = list.map(c => ({
      phone: (c.id || c.remoteJid || '').split('@')[0],
      name: c.pushName || c.name || c.notify || null,
    })).filter(c => c.phone && c.name);
    if (contacts.length > 0) {
      console.log(`[contacts.upsert] ${contacts.length} contato(s) recebidos`);
      return { event: 'contacts_upsert', contacts };
    }
  }

  console.log("Ignored webhook event type:", event);
  return null;
}

function getMessageType(msg) {
  const message = msg.message;
  if (!message) return 'unknown';
  
  // Handle various message wrappers
  const content = message.ephemeralMessage?.message || 
                  message.viewOnceMessage?.message || 
                  message.viewOnceMessageV2?.message || 
                  message.viewOnceMessageV2Extension?.message ||
                  message;

  if (content.conversation || content.extendedTextMessage) return 'text';
  if (content.imageMessage) return 'image';
  if (content.videoMessage) return 'video';
  if (content.audioMessage || content.pttMessage) return 'audio';
  if (content.documentMessage || content.documentWithCaptionMessage) return 'document';
  if (content.stickerMessage) return 'sticker';
  if (content.locationMessage) return 'location';
  if (content.contactMessage || content.contactsArrayMessage) return 'contact';
  if (content.protocolMessage) return 'protocol';
  return 'unknown';
}

function extractContent(msg) {
  const message = msg.message;
  if (!message) return '[mídia]';

  // Handle various message wrappers
  const content = message.ephemeralMessage?.message || 
                  message.viewOnceMessage?.message || 
                  message.viewOnceMessageV2?.message || 
                  message.viewOnceMessageV2Extension?.message ||
                  message;

  // Try to find text in various properties
  const text = content.conversation ||
               content.extendedTextMessage?.text ||
               content.imageMessage?.caption ||
               content.videoMessage?.caption ||
               content.documentMessage?.caption ||
               content.documentMessage?.fileName ||
               content.documentWithCaptionMessage?.message?.documentMessage?.caption ||
               content.documentWithCaptionMessage?.message?.documentMessage?.fileName ||
               content.protocolMessage?.editedMessage?.conversation ||
               content.protocolMessage?.editedMessage?.extendedTextMessage?.text;

  if (text) return text;

  // Fallbacks for non-text types
  if (content.stickerMessage) return '[figurinha]';
  if (content.audioMessage || content.pttMessage) return '[áudio]';
  if (content.imageMessage) return '[imagem]';
  if (content.videoMessage) return '[vídeo]';
  if (content.locationMessage) return '[localização]';
  if (content.contactMessage || content.contactsArrayMessage) return '[contato]';
  
  return '[mídia]';
}

export default {
  getInstanceStatus,
  getQRCode,
  configureWebhook,
  sendTextMessage,
  sendTextMessageFromInstance,
  sendImageMessage,
  sendDocumentMessage,
  sendAudioMessage,
  sendTemplateMessage,
  fetchMessages,
  fetchChats,
  fetchContacts,
  getContactInfo,
  getBase64FromMediaMessage,
  parseIncomingWebhook,
  formatPhone,
};
