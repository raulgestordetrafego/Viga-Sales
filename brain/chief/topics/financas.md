<!-- KEYWORDS: MRR, receita, faturamento, cliente ativo, ticket médio, custo operacional, margem, lucro, projeção, meta, break-even, CAC, LTV, payback, ROI, churn, servidor, API, assinatura, ferramenta, custo fixo, custo variável, fluxo de caixa -->

# Finanças da Agência

## Quick Summary
A Viga Sales opera com modelo de receita recorrente (MRR). Os principais custos são servidores, APIs (OpenAI, Meta, WhatsApp) e ferramentas. Margem bruta saudável (60-80%). O break-even por cliente novo é atingido em 2-4 meses. A meta é escalar MRR reduzindo dependência do operacional do Raul.

---

## Estrutura de Receita

### Modelo de Negócio
- **Tipo**: Agência de automação B2B com receita recorrente
- **Ticket médio**: R$2.500/mês (automação + CRM)
- **Clientes ativos**: ~5-10 (flutuante)
- **MRR estimado**: R$12.500 - R$25.000
- **Receita não-recorrente**: Projetos de site (R$3.000 - R$15.000 cada)

### Fontes de Receita
| Fonte | % da receita | Recorrente? |
|-------|-------------|-------------|
| Automação WhatsApp | 50% | Sim |
| Tráfego Pago (gestão) | 25% | Sim |
| CRM | 15% | Sim |
| Sites | 10% | Não |

### Churn
- **Taxa atual**: ~10-15%/ano (estimado)
- **Motivos de churn**:
  1. Cliente "testou e não viu resultado" (onboarding ruim)
  2. Crise no setor (construção civil cíclico)
  3. Cliente muito pequeno (não era ICP)
- **Meta de churn**: < 5%/ano (classe mundial SaaS)

---

## Estrutura de Custos

### Custos Fixos Mensais
| Item | Valor aproximado | Nota |
|------|-----------------|------|
| Servidor (Hetzner) | R$200-400 | VPS principal |
| OpenAI API | R$100-500 | Agentes, blog, análise |
| WhatsApp Business API | R$0,071/msg (~R$300-600) | Variável com volume |
| Domínios + Email (Poste.io) | R$50-100 | vigasales.com.br etc |
| Banco de dados (PostgreSQL) | R$0-150 | Incluso no VPS ou separado |
| Ferramentas (Google Workspace, etc) | R$100-200 | Email, drive, meet |
| **Total fixo** | **~R$750 - R$1.950** | |

### Custos por Cliente Novo (CAC)
- **Custo por lead**: R$0,36/msg WhatsApp + R$18/lead tráfego pago
- **Leads para fechar 1 cliente**: ~100-200 envios
- **CAC WhatsApp frio**: ~R$20-40
- **CAC Tráfego pago**: ~R$80-160
- **Tempo do Raul (vendas)**: ~2-3h por cliente fechado
- **CAC total (incluindo tempo)**: ~R$200-500

---

## Métricas Financeiras

### Unit Economics
- **LTV estimado**: R$1.500/mês × 18 meses = R$27.000
- **LTV com upsell**: R$2.500/mês × 24 meses = R$60.000
- **CAC Payback**: 1-3 meses
- **Relação LTV/CAC**: 50x+ (excelente para SaaS)

### Break-even por Canal
- **WhatsApp frio**: 1 cliente paga 150.000 envios (~R$585)
- **Tráfego pago**: 1 cliente paga 3-6 meses de gestão de anúncios do próprio cliente
- **Blog/SEO**: Custo zero de aquisição, mas 6-12 meses pra ranquear

---

## Metas Financeiras

### Curto Prazo (3 meses)
- MRR: R$25.000 → R$35.000
- Clientes ativos: 10 → 14
- Reduzir custo OpenAI otimizando prompts/modelos menores

### Médio Prazo (6-12 meses)
- MRR: R$50.000+
- Clientes ativos: 20+
- Primeiro funcionário (SDR ou Suporte)
- Raul foca só em fechamento e estratégia

### Longo Prazo (2-3 anos)
- MRR: R$150.000+
- Equipe de 3-5 pessoas
- Raul é CEO, não operador
- Múltiplos canais: indicação + tráfego + conteúdo
