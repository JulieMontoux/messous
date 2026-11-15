# TODO — à faire (Julie)

La PR #4 est fusionnée dans `main`. Les étapes ci-dessous sont dans l'ordre conseillé.

## 1. Déployer sur le conteneur Proxmox
- [ ] Mettre à jour l'installation (installe `jq`, nécessaire au contrôle de la CI avant déploiement) :
      `cd ~/messous && git pull && sudo ./deploy/proxmox/install.sh main`
- [ ] Déployer : `./deploy/proxmox/update.sh --force`
      (ensuite, la mise à jour automatique ne déploie que les commits dont « ✔ Pipeline OK » est vert)
- [ ] Vérifier : `curl -s http://localhost/api/health` → `{"ok":true}`
- [ ] Vérifier la première sauvegarde : `ls -lh ~/messous/backups/`
- [ ] Vérifier que `JWT_SECRET` dans `.env` fait au moins 32 caractères (sinon : `openssl rand -hex 32`,
      relancer `update.sh --force`, puis se reconnecter dans l'app)
- [ ] Activer la sauvegarde Proxmox du conteneur (copie hors du serveur)

## 2. Pipeline GitHub
- [ ] SonarCloud : importer le dépôt (https://sonarcloud.io, organisation `juliemontoux`), désactiver
      « Automatic Analysis », créer le jeton et l'ajouter en secret GitHub `SONAR_TOKEN`
      (Settings → Secrets and variables → Actions). Sans ce secret, l'étape Sonar est ignorée.
- [ ] GitHub → Settings → Branches : protéger `main` avec la vérification obligatoire « ✔ Pipeline OK »
- [ ] Traiter les PR Dependabot au fil de l'eau (fusionner celles dont le pipeline est vert)

## 3. Téléphone
- [ ] Ouvrir l'app → « Ajouter à l'écran d'accueil », puis Profil → « Notifications sur cet appareil »

## 4. Fonctionnalités à vérifier
- [ ] Ollama : vérifier que le modèle est téléchargé (`docker compose logs ollama-init`)
      pour les suggestions IA de classement
- [ ] Connecteur bancaire : résoudre « Erreur réseau » sur « Connecter ma banque »
      (`docker compose logs api` + test d'accès à api.enablebanking.com depuis le conteneur)
