#!/usr/bin/env bash
# Installe la mise à jour automatique (systemd) dans le conteneur Proxmox.
# Usage : sudo ./deploy/proxmox/install.sh [branche]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BRANCH="${1:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"
INTERVAL="${INTERVAL:-2min}"

chmod +x "$APP_DIR/deploy/proxmox/update.sh"

# La clé bancaire est montée dans l'API, qui tourne sous l'utilisateur node (uid 1000) :
# elle doit lui appartenir, en lecture seule, et rester illisible pour les autres.
if [ -d "$APP_DIR/secrets" ]; then
  chown -R 1000:1000 "$APP_DIR/secrets"
  chmod 700 "$APP_DIR/secrets"
  find "$APP_DIR/secrets" -type f -exec chmod 400 {} +
fi

# curl et jq servent à vérifier le résultat de la CI GitHub avant chaque déploiement
if ! command -v jq >/dev/null || ! command -v curl >/dev/null; then
  apt-get update -qq && apt-get install -y -qq jq curl
fi

cat > /etc/systemd/system/messous-update.service <<UNIT
[Unit]
Description=MesSous — pull Git et redéploiement si nouveaux commits
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
Environment=APP_DIR=$APP_DIR
Environment=BRANCH=$BRANCH
ExecStart=$APP_DIR/deploy/proxmox/update.sh
UNIT

cat > /etc/systemd/system/messous-update.timer <<UNIT
[Unit]
Description=MesSous — vérification des mises à jour toutes les $INTERVAL

[Timer]
OnBootSec=1min
OnUnitActiveSec=$INTERVAL
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now messous-update.timer
echo "✅ Mise à jour automatique active (branche $BRANCH, toutes les $INTERVAL)."
echo "   Logs : journalctl -u messous-update -f"
echo "   Forcer un redéploiement : $APP_DIR/deploy/proxmox/update.sh --force"
