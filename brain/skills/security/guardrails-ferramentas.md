# guardrails-ferramentas

Antes de conectar qualquer ferramenta (email, calendario, CRM, banco) a um agente de IA:

1. **Liste tudo que o agente podera fazer** depois de conectado
   - Principalmente: enviar, deletar, compartilhar, editar, gastar dinheiro
2. **Defina regras rigidas** para o que PODE e NAO PODE:
   - Ex: "pode ler e rascunhar, NAO pode enviar nem deletar"
   - Ex: "sempre deixa em rascunho, nunca envia sozinho"
3. **Alerta de instrucao escondida**: a ferramenta pode carregar conteudo de terceiros (email, documento) que tente induzir o agente a agir sem seu Pedido
4. **Regra de ouro**: acoes destrutivas (enviar, deletar, gastar) sempre precisam de confirmacao humana explicita

Guarde os guardrails como regra permanente do agente.
