import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';
import evolutionApi from '../services/evolutionApi.js';
import axios from 'axios';

/**
 * Processa eventos recebidos da Evolution API via webhook
 */
export async function handleWebhook(payload, io) {
  console.log("Incoming Webhook Event:", payload?.event);
  
  // Forward webhook if configured
  if (process.env.FORWARD_WEBHOOK_URL) {
    const forwardUrl = process.env.FORWARD_WEBHOOK_URL;
    console.log(`[Forwarding] Attempting to forward webhook to: ${forwardUrl}`);
    axios.post(forwardUrl, payload, { timeout: 5000 })
      .then(() => console.log(`[Forwarding] Successfully forwarded webhook to: ${forwardUrl}`))
      .catch(err => {
        if (err.response?.status === 404) {
          console.warn(`[Forwarding] Target URL not found (404): ${forwardUrl}. Please check if the n8n workflow is active.`);
        } else {
          console.error(`[Forwarding] Failed to forward webhook to ${forwardUrl}:`, err.message);
        }
      });
  }

  console.log(`[Webhook] Parsing payload for event: ${payload?.event || payload?.type}`);
  const parsed = evolutionApi.parseIncomingWebhook(payload);
  if (!parsed) {
    console.log("[Webhook] Event ignored or failed to parse. Payload keys:", Object.keys(payload));
    return;
  }

  console.log(`[Webhook] Parsed event: ${parsed.event}. Direction: ${parsed.fromMe ? 'outbound' : 'inbound'}`);

  if (parsed.event === 'message') {
    await handleIncomingMessage(parsed, io);
  }

  if (parsed.event === 'connection') {
    if (io) io.emit('connection_update', { state: parsed.state });
  }

  if (parsed.event === 'contacts_upsert') {
    await handleContactsUpsert(parsed.contacts, io);
  }
}

