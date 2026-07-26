<!-- KEYWORDS: vendas, abordagem, script, qualificação, discovery call, reunião, proposta, fechamento, objeção, negociação, case, SPIN, Challenger, BANT, objeção preço, objeção concorrência, follow-up, não, perdi, ganhei, contrato, onboarding, pós-venda -->

# Playbooks de Vendas B2B

## Quick Summary
Roteiro completo de vendas da Viga Sales: abordagem WhatsApp frio → resposta → qualificação → reunião de descoberta → proposta → negociação → fechamento → onboarding. Inclui scripts testados, objeções reais e contra-argumentos, cases de negócios fechados e perdidos.

---

## Fluxo de Vendas

### Etapa 1: Abordagem (WhatsApp Frio)
- **Canal**: MetaDispatcher (Dante) — WhatsApp Marketing API
- **Volume**: 400/dia, Seg-Sex, 8h-19h
- **Templates ativos**: 8-12 templates com rotação
- **Estrutura do template**:
  1. Saudação + personalização (nome/empresa) `{{1}}`
  2. Gatilho de curiosidade (ex: "Vi que vocês atendem 30+ leads/dia...")
  3. Dado/prova social (ex: "Construtoras que automatizaram aumentaram 40% as vendas")
  4. CTA leve (ex: "Posso te mandar um vídeo de 2min mostrando como funciona?")
  5. Variável de personalização `{{2}}` no final

### Etapa 2: Primeira Resposta
- **Tempo alvo**: < 5 minutos (ideal < 2min)
- **Quem responde**: SDR (Maria) via n8n
- **Roteiro SDR**:
  - "Opa {{nome}}! Vi que você se interessou pela automação. Me conta rapidinho: qual o maior desafio de vocês com atendimento hoje?"
  - Qualifica com 3 perguntas:
    1. Quantos leads/imóveis recebem por dia?
    2. Como fazem o atendimento hoje? (WhatsApp pessoal? Planilha?)
    3. Já usaram alguma ferramenta de automação?

### Etapa 3: Qualificação (Discovery Call)
- **Duração**: 15-20 min
- **Quem faz**: Raul
- **Framework**: SPIN Selling adaptado
  - **S**ituação: "Me conta como é o processo de vendas de vocês hoje"
  - **P**roblema: "Quanto tempo demora pra responder um lead? Já perderam venda por isso?"
  - **I**mplicação: "Se vocês convertessem 40% a mais, quanto isso representaria em receita?"
  - **N**ecessidade: "Imagina todo lead respondido em 30 segundos, 24h por dia..."
- **Checklist BANT** (rodar mentalmente):
  - Budget: Tem budget mensal pra ferramenta? (R$1.500+)
  - Authority: É o decisor ou precisa aprovar com sócio?
  - Need: Dor é real ou curiosidade?
  - Timeline: Quer resolver agora ou "vou pensar"?

### Etapa 4: Proposta
- **Formato**: PDF ou apresentação rápida (Loom/WhatsApp)
- **Estrutura**:
  1. Entendi seu desafio (recapitula a conversa)
  2. Como a Viga resolve (solução específica, não genérica)
  3. O que está incluso (serviço + suporte + SLA)
  4. Investimento (faixa, não valor exato até negociar)
  5. Próximo passo (contrato, onboarding, prazo)
- **Timing**: Enviar em até 24h após a call

### Etapa 5: Follow-up
- **Dia 1**: Envia proposta + "Fico à disposição"
- **Dia 3**: Mensagem de valor: "Lembrei de vocês quando vi [algo relevante]"
- **Dia 7**: "Sem pressa, só queria saber se ficou alguma dúvida"
- **Dia 14**: Último follow-up. Se não responder, entra em nurtura (email/blog).

---

## Objeções Reais e Respostas

### "Tá caro" / "Não tenho orçamento agora"
- **Contra-argumento**: "Entendo. Só uma conta rápida: se vocês perdem 5 vendas/mês por atendimento lento, a R$50k cada, são R$250k/mês perdidos. O investimento é R$2k/mês. O ROI é 125x."
- **Tática**: Reduzir escopo (começar só com bot, depois CRM). Parcelamento.

### "Já tenho uma ferramenta"
- **Contra-argumento**: "Qual? O que ela faz que você gosta? E o que falta?" → Descobrir gaps.
- **Tática**: Integrar, não substituir. "Podemos complementar o que você já tem."

### "Meu time não vai usar"
- **Contra-argumento**: "Por isso a gente faz onboarding + treinamento. Em 1 semana seu time tá rodando. E o sistema é tão simples quanto WhatsApp."
- **Tática**: Oferecer 1 semana de teste gratuito com 2 vendedores.

### "Vou pensar / Depois a gente vê"
- **Contra-argumento**: "Claro. Só pra eu entender: tem alguma objeção específica ou é timing?"
- **Tática**: Se for timing, agendar follow-up com data. Se for objeção velada, descobrir qual.

