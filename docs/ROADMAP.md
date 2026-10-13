# Feuille de route d'implémentation — Pubeka (MVP)

> Version 1 · 10 octobre 2026
> Le MVP découpé en **36 sessions**, regroupées en 10 phases. **Une session = une séance de travail avec un agent IA = une branche = une pull request**, qui se termine avec la CI au vert.
>
> Ce qui doit être construit : [PRD §12](produit/PRD.md) (fonctions F1 à F12) · comment le prouver : [TRD §17](produit/TRD.md) (critères d'acceptation du MVP) · comment l'écrire : [LLD](architecture/LLD.md), [CONVENTIONS](architecture/CONVENTIONS.md), [API_SPEC](architecture/API_SPEC.md), [TESTING](architecture/TESTING.md), [SECURITY_NOTES](architecture/SECURITY_NOTES.md).
>
> Légende : ⬜ à faire · 🔄 en cours · ✅ fusionnée · ❓ décision à prendre **avant** la session · 👤 action de ta part (compte, paiement, réglage), impossible pour un agent.

---

## Sommaire

1. [Règles d'une session](#1-règles-dune-session)
2. [Avancement](#2-avancement)
3. [Les phases et leurs sessions](#3-les-phases-et-leurs-sessions)
4. [Démarches en parallèle (hors code)](#4-démarches-en-parallèle-hors-code)
5. [Décisions à prendre et quand](#5-décisions-à-prendre-et-quand)
6. [Après le MVP](#6-après-le-mvp)
7. [Message de lancement d'une session](#7-message-de-lancement-dune-session)
8. [Mode continu : enchaîner les sessions jusqu'à la fin](#8-mode-continu--enchaîner-les-sessions-jusquà-la-fin)

---

## 1. Règles d'une session

1. **Une session ne commence que si la précédente dont elle dépend est fusionnée** (colonne « Après »).
2. **Taille** : S ≈ 10 fichiers, M ≈ 20, L ≈ 35. Au-delà de **40 fichiers ou 2 000 lignes** modifiés (hors fichiers générés), la session est coupée en deux.
3. **Toujours lire avant de coder** : [`CLAUDE.md`](../CLAUDE.md) (règles et périmètre de chaque session), [CONVENTIONS](architecture/CONVENTIONS.md), [LLD §2-3](architecture/LLD.md), puis les documents listés dans « Lire ».
4. **Le contrat d'abord** : une nouvelle route entre dans `api/openapi.yaml` avant le code ; une nouvelle table entre dans une nouvelle migration avant le code.
5. **« Fait quand » est vérifié, pas supposé** : commandes lancées, tests au vert, capture d'écran à 390 px et à 1280 px pour tout écran (règle du projet : rien n'est annoncé fonctionnel sans preuve à l'écran).
6. Branche `feat/sNN-sujet`, commits au format de CONVENTIONS §4, pull request qui cite la session (`S12`).
6 bis. **Cocher une session (⬜ → ✅) seulement quand elle est vraiment finie** (règles strictes : §8.1) : chaque « Fait quand » prouvé dans la PR **et** « CI terminée » au vert. La coche se fait dans la PR de la session et arrive dans `main` avec la fusion. Une PR dont la CI est rouge ne coche rien. Chaque coche a sa ligne dans [`JOURNAL.md`](JOURNAL.md).
7. **Hors périmètre = interdit** pendant la session. Un problème découvert ailleurs devient une note dans la PR, pas une correction en passant.
8. Interface : la session commence par charger la compétence de design du projet ; tout écran respecte le [design system](design/DESIGN-SYSTEM.md).

---

## 2. Avancement

| Phase | Sessions | État |
|---|---|---|
| 0. Socle du dépôt | S01-S03 | ✅ ✅ ✅ |
| 1. Base, authentification, API | S04-S07 | ✅ ✅ ✅ ⬜ |
| 2. Interface de base | S08-S09 | ⬜ ⬜ |
| 3. Meta | S10-S12 | ⬜ ⬜ ⬜ |
| 4. Agents et création de campagne | S13-S16 | ⬜ ⬜ ⬜ ⬜ |
| 5. Vie de la campagne | S17-S19 | ⬜ ⬜ ⬜ |
| 6. Images | S20-S23 | ⬜ ⬜ ⬜ ⬜ |
| 7. Argent | S24-S26 | ⬜ ⬜ ⬜ |
| 8. Notifications, support, Optimiseur | S27-S29 | ⬜ ⬜ ⬜ |
| 9. Administration, site public, lancement | S30-S36 | ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ |

**Chemin le plus court vers une première campagne publiée depuis Pubeka** : S01 → S02 → S03 → S04 et S05 → S06 → S08 → S09 → S11 → S13 → S14 → S15 → S16, avec **S10 (portage Meta) en parallèle dès S02**. C'est la preuve la plus importante (TRD §17, critère 1) : à viser en premier.

---

## 3. Les phases et leurs sessions

### Phase 0 — Socle du dépôt

#### S01 · Squelette du monodépôt · M · après : —
- **But** : un dépôt pnpm + Turborepo qui s'installe, se vérifie et se construit, avec l'aiguillage des domaines.
- **Lire** : LLD §1-3 et §2.2 · CONVENTIONS §1-3 · ENV_SETUP §3-4 · CI_CD §9.1.
- **Livrables** : `package.json` racine (`packageManager`, scripts de CI_CD §9.1, ceux qui n'ont rien à faire réussissent à vide), `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.npmrc`, `.editorconfig`, `.gitattributes` ; `packages/config` (tsconfig, ESLint, Prettier) ; `apps/web` en Next **16.3.6** sur le port **5173** avec `proxy.ts` (site / console / admin, LLD §2.2) et deux pages vides ; paquets vides de LLD §2.1 avec leur `src/index.ts` ; `db/` déplacé dans `supabase/` (LLD D6) ; `.claude/launch.json` pointant sur `pnpm dev`, port 5173 ; chemins de `CLAUDE.md` §8 mis à jour.
- **Fait quand** : `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build` passent ; `localhost:5173` et `app.localhost:5173` affichent deux pages différentes ; `/console`, `/site` et `/admin` en accès direct répondent 404 ; la CI passe au vert sur la PR (son contrôle « Monodépôt présent ? » trouve `pnpm-workspace.yaml`).
- **Hors périmètre** : toute fonction ; retrait de l'ancien code AdFacile (S12).

#### S02 · Briques partagées et contrat · M · après : S01
- **But** : les fondations que tout le reste utilise.
- **Lire** : LLD §6.2, §6.16 · API_SPEC §3-5 · ENV_SETUP §1.12.
- **Livrables** : `packages/shared` (`env.ts` validé par Zod avec les 4 règles d'ENV_SETUP §1.12, `Money` en entiers, dates et fuseaux, identifiants, `logger` avec masquage) ; `packages/contracts` (types générés depuis `openapi.yaml`, `ErrorCode`, `ERROR_STATUS`, `AppError`) ; scripts `api:types`, `openapi:lint`, `test:coverage` avec les seuils de TESTING §4.1.
- **Fait quand** : test qui compare `ErrorCode` du code à l'énumération d'OpenAPI ; `env.ts` refuse `sk_test_` en production et `PUBEKA_FAKE_PROVIDERS` en production (tests) ; couverture ≥ 80 % sur `shared`.
- **Hors périmètre** : base, routes.

#### S03 · Base de données : migration 0003 et module `db` · M · après : S02
- **But** : combler les écarts entre l'API et la base, puis donner l'accès typé à la base.
- **Lire** : LLD §10 (E1 à E10) · DATA_MODEL · SECURITE-BACKEND §2 · SECURITY_NOTES §6.
- **Livrables** : `supabase/config.toml`, `seed.sql` ; migration `0003_api_support.sql` : `analyses` (E1), `api_idempotency_keys` (E2), `private.webhook_events` (E3), libération partielle des crédits et retour en bonus après la période (E4), `private.hit_rate_limit` (E7), `private.transfer_ownership` (E8), `campaigns.version` (E9), **création du profil, de l'espace de travail, du membre `owner` et du code de parrainage à l'inscription** (E10 : aucun déclencheur aujourd'hui ; **l'essai n'est pas créé ici**, il démarre au clic en S24) ; `packages/db` (clients utilisateur et service, types générés, premiers dépôts) ; `DATA_MODEL.md` regénéré.
- **Fait quand** : tests PGlite des nouveaux objets (accès croisé, ajout seul, crédits partiels, bonus) + les 44 existants au vert ; `supabase db reset` passe en local ; `pnpm db:types` sans différence.
- **Hors périmètre** : routes HTTP.

### Phase 1 — Base, authentification, API

#### S04 · Connexion et inscription · M · après : S03 · ❓ CAPTCHA (D-1) · 👤 identifiants Google et Apple
- **But** : un utilisateur peut créer un compte, se connecter, se déconnecter.
- **Lire** : APPFLOW §4 · SECURITE-BACKEND §3 · SECURITY_NOTES §5.1 · TRD TR-SEC-13, TR-SEC-14, TR-PLT-04.
- **Livrables** : écrans `/inscription`, `/connexion`, `/mot-de-passe-oublie` (sans habillage final) ; `auth/callback` ; session `@supabase/ssr` dans `proxy.ts` ; e-mail, lien magique, Google, Apple ; CAPTCHA ; blocage après 5 échecs par e-mail + IP (EC-AUTH-04) ; déconnexion après 10 min d'inactivité avec alerte (TR-SEC-13) ; salutation selon le fuseau (TR-PLT-04).
- **Fait quand** : tests EC-AUTH-01 à 06 ; test unitaire de la salutation dans 3 fuseaux ; inscription par e-mail réelle sur la pile locale avec capture.
- **Hors périmètre** : première configuration (S09).

#### S05 · Couche HTTP commune · M · après : S03
- **But** : l'enveloppe `api()` et toutes ses protections, une fois pour toutes.
- **Lire** : LLD §5, §6.1-6.3 · API_SPEC §2-11 · SECURITY_NOTES §2.7, §3.1.
- **Livrables** : `server/http/` (`api()`, `problem()`, contrôle d'`Origin`, limites de débit, idempotence, SSE) ; `server/auth/` ; `packages/testing` (horloge, constructeurs, fabriques, `seedWorkspace`, `seedAdmin`) ; scripts `test:int`, `test:routes-coverage`, `ci:env` ; routes `/public/*` et `/me`.
- **Fait quand** : tests de `api()` (ordre des contrôles, 401, 403, 404, 400, 429, idempotence rejouée / réutilisée) ; routes `/public/*` et `/me` avec leurs 5 cas ; couverture ≥ 90 % sur `server/http`.
- **Hors périmètre** : routes d'espace de travail (S06).

#### S06 · Espaces de travail et équipe · M · après : S05
- **But** : espaces, membres, rôles, invitations, transfert de propriété.
- **Lire** : SECURITY_NOTES §2.1-2.2, §5.2 · API_SPEC §14 « Espaces et équipe ».
- **Livrables** : cas d'usage dans `core/workspaces` ; routes `/workspaces`, `members`, `invitations`, `invitations/accept`, `transfer-ownership` ; e-mail d'invitation (texte simple en attendant S27).
- **Fait quand** : les 5 cas par route ; EC-TEAM-01 à 07 ; limite de membres par formule.
- **Hors périmètre** : écrans d'équipe (S09).

#### S07 · Préproduction en ligne · S · après : S05 · 👤 projets Supabase dev, Vercel, Trigger.dev Hobby, domaine de préproduction
- **But** : chaque fusion dans `main` se retrouve en ligne, en préproduction, automatiquement.
- **Lire** : CI_CD §4, §9 · ENV_SETUP §2.
- **Livrables** : réglages CI_CD §9.1-9.3 ; `apps/web/vercel.json` ; tests `e2e:smoke` (page publique, connexion, `/api/v1/public/maintenance`) ; `PUBEKA_PIPELINE_ENABLED=true`.
- **Fait quand** : une fusion déclenche `deploy-staging.yml` jusqu'au bout ; l'adresse de préproduction répond ; une migration vide de test est appliquée sur le projet de développement.
- **Hors périmètre** : mise en production (S36).

### Phase 2 — Interface de base

#### S08 · Design system en composants · M · après : S01
- **But** : `packages/ui` utilisable par tous les écrans.
- **Lire** : DESIGN-SYSTEM · `docs/design/pubeka-design-system.html` · `docs/design/loader/` · TRD TR-PRF-04, TR-PRF-09, TR-ACC-03.
- **Livrables** : jetons (couleurs, Sora, rayons, clair et sombre), composants shadcn habillés, loader « Saisie » en React (complet une fois par session, court seulement au-delà de 300 ms), composants Montant, Badge de statut, Carte de modèle.
- **Fait quand** : page de démonstration interne qui montre chaque composant ; contrôle axe sans erreur ; captures clair et sombre à 390 et 1280 px ; « réduire les animations » respecté.
- **Hors périmètre** : écrans métier.

#### S09 · Coque de l'application et première configuration · M · après : S04, S06, S08
- **But** : l'application a sa navigation, ses deux langues, ses réglages de base.
- **Lire** : APPFLOW §2, §5, §14 · LLD §7.1, §7.5.
- **Livrables** : `next-intl` FR/EN et `i18n:check` ; coque (barre latérale, onglets en bas sur téléphone, bandeau, carte utilisateur, sélecteur de Page vide) ; TanStack Query, `nuqs`, magasins Zustand ; `/bienvenue/{etape}` ; `/reglages/profil`, `/reglages/equipe`, `/reglages/notifications` (préférences) ; habillage final des écrans de S04.
- **Fait quand** : parcours P1 (TESTING §3.4) au vert ; bascule de langue sans texte en dur (TR-PLT-03) ; captures 360, 390, 768 et 1280 px sans défilement horizontal (TR-PLT-01).
- **Hors périmètre** : écrans Meta.

### Phase 3 — Meta

#### S10 · Portage du connecteur Meta · L · après : S02
- **But** : la logique AdFacile qui crée réellement des campagnes, en TypeScript, **sans changer son comportement**.
- **Lire** : ARCHITECTURE §4 (reprise de l'existant), §6 · LLD §6.13-6.14 · `backend/src/services/facebookAdsService.js`, `campaignController.js`, `facebookErrors.js`, `messagingDestinations.js` et leurs tests · `docs/meta/`.
- **Livrables** : `packages/platforms/meta` (connecteur, erreurs Meta traduites en codes Pubeka, chiffrement des jetons) ; tests AdFacile portés ; `FakeMetaConnector` + suite de contrat commune ; connecteurs `google` et `tiktok` « indisponibles ».
- **Fait quand** : **tous les tests AdFacile portés passent** (TR-PLA-02) ; tests du chiffrement (rotation des clés) ; la suite de contrat passe sur la fausse implémentation.
- **Hors périmètre** : écrans, routes (S11).

#### S11 · Connexion Meta, Pages, kit de marque · M · après : S09, S10 · 👤 application Meta en mode développement
- **But** : un client relie son compte Meta et voit si tout est prêt.
- **Lire** : APPFLOW §6 · API_SPEC §14 « Meta » · SECURITY_NOTES §2.3, §5.3 · PRD F1, F2.
- **Livrables** : routes `meta/connect`, `meta/callback` (paramètre `state` signé), connexions, bilan de santé (F1), Pages (limite de la formule, verrouillage de la Page pour la période), comptes publicitaires, kit de marque (F2) ; webhook Meta (vérification + événements de statut) ; écrans `/bienvenue/meta`, `/reglages/comptes-meta`, `/reglages/pages`, `/reglages/kit-de-marque`.
- **Fait quand** : 5 cas par route ; tests de signature du webhook (TR-SEC-04) ; connexion réelle avec un compte Meta de test, bilan de santé affiché (capture).
- **Hors périmètre** : publication (S15).

#### S12 · Retrait de l'ancien code AdFacile · S · après : S10
- **But** : un dépôt sans code mort.
- **Lire** : LLD §2.3.
- **Livrables** : suppression de `src/`, `backend/`, `index.html`, `vite.config.ts`, fichiers Docker, `nginx.conf`, `render.yaml`, ancien `public/`, `logs/`, `tmp/`, `supabase/snippets/` ; ancien `vercel.json` racine remplacé.
- **Fait quand** : pour chaque élément, preuve qu'il n'est plus utilisé (recherche dans le code) ; CI au vert.
- **Hors périmètre** : tout le reste.

### Phase 4 — Agents et création de campagne

#### S13 · Tâches de fond et moteur des agents · M · après : S05 · ❓ passerelle IA (D-2)
- **But** : faire tourner une tâche et appeler un agent proprement.
- **Lire** : LLD §6.10 · ARCHITECTURE §7, §8.4, §10 · TESTING §6.1 · docs/agents/README.
- **Livrables** : `jobs/` (configuration Trigger.dev, files, `InlineJobDispatcher`, une tâche d'exemple) ; `packages/agents/runtime` (`runAgent`, validation + un seul nouvel essai, `wrapUntrusted`, `detectInjection`, journal `agent_runs`) ; `FakeAiGateway` ; prompts déplacés de `bench/prompts` vers `packages/agents` ; `bench/run.mjs` qui échoue sous les seuils.
- **Fait quand** : TR-AGT-01 (jamais un 3ᵉ appel) ; tâche d'exemple lancée en `inline` et en `trigger dev` ; banc des agents vert dans la CI.
- **Hors périmètre** : agents métier eux-mêmes (S14).

#### S14 · Sources et Analyste · M · après : S13
- **But** : coller un lien ou une photo et obtenir la fiche du commerce et ses questions.
- **Lire** : APPFLOW §8.0-8.2 · docs/agents/01 · SECURITY_NOTES §3.3, §5.7 · LLD §6.11.
- **Livrables** : route `uploads` (URL signée, vrai type par les premiers octets, ré-encodage des images) ; lecture des sources avec `assertPublicUrl` et Jina en secours ; agent Analyste ; routes `analyses`, `answers` ; tâche d'analyse ; écrans Sources et Questions de l'assistant de campagne.
- **Fait quand** : EC-SRC-01 à 07 ; TR-SEC-08 ; produit illégal arrêté avant toute dépense (TR-AGT-06) ; analyse réelle d'un site avec capture.
- **Hors périmètre** : proposition (S15).

#### S15 · Proposition et brouillon de campagne · M · après : S14
- **But** : la proposition complète du Stratège, modifiable.
- **Lire** : APPFLOW §8.3 · docs/agents/02 · PRD §7 · SECURITY_NOTES §3.2 (budget, dates, textes), EC-TEAM-08.
- **Livrables** : agent Stratège avec affichage progressif (SSE) ; routes `campaigns` (création, lecture, modification avec `version`), `proposals`, `choose` ; machine d'état des campagnes ; montants en FCFA et en dollars, TVA par pays ; écran Proposition (modifier, autre proposition, onglets).
- **Fait quand** : 100 % des transitions de campagne testées ; conflit de version → `409` ; premiers mots affichés en moins de 3 s (mesure) ; capture.
- **Hors périmètre** : publication (S16), visuel (S23).

#### S16 · Aperçu et publication · L · après : S11, S15
- **But** : publier une vraie campagne chez Meta depuis Pubeka.
- **Lire** : APPFLOW §8.5-8.6 · LLD §6.8 · SECURITY_NOTES §5.3-5.4 · PRD F3, F6.
- **Livrables** : aperçu multi-emplacements (F3), estimation (F6), clause de responsabilité ; route `publish` (quota, transaction, idempotence) ; tâche `campaign.publish` avec rapprochement des résultats ambigus (EC-META-05) ; pause, reprise, relance (F9).
- **Fait quand** : EC-CAMP-01 à 09 ; TR-PLA-08, TR-PLA-09, TR-PLA-10 ; **une campagne réelle publiée sur le compte publicitaire de test** (TRD §17, critère 1) ; parcours P2 au vert.
- **Hors périmètre** : statistiques (S17).

### Phase 5 — Vie de la campagne

#### S17 · Statuts et statistiques · M · après : S16
- **But** : voir ce que fait la pub, à jour, sans recharger.
- **Lire** : APPFLOW §7, §11 · PRD §10 · ARCHITECTURE §6, §10 · LLD §7.3.
- **Livrables** : synchronisation des statuts (webhook + toutes les 15 min) ; statistiques toutes les heures + « Actualiser » ; Realtime vers le cache ; tableau de bord `/` et bandeau ; page de campagne (Résultats, Pubs, Réglages, Historique) ; résultat traduit en argent (F7).
- **Fait quand** : TR-PLA-05, TR-PLA-06 ; EC-META-08 à 10 ; mise à jour à l'écran sans rechargement (capture avant / après).
- **Hors périmètre** : Optimiseur (S29).

#### S18 · Refus et Modérateur · M · après : S17
- **But** : un refus expliqué et corrigé en un clic (F4).
- **Lire** : APPFLOW §12 · docs/agents/04 · PRD §4.5.
- **Livrables** : agent Modérateur (seulement après un refus) ; routes `rejections`, `apply-fix` (sans quota) ; écran du rapport de refus ; refus partiel en test A/B (EC-META-06).
- **Fait quand** : republication sans quota (EC-CAMP-07) ; banc des agents vert sur `rejections.json`.
- **Hors périmètre** : —

#### S19 · Lecture seule et accès selon l'état de l'espace · S · après : S16
- **But** : grâce, lecture seule, suspension, fin d'essai, appliquées partout.
- **Lire** : SECURITY_NOTES §2.1 et décisions §6 · APPFLOW §19 · TRD TR-PAY-07.
- **Livrables** : `workspaceAccess()` ; `writable` vérifié sur toutes les routes existantes ; bandeaux ; pause toujours permise.
- **Fait quand** : parcours P5 au vert ; test qui liste les routes d'écriture et vérifie que seules les actions ✱ échappent à la lecture seule.
- **Hors périmètre** : paiement (S25).

### Phase 6 — Images

#### S20 · Catalogue, aiguilleur, prix en crédits · M · après : S03
- **But** : savoir quel modèle utiliser et combien de crédits il coûte.
- **Lire** : ARCHITECTURE §8.3, §9 · catalogue-modeles · capacites-medias · rapports/calcul-credits · LLD §6.4, §6.6.
- **Livrables** : `packages/media` (catalogue, `creditsFor`, `thresholdFromMargin`, `chooseModel`, `shouldOfferFallback`, état des fournisseurs et budget de 15 $) ; route `/media-models`.
- **Fait quand** : tests à valeurs fixes de TESTING §5.5 ; couverture ≥ 95 % sur `pricing` et `router`.
- **Hors périmètre** : appels aux fournisseurs (S21).

#### S21 · Générations · L · après : S13, S20 · 🧪 signature des webhooks Higgsfield
- **But** : générer des images de bout en bout, sans jamais facturer deux fois.
- **Lire** : ARCHITECTURE §8.4-8.6 · LLD §6.5, §6.7 · SECURITY_NOTES §5.5 · TESTING §6.
- **Livrables** : clients fal et Higgsfield + `FakeMediaProvider` (suite de contrat commune) ; routes `generations`, `cancel`, `fallback` ; réservation, consommation, libération partielle ; webhooks fal (ED25519) et Higgsfield ; copie immédiate dans le stockage privé ; tâche de reprise des générations bloquées ; ménage des fichiers après 7 jours (TR-DON-02).
- **Fait quand** : EC-CRED-01 à 11 ; TR-MED-08, TR-MED-10 ; TR-DON-04 ; une génération réelle par fournisseur (capture).
- **Hors périmètre** : calques et Designer (S22).

#### S22 · Designer et calques · L · après : S21 · ❓ moteur de rendu (D-3, tranché dans la session)
- **But** : la scène par l'IA, le texte par notre code.
- **Lire** : ARCHITECTURE §8.2 · docs/agents/03 · LLD §6.15 · TRD TR-MED-02 à 04.
- **Livrables** : essai Satori + resvg contre sharp sur 3 mises en page, choix écrit dans ARCHITECTURE §19 ; `renderVisual` ; agent Designer (`VisualSpec`) ; détourage du produit ; formats 4:5, 9:16, 1:1, 1.91:1 ; modification de texte instantanée et gratuite ; modification de scène (C3).
- **Fait quand** : TR-MED-02 (photo jamais redessinée), TR-MED-03 (0 crédit, aucun appel fournisseur), TR-MED-04 (zones Stories) ; EC-CRED-13.
- **Hors périmètre** : écrans (S23).

#### S23 · Écrans des visuels · M · après : S22
- **But** : choisir un modèle, attendre sans stress, retrouver ses visuels.
- **Lire** : APPFLOW §9-10 · `docs/design/prototype-choix-modele.html` · TRD TR-MED-05, TR-PRF-06, TR-PRF-07.
- **Livrables** : écran « Créer un visuel » (usage, modèle recommandé, 2 niveaux, coût affiché avant) ; attente (visuels un par un, position, bascule après 60 s) ; atelier `/visuels` ; étape Visuel de l'assistant de campagne ; « 3 autres » et « similaire ».
- **Fait quand** : parcours P3 au vert ; captures de chaque état (attente, partiel, refusé, expiré).
- **Hors périmètre** : —

### Phase 7 — Argent

#### S24 · Formules, crédits, essai · M · après : S06
- **But** : chaque espace a une formule, des crédits et des limites justes.
- **Lire** : plans-et-credits · ARCHITECTURE §9 · TRD TR-PAY-01 à 04, TR-PAY-10.
- **Livrables** : `packages/billing` (montants, `upgradeQuote`, `workspaceAccess`, TVA, change) ; attribution et expiration mensuelles (tâche quotidienne) ; essai (1 campagne, 3 visuels, 7 jours) ; routes `billing`, `credits/ledger` ; écran `/abonnement`.
- **Fait quand** : couverture ≥ 95 % sur `billing` ; tests à valeurs fixes (upgrade Starter → Pro = 7 000 XAF et +5 crédits) ; EC-PAY-09, 10, 13.
- **Hors périmètre** : SasPay (S25).

#### S25 · Paiement SasPay · L · après : S24 · 👤 compte marchand SasPay (clés de test) et secret du webhook
- **But** : payer une formule ou des crédits par Mobile Money ou carte.
- **Lire** : ARCHITECTURE §9.1 · LLD §6.9 · API_SPEC §7, §12 · SECURITY_NOTES §5.6 · ENV_SETUP §1.5.
- **Livrables** : client SasPay ; route `checkout` (montant calculé par le serveur, frais, idempotence, une seule session en attente) ; webhook SasPay (HMAC sur horodatage et corps) ; `onPaymentConfirmed` (relecture chez SasPay) ; passage à une formule supérieure ; achat de crédits ; écran « Paiement en cours de vérification » ; vérification planifiée des paiements sans webhook ; reçu par e-mail.
- **Fait quand** : TR-SEC-05, TR-PAY-05, TR-PAY-08 ; EC-PAY-01 à 07 ; parcours P4 au vert ; **un paiement réel en clé `sk_test_` active un abonnement** (TRD §17, critère 3).
- **Hors périmètre** : preuves de paiement (S26).

#### S26 · Preuves de paiement, parrainage, rappels · M · après : S25
- **But** : les chemins de secours et de croissance autour du paiement.
- **Lire** : APPFLOW §15.5-15.6, §18 · TRD TR-PAY-06, TR-PAY-11.
- **Livrables** : route `payment-proofs` (+ ticket « Paiement ») ; parrainage (2 + 2 crédits au premier paiement du filleul) ; rappels J-3, J-1, J0 et fin de grâce ; écrans `/abonnement/preuve`, `/parrainage`.
- **Fait quand** : TR-PAY-11 ; EC-PAY-08, 12 ; tâches de rappel lancées avec une horloge fixée.
- **Hors périmètre** : traitement des preuves par l'administration (S31).

### Phase 8 — Notifications, support, Optimiseur

#### S27 · Notifications et e-mails · M · après : S09 · 👤 domaine d'envoi vérifié chez Resend (DNS)
- **But** : la cloche et les e-mails FR/EN, selon les préférences.
- **Lire** : ARCHITECTURE §11 · APPFLOW §16 · TRD TR-NOT-01 à 03.
- **Livrables** : `packages/notifications` (catalogue d'événements, modèles `react-email` FR/EN, envoi Resend, cloche) ; webhook Resend ; séquence de bienvenue J1, J3, J6 ; résumé du lundi ; remplacement des e-mails provisoires des sessions précédentes.
- **Fait quand** : TR-NOT-01 à 03 ; préférences respectées (test) ; e-mails reçus dans la boîte de test (captures FR et EN).
- **Hors périmètre** : —

#### S28 · Support et bulle d'aide · M · après : S27, S13
- **But** : obtenir de l'aide sans quitter l'application.
- **Lire** : APPFLOW §17 · docs/agents/06 · TRD TR-SUP-01.
- **Livrables** : routes `tickets` et messages, pièces jointes ; agent Assistant avec l'état du compte (SSE) ; bulle d'aide sur tous les écrans ; écrans `/support`.
- **Fait quand** : TR-SUP-01 ; l'Assistant propose un ticket quand il ne sait pas (test) ; banc vert.
- **Hors périmètre** : réponse depuis l'administration (S31).

#### S29 · Optimiseur et statistiques premium · M · après : S17
- **But** : des suggestions chiffrées, appliquées seulement si le client le veut.
- **Lire** : APPFLOW §13 · docs/agents/05 · PRD §10.3, F8, F10 · PRD §14 (T6).
- **Livrables** : agent Optimiseur (tâche quotidienne, Pro et Business) ; routes `recommendations` ; page `/statistiques` (comparaison avec l'historique, export PDF et CSV protégé contre les formules) ; F10 seulement si le test T6 (Ad Library pour l'Afrique) est concluant.
- **Fait quand** : TR-AGT-08 ; protection CSV testée (SECURITY_NOTES §4).
- **Hors périmètre** : —

### Phase 9 — Administration, site public, lancement

#### S30 · Administration : accès et clients · M · après : S06
- **But** : une administration invisible et sûre.
- **Lire** : ARCHITECTURE §13 · APPFLOW §20 · SECURITY_NOTES §2.6 · TRD TR-SEC-06, TR-ADM-01, TR-ADM-02.
- **Livrables** : chemin secret, `requireAdmin` (aal2, verrouillage), enrôlement TOTP, journal ; utilisateurs, fiche client, « voir comme le client » en lecture seule, suspendre, changer de formule, prolonger, offrir ou retirer des crédits.
- **Fait quand** : parcours P7 au vert ; EC-ADM-01, EC-ADM-03 ; chaque action écrit une ligne dans `audit.admin_log`.
- **Hors périmètre** : réglages (S31).

#### S31 · Administration : réglages et traitements · M · après : S30, S26, S28, S21
- **But** : piloter Pubeka sans redéployer.
- **Lire** : ARCHITECTURE §13 · TRD TR-ADM-03, TR-ADM-05, TR-DSP-03, TR-SUP-02.
- **Livrables** : preuves de paiement, réponses aux tickets, catalogue de modèles et niveaux, routage, budgets des fournisseurs, TVA, forçage du taux de change, paramètres, **mode maintenance** (webhooks toujours traités, EC-ADM-02), coûts et marges, bibliothèque de références.
- **Fait quand** : chaque réglage pris en compte sans redéploiement (test) ; EC-ADM-02.
- **Hors périmètre** : —

#### S32 · Site public · L · après : S08
- **But** : un site rapide, bilingue, bien référencé.
- **Lire** : ARCHITECTURE §14 · APPFLOW §3 · rapports/mots-cles-seo · DESIGN-SYSTEM · TRD §13.
- **Livrables** : accueil (champ « Colle le lien de ton site »), fonctionnement, tarifs, pages pays, GSAP + Lenis ; métadonnées, Open Graph, données structurées, `sitemap.xml`, `robots.txt`, hreflang.
- **Fait quand** : LCP < 2,5 s, INP < 200 ms, CLS < 0,1 mesurés (TRD §18) ; captures 390 et 1280 px.
- **Hors périmètre** : aide et blog (S33).

#### S33 · Aide, blog et pages légales · M · après : S32, S31 · 👤 relecture juridique
- **But** : les contenus publics exigés par Meta et utiles au référencement.
- **Lire** : ARCHITECTURE §14, §16 · SECURITY_NOTES §4 (Markdown nettoyé).
- **Livrables** : guides d'aide publics, blog (Markdown nettoyé, édition depuis l'administration), confidentialité, conditions d'utilisation, **URL de suppression des données**.
- **Fait quand** : pages légales en ligne en préproduction (TRD §17, critère 6, après relecture) ; test de nettoyage du Markdown.
- **Hors périmètre** : —

#### S34 · Compte : hors connexion, export, suppression · M · après : S09, S16
- **But** : les droits du client sur ses données, même avec un réseau instable.
- **Lire** : LLD §7.6 · SECURITY_NOTES §5.8-5.9 · TRD TR-PLT-08, TR-DON-05.
- **Livrables** : file hors connexion et bandeau ; export des données ; suppression du compte (transfert de propriété proposé d'abord, EC-TEAM-06) ; changement d'e-mail ; écran `/reglages/mes-donnees`.
- **Fait quand** : parcours P6 au vert ; EC-OFF-01 à 03, EC-DEL-01 à 03.
- **Hors périmètre** : —

#### S35 · Durcissement · M · après : toutes les sessions de code
- **But** : passer la barre de sécurité, de performance et d'accessibilité.
- **Lire** : SECURITE-BACKEND · SECURITY_NOTES · TRD §3, §5, §14-15 · TESTING §8.
- **Livrables** : CSP avec nonce, en-têtes ; vérification des limites de débit ; Sentry et PostHog avec masquage ; audit d'accessibilité ; mesures de performance du tableau de bord ; essai d'intrusion de l'administration ; tests de sécurité de la base relancés **sur le vrai projet Supabase de développement** (SECURITE-BACKEND §11).
- **Fait quand** : liste TESTING §8 cochée sauf ce qui demande la production ; aucun avertissement du conseiller de sécurité Supabase.
- **Hors périmètre** : nouvelles fonctions.

#### S36 · Mise en production · S · après : S35 · 👤 démarches du §4 terminées
- **But** : le MVP chez les clients.
- **Lire** : CI_CD §5, §9 · TRD §17 · TESTING §8.
- **Livrables** : variables de production (ENV_SETUP §2), Supabase Pro, première exécution de `release.yml`, vérification post-lancement.
- **Fait quand** : **les 8 critères de TRD §17 sont vrais**, chacun avec sa preuve.
- **Hors périmètre** : —

---

## 4. Démarches en parallèle (hors code)

Certaines prennent **des semaines** : à lancer tôt, pendant que le code avance.

| Démarche 👤 | Nécessaire pour | Lancer au plus tard |
|---|---|---|
| Immatriculation de l'entreprise (Cameroun) | vérification Meta, compte SasPay | **maintenant** |
| Vérification du Business Manager Meta | App Review, production | dès l'immatriculation |
| **App Review Meta** (`ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`…) avec vidéo de démonstration | production (TRD §17, critère 5) | dès que S16 et S17 sont fusionnées (il faut montrer le parcours qui fonctionne) |
| Compte marchand SasPay (vérification d'identité) | S25 (test), S36 (production) | avant S25 |
| Projets Supabase dev et production, Vercel, Trigger.dev (**offre gratuite pour l'instant**, projet créé le 12/10/2026 ; **Hobby 10 $/mois** à prendre au plus tard à S13 : environnement staging, plus de 10 tâches planifiées — ARCHITECTURE §2) | S07, S13 | avant S07 ; Hobby avant S13 |
| Identifiants Google OAuth et Apple (compte développeur Apple, payant) | S04 | avant S04 |
| Domaine d'envoi Resend (enregistrements DNS) | S27 | avant S27 |
| Clés fal et Higgsfield (budget 15 $/mois chacun) | S21 | avant S21 |
| Comptes Sentry, PostHog (région Europe) | S35 | avant S35 |
| Relecture juridique des pages légales | S33, S36 | dès la fin de S33 |
| Tests produit T1 à T9 (PRD §14) | S22 (T2, T3), S29 (T6), S36 | au fil des sessions concernées |

---

## 5. Décisions à prendre et quand

| # | Décision | À prendre avant | Ce qui se passe sinon |
|---|---|---|---|
| D-1 | ✅ CAPTCHA : **Cloudflare Turnstile** (décidé le 12/10/2026) | S04 | S04 commence sans CAPTCHA et l'ajoute dans S35 |
| D-2 | Passerelle IA texte : OpenRouter ou Vercel AI Gateway | S13 | **S13 bloquée** |
| D-3 | Moteur de rendu des calques : Satori + resvg ou sharp | pendant S22 (essai sur 3 mises en page) | — |
| D-4 | Valider les choix 🔶 du LLD (D1-D9), de CONVENTIONS, d'ENV_SETUP, de TESTING et de CI_CD | S01 | S01 les applique tels quels |
| D-5 | Plafond quotidien de générations | S35 (après mesure des coûts réels) | valeur provisoire dans l'administration |
| D-6 | Domaine de préproduction (ex. `staging-app.pubeka.com`) | S07 | adresse générée par Vercel, qui change |

---

## 6. Après le MVP

| Version | Contenu | Remarque |
|---|---|---|
| V2 | Vidéo IA (Wan 3.0, Seedance 2.5 ; BytePlus) | les sessions suivront le même découpage : catalogue → générations → écrans |
| V2 | Google Ads, puis TikTok Ads | un connecteur par session, sur l'interface `PlatformConnector` |
| V2 | Statistiques comparées à la moyenne du secteur (F8) | |
| V3 | Application mobile native | sur la même API `/api/v1` |

---

## 7. Message de lancement d'une session

À copier au début de chaque séance avec un agent IA, en remplaçant `SNN` :

```
Session SNN de docs/ROADMAP.md.
1. Lis CLAUDE.md en entier, puis docs/ROADMAP.md §1 et la fiche de la session SNN, puis chaque document de « Lire ».
2. Vérifie que les sessions de « Après » sont fusionnées et que les décisions ❓ de la fiche sont prises. Sinon, arrête-toi et dis-moi ce qui manque.
3. Crée la branche feat/sNN-<sujet>. Contrat (openapi.yaml) et migration d'abord, puis code, puis tests.
4. Ne modifie que les chemins de SNN dans CLAUDE.md §5. Charge les compétences de CLAUDE.md §6 avant de coder.
5. Termine quand tout « Fait quand » est prouvé : commandes lancées, tests au vert, captures 390 et 1280 px pour les écrans.
6. Ouvre la pull request, coche SNN dans ROADMAP §2, et liste ce que tu as remarqué hors périmètre.
```

---

## 8. Mode continu : enchaîner les sessions jusqu'à la fin

Pour ne pas relancer l'agent à chaque session. Un agent **chef de projet** fait les sessions **une par une, dans l'ordre**, confie chacune à un **sous-agent neuf** (contexte vierge, comme une nouvelle conversation), vérifie le travail, fusionne, coche, écrit le journal, puis passe à la suivante. Il ne te sollicite que pour les cas du §8.4.

### 8.1 Règles strictes (aucune exception)

1. **Ordre strict : S01, S02, S03… S35.** Jamais de session sautée, jamais de phase sautée, jamais deux sessions en même temps. L'ordre des numéros respecte toutes les dépendances « Après » (vérifié le 12/10/2026).
2. **Une session commence seulement quand la précédente est ✅** (fusionnée, CI verte, journal écrit).
3. **Une session bloquée bloque la suite** : on ne passe pas à la suivante « en attendant ». Le chef de projet résout le blocage (§8.3) ou te pose la question (§8.4), puis reprend **la même** session.
4. **Coche ✅ = preuve complète** : chaque « Fait quand » prouvé dans la PR et « CI terminée » au vert. Jamais de coche partielle, jamais « presque fini ».
5. **Interdit pour faire passer la CI** : désactiver, ignorer ou supprimer un test ; baisser un seuil de couverture ; ajouter `--no-verify`, `skip`, `only`, `continue-on-error` ou un `// eslint-disable` sans raison ; modifier une migration existante ; sortir du périmètre de la session pour contourner le problème.
6. Le périmètre de la session (CLAUDE.md §5) est respecté à la lettre ; les fichiers modifiés sont comparés au tableau avant la fusion.

### 8.2 Le cycle d'une session

1. **Prendre** la session suivante dans l'ordre.
2. **Confier** la session à un sous-agent neuf avec le message du §7. Le sous-agent ne fusionne jamais et ne pose pas de question à la personne : s'il est bloqué, il s'arrête et rend la raison au chef de projet.
3. **Vérifier** avant toute fusion :
   - « CI terminée » est au vert sur le dernier commit de la PR ;
   - les fichiers modifiés sont tous dans le périmètre de la session : comparer `gh pr diff --name-only` au tableau de CLAUDE.md §5 ;
   - la description de la PR contient la preuve de **chaque** ligne de « Fait quand » ;
   - aucun secret dans le diff ; aucune règle du §8.1 enfreinte.

   Un point manque → correction sur la même branche (§8.3), puis nouvelle vérification.
4. **Fusionner** en *squash* (CONVENTIONS §4.3), seulement la PR de la session ; puis mettre à jour `main` en local.
5. **Écrire le journal** ([JOURNAL.md](JOURNAL.md)) : ce qui a été fait, la PR, les preuves, les problèmes rencontrés et leur cause, les décisions prises, les remarques hors périmètre. La coche ✅ du §2 est dans la PR fusionnée.
6. Recommencer à l'étape 1 avec la session suivante.

### 8.3 Un problème ou un conflit : chercher la cause et corriger

Face à une erreur (CI rouge, test qui échoue, build cassé, conflit de fusion, comportement inattendu, document qui contredit le code), le chef de projet ne s'arrête pas et ne contourne pas : **il cherche la cause et la corrige.**

1. **Lire l'erreur en entier** (journal de la CI, trace complète), puis reproduire en local.
1 bis. **Une erreur qui vient d'un logiciel ou d'un service externe** (Supabase, Vercel, Trigger.dev, GitHub…) : lire d'abord sa **documentation officielle** sur ce point précis, appliquer ce qu'elle dit et citer le lien (CLAUDE.md §2). Jamais d'essais au hasard sur des permissions ou des réglages.
2. **Trouver la cause racine** avec la compétence `superpowers:systematic-debugging` : une hypothèse à la fois, vérifiée par une commande ou un test, jamais une correction au hasard.
3. **Écrire d'abord un test qui échoue** quand le problème est un défaut du code, puis corriger.
4. **Corriger au bon endroit** :
   - dans le périmètre de la session → sur la branche de la session ;
   - hors périmètre (pipeline, documentation, défaut d'une session déjà fusionnée) → **petite PR séparée** `fix/<sujet>`, vérifiée et fusionnée selon le §8.2, notée au journal, puis reprise de la session.
5. **Conflit de fusion avec `main`** : fusionner `main` dans la branche et résoudre en gardant **les deux intentions** ; ne jamais écraser le travail de quelqu'un d'autre. Si le conflit touche une PR ou un fichier de la personne et que les deux versions s'opposent, c'est une question (§8.4).
6. **Prouver la correction** : la commande ou le test qui échouait passe, la CI est verte. La cause et la correction vont dans la PR et dans le journal.
7. **Garde-fou** : après **3 approches différentes** sans succès sur la même cause, arrêt et rapport (§8.4) : la cause supposée, les 3 essais, ce qu'il faudrait décider.

### 8.4 Quand il s'arrête pour te demander

| Situation | Ce qu'il fait |
|---|---|
| Une décision ❓ de la fiche n'est pas prise (§5 : D-1 CAPTCHA avant S04, D-2 passerelle IA avant S13, D-6 domaine de préproduction avant S07) | question avec 2 ou 3 options et sa recommandation |
| Une action 👤 est nécessaire (compte, clé, DNS, paiement, relecture juridique : §4) | demande précise : quoi faire, où, et comment le vérifier |
| Deux documents se contredisent sur un choix **produit**, ou une règle produit manque | question avec options et recommandation |
| Un choix à fort enjeu non prévu par les documents (sécurité, argent, données, migration destructive) | question, jamais de choix seul |
| Le garde-fou du §8.3 (3 approches sans succès) | rapport et question |
| Avant **S36** (mise en production) | arrêt complet : la production est lancée par la personne |

La question est inscrite au journal (« Questions en attente ») et une notification est envoyée si l'outil existe. **Il attend ta réponse, puis reprend la même session.**

### 8.5 Ce que le chef de projet a le droit de faire seul

- Créer les branches, ouvrir **et fusionner les PR qu'il a lui-même ouvertes** (sessions et corrections du §8.3), quand le §8.2 étape 3 est entièrement vrai.
- Reprendre une PR de session déjà ouverte par une session précédente (ex. S01, PR #5) : la vérifier selon le §8.2, la corriger si besoin, puis la fusionner.
- Couper une session trop grosse en deux parties faites **à la suite** (§1 règle 2), en le notant au journal.

Il n'a **jamais** le droit de : fusionner une PR ouverte par la personne (ex. #4, logo et design system v3), fusionner avec une CI rouge, lancer `release.yml` (mise en production), dépenser de l'argent réel, créer un compte, toucher aux couleurs.

### 8.6 Message à coller pour lancer le mode continu

```
Mode continu de docs/ROADMAP.md §8.
1. Lis CLAUDE.md, docs/ROADMAP.md (en entier) et docs/JOURNAL.md.
2. Tu es le chef de projet. Applique les règles strictes du §8.1 : sessions dans l'ordre S01 → S35, aucune sautée, une à la fois, jamais de coche sans preuve complète et CI verte.
3. Commence par S01 : sa PR est déjà ouverte (#5) mais sa CI est rouge ; vérifie-la et corrige-la selon les §8.2 et §8.3 avant de la fusionner.
4. Chaque session suivante est faite par un sous-agent neuf avec le message du §7 ; toi, tu vérifies (§8.2), fusionnes, coches et écris le journal, puis tu passes à la suivante sans attendre que je relance.
5. Un problème ou un conflit : cherche la cause et corrige selon le §8.3, sans jamais contourner (§8.1 règle 5).
6. Tu ne m'interroges que pour les cas du §8.4, puis tu reprends la même session après ma réponse.
7. Arrête-toi avant S36. Réponds-moi en français, court.
```
