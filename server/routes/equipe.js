import { Router } from "express";
import { query, queryOne, run } from "../db/database.js";
import pg from "pg";

const { Pool } = pg;
const router = Router();

// ─── Helper: query leads database ─────────────────────────────────────────────
const LEADS_DB_URL = process.env.DATABASE_LEADS_URL;
let leadsPool = null;

function getLeadsPool() {
  if (!leadsPool && LEADS_DB_URL) {
    leadsPool = new Pool({
      connectionString: LEADS_DB_URL,
      connectionTimeoutMillis: 5000,
    });
  }
  return leadsPool;
}

async function queryLeads(sql, params = []) {
  const pool = getLeadsPool();
  if (!pool) return [];
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── Definição dos Agentes ────────────────────────────────────────────────────
const AGENTS = [
  {
    id: "metaDispatcher",
    name: "Meta Dispatcher",
    icon: "MessageCircle",
    description: "Dispara templates WhatsApp via Meta Cloud API oficial. 20 prospects/dia, seg-sex, 08-20h.",
    category: "whatsapp",
    dependsOn: "meta",
    schedule: "Seg-Sex 08:00-20:00, a cada 3min",
    metrica: "prospects_enviados",
  },
  {
    id: "emailDispatcher",
    name: "Email Dispatcher",
    icon: "Mail",
    description: "Dispara emails de prospecção em loop 24/7. 30/dia por campanha ativa, com variação IA + spintax.",
    category: "email",
    dependsOn: "smtp",
    schedule: "24/7, a cada 90s, com delay aleatório 30-120s",
    metrica: "emails_enviados",
  },
  {
    id: "emailImap",
    name: "IMAP Reply Checker",
    icon: "Reply",
    description: "Varre inbox a cada 5min por respostas a campanhas e vincula via Message-ID.",
    category: "email",
    dependsOn: "imap",
    schedule: "A cada 5min",
    metrica: "replies_detectadas",
  },
  {
    id: "blogAgent",
    name: "Blog Agent v4",
    icon: "PenTool",
    description: "Pesquisa tendências, gera artigo estratégico com imagem via gpt-4o. 1 artigo/semana, 3k-5k palavras.",
    category: "conteudo",
    dependsOn: "openai",
    schedule: "1 artigo/semana",
    metrica: "artigos_publicados",
  },
  {
    id: "chiefAgent",
    name: "Chief Monitoring Agent",
    icon: "Eye",
    description: "Monitora blog posts, disparos Meta, campanhas email, templates e custos. Reporta 2x/dia.",
    category: "monitoramento",
    dependsOn: null,
    schedule: "08:00 + 20:00 BRT, diário",
    metrica: "alertas_gerados",
  },
  {
    id: "securityAgent",
    name: "Security Agent",
    icon: "Shield",
    description: "Monitora segurança 24/7: brute force, credenciais expostas, headers HTTP, consumo anormal de API. Scan a cada 30min.",
    category: "seguranca",
    dependsOn: null,
    schedule: "A cada 30min, 24/7",
    metrica: null,
  },
  {
    id: "trafficAgent",
    name: "Traffic Brain Agent",
    icon: "Brain",
    description: "Especialista em tráfego pago com cérebro próprio (75 PDFs + 29 lives). Analisa campanhas, diagnostica métricas, atualiza conhecimento semanalmente via YouTube.",
    category: "ia",
    dependsOn: null,
    schedule: "Domingo 10h (atualização semanal) + on-demand",
    metrica: null,
  },
  {
    id: "communityAgent",
    name: "Community Agent",
    icon: "Users",
    description: "Gerencia comunidade WhatsApp — detecta novos membros, envia mensagens de boas-vindas.",
    category: "whatsapp",
    dependsOn: "meta",
    schedule: "09:00 BRT, diário",
    metrica: null,
  },
  {
    id: "insightsAgent",
    name: "Insights Agent",
    icon: "BarChart3",
    description: "Analisa conversas e gera insights de prospecção — taxas de resposta, objeções comuns, melhores horários.",
    category: "ia",
    dependsOn: "meta",
    schedule: "08:30 + 18:00 BRT, diário",
    metrica: null,
  },
  {
    id: "ideaAgent",
    name: "Idea Agent",
    icon: "Lightbulb",
    description: "Gera ideias de campanhas, abordagens e conteúdos baseado no perfil dos prospects.",
    category: "ia",
    dependsOn: "meta",
    schedule: "A cada 6h",
    metrica: null,
  },
  {
    id: "mediaAgent",
    name: "Media Agent",
    icon: "Image",
    description: "Processa e gera mídia (imagens, thumbnails) para campanhas e conteúdo.",
    category: "conteudo",
    dependsOn: "meta",
    schedule: "Sob demanda",
    metrica: null,
  },
  {
    id: "strategyAgent",
    name: "Strategy Agent",
    icon: "Target",
    description: "Recomendações estratégicas de prospecção — ajuste de cadência, segmentação, templates.",
    category: "ia",
    dependsOn: "meta",
    schedule: "Domingo 18:00 BRT",
    metrica: null,
  },
  {
    id: "coachAgent",
    name: "Coach Agent",
    icon: "GraduationCap",
    description: "Coaching de vendas e atendimento — analisa conversas e sugere melhorias de abordagem.",
    category: "ia",
    dependsOn: "meta",
    schedule: "06:00 BRT, diário",
    metrica: null,
  },
];

// ─── Agentes n8n (externos) ───────────────────────────────────────────────────
const AGENTS_N8N = [
  {
    id: "agente_sdr",
    name: "Agente IA SDR",
    icon: "Bot",
    description: "Responde automaticamente qualquer mensagem WhatsApp (texto, imagem, áudio, PDF) via n8n + Groq/OpenAI.",
    category: "whatsapp",
    workflows: ["Processa Imagem", "Processa Áudio", "Processa PDF", "Texto e Cadastro", "IA Resposta"],
  },
  {
    id: "agente_agendador",
    name: "Agente Agendador",
    icon: "Calendar",
    description: "Agenda reuniões no Google Calendar via n8n. Ferramentas Calendar + Registra Reunião.",
    category: "vendas",
    workflows: ["Agendador", "Registra Reuniao", "Follow-up Automático"],
  },
];

// ─── GET /api/equipe/status ───────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
  try {
    // Check environment variables
    const envStatus = {
      openai: !!process.env.OPENAI_API_KEY,
      meta: !!(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
      smtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      imap: !!(process.env.IMAP_HOST && process.env.IMAP_USER),
    };

    // ── Métricas de Email ──
    let emailStats = { campaigns: 0, active: 0, sent: 0, opened: 0, clicked: 0, replied: 0, failed: 0, recipients: 0 };
    try {
      const [ec] = await query("SELECT COUNT(*)::int as total FROM email_campaigns").catch(() => [{ total: 0 }]);
      const [ea] = await query("SELECT COUNT(*)::int as total FROM email_campaigns WHERE status = 'active'").catch(() => [{ total: 0 }]);
      const [es] = await query(`
        SELECT 
          COALESCE(SUM(sent_count),0)::int as sent, 
          COALESCE(SUM(opened_count),0)::int as opened,
          COALESCE(SUM(clicked_count),0)::int as clicked,
          COALESCE(SUM(replied_count),0)::int as replied,
          COALESCE(SUM(bounced_count),0)::int as failed
        FROM email_campaigns
      `).catch(() => [{ sent: 0, opened: 0, clicked: 0, replied: 0, failed: 0 }]);
      const [er] = await query("SELECT COUNT(*)::int as total FROM email_recipients WHERE status = 'pending'").catch(() => [{ total: 0 }]);
      emailStats = {
        campaigns: ec?.total || 0,
        active: ea?.total || 0,
        sent: es?.sent || 0,
        opened: es?.opened || 0,
        clicked: es?.clicked || 0,
        replied: es?.replied || 0,
        failed: es?.failed || 0,
        recipients: er?.total || 0,
        openRate: es?.sent > 0 ? ((es.opened / es.sent) * 100).toFixed(1) : "0",
        replyRate: es?.sent > 0 ? ((es.replied / es.sent) * 100).toFixed(1) : "0",
      };
    } catch { /* fallback */ }

    // ── Métricas Meta WhatsApp ──
    let metaStats = { templates: 0, enviados_hoje: 0, total_enviados: 0, prospects_na_fila: 0 };
    try {
      const [mt] = await query("SELECT COUNT(*)::int as total FROM meta_templates").catch(() => [{ total: 0 }]);
      const hoje = new Date().toISOString().slice(0, 10);
      const [me] = await query(
        "SELECT COUNT(*)::int as total FROM meta_template_logs WHERE created_at::date = $1 AND status = 'sent'",
        [hoje]
      ).catch(() => [{ total: 0 }]);
      const [mtotal] = await query(
        "SELECT COUNT(*)::int as total FROM meta_template_logs WHERE status = 'sent'"
      ).catch(() => [{ total: 0 }]);
      const [mp] = await query(
        "SELECT COUNT(*)::int as total FROM prospects WHERE status = 'novo'"
      ).catch(() => [{ total: 0 }]);
      metaStats = {
        templates: mt?.total || 0,
        enviados_hoje: me?.total || 0,
        total_enviados: mtotal?.total || 0,
        prospects_na_fila: mp?.total || 0,
      };
    } catch { /* fallback */ }

    // ── Métricas Blog ──
    let blogStats = { posts: 0, ultimo: null };
    try {
      const [bp] = await query("SELECT COUNT(*)::int as total FROM blog_posts WHERE status = 'published'").catch(() => [{ total: 0 }]);
      const [bl] = await query(
        "SELECT title, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 1"
      ).catch(() => [null]);
      blogStats = {
        posts: bp?.total || 0,
        ultimo: bl ? { title: bl.title, data: bl.published_at } : null,
      };
    } catch { /* fallback */ }

    // ── Métricas Prospecção ──
    let prospectingStats = { total: 0, novos: 0, enviados: 0, responderam: 0, reunioes: 0 };
    try {
      // Fila de prospects (única métrica que ainda usa leads DB — é onde a fila vive)
      const [pt] = await queryLeads("SELECT COUNT(*)::int as total FROM prospects").catch(() => [{ total: 0 }]);
      const [pn] = await queryLeads("SELECT COUNT(*)::int as total FROM prospects WHERE status = 'novo'").catch(() => [{ total: 0 }]);
      const [pe] = await queryLeads("SELECT COUNT(*)::int as total FROM prospects WHERE status = 'enviado'").catch(() => [{ total: 0 }]);
      // Responderam: CRM (fonte real)
      const [pr] = await query(
        "SELECT COUNT(DISTINCT co.contact_id)::int as total FROM messages m JOIN conversations co ON m.conversation_id = co.id WHERE m.direction = 'inbound' AND m.type = 'text'"
      ).catch(() => [{ total: 0 }]);
      prospectingStats = {
        total: pt?.total || 0,
        novos: pn?.total || 0,
        enviados: pe?.total || 0,
        responderam: pr?.total || 0,
        reunioes: 0,
      };
    } catch { /* fallback */ }

    // ── Monta status dos agentes VPS ──
    const vpsAgents = AGENTS.map((a) => {
      let status = "active";
      let statusMsg = "Ativo";

      if (a.dependsOn && !envStatus[a.dependsOn.toLowerCase()]) {
        status = a.id === "blogAgent" || a.id === "chiefAgent" ? "active" : "paused";
        statusMsg = a.id === "blogAgent" || a.id === "chiefAgent"
          ? "Ativo (independente)"
          : "Pausado (credencial ausente)";
      }

      // Check specific known issues
      if (a.id === "metaDispatcher" && !envStatus.meta) {
        status = "error";
        statusMsg = "Meta API não configurada";
      }

      return { ...a, status, statusMsg };
    });

    // ── Monta status dos agentes n8n ──
    const n8nAgents = AGENTS_N8N.map((a) => ({
      ...a,
      status: "active",
      statusMsg: a.id === "agente_agendador" ? "Ativo (bug: 'amanhã' de madrugada)" : "Ativo",
      issue: a.id === "agente_agendador" ? "Interpreta 'amanhã' errado entre 00h-06h" : null,
    }));

    res.json({
      ok: true,
      serverTime: new Date().toISOString(),
      timezone: process.env.TZ || "UTC",
      env: envStatus,
      metrics: { email: emailStats, meta: metaStats, blog: blogStats, prospecting: prospectingStats },
      agents: {
        vps: vpsAgents,
        n8n: n8nAgents,
        total: vpsAgents.length + n8nAgents.length,
        active: vpsAgents.filter((a) => a.status === "active").length + n8nAgents.filter((a) => a.status === "active").length,
      },
    });
  } catch (err) {
    console.error("[Equipe] Erro /status:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/equipe/logs/:agentId ────────────────────────────────────────────
router.get("/logs/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 20 } = req.query;
    let logs = [];

    switch (agentId) {
      case "metaDispatcher":
        logs = await query(
          `SELECT id, template_name, recipient_phone, status, created_at 
           FROM meta_template_logs 
           ORDER BY created_at DESC LIMIT $1`,
          [Number(limit)]
        ).catch(() => []);
        break;
      case "emailDispatcher":
        logs = await queryLeads(
          `SELECT id, campaign_id, recipient_email, status, sent_at, error_msg 
           FROM email_send_logs 
           ORDER BY sent_at DESC LIMIT $1`,
          [Number(limit)]
        ).catch(() => []);
        break;
      case "blogAgent":
        logs = await query(
          `SELECT id, title, slug, status, published_at 
           FROM blog_posts 
           ORDER BY published_at DESC LIMIT $1`,
          [Number(limit)]
        ).catch(() => []);
        break;
      default:
        break;
    }

    res.json({ ok: true, agentId, logs: logs || [], count: (logs || []).length });
  } catch (err) {
    console.error("[Equipe] Erro /logs:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/equipe/timeline ─────────────────────────────────────────────────
router.get("/timeline", async (_req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    // Últimos 7 dias de atividade
    const events = [];

    // Email logs (últimas 48h)
    try {
      const emailLogs = await queryLeads(
        "SELECT 'email' as source, status, created_at::text as ts FROM email_send_logs WHERE created_at > NOW() - INTERVAL '48 hours' ORDER BY created_at DESC LIMIT 30"
      ).catch(() => []);
      events.push(...(emailLogs || []).map((l) => ({
        type: "email",
        icon: "Mail",
        text: `Email ${l.status}`,
        time: l.ts,
      })));
    } catch { /* */ }

    // Meta logs (últimas 48h)
    try {
      const metaLogs = await query(
        "SELECT template_name, status, created_at::text as ts FROM meta_template_logs WHERE created_at > NOW() - INTERVAL '48 hours' ORDER BY created_at DESC LIMIT 30"
      ).catch(() => []);
      events.push(...(metaLogs || []).map((l) => ({
        type: "meta",
        icon: "MessageCircle",
        text: `${l.template_name}: ${l.status}`,
        time: l.ts,
      })));
    } catch { /* */ }

    // Blog posts (últimos 30 dias)
    try {
      const blogPosts = await query(
        "SELECT title, published_at::text as ts FROM blog_posts WHERE status='published' AND published_at > NOW() - INTERVAL '30 days' ORDER BY published_at DESC LIMIT 10"
      ).catch(() => []);
      events.push(...(blogPosts || []).map((b) => ({
        type: "blog",
        icon: "PenTool",
        text: `Artigo: ${b.title?.substring(0, 60)}...`,
        time: b.ts,
      })));
    } catch { /* */ }

    events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    res.json({ ok: true, events: events.slice(0, 50), count: events.length });
  } catch (err) {
    console.error("[Equipe] Erro /timeline:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/equipe/chief/run — Força execução do Chief Agent ────────────
router.post("/chief/run", async (_req, res) => {
  try {
    const { runChiefAgent } = await import("../services/chiefAgent.js");
    res.json({ ok: true, message: "Chief Agent iniciado. Verifique os logs." });
    setTimeout(() => runChiefAgent(), 500);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/equipe/chief/tasks — Lista tarefas do Chief ──────────────────
router.get("/chief/tasks", async (req, res) => {
  try {
    const tasks = await query(
      "SELECT * FROM chief_tasks ORDER BY created_at DESC LIMIT 30"
    ).catch(() => []);
    res.json({ ok: true, tasks: tasks || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/equipe/chief/tasks/:id — Atualiza status da tarefa ─────────
router.patch("/chief/tasks/:id", async (req, res) => {
  try {
    const { status } = req.body;
    await run(
      "UPDATE chief_tasks SET status = ?, completed_at = CASE WHEN ? = 'concluida' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id = ?",
      [status, status, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/equipe/security/scan — Dispara scan de segurança ───────
router.post("/security/scan", async (_req, res) => {
  try {
    const { runSecurityAgent } = await import("../services/securityAgent.js");
    res.json({ ok: true, message: "Security scan iniciado. Resultados em instantes." });
    setTimeout(() => runSecurityAgent(), 100);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
