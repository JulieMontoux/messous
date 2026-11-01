# MesSous

Budget personnel par enveloppes : charges fixes, enveloppes (besoins / envies / épargne), retraits d'espèces,
paiements carte, objectifs d'épargne et historique.

- **Front** : React + Vite + Tailwind (`src/`)
- **API** : Node/Express + PostgreSQL (`api/`)
- **Déploiement** : Docker Compose (Postgres, API, Ollama pour les astuces IA, Nginx)

## Fonctionnalités

| Fonction | Où |
|---|---|
| **Retraits d'espèces** : montant conseillé, enregistrement de la date et du montant réellement retiré, écart avec le conseillé. La semaine budgétaire démarre le jour du dernier retrait (cycles de 7 jours) au lieu du lundi. Les espèces encore en poche sont déduites du prochain retrait. | Enveloppes → *Retrait* |
| **Banque** : connexion DSP2 (Enable Banking) ou import CSV (depuis le 1er du mois dernier), paiements carte en temps réel, classement unitaire ou en masse dans les enveloppes ou les charges fixes, règles « toujours pour ce marchand », synchro auto toutes les 6 h | Banque |
| **Retraits DAB détectés** sur le relevé et enregistrés comme retraits d'espèces (un retrait déjà saisi à la main, même montant à 3 jours près, est simplement rattaché) | Banque, Enveloppes |
| **Dépenses en temps réel** : espèces + carte classée + carte à classer, avec une prévision de fin de mois qui reste indicative tant que le mois n'est pas terminé (seul un dépassement réel s'affiche en rouge) | Tableau de bord, Enveloppes |
| **Clôture du mois** : épargne réellement versée + reste réel, qu'on peut verser sur un objectif ; l'historique compare le prévu au réel | Historique |
| **E-mail du dernier jour du mois** (à 18 h) pour enregistrer l'épargne réelle | automatique |
| **Profil tabac** : roulé / tubé / industriel, prix unitaire et consommation modifiables, ajustement de l'enveloppe tabac | Profil, Astuces |
| **Alertes e-mail** : enveloppe au seuil (70/80/90 %) puis dépassée ; tabac : plus de quoi acheter un paquet | Profil → Alertes & e-mails |
| **Clôture du mois** : report des restes d'enveloppes sur le mois suivant (s'ajoute au budget de l'enveloppe) | Historique |
| **Salaire à date d'effet** (immédiat ou à partir d'un mois futur) et détection du virement de salaire sur le relevé | Profil, Tableau de bord |
| **Budget idéal réglable** (50/30/20 par défaut) et arrondi des retraits à la dizaine (option) | Profil |
| **Charges fixes** mensuelles, trimestrielles ou annuelles, avec mois de fin prévu (crédit, engagement) | Charges fixes |
| **E-mail avant l'expiration** de la connexion bancaire (7 jours avant les 180 jours DSP2) | automatique |
| **App installable** sur téléphone / ordinateur (« Ajouter à l'écran d'accueil ») | navigateur |
| **Fin de mois prévue** : solde − prélèvements à venir − enveloppes et épargne restantes, calendrier des prélèvements | Tableau de bord |
| **Bilan mensuel** le 1er du mois (e-mail + notification) : dépenses par enveloppe, dépassements, épargne, comparaison | automatique |
| **Suggestions de classement** : marchands connus puis IA locale (Ollama) pour les inconnus | Banque |
| **Tendances sur 12 mois** et plus fortes variations par enveloppe | Historique |
| **Objectifs** : versement mensuel prévu, date atteinte, alerte de retard, comparaison avec l'épargne du budget | Objectifs |
| **Avances** : dépenses payées pour les autres, hors enveloppes, jusqu'au remboursement | Avances, Banque |
| **Tabac** : paquets achetés ce mois, mode « j'arrête » (jours et euros économisés) | Tableau de bord, Profil |
| **Notifications push** sur le téléphone (mêmes alertes que les e-mails) | Profil |
| **Mode sombre** (auto / clair / sombre) et **export CSV** (dépenses, banque, historique…) | Profil |
| **Rechargement automatique** : le serveur se met à jour tout seul à chaque push, et l'app ouverte dans le navigateur se recharge sur la nouvelle version | voir plus bas |

## Sécurité

