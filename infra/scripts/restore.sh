#!/usr/bin/env bash
# Restore PostgreSQL (and optionally MinIO) from a backup produced by backup.sh.
#   ./infra/scripts/restore.sh backups/postgres/db_20260701_030000.dump [backups/minio/objects_X.tar.gz]
#
# DESTRUCTIVE: drops and recreates the application database. The stack keeps
# running but the API will error during the restore window (~seconds-minutes).
set -euo pipefail
cd "$(dirname "$0")/../.."

DUMP="${1:?Usage: restore.sh <db.dump> [objects.tar.gz]}"
OBJECTS="${2:-}"
ENV_FILE=".env.prod"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|STORAGE_BUCKET)=' "$ENV_FILE")

read -r -p "!! This will DROP database '$POSTGRES_DB' and restore from $DUMP. Type 'restore' to continue: " CONFIRM
[ "$CONFIRM" = "restore" ] || { echo "Aborted."; exit 1; }

echo ">> Stopping api/worker (release connections)"
$COMPOSE stop api worker

echo ">> Recreating database"
$COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
$COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"

echo ">> Restoring dump"
$COMPOSE exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < "$DUMP"

if [ -n "$OBJECTS" ]; then
  echo ">> Restoring MinIO objects"
  TMP=$(mktemp -d)
  tar -xzf "$OBJECTS" -C "$TMP"
  docker cp "$TMP/$(ls "$TMP")" "$($COMPOSE ps -q minio)":/data/.restore-staging
  $COMPOSE exec -T minio sh -c "
    mc alias set local http://localhost:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' >/dev/null &&
    mc mirror --overwrite /data/.restore-staging local/${STORAGE_BUCKET:-documents} &&
    rm -rf /data/.restore-staging
  "
  rm -rf "$TMP"
fi

echo ">> Restarting services"
$COMPOSE up -d api worker

echo ">> Restore complete. Verify: docker compose -f docker-compose.prod.yml logs -f api"
