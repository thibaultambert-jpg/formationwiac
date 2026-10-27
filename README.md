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
| `PENNYLANE_API_TOKEN`                       | Jeton de l'API Pennylane v2 (facturation des externes)       | 5   |

## 1. Base de données Supabase

1. Créer un projet sur [supabase.com](https://supabase.com) dans une région de l'UE (de préférence
   **West EU (Paris)**, `eu-west-3`, la même zone que Vercel `cdg1`).
2. Bouton **Connect** (en haut du projet) › **Connection String**, en remplaçant `[YOUR-PASSWORD]` par le mot de
   passe de la base (réinitialisable dans **Database › Settings**) :
   - **Transaction pooler** (port 6543) → `DATABASE_URL` ;
   - **Session pooler** (port 5432) → `DIRECT_URL` (la connexion directe `db.….supabase.co` n'est joignable qu'en
     IPv6, ce que Vercel ne permet pas).
3. Sur Vercel, le build de production applique les migrations et le seed (voir « Déploiement sur Vercel »). Depuis un
   poste disposant de ces deux variables, on peut aussi les lancer à la main :
   ```bash
   pnpm db:deploy
   pnpm db:seed
   ```
4. La migration `enable_rls` active la Row Level Security sur toutes les tables, sans politique : l'API publique de
   Supabase (clé `anon`) ne peut rien lire. L'application accède à la base uniquement côté serveur, via Prisma.

### Stockage des fichiers (Supabase Storage)

1. **Storage › New bucket** : nom `documents` (ou la valeur de `SUPABASE_STORAGE_BUCKET`), **Public bucket décoché**.
2. **Project Settings › Data API** : reporter l'URL du projet (`https://<ref>.supabase.co`) dans `SUPABASE_URL`.
3. **Project Settings › API Keys** : reporter une clé secrète dans `SUPABASE_SERVICE_ROLE_KEY`, soit une **Secret key**
   (`sb_secret_…`), soit la clé `service_role` de l'onglet **Legacy API Keys**. Cette clé reste côté serveur et n'est
   jamais envoyée au navigateur.
4. Les fichiers (programmes PDF, CV, logo, signature) sont toujours servis par l'application via `/fichiers/…`, après
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

## 3. Envoi des emails via Gmail

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
quand le mot de passe du compte change. **Seule l'option « compte de service » est branchée dans l'application** : demandez
l'alternative si vous la préférez.

**Vérifier la configuration** : **Paramètres › Emails** indique le mode d'envoi actif. Inscrivez-vous à une session
depuis le front : l'email apparaît dans **Derniers envois** (avec l'identifiant Gmail) et dans la boîte « Envoyés » de
l'adresse expéditrice. Un envoi en échec est tracé avec son message d'erreur, sans bloquer l'inscription.

**Sans Gmail** : en développement, chaque email (avec son fichier .ics) est conservé dans la boîte d'envoi locale
(`.storage/boite-envoi/`) et consultable dans le back-office (onglet **Documents** d'une session, ou **Paramètres ›
Emails**). En production sans Gmail, les envois sont tracés en échec.