- Connexion : 10 échecs max par compte (30 par IP) sur 15 min, 5 inscriptions par heure et par IP.
- CORS désactivé par défaut (le front et l'API partagent le domaine) ; `CORS_ORIGIN` pour l'ouvrir.
- `JWT_SECRET` : 32 caractères minimum (`openssl rand -hex 32`), un avertissement s'affiche sinon.
- En-têtes de sécurité ajoutés par nginx.

## Développement

```bash
npm install && (cd api && npm install)
cp api/.env.example api/.env   # DATABASE_URL, JWT_SECRET…
(cd api && npm run dev)        # API sur :3001
npm run dev                    # front sur :5173 (proxy /api → :3001)
npm test                       # tests des calculs (vitest)
(cd api && DATABASE_URL=postgres://… npm test)   # tests de l'API sur une vraie base PostgreSQL
```

## Pipeline (`.github/workflows/ci.yml`)

Chaque étape ne démarre que si la précédente a réussi :

| Étape | Contrôles | Bloque si… |
|---|---|---|
| 1 · Qualité | lint (front, API, e2e), build, Gitleaks | erreur de lint, build cassé, secret dans le code |
| 2 · Tests | vitest (front) et node:test (API sur PostgreSQL) | test en échec, couverture < 80 % sur un fichier (lignes, fonctions, branches) |
| 3 · Sécurité | npm audit, Trivy (lockfiles, Dockerfiles, secrets), CodeQL, SonarCloud | CVE haute/critique corrigeable, faille CodeQL de niveau « erreur », quality gate Sonar rouge |
| 4 · Images | build Docker + Trivy | CVE haute/critique corrigeable dans une image |
| 5 · Bout en bout | Playwright sur le build de production | parcours en échec |
| ✔ Pipeline OK | synthèse | une étape a échoué ou n'a pas tourné |

Le serveur Proxmox ne déploie un commit que si « ✔ Pipeline OK » est vert (`REQUIRE_CI=0` pour désactiver,
`update.sh --force` pour forcer). Dependabot propose chaque semaine les mises à jour de sécurité.

**SonarCloud** : importer le dépôt sur https://sonarcloud.io (organisation `juliemontoux`), désactiver
l'« Automatic Analysis », puis ajouter le jeton dans GitHub → Settings → Secrets → Actions → `SONAR_TOKEN`.
Sans jeton, l'étape Sonar est sautée avec un avertissement.

**Bloquer la fusion** : GitHub → Settings → Branches → règle sur `main` → « Require status checks » →
cocher **✔ Pipeline OK**.

Couverture en local : `npm run test:coverage` et `(cd api && npm run test:coverage)`.

## Déploiement (conteneur Proxmox)

```bash
git clone <repo> /opt/messous && cd /opt/messous
cp .env.example .env           # remplir DB_PASSWORD, JWT_SECRET, APP_URL, SMTP_*…
docker compose up -d --build
```

### Mise à jour automatique

```bash
sudo ./deploy/proxmox/install.sh            # suit la branche actuelle
sudo ./deploy/proxmox/install.sh main       # ou une branche précise
```

Un timer systemd lance `deploy/proxmox/update.sh` toutes les 2 minutes : s'il y a de nouveaux commits,
il fait `git pull`, reconstruit les images (`docker compose up -d --build`) et vérifie que l'API répond.
Le front embarque un identifiant de version ; les onglets ouverts détectent le nouveau `version.json` et se rechargent
(automatiquement en arrière-plan, ou via le bandeau « Nouvelle version disponible »).

- Logs : `journalctl -u messous-update -f`
- Redéploiement forcé : `./deploy/proxmox/update.sh --force`
- Intervalle : `INTERVAL=5min sudo ./deploy/proxmox/install.sh`

Pour un conteneur LXC, Docker nécessite les options `nesting=1` (et `keyctl=1` en non privilégié).

### Sauvegardes

Le service `backup` (lancé avec `docker compose up -d`) sauvegarde la base **chaque jour à 3 h** et au démarrage,
dans `./backups/messous-AAAA-MM-JJ_HHMM.dump`. Les fichiers de plus de 30 jours sont supprimés
(`BACKUP_HOUR` et `BACKUP_KEEP_DAYS` dans `.env`).

- Vérifier : `ls -lh backups/` et `docker compose logs backup`
- Restaurer : `./deploy/backup/restore.sh backups/messous-2026-11-01_0300.dump`
  (demande confirmation et sauvegarde d'abord l'état actuel dans `backups/avant-restauration-…`)
- Pour une copie hors du serveur, active aussi la sauvegarde Proxmox du conteneur (Datacenter → Sauvegarde).

### E-mails

Renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` et `APP_URL` dans `.env`
(Gmail : mot de passe d'application, port 587). Le bouton *Test* du profil envoie un e-mail de vérification.
Chaque alerte n'est envoyée qu'une fois par enveloppe, par mois et par seuil.

### Réseau

Le conteneur du front écoute sur le port 8080 (nginx sans droits root) ; `PORT` dans `.env` reste le port public.

### Notifications push

Aucune configuration : les clés VAPID sont générées au premier usage et gardées en base
(ou fournies via `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). L'app doit être servie en **HTTPS**.
Sur iPhone (iOS 16.4+), il faut d'abord installer l'app sur l'écran d'accueil.

### Connecteur bancaire (optionnel)

Sans configuration, la page Banque fonctionne par **import CSV** (export depuis l'espace client : colonnes
Date, Libellé, Montant ou Débit/Crédit, séparateur `;` ou `,`).

Pour la synchronisation automatique via [Enable Banking](https://enablebanking.com) (agrégateur DSP2) :

1. Créer une application sur le Control Panel Enable Banking (le mode « restricted production » suffit pour lier ses propres comptes).
2. Déclarer l'URL de redirection : `https://<ton-domaine>/api/bank/callback`.
3. Déposer la clé privée générée dans `secrets/enablebanking.pem` et mettre l'identifiant dans `ENABLE_BANKING_APP_ID`.
4. `docker compose up -d` puis Banque → *Connecter*.

Le consentement bancaire dure 180 jours. La synchro est faite toutes les `BANK_SYNC_INTERVAL_HOURS` heures (6 par défaut :
la DSP2 limite à 4 accès automatiques par jour).
