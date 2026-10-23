# Résultat de l'audit de conformité

Audit réalisé le 23/10/2026 sur la branche `main` (commit `8aa167e`), à partir de `AUDIT_CONFORMITE.md`.

Légende :

- **Statut** : ✅ Conforme · 🟠 Partiel · ❌ Absent · ➖ Hors périmètre.
- **Effort** : S (moins d'une demi-journée) · M (1 à 2 jours) · L (3 jours ou plus).
- **Priorité** : celle de la checklist (P1, P2, P3).

> **Lecture rapide.** Le socle est solide : authentification restreinte au domaine, contrôle des rôles côté serveur, liens nominatifs par jeton, horodatage serveur, signature du formateur, documents PDF avec NDA, RGPD (export, anonymisation, purge) et ZIP de preuves.
>
> Les écarts principaux sont les suivants :
>
> - pas de **convention de formation** ni de **périmètre Qualiopi ou financement** sur les sessions ;
> - pas d'**information préalable** complète (règlement intérieur, référent handicap, modalités d'évaluation) ;
> - pas de **certificat de réalisation** ;
> - pas d'**export BPF** ;
> - un émargement **corrigeable par écrasement**, sans empreinte ni protection en base ;
> - pas de **registres** de réclamations et d'amélioration continue ;
> - pas de **pages légales**, pas de **mention RGPD** sur la page d'émargement ;
> - pas d'**en-têtes de sécurité** CSP et X-Frame-Options.

---

## Synthèse

| Point                                      | Statut                | Priorité      | Effort      |
| ------------------------------------------ | --------------------- | ------------- | ----------- |
| A1 Typage des participants                 | 🟠                    | P1            | S           |
| A2 Typage des sessions                     | 🟠                    | P1            | S           |
| A3 Règles conditionnelles                  | ❌                    | P1            | M           |
| B1 NDA sur les documents                   | 🟠                    | P1            | S           |
| B2 Convention de formation                 | ❌                    | P1            | M           |
| B3 Information préalable                   | 🟠                    | P1            | M           |
| B4 Convocation                             | 🟠                    | P1            | S           |
| B5 Attestation de fin de formation         | 🟠                    | P1            | S           |
| B6 Certificat de réalisation               | ❌                    | P1            | M           |
| B7 Données BPF                             | ❌                    | P1            | M           |
| C1 Granularité demi-journée                | ✅                    | P1            | —           |
| C2 Identification du signataire            | 🟠                    | P1            | M           |
| C3 Cosignature du formateur                | 🟠                    | P1            | S           |
| C4 Horodatage                              | ✅                    | P1            | S           |
| C5 Intégrité et ajout seul                 | ❌                    | P1            | L           |
| C6 Journal de preuve                       | 🟠                    | P1            | S           |
| C7 Export de la feuille d'émargement       | 🟠                    | P1            | M           |
| C8 Page d'émargement publique              | 🟠                    | P1            | S           |
| D1 Information et indicateurs de résultats | 🟠                    | P1 (Qualiopi) | M           |
| D2 Analyse du besoin                       | 🟠                    | P1 (Qualiopi) | S           |
| D3 Positionnement à l'entrée               | ❌                    | P1 (Qualiopi) | M           |
| D4 Information sur le déroulement          | 🟠                    | P1 (Qualiopi) | — (B3, B4)  |
| D5 Évaluation des acquis                   | ❌                    | P1 (Qualiopi) | M           |
| D6 Absences et abandons                    | 🟠                    | P1 (Qualiopi) | M           |
| D7 Compétences des intervenants            | 🟠                    | P1 (Qualiopi) | S           |
| D8 Handicap                                | ❌                    | P1 (Qualiopi) | M           |
| D9 Recueil des appréciations               | 🟠                    | P1 (Qualiopi) | M           |
| D10 Registre des réclamations              | ❌                    | P1 (Qualiopi) | M           |
| D11 Registre d'amélioration continue       | ❌                    | P1 (Qualiopi) | M           |
| D12 Sous-traitance                         | 🟠                    | P1 (Qualiopi) | S           |
| E1 Inventaire des données                  | ✅ (ci-dessous)       | P1            | —           |
| E2 Information des personnes               | ❌                    | P1            | M           |
| E3 Minimisation                            | ✅                    | P1            | —           |
| E4 Données sensibles                       | ➖ (aucune à ce jour) | P1            | lié à D8    |
| E5 Durées de conservation et purge         | 🟠                    | P1            | M           |
| E6 Droits des personnes                    | ✅                    | P1            | S           |
| E7 Sécurité                                | 🟠                    | P1            | M           |
| E8 Hébergement et sous-traitants           | 🟠 (à confirmer)      | P1            | hors code   |
| E9 Cookies et traceurs                     | ✅                    | P1            | —           |
| F1 Mentions légales                        | ❌                    | P2            | S           |
| F2 Politique de confidentialité            | ❌                    | P2            | S (avec E2) |
| F3 Règlement intérieur                     | ❌                    | P2            | S           |
| G1 Suivi des salariés                      | ✅ (liste ci-dessous) | P2            | —           |
| G2 Exports nominatifs journalisés          | 🟠                    | P2            | S           |
| H1 Accessibilité de l'émargement           | 🟠                    | P3            | S           |
| H2 RGAA des écrans internes                | 🟠                    | P3            | M           |
| I1 Dossier complet par session             | 🟠                    | P2            | M           |
| I2 Documents figés                         | 🟠                    | P2            | M           |

---

## A. Distinction interne / externe (P1)

### A1. Typage des participants 🟠

