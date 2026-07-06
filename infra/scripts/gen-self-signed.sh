#!/usr/bin/env bash
# Bootstrap TLS with a self-signed certificate so nginx can start before a
# real domain/Let's Encrypt is available. Writes into the `certs` volume.
# Usage: ./infra/scripts/gen-self-signed.sh [domain]
set -euo pipefail
DOMAIN="${1:-localhost}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

$COMPOSE run --rm --no-deps --entrypoint /bin/sh -v turkish-rag-prod_certs:/certs nginx -c "
  apk add --no-cache openssl >/dev/null 2>&1 || true
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout /certs/privkey.pem -out /certs/fullchain.pem \
    -subj '/CN=${DOMAIN}'
  echo 'Self-signed cert written for ${DOMAIN}'
"
