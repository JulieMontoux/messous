#!/usr/bin/env bash
# MesSous — mise à jour automatique sur le conteneur Proxmox.
# Vérifie s'il y a de nouveaux commits sur la branche suivie ; si oui : pull + rebuild + redémarrage.
# Lancé toutes les 2 minutes par messous-update.timer (voir install.sh).
set -euo pipefail

# Conteneurs LXC : locale souvent absente, et TMPDIR parfois défini (pam_tmpdir) vers un dossier
# inexistant, ce qui fait échouer `docker compose build` (« invalid output path »)
export LC_ALL=C.UTF-8
if [ -n "${TMPDIR:-}" ] && ! mkdir -p "$TMPDIR" 2>/dev/null; then
  export TMPDIR=/tmp
fi

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

# Ne déploie que si la CI GitHub a validé ce commit (« ✔ Pipeline OK »), sauf REQUIRE_CI=0 ou --force
if [ "${REQUIRE_CI:-1}" = "1" ] && [ "$FORCE" != "--force" ] && ! command -v jq >/dev/null; then
  echo "⚠️  jq manquant : impossible de vérifier la CI (installe-le : apt install jq). Déploiement bloqué." >&2
  exit 1
fi
if [ "${REQUIRE_CI:-1}" = "1" ] && [ "$FORCE" != "--force" ]; then
  REPO=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
  STATUS=$(curl -fsS -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/commits/$REMOTE/check-runs?check_name=$(printf '%s' '✔ Pipeline OK' | jq -sRr @uri)" \
    | jq -r '[.check_runs[] | .conclusion // .status] | first // "absent"' 2>/dev/null || echo "inconnu")
  case "$STATUS" in
    success) ;;
    queued|in_progress|absent|inconnu)
      echo "[$(date '+%F %T')] ${REMOTE:0:7} : CI pas encore terminée ($STATUS), nouvel essai au prochain passage"
      exit 0 ;;
    *)
      echo "[$(date '+%F %T')] ⛔ ${REMOTE:0:7} : la CI a échoué ($STATUS), déploiement refusé" >&2
      exit 0 ;;
  esac
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
