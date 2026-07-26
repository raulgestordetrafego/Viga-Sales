#!/bin/bash
# Backup automático do banco SQLite do CRM AB Capital
# Cron sugerido: 0 3 * * * /opt/abcapital/crm/scripts/backup.sh

CONTAINER="crm-viga-sales-1"
BACKUP_DIR="/opt/abcapital/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
FILE="$BACKUP_DIR/crm_$DATE.sqlite"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

# Copia o banco de dentro do container (SQLite WAL checkpoint antes de copiar)
docker exec "$CONTAINER" sqlite3 /app/db/crm.sqlite ".backup '/tmp/crm_backup.sqlite'" 2>/dev/null || \
docker cp "$CONTAINER":/app/db/crm.sqlite "$FILE.tmp" && mv "$FILE.tmp" "$FILE"

# Se o primeiro método funcionou, copia o arquivo
if [ ! -f "$FILE" ]; then
  docker cp "$CONTAINER":/tmp/crm_backup.sqlite "$FILE"
fi

if [ -f "$FILE" ]; then
  SIZE=$(du -h "$FILE" | cut -f1)
  echo "[$(date)] Backup OK: $FILE ($SIZE)"
else
  echo "[$(date)] ERRO: backup falhou"
  exit 1
fi

# Remove backups antigos
find "$BACKUP_DIR" -name "crm_*.sqlite" -mtime +$KEEP_DAYS -delete
echo "[$(date)] Backups mantidos: $(ls $BACKUP_DIR/crm_*.sqlite 2>/dev/null | wc -l)"
