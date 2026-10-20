#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Coaching Bot Backend — server deploy script (pull-based).
# The image is built in GitHub Actions and pushed to GHCR; this script
# only pulls + restarts. Migrations run from the container entrypoint.
# Invoke manually:   bash /opt/coaching-bot-backend/deploy.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="/opt/coaching-bot-backend"
HEALTH_URL="http://localhost:3006/health"
HEALTH_RETRIES=30
HEALTH_DELAY_SECONDS=2

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }

cd "$REPO_DIR" || fail "Repo directory $REPO_DIR not found."
[ -f .env ] || fail ".env is missing in $REPO_DIR — bootstrap it before deploying."

# proxy-network is external; create it once if an operator forgot.
if ! docker network inspect proxy-network >/dev/null 2>&1; then
  log "Creating missing external Docker network: proxy-network"
  docker network create proxy-network
fi

log "Syncing code from origin/main"
git fetch --prune origin
git reset --hard origin/main
ok "Repo updated to $(git rev-parse --short HEAD)"

log "Pulling image from GHCR"
docker compose pull app

log "Starting db + qdrant + app (entrypoint runs prisma migrate deploy)"
docker compose up -d

log "Waiting for app health check at $HEALTH_URL"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl --fail --silent --max-time 3 "$HEALTH_URL" >/dev/null; then
    ok "App is healthy"
    break
  fi
  if (( i == HEALTH_RETRIES )); then
    log "App failed health check — dumping recent logs"
    docker compose logs --tail=100 app || true
    fail "App did not respond at $HEALTH_URL after $((HEALTH_RETRIES * HEALTH_DELAY_SECONDS))s"
  fi
  sleep "$HEALTH_DELAY_SECONDS"
done

log "Pruning dangling Docker images"
docker image prune -f >/dev/null

ok "Deployment complete — $(git rev-parse --short HEAD) live at $HEALTH_URL"