Emails envoyés automatiquement : inscription confirmée (avec .ics), placement en liste d'attente, place libérée, annulation
de session (inscrits et formateurs). Les modèles sont modifiables dans **Paramètres › Emails**. À l'ajout depuis le
back-office (et à l'import CSV), la case « Ne pas envoyer d'email » permet de rester silencieux.

## 4. Déploiement sur Vercel

1. Sur [vercel.com](https://vercel.com) : **Add New › Project** → importer le dépôt GitHub. Le framework Next.js et
   pnpm sont détectés automatiquement. `vercel.json` fixe la région des fonctions à `cdg1` (Paris).
2. **Settings › Environment Variables** : saisir les variables du lot 1 (tableau ci-dessus) pour l'environnement
   _Production_, avec `APP_URL` égale à l'URL de production.
3. Déployer. La commande de build (`pnpm build:vercel`, fixée dans `vercel.json`) applique, en production uniquement,
   les migrations (`pnpm db:deploy`) et le seed idempotent (`pnpm db:seed`) sur la base désignée par `DIRECT_URL`,
   puis génère le client Prisma et construit l'application. Une migration en échec fait échouer le déploiement : la
   version en ligne reste alors inchangée.
4. Les déploiements _Preview_ ne touchent jamais à la base : sans variables de base pour cet environnement, ils
   construisent l'application sans pouvoir s'en servir.
5. Optionnel : **Settings › Domains** pour un domaine personnalisé ; le reporter ensuite dans le client OAuth Google et
   dans `APP_URL`.

## 5. Tâches automatiques (Vercel Cron)

`vercel.json` déclare une tâche quotidienne (`/api/cron`, 05:15 UTC, soit 06:15 ou 07:15 à Paris), compatible avec le plan
**Hobby**. Elle envoie :

- le **rappel J-X** (X réglable dans **Paramètres › Évaluations et rappels**) aux participants confirmés et aux formateurs ;
- le **lien d'émargement** personnel le matin de chaque journée de formation, aux participants et aux formateurs (avec la
  liste des inscrits) ;
- à la **clôture** (après le dernier créneau) : passage de la session en « Terminée », présent/absent selon l'émargement,
  **attestation PDF** et **évaluation à chaud** aux présents ;
- l'**évaluation à froid** à J+60 et la **relance** 5 jours après une évaluation restée sans réponse ;
- l'anonymisation et la purge des preuves au-delà de la durée de conservation.

Chaque envoi automatique a une clé d'unicité : relancer la tâche n'envoie jamais deux fois le même email.

Mise en place :

1. Générer un secret (`openssl rand -base64 32`) et le saisir dans la variable `CRON_SECRET` sur Vercel : Vercel l'envoie
   automatiquement à chaque exécution (`Authorization: Bearer …`).
2. Vérifier l'exécution dans **Vercel › Settings › Cron Jobs** (bouton **Run** pour un test), ou depuis l'application :
   **Paramètres › Évaluations et rappels › Exécuter les tâches automatiques maintenant**.
3. Avec un plan **Pro**, passer `"schedule"` à `"15 * * * *"` (toutes les heures) : les liens d'émargement et les évaluations
   à chaud partent alors au plus tard une heure après l'échéance, au lieu du lendemain matin. Les règles sont écrites pour
   fonctionner avec les deux fréquences.

### Récap Slack hebdomadaire

Chaque **lundi à partir de 12h (Paris)**, l'application poste dans un canal Slack la liste des sessions ouvertes aux
collaborateurs internes où l'inscription est encore possible et où il reste des places (dates, modalité, places
restantes, date limite, lien vers la fiche), avec un lien vers le catalogue. Rien n'est posté s'il n'y a aucune
session. Deux tâches Cron le lundi (10:00 et 11:00 UTC) couvrent l'heure d'été et d'hiver ; un seul message part par
semaine (tracé dans le journal, action `slack_digest`).

Mise en place :

