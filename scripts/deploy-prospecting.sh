#!/bin/bash
# Configura prospecção ativa no servidor vigasales.shop
# Execute no VPS: bash deploy-prospecting.sh

set -e

APP_DIR="/root/viga-sales"   # ajuste se necessário
ENV_FILE="$APP_DIR/.env"

echo "=== Viga Sales — Setup Prospecção Ativa ==="

# 1. Garantir GEMINI_API_KEY no .env
if ! grep -q "GEMINI_API_KEY=" "$ENV_FILE" 2>/dev/null || grep -q "GEMINI_API_KEY=$" "$ENV_FILE" 2>/dev/null; then
  echo ""
  read -p "Cole sua GEMINI_API_KEY (https://aistudio.google.com/app/apikey): " GEMINI_KEY
  if [ -n "$GEMINI_KEY" ]; then
    if grep -q "GEMINI_API_KEY=" "$ENV_FILE"; then
      sed -i "s|GEMINI_API_KEY=.*|GEMINI_API_KEY=$GEMINI_KEY|" "$ENV_FILE"
    else
      echo "GEMINI_API_KEY=$GEMINI_KEY" >> "$ENV_FILE"
    fi
    echo "✅ GEMINI_API_KEY salva no .env"
  fi
else
  echo "✅ GEMINI_API_KEY já configurada"
fi

# 2. Garantir SENDER_NAME no .env
if ! grep -q "SENDER_NAME=" "$ENV_FILE" 2>/dev/null; then
  echo "SENDER_NAME=Raul" >> "$ENV_FILE"
  echo "✅ SENDER_NAME=Raul adicionado ao .env"
fi

# 3. Reiniciar o container da aplicação
echo ""
echo "Reiniciando container viga-sales..."
cd "$APP_DIR"
docker compose restart app 2>/dev/null || docker-compose restart app 2>/dev/null || true

echo ""
echo "Aguardando app subir (10s)..."
sleep 10

# 4. Criar campanha padrão via API
echo "Criando campanha padrão..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://vigasales.shop/api/prospects/default-campaign")
if [ "$RESPONSE" = "200" ]; then
  CAMPAIGN=$(curl -s "https://vigasales.shop/api/prospects/default-campaign")
  CAMPAIGN_ID=$(echo "$CAMPAIGN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "✅ Campanha pronta: $CAMPAIGN_ID"
else
  echo "⚠️  API retornou HTTP $RESPONSE — verifique se o container subiu"
fi

echo ""
echo "=========================================="
echo "PRÓXIMO PASSO — Configure o n8n:"
echo ""
echo "No node 'Configurações' do flow2, coloque:"
echo "  evolution_url:      https://evolution.vigasales.shop"
echo "  evolution_instance: Raul"
echo "  evolution_key:      <sua chave da Evolution API>"
echo ""
echo "Depois ative o flow2 (toggle no canto superior direito)."
echo "=========================================="
