# JusNat Pro — Guide de déploiement

## Structure du projet

```
jusnat-pro/
├── server.js          ← Serveur Node.js + Express (API REST)
├── schema.sql         ← Structure de la base PostgreSQL
├── setup-db.js        ← Script d'initialisation de la BD
├── package.json       ← Dépendances Node.js
├── .env.example       ← Variables d'environnement (à copier en .env)
└── public/
    └── index.html     ← L'application frontend (à mettre ici)
```

## Déploiement sur Railway (recommandé)

### Étape 1 — Créer un compte Railway
Allez sur https://railway.app et créez un compte gratuit.

### Étape 2 — Créer un projet
1. Cliquez "New Project"
2. Choisissez "Deploy from GitHub repo" (ou "Empty Project")
3. Ajoutez un service PostgreSQL : cliquez "+ New" → "Database" → "PostgreSQL"

### Étape 3 — Déployer le backend
1. Cliquez "+ New" → "GitHub Repo" et connectez votre dépôt
2. Railway détecte automatiquement Node.js
3. Dans les variables d'environnement, ajoutez :
   - DATABASE_URL : (copiez depuis votre service PostgreSQL Railway)
   - JWT_SECRET : (une longue chaîne aléatoire, ex: openssl rand -hex 32)
   - NODE_ENV : production

### Étape 4 — Initialiser la base de données
Dans le terminal Railway (ou en local avec DATABASE_URL) :
```bash
npm install
node setup-db.js
```

### Étape 5 — Mettre l'interface en ligne
Créez un dossier `public/` et placez `index.html` dedans.
Railway sert automatiquement les fichiers statiques depuis `public/`.

## Comptes par défaut (créés par setup-db.js)
- Admin    : admin@jusnat.ci    / admin123
- Vendeur  : vendeur@jusnat.ci  / vendeur123

⚠️ Changez ces mots de passe après la première connexion !

## Déploiement local (développement)

```bash
# 1. Installer les dépendances
npm install

# 2. Copier et configurer .env
cp .env.example .env
# Éditez .env avec votre DATABASE_URL locale

# 3. Initialiser la base
node setup-db.js

# 4. Démarrer le serveur
npm run dev

# L'app est accessible sur http://localhost:3000
```

## API Routes principales
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | /api/auth/login | Connexion | Public |
| GET | /api/produits | Liste des jus | Token |
| POST | /api/ventes | Enregistrer une vente | Token |
| GET | /api/ventes/dashboard | Chiffres du dashboard | Token |
| GET | /api/stock | État des stocks | Token |
| POST | /api/stock/:id/approvisionner | Approvisionner | Admin |
| GET | /api/credits | Paiements différés | Token |
| POST | /api/credits/:id/encaisser | Encaisser un crédit | Token |
| GET | /api/productions | Historique production | Token |
| GET | /api/rapports/ventes | Export CSV ventes | Admin |
