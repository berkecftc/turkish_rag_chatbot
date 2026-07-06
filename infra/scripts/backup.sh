#!/usr/bin/env bash
# Backs up PostgreSQL (pg_dump custom format) + MinIO documents bucket.
#   ./infra/scripts/backup.sh            full backup (db + objects)
#   ./infra/scripts/backup.sh --quick    db only (used pre-deploy)
#
# Retention: keeps last 7 daily and last 4 weekly (Sunday) backups.
# Schedule via cron on the host:
#   0 3 * * * cd /opt/turkish-rag && ./infra/scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=".env.prod"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/minio"

source <(grep -E '^(POSTGRES_USER|POSTGRES_DB|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|STORAGE_BUCKET)=' "$ENV_FILE")

echo ">> [$STAMP] PostgreSQL dump"
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$BACKUP_DIR/postgres/db_${STAMP}.dump"
echo "   $(du -h "$BACKUP_DIR/postgres/db_${STAMP}.dump" | cut -f1) written."

if [ "${1:-}" != "--quick" ]; then
  echo ">> MinIO bucket mirror (${STORAGE_BUCKET:-documents})"
  $COMPOSE exec -T minio sh -c "
    mc alias set local http://localhost:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' >/dev/null &&
    mc mirror --overwrite local/${STORAGE_BUCKET:-documents} /data/.backup-staging
  "
  docker cp "$($COMPOSE ps -q minio)":/data/.backup-staging "$BACKUP_DIR/minio/objects_${STAMP}"
  tar -czf "$BACKUP_DIR/minio/objects_${STAMP}.tar.gz" -C "$BACKUP_DIR/minio" "objects_${STAMP}"
  rm -rf "$BACKUP_DIR/minio/objects_${STAMP}"
  $COMPOSE exec -T minio rm -rf /data/.backup-staging
fi

echo ">> Retention: 7 daily + 4 weekly"
find "$BACKUP_DIR/postgres" -name "db_*.dump" -mtime +7 ! -newermt "last sunday -3 weeks" -delete 2>/dev/null || true
ls -1t "$BACKUP_DIR/postgres"/db_*.dump 2>/dev/null | tail -n +12 | xargs -r rm -f
ls -1t "$BACKUP_DIR/minio"/objects_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

echo ">> Backup complete. NOTE: copy backups/ OFF this host (rclone/rsync) for real DR."