- **Fichiers** : `prisma/schema.prisma` (`Participant.type`, `Participant.companyId`, `Enrollment.billingCompanyId`), `src/server/services/enrollments.ts`.
- **Existant** :
  - le type `internal` ou `external` est porté par le **participant** ;
  - un externe est rattaché à une **entreprise** (`companyId`), et l'inscription peut avoir une entreprise payeuse.
- **Manque** :
  - le type n'est pas porté par l'**inscription** : un salarié qui changerait de statut modifierait l'historique ;
  - aucune convention n'est rattachée.
- **Proposition** :
  - ajouter `enrollments.participant_type`, figé à l'inscription (rempli par migration à partir du participant) ;
  - le lien vers la convention est traité en B2.
- **Effort** : S.

### A2. Typage des sessions 🟠

- **Fichiers** : `TrainingSession.openToInternal`, `TrainingSession.openToExternal`, `src/app/admin/sessions/**`.
- **Existant** : la session indique si elle est ouverte aux internes, aux externes ou aux deux.
- **Manque** : ni périmètre Qualiopi ni type de financement.
- **Proposition** :
  - ajouter `sessions.qualiopi_scope` (booléen), modifiable dans le formulaire de session et affiché sous forme de badge ;
  - ajouter `enrollments.funding_type`, une énumération : `none` (plan interne), `opco`, `cpf`, `france_travail`, `region`, `company` (fonds propres du client), `other`. Ce champ alimente aussi le BPF (B7) ;
  - une session est « dans le périmètre » si `qualiopi_scope` est vrai ou si une inscription a un financement public ou mutualisé.
- **Effort** : S.

### A3. Règles conditionnelles ❌

- **Manque** : aucune règle ne dépend du type de participant ni du périmètre.
- **Proposition** :
  - une fonction pure `requirementsFor(enrollment, session)` dans `src/server/domain/compliance.ts`, testée unitairement. Elle renvoie les obligations bloquantes : convention, information préalable, positionnement, évaluation des acquis…
  - ces obligations sont **bloquantes** pour un externe ou une session du périmètre Qualiopi, et seulement **indicatives** pour un interne ;
  - un panneau « Conformité » sur la fiche session liste les manques par stagiaire.
- **Effort** : M.

---

## B. Obligations « organisme de formation » pour les externes (P1)

### B1. Numéro de déclaration d'activité 🟠

- **Fichiers** : `OrganizationSettings.activityDeclarationNumber`, `src/server/pdf/styles.tsx` (`OrgFooter`).
- **Existant** : le NDA est stocké en configuration. Il apparaît dans le pied de page de la convocation, de la feuille d'émargement et de l'attestation.
- **Manque** :
  - il n'apparaîtra pas sur le certificat de réalisation, qui n'existe pas encore (B6) ;
  - aucun contrôle n'empêche de générer un document sans NDA.
- **Proposition** :
  - mettre le NDA dans le pied de page de tout nouveau document ;
  - bloquer la génération des documents destinés aux externes tant que le NDA ou le SIRET manquent, avec un message dans Paramètres › Organisme.
- **Effort** : S.

### B2. Convention de formation ❌

- **Manque** : pas de modèle « convention », pas de téléversement, aucun blocage à la confirmation.
- **Proposition** :
  - créer une table `conventions` :
    - entreprise et session (ou plusieurs sessions) ;
    - référence, date de signature, fichier PDF signé, statut (brouillon, envoyée, signée) ;
  - lier les inscriptions à une convention (`enrollments.convention_id`) ;
  - un externe ne passe en « confirmée » que si une convention **signée** est rattachée, ou si une **dérogation** est saisie avec son motif (`convention_waiver_reason`), tracée dans le journal ;
  - un onglet « Conventions » est ajouté à la fiche entreprise et à la fiche session.
- **Point à trancher** : faut-il générer la convention en PDF ? Je propose de ne pas la générer en V1 et de téléverser la convention signée, souvent produite par l'outil commercial.
- **Effort** : M.

### B3. Information préalable du stagiaire 🟠

- **Fichiers** :
  - `src/server/email/default-templates.ts` (`enrollment_confirmation`, `convocation`) ;
  - `src/server/services/session-documents.ts` (`sendConvocations`, avec convocation et programme en pièces jointes).
- **Existant** : l'email de confirmation donne les dates, le lieu et le lien visio. La convocation joint le programme PDF.
- **Manque** :
  - objectifs, prérequis, durée et modalités d'évaluation dans le corps du message ;
  - contacts du référent handicap, du référent pédagogique et du référent administratif ;
  - **règlement intérieur** ;
  - un **envoi dédié et tracé avec les versions** des documents envoyés.
- **Proposition** :
  - créer un nouvel email « Information préalable » (`pre_training_information`) envoyé à chaque externe avant la session. L'envoi peut être manuel depuis la fiche session ou automatique à l'inscription. Il contient :
    - un récapitulatif complet de la formation ;
    - les contacts, configurés dans Paramètres › Organisme ;
    - le règlement intérieur en pièce jointe (F3) et le programme ;
  - la trace dans `documents` enregistre la date, le destinataire et les **identifiants de version** du programme et du règlement intérieur joints (`documents.attachments` en JSON) ;
  - pour les externes, il devient bloquant au sens de A3.
- **Effort** : M.

### B4. Convocation 🟠

- **Fichiers** : `renderConvocation` (`src/server/pdf/documents.tsx`), `sendConvocations`.
- **Existant** :
  - le PDF donne les dates, les horaires, la durée, le lieu ou le lien visio, les formateurs, les prérequis et le contact ;
  - l'envoi est tracé dans `documents` avec la pièce jointe stockée.
