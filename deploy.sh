#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Coaching Bot Backend — server deploy script
# Install at /opt/coaching-bot-backend/deploy.sh and chmod +x.
# Invoke manually:   bash /opt/coaching-bot-backend/deploy.sh
# Force rebuild:     bash /opt/coaching-bot-backend/deploy.sh --no-cache
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="/opt/coaching-bot-backend"
APP_CONTAINER="coaching-bot-backend-app"
DB_CONTAINER="coaching-bot-backend-db"
HEALTH_URL="http://localhost:3006/health"
HEALTH_RETRIES=30
HEALTH_DELAY_SECONDS=2

BUILD_FLAGS=""
if [[ "${1:-}" == "--no-cache" ]]; then
  BUILD_FLAGS="--no-cache"
fi

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

log "Pulling latest code from origin/main"
git fetch --prune origin
git reset --hard origin/main
ok "Repo updated to $(git rev-parse --short HEAD)"

log "Building app image ${BUILD_FLAGS:-(cached)}"
# shellcheck disable=SC2086
docker compose build $BUILD_FLAGS app

log "Starting database + qdrant"
docker compose up -d db qdrant

log "Waiting for Postgres to be healthy"
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo 'starting')"
  if [[ "$status" == "healthy" ]]; then
    ok "Postgres is healthy"
    break
  fi
  if (( i == 30 )); then
    fail "Postgres did not become healthy within 60s (last status: $status)"
  fi
  sleep 2
done

log "Applying Prisma migrations (migrate deploy)"
docker compose run --rm app npx prisma migrate deploy

log "Starting app"
docker compose up -d app

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
