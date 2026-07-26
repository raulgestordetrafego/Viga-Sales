# Graph Report - .  (2026-05-05)

## Corpus Check
- Large corpus: 47 files · ~1,637,075 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 289 nodes · 479 edges · 13 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.88)
- Token cost: 26,548 input · 8,104 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Brand Identity & Visual Assets|Brand Identity & Visual Assets]]
- [[_COMMUNITY_AB Capital CRM Backend|AB Capital CRM Backend]]
- [[_COMMUNITY_CRM API & Analytics|CRM API & Analytics]]
- [[_COMMUNITY_Sales Tasks & Coaching Module|Sales Tasks & Coaching Module]]
- [[_COMMUNITY_Landing Pages & CRM Frontend|Landing Pages & CRM Frontend]]
- [[_COMMUNITY_WhatsApp  Evolution API|WhatsApp / Evolution API]]
- [[_COMMUNITY_Viga Sales Brand Identity|Viga Sales Brand Identity]]
- [[_COMMUNITY_Moldesfix Landing Page|Moldesfix Landing Page]]
- [[_COMMUNITY_AB Capital Routes & Auth|AB Capital Routes & Auth]]
- [[_COMMUNITY_AB Capital Brand Identity|AB Capital Brand Identity]]
- [[_COMMUNITY_Viga Sales Marketing & Ads|Viga Sales Marketing & Ads]]
- [[_COMMUNITY_Client Briefing Module|Client Briefing Module]]
- [[_COMMUNITY_Database Config|Database Config]]

