/**
 * SECURITY AGENT v2 — Monitora segurança da Viga Sales 24/7
 * 
 * Knowledge base: técnicas reais de ataque documentadas em auditorias e
 * em vídeos de pentest (Find My SaaS, etc.). O agente aprende com cada scan.
 * 
 * Checks (12):
 *  1. Brute force / login anomalies
 *  2. Credenciais expostas em arquivos
 *  3. Headers de segurança HTTP
 *  4. Consumo anormal de API (spikes)
 *  5. Hardcoded secrets em código-fonte
 *  6. Path traversal e endpoints sensíveis
 *  7. Docker security (root, .dockerignore)
 *  8. Upload sem fileFilter
 *  9. Socket.IO sem auth
 * 10. Auth bypass patterns
 * 11. Webhook/payment bypass
 * 12. Prompt injection surface (LLMs)
 * 
 * Auto-trigger: POST /api/equipe/security/scan
 * Aprendizado: armazena histórico e evolui detecções
 */

import { query } from '../db/database.js';
import { chatContent } from './llm.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.GROUP_COMANDO_ID || "120363428115495870@g.us";
const APP_URL = process.env.APP_URL || 'https://vigasales.shop';

let running = false;
let scanCount = 0;
let totalAlertsFound = 0;

// ─── Knowledge base de ataques ────────────────────────────────────────
const ATTACK_KB = {
  // Do video "Find My SaaS" + auditoria Viga Sales
  "auth_bypass": {
    patterns: [/\|\|\s*token\.length\s*>\s*\d+/g, /JWT_SECRET\s*\|\|\s*['"][^'"]{10,}['"]/g],
    desc: "Auth bypass via condição frágil (ex: token.length > 20, fallback hardcoded)",
    severity: "critical",
    codeOnly: true  // só escanear arquivos .ts/.js
  },
  "idor_enumeration": {
    patterns: [/req\.params\.[a-z]+/g],
    desc: "IDOR — ID sequencial sem verificação de ownership. Permite acessar dados de outros usuários.",
    severity: "warning",  // reduzido: nem todo req.params.id é IDOR real
    codeOnly: true
  },
  "prompt_injection": {
    patterns: [/system\s*(prompt|message|instruction)/gi, /role\s*:\s*['"]system['"]/g],
    desc: "Prompt injection surface — system prompt no mesmo contexto que input do usuário.",
    severity: "high"
  },
  "hardcoded_secret": {
    patterns: [/['"][A-Za-z0-9_]{20,}['"]\s*\)?\s*;?\s*$/gm, /PASSWORD\s*=\s*['"][^'"]+['"]/g, /API_KEY\s*=\s*['"][^'"]+['"]/g],
    desc: "Hardcoded credential — senha, token ou API key fixa no código.",
    severity: "critical"
  },
  "path_traversal": {
    patterns: [/path\.join\([^)]*req\.(params|query|body)[^)]*\)/g, /\.\.\/\.\./g],
    desc: "Path traversal — caminho de arquivo construído com input do usuário sem sanitização.",
    severity: "high"
  },
  "open_redirect": {
    patterns: [/res\.redirect\([^)]*req\.query/g, /redirect\(.*\?.*url=/g],
    desc: "Open redirect — redireciona para URL arbitrária do query param.",
    severity: "high"
  },
  "webhook_bypass": {
    patterns: [/webhook.*secret.*optional/gi, /!secret\b[^)]*next\(\)/g],
    desc: "Webhook sem verificação obrigatória de secret — pagamento falso pode ser injetado.",
    severity: "critical"
  },
  "socket_no_auth": {
    patterns: [/io\.on\(['"]connection['"]/g],
    desc: "Socket.IO sem middleware de autenticação.",
    severity: "high"
  },
  "docker_root": {
    patterns: [/^FROM\s+\S+/gm],
    desc: "Dockerfile sem USER — container roda como root.",
    severity: "info",
    dockerfileOnly: true
  },
  "error_leak": {
    patterns: [/\.json\(\{\s*error:\s*err\.message\s*\}/g, /\.json\(\{\s*error:\s*e\.message\s*\}/g],
    desc: "Vazamento de erro interno — expõe mensagens de DB/API para o cliente.",
    severity: "warning"
  },
};

// ─── Histórico de aprendizado ─────────────────────────────────────────
let learningHistory = [];
const MAX_HISTORY = 50;

function learn(alert) {
  learningHistory.push({ time: new Date().toISOString(), ...alert });
  if (learningHistory.length > MAX_HISTORY) learningHistory.shift();
}

function getRecurringPatterns() {
  const freq = {};
  for (const entry of learningHistory) {
    const key = entry.pattern || entry.check;
    if (key) freq[key] = (freq[key] || 0) + 1;
  }
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1]);
}

// ─── 1. Brute force / login anomalies ─────────────────────────────────
async function checkLoginAnomalies() {
  const alerts = [];
  try {
    const recentLogins = await query(
      "SELECT email, success::int, ip, created_at FROM login_attempts ORDER BY created_at DESC LIMIT 200"
    ).catch(() => []);

    if (!recentLogins.length) return alerts;

    // Múltiplas falhas do mesmo IP (brute force)
    const ipFails = {};
    for (const l of recentLogins) {
      if (!l.success) {
        const ip = l.ip || 'unknown';
        ipFails[ip] = (ipFails[ip] || 0) + 1;
      }
    }
    for (const [ip, fails] of Object.entries(ipFails)) {
      if (fails >= 5) {
        alerts.push({ check: 'brute_force', severity: 'critical', msg: `[BRUTE FORCE] ${fails} falhas do IP ${ip}`, ip, fails });
      }
    }

    // Login de usuário inativo há mais de 30 dias (possível credential stuffing)
    const staleUsers = recentLogins.filter(l => l.success &&
      new Date(l.created_at) < new Date(Date.now() - 30 * 86400000));
    if (staleUsers.length >= 3) {
      alerts.push({ check: 'credential_stuffing', severity: 'warning', msg: `[STALE] ${staleUsers.length} logins de usuários inativos` });
    }

    // Geo anômalo
    const suspiciousGeo = recentLogins.filter(l => l.ip && l.success && !l.ip.startsWith('187.') && !l.ip.startsWith('177.'));
    if (suspiciousGeo.length > 3) {
      alerts.push({ check: 'geo', severity: 'info', msg: `[GEO] ${suspiciousGeo.length} logins de IPs fora do range esperado` });
    }

  } catch (err) {
    console.error('[Security] checkLoginAnomalies:', err.message);
  }
  return alerts;
}

// ─── 2. Credenciais expostas em arquivos ──────────────────────────────
async function checkExposedSecrets() {
  const alerts = [];
  const patterns = [
    /sk-[a-zA-Z0-9_-]{20,}/g,
    /LTAI[a-zA-Z0-9]{16,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /xox[bprs]-[a-zA-Z0-9-]+/g,
    /-----BEGIN (RSA |EC )?PRIVATE KEY-----[^]*?-----END/mg,
    /AIza[0-9A-Za-z\-_]{35}/g,       // Google API key
    /EAA[0-9A-Za-z]{20,}/g,          // Facebook/Meta token
    /AKIA[0-9A-Z]{16}/g,             // AWS access key
    /postgresql:\/\/[^:]+:[^@]+@/g,  // DB connection string with password
  ];

  try {
    const filesToCheck = [
      path.join(ROOT, '.env'),
      path.join(ROOT, '.env.example'),
      path.join(ROOT, 'docker-compose.yml'),
      path.join(ROOT, 'Dockerfile'),
    ];

    for (const fp of filesToCheck) {
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf-8');
      const isExample = fp.includes('.example');
      const isDockerCompose = fp.includes('docker-compose');
      const isDockerfile = fp.includes('Dockerfile') && !fp.includes('docker-compose');

      // Docker compose e Dockerfile: passwords são normais, só flagar se for .env real
      if (isDockerCompose || isDockerfile) continue;

      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          const sev = isExample ? 'info' : 'critical';
          alerts.push({
            check: 'exposed_secrets',
            severity: sev,
            msg: `[SECRETS] ${matches.length} credenciais${isExample ? ' (placeholder)' : ''} em ${path.basename(fp)}`,
            file: path.basename(fp),
            count: matches.length,
          });
        }
      }
    }
  } catch (err) {
    console.error('[Security] checkExposedSecrets:', err.message);
  }
  return alerts;
}

// ─── 3. Headers de segurança ──────────────────────────────────────────
async function checkSecurityHeaders() {
  const alerts = [];
  try {
    const res = await axios.get(APP_URL, { timeout: 10000, validateStatus: () => true });
    const h = res.headers;

    const checks = {
      'strict-transport-security': { msg: 'HSTS ausente', sev: 'warning' },
      'x-content-type-options': { msg: 'X-Content-Type-Options ausente', sev: 'warning' },
      'x-frame-options': { msg: 'X-Frame-Options ausente (clickjacking)', sev: 'warning' },
      'content-security-policy': { msg: 'CSP ausente (XSS)', sev: 'high' },
      'cross-origin-resource-policy': { msg: 'CORP ausente', sev: 'info' },
      'referrer-policy': { msg: 'Referrer-Policy ausente', sev: 'info' },
    };

    for (const [header, { msg, sev }] of Object.entries(checks)) {
      if (!h[header]) {
        alerts.push({ check: 'security_header', severity: sev, msg: `[HEADERS] ${msg}` });
      }
    }

    // Check CSP for unsafe-inline/unsafe-eval (weaker protection)
    const csp = h['content-security-policy'] || '';
    if (csp.includes("'unsafe-inline'")) {
      alerts.push({ check: 'csp_weakened', severity: 'info', msg: '[CSP] Contém unsafe-inline — XSS protection reduzida' });
    }
    if (csp.includes("'unsafe-eval'")) {
      alerts.push({ check: 'csp_weakened', severity: 'info', msg: '[CSP] Contém unsafe-eval — necessário para Vite' });
    }

    if (res.status !== 200) {
      alerts.push({ check: 'http_status', severity: 'critical', msg: `[HTTP] ${APP_URL} retornou ${res.status}` });
    }
  } catch (err) {
    alerts.push({ check: 'http_unreachable', severity: 'critical', msg: `[HTTP] Não foi possível alcançar ${APP_URL}` });
  }
  return alerts;
}

// ─── 4. Consumo anormal de API ────────────────────────────────────────
async function checkApiAnomalies() {
  const alerts = [];
  try {
    const emailBurst = await query(
      "SELECT COUNT(*)::int as cnt FROM email_send_logs WHERE created_at > NOW() - INTERVAL '1 hour'"
    ).catch(() => [{ cnt: 0 }]);
    if (emailBurst[0]?.cnt > 50) {
      alerts.push({ check: 'api_burst', severity: 'warning', msg: `[BURST] ${emailBurst[0].cnt} emails em 1h` });
    }

    const metaBurst = await query(
      "SELECT COUNT(*)::int as cnt FROM meta_template_logs WHERE created_at > NOW() - INTERVAL '1 hour'"
    ).catch(() => [{ cnt: 0 }]);
    if (metaBurst[0]?.cnt > 30) {
      alerts.push({ check: 'api_burst', severity: 'warning', msg: `[BURST] ${metaBurst[0].cnt} templates Meta em 1h` });
    }

    // API calls to OpenAI (cost spike detection)
    const openaiCalls = await query(
      "SELECT COUNT(*)::int as cnt FROM audit_log WHERE action LIKE '%openai%' AND created_at > NOW() - INTERVAL '1 hour'"
    ).catch(() => [{ cnt: 0 }]);
    if (openaiCalls[0]?.cnt > 100) {
      alerts.push({ check: 'api_spike', severity: 'warning', msg: `[SPIKE] ${openaiCalls[0].cnt} chamadas OpenAI em 1h — custo anormal` });
    }

    // Prospects liberados em massa (recovery attack)
    const recoveryCount = await query(
      "SELECT COUNT(*)::int as cnt FROM prospecting_logs WHERE action = 'recovery' AND created_at > NOW() - INTERVAL '1 hour'"
    ).catch(() => [{ cnt: 0 }]);
    if (recoveryCount[0]?.cnt > 1) {
      alerts.push({ check: 'mass_recovery', severity: 'high', msg: `[RECOVERY] ${recoveryCount[0].cnt} recovery calls em 1h — possível ataque` });
    }

  } catch (err) {
    console.error('[Security] checkApiAnomalies:', err.message);
  }
  return alerts;
}

// ─── 5. Hardcoded secrets em código-fonte ─────────────────────────────
async function checkCodeSecrets() {
  const alerts = [];
  try {
    const codeFiles = [
    { path: 'server.ts', type: 'code' },
    { path: 'server/db/database.js', type: 'code' },
    { path: 'server/services/emailService.js', type: 'code' },
    { path: 'server/services/evolutionApi.js', type: 'code' },
    { path: 'server/services/metaWhatsapp.js', type: 'code' },
    { path: 'server/services/bossMode.js', type: 'code' },
    { path: 'server/services/chiefAgent.js', type: 'code' },
    { path: 'docker-compose.yml', type: 'config' },
  ];

  for (const { path: relPath, type } of codeFiles) {
    const fp = path.join(ROOT, relPath);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf-8');

    for (const [key, { patterns, desc, severity, codeOnly, dockerfileOnly }] of Object.entries(ATTACK_KB)) {
      if (codeOnly && type !== 'code') continue;
      if (dockerfileOnly && !relPath.includes('Dockerfile')) continue; // pula config files
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0 && matches.length < 50) { // ignora falsos positivos massivos
          alerts.push({
            check: 'code_secret', severity,
            msg: `[CODE] ${desc} — ${matches.length} ocorrências em ${relPath}`,
            file: relPath, pattern: key,
          });
          break;
        }
      }
    }
  }
  } catch (err) {
    console.error('[Security] checkCodeSecrets:', err.message);
  }
  return alerts;
}

// ─── 6. Docker security ───────────────────────────────────────────────
async function checkDockerSecurity() {
  const alerts = [];
  try {
    const dockerfile = path.join(ROOT, 'Dockerfile');
    if (!fs.existsSync(dockerfile)) {
      alerts.push({ check: 'docker', severity: 'info', msg: '[DOCKER] Dockerfile não encontrado' });
      return alerts;
    }
    const content = fs.readFileSync(dockerfile, 'utf-8');

    // Roda como root?
    if (!/USER\s+\S+/.test(content)) {
      alerts.push({ check: 'docker_root', severity: 'high', msg: '[DOCKER] Container roda como ROOT — sem USER directive' });
    }

    // .dockerignore existe?
    const dockerignore = path.join(ROOT, '.dockerignore');
    if (!fs.existsSync(dockerignore)) {
      alerts.push({ check: 'docker_ignore', severity: 'high', msg: '[DOCKER] .dockerignore não encontrado — .env pode vazar na imagem' });
    } else {
      const diContent = fs.readFileSync(dockerignore, 'utf-8');
      if (!diContent.includes('.env')) {
        alerts.push({ check: 'docker_ignore', severity: 'critical', msg: '[DOCKER] .env NÃO está no .dockerignore' });
      }
    }

    // .dockerignore bloqueia .git? (código fonte na imagem)
    const diContent2 = fs.existsSync(dockerignore) ? fs.readFileSync(dockerignore, 'utf-8') : '';
    if (!diContent2.includes('.git')) {
      alerts.push({ check: 'docker_git', severity: 'warning', msg: '[DOCKER] .git NÃO está no .dockerignore — fonte vaza na imagem' });
    }

    // npx tsx em produção?
    if (content.includes('npx tsx') && !content.includes('NODE_ENV=development')) {
      alerts.push({ check: 'docker_runtime', severity: 'info', msg: '[DOCKER] npx tsx em produção — considerar build compilado' });
    }

  } catch (err) {
    console.error('[Security] checkDockerSecurity:', err.message);
  }
  return alerts;
}

// ─── 7. Socket.IO + WebSocket security ────────────────────────────────
async function checkWebSocketSecurity() {
  const alerts = [];
  try {
    const serverPath = path.join(ROOT, 'server.ts');
    if (!fs.existsSync(serverPath)) return alerts;
    const content = fs.readFileSync(serverPath, 'utf-8');

    // Socket.IO sem auth?
    const hasIO = content.includes('new Server(') || content.includes('socket.io');
    const hasIOAuth = content.includes('io.use(');
    if (hasIO && !hasIOAuth) {
      alerts.push({ check: 'socket_no_auth', severity: 'critical', msg: '[WEBSOCKET] Socket.IO sem middleware de autenticação (io.use)' });
    }

    // CORS do Socket.IO permite qualquer origin?
    if (content.includes("cors:") && content.includes("credentials: true") && !content.includes("ALLOWED_ORIGINS")) {
      alerts.push({ check: 'socket_cors', severity: 'high', msg: '[WEBSOCKET] Socket.IO sem restrição de CORS' });
    }

  } catch (err) {
    console.error('[Security] checkWebSocketSecurity:', err.message);
  }
  return alerts;
}

// ─── 8. Prompt injection surface ──────────────────────────────────────
async function checkPromptInjection() {
  const alerts = [];
  try {
    // Verificar arquivos que enviam input do usuário direto pra LLM
    const aiFiles = [
      'server/services/bossMode.js',
      'server/services/chiefAgent.js',
      'server/services/insightsAgent.js',
      'server/routes/blog.js',
    ];

    for (const relPath of aiFiles) {
      const fp = path.join(ROOT, relPath);
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf-8');

      // Input do usuário concatenado direto no prompt
      const promptConcat = content.match(/messages:\s*\[[\s\S]*?role:\s*['"]user['"][\s\S]*?content:\s*(req\.|body\.|phone|msg)/g);
      if (promptConcat) {
        alerts.push({
          check: 'prompt_injection',
          severity: 'high',
          msg: `[PROMPT] Input de usuário direto no prompt em ${relPath} — risco de injection`,
        });
      }

      // System prompt hardcoded exposto
      const systemPrompts = content.match(/['"]You are[^'"]{50,}['"]/g);
      if (systemPrompts && systemPrompts.length > 3) {
        alerts.push({
          check: 'system_prompt_exposed',
          severity: 'info',
          msg: `[PROMPT] ${systemPrompts.length} system prompts expostos em ${relPath}`,
        });
      }
    }

  } catch (err) {
    console.error('[Security] checkPromptInjection:', err.message);
  }
  return alerts;
}

// ─── 9. Upload security ───────────────────────────────────────────────
async function checkUploadSecurity() {
  const alerts = [];
  try {
    const uploadFiles = [
      'server/routes/email.js',
      'server/routes/prospecting.js',
      'server/routes/abCapital.js',
    ];

    for (const relPath of uploadFiles) {
      const fp = path.join(ROOT, relPath);
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf-8');

      const hasMulter = content.includes('multer(');
      const hasFileFilter = content.includes('fileFilter');

      if (hasMulter && !hasFileFilter) {
        alerts.push({
          check: 'upload_no_filter',
          severity: 'high',
          msg: `[UPLOAD] ${relPath} — multer sem fileFilter (aceita qualquer tipo de arquivo)`,
        });
      }
    }
  } catch (err) {
    console.error('[Security] checkUploadSecurity:', err.message);
  }
  return alerts;
}

// ─── Análise de IA sobre os alertas ───────────────────────────────────
async function analyzeWithAI(alerts) {
  if (!alerts.length) return null;

  try {
    const recurring = getRecurringPatterns();
    const recurringText = recurring.length
      ? `\nPADRÕES RECORRENTES:\n${recurring.map(([k, c]) => `  • ${k}: ${c}x nos últimos scans`).join('\n')}`
      : '';

    const prompt = `Você é o Security Agent da Viga Sales, um agente de defesa cibernética.
Sua knowledge base inclui: auth bypass, IDOR, prompt injection, path traversal, open redirect, 
hardcoded secrets, webhook bypass, Socket.IO sem auth, Docker root, error leak, brute force.

Analise estes alertas com severidade e recomende ações:

ALERTAS (${alerts.length}):
${alerts.map((a, i) => `${i + 1}. [${a.severity || 'info'}] ${a.msg}`).join('\n')}
${recurringText}

Responda em JSON:
{
  "critical": ["ação imediata necessária"],
  "warning": ["atenção necessária"],
  "info": ["informativo"],
  "resumo": "1 frase resumindo o estado de segurança",
  "acao": "recomendação principal",
  "tatica": "tática de ataque mais provável neste cenário"
}`;

    const content = await chatContent({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(content);
  } catch {
    const criticals = alerts.filter(a => a.severity === 'critical');
    const warnings = alerts.filter(a => a.severity === 'high' || a.severity === 'warning');
    return {
      critical: criticals.map(a => a.msg),
      warning: warnings.map(a => a.msg),
      info: alerts.filter(a => a.severity === 'info').map(a => a.msg),
      resumo: `${alerts.length} alertas: ${criticals.length} críticos, ${warnings.length} atenção`,
      acao: criticals.length ? 'Resolver alertas críticos IMEDIATAMENTE' : 'Monitorar',
      tatica: criticals.length ? 'Exploração de credenciais ou bypass de auth' : 'Reconhecimento',
    };
  }
}

// ─── Reportar via WhatsApp ────────────────────────────────────────────
async function reportToGroup(analysis, alertCount) {
  if (!EVO_KEY || !EVO_URL) return;

  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  let msg = `🛡️ *Nascimento v2 — Scan #${scanCount}* — ${hora}\n`;

  if (!analysis) {
    msg += `\n✅ Nenhum alerta. Sistema seguro.`;
  } else {
    if (analysis.critical?.length) {
      msg += `\n🔴 *CRÍTICO (${analysis.critical.length}):*\n${analysis.critical.map(a => `  • ${a}`).join('\n')}`;
    }
    if (analysis.warning?.length) {
      msg += `\n🟠 *Atenção (${analysis.warning.length}):*\n${analysis.warning.map(a => `  • ${a}`).join('\n')}`;
    }
    if (analysis.info?.length) {
      msg += `\n🔵 *Info:*\n${analysis.info.map(a => `  • ${a}`).join('\n')}`;
    }
    msg += `\n\n📋 ${analysis.resumo}`;
    if (analysis.acao) msg += `\n💡 ${analysis.acao}`;
    if (analysis.tatica) msg += `\n🎯 Tática provável: ${analysis.tatica}`;
  }

  msg += `\n📊 Total histórico: ${totalAlertsFound} alertas em ${scanCount} scans`;

  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP, text: msg, delay: 1200,
    }, {
      headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('[Security] Reporte enviado ao grupo');
  } catch (err) {
    console.error('[Security] Erro ao enviar reporte:', err.message);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────
async function runSecurityAgent() {
  if (running) return;
  running = true;
  scanCount++;

  try {
    console.log(`[Security] Scan #${scanCount} iniciado...`);

    const allChecks = await Promise.all([
      checkLoginAnomalies(),
      checkExposedSecrets(),
      checkSecurityHeaders(),
      checkApiAnomalies(),
      checkCodeSecrets(),
      checkDockerSecurity(),
      checkWebSocketSecurity(),
      checkPromptInjection(),
      checkUploadSecurity(),
    ]);

    const allAlerts = allChecks.flat();
    totalAlertsFound += allAlerts.length;
    console.log(`[Security] Scan #${scanCount}: ${allAlerts.length} alertas (total: ${totalAlertsFound})`);

    // Log detalhado dos alertas para debugging
    for (const a of allAlerts) {
      console.log(`  [${a.severity || 'info'}] ${a.msg}`);
    }

    // Aprender com os alertas
    for (const alert of allAlerts) learn(alert);

    const analysis = await analyzeWithAI(allAlerts);

    // Só reporta a cada 24 scans (~12h) ou se houver NOVOS alertas críticos
    const hasSignificant = allAlerts.some(a => a.severity === 'critical' || a.severity === 'high');
    const isReportTime = scanCount % 24 === 0; // a cada 12h
    
    if (isReportTime || (hasSignificant && scanCount % 6 === 0)) {
      await reportToGroup(analysis, allAlerts.length);
    } else if (allAlerts.length > 0) {
      console.log('[Security] Scan silencioso — próximo reporte em ' + (24 - (scanCount % 24)) + ' scans');
    }

  } catch (err) {
    console.error('[Security] Erro geral:', err.message);
  }
  running = false;
}

function startSecurityAgent() {
  console.log('[Security] Nascimento v2 iniciado — scan 1x ao dia');
  runSecurityAgent();
  setInterval(runSecurityAgent, 24 * 60 * 60_000);
}

export { startSecurityAgent, runSecurityAgent };
