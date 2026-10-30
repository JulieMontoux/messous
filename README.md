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
| **Banque** : connexion DSP2 (Enable Banking) ou import CSV, paiements carte en temps réel, classement dans les enveloppes, règles « toujours pour ce marchand », synchro auto toutes les 6 h | Banque |
| **Dépenses en temps réel** : espèces + carte classée + carte à classer, avec une prévision de fin de mois qui reste indicative tant que le mois n'est pas terminé (seul un dépassement réel s'affiche en rouge) | Tableau de bord, Enveloppes |
| **Clôture du mois** : épargne réellement versée + reste réel, qu'on peut verser sur un objectif ; l'historique compare le prévu au réel | Historique |
| **E-mail du dernier jour du mois** (à 18 h) pour enregistrer l'épargne réelle | automatique |
| **Profil tabac** : roulé / tubé / industriel, prix unitaire et consommation modifiables, ajustement de l'enveloppe tabac | Profil, Astuces |
| **Alertes e-mail** : enveloppe au seuil (70/80/90 %) puis dépassée ; tabac : plus de quoi acheter un paquet | Profil → Alertes & e-mails |
| **Rechargement automatique** : le serveur se met à jour tout seul à chaque push, et l'app ouverte dans le navigateur se recharge sur la nouvelle version | voir plus bas |

## Développement

```bash
npm install && (cd api && npm install)
cp api/.env.example api/.env   # DATABASE_URL, JWT_SECRET…
(cd api && npm run dev)        # API sur :3001
npm run dev                    # front sur :5173 (proxy /api → :3001)
npm test                       # tests des calculs (vitest)
```

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

### E-mails

Renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` et `APP_URL` dans `.env`
(Gmail : mot de passe d'application, port 587). Le bouton *Test* du profil envoie un e-mail de vérification.
Chaque alerte n'est envoyée qu'une fois par enveloppe, par mois et par seuil.

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
