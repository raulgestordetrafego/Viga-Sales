<!-- KEYWORDS: processo, fluxo, lead, Dante, Rita, Clarice, Nascimento, Ivone, SDR, agendador, BossMode, onboarding, entrega, SLA, tempo, gargalo, etapa, funil, prospecção, disparo, resposta, qualificação, reunião, proposta, contrato, meta dispatcher, email dispatcher, Chief -->

# Processos Internos

## Quick Summary
Fluxo completo da Viga Sales: da entrada do lead até a entrega do serviço. Cada etapa tem um responsável (agente ou humano), SLA definido e pontos de gargalo conhecidos. O Chief usa este mapa para identificar onde a operação está travando.

---

## Fluxo Lead-to-Revenue

```
[Lead entra] → [Dante dispara] → [Lead responde] → [SDR qualifica] → [Raul faz call] → [Proposta] → [Fechamento] → [Onboarding] → [Entrega]
```

### Etapa 1: Entrada de Leads
- **Fontes**: Importação manual (CSV), landing pages, formulários do site, API de terceiros
- **Volume**: Variável (100-500/semana)
- **Onde ficam**: Tabela `prospects`, status `novo`
- **SLA**: Processar em até 24h da entrada

### Etapa 2: Disparo (Dante / MetaDispatcher)
- **O que faz**: Pega leads `novo`, reserva (atomic lock), envia template via WhatsApp Meta API
- **Volume**: 400/dia, Seg-Sex, 8h-19h
- **Ciclo**: 6 leads a cada 2 minutos (respeita rate limit da Meta)
- **SLA**: Lead novo deve ser disparado em até 24h (se fila < 400)
- **Gargalo**: Se fila > 400, leads acumulam. Solução: aumentar limite ou horários.
- **Logs**: `prospecting_logs` action = `enviado_meta`

### Etapa 3: Primeira Resposta (SDR Maria / n8n)
- **O que faz**: Quando lead responde, SDR qualifica com 3 perguntas e tenta agendar reunião
- **SLA**: Responder em < 5 minutos
- **Gargalo**: Se SDR falha/demora, lead esfria. Manter n8n saudável.

### Etapa 4: Reunião (Raul)
- **O que faz**: Discovery call 15-20min. SPIN + BANT.
- **SLA**: Agendar em até 48h após qualificação
- **Gargalo**: Disponibilidade do Raul. Se muitas calls, priorizar leads mais quentes.

### Etapa 5: Proposta
- **O que faz**: Raul envia proposta personalizada
- **SLA**: 24h após call
- **Gargalo**: Se Raul esquece, lead morre.

### Etapa 6: Fechamento
- **O que faz**: Contrato, pagamento, onboarding agendado
- **SLA**: 1-2 semanas da proposta (ciclo normal)
- **Gargalo**: Burocracia do cliente, aprovação de sócio.

### Etapa 7: Onboarding
- **O que faz**: Setup técnico + treinamento da equipe do cliente
- **SLA**: 1-2 semanas do fechamento
- **Gargalo**: Cliente não prioriza onboarding. Raul precisa pressionar.

### Etapa 8: Entrega Contínua
- **O que faz**: Manutenção, otimização, relatórios, suporte
- **SLA**: Resposta em < 4h (horário comercial). Resolução em < 24h.

---

## Papéis dos Agentes no Fluxo

| Agente | Papel no processo | Etapa |
|--------|------------------|-------|
| Dante (MetaDispatcher) | Dispara templates WhatsApp | Etapa 2 |
| Rita (EmailDispatcher) | Dispara campanhas de email | Etapa 2 (email) |
| Maria (SDR n8n) | Qualifica leads que respondem | Etapa 3 |
| Tobias (Agendador n8n) | Agenda reuniões | Etapa 3-4 |
| Clarice (BlogAgent) | Cria conteúdo do blog | Nutrição pós-resposta |
| Ivone (InsightsAgent) | Relatórios diários de métricas | Monitoramento |
| General (StrategyAgent) | Diagnóstico semanal | Estratégia |
| Nascimento (SecurityAgent) | Segurança 24/7 | Infra |
| BossMode | Interface do Raul com todos os agentes | Orquestração |
| Chief (CEO) | Briefings, OKRs, direção estratégica | Visão global |

---

## Gargalos Conhecidos

| Gargalo | Causa | Solução |
|---------|-------|---------|
| Fila de leads acumulada | Limite 400/dia insuficiente | Aumentar limite ou usar email complementar |
| Leads respondem mas SDR não qualifica | n8n offline ou script quebrado | Monitorar saúde do n8n |
| Muitas calls agendadas, poucas fechadas | Qualificação fraca (lead não é ICP) | Melhorar templates/segmentação |
| Proposta enviada, lead some | Sem follow-up automático | Follow-up system |
| Onboarding demora | Cliente não prioriza | Expectativa clara no fechamento: "começamos dia X" |

---

## SLA por Etapa

| Etapa | Tempo Máximo | Dono |
|-------|-------------|------|
| Lead novo → Disparado | 24h | Dante |
| Resposta → Qualificação | 5min | SDR Maria |
| Qualificado → Call agendada | 48h | Tobias + Raul |
| Call → Proposta enviada | 24h | Raul |
| Proposta → Follow-up 1 | 3 dias | Raul |
| Proposta → Fechamento | 14 dias (típico) | Raul |
| Fechamento → Onboarding iniciado | 7 dias | Raul |
| Onboarding → Go-live | 14 dias | Raul |
