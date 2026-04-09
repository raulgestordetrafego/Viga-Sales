# 🚀 Guia de Deploy — vigasales.com.br

## Passo 1 — Configurar DNS

No painel do seu registrador (onde comprou o vigasales.com.br):

| Tipo | Nome | Valor             | TTL  |
|------|------|-------------------|------|
| A    | @    | 187.77.235.195    | 3600 |
| A    | www  | 187.77.235.195    | 3600 |

> ⏱ O DNS pode levar de 5 min a 24h para propagar.
> Verifique em: https://whatsmydns.net/#A/vigasales.com.br

---

## Passo 2 — Conectar no VPS via SSH

```bash
ssh root@187.77.235.195
# (use sua senha ou chave .pem)
```

---

## Passo 3 — Enviar o landing.html para o servidor

**Opção A — via SCP (do seu Mac para o servidor):**
```bash
scp /caminho/para/landing.html root@187.77.235.195:/root/
scp /caminho/para/deploy.sh    root@187.77.235.195:/root/
```

**Opção B — via SFTP (FileZilla ou Cyberduck):**
- Host: 187.77.235.195
- Usuário: root
- Porta: 22
- Faça upload do `landing.html` e `deploy.sh` para `/root/`

---

## Passo 4 — Executar o script de deploy

```bash
# Já dentro do servidor:
cd /root
chmod +x deploy.sh
bash deploy.sh
```

O script irá automaticamente:
- ✅ Instalar/configurar nginx
- ✅ Criar `/var/www/vigasales/` e copiar o HTML
- ✅ Configurar nginx para o domínio
- ✅ Instalar SSL grátis (Let's Encrypt / Certbot)
- ✅ Configurar HTTPS e redirect automático

---

## Passo 5 — Testar

Acesse: https://vigasales.com.br

---

## Atualizar a landing page no futuro

```bash
# Do seu Mac:
scp landing.html root@187.77.235.195:/var/www/vigasales/landing.html
scp landing.html root@187.77.235.195:/var/www/vigasales/index.html

# Ou direto no servidor:
cp landing.html /var/www/vigasales/landing.html
```

---

## Troubleshooting

**Nginx não sobe:**
```bash
nginx -t              # Testa a config
journalctl -u nginx   # Ver logs de erro
```

**SSL falha:**
```bash
# Verificar se o DNS já propagou antes de rodar certbot
curl -I http://vigasales.com.br
```

**Porta 80/443 bloqueada:**
```bash
ufw allow 80
ufw allow 443
ufw allow 22
ufw enable
```

---

## Flow 4 — Relatório Diário de Prospecção por Email

**Arquivo:** `deploy/n8n-flows/flow4-relatorio-diario.json`

**O que faz:** Roda todo dia às 21h, busca os stats da API do Viga Sales e envia o relatório por email via Gmail.

### Como importar no n8n:

1. Acesse seu n8n (ex: `http://seu-vps:5678`)
2. Menu lateral → **Workflows** → botão **Import from file**
3. Selecione `flow4-relatorio-diario.json`
4. **Configure a credencial Gmail:**
   - No node "Enviar Email", clique em **Credential**
   - Escolha ou crie uma credencial **Gmail OAuth2**
   - Autorize com a conta raulfs.sc@gmail.com
5. Salve e **ative** o workflow (toggle no canto superior direito)

### Configurações editáveis no node "Config":
| Campo | Valor padrão |
|---|---|
| `viga_url` | https://vigasales.shop |
| `viga_token` | token de autenticação |
| `email_destino` | raulfs.sc@gmail.com |

O horário de disparo está no node "Todo dia às 21h" (cron: `0 21 * * *`).
