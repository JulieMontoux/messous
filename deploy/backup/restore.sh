#!/usr/bin/env bash
# Restaure une sauvegarde : ./deploy/backup/restore.sh backups/messous-2026-11-01_0300.dump
# ⚠️ Remplace TOUTES les données actuelles par celles de la sauvegarde.
set -euo pipefail

cd "$(dirname "$0")/../.."
FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage : $0 backups/messous-AAAA-MM-JJ_HHMM.dump"
  echo "Sauvegardes disponibles :"; ls -1t backups/*.dump 2>/dev/null | head -10
  exit 1
fi

read -r -p "Remplacer toutes les données actuelles par $(basename "$FILE") ? (oui/non) " ok
[ "$ok" = "oui" ] || { echo "Annulé."; exit 0; }

# Sauvegarde de sécurité de l'état actuel avant restauration
mkdir -p backups
docker compose exec -T db pg_dump -U messous -Fc messous > "backups/avant-restauration-$(date +%F_%H%M).dump"

docker compose stop api
docker compose exec -T db pg_restore -U messous -d messous --clean --if-exists --no-owner < "$FILE"
docker compose start api
echo "✅ Restauration terminée. Si le front affiche une erreur 502 : docker compose restart frontend"
