# Relatório Semanal (todos os clientes) — Passo a Passo

> Modelo instrutivo de como montar o envio automático do relatório semanal da Viga
> Sales para **qualquer cliente**. Referência funcional: Casa da Fé (set/2026).
> Última revisão: 2026-09-26.

## O que é

Fluxo **n8n** que, toda **segunda-feira às 08:00** (America/Sao_Paulo), envia no
**grupo do cliente** uma **imagem de capa padrão da Viga Sales** + o **relatório da
semana anterior** (segunda→domingo) como **legenda**:

- 🔎 Google Ads (investido, conversões, CPA, cliques, CTR)
- 📣 Meta Ads (investido, alcance, impressões, conversas WhatsApp, CPA)
- 📸 Instagram (base de seguidores, novos na semana, **custo por novo seguidor**)
- 🏆 Metas do mês (leads WhatsApp, alcance, base de seguidores)
- 🔗 Link do dashboard

Modelo do fluxo (sem segredos): `03 - Playbooks/flow-modelo-relatorio-semanal.json`

---

## Pré-requisitos

| Item | Detalhe |
|---|---|
| **Token Meta** | Token de **Usuário do Sistema** (não expira) com `ads_read`, `pages_show_list`, `pages_read_engagement`, `business_management`, **`instagram_basic`**, **`instagram_manage_insights`** |
| **Instagram** | A conta IG do cliente precisa estar **vinculada à Página** e **atribuída ao usuário do sistema** (senão a Meta omite o IG) |
| **Google Ads** | `developer-token`, OAuth `client_id`/`client_secret`, `refresh_token`, `login-customer-id` (MCC) |
| **Evolution API** | URL + api key + nome da instância (ex.: `Raul Santos`) |
| **Grupo** | JID do grupo do cliente (`...@g.us`) |
| **n8n** | Instância na VPS (`n8n.vigasales.shop`), API key em `/root/n8n_api_token.txt` |

> Regra de ouro do token: permissões ficam **gravadas no token** na hora de gerar.
> Atribuir o ativo (Instagram) ao usuário do sistema **não** adiciona permissão a um
> token já existente — **gerar token novo** com as permissões marcadas.

---

## Passo 1 — Capa padrão (uma vez, serve pra todos)

- Padrão em `01 - Brand/`:
  - `relatorio-semanal-capa.png` (master)
  - `relatorio-semanal-capa.jpg` (web/envio, ~130 KB)
  - `relatorio-semanal-fundo.png` (fundo, pra recompor)
- **Nunca peça logo/texto ao modelo.** Fluxo: gerar só o **fundo** com a skill
  `generate-image` (prompt sem texto/logo, paleta da marca) e **compor** com
  `~/.agents/skills/generate-image/compose_brand_image.py` (logo real + fonte
  **Montserrat**).
- Converte pra JPEG ~1280px e gera **base64** (vai embutido no fluxo).

---

## Passo 2 — Descobrir os IDs do cliente

```bash
# Grupo (Evolution): GET /group/fetchAllGroups/Raul%20Santos?getParticipants=false
# Instagram id: pegar via criativos OU página
#   GET /act_<AD_ACCOUNT>/ads?fields=creative{instagram_actor_id}
#   GET /<PAGE_ID>?fields=instagram_business_account{id,username,followers_count}
# Testar seguidores:
#   GET /<IG_ID>?fields=followers_count
#   GET /<IG_ID>/insights?metric=follower_count&period=day&since=AAAA-MM-DD&until=AAAA-MM-DD
```

---

## Passo 3 — Montar o fluxo (nós)

`Schedule (cron 0 8 * * 1)` → `Config` → `Preparar` → `Google Ads Semana` → `Google Ads Mês`
→ `Meta Ads Semana` → `Meta Ads Mês` → `IG Seguidores` → `IG Novos` → `Montar Relatório`
→ `Enviar WhatsApp (sendMedia)`.

- **Data da semana (anterior):** `today.weekday` → segunda; `weekStart = monday - 7d`,
  `weekEnd = monday - 1d` (seg–dom).
- **Google:** `segments.date BETWEEN weekStart AND weekEnd` (mês: `monthStart..today`).
- **Meta:** usar **`time_range` explícito** (`{since, until}`), **não** preset.
- **Instagram:** `since=weekStart`, `until=weekEnd` **+ 1 dia** (o `until` é exclusivo).
- **Conversas WhatsApp:** somar `onsite_conversion.messaging_conversation_started_7d`
  das campanhas com "vendas whatsapp" no nome.
- **Custo por novo seguidor:** gasto da campanha de **Tráfego** ÷ novos seguidores do IG.
- **Enviar:** `POST {evolution_url}/message/sendMedia/{instancia}` com
  `{ number, mediatype:'image', mimetype:'image/jpeg', fileName, caption, media: <base64> }`.

---

## Passo 4 — Deploy e ativação (API n8n)

```bash
TOK=$(cat /root/n8n_api_token.txt)          # na VPS
docker cp flow.json n8n-n8n-1:/tmp/flow.json
docker exec n8n-n8n-1 n8n import:workflow --input=/tmp/flow.json
curl -s -X POST -H "X-N8N-API-KEY: $TOK" \
  https://n8n.vigasales.shop/api/v1/workflows/<ID>/activate
```

O JSON precisa de `"id"` no nível do workflow.

### Teste antes de valer (sem spammar o grupo)
1. Crie uma **cópia** com cron `* * * * *` e destino = **seu número** ou um grupo de teste.
2. Importe, ative, espere ~1–2 min.
3. Confira a execução: `GET /api/v1/executions/<id>?includeData=true` → **`status: success`**.
4. **Apague** a cópia e ative o fluxo real.

---

## Pegadinhas (aprendidas na prática)

- **IG insights:** o parâmetro `until` é **exclusivo** → use `weekEnd + 1 dia`.
- **Meta:** `date_preset` depende do "hoje" do Meta; **fixe `time_range`**.
- **Instagram não aparece:** quase sempre falta `instagram_basic` no token **ou** o ativo
  IG não está atribuído ao usuário do sistema.
- **Seguidores não existem na API de anúncios** (sem ação `follow`) → use a IG API
  (`followers_count` + `follower_count`).
- **Legenda do WhatsApp:** ~1024 caracteres de limite.
- **CLI `n8n execute`** conflita com a instância rodando ("Task Broker port 5679") → use
  a API REST + cron.
- **Segredos:** nunca commitar. Use a versão de modelo e cole as credenciais só no n8n.

---

## Arquivos relacionados

- Fluxo (modelo): `03 - Playbooks/flow-modelo-relatorio-semanal.json`
- Capa padrão: `01 - Brand/relatorio-semanal-capa.{png,jpg}`
- Helper de composição: `~/.agents/skills/generate-image/compose_brand_image.py`
- Skill: `~/.agents/skills/generate-image/SKILL.md` (seção "Identidade de marca")
