const META_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_PHONE_ID = process.env.META_PHONE_NUMBER_ID || '';
const META_API = 'https://graph.facebook.com/v22.0';

function cleanPhone(number) {
  let phone = String(number).replace(/\D/g, '');
  if (phone.length === 11 && !phone.startsWith('55')) phone = '55' + phone;
  else if (phone.length === 10 && !phone.startsWith('55')) phone = '55' + phone;
  return phone;
}

async function callMeta(endpoint, body) {
  if (!META_TOKEN || !META_PHONE_ID) {
    throw new Error('META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID não configurados');
  }
  const url = `${META_API}/${META_PHONE_ID}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Meta API error ${res.status}`);
  }
  return data;
}

/**
 * Envia mensagem de texto via Meta Cloud API
 * @param {string} phone — número com DDI (ex: 5561981362382)
 * @param {string} text — corpo da mensagem
 * @param {boolean} [previewUrl=true] — preview de links
 */
export async function sendText(phone, text, previewUrl = true) {
  const to = cleanPhone(phone);
  return callMeta('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: previewUrl,
      body: text,
    },
  });
}

/**
 * Envia imagem via Meta Cloud API
 * @param {string} phone
 * @param {string} imageUrl — URL pública da imagem (ou ID após upload)
 * @param {string} [caption]
 */
export async function sendImage(phone, imageUrl, caption) {
  const to = cleanPhone(phone);
  return callMeta('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      ...(caption ? { caption } : {}),
    },
  });
}

/**
 * Envia áudio via Meta Cloud API
 * @param {string} phone
 * @param {string} audioUrl — URL pública do áudio (mp3/ogg)
 */
export async function sendAudio(phone, audioUrl) {
  const to = cleanPhone(phone);
  return callMeta('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'audio',
    audio: {
      link: audioUrl,
    },
  });
}

/**
 * Envia template aprovado via Meta Cloud API
 * @param {string} phone
 * @param {string} templateName — nome do template aprovado
 * @param {string} language — código de idioma (ex: 'pt_BR')
 * @param {Array<{type:'text',text:string}>} [parameters] — parâmetros do body do template
 * @param {string} [mediaUrl] — URL da imagem (para templates com header de imagem)
 */
export async function sendTemplate(phone, templateName, language = 'pt_BR', parameters, mediaUrl) {
  const to = cleanPhone(phone);
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
    },
  };
  const components = [];
  if (mediaUrl) {
    const isVideo = templateName.includes('video');
    components.push({
      type: 'header',
      parameters: [
        {
          type: isVideo ? 'video' : 'image',
          [isVideo ? 'video' : 'image']: { link: mediaUrl },
        },
      ],
    });
  }
  if (parameters && parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters.map(p => ({ type: 'text', text: p.text })),
    });
  }
  if (components.length > 0) {
    body.template.components = components;
  }
  return callMeta('messages', body);
}

/**
 * Marca mensagem como lida
 */
export async function markAsRead(messageId) {
  return callMeta('messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

/**
 * Verifica status dos templates no Meta
 * @returns {Promise<Array<{name:string, status:string}>>}
 */
export async function checkTemplateStatus() {
  if (!META_TOKEN || !META_PHONE_ID) return [];

  try {
    // Usa WABA ID do env se disponivel, senao tenta obter do phone number
    let wabaId = process.env.META_WABA_ID || '';
    
    if (!wabaId) {
      const phoneRes = await fetch(`${META_API}/${META_PHONE_ID}?fields=whatsapp_business_account`, {
        headers: { 'Authorization': `Bearer ${META_TOKEN}` },
      });
      const phoneData = await phoneRes.json();
      wabaId = phoneData?.whatsapp_business_account?.id || '';
    }

    if (!wabaId) {
      console.log('[Meta Check] Não foi possível obter WABA ID');
      return [];
    }

    const res = await fetch(
      `${META_API}/${wabaId}/message_templates?fields=name,status,quality_score,components,language&limit=50`,
      { headers: { 'Authorization': `Bearer ${META_TOKEN}` } }
    );
    const data = await res.json();

    if (data?.data) {
      return data.data.map(t => {
        const bodyComponent = (t.components || []).find(c => c.type === 'BODY');
        const bodyText = bodyComponent?.text || '';
        const varMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const varCount = new Set(varMatches.map(m => m.replace(/[{}]/g, ''))).size;
        const vars = Array.from({ length: varCount }, (_, i) => `var_${i + 1}`);
        return {
          name: t.name,
          status: t.status,
          quality: t.quality_score?.score || '-',
          language: t.language,
          body: bodyText,
          vars,
        };
      });
    }
    return [];
  } catch (err) {
    console.error('[Meta Check] Error:', err.message);
    return [];
  }
}

export function isConfigured() {
  return !!(META_TOKEN && META_PHONE_ID);
}
