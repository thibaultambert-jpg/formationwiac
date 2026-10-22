# Cahier des charges – Application de gestion des formations

Oct 21, 2026 · @Thibault

## 1. Contexte et objectifs

L'application remplace Dendreo par un outil simple, construit sur mesure, pour planifier des sessions de formation et gérer les inscriptions. Elle comporte deux espaces : un back-office (BO) réservé aux administrateurs, et un front d'inscription réservé aux collaborateurs de l'entreprise, accessible par connexion Google.

Objectifs mesurables de la V1 :

- Créer une session et la publier en moins de 3 minutes.
- Permettre à un collaborateur de s'inscrire en 3 clics maximum après connexion.
- Inscrire un participant externe depuis le BO sans ressaisie (recherche d'entreprise et de contact existants).
- Générer convocations, feuilles d'émargement et attestations depuis la fiche session.

La facturation est volontairement exclue de la V1 : l'outil de facturation de l'entreprise n'est pas encore choisi. Le modèle de données doit toutefois conserver les informations nécessaires (prix, entreprise payeuse) pour brancher cet outil plus tard.

## 2. Périmètre

| Inclus en V1 | Exclu de la V1 (évolutions possibles) |
| --- | --- |
| Catalogue des formations (programmes) | Facturation et devis |
| Sessions : dates, lieu ou lien visio, capacité, formateur | Gestion des financements OPCO et subrogation |
| Fiches formateurs (internes et externes) | Bilan Pédagogique et Financier (BPF) |
| Entreprises clientes et participants externes | Espace de connexion pour les externes |
| Inscriptions internes (front) et externes (BO) | Paiement en ligne |
| Liste d'attente et annulations | Synchronisation HubSpot (prévoir les champs, pas le connecteur) |
| Émargement, convocations, attestations, évaluations | Application mobile native |
| Tableau de bord simple et exports CSV | Multi-langue |

## 3. Utilisateurs et rôles

Seuls les comptes Google du domaine de l'entreprise peuvent se connecter. Les participants externes n'ont pas de compte : ils reçoivent leurs documents par email.

| Rôle | Accès | Actions principales |
| --- | --- | --- |
| Administrateur | BO complet + front | Gère formations, sessions, formateurs, entreprises, inscriptions, documents, paramètres et rôles |
| Formateur interne | Front + vue « Mes sessions » | Consulte ses sessions et la liste des inscrits, valide l'émargement |
| Collaborateur | Front uniquement | Consulte le catalogue, s'inscrit, se désinscrit, retrouve ses attestations |
| Participant externe | Aucun accès | Reçoit convocation, lien d'émargement, évaluation et attestation par email |
| Formateur externe | Aucun accès | Reçoit la liste des inscrits et le lien d'émargement par email |

Règle : tout nouveau compte Google du domaine qui se connecte reçoit le rôle Collaborateur. Un administrateur peut promouvoir un utilisateur. La première adresse administrateur est définie par variable d'environnement.

## 4. Stack technique et authentification

Stack recommandée, simple à maintenir et hébergeable sur Vercel (déjà utilisé dans l'entreprise) :

| Brique | Choix | Justification |
| --- | --- | --- |
| Framework | Next.js (App Router) + TypeScript | Front et BO dans un seul projet, routes serveur intégrées |
| UI | Tailwind CSS + shadcn/ui | Composants BO prêts à l'emploi (tableaux, formulaires, dialogues) |
| Base de données | PostgreSQL via Supabase | Hébergement UE, sauvegardes, interface d'administration |
| ORM | Prisma ou Drizzle | Schéma versionné, migrations |
| Authentification | Auth.js (NextAuth) avec Google OAuth | Connexion Google Workspace native |
| Emails | Gmail API, compte Google Workspace de l'entreprise | Envoi depuis une adresse de l'entreprise (ex. formation@…) avec pièces jointes ; quota Workspace d'environ 2 000 emails par jour |
| PDF | @react-pdf/renderer | Convocations, émargements, attestations générés côté serveur |
| Stockage fichiers | Supabase Storage | Programmes PDF, signatures, documents générés |
| Hébergement | Vercel, région Europe | Déploiement continu depuis GitHub |

Exigences d'authentification :

1. Connexion uniquement via Google OAuth, aucun mot de passe local.
2. Vérification côté serveur du paramètre `hd` et du domaine de l'email (variable `ALLOWED_GOOGLE_DOMAIN`) ; tout autre domaine est refusé avec un message clair.
3. Le rôle est stocké en base et vérifié dans un middleware : les routes `/admin/*` exigent le rôle Administrateur.
4. Sessions de 30 jours, déconnexion disponible sur toutes les pages.

## 5. Modèle de données

Une inscription relie toujours une session à un participant, interne ou externe. Les champs `price` et `billing_company_id` sont présents dès la V1 pour la future facturation, sans logique associée.

| Table | Champs principaux | Relations |
| --- | --- | --- |
| `users` | id, email, nom, prénom, rôle (admin, trainer, employee), service, actif, créé\_le | 1 user peut être 1 formateur interne |
| `trainings` (formations) | id, titre, slug, objectifs pédagogiques, prérequis, public visé, programme (texte + PDF), durée en heures, modalité (présentiel, distanciel, mixte), prix HT par participant, actif | 1 formation → n sessions |
| `trainers` (formateurs) | id, type (interne, externe), user\_id si interne, nom, prénom, email, téléphone, société, spécialités, CV (fichier), actif | n formateurs ↔ n sessions |
| `sessions` | id, training\_id, référence, statut (brouillon, publiée, complète, terminée, annulée), lieu ou lien visio, capacité max, capacité min, date limite d'inscription, ouverte aux internes (oui/non), ouverte aux externes (oui/non), notes internes | 1 session → n créneaux, n inscriptions |
| `session_slots` (créneaux) | id, session\_id, date, heure début, heure fin | utilisés pour l'émargement par demi-journée |
| `session_trainers` | session\_id, trainer\_id | table de liaison |
| `companies` (entreprises externes) | id, raison sociale, SIRET, adresse, contact principal, email de facturation, id HubSpot (optionnel) | 1 entreprise → n participants externes |
| `participants` | id, type (interne, externe), user\_id si interne, company\_id si externe, nom, prénom, email, fonction, téléphone | 1 participant → n inscriptions |
| `enrollments` (inscriptions) | id, session\_id, participant\_id, statut (confirmée, liste d'attente, annulée, présente, absente), source (front, BO), inscrit\_par, prix appliqué, billing\_company\_id, date d'inscription, motif d'annulation | unique sur (session\_id, participant\_id) |
| `attendances` (émargement) | id, enrollment\_id, slot\_id, présent, signature (image), signé\_le, adresse IP | 1 par participant et par créneau |
| `evaluations` | id, enrollment\_id, type (à chaud, à froid), réponses (JSON), note globale, soumis\_le |  |
| `documents` | id, type (convocation, émargement, attestation, programme), session\_id, enrollment\_id, fichier, généré\_le, envoyé\_le | historique des envois |
| `audit_logs` | id, user\_id, action, entité, entité\_id, avant/après (JSON), date | traçabilité |

## 6. Back-office (`/admin`)

Le BO couvre six écrans principaux, accessibles depuis une barre latérale.

**Tableau de bord.** Sessions des 30 prochains jours avec taux de remplissage, sessions sous la capacité minimale à J-10, émargements non signés des sessions terminées.

**Formations.** Liste filtrable, création et édition d'une fiche formation, téléversement du programme PDF, archivage (pas de suppression si des sessions existent), bouton « Créer une session » pré-rempli.

**Sessions.**

- Liste en vue tableau et en vue calendrier mensuel, filtres par formation, formateur, statut, période.
- Création : formation, référence auto (ex. `FORM-2026-014`), créneaux multiples, lieu ou lien visio, capacités, formateurs, ouverture interne / externe, date limite.
- Duplication d'une session pour gagner du temps.
- Fiche session avec onglets : Informations, Inscrits, Émargement, Documents, Évaluations, Historique.
- Onglet Inscrits : ajout d'un collaborateur (recherche dans `users`), ajout d'un externe (recherche ou création d'entreprise et de contact dans la même fenêtre), import CSV d'externes, changement de statut, déplacement vers une autre session, export CSV.
- Actions groupées : envoyer les convocations, envoyer le lien d'émargement, envoyer l'évaluation, générer les attestations.
- Annulation de session avec email automatique à tous les inscrits.

**Formateurs.** Liste, fiche, type interne (lié à un compte Google) ou externe, spécialités, CV, historique des sessions animées, détection de conflit si un formateur est déjà affecté sur un créneau qui se chevauche.

**Entreprises et participants externes.** Fiche entreprise avec ses contacts et l'historique des formations suivies, dédoublonnage par SIRET et par email, fusion de doublons.

**Paramètres.** Coordonnées de l'organisme (nom, adresse, SIRET, numéro de déclaration d'activité, logo, signature du responsable), modèles d'emails éditables, gestion des utilisateurs et des rôles, délai de rappel avant session.

## 7. Front collaborateurs

Le front est une interface épurée, pensée d'abord pour mobile, accessible uniquement après connexion Google.

Parcours d'inscription :

1. Le collaborateur se connecte avec son compte Google professionnel.
2. Il arrive sur le catalogue : cartes des formations ayant au moins une session publiée ouverte aux internes, avec recherche et filtres (thème, modalité, mois).
3. Il ouvre une fiche formation : objectifs, programme téléchargeable, durée, et liste des prochaines sessions avec places restantes.
4. Il clique sur « S'inscrire » sur une session, confirme dans une fenêtre récapitulative (champ optionnel « motivation ou besoin »).
5. Il reçoit un email de confirmation ; si la session est complète, il est placé en liste d'attente et en est informé.

Espace « Mes formations » :

- Inscriptions à venir avec statut, bouton de désinscription jusqu'à la date limite, ajout au Google Agenda (fichier .ics).
- Formations passées avec téléchargement de l'attestation et lien vers l'évaluation si elle n'est pas remplie.

Espace « Mes sessions » (formateurs internes uniquement) : liste des sessions animées, liste des inscrits, ouverture de l'émargement en direct.

## 8. Emails et documents générés

Tous les modèles d'emails sont éditables dans les Paramètres avec des variables (`{{prenom}}`, `{{formation}}`, `{{dates}}`, `{{lieu}}`, `{{lien_visio}}`). Chaque envoi est tracé dans `documents`.

| Déclencheur | Destinataires | Contenu / pièce jointe |
| --- | --- | --- |
| Inscription confirmée | Participant | Confirmation + fichier .ics |
| Placement en liste d'attente | Participant | Information, puis email automatique si une place se libère |
| Envoi des convocations (manuel, BO) | Participants confirmés | Convocation PDF + programme PDF |
| Rappel J-X (automatique, X paramétrable) | Participants confirmés + formateurs | Rappel dates, lieu, lien visio |
| Début de session | Participants | Lien d'émargement personnel (jeton unique, sans connexion) |
| Fin de session | Participants | Évaluation à chaud (lien sans connexion) |
| Session terminée et émargée | Participants présents | Attestation de fin de formation PDF |
| J+60 (automatique) | Participants présents | Évaluation à froid |
| Annulation de session | Inscrits + formateurs | Information d'annulation |

Documents PDF à générer, avec logo et coordonnées de l'organisme :

- **Convocation** : formation, dates et horaires, lieu ou lien, formateur, prérequis, contact.
- **Feuille d'émargement** : par session, une ligne par participant, une colonne par demi-journée, signatures et signature du formateur.
- **Attestation de fin de formation** : participant, formation, dates, durée suivie, objectifs, signature du responsable.

Émargement numérique : le participant signe sur un écran (canvas) via son lien personnel ; l'horodatage et l'adresse IP sont enregistrés. Le formateur peut aussi faire signer depuis sa tablette dans « Mes sessions ».

## 9. Règles métier

1. **Capacité.** Une inscription confirmée est refusée au-delà de la capacité max ; elle passe en liste d'attente. Le comptage se fait dans une transaction pour éviter les surréservations simultanées.
2. **Liste d'attente.** À chaque annulation, le premier en attente (ordre d'inscription) passe automatiquement en « confirmée » et reçoit un email.
3. **Validation.** Les inscriptions des collaborateurs sont confirmées automatiquement, sans validation d'un administrateur ni du manager, dans la limite des places disponibles.
4. **Unicité.** Un participant ne peut pas être inscrit deux fois à la même session, ni à deux sessions dont les créneaux se chevauchent (alerte bloquante côté front, avertissement côté BO).
5. **Date limite.** Après la date limite, le front n'autorise plus l'inscription ni la désinscription ; seul le BO peut modifier.
6. **Ouverture.** Une session « ouverte aux internes = non » n'apparaît pas sur le front ; une session « ouverte aux externes = non » refuse l'ajout d'externes au BO.
7. **Statuts de session.** Brouillon → Publiée → Complète (automatique à capacité max) → Terminée (automatique après le dernier créneau) ; Annulée possible à tout moment avant Terminée.
8. **Présence.** Une inscription passe à « présente » si au moins un créneau est émargé, sinon « absente » à la clôture ; l'attestation indique la durée réellement suivie.
9. **Suppression.** Aucune suppression physique d'une session ayant des inscrits ou d'un participant ayant un historique : archivage uniquement.

## 10. Exigences non fonctionnelles

**Sécurité.** Contrôle des rôles côté serveur sur chaque route et action (jamais seulement côté interface). Row Level Security activée sur Supabase. Liens d'émargement et d'évaluation par jeton aléatoire non devinable, à usage limité dans le temps. Secrets uniquement en variables d'environnement.

**RGPD.** Données hébergées dans l'UE. Collecte limitée au nécessaire. Export et suppression (anonymisation) des données d'un participant sur demande depuis le BO. Durée de conservation paramétrable, 5 ans par défaut pour les preuves de formation.

**Traçabilité (préparation Qualiopi).** Journal d'audit sur les créations, modifications et envois. Conservation des émargements signés, évaluations et attestations, téléchargeables par session en un fichier ZIP.

**Ergonomie.** Interface en français, responsive, accessible au clavier, contrastes conformes WCAG AA. Dates au format JJ/MM/AAAA, fuseau Europe/Paris.

**Qualité.** Tests unitaires sur les règles métier de la section 9, tests de bout en bout (Playwright) sur l'inscription front et l'ajout d'un externe au BO. Données de démonstration via un script de seed.

## 11. Plan de livraison et critères d'acceptation

Le développement se fait en quatre lots ; chaque lot est livré, déployé et testé avant de passer au suivant.

| Lot | Contenu | Critère d'acceptation |
| --- | --- | --- |
| 1. Socle | Projet Next.js, base Supabase, schéma complet, connexion Google restreinte au domaine, rôles, mise en page BO et front, déploiement Vercel | Un compte hors domaine est refusé ; un admin accède à `/admin`, un collaborateur non |
| 2. BO cœur | Formations, formateurs, sessions avec créneaux, entreprises et externes, inscriptions BO, import CSV, exports | Un admin crée une session de 2 jours et y inscrit 3 externes d'une nouvelle entreprise sans quitter la fiche session |
| 3. Front | Catalogue, fiche formation, inscription, liste d'attente, désinscription, « Mes formations », emails de confirmation | Un collaborateur s'inscrit en 3 clics ; à capacité atteinte, le suivant passe en liste d'attente et est promu à la première annulation |
| 4. Documents et suivi | Convocations, émargement numérique, attestations PDF, évaluations, rappels automatiques, tableau de bord, journal d'audit | Pour une session terminée, le BO télécharge un ZIP contenant émargements signés, évaluations et attestations |

## 12. Consignes pour Claude Code et points à trancher

Consignes de travail à donner à Claude Code avec ce document :

1. Lire l'intégralité du cahier des charges, puis proposer l'arborescence du projet et le schéma de base de données avant d'écrire du code.
2. Travailler lot par lot (section 11) et s'arrêter à la fin de chaque lot pour une validation.
3. Créer un fichier `CLAUDE.md` à la racine reprenant la stack, les conventions et les commandes (dev, test, migration, seed).
4. Code et commentaires en anglais, interface intégralement en français.
5. Fournir un fichier `.env.example` listant toutes les variables : `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_GOOGLE_DOMAIN`, `INITIAL_ADMIN_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY, GMAIL_SENDER_ADDRESS`, `NEXTAUTH_SECRET`, `APP_URL`.
6. Documenter dans le `README` la création du client OAuth dans Google Cloud Console (type « Interne » pour limiter au Workspace), la configuration de l'envoi Gmail (compte de service avec délégation au niveau du domaine, ou jeton OAuth du compte expéditeur) et le déploiement sur Vercel.
7. En cas d'ambiguïté, poser la question plutôt que supposer.

Décisions prises :

| Question | Décision |
| --- | --- |
| Validation des inscriptions collaborateurs | Automatique, aucune validation admin ou manager |
| Inscription autonome des externes via formulaire public | Non, les externes sont inscrits uniquement depuis le BO |
| Service d'envoi des emails | Gmail de l'entreprise (Gmail API) |
| Reprise de l'historique Dendreo | Non en V1 |
| Questionnaires d'évaluation | Version provisoire en annexe, contenu définitif fourni plus tard ; les questions doivent rester éditables dans les Paramètres |

## Annexe – Questionnaires d'évaluation provisoires

Ces questionnaires servent de contenu par défaut en V1 et seront remplacés par la version définitive. Ils couvrent la satisfaction et l'atteinte des objectifs, deux éléments attendus dans une démarche Qualiopi. Échelle utilisée : 1 (pas du tout satisfait) à 5 (très satisfait).

**Évaluation à chaud** (envoyée en fin de session, environ 3 minutes)

| N° | Question | Type de réponse |
| --- | --- | --- |
| 1 | Globalement, êtes-vous satisfait de cette formation ? | Échelle 1 à 5 |
| 2 | Les objectifs annoncés ont-ils été atteints ? | Oui / Partiellement / Non |
| 3 | Le contenu correspondait-il à vos attentes et à vos besoins ? | Échelle 1 à 5 |
| 4 | Comment évaluez-vous la pédagogie et la clarté du formateur ? | Échelle 1 à 5 |
| 5 | Le rythme et la durée étaient-ils adaptés ? | Trop lent / Adapté / Trop rapide |
| 6 | Comment évaluez-vous l'organisation (convocation, lieu ou outil visio, supports) ? | Échelle 1 à 5 |
| 7 | Vous sentez-vous capable d'appliquer ce que vous avez appris ? | Échelle 1 à 5 |
| 8 | Recommanderiez-vous cette formation à un collègue ? | Échelle 0 à 10 |
| 9 | Qu'avez-vous le plus apprécié ? | Texte libre |
| 10 | Que faudrait-il améliorer ? | Texte libre |

**Évaluation à froid** (envoyée à J+60, environ 2 minutes)

| N° | Question | Type de réponse |
| --- | --- | --- |
| 1 | Avez-vous mis en pratique ce que vous avez appris ? | Oui, régulièrement / Ponctuellement / Pas encore |
| 2 | Si non, qu'est-ce qui vous en a empêché ? | Pas d'occasion / Manque de temps / Contenu peu adapté / Autre (texte) |
| 3 | Quel impact la formation a-t-elle eu sur votre travail ? | Échelle 1 à 5 |
| 4 | Avec le recul, les objectifs de la formation sont-ils atteints pour vous ? | Oui / Partiellement / Non |
| 5 | Auriez-vous besoin d'un approfondissement ou d'une formation complémentaire ? | Oui (précisez) / Non |
| 6 | Un exemple concret d'application ou une remarque ? | Texte libre |

Exigences techniques : questions stockées en base (type, libellé, options, ordre) et modifiables depuis les Paramètres sans redéploiement ; synthèse par session dans l'onglet Évaluations (moyennes, répartition, verbatims) et export CSV ; une relance automatique 5 jours après l'envoi si le questionnaire n'est pas rempli.
