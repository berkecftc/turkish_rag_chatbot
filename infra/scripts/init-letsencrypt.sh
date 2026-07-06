#!/usr/bin/env bash
# One-time Let's Encrypt issuance. Requires:
#   - DNS A record for $DOMAIN pointing at this server
#   - nginx running (serves the ACME webroot on port 80)
# After success, certs land in the shared volume and nginx picks them up on
# reload. The `certbot` compose profile then handles auto-renewal (12h loop).
#
# Usage: DOMAIN=example.com EMAIL=you@example.com ./infra/scripts/init-letsencrypt.sh
set -euo pipefail
: "${DOMAIN:?Set DOMAIN=your.domain}"
: "${EMAIL:?Set EMAIL=you@example.com}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

echo ">> Requesting certificate for ${DOMAIN}"
$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" \
  --agree-tos --no-eff-email --non-interactive

echo ">> Linking live certs into nginx cert paths"
$COMPOSE run --rm --no-deps --entrypoint /bin/sh \
  -v turkish-rag-prod_certs:/etc/letsencrypt nginx -c "
  ln -sf /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /etc/letsencrypt/fullchain.pem
  ln -sf /etc/letsencrypt/live/${DOMAIN}/privkey.pem  /etc/letsencrypt/privkey.pem
"

echo ">> Reloading nginx"
$COMPOSE exec nginx nginx -s reload
echo ">> Done. Enable auto-renewal with: $COMPOSE --profile certbot up -d certbot"
