# TODO

## À faire plus tard (Julie)
- [ ] Fusionner la PR #4 (https://github.com/JulieMontoux/messous/pull/4) dans `main`
- [ ] Sur le conteneur Proxmox, après la fusion :
  - `cd ~/messous && ./deploy/proxmox/update.sh --force`
  - vérifier `curl -s http://localhost/api/health` → `{"ok":true}`
  - vérifier la première sauvegarde : `ls -lh ~/messous/backups/`
- [ ] Activer la sauvegarde Proxmox du conteneur (copie hors du serveur)
- [ ] Vérifier que `JWT_SECRET` dans `.env` fait au moins 32 caractères (sinon : `openssl rand -hex 32`,
      puis se reconnecter dans l'app)
- [ ] Sur le téléphone : ouvrir l'app → « Ajouter à l'écran d'accueil », puis Profil →
      « Notifications sur cet appareil »
- [ ] Vérifier que le modèle Ollama est bien téléchargé (`docker compose logs ollama-init`)
      pour les suggestions IA de classement
- [ ] Connecteur bancaire : résoudre « Erreur réseau » sur « Connecter ma banque »
      (logs API + test d'accès à api.enablebanking.com depuis le conteneur)
