# 🚀 Viga Sales — WhatsApp CRM com Evolution API

CRM completo com integração ao WhatsApp via [Evolution API](https://github.com/EvolutionAPI/evolution-api).

## 📦 Stack

| Camada     | Tecnologia                              |
|------------|-----------------------------------------|
| Backend    | Node.js + Express + Socket.IO           |
| Frontend   | React + Socket.IO Client                |
| Banco      | SQLite (better-sqlite3) — sem setup     |
| WhatsApp   | Evolution API v2                        |

---

## ⚡ Início Rápido

### 1. Clone e instale dependências

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure o ambiente

```bash
cd backend
cp .env.example .env
```

Edite o `.env`:

```env
EVOLUTION_API_URL=http://localhost:8080    # URL da sua Evolution API
EVOLUTION_API_KEY=sua_chave_aqui          # API Key da Evolution API
EVOLUTION_INSTANCE=minha_instancia        # Nome da instância criada
WEBHOOK_URL=https://seudominio.com/webhook # URL pública (use ngrok em dev)
PORT=3001
```

### 3. Configure a Evolution API

Se ainda não tem a Evolution API instalada:

```bash
# Via Docker (recomendado)
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=sua_chave \
  atendai/evolution-api:latest
```

Crie uma instância:
```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: sua_chave" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "minha_instancia", "qrcode": true}'
```

### 4. Inicie o backend

```bash
cd backend
npm run dev
```

### 5. Configure o Webhook (uma vez só)

```bash
curl -X POST http://localhost:3001/api/whatsapp/configure-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://seudominio.com/webhook"}'
```

> 💡 **Em desenvolvimento**: use [ngrok](https://ngrok.com) para expor o localhost:
> ```bash
> ngrok http 3001
> # Copie a URL https e use como WEBHOOK_URL
> ```

### 6. Conecte o WhatsApp

Acesse `http://localhost:3001/api/whatsapp/qrcode` e escaneie o QR Code com seu celular.

### 7. Inicie o frontend

```bash
cd frontend
npm start
# Abre em http://localhost:3000
```

---

## 🗂️ Estrutura do Projeto

```
crm-whatsapp/
├── backend/
│   ├── server.js              # Entry point + Socket.IO
│   ├── db/
│   │   └── database.js        # SQLite + schema
│   ├── routes/
│   │   ├── contacts.js        # CRUD de contatos
│   │   ├── conversations.js   # Chat + mensagens
│   │   └── broadcasts.js      # Disparos em massa
│   ├── services/
│   │   └── evolutionApi.js    # Cliente da Evolution API
│   └── webhook/
│       └── handler.js         # Processa eventos do WhatsApp
└── frontend/
    └── src/
        ├── App.jsx             # CRM completo (single-file)
        └── api.js              # Cliente HTTP da API
```

---

## 🔌 Endpoints da API

### Contatos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/contacts` | Listar (com busca, filtro por estágio/tag) |
| POST | `/api/contacts` | Criar |
| PUT | `/api/contacts/:id` | Atualizar |
| DELETE | `/api/contacts/:id` | Remover |
| PATCH | `/api/contacts/:id/stage` | Mover no pipeline |
| POST | `/api/contacts/:id/activities` | Adicionar atividade |

### Conversas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/conversations` | Listar conversas |
| GET | `/api/conversations/:id/messages` | Histórico |
| POST | `/api/conversations/:id/messages` | Enviar mensagem |

### Disparos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/broadcasts` | Listar |
| POST | `/api/broadcasts` | Criar |
| POST | `/api/broadcasts/:id/send` | Disparar |

### WhatsApp
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/whatsapp/status` | Status da conexão |
| GET | `/api/whatsapp/qrcode` | QR Code para conectar |
| POST | `/webhook` | Recebe eventos da Evolution API |

---

## 🎯 Funcionalidades

- **Dashboard** — métricas em tempo real, pipeline por estágio, contatos recentes
- **Contatos** — CRUD completo, tags, notas, histórico de atividades
- **Conversas WhatsApp** — chat em tempo real via Socket.IO, histórico completo
- **Pipeline Kanban** — drag & drop entre estágios, valor total por estágio
- **Disparos em Massa** — envio com delay automático (2–5s) para evitar ban, filtro por tags

---

## 🔧 Personalização

### Adicionar novos estágios do pipeline
```sql
INSERT INTO pipeline_stages (id, name, color, position) 
VALUES ('stage_upsell', 'Upsell', '#06b6d4', 7);
```

### Variáveis de ambiente opcionais
```env
DB_PATH=./db/crm.sqlite         # Caminho do banco
JWT_SECRET=segredo_forte         # Para autenticação futura
NODE_ENV=production
```

---

## 🚀 Deploy em Produção

```bash
# Build do frontend
cd frontend && npm run build

# Sirva os arquivos estáticos com o Express
# Adicione ao server.js:
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});
```

---

## 🛡️ Segurança

Em produção, adicione:
- Autenticação JWT nos endpoints
- Rate limiting (`express-rate-limit`)
- HTTPS obrigatório
- Validação do webhook secret da Evolution API

---

## 📝 Licença

MIT — use à vontade!
