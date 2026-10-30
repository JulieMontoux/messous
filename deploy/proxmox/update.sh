#!/usr/bin/env bash
# MesSous — mise à jour automatique sur le conteneur Proxmox.
# Vérifie s'il y a de nouveaux commits sur la branche suivie ; si oui : pull + rebuild + redémarrage.
# Lancé toutes les 2 minutes par messous-update.timer (voir install.sh).
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"
FORCE="${1:-}"

exec 9>/tmp/messous-update.lock
flock -n 9 || { echo "Mise à jour déjà en cours"; exit 0; }

cd "$APP_DIR"
git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" != "--force" ]; then
  exit 0
fi

echo "[$(date '+%F %T')] Mise à jour ${LOCAL:0:7} → ${REMOTE:0:7} ($BRANCH)"
git pull --ff-only --quiet origin "$BRANCH"

export APP_VERSION
APP_VERSION="$(git rev-parse --short HEAD)-$(date +%s)"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

# Vérifie que l'API répond après redémarrage
for _ in $(seq 1 30); do
  if docker compose exec -T api node -e "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "[$(date '+%F %T')] OK — version $APP_VERSION en ligne"
    exit 0
  fi
  sleep 2
done
echo "[$(date '+%F %T')] ⚠️ L'API ne répond pas après la mise à jour — voir : docker compose logs api" >&2
exit 1
