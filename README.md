# Gestion des formations

Application de planification des sessions de formation et de gestion des inscriptions, en remplacement de Dendreo.
Elle comporte un back-office (`/admin`) réservé aux administrateurs et un front réservé aux collaborateurs, accessibles
uniquement par connexion Google Workspace.

- Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)
- Conventions et commandes de développement : [`CLAUDE.md`](CLAUDE.md)

Stack : Next.js 16 · TypeScript · Tailwind CSS + shadcn/ui · PostgreSQL (Supabase) · Prisma 7 · Auth.js (Google) ·
Vercel.

## Démarrage en local

Prérequis : Node.js 22+, pnpm 10, PostgreSQL 16 (local ou Supabase).

```bash
pnpm install
cp .env.example .env        # puis renseigner les valeurs (voir ci-dessous)
pnpm db:migrate             # crée le schéma
pnpm db:seed                # paramètres, thèmes, modèles d'emails, questionnaires
pnpm db:seed:demo           # optionnel : formations, formateurs, entreprises et sessions de démonstration
pnpm dev                    # http://localhost:3000
```

En local, `DATABASE_URL` et `DIRECT_URL` peuvent pointer vers la même base, par exemple
`postgresql://postgres:postgres@localhost:5432/formation_dev`.

## Variables d'environnement

Toutes les variables sont listées et commentées dans [`.env.example`](.env.example).

| Variable                                    | Rôle                                                         | Lot |
| ------------------------------------------- | ------------------------------------------------------------ | --- |
| `DATABASE_URL`                              | Connexion PostgreSQL « poolée », utilisée par l'application  | 1   |
| `DIRECT_URL`                                | Connexion directe, utilisée par les migrations Prisma        | 1   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`  | Client OAuth Google (connexion)                              | 1   |
| `ALLOWED_GOOGLE_DOMAIN`                     | Domaine Workspace autorisé (ex. `entreprise.fr`)             | 1   |
| `INITIAL_ADMIN_EMAIL`                       | Adresse toujours promue administrateur à la connexion        | 1   |
| `NEXTAUTH_SECRET`                           | Secret de signature des sessions (`openssl rand -base64 32`) | 1   |
| `APP_URL`                                   | URL publique de l'application, sans `/` final                | 1   |
| `GOOGLE_SERVICE_ACCOUNT_KEY`                | Clé JSON du compte de service Gmail                          | 3   |
| `GMAIL_SENDER_ADDRESS`                      | Adresse d'envoi (ex. `formation@entreprise.fr`)              | 3   |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage (programmes, CV, signatures, documents)     | 2   |
| `SUPABASE_STORAGE_BUCKET`                   | Nom du bucket privé (`documents` par défaut)                 | 2   |
| `CRON_SECRET`                               | Protection des tâches planifiées (rappels, évaluations)      | 4   |

## 1. Base de données Supabase

1. Créer un projet sur [supabase.com](https://supabase.com) dans une région de l'UE (de préférence
   **West EU (Paris)**, `eu-west-3`, la même zone que Vercel `cdg1`).
2. Dans **Project Settings › Database › Connection string** :
   - **Transaction pooler** (port 6543) → `DATABASE_URL` ;
   - **Session pooler** (port 5432) ou connexion directe → `DIRECT_URL`.
3. Depuis un poste disposant de ces deux variables, appliquer le schéma et le seed :
   ```bash
   pnpm db:deploy
   pnpm db:seed
   ```
4. La migration `enable_rls` active la Row Level Security sur toutes les tables, sans politique : l'API publique de
   Supabase (clé `anon`) ne peut rien lire. L'application accède à la base uniquement côté serveur, via Prisma.

### Stockage des fichiers (Supabase Storage)

1. **Storage › New bucket** : nom `documents` (ou la valeur de `SUPABASE_STORAGE_BUCKET`), **Public bucket décoché**.
2. **Project Settings › API** : reporter l'URL du projet dans `SUPABASE_URL` et la clé `service_role` dans
   `SUPABASE_SERVICE_ROLE_KEY`. Cette clé reste côté serveur et n'est jamais envoyée au navigateur.
3. Les fichiers (programmes PDF, CV, logo, signature) sont toujours servis par l'application via `/fichiers/…`, après
   vérification des droits : un lien direct vers Supabase n'est jamais exposé.

En développement, si ces variables sont vides, les fichiers sont enregistrés dans le dossier local `.storage/` (ignoré
par git). En production, l'absence de configuration provoque une erreur explicite au premier téléversement.

## 2. Client OAuth Google (connexion)

Dans la [Google Cloud Console](https://console.cloud.google.com), avec un compte administrateur du Workspace :

1. Créer (ou choisir) un projet rattaché à l'organisation Workspace.
2. **API et services › Écran de consentement OAuth** (Google Auth Platform) :
   - type d'utilisateur **Interne** : seuls les comptes du Workspace peuvent se connecter ;
   - nom de l'application, adresse d'assistance, domaine autorisé (`entreprise.fr`) ;
   - champs d'application : `openid`, `email`, `profile` (aucun champ sensible).
3. **API et services › Identifiants › Créer des identifiants › ID client OAuth** :
   - type **Application Web** ;
   - origines JavaScript autorisées : `http://localhost:3000` et l'URL de production (ex. `https://formations.entreprise.fr`) ;
   - URI de redirection autorisés : `http://localhost:3000/api/auth/callback/google` et
     `https://<url-de-production>/api/auth/callback/google`.
4. Reporter l'ID client et le code secret dans `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.

Google n'accepte pas de joker dans les URI de redirection : les déploiements « Preview » de Vercel, dont l'URL change à
chaque fois, ne permettent pas de se connecter. Utilisez un domaine fixe (production, ou un alias de preview déclaré).

