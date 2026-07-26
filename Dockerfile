FROM node:20-alpine

WORKDIR /app

# Chromium + deps para Playwright (LinkedIn outreach) + Python para TrafficAgent brain
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ttf-freefont \
  udev \
  ca-certificates \
  python3 \
  py3-pip

# Instala dependências Python para o cérebro de tráfego
RUN pip3 install --break-system-packages pdfplumber youtube-transcript-api

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/db && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