- **Manque** : les **informations d'accès** et les **documents ou matériel à prévoir**.
- **Proposition** :
  - ajouter `sessions.access_info` (accès, salle, parking) et `trainings.things_to_bring` ;
  - les afficher dans la convocation et dans l'email.
- **Effort** : S.

### B5. Attestation de fin de formation 🟠

- **Fichiers** : `renderCertificate`, `sendCertificates`, `closeSession`.
- **Existant** :
  - l'attestation est générée automatiquement à la clôture pour chaque présent ;
  - elle indique les objectifs et la durée suivie par rapport à la durée prévue.
- **Manque** :
  - la **nature de l'action** : action de formation au sens de l'article L6313-1, modalité ;
  - les **résultats de l'évaluation des acquis** (D5).
- **Proposition** :
  - ajouter la nature et la modalité ;
  - ajouter une section « Résultats de l'évaluation des acquis » (acquis, partiellement acquis, non acquis, avec commentaire), reprise de D5.
- **Effort** : S, une fois D5 en place.

### B6. Certificat de réalisation ❌

- **Existant** : l'attestation calcule déjà la durée à partir des créneaux marqués présents.
- **Manque** :
  - le document lui-même, sur le modèle officiel du ministère du Travail ;
  - aujourd'hui, la durée « suivie » compte aussi les présences saisies par l'admin sans signature.
- **Proposition** :
  - ajouter un PDF « Certificat de réalisation » (`completion_certificate`) selon le modèle officiel :
    - organisme, NDA, stagiaire, entreprise ;
    - intitulé, nature de l'action, dates ;
    - **heures réellement émargées**, c'est-à-dire la somme des créneaux avec signature valide (C5), en excluant les présences saisies sans signature ;
    - signature du responsable ;
  - le générer à la clôture pour les externes, le stocker et l'ajouter au ZIP.
- **Effort** : M.

### B7. Données pour le BPF ❌