async function handleIncomingMessage(msg, io) {
  // Ignorar mensagens de status/stories do WhatsApp
  if (msg.chatId === 'status@broadcast' || msg.phone === 'status') {
    console.log('[Webhook] Ignorando mensagem de status/story do WhatsApp');
    return;
  }

  // Process both inbound and outbound messages
  const direction = msg.fromMe ? 'outbound' : 'inbound';

  try {
    console.log(`Processing ${direction} message from ${msg.phone}: ${msg.content?.substring(0, 50)}`);

    // Clean phone number for consistent lookup
    let cleanPhone = msg.phone.replace(/\D/g, '');
    // Brazilian number normalization (add 55 if missing, handle 9th digit)
    if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // 1) Encontrar ou criar contato
    // Try to find by exact match, or by matching the last 8 digits (more flexible)
    let contact = await queryOne('SELECT * FROM contacts WHERE phone = ? OR phone LIKE ?', [cleanPhone, `%${cleanPhone.slice(-8)}`]);
    const now = new Date().toISOString();

    // Buscar nome real do contato na Evolution API quando:
    // - mensagem enviada por nós (fromMe), pois pushName seria nosso nome
    // - contato salvo com número no lugar do nome (indica que nome nunca foi puxado)
    const needsFetch = msg.fromMe || (contact && contact.name === contact.phone);
    let resolvedName = msg.fromMe ? null : (msg.pushName || null);

    if (needsFetch) {
      try {
        const info = await evolutionApi.getContactInfo(cleanPhone);
        const fetched = Array.isArray(info) ? info[0] : info;
        const fetchedName = fetched?.pushName || fetched?.name || fetched?.notify;
        if (fetchedName && fetchedName.trim()) {
          resolvedName = fetchedName.trim();
          console.log(`[Webhook] Nome puxado da Evolution: ${resolvedName}`);
        }
      } catch (err) {
        console.log(`[Webhook] Não foi possível buscar contato na Evolution: ${err.message}`);
      }
    }

    const contactName = resolvedName || msg.pushName || cleanPhone;

    if (!contact) {
      console.log(`Contact not found for phone ${cleanPhone}, creating new contact...`);
      const id = uuidv4();
      await run(`
        INSERT INTO contacts (id, name, phone, status, pipeline_stage, last_interaction, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 'stage_lead', ?, ?, ?)
      `, [id, contactName, cleanPhone, now, now, now]);
      contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
      console.log(`New contact created: ${contact.id} (${contactName})`);
    } else {
      console.log(`Found existing contact: ${contact.id} (${contact.name})`);
      // Atualizar nome se estava salvo como número ou nome genérico
      const nameIsGeneric = !contact.name || contact.name === contact.phone || contact.name === cleanPhone;
      if (nameIsGeneric && resolvedName) {
        await run("UPDATE contacts SET name = ?, last_interaction = ?, updated_at = ? WHERE id = ?", [resolvedName, now, now, contact.id]);
        contact.name = resolvedName;
        console.log(`[Webhook] Nome do contato atualizado para: ${resolvedName}`);
      } else {
        await run("UPDATE contacts SET last_interaction = ?, updated_at = ? WHERE id = ?", [now, now, contact.id]);
      }
    }

    // 2) Encontrar ou criar conversa
    let conv = await queryOne('SELECT * FROM conversations WHERE whatsapp_chat_id = ?', [msg.chatId]);
    if (!conv) {
      conv = await queryOne('SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1', [contact.id]);
    }

    if (!conv) {
      console.log(`Conversation not found for contact ${contact.id}, creating new conversation...`);
      const id = uuidv4();
      await run(`
        INSERT INTO conversations (id, contact_id, whatsapp_chat_id, status, last_message, last_message_at, created_at, updated_at)
        VALUES (?, ?, ?, 'open', ?, ?, ?, ?)
      `, [id, contact.id, msg.chatId, msg.content, now, now, now]);
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
      console.log(`New conversation created: ${conv.id}`);
    } else {
      console.log(`Found existing conversation: ${conv.id}`);
      // Update whatsapp_chat_id if missing or different
      const updateSql = `UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = ${direction === 'inbound' ? 'unread_count + 1' : 'unread_count'}, updated_at = ?, whatsapp_chat_id = ? WHERE id = ?`;
      await run(updateSql, [msg.content, now, now, msg.chatId, conv.id]);
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [conv.id]);
    }

    // 3) Salvar mensagem
    const existing = msg.messageId ? await queryOne('SELECT id FROM messages WHERE whatsapp_message_id = ?', [msg.messageId]) : null;
    let savedMsgId;
    let mediaUrl = null;
    if (!existing) {
      savedMsgId = uuidv4();
      console.log(`Saving new message ${savedMsgId} (WhatsApp ID: ${msg.messageId})`);

      // Buscar mídia como base64 para armazenamento permanente
      if (['audio', 'image', 'video', 'document'].includes(msg.type) && msg.raw) {
        try {
          const mediaData = await evolutionApi.getBase64FromMediaMessage(msg.raw);
          if (mediaData?.base64 && mediaData?.mimetype) {
            mediaUrl = `data:${mediaData.mimetype};base64,${mediaData.base64}`;
            console.log(`[Webhook] Mídia ${msg.type} baixada (${mediaData.mimetype})`);
          }
        } catch (err) {
          console.log(`[Webhook] Não foi possível baixar mídia: ${err.message}`);
        }
      }

      await run(`
        INSERT INTO messages (id, conversation_id, whatsapp_message_id, direction, type, content, media_url, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'delivered', ?)
      `, [savedMsgId, conv.id, msg.messageId, direction, msg.type, msg.content, mediaUrl, msg.timestamp]);
      console.log("Message saved successfully");
    } else {
      savedMsgId = existing.id;
      console.log(`Message with WhatsApp ID ${msg.messageId} already exists, skipping save.`);
    }

    // 4) Se mensagem inbound, verificar se é de um prospect e atualizar status
    if (direction === 'inbound') {
      try {
        // Buscar prospect pelo telefone (exact ou últimos 11 dígitos)
        const phoneVariants = [
          cleanPhone,
          cleanPhone.replace(/^55/, ''),           // sem DDI
          '55' + cleanPhone.replace(/^55/, ''),     // com DDI
        ];
        // Adicionar variante com/sem 9º dígito
        const phoneBase = cleanPhone.replace(/^55/, '');
        if (phoneBase.length === 11) {
          // tem 9º dígito → adicionar sem
          phoneVariants.push('55' + phoneBase.slice(0, 2) + phoneBase.slice(3));
        } else if (phoneBase.length === 10) {
          // sem 9º dígito → adicionar com
          phoneVariants.push('55' + phoneBase.slice(0, 2) + '9' + phoneBase.slice(2));
        }

        const placeholders = phoneVariants.map(() => '?').join(', ');
        const prospect = await queryOne(
          `SELECT id, status, notes FROM prospects WHERE phone IN (${placeholders}) AND status = 'enviado' LIMIT 1`,
          phoneVariants
        );

        if (prospect) {
          const resposta = (msg.content || '').substring(0, 500);
          const novaNote = `[Respondeu ${new Date().toLocaleDateString('pt-BR')}]: ${resposta}`;
          const notesAtual = prospect.notes ? prospect.notes + '\n' + novaNote : novaNote;

          await run(
            `UPDATE prospects SET status = 'respondeu', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [notesAtual, prospect.id]
          );
          console.log(`[Webhook] Prospect ${prospect.id} atualizado para 'respondeu'. Resposta: "${resposta.substring(0, 60)}"`);
        }
      } catch (err) {
        console.error('[Webhook] Erro ao atualizar status do prospect:', err.message);
      }
    }

    // 5) Emitir via socket para o front-end em tempo real
    if (io) {
      const fullContact = { ...contact, tags: JSON.parse(typeof contact.tags === 'string' ? contact.tags : '[]') };
      const updatedConv = await queryOne(`
        SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
        FROM conversations c
        JOIN contacts ct ON c.contact_id = ct.id
        WHERE c.id = ?
      `, [conv.id]);
      
      console.log("Emitting new_message to socket clients...");
      io.emit('new_message', {
        conversation: updatedConv,
        contact: fullContact,
        message: {
          id: savedMsgId,
          conversation_id: conv.id,
          whatsapp_message_id: msg.messageId,
          direction: direction,
          type: msg.type,
          content: msg.content,
          media_url: mediaUrl,
          timestamp: msg.timestamp,
        },
      });
    }
  } catch (err) {
    console.error('handleIncomingMessage CRITICAL ERROR:', err);
  }
}

async function handleContactsUpsert(contacts, io) {
  for (const c of contacts) {
    if (!c.phone || !c.name) continue;
    let cleanPhone = c.phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
    else if (cleanPhone.length === 10 && !cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;

    const contact = await queryOne('SELECT * FROM contacts WHERE phone = ? OR phone LIKE ?', [cleanPhone, `%${cleanPhone.slice(-8)}`]);
    if (!contact) continue;

    const nameIsGeneric = !contact.name || contact.name === contact.phone || contact.name === cleanPhone || /^\d+$/.test(contact.name);
    if (nameIsGeneric || contact.name !== c.name) {
      const now = new Date().toISOString();
      await run('UPDATE contacts SET name = ?, updated_at = ? WHERE id = ?', [c.name, now, contact.id]);
      console.log(`[contacts.upsert] Nome atualizado: "${contact.name}" → "${c.name}"`);
      if (io) io.emit('contact_updated', { id: contact.id, name: c.name });
    }
  }
}

export default { handleWebhook };
