#!/usr/bin/env bash
# Ежедневный шифрованный бэкап Postgres → Yandex Object Storage
# Cron:  0 3 * * * /opt/aqsha-finance/infra/scripts/backup.sh
#
# Требуемые переменные (например, в /etc/aqsha-backup.env):
#   POSTGRES_USER, POSTGRES_DB
#   BACKUP_PASSPHRASE   — парольная фраза для gpg --symmetric
#   RCLONE_REMOTE       — например "yandex:aqsha-backups"
#   RETENTION_DAYS      — например 14

set -euo pipefail

[[ -f /etc/aqsha-backup.env ]] && source /etc/aqsha-backup.env

TS="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="/tmp/aqsha-${TS}.sql.gz.gpg"
COMPOSE_FILE="/opt/aqsha-finance/infra/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | \
  gzip -9 | \
  gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" \
      --symmetric --cipher-algo AES256 > "$TMP"

rclone copy "$TMP" "$RCLONE_REMOTE/" --quiet
rm -f "$TMP"

# Ротация: удалить файлы старше RETENTION_DAYS
rclone delete "$RCLONE_REMOTE/" --min-age "${RETENTION_DAYS:-14}d" --quiet

echo "Backup ${TS} uploaded to ${RCLONE_REMOTE}/"
