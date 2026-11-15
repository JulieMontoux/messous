#!/bin/sh
# Sauvegarde quotidienne de la base (service « backup » de docker-compose).
# Un fichier par jour dans ./backups, conservé BACKUP_KEEP_DAYS jours (30 par défaut).
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
HOUR="${BACKUP_HOUR:-3}"

backup() {
  file="/backups/messous-$(date +%F_%H%M).dump"
  if pg_dump -h db -U messous -Fc messous > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "[$(date '+%F %T')] Sauvegarde OK : $(basename "$file") ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "[$(date '+%F %T')] ⚠️ Échec de la sauvegarde" >&2
  fi
  find /backups -name 'messous-*.dump' -mtime +"$KEEP_DAYS" -delete
}

# Une sauvegarde au démarrage, puis chaque jour à BACKUP_HOUR heures
backup
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%F) $(printf %02d "$HOUR"):00" +%s 2>/dev/null || echo 0)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  [ "$next" -le "$now" ] && next=$((now + 86400))
  sleep $((next - now))
  backup
done
