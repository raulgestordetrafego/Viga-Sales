FROM node:20-alpine

WORKDIR /app

# Instala dependências nativas necessárias para better-sqlite3
RUN apk add --no-cache python3 make g++

# Copia package.json da app
COPY apps/abcapital-crm/package*.json ./
RUN npm install

# Copia código-fonte da app
COPY apps/abcapital-crm/ ./

# Copia frontend SPA, logo e landing page
COPY public/abcapital/ ./public/abcapital/
COPY landing.html ./landing.html

EXPOSE 3001

CMD ["node", "server.js"]
