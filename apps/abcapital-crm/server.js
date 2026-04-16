import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/database.js';
import abCapitalRoutes from './routes/abCapital.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001');
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_ORIGINS = IS_PROD
  ? ['https://app.abcapital.com.br', 'https://abcapital.com.br', 'https://www.abcapital.com.br']
  : ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:3000'];

const app = express();

app.set('trust proxy', 1);

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  skip: () => !IS_PROD,
});
app.use('/api', apiLimiter);

app.get('/api/ping', (req, res) => res.send('pong'));

// Uploads estáticos
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));
app.use('/api/uploads', express.static(uploadsDir));

// Logo via rota /api/ (bypassa possível prefixo de proxy)
app.get('/api/ab-capital/logo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'abcapital', 'logo.png'));
});

// API Routes
app.use('/api/ab-capital', abCapitalRoutes);

// Landing page — abcapital.com.br (Traefik reescreve qualquer rota para /landing)
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// CRM SPA — serve index.html para qualquer rota não-API (app.abcapital.com.br)
app.use(express.static(path.join(__dirname, 'public', 'abcapital')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'abcapital', 'index.html'));
});

async function start() {
  try {
    await initDb();
    console.log('[DB] Banco de dados inicializado');
  } catch (err) {
    console.error('[DB] Falha na inicialização:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AB Capital CRM] Rodando na porta ${PORT}`);
  });
}

start();
