# Projetos Viga Sales — Instruções Codex

## Obsidian
- Vault: `/Users/raulysdyxyamferreirasantos/Documents/obsidian/obsidian/00 - Viga Sales`
- Projeto: `01 - Projetos Viga Sales`

## Ao iniciar uma sessão nesta pasta
1. Leia o estado atual: `/Users/raulysdyxyamferreirasantos/Documents/obsidian/obsidian/00 - Viga Sales/01 - Projetos Viga Sales/01 - Projetos Viga Sales.md`
2. Verifique tarefas abertas: `/Users/raulysdyxyamferreirasantos/Documents/obsidian/obsidian/00 - Viga Sales/01 - Projetos Viga Sales/02 - Tarefas/02 - Tarefas.md`

## Ao encerrar ou quando o usuário disser "feito", "próximo" ou "encerrar"
Execute automaticamente, sem precisar ser lembrado:

1. **Log de atividade** — adicione em `01 - Projetos Viga Sales.md`:
```
## Log YYYY-MM-DD
- [o que foi feito/decidido nesta sessão]
```

2. **Tarefas** — atualize `02 - Tarefas/02 - Tarefas.md`:
   - Marque concluídas com `[x]`
   - Adicione novas tarefas abertas com `[ ]`

3. **Arquivos** — liste arquivos novos/modificados nesta pasta em `02 - Produtos/02 - Produtos.md` ou `02 - Serviços/02 - Serviços.md` conforme o contexto

## Regra geral
Sempre que trabalhar aqui, o Obsidian deve refletir o estado real do projeto.

## Atalhos do usuário
Quando o usuário disser **"salve nos arquivos de memoria"**, **"salvar obsidian"**, **"salvar md"** ou variações similares, execute:
1. Atualizar `01 - Projetos Viga Sales.md` com o Log da data atual
2. Atualizar `02 - Tarefas/02 - Tarefas.md` (marcar concluídas, adicionar novas)
3. `git add -A && git commit -m "mensagem descritiva"` (commit local, sem push)

Quando o usuário disser **"deploy"**, **"subir pro VPS"**, **"atualizar VPS"** ou similar, execute:
1. Primeiro salve nos arquivos de memoria (acima)
2. SCP dos arquivos modificados para `root@187.77.235.195:/opt/viga-sales/`
3. `ssh root@187.77.235.195 "cd /opt/viga-sales && docker compose up -d --build viga-sales"`
4. Verificar se container subiu com `docker ps` e `docker logs`