L'application ajoute en plus des contrôles côté serveur : paramètre `hd`, claim `hd` du jeton Google, domaine de l'email
et email vérifié doivent tous correspondre à `ALLOWED_GOOGLE_DOMAIN`. Tout autre compte est redirigé vers une page
« Accès refusé » qui explique la restriction.

## 3. Envoi des emails via Gmail (à partir du lot 3)

Les emails partent d'une adresse de l'entreprise (ex. `formation@entreprise.fr`) via l'API Gmail. Quota Workspace :
environ 2 000 emails par jour et par compte. L'adresse d'envoi doit être une **boîte Gmail réelle** (compte utilisateur
avec licence) ; un groupe ou un alias ne peut pas être utilisé directement.

**Option recommandée : compte de service avec délégation au niveau du domaine**

1. Dans le projet Google Cloud : **API et services › Bibliothèque** → activer **Gmail API**.
2. **IAM et administration › Comptes de service** → créer un compte de service (aucun rôle IAM n'est nécessaire), puis
   **Clés › Ajouter une clé › JSON**. Si la création de clés est bloquée, une règle d'administration
   (`iam.disableServiceAccountKeyCreation`) doit être levée pour ce projet.
3. Noter l'**ID client** (numérique) du compte de service.
4. Dans la [console d'administration Google](https://admin.google.com) : **Sécurité › Accès et contrôle des données ›
   Commandes des API › Délégation au niveau du domaine › Ajouter** :
   - ID client : celui du compte de service ;
   - champ d'application : `https://www.googleapis.com/auth/gmail.send` (uniquement).
5. Renseigner :
   - `GOOGLE_SERVICE_ACCOUNT_KEY` : contenu du fichier JSON sur une seule ligne ;
   - `GMAIL_SENDER_ADDRESS` : l'adresse au nom de laquelle le compte de service envoie.

**Alternative : jeton OAuth du compte expéditeur.** Créer un second client OAuth « Application de bureau », obtenir
une seule fois un _refresh token_ pour le compte `formation@…` avec le champ `gmail.send`, et le stocker en variable
d'environnement. Cette option évite la délégation au niveau du domaine, mais le jeton peut être révoqué, par exemple
quand le mot de passe du compte change. Si vous la retenez, elle sera branchée au lot 3.

## 4. Déploiement sur Vercel

1. Sur [vercel.com](https://vercel.com) : **Add New › Project** → importer le dépôt GitHub. Le framework Next.js et
   pnpm sont détectés automatiquement. `vercel.json` fixe la région des fonctions à `cdg1` (Paris).
2. **Settings › Environment Variables** : saisir les variables du lot 1 (tableau ci-dessus) pour l'environnement
   _Production_, avec `APP_URL` égale à l'URL de production.
3. Déployer. La commande de build (`pnpm build`) génère le client Prisma puis construit l'application.
4. Les migrations ne sont **pas** appliquées automatiquement au déploiement : avant de déployer une version qui en
   contient, lancer `pnpm db:deploy` avec `DIRECT_URL` pointant vers la base de production.
5. Optionnel : **Settings › Domains** pour un domaine personnalisé ; le reporter ensuite dans le client OAuth Google et
   dans `APP_URL`.

## Rôles

- Tout nouveau compte du domaine reçoit le rôle **Collaborateur** à sa première connexion.
- L'adresse `INITIAL_ADMIN_EMAIL` est (re)mise **Administrateur** à chaque connexion.
- Le rôle **Formateur** sera attribué automatiquement quand une fiche formateur interne est liée au compte (lot 2).
- Le rôle est stocké en base. Le proxy (`src/proxy.ts`) fait un premier contrôle, puis chaque page et chaque action
  revérifie le rôle en base côté serveur. Un compte désactivé (`active = false`) est déconnecté.

## Import CSV des participants externes

Depuis l'onglet **Inscrits** d'une session ouverte aux externes, bouton **Importer un CSV**. Un modèle est
téléchargeable dans la fenêtre d'import (`/modele-import-participants.csv`).

- Séparateur `;` (Excel en français) ou `,`, encodage UTF-8.
- Colonnes obligatoires : `entreprise`, `prenom`, `nom`, `email`. Optionnelles : `siret`, `fonction`, `telephone`.
  Les en-têtes sont reconnus sans tenir compte des accents ni de la casse (`Prénom`, `E-mail`, `Société`…).
- Un contact existant est retrouvé par son email. Une entreprise existante est retrouvée par son SIRET, sinon par sa
  raison sociale exacte. Sinon, l'entreprise et le contact sont créés.
- Les lignes invalides sont ignorées et listées dans le compte rendu. Les autres sont inscrites selon la capacité :
  confirmées, puis en liste d'attente une fois la session complète.

Les exports CSV (sessions, inscrits d'une session, contacts externes) utilisent le séparateur `;` et un BOM UTF-8 pour
s'ouvrir directement dans Excel.

## Tests

```bash
pnpm test                    # tests unitaires (Vitest) : règles métier, CSV, dates, droits
pnpm test:integration        # tests sur une vraie base PostgreSQL (DATABASE_URL) : capacité concurrente, liste d'attente
pnpm build && pnpm test:e2e  # tests de bout en bout (Playwright), variables d'environnement exportées
```

Les tests de bout en bout créent leurs propres comptes (`e2e-admin@<domaine>`, `e2e-collaborateur@<domaine>`) et des
cookies de session signés avec `NEXTAUTH_SECRET`. Ils n'utilisent jamais Google et ne doivent être lancés que sur une
base de développement ou de test.