- **Manque** : aucun export annuel.
- **Proposition** : un export CSV par année civile, accessible dans le Tableau de bord ou les Paramètres. Il donne :
  - le nombre de stagiaires et d'heures-stagiaires ;
  - leur répartition par type de public (salariés d'entreprises clientes, internes…) et par type de financement (A2) ;
  - les heures confiées à des formateurs sous-traitants (D12).
  - Les données s'appuient sur les heures émargées (B6).
- **Point à trancher** : le BPF couvre-t-il aussi la formation des salariés internes ? En général non, sauf si l'organisme forme ses propres salariés comme action de formation. Je propose de pouvoir filtrer.
- **Effort** : M.

---

## C. Émargement électronique (P1)

### C1. Granularité ✅

- **Fichiers** : `SessionSlot`, `Attendance` (contrainte d'unicité inscription × créneau).
- **Existant** : une signature par stagiaire et par créneau ; les créneaux correspondent aux demi-journées.
- **Proposition** : un avertissement dans le formulaire de session si un créneau dépasse une demi-journée, par exemple plus de 5 heures ou s'il chevauche 13 h. Effort S, optionnel.

### C2. Identification du signataire 🟠

- **Fichiers** :
  - `src/server/tokens.ts` ;
  - `src/server/services/session-documents.ts` (`sendAttendanceLinks`) ;
  - `src/server/domain/automation.ts` (`signingWindowOpen`) ;
  - `src/app/(public)/emargement/**`.
- **Existant** :
  - lien **nominatif** par stagiaire, avec un jeton aléatoire de 256 bits dont seul le hash est stocké ;
  - signature possible une seule fois par créneau ;
  - mode tablette du formateur, avec une signature nominative contrôlée par le formateur ;
  - aucun QR code statique.
- **Manque** :
  - le jeton est **valable toute la session**, jusqu'au lendemain du dernier créneau ;
  - il n'est **pas à usage unique** ;
  - la fenêtre de signature couvre **toute la journée** (de 30 minutes avant le début jusqu'à 23 h 59), pas seulement le créneau.
- **Proposition** :
  - émettre **un jeton par stagiaire et par créneau**, à usage unique : il est consommé à la signature (`consumed_at`) ;
  - valable de `début − marge` à `fin + marge`, avec une marge configurable dans les Paramètres (30 minutes par défaut) ;
  - l'email du matin contient un lien par demi-journée du jour ;
  - le mode tablette reste disponible, car le formateur y valide l'identité.
- **Effort** : M.

### C3. Cosignature du formateur 🟠

- **Fichiers** : `signTrainer`, `TrainerSignature`, `src/app/(public)/emargement/formateur/**`, `src/app/(front)/mes-sessions/[id]`.
- **Existant** : le formateur signe chaque créneau, depuis son lien personnel ou son espace.
- **Manque** : le formateur ne peut pas marquer une **absence** ou un **retard** avec un **motif**. Seul l'admin corrige, et sans motif.
- **Proposition** :
  - depuis son écran d'émargement, le formateur déclare pour chaque stagiaire et chaque créneau : absent, retard (avec l'heure d'arrivée) ou départ anticipé, plus un motif ;
  - cette déclaration est enregistrée en ajout seul (C5).
- **Effort** : S.

### C4. Horodatage ✅

- **Existant** : `signedAt = new Date()` côté serveur, colonnes `timestamptz` (UTC), affichage en Europe/Paris.
- **Proposition** : écrire « heure de Paris » sur la feuille d'émargement et stocker le fuseau dans l'empreinte. Effort S.

### C5. Intégrité et non-modification ❌

- **Fichiers** : `src/server/services/attendance.ts` (`setAttendanceByAdmin` fait un `upsert` qui **écrase** `present`), `prisma/migrations/*_enable_rls`.
- **Existant** :
  - une signature ne peut pas être refaite ;
  - la correction admin est journalisée dans `audit_logs` (avant et après).
- **Manque** :
  - la correction **modifie la ligne** au lieu d'ajouter une écriture ;
  - aucune empreinte SHA-256 ;
  - aucune interdiction `UPDATE` ou `DELETE` en base. L'application se connecte avec le rôle propriétaire, auquel la RLS ne s'applique pas.
- **Proposition** :
  - les tables `attendances` et `trainer_signatures` deviennent du **journal en ajout seul** :
    - chaque signature est une ligne avec l'horodatage serveur, le jeton utilisé, l'IP, le user-agent, le hash de l'image et une **empreinte SHA-256** (stagiaire, session, créneau, horodatage, hash de l'image) ;
    - les corrections vont dans une table `attendance_corrections` (créneau, stagiaire, nouvel état, motif, auteur, date), elle-même en ajout seul ;
    - l'état de présence est **calculé** : dernière correction, sinon signature ;
  - des **triggers PostgreSQL** refusent `UPDATE` et `DELETE` sur ces tables, quel que soit le rôle, y compris admin ou API. Seule la purge RGPD automatique (E5) peut supprimer, via un indicateur de transaction (`SET LOCAL app.retention_purge = on`) et en étant journalisée ;
  - la RLS reste activée, avec en plus un `REVOKE UPDATE, DELETE` pour les rôles Supabase ;
  - la migration est réversible : un script de descente supprime les triggers et les nouvelles colonnes. Les données existantes reçoivent leur empreinte sans être modifiées.
- **Point à trancher** : ce point change la façon dont l'admin corrige une présence, puisque l'écran affichera l'historique des corrections.
- **Effort** : L.

### C6. Journal de preuve 🟠

- **Existant** : l'horodatage serveur et l'IP (`attendances.ip_address`) sont conservés.
- **Manque** :
  - l'**identifiant du jeton** ;
  - le **user-agent** ;
  - la signature formateur ne garde pas l'IP ;
  - la durée de conservation de ces données n'est pas limitée (E5).
- **Proposition** :
  - ajouter `token_id` et `user_agent` aux signatures du stagiaire et du formateur ;
  - purger l'IP et le user-agent après 1 an (E5).
- **Effort** : S (inclus dans C5).

### C7. Export de la feuille d'émargement 🟠

- **Fichiers** : `renderAttendanceSheet`, `attendanceSheet()` (« regenerated on demand »).
- **Existant** : le PDF par session contient :
  - l'intitulé, la référence et les créneaux ;
  - les noms, les signatures et leurs horodatages, les absents ;
  - la signature du formateur ;
  - le NDA.
- **Manque** :
  - l'**empreinte du document** ;
  - un PDF **figé** : il est régénéré à chaque téléchargement (voir I2) ;
  - la mention du fuseau horaire.
- **Proposition** :
  - à la clôture, générer et **stocker** la feuille d'émargement définitive ;
  - calculer son SHA-256 et le stocker dans `documents.sha256` ;
  - imprimer en pied de page l'empreinte des données (agrégat des empreintes C5) ;
  - les téléchargements suivants servent ce fichier ;
  - une feuille « provisoire » reste disponible pendant la session.
- **Effort** : M.

### C8. Page d'émargement publique 🟠

- **Fichiers** : `src/app/(public)/emargement/[token]/page.tsx`, `src/app/(public)/layout.tsx`.
- **Existant** :
  - aucune donnée d'autres stagiaires sur la page du stagiaire ;
  - un jeton invalide ou expiré affiche un message neutre ;
  - aucune géolocalisation ;
  - `robots: noindex`.
- **Manque** :
  - la **mention d'information RGPD** ;
  - le lien vers les **mentions légales** ;
  - le message ne distingue pas « déjà utilisé » de « expiré », mais c'est sans fuite d'information.
- **Proposition** : afficher dans le pied de page public la mention RGPD courte (configurable, E2) et des liens vers les mentions légales et la politique de confidentialité.
- **Remarque** : la page formateur affiche la liste des inscrits de la session, ce qui est justifié pour le formateur.
- **Effort** : S.

---

## D. Points Qualiopi outillables

### D1. Indicateurs 1 et 2 🟠

- **Fichiers** : `Training` (objectifs, prérequis, public, programme, durée, modalité, prix HT), `src/app/(front)/formations/[slug]`.
- **Existant** : les objectifs, prérequis, durée, modalité, programme et tarif sont saisis. Le tarif n'est visible qu'au back-office.
- **Manque** :
  - les modalités et **délais d'accès** ;
  - les contacts ;
  - les **méthodes pédagogiques** ;
  - les **modalités d'évaluation** ;
  - l'**accessibilité handicap** ;
  - les **indicateurs de résultats** exportables (satisfaction, assiduité, abandon).
- **Information publique** : elle est diffusée sur **wiacademy.fr**, et c'est là que l'auditeur la vérifiera. L'outil interne n'est pas public. Voir « Actions hors code ».
- **Proposition** :
  - ajouter les champs manquants à la formation, affichés sur la fiche et repris dans l'information préalable (B3) ;
  - ajouter un export des indicateurs par formation et par année : satisfaction moyenne (à chaud), taux d'assiduité (heures émargées / heures prévues), taux d'abandon (D6), taux de réponse.
- **Effort** : M.

### D2. Indicateur 4 : analyse du besoin 🟠

- **Existant** : le champ « motivation ou besoin » est rempli à l'inscription en ligne.
- **Manque** : un rattachement côté entreprise cliente (document ou formulaire) pour les externes.
- **Proposition** : un document « Recueil du besoin » (fichier et commentaire), à rattacher à la convention (B2) ou à l'inscription.
- **Effort** : S.

### D3. Indicateur 8 : positionnement à l'entrée ❌

- **Proposition** :
  - un troisième type de questionnaire, « positionnement », éditable dans les Paramètres comme les évaluations ;
  - lien envoyé avant la session (J-7, configurable), avec un résultat par stagiaire ;
  - possibilité alternative de téléverser un test passé hors outil ;
  - bloquant pour les externes du périmètre Qualiopi (A3).
- **Effort** : M.

### D4. Indicateur 9 🟠

Ce point est couvert par B3 et B4. La traçabilité existe dans `documents` (date, destinataire, objet, identifiant Gmail, erreur), mais il manque les versions des documents joints (B3).

### D5. Indicateur 11 : évaluation des acquis ❌

- **Proposition** :
  - le formateur ou l'admin saisit, par stagiaire, un résultat (acquis, partiellement acquis, non acquis), un commentaire et éventuellement un fichier ;
  - la saisie se fait depuis « Mes sessions » ou la fiche session ;
  - le résultat est repris dans l'attestation (B5) ;
  - bloquant à la clôture pour les externes du périmètre Qualiopi.
- **Effort** : M.

### D6. Indicateur 12 : absences et abandons 🟠

- **Existant** :
  - l'absence est détectée à la clôture : un stagiaire sans aucune signature est marqué absent ;
  - le tableau de bord signale les émargements non signés.
- **Manque** :
  - le statut **abandon**, distinct d'absent ;
  - le **motif** ;
  - l'**alerte au référent**.
- **Proposition** :
  - ajouter le statut `dropped_out` (abandon, avec date et motif) ;
  - la tâche quotidienne détecte les créneaux non signés le jour même et envoie une **alerte** au référent pédagogique (email configurable) ;
  - l'abandon et l'absence comptent dans les indicateurs (D1).
- **Effort** : M.

### D7. Indicateurs 17 et 21 : intervenants 🟠

- **Existant** : la fiche formateur contient les spécialités (`specialties`) et un CV (`cvPath`).
- **Manque** : plusieurs justificatifs (diplômes, attestations) avec leur date.
- **Proposition** : une table `trainer_documents` (type, fichier, date, échéance) dans l'onglet « Justificatifs » de la fiche formateur.
- **Effort** : S.

### D8. Indicateur 26 : handicap ❌

- **Proposition** :
  - ajouter le référent handicap (nom, email, téléphone) dans Paramètres › Organisme, et l'afficher dans la convocation, l'information préalable et la fiche formation ;
  - ajouter un champ facultatif « Besoin d'adaptation » à l'inscription, en texte libre limité à l'aménagement, sans donnée de santé ;
  - ce champ est visible des seuls admins et du référent. **Chaque consultation est journalisée** ;
  - il n'apparaît dans aucun export ni dans les PDF.
- **Effort** : M.

### D9. Indicateur 30 : appréciations 🟠

- **Existant** :
  - questionnaire à chaud à la clôture ;
  - questionnaire à froid à J+60 ;
  - relance ;
  - exports CSV par session (réponses et synthèse).
- **Manque** :
  - les questionnaires **entreprise cliente** et **formateur** ;
  - un export consolidé, multi-sessions.
- **Proposition** :
  - deux nouveaux types de questionnaire, éditables : « Entreprise » (envoyé au contact principal à la clôture) et « Formateur » ;
  - un export consolidé par période.
- **Effort** : M.

### D10. Indicateur 31 : réclamations ❌

- **Proposition** :
  - un registre au back-office (Paramètres › Qualité › Réclamations) : date, émetteur, session ou formation liée, objet, traitement, réponse, date de clôture, statut ;
  - export CSV ;
  - journalisé.
- **Effort** : M (D10 et D11 ensemble).

### D11. Indicateur 32 : amélioration continue ❌

- **Proposition** :
  - un registre des actions d'amélioration : source (réclamation, questionnaire, audit, autre, avec lien vers la réclamation), action, responsable, échéance, statut ;
  - export CSV.
- **Effort** : inclus dans D10.

### D12. Indicateur 27 : sous-traitance 🟠

- **Existant** : le formateur peut être `external` et rattaché à une société.
- **Manque** : le contrat de sous-traitance.
- **Proposition** : un justificatif « Contrat de sous-traitance » dans `trainer_documents` (D7), avec date de validité, et un indicateur dans le BPF (B7).
- **Effort** : S.

---

## E. RGPD (P1)

### E1. Inventaire des données personnelles ✅

| Table                   | Champs personnels                                                              | Personnes                                                              | Finalité                                         |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `users`                 | email, prénom, nom, rôle, service, dernière connexion                          | Salariés (collaborateurs, admins, formateurs internes)                 | Authentification, gestion des droits             |
| `participants`          | prénom, nom, email, fonction, téléphone, lien utilisateur, entreprise          | Salariés et stagiaires externes                                        | Inscription, convocation, attestations           |
| `companies`             | raison sociale, SIRET, adresse, email de facturation, contact principal        | Contacts des entreprises clientes (personne morale, contact nominatif) | Gestion des clients et des inscriptions          |
| `trainers`              | prénom, nom, email, téléphone, société, spécialités, CV (fichier)              | Formateurs internes et externes                                        | Planification, preuve des compétences (Qualiopi) |
| `enrollments`           | statut, source, motivation ou besoin, dates, motif d'annulation, prix appliqué | Salariés et externes                                                   | Gestion des inscriptions                         |
| `attendances`           | présence, **image de signature**, horodatage, **adresse IP**, méthode          | Salariés et externes                                                   | Preuve d'assiduité (Qualiopi, financeurs)        |
| `trainer_signatures`    | image de signature, horodatage                                                 | Formateurs                                                             | Preuve de réalisation                            |
| `evaluations`           | réponses aux questionnaires, note globale                                      | Salariés et externes                                                   | Recueil des appréciations (Qualiopi 30)          |
| `access_tokens`         | hash du jeton, liens vers l'inscription ou le formateur                        | Toutes les personnes ci-dessus                                         | Accès sans compte                                |
| `documents`             | email du destinataire, objet, fichiers PDF (convocations, attestations)        | Toutes                                                                 | Traçabilité des envois                           |
| `audit_logs`            | auteur, action, valeurs avant et après (peuvent contenir des noms et emails)   | Toutes                                                                 | Traçabilité (Qualiopi, sécurité)                 |
| `organization_settings` | nom, fonction et **signature** du responsable                                  | Représentant de l'organisme                                            | Signature des attestations                       |
| Stockage Supabase       | signatures PNG, PDF générés, CV, programmes, logo                              | Toutes                                                                 | Pièces justificatives                            |
| Boîte d'envoi Gmail     | copies des emails envoyés (« Envoyés »)                                        | Toutes                                                                 | Communication                                    |

### E2. Information des personnes ❌

- **Manque** :
  - aucun texte d'information sur la page d'émargement ;
  - aucun texte dans la convocation ;
  - aucune page « Confidentialité ».
- **Proposition** :
  - ajouter trois textes configurables dans Paramètres › Données personnelles :
    - une **mention courte**, affichée sur la page d'émargement et à la fin de l'email de convocation ;
    - une **politique complète**, publiée sur la page `/confidentialite`, accessible sans connexion et liée depuis le pied de page de l'application et des pages publiques ;
    - le **contact DPO** ;
  - pré-remplir ces textes avec un modèle couvrant le responsable de traitement, les finalités, les bases légales, les destinataires, les durées, les droits, le contact et la CNIL. Ce modèle est à valider (hors code).
- **Effort** : M.

### E3. Minimisation ✅

Aucune date de naissance, adresse personnelle, numéro de sécurité sociale ni géolocalisation n'est collectée. L'adresse stockée est celle de l'entreprise. Le téléphone du participant est facultatif.

À valider : faut-il garder le téléphone et la fonction ? Je propose de les garder facultatifs, car ils servent au contact le jour J.

### E4. Données sensibles ➖

Aucune à ce jour. Le besoin d'aménagement (D8) sera la seule donnée sensible. Son accès sera restreint et chaque consultation journalisée.

### E5. Durées de conservation et purge 🟠

- **Fichiers** :
  - `OrganizationSettings.dataRetentionYears` (5 ans) ;
  - `src/server/services/privacy.ts` (`participantsPastRetention`, `purgeProofFiles`, `anonymizeParticipant`) ;
  - `src/server/services/automation.ts`, la tâche quotidienne.
- **Existant** :
  - une durée unique et configurable ;
  - anonymisation automatique des participants ;
  - purge des fichiers de preuve au-delà de la durée ;
  - purge journalisée.
- **Manque** :
  - des **durées distinctes** :
    - externes : 5 ans après la session ;
    - internes : fin de la relation de travail plus une durée d'archivage ;
    - IP et user-agent : 1 an ;
    - jetons expirés : quelques jours ;
  - le **gel** d'un dossier (contrôle, contentieux) ;
  - la purge des **jetons** expirés et des **IP**.
- **Proposition** :
  - ajouter dans les Paramètres quatre durées : externes, internes après départ, logs techniques, jetons ;
  - ajouter un drapeau `legal_hold` (avec motif et auteur) sur la session ou le participant, qui bloque toute purge ;
  - ajouter un « départ » sur l'utilisateur (date de sortie, saisie par l'admin) pour les internes ;
  - la tâche quotidienne applique chaque règle et journalise ;
  - des tests unitaires sur les règles « est-ce dû ? ».
- **Effort** : M.

### E6. Droits des personnes ✅

Fiche participant › Données personnelles :

- **export JSON** complet (journalisé) ;
- **rectification** par la fiche ;
- **anonymisation** qui conserve les preuves soumises à obligation, ce qu'explique l'interface.

Amélioration proposée : inclure les journaux d'audit et les fichiers dans l'export (ZIP). Effort S.

### E7. Sécurité 🟠

- **Conforme** :
  - RLS activée sur toutes les tables, et `REVOKE` pour les rôles `anon` et `authenticated` : l'API publique Supabase ne lit rien ;
  - la clé `service_role` n'est utilisée que côté serveur ;
  - les secrets sont dans les variables d'environnement ;
  - Google Workspace est restreint au domaine wivoo.fr (paramètre `hd`, claim, domaine de l'email, email vérifié) ;
  - un formateur ne voit que ses sessions (« Mes sessions ») ;
  - un salarié ne voit que ses inscriptions ;
  - le back-office est réservé aux admins, avec un contrôle en base à chaque page et action.
- **Partiel** :
  - pas de rôle **gestionnaire** distinct de l'admin ;
  - le journal ne couvre pas les **exports CSV** (seuls le ZIP et l'export RGPD sont journalisés) ;
  - **recherches par nom en paramètre d'URL** : le paramètre `q` des listes BO apparaît dans les journaux d'accès. Le choix vient de la règle « filtres dans l'URL » du cahier des charges ;
  - **en-têtes de sécurité** : HSTS est fourni par Vercel, mais **CSP, X-Frame-Options, Referrer-Policy et Permissions-Policy sont absents**.
- **Proposition** :
  - ajouter les en-têtes dans `next.config.ts` (CSP avec nonce, `frame-ancestors 'none'`, `Referrer-Policy: same-origin`, `Permissions-Policy` sans caméra ni géolocalisation) ;
  - journaliser tous les exports ;
  - créer un rôle `manager` (gestionnaire) si besoin. **À trancher** : est-il utile ?
  - pour `q` : soit l'accepter et le documenter, soit passer en POST. Je propose de l'accepter : le paramètre est réservé aux admins authentifiés et le domaine n'est pas public. En revanche, il faut exclure `q` des journaux.
- **Effort** : M.

### E8. Hébergement et sous-traitants 🟠 (à confirmer)

| Sous-traitant      | Usage                                                        | Région                                                                                                                        |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Vercel Inc.        | Hébergement de l'application, fonctions et tâches planifiées | Fonctions en **cdg1 (Paris)**, `vercel.json`. Société américaine (DPA et clauses contractuelles types)                        |
| Supabase Inc.      | Base PostgreSQL et stockage des fichiers                     | **À vérifier** dans le tableau de bord Supabase : la région recommandée est West EU (Paris, `eu-west-3`). Je n'y ai pas accès |
| Google (Workspace) | Connexion OAuth, envoi Gmail, boîte d'envoi                  | Selon le contrat Workspace (région de données)                                                                                |
| GitHub (Microsoft) | Code source et CI, sans données personnelles                 | —                                                                                                                             |

### E9. Cookies et traceurs ✅

Seuls des cookies **strictement nécessaires** sont posés, par Auth.js :

- `__Secure-authjs.session-token` : la session, valable 30 jours ;
- `__Secure-authjs.callback-url` ;
- `__Host-authjs.csrf-token`.

L'application ne contient ni analytics ni script tiers. Les polices sont auto-hébergées par `next/font`. **Aucun bandeau n'est nécessaire.**

---

## F. Mentions et pages légales (P2)

| Point                           | Statut | Proposition                                                                                                                                                                                     |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Mentions légales             | ❌     | Page publique `/mentions-legales`, texte configurable (éditeur, directeur de publication, hébergeur Vercel), liée depuis le pied de page de l'application et de la page d'émargement. Effort S  |
| F2 Politique de confidentialité | ❌     | Page `/confidentialite`, voir E2                                                                                                                                                                |
| F3 Règlement intérieur          | ❌     | Téléversement d'un PDF **versionné et daté** dans les Paramètres (l'historique est conservé), page de consultation et de téléchargement, pièce jointe de l'information préalable (B3). Effort S |

---

## G. Salariés et CSE (P2)

### G1. Fonctionnalités de suivi de la présence ou de l'activité des salariés ✅ (liste)

- **Historique des formations** par salarié : « Mes formations », fiche participant au BO.
- **Émargement des internes** par demi-journée : signature, horodatage, adresse IP, statut présent ou absent calculé à la clôture.
- **Absences** et corrections de présence par l'admin.
- **Feuilles d'émargement PDF** et **ZIP de preuves**, nominatifs.
- **Exports CSV nominatifs** : inscrits d'une session, liste des sessions, entreprises et participants, réponses aux évaluations (**nominatives** : le nom du participant figure dans `reponses.csv`).
- **Tableau de bord** : émargements non signés, nominatifs.
- **Journal d'audit** : actions et connexions (`last_login_at`).
- **Vue formateur** : la liste des inscrits de ses sessions.
- À venir avec cet audit : l'alerte d'absence au référent (D6) et le statut d'abandon.

**Point d'attention** : les réponses aux questionnaires de satisfaction sont nominatives. Pour les salariés, il faut décider si on les **anonymise dans les exports** (seule la synthèse serait conservée), ce qui serait plus simple vis-à-vis du CSE.

### G2. Exports nominatifs 🟠

Ils sont réservés aux admins, mais **seul le ZIP est journalisé** (et l'export RGPD).

Proposition : journaliser chaque export CSV ou PDF (qui, quoi, filtres utilisés). Effort S.

---

## H. Accessibilité (P3)

### H1. Page d'émargement 🟠

- **Existant** : page responsive avec des libellés et des contrastes AA.
- **Manque** : une **alternative à la signature dessinée**. Aujourd'hui, seul le canevas est disponible, ce qui est difficile au clavier et avec un lecteur d'écran.
- **Proposition** : une case « Je certifie être présent(e) à cette demi-journée » associée au jeton nominatif. Elle est enregistrée avec la méthode `attestation_checkbox` et la même empreinte. Effort S.

### H2. Écrans internes 🟠

- **Existant** : structure des titres, libellés de formulaires, lien d'évitement, contrastes de la charte vérifiés.
- **Manque** : aucun audit RGAA outillé.
- **Proposition** : ajouter axe-core aux tests Playwright sur les écrans principaux. Effort M.

---

## I. Archivage et preuves (P2)

### I1. Dossier complet par session 🟠

- **Fichiers** : `src/app/admin/sessions/[id]/documents/zip/route.ts`.
- **Existant** : le ZIP contient la feuille d'émargement, les attestations et les évaluations en CSV.
- **Manque** :
  - le programme ;
  - les conventions ;
  - les **preuves d'envoi** (informations préalables, convocations) ;
  - les certificats de réalisation ;
  - les convocations PDF envoyées ;
  - un index.
- **Proposition** :
  - compléter le ZIP avec tous ces éléments ;
  - ajouter un `index.csv` des envois (date, destinataire, objet, identifiant Gmail, empreinte des pièces jointes) ;
  - le ZIP utilise les **documents figés** (I2).
- **Effort** : M.

### I2. Documents figés 🟠

- **Existant** : les convocations et attestations **envoyées** sont stockées (`documents.file_path`).
- **Manque** : le ZIP et la feuille d'émargement **régénèrent** les PDF à la volée. Une attestation du ZIP peut donc différer de celle qui a été envoyée.
- **Proposition** :
  - les téléchargements et le ZIP utilisent toujours le fichier stocké ;
  - une régénération crée une **nouvelle version** (`documents.version`) sans écraser l'ancienne ;
  - le SHA-256 est stocké pour chaque fichier.
- **Effort** : M.

---

## Plan de mise en œuvre proposé

Chaque lot est livré par une PR testée : tests unitaires des règles, tests d'intégration en base pour les triggers et la purge, tests e2e des parcours. Chaque migration est accompagnée de son script de descente (`down.sql`).

1. **P1 · Socle conformité**
   - A1, A2, A3 ;
   - B1, B2 (conventions et dérogation) ;
   - B4, B5 (nature de l'action).
2. **P1 · Émargement probant**
   - C2 (jetons par créneau, à usage unique) ;
   - C3 (absences, retards, motif) ;
   - C5 et C6 (ajout seul, empreintes, triggers, corrections) ;
   - C7 et I2 (PDF figés et empreinte) ;
   - C8 et H1 (mention RGPD, case d'attestation).
3. **P1 · Documents et données**
   - B3 (information préalable tracée) ;
   - B6 (certificat de réalisation) ;
   - B7 (export BPF) ;
   - E2, F1, F2, F3 (textes et pages légales) ;
   - E5 (durées multiples, gel, purges) ;
   - E7 (en-têtes et journal des exports), G2.
4. **P1 si périmètre Qualiopi, sinon P2 · Qualité**
   - D1 (champs et indicateurs) ;
   - D2, D3 (positionnement) ;
   - D5 (évaluation des acquis) ;
   - D6 (abandon et alerte) ;
   - D7, D12 (justificatifs) ;
   - D8 (handicap) ;
   - D9 (questionnaires entreprise et formateur) ;
   - D10, D11 (registres).
5. **P2 et P3**
   - I1 (dossier complet) ;
   - E6 (ZIP RGPD) ;
   - H2 (axe-core).

**Aucune donnée existante n'est supprimée.** Les migrations ajoutent des colonnes ou des tables. L'empreinte des émargements existants est calculée sans les modifier. Les présences corrigées par écrasement avant l'audit restent telles quelles ; leur historique est dans `audit_logs`.

---

## Points à trancher avant de coder

1. **Conventions (B2)** : téléversement de la convention signée seulement (proposé), ou génération du PDF par l'outil ?
2. **Dérogation (B2)** : qui peut la saisir ? Je propose l'admin seulement, avec un motif obligatoire.
3. **Jetons d'émargement (C2)** : un lien par demi-journée dans l'email du matin (proposé) ? Quelle marge autour du créneau ? Je propose 30 minutes avant et 60 minutes après.
4. **Corrections de présence (C5)** : le passage à « ajout seul » change l'écran de correction de l'admin. D'accord ?
5. **Rôle gestionnaire (E7)** : faut-il un rôle distinct de l'admin (par exemple sans accès aux paramètres ni aux données handicap) ?
6. **Durées de conservation (E5)** : les valeurs par défaut sont-elles validées ?
   - externes : 5 ans après la session ;
   - internes : départ + 5 ans ;
   - logs techniques : 1 an ;
   - jetons : 7 jours.
7. **Réponses aux questionnaires des salariés (G1)** : faut-il les anonymiser dans les exports ?
8. **BPF (B7)** : faut-il inclure les internes, avec un filtre ?
9. **Ordre des lots** : le plan ci-dessus vous convient-il ?

---

## Actions hors code

- **Registre des traitements** : le remplir à partir de l'inventaire E1, avec les finalités, les bases légales et les durées.
- **DPA** : les signer, ou vérifier leur acceptation, avec Vercel, Supabase et Google Workspace (E8).
- **Région Supabase** : vérifier qu'elle est bien dans l'UE (Project Settings › General).
- **Textes à rédiger ou valider** :
  - mention d'information courte et politique de confidentialité (E2, F2) ;
  - mentions légales (F1) ;
  - règlement intérieur (F3) ;
  - nom et contacts du référent handicap, du référent pédagogique et du référent administratif (D8, B3) ;
  - contact DPO.
- **CSE** : l'informer et le consulter sur les fonctionnalités de suivi des salariés listées en G1, avant la mise en service de l'émargement des internes.
- **Durées de conservation** (E5) : les valider, avec le DPO si possible.
- **Exigences des financeurs** : les vérifier pour chaque financeur (OPCO, CPF / EDOF, France Travail, Région), notamment le format du certificat de réalisation, les preuves d'assiduité et le délai de conservation.
- **Information publique Qualiopi** (D1) : vérifier sur **wiacademy.fr** la présence, pour chaque formation, des prérequis, objectifs, durée, délais d'accès, tarifs, contacts, méthodes, modalités d'évaluation et accessibilité, ainsi que la publication des indicateurs de résultats. C'est sur ce site que l'auditeur les contrôlera.
- **Délégation Gmail** : faire réaliser par un super-administrateur du Workspace la délégation `gmail.send` déjà demandée. Sans elle, aucune convocation ni information préalable ne part.

_Ce rapport est un support de vérification technique. Il ne remplace pas l'avis d'un juriste, du DPO ou de l'auditeur Qualiopi._
