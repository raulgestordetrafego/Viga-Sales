import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { v4 as uuidv4 } from 'uuid';

// Routes
import contactRoutes from "./server/routes/contacts.js";
import conversationRoutes from "./server/routes/conversations.js";
import broadcastRoutes from "./server/routes/broadcasts.js";
import { handleWebhook } from "./server/webhook/handler.js";
import evolutionApi from "./server/services/evolutionApi.js";
import { initDb, queryOne, run, query } from "./server/db/database.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("STARTING SERVER...");
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" },
  });

  const PORT = 3000;

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // In-memory logs for debugging
  const n8nLogs = [];
  const webhookLogs = [];
  
  const addN8nLog = (data) => {
    n8nLogs.unshift({ timestamp: new Date().toISOString(), ...data });
    if (n8nLogs.length > 20) n8nLogs.pop();
  };

  const addWebhookLog = (data) => {
    webhookLogs.unshift({ timestamp: new Date().toISOString(), ...data });
    if (webhookLogs.length > 20) webhookLogs.pop();
  };

  // Request Logging & Proxy Bypass Detection
  app.use((req, res, next) => {
    const isN8n = req.headers['x-n8n-auth'] === 'viga-sales-crm' || req.url.includes('n8n');
    const isWebhook = req.url.includes('/webhook/evolution');
    
    if (isN8n) {
      console.log(`[N8N ATTEMPT] ${req.method} ${req.url}`);
    }
    if (isWebhook) {
      console.log(`[WEBHOOK ATTEMPT] ${req.method} ${req.url}`);
    }
    next();
  });

  app.get("/api/ping", (req, res) => res.send("pong"));

  // DEBUG: View DB Content (somente em desenvolvimento)
  app.get("/api/debug/db", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Não disponível em produção" });
    }
    try {
      const contacts = await query("SELECT * FROM contacts LIMIT 10");
      const convs = await query("SELECT * FROM conversations LIMIT 10");
      const messages = await query("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20");
      const rawWebhooks = await query("SELECT * FROM raw_webhooks ORDER BY created_at DESC LIMIT 10");
      res.json({ contacts, convs, messages, webhookLogs, rawWebhooks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Initialize DB before starting to listen
  try {
    console.log("Starting database initialization...");
    await initDb();
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("CRITICAL: Database initialization failed:", err.message);
  }

  // n8n Integration Endpoint
  app.get("/api/n8n/message", (req, res) => {
    res.json({ status: "online", message: "Endpoint pronto para receber POST do n8n" });
  });

  app.post("/api/n8n/message", async (req, res) => {
    const auth = req.headers['x-n8n-auth'];
    if (!auth || auth !== 'viga-sales-crm') {
      console.warn(`[n8n API] Unauthorized request - Auth: ${auth}`);
      return res.status(401).json({ error: "Unauthorized. Header X-N8N-AUTH obrigatório." });
    }
    console.log(`[n8n API] Received request - Auth: ${auth}, Body: ${JSON.stringify(req.body).substring(0, 200)}`);
    
    addN8nLog({ 
      method: 'POST', 
      body: req.body, 
      headers: { 'accept': req.headers['accept'], 'x-n8n-auth': auth } 
    });

    try {
      const phone = req.body.phone || req.body.phoneNumber || req.body.number || req.body.sender;
      const content = req.body.content || req.body.message || req.body.text || req.body.body;
      const name = req.body.name || req.body.pushName || req.body.contactName;
      const type = req.body.type || 'text';
      const direction = req.body.direction || 'inbound';
      
      if (!phone || !content) {
        console.warn("[n8n API] Missing phone or content. Received:", { phone, content });
        return res.status(400).json({ error: "Phone and content are required" });
      }

      let cleanPhone = String(phone).replace(/\D/g, '');
      // Brazilian number normalization (add 55 if missing, handle 9th digit)
      if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
      
      console.log(`[n8n API] Processing message for ${cleanPhone} (${direction})`);
      
      // 1) Handle Contact
      let contact = await queryOne('SELECT * FROM contacts WHERE phone = ?', [cleanPhone]);
      if (!contact) {
        console.log(`[n8n API] Contact not found, creating: ${cleanPhone}`);
        const id = uuidv4();
        await run(`
          INSERT INTO contacts (id, name, phone, status, pipeline_stage, last_interaction)
          VALUES (?, ?, ?, 'active', 'stage_lead', CURRENT_TIMESTAMP)
        `, [id, name || cleanPhone, cleanPhone]);
        contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
      } else {
        console.log(`[n8n API] Found contact: ${contact.id}`);
        await run("UPDATE contacts SET last_interaction = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [contact.id]);
      }

      // 2) Handle Conversation
      let conv = await queryOne('SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1', [contact.id]);
      if (!conv) {
        console.log(`[n8n API] Conversation not found, creating for contact ${contact.id}`);
        const id = uuidv4();
        await run(`
          INSERT INTO conversations (id, contact_id, status, last_message, last_message_at)
          VALUES (?, ?, 'open', ?, CURRENT_TIMESTAMP)
        `, [id, contact.id, content]);
        conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
      } else {
        console.log(`[n8n API] Found conversation: ${conv.id}`);
        await run(`
          UPDATE conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [content, conv.id]);
      }

      // 3) Save Message
      const msgId = uuidv4();
      const timestamp = new Date().toISOString();
      console.log(`[n8n API] Saving message ${msgId}`);
      await run(`
        INSERT INTO messages (id, conversation_id, direction, type, content, status, timestamp)
        VALUES (?, ?, ?, ?, ?, 'delivered', ?)
      `, [msgId, conv.id, direction, type, content, timestamp]);

      // 4) Socket Emit
      if (io) {
        console.log("[n8n API] Emitting to socket...");
        const fullContact = { ...contact, tags: JSON.parse(typeof contact.tags === 'string' ? contact.tags : '[]') };
        const updatedConv = await queryOne(`
          SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
          FROM conversations c
          JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.id = ?
        `, [conv.id]);
        
        io.emit('new_message', {
          conversation: updatedConv,
          contact: fullContact,
          message: {
            id: msgId,
            conversation_id: conv.id,
            direction: direction,
            type: type,
            content: content,
            timestamp: timestamp,
          },
        });
      }

      console.log("[n8n API] Success");
      res.json({ success: true, messageId: msgId });
    } catch (err) {
      console.error("[n8n API] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes
  app.use("/api/contacts", contactRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/broadcasts", broadcastRoutes);

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack 
    });
  });

  // Stats & WhatsApp
  app.get("/api/stats", async (req, res) => {
    try {
      const contactsData = await queryOne("SELECT COUNT(*) as count FROM contacts");
      const convsData = await queryOne("SELECT COUNT(*) as count FROM conversations WHERE status = 'open'");
      const messagesData = await queryOne("SELECT COUNT(*) as count FROM messages");
      
      const contacts = parseInt(contactsData?.count || 0);
      const convs = parseInt(convsData?.count || 0);
      const messages = parseInt(messagesData?.count || 0);
      
      let todayMessages = 0;
      try {
        const today = new Date().toISOString().split('T')[0];
        const todayData = await queryOne("SELECT COUNT(*) as count FROM messages WHERE timestamp LIKE ?", [`${today}%`]);
        todayMessages = parseInt(todayData?.count || 0);
      } catch (e) {
        console.warn("Failed to get today's messages count:", e.message);
      }

      res.json({ 
        totalContacts: contacts, 
        openConvs: convs, 
        totalMessages: messages,
        todayMessages: todayMessages
      });
    } catch (err) {
      console.error("Stats Error:", err);
      res.status(500).json({ error: "Erro ao carregar estatísticas: " + err.message });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const status = await evolutionApi.getInstanceStatus();
      res.json(status);
    } catch (err) {
      console.error("WhatsApp Status Error:", err.message);
      res.json({ instance: { state: 'error', message: err.message } });
    }
  });

  app.get("/api/whatsapp/qrcode", async (req, res) => {
    try {
      const qr = await evolutionApi.getQRCode();
      res.json(qr);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/pipeline/stages", async (req, res) => {
    try {
      const stages = await query("SELECT * FROM pipeline_stages ORDER BY position");
      res.json(stages);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/config", (req, res) => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    res.json({
      webhook_url: `${appUrl}/webhook/evolution`,
      n8n_url: `${appUrl}/api/n8n/message`,
      instance: process.env.EVOLUTION_INSTANCE || 'default',
      api_url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
      api_key: process.env.EVOLUTION_API_KEY || '',
      forward_url: process.env.FORWARD_WEBHOOK_URL || '',
      n8n_logs: n8nLogs,
      webhook_logs: webhookLogs
    });
  });

  app.post("/api/whatsapp/test-webhook", async (req, res) => {
    try {
      const testPayload = {
        event: "messages.upsert",
        instance: process.env.EVOLUTION_INSTANCE || 'default',
        data: {
          messages: [{
            key: {
              remoteJid: "5511999999999@s.whatsapp.net",
              fromMe: false,
              id: "TEST_" + Date.now()
            },
            pushName: "Teste Webhook",
            message: { conversation: "Esta é uma mensagem de teste do sistema." },
            messageTimestamp: Math.floor(Date.now() / 1000)
          }]
        }
      };
      
      await handleWebhook(testPayload, io);
      res.json({ success: true, message: "Payload de teste enviado ao webhook interno." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save WhatsApp Config
  app.post("/api/whatsapp/config", async (req, res) => {
    try {
      const { instance, api_url, api_key } = req.body;
      if (instance) process.env.EVOLUTION_INSTANCE = instance;
      if (api_url) process.env.EVOLUTION_API_URL = api_url;
      if (api_key) process.env.EVOLUTION_API_KEY = api_key;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Configure Webhook on Evolution API
  app.post("/api/whatsapp/setup-webhook", async (req, res) => {
    try {
      const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
      if (!appUrl) {
        throw new Error("URL do App não encontrada no ambiente.");
      }
      const webhookUrl = `${appUrl}/webhook/evolution`;
      console.log(`[Setup] Configuring Evolution Webhook to: ${webhookUrl}`);
      const result = await evolutionApi.configureWebhook(webhookUrl);
      res.json({ success: true, result });
    } catch (err) {
      console.error("Setup Webhook Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook Evolution API
  app.post("/webhook/evolution", async (req, res) => {
    try {
      const payload = req.body;
      
      // Save to raw logs for deep debugging
      try {
        await run("INSERT INTO raw_webhooks (payload) VALUES (?)", [JSON.stringify(payload)]);
      } catch (e) {
        console.error("Error saving raw webhook:", e);
      }

      addWebhookLog({ 
        event: payload.event || payload.type || 'unknown',
        messageId: payload.data?.key?.id || payload.body?.key?.id || 'N/A',
        summary: JSON.stringify(payload).substring(0, 100) + '...'
      });
      
      console.log("RAW WEBHOOK PAYLOAD RECEIVED");
      await handleWebhook(payload, io);
      res.status(200).send("OK");
    } catch (err) {
      console.error("Webhook Error:", err);
      addWebhookLog({ error: err.message });
      res.status(500).send("Error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Expected Webhook URL for Evolution API: ${appUrl}/webhook/evolution`);
  });
}

startServer();
