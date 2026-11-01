# TODO

## À faire plus tard (Julie)
- [ ] Fusionner la PR #4 (https://github.com/JulieMontoux/messous/pull/4) dans `main`
- [ ] Sur le conteneur Proxmox, après la fusion :
  - `cd ~/messous && ./deploy/proxmox/update.sh --force`
  - vérifier `curl -s http://localhost/api/health` → `{"ok":true}`
  - vérifier la première sauvegarde : `ls -lh ~/messous/backups/`
- [ ] Activer la sauvegarde Proxmox du conteneur (copie hors du serveur)
- [ ] Connecteur bancaire : résoudre « Erreur réseau » sur « Connecter ma banque »
      (logs API + test d'accès à api.enablebanking.com depuis le conteneur)
