#!/bin/bash
##############################################################
#  Script de Deploy — Viga Sales Landing Page
#  Execute no servidor: bash deploy.sh
#  Autor: Viga Sales
##############################################################

set -e  # Para se qualquer comando falhar

echo ""
echo "🚀 Iniciando deploy da landing page Viga Sales..."
echo ""

# ---- Variáveis ----
DOMAIN="vigasales.com.br"
WWW_DIR="/var/www/vigasales"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
LANDING_FILE="landing.html"

# ---- 1. Verificar se nginx está instalado ----
echo "📦 Verificando nginx..."
if ! command -v nginx &> /dev/null; then
    echo "   Nginx não encontrado. Instalando..."
    apt-get update -qq && apt-get install -y nginx
    echo "   ✅ Nginx instalado!"
else
    echo "   ✅ Nginx já instalado ($(nginx -v 2>&1))"
fi

# ---- 2. Criar diretório do site ----
echo ""
echo "📁 Criando diretório $WWW_DIR..."
mkdir -p "$WWW_DIR"
echo "   ✅ Diretório pronto"

# ---- 3. Copiar landing page ----
echo ""
echo "📄 Copiando landing.html..."
if [ -f "$LANDING_FILE" ]; then
    cp "$LANDING_FILE" "$WWW_DIR/landing.html"
    cp "$LANDING_FILE" "$WWW_DIR/index.html"
    echo "   ✅ Arquivo copiado para $WWW_DIR"
else
    echo "   ❌ ERRO: landing.html não encontrado no diretório atual!"
    echo "   Execute este script no mesmo diretório onde está o landing.html"
    exit 1
fi

# ---- 4. Permissões ----
chown -R www-data:www-data "$WWW_DIR"
chmod -R 755 "$WWW_DIR"
echo "   ✅ Permissões ajustadas"

# ---- 5. Configurar nginx ----
echo ""
echo "⚙️  Configurando nginx para $DOMAIN..."

cat > "$NGINX_CONF" << 'NGINX_EOF'
server {
    listen 80;
    listen [::]:80;
    server_name vigasales.com.br www.vigasales.com.br;

    root /var/www/vigasales;
    index landing.html index.html;

    gzip on;
    gzip_types text/html text/css application/javascript;

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    location / {
        try_files $uri $uri/ /landing.html;
    }

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
}
NGINX_EOF

# Ativar site
ln -sf "$NGINX_CONF" "$NGINX_ENABLED"

# Remover default se existir
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    rm -f /etc/nginx/sites-enabled/default
fi

# Testar configuração
nginx -t
echo "   ✅ Config nginx OK"

# ---- 6. Restartar nginx ----
echo ""
echo "🔄 Reiniciando nginx..."
systemctl reload nginx
echo "   ✅ Nginx recarregado"

# ---- 7. Instalar SSL com Certbot ----
echo ""
echo "🔒 Verificando Certbot (SSL)..."
if command -v certbot &> /dev/null; then
    echo "   Certbot encontrado. Gerando certificado SSL..."
    certbot --nginx -d vigasales.com.br -d www.vigasales.com.br --non-interactive --agree-tos --email contato@vigasales.com.br --redirect
    echo "   ✅ SSL configurado com auto-renovação!"
else
    echo "   ⚠️  Certbot não encontrado. Instalando..."
    apt-get install -y certbot python3-certbot-nginx -qq
    certbot --nginx -d vigasales.com.br -d www.vigasales.com.br --non-interactive --agree-tos --email contato@vigasales.com.br --redirect
    echo "   ✅ SSL configurado!"
fi

# ---- 8. Firewall ----
echo ""
echo "🛡️  Configurando firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 'Nginx Full' --quiet
    echo "   ✅ Portas 80 e 443 liberadas"
fi

# ---- Resumo ----
echo ""
echo "=============================================="
echo "✅  DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=============================================="
echo ""
echo "🌐  Site online em: https://$DOMAIN"
echo "📂  Arquivos em:    $WWW_DIR"
echo "⚙️   Config nginx:   $NGINX_CONF"
echo ""
echo "💡  Para atualizar a landing page futuramente:"
echo "    cp landing.html $WWW_DIR/landing.html"
echo "    cp landing.html $WWW_DIR/index.html"
echo ""