1. [api.slack.com/apps](https://api.slack.com/apps) › **Create New App** › **From scratch**, dans l'espace de travail.
2. **Incoming Webhooks** › activer › **Add New Webhook to Workspace** › choisir le canal.
3. Copier l'URL `https://hooks.slack.com/services/…` dans la variable `SLACK_WEBHOOK_URL` sur Vercel (Production), puis
   redéployer. Pour changer de canal, créer un nouveau webhook et remplacer la variable.

En développement, sans webhook, le message est écrit dans `.storage/slack/`.

## Conventions de formation (participants externes)

Une inscription externe réserve sa place avec le statut **« En attente de convention »**. Elle devient **Confirmée**
quand la convention de formation de son entreprise est enregistrée comme signée, ou quand un administrateur saisit une
**dérogation motivée** (bouton « Déroger » de l'onglet Inscrits, tracée dans l'historique).

Onglet **Conventions** de la session :

1. **Générer la convention** : PDF conforme aux articles L6353-1 et suivants (parties, objet et nature de l'action,
   dates, durée, lieu, stagiaires, prix, dédit), qui couvre toutes les inscriptions de l'entreprise sans convention. Le
   SIRET et le numéro de déclaration d'activité doivent être renseignés dans **Paramètres › Organisme**.
2. **Envoyer par email** à l'email de facturation de l'entreprise (ou à son contact principal).
3. **Convention signée** : téléverser l'exemplaire signé et sa date ; les participants reçoivent alors leur
   confirmation d'inscription.

Chaque inscription porte un **type** (interne ou externe, figé à l'inscription) et un **financement** (plan interne,
fonds propres, OPCO, CPF, France Travail, Région, autre). Une session est dans le **périmètre Qualiopi** si elle est
cochée comme telle ou si une inscription est financée par des fonds publics ou mutualisés ; l'onglet **Conformité**
liste alors les obligations de chaque stagiaire, bloquantes pour les externes et pour les sessions du périmètre.

Chaque migration est fournie avec un script `down.sql` (dans son dossier) pour revenir en arrière.

## Facturation des externes (Pennylane)

Les sessions clôturées sont facturées sur le réalisé, une facture par entreprise payeuse (l'entreprise de facturation de
l'inscription, sinon celle du participant). Les factures sont créées **en brouillon** dans Pennylane : la comptabilité les
relit, les numérote et les envoie depuis Pennylane.

Mise en place :

1. Dans Pennylane : **Paramètres › Connectivité › Développeurs**, générer un jeton de l'API v2 avec les droits sur les
   clients et les factures clients. Le saisir dans la variable `PENNYLANE_API_TOKEN` sur Vercel. Pour un essai, utiliser
   d'abord le jeton d'un environnement de test Pennylane.
2. Sur chaque formation, choisir la **TVA des factures** (20 % ou exonérée). Pour l'exonération, la mention légale se
   règle dans **Paramètres › Organisme** (par défaut : article 261-4-4° a du CGI).
3. Compléter les fiches entreprises : adresse, email de facturation (ou contact principal), SIRET en France, numéro de TVA
   intracommunautaire si besoin. La fiche de l'entreprise est créée dans Pennylane à sa première facture.

Facturer une session : liste des sessions, filtre **Facturation › À facturer**, puis onglet **Facturation** de la session.

1. Pour chaque entreprise, l'écran propose le prix appliqué pour un participant présent ou ayant abandonné, 0 € pour un
   absent, avec les heures signées. Tout montant différent du montant proposé (absence facturée, présence partielle,
   geste commercial) exige un motif.
2. **Créer la facture brouillon dans Pennylane** : la facture et ses lignes sont enregistrées, puis envoyées à Pennylane.
   Une inscription ne peut figurer que sur une seule facture active.
3. En cas d'erreur (Pennylane indisponible, jeton invalide), l'erreur s'affiche avec un bouton **Réessayer**. La nouvelle
   tentative cherche d'abord la facture dans Pennylane par sa référence externe : elle ne crée jamais de doublon.
4. **Détacher** (avec un motif) libère les participants d'une facture supprimée ou annulée par un avoir dans Pennylane,
   pour les facturer de nouveau. Rien n'est effacé : création, envoi et détachement sont tracés dans l'historique.

Sans jeton, en développement, les factures sont écrites dans `.storage/pennylane/` au lieu d'être envoyées.

## Émargement, évaluations et preuves

- **Participants** : un **lien personnel par demi-journée**, envoyé le matin de chaque journée (ou depuis l'onglet
  **Émargement**). Il n'est utilisable qu'**une fois** et seulement autour du créneau (par défaut de 30 minutes avant
  le début à 60 minutes après la fin, réglable dans **Paramètres › Évaluations et rappels**). Le participant signe au
  doigt, au stylet ou en saisissant son nom, ou **certifie sa présence par une case à cocher** (alternative accessible).
  Un lien expiré, inconnu ou déjà utilisé affiche un message neutre.
- **Formateurs** : les formateurs internes signent depuis **Mes sessions**, les externes depuis leur lien personnel.
  Ils peuvent **faire signer les participants sur leur appareil** pendant le créneau et **déclarer une absence, un
  retard ou un départ anticipé** avec son motif.
- **Preuve** : chaque signature conserve l'horodatage serveur (heure de Paris à l'affichage), le jeton utilisé,
  l'adresse IP, le navigateur et une **empreinte SHA-256** (participant, session, créneau, horodatage, image). Les
  émargements sont en **ajout seul** : des triggers PostgreSQL refusent toute modification ou suppression, y compris
  par un administrateur ; seule la purge RGPD automatique peut effacer les données techniques.
- **Corrections** : l'onglet **Émargement** permet d'ajouter une correction (présent sans signature, absent, retard,
  départ anticipé) avec un motif obligatoire ; elle s'ajoute à l'historique, la signature n'est jamais modifiée.
- **Feuille d'émargement** : provisoire pendant la session, **figée à la clôture** (PDF stocké avec son empreinte
  SHA-256 et l'empreinte des émargements en pied de page). Une correction après clôture crée une nouvelle version ;
  les précédentes sont conservées.
- **Évaluations** : les questionnaires (à chaud et à froid) se modifient dans **Paramètres › Évaluations et rappels**.
  Les réponses gardent le libellé des questions au moment de la réponse. L'onglet **Évaluations** de la session présente
  les moyennes, les répartitions et les verbatims, avec un export CSV.
- **Documents** : convocation (PDF + programme, mention RGPD en fin d'email) envoyée depuis l'onglet **Documents** ;
  attestation PDF avec la durée réellement suivie. **Télécharger le dossier complet (ZIP)** regroupe la feuille d'émargement
  définitive, les attestations et certificats de réalisation tels qu'envoyés et les évaluations (réponses et synthèse).
- **Information préalable** : envoyée automatiquement à l'inscription (et par la tâche quotidienne) aux externes et aux
  sessions du périmètre Qualiopi ; le bouton **Envoyer l'information préalable** l'envoie aux autres inscrits. Elle
  reprend la fiche formation (objectifs, méthodes, évaluation, délai d'accès, accessibilité), les contacts et joint le
  programme et le règlement intérieur en vigueur ; l'empreinte et la version des pièces jointes sont enregistrées.
  C'est une obligation de l'onglet **Conformité**.
- **Certificat de réalisation** : généré avec l'attestation pour les externes et les financements publics, d'après les
  seules heures signées ; joint à l'email de l'attestation et archivé avec son empreinte.
- **Suivi pédagogique** : bouton **Suivi** de chaque inscrit : analyse du besoin (note ou document), test de
  positionnement téléversé, évaluation des acquis (acquis, partiellement acquis, non acquis, commentaire repris sur
  l'attestation), besoin d'aménagement. Ce dernier est réservé aux admins : il n'apparaît dans aucun export ni PDF, et
  chaque consultation est journalisée. Le formateur saisit aussi les acquis depuis son lien ou « Mes sessions ».
  Pour les externes du périmètre Qualiopi, l'attestation attend l'évaluation des acquis.
- **Abandon** : statut « Abandon » avec motif, une fois la formation commencée. Un créneau terminé sans signature
  déclenche une alerte à l'adresse « Alertes d'absence » (Paramètres › Évaluations et rappels).
- **Questionnaires** : positionnement J-7 (délai réglable), à chaud, à froid, entreprise cliente (contact principal)
  et formateur à la clôture ; tous éditables dans **Paramètres › Évaluations et rappels**.
- **Qualité** : menu **Qualité** : indicateurs par formation et par année (satisfaction, assiduité, abandon, absence,
  taux de réponse, acquis), export de toutes les réponses aux questionnaires, registre des réclamations et des actions
  d'amélioration, avec exports CSV.
- **Formateurs** : justificatifs datés (diplômes, certifications, contrat de sous-traitance…) sur la fiche ; alerte
  si un formateur externe n'a pas de contrat de sous-traitance en vigueur. Le BPF isole les heures sous-traitées.
- **Bilan (BPF)** : menu **Bilan (BPF)**, par année civile, stagiaires, heures signées et produits HT par financement
  et par public, avec ou sans les collaborateurs internes ; exports CSV synthèse et détail.

## Rôles

- Tout nouveau compte du domaine reçoit le rôle **Collaborateur** à sa première connexion.
- L'adresse `INITIAL_ADMIN_EMAIL` est (re)mise **Administrateur** à chaque connexion.
- Le rôle **Formateur** est attribué automatiquement quand une fiche formateur interne est liée au compte, et retiré
  quand le lien disparaît.
- Le rôle est stocké en base. Le proxy (`src/proxy.ts`) fait un premier contrôle, puis chaque page et chaque action
  revérifie le rôle en base côté serveur. Un compte désactivé (`active = false`) est déconnecté.

## Données personnelles (RGPD)

- **Droit d'accès** : **Entreprises › Tous les participants**, fiche du participant, **Exporter ses données** (archive
  ZIP : `donnees.json` avec identité, compte Google, inscriptions, émargements, évaluations, emails envoyés et
  historique, plus les signatures, les documents envoyés et les pièces pédagogiques).
- **Effacement** : sur la même fiche, **Anonymiser** (saisie de « ANONYMISER » pour confirmer). Le nom, l'email, le
  téléphone, la fonction, les motivations et les copies d'emails sont effacés, et les entrées du journal d'audit qui le
  concernent sont neutralisées. Les inscriptions, émargements et attestations sont conservés sans identité jusqu'à la fin
  de la durée de conservation. Pour un collaborateur, le compte est aussi anonymisé et désactivé : une nouvelle connexion
  Google crée un nouveau compte vierge. Les administrateurs et les comptes liés à une fiche formateur doivent d'abord
  être modifiés.
- **Durées de conservation** : **Paramètres › Données personnelles** : externes 5 ans après leur dernière formation,
  internes 5 ans après leur départ (date de départ saisie dans **Utilisateurs et rôles**), traces techniques des
  signatures (IP, navigateur) 12 mois, liens expirés 7 jours. La page liste les participants à anonymiser, les fichiers
  de preuve expirés (sessions dont tous les stagiaires sont anonymisés) et purge les traces techniques. La tâche
  quotidienne applique ces règles automatiquement.
- **Conservation légale** : depuis l'onglet **Conformité** d'une session ou la fiche d'un participant, avec un motif ;
  elle suspend toute anonymisation et toute purge tant qu'elle n'est pas levée.
- **Textes légaux** : **Paramètres › Informations légales** : mention courte (pages publiques, convocations,
  information préalable), politique de confidentialité (`/confidentialite`), mentions légales (`/mentions-legales`),
  contacts (DPO, référents) et règlement intérieur versionné (`/reglement-interieur`). Les modèles proposés sont à
  faire valider par le DPO.
- **Exports** : chaque export CSV, PDF ou fichier nominatif téléchargé par un admin est inscrit au journal d'audit
  (auteur, fichier, filtres, nombre de lignes).
- **En-têtes de sécurité** : CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` et HSTS sur toutes les
  réponses (`src/lib/security-headers.ts`).

## Imports CSV

Bouton **Importer un CSV** sur les listes **Sessions**, **Formateurs**, **Entreprises** et dans l'onglet **Inscrits**
d'une session. Chaque fenêtre d'import propose son fichier exemple (`/admin/modeles-import/sessions`, `formateurs`,
`entreprises`, `inscrits`).

- Séparateur `;` (Excel en français) ou `,`, encodage UTF-8. Les en-têtes sont reconnus sans tenir compte des accents
  ni de la casse (`Prénom`, `E-mail`, `Société`…).
- Les lignes invalides sont ignorées et listées dans le compte rendu (avec leur numéro de ligne) ; les autres sont
  importées. Chaque import est inscrit au journal d'audit.
- **Sessions** : une ligne par session, créée en brouillon. Colonnes obligatoires `formation` (intitulé exact ou slug),
  `creneaux` (`12/11/2026 09:00-12:30 | 12/11/2026 13:30-17:00`) et `capacite_max` ; options `capacite_min`, `lieu`,
  `lien_visio`, `date_limite`, `internes`, `externes`, `qualiopi` (oui/non), `formateurs` (emails), `infos_acces`,
  `notes_internes`. Mêmes contrôles que le formulaire ; les conflits de formateur sont signalés sans bloquer.
- **Formateurs** : `prenom`, `nom`, `email` ; options `type` (interne/externe), `telephone`, `societe`, `specialites`,
  `actif`. Un formateur interne est lié au compte Google de même email. Un formateur existant (même email) n'est pas
  modifié.
- **Entreprises** : `raison_sociale` ; options `siret`, `adresse`, `code_postal`, `ville`, `email_facturation`. Une
  entreprise existante (même SIRET, ou même raison sociale sans SIRET) n'est pas modifiée.
- **Inscrits** : `prenom`, `nom`, `email`, et `entreprise` pour les externes ; options `type` (interne/externe ; sans
  type, une ligne sans entreprise est un collaborateur), `siret`, `fonction`, `telephone`. Un collaborateur est
  retrouvé par son compte (connecté au moins une fois). Un contact externe existant est retrouvé par son email, une
  entreprise par son SIRET, sinon par sa raison sociale exacte ; sinon ils sont créés. Les inscriptions suivent la
  capacité : confirmées, puis en liste d'attente une fois la session complète.

## Tests

```bash
pnpm test                    # tests unitaires (Vitest) : règles métier, CSV, dates, droits
pnpm test:integration        # tests sur une vraie base PostgreSQL (DATABASE_URL) : capacité concurrente, liste d'attente
pnpm build && pnpm test:e2e  # tests de bout en bout (Playwright), variables d'environnement exportées
```

Les tests de bout en bout créent leurs propres comptes (`e2e-admin@<domaine>`, `e2e-collaborateur@<domaine>`) et des
cookies de session signés avec `NEXTAUTH_SECRET`. Ils n'utilisent jamais Google et ne doivent être lancés que sur une
base de développement ou de test.
