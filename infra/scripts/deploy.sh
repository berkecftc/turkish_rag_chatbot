#!/usr/bin/env bash
# Zero-downtime-ish deploy for the single-host compose stack.
#   ./infra/scripts/deploy.sh <version>     e.g. ./infra/scripts/deploy.sh 1.2.3
#
# Steps: pull tagged images -> run DB migrations -> rolling-restart services
#        -> health gate -> prune old images. Rollback = re-run with prior tag.
set -euo pipefail
cd "$(dirname "$0")/../.."

VERSION="${1:?Usage: deploy.sh <version>}"
ENV_FILE=".env.prod"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-ghcr.io/$(git config --get remote.origin.url | sed -E 's#.*[:/]([^/]+/[^/.]+)(\.git)?$#\1#')}"

export BACKEND_IMAGE="${REGISTRY_PREFIX}-backend:${VERSION}"
export FRONTEND_IMAGE="${REGISTRY_PREFIX}-frontend:${VERSION}"

echo ">> Deploying version ${VERSION}"
echo "   backend:  ${BACKEND_IMAGE}"
echo "   frontend: ${FRONTEND_IMAGE}"

# Persist chosen images so `docker compose` invocations outside this script
# (restarts, scaling) keep using the same version.
grep -q "^BACKEND_IMAGE=" "$ENV_FILE" \
  && sed -i "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${BACKEND_IMAGE}|" "$ENV_FILE" \
  || echo "BACKEND_IMAGE=${BACKEND_IMAGE}" >> "$ENV_FILE"
grep -q "^FRONTEND_IMAGE=" "$ENV_FILE" \
  && sed -i "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${FRONTEND_IMAGE}|" "$ENV_FILE" \
  || echo "FRONTEND_IMAGE=${FRONTEND_IMAGE}" >> "$ENV_FILE"

echo ">> Pulling images"
$COMPOSE pull api worker frontend

echo ">> Pre-deploy database backup"
./infra/scripts/backup.sh --quick || echo "WARN: backup failed — continuing (fix before next deploy!)"

echo ">> Running migrations"
$COMPOSE run --rm --no-deps api alembic upgrade head

echo ">> Rolling restart"
$COMPOSE up -d --no-deps worker
$COMPOSE up -d --no-deps api
$COMPOSE up -d --no-deps frontend nginx

echo ">> Health gate (api)"
for i in $(seq 1 30); do
  if $COMPOSE exec -T api curl -fsS http://localhost:8000/api/v1/health/live >/dev/null 2>&1; then
    echo "   api healthy."
    break
  fi
  [ "$i" -eq 30 ] && { echo "FATAL: api failed health check"; exit 1; }
  sleep 2
done

echo ">> Ensuring Ollama model is present"
$COMPOSE exec -T ollama ollama pull "$(grep '^OLLAMA_MODEL=' $ENV_FILE | cut -d= -f2)" || true

echo ">> Pruning dangling images"
docker image prune -f >/dev/null

echo ">> Deploy of ${VERSION} complete."
