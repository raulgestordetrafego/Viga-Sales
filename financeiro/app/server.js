import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/database.js';
import financeiroRoutes from './routes/financeiro.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT    = parseInt(process.env.PORT || '3000');
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_ORIGINS = IS_PROD
  ? [
      'https://financeiro.vigasales.com.br',
      'https://vigasales.com.br',
      'https://www.vigasales.com.br',
      'https://vigasales.shop',
    ]
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3002'];

const app = express();
app.set('trust proxy', 1);

// HTTPS redirect em produção
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '20mb' })); // 20MB para suportar imagens base64
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rate limit global na API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  skip: () => !IS_PROD,
});
app.use('/api', apiLimiter);

// Ping de saúde
app.get('/api/ping', (req, res) => res.json({ ok: true, service: 'vigasales-financeiro' }));

// Uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));
app.use('/api/uploads', express.static(uploadsDir));

// Rotas da API
app.use('/api/financeiro', financeiroRoutes);

// Frontend estático (React build)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// SPA fallback — todas as rotas não-API retornam o index.html
app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Viga Sales — Controle Financeiro</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0a0f1a; color: #fff; font-family: system-ui, sans-serif;
                 display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .card { text-align: center; padding: 48px; }
          h1 { font-size: 2rem; color: #3b82f6; margin-bottom: 12px; }
          p { color: rgba(255,255,255,0.6); }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Viga Sales Financeiro</h1>
          <p>Backend rodando. Frontend em construção.</p>
        </div>
      </body>
      </html>
    `);
  }
});

async function start() {
  try {
    await initDb();
    console.log('[DB] Banco de dados inicializado');
  } catch (err) {
    console.error('[DB] Falha na inicialização:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Viga Sales Financeiro] Rodando na porta ${PORT} — ${IS_PROD ? 'PRODUÇÃO' : 'DEV'}`);
  });
}

start();