### "Meu sobrinho faz site mais barato"
- **Contra-argumento**: "Site bonito é fácil. O difícil é site que converte e ranqueia no Google. Isso é engenharia de conversão + SEO. Não é design."
- **Tática**: Mostrar métricas de sites anteriores (tráfego, leads gerados).

---

## Cases de Sucesso

### Case 1: Construtora ABC — Automação WhatsApp + CRM
- **Desafio**: 40 leads/dia, 2 vendedores, resposta em 2h+
- **Solução**: Bot de qualificação 24/7 + CRM integrado
- **Resultado**: Tempo de resposta caiu pra 12 segundos. Conversão subiu de 12% pra 31%. Fecharam 8 vendas a mais no primeiro mês.
- **Chave do sucesso**: Dono comprou a ideia rápido. Time abraçou. Onboarding em 4 dias.

### Case 2: Engenharia XYZ — Tráfego Pago + Landing Page
- **Desafio**: Zero presença online. Só indicação. Queria crescer.
- **Solução**: Meta Ads + LP otimizada + CRM
- **Resultado**: 200 leads/mês. Custo por lead R$18. ROAS de 4.2x.
- **Chave do sucesso**: Cliente paciente (resultados em 3 meses).

---

## Cases de Perda (Aprendizados)

### Perda 1: Construtora que queria só o bot
- **Motivo**: Orçamento baixo. Queria pagar R$300/mês.
- **Aprendizado**: Não descer o preço pra fechar. Cliente barato dá mais trabalho e churna rápido.

### Perda 2: Grande incorporadora — processo lento
- **Motivo**: 4 meses de negociação. Compraram da concorrência (indicação de amigo).
- **Aprendizado**: Ciclo >2 meses = risco alto. Precisa de champion interno.

### Perda 3: Cliente que sumiu após proposta
- **Motivo**: Proposta genérica. Não conectou com a dor específica dele.
- **Aprendizado**: Personalizar cada proposta. Sempre recapitular a conversa.

---

## Vendas High-Ticket (R$ 300k+/mês)

### Fontaine: ROI Hunters #339
- **Cliente grande não compra preço — compra certeza**
- Quanto maior o ticket, mais importante é o relacionamento pré-venda
- **Educação antes da venda**: cliente high-ticket precisa entender o problema ANTES de ver a solução
- Ciclo de venda high-ticket: 1-6 meses. Não apresse.
- **Prova social de peso**: "Quem como você já resolveu isso com a gente"
- Personalize TUDO. Proposta genérica = morte em venda grande
- **Champion interno**: encontre alguém dentro da empresa que vai lutar por você

### Aplicação Viga Sales
- Construtoras grandes (50+ funcionários) = venda consultiva, não transacional
- Raul precisa de 2-3 calls antes da proposta (discovery → técnica → fechamento)
- Documente cases de R$5k+/mês como prova social para clientes do mesmo porte

---

## Vendas com Criatividade (Meme/Método Não-Convencional)

### Fontaine: ROI Hunters #342
- **Memes e humor quebram barreiras** no B2B — todo mundo espera formalidade
- O primeiro contato não precisa parecer comercial. Precisa parecer HUMANO.
- **Padrão**: "Senhor fulano, segue proposta comercial..." → IGNORADO
- **Quebra de padrão**: "Fala fulano! Vi teu stories da obra e lembrei de você..." → RESPONDIDO
- Use o que o lead já postou/publicou como gancho — mostra que você pesquisou
- **Venda B2B ainda é people-to-people**. Empresa não compra. Pessoa compra.
- Áudio de WhatsApp personalizado converte mais que texto frio

### Aplicação Viga Sales
- Templates do Dante podem ter tom mais humano e menos corporativo
- Exemplo: "{{1}}, vi que vocês tão com várias obras. Seu WhatsApp deve tá bombando! 😅"
- Áudio do Raul após primeira resposta = diferencial que ninguém faz

---

## 20 Anos de Vendas em 1 Hora

### Fontaine: Carlos Busch (ROI Hunters #323)
- **Vendas é ciência, não arte** — tem método, processo e métrica
- Os 3 pilares da venda: Prospecção → Apresentação → Fechamento
- **Prospecção**: quantidade consistente TODO DIA. Sem pular.
- **Apresentação**: fale menos, pergunte mais. O cliente deve falar 70% do tempo.
- **Fechamento**: não "empurre" — faça o cliente chegar à conclusão sozinho
- Objeção não é rejeição. É pedido de mais informação.
- **Follow-up**: a venda começa depois do primeiro "não"
- Anote TUDO. Todo "não" tem um motivo. Todo "sim" também.
- **Meta diária de contatos**: defina um número e bata todo dia. Sem desculpa.

### Aplicação Viga Sales
- Dante = prospecção automatizada (consistência garantida)
- Calls do Raul = o cliente deve falar 70% (SPIN Selling)
- Follow-up system já existe (SDR + email nutrição)
- Registrar motivo de cada "não" — isso alimenta o cérebro do Chief
