<!-- KEYWORDS: experimento, decisão, histórico, tentativa, resultado, aprendizado, erro, acerto, mudança, teste, AB, pivot, estratégia abandonada, o que funcionou, o que não funcionou, limite diário, template, horário, canal, campanha -->

# Histórico de Decisões

## Quick Summary
Registro vivo de todas as decisões estratégicas, experimentos e pivôs da Viga Sales. Cada entrada documenta o que foi tentado, o resultado e o aprendizado. Deve ser atualizado a cada decisão relevante — este é o arquivo que impede o Chief de recomendar algo que já foi tentado e falhou.

---

## Experimentos e Resultados

### Exp-001: Aumentar limite diário do Dante de 400 → 600
- **Data**: ~Julho 2024
- **Hipótese**: Mais envios = mais respostas = mais reuniões
- **Resultado**: Aumentou respostas, mas Meta começou a limitar qualidade (spam score subiu)
- **Aprendizado**: 400/dia é o sweet spot. Volume não resolve qualidade de template.

### Exp-002: Templates genéricos vs. personalizados por segmento
- **Data**: ~Agosto 2024
- **Hipótese**: Segmentar templates por tipo de empresa (construtora vs. engenharia) aumenta taxa de resposta
- **Resultado**: Templates segmentados tiveram 2.1% de resposta vs. 1.3% dos genéricos
- **Aprendizado**: Segmentação funciona. Manter 3-4 templates por segmento.

### Exp-003: Adicionar vídeo/áudio no primeiro contato
- **Data**: ~Setembro 2024
- **Hipótese**: Áudio pessoal do Raul gera mais confiança que texto
- **Resultado**: Taxa de resposta caiu (áudio não toca em notificação). Bloqueios aumentaram.
- **Aprendizado**: Primeiro contato = texto curto. Áudio só após resposta.

### Exp-004: Email frio vs. WhatsApp frio
- **Data**: ~Outubro 2024
- **Hipótese**: Diversificar canais aumenta alcance
- **Resultado**: Email abriu 12%, respondeu 2%. WhatsApp respondeu 3.5%. Custo similar.
- **Aprendizado**: WhatsApp é melhor pra construção civil. Email é complemento, não substituto.

### Exp-005: Bot de follow-up automático 3 dias após primeiro envio
- **Data**: ~Novembro 2024
- **Hipótese**: Follow-up automático reengaja leads que não responderam
- **Resultado**: +15% de respostas totais. Mas alguns leads reclamaram de spam.
- **Aprendizado**: Fazer 1 follow-up só. Com intervalo de 5+ dias.

### Exp-006: Instagram Outreach (multi-toque: follow → like → DM)
- **Data**: ~Dezembro 2024
- **Hipótese**: Instagram é canal relevante pra construtoras
- **Resultado**: Poucas respostas. Perfis de construtora são institucionais, não postam muito.
- **Aprendizado**: Instagram é canal secundário. Manter com baixo volume (15/dia).

### Exp-007: LinkedIn Outreach
- **Data**: ~Janeiro 2025
- **Hipótese**: Donos de construtora estão no LinkedIn
- **Resultado**: 15 convites/dia. Aceitação baixa (~20%). Melhor que Instagram.
- **Aprendizado**: LinkedIn funciona, mas volume é baixo. Bom para alvos específicos de alto valor.

---

## Decisões Estruturais

### D-001: Usar PostgreSQL em vez de SQLite
- **Data**: ~Março 2025
- **Motivo**: Escala, performance, múltiplas conexões simultâneas
- **Resultado**: Ok. Mais complexo de manter, mas necessário.

### D-002: Criar agentes autônomos em vez de scripts manuais
- **Data**: ~Maio 2025
- **Motivo**: Automatizar operação, reduzir dependência do Raul
- **Resultado**: Funcionou bem. Agentes rodam 24/7. ChiefAgent, Dante, Clarice são os de maior impacto.

### D-003: Mover prospecção do n8n para código próprio (MetaDispatcher)
- **Data**: ~Janeiro 2025
- **Motivo**: n8n instável, difícil de debugar, limites da versão gratuita
- **Resultado**: Muito mais estável. Código próprio dá controle total.

### D-004: Blog como canal de aquisição orgânica
- **Data**: ~Março 2025
- **Motivo**: SEO de longo prazo, autoridade, conteúdo pra nutrir leads
- **Resultado**: 1 artigo/semana. Tráfego ainda baixo (<100 visitas/mês) mas crescendo.

---

## Estratégias Abandonadas

| Estratégia | Por que parou |
|-----------|---------------|
| Grupo de WhatsApp de leads | Muito trabalho manual, baixa conversão |
| Anúncios Meta direto (sem LP) | Custo por lead muito alto, leads frios |
| Templates muito longos (>300 chars) | Ignorados. Templates curtos (100-150) performam melhor |
| Prospecção sábado/domingo | Respostas quase zero. Seg-Sex é o padrão. |
| Oferecer serviço gratuito (teste 30 dias) | Atrai cliente errado. Quem não paga não valoriza. |