## God Nodes (most connected - your core abstractions)
1. `VIGA Logo` - 22 edges
2. `query()` - 17 edges
3. `getApi()` - 17 edges
4. `getInstance()` - 14 edges
5. `run()` - 13 edges
6. `queryOne()` - 12 edges
7. `VIGA Sales` - 12 edges
8. `MoldesFix Landing Page` - 12 edges
9. `DatabaseWrapper` - 11 edges
10. `Brand Color: Orange/Amber (accent color)` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Cardiocor Contact Form → WhatsApp Redirect` --semantically_similar_to--> `Mass Broadcast Feature (Disparos em Massa)`  [INFERRED] [semantically similar]
  cardiocor/index.html → README.md
- `Viga Sales Brand` --semantically_similar_to--> `Construction / Structural Beam Motif (Viga = Beam in Portuguese)`  [INFERRED] [semantically similar]
  manual de identidade viusal viga sales/unnamed.jpg → public/favicon.svg
- `Render Web Service (crm-pro-whatsapp)` --implements--> `Viga Sales WhatsApp CRM (README)`  [INFERRED]
  render.yaml → README.md
- `AB Capital CRM Frontend (Single-page App)` --conceptually_related_to--> `Viga Sales WhatsApp CRM (README)`  [INFERRED]
  public/abcapital/index.html → README.md
- `Viga Sales Frontend Entry Point` --references--> `vigasales.shop Domain (CRM Production)`  [INFERRED]
  index.html → docker-compose.yml

## Hyperedges (group relationships)
- **WhatsApp Automated Prospecting Pipeline** — prospecting_strategy_flow1, prospecting_strategy_flow2, n8n_automation_service, readme_evolution_api [EXTRACTED 0.95]
- **Production VPS Infrastructure Stack** — dockercompose_viga_sales_service, dockercompose_traefik, n8n_automation_service, vigasales_domain [EXTRACTED 0.95]
- **AB Capital CRM System (Landing + CRM Frontend + Evolution API)** — abcapital_landing_page, abcapital_crm_frontend, readme_evolution_api [INFERRED 0.75]

## Communities (17 total, 2 thin omitted)

### Community 0 - "Brand Identity & Visual Assets"
Cohesion: 0.08
Nodes (48): Amber/Orange Brand Color, Navy Blue Brand Color, Meta Ads Platform, Neutral Off-White Background, VIGA Navy Circle Badge with Orange Logo, Viga Brand Identity, VIGA Brand Name, VIGA Trifold Brochure: Projetando Resultados Solidos (+40 more)

### Community 1 - "AB Capital CRM Backend"
Cohesion: 0.1
Nodes (15): DatabaseWrapper, getDb(), hashPwd(), initDb(), initializeSchema(), query(), queryOne(), run() (+7 more)

### Community 2 - "CRM API & Analytics"
Cohesion: 0.05
Nodes (11): globalSearch(), stats(), statsDaily(), statsRecent(), Avatar(), avatarBg(), ContactDrawer(), ErrorBoundary (+3 more)

### Community 3 - "Sales Tasks & Coaching Module"
Cohesion: 0.08
Nodes (9): fmt(), CoachingSettingsModal(), DailyCoachingPanel(), fmtDue(), gcalLink(), getTodayTip(), KanbanCard(), overdue() (+1 more)

### Community 4 - "Landing Pages & CRM Frontend"
Cohesion: 0.1
Nodes (27): AB Capital CRM Frontend (Single-page App), AB Capital Landing Page (Consórcios sem juros), Cardiocor Contact Form → WhatsApp Redirect, Cardiocor — Clínica Cardiológica Landing Page, Cardiocor WhatsApp Contact (+55 61 99553-6502), Deploy Guide: vigasales.com.br DNS + Nginx + SSL, n8n Flow 4: Daily Prospecting Report via Email, Gemini API Integration (env var GEMINI_API_KEY) (+19 more)

### Community 5 - "WhatsApp / Evolution API"
Cohesion: 0.24
Nodes (22): configureWebhook(), extractContent(), fetchChats(), fetchContacts(), fetchMessages(), formatPhone(), getApi(), getApiKey() (+14 more)

### Community 6 - "Viga Sales Brand Identity"
Cohesion: 0.25
Nodes (16): 3D Isometric Floating Cube (Orange/Amber), Viga Sales Brand, Brand Ambassador / Representative, Amber/Orange Brand Color (#F0A020), Brand Color: Gold/Amber, Brand Color: Navy Blue, Brand Color: White, Structural Column / Beam Shape (Navy/Dark Blue Body) (+8 more)

### Community 7 - "Moldesfix Landing Page"
Cohesion: 0.19
Nodes (15): MoldesFix Brand, MoldesFix Color Palette (Warm Beige, Orange-Red Accents, White), MoldesFix CTA Button - Assinar Agora, MoldesFix FAQ Section, MoldesFix How It Works Section, MoldesFix Landing Page, MoldesFix Members Area Preview, MoldesFix Complete Sewing Patterns Library (+7 more)

### Community 8 - "AB Capital Routes & Auth"
Cohesion: 0.33
Nodes (7): abAuth(), abMaster(), buildWhere(), csvRow(), fmtDate(), fmtMoney(), getAbSession()

### Community 9 - "AB Capital Brand Identity"
Cohesion: 0.31
Nodes (9): AB Capital Brand Identity, AB Capital Brand Color: Gold / Dark Yellow, White Brand Color, AB Capital Favicon (192px), Hexagonal / Faceted Geometric Shape, AB Capital Logo, AB Capital Logo Mark (Geometric Monogram), AB Monogram (Stylized Letters A and B) (+1 more)

### Community 10 - "Viga Sales Marketing & Ads"
Cohesion: 0.39
Nodes (8): CTA: Fale com Nossos Especialistas, VIGA Sales Promotional Advertisement, Construction Sector Target Audience, Qualified Leads for Large Projects, Brand Solidity and Solid Results, Construction Crane Background Visual, Pencil / Technical Drawing Visual Element, Ruler / Measurement Tool Visual Element

## Knowledge Gaps
- **23 isolated node(s):** `Render Web Service (crm-pro-whatsapp)`, `Backend Stack: Node.js + Express + Socket.IO`, `Kanban Pipeline Feature`, `Docker Compose: postgres-agente container`, `Cardiocor WhatsApp Contact (+55 61 99553-6502)` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fmt()` connect `Sales Tasks & Coaching Module` to `CRM API & Analytics`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `Render Web Service (crm-pro-whatsapp)`, `Backend Stack: Node.js + Express + Socket.IO`, `Kanban Pipeline Feature` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Brand Identity & Visual Assets` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `AB Capital CRM Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `CRM API & Analytics` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Sales Tasks & Coaching Module` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Landing Pages & CRM Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._