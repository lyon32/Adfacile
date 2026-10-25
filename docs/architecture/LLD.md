# Conception détaillée (LLD) — Pubeka

> Version 1 · 10 octobre 2026
> Ce document dit **où va chaque fichier, qui fait quoi, et avec quelles signatures**. Un humain ou un agent IA qui écrit du code pour Pubeka suit cet arbre et ces noms : on n'invente pas de dossier, de couche ou de convention.
>
> Documents liés : [ARCHITECTURE](ARCHITECTURE.md) (le quoi et le pourquoi) · [API_SPEC](API_SPEC.md) + [`api/openapi.yaml`](../../api/openapi.yaml) (le contrat) · [DATA_MODEL](DATA_MODEL.md) (les tables) · [SECURITE-BACKEND](SECURITE-BACKEND.md) · [APPFLOW](../produit/APPFLOW.md) (les écrans) · [agents/](../agents/README.md).
>
> Légende : ✅ décidé (dans un document précédent) · 🔶 décidé **ici**, à valider · ❓ ouvert.

---

## Sommaire

1. [Décisions propres à ce document](#1-décisions-propres-à-ce-document)
2. [Arborescence du dépôt](#2-arborescence-du-dépôt)
3. [Règles de dépendance entre modules](#3-règles-de-dépendance-entre-modules)
4. [Responsabilités des modules](#4-responsabilités-des-modules)
5. [Chemin d'une requête](#5-chemin-dune-requête)
6. [Fonctions clés et signatures](#6-fonctions-clés-et-signatures)
7. [Gestion de l'état (frontend)](#7-gestion-de-létat-frontend)
8. [Conventions de nommage](#8-conventions-de-nommage)
9. [Tests : où et quoi](#9-tests--où-et-quoi)
10. [Écarts à corriger avant de coder](#10-écarts-à-corriger-avant-de-coder)

---

## 1. Décisions propres à ce document

Ces choix n'étaient pas encore écrits ailleurs. Ils sont nécessaires pour fixer l'arbre et les signatures.

| # | Décision | Statut | Raison |
|---|---|---|---|
| D1 | **Monodépôt pnpm + Turborepo**, dans ce dépôt | 🔶 | `ARCHITECTURE §4` prévoit `apps/` + `packages/`. pnpm empêche d'utiliser une dépendance non déclarée ; Turborepo met en cache le typage, les tests et le build. |
| D2 | **Une seule API : `/api/v1` (gestionnaires de routes Next.js)**. Pas de *Server Actions* pour les écritures métier. | 🔶 | Le contrat OpenAPI est la seule porte d'entrée, testable, réutilisée telle quelle par l'application mobile (V3). |
| D3 | Les pages (composants serveur) **lisent** en appelant directement les cas d'usage de `packages/core`, pas l'API par HTTP. | 🔶 | Pas d'aller-retour réseau inutile ; les mêmes contrôles d'accès s'appliquent (même fonction). |
| D4 | **Un seul projet Next.js** pour le site public, l'application et l'administration ; le fichier `proxy.ts` (nouveau nom du *middleware* depuis Next 16) aiguille selon le nom de domaine. | 🔶 | `ARCHITECTURE §1` (un seul déploiement). Voir §2.2 pour éviter les conflits d'adresses. |
| D5 | Validation **Zod** ; types générés depuis `openapi.yaml` (`openapi-typescript`) ; chaque schéma Zod est vérifié contre le type généré à la compilation. | ✅ Zod · 🔶 le reste | Le contrat et le code ne peuvent pas diverger sans erreur de compilation. |
| D6 | Les migrations SQL passent de `db/migrations/` à **`supabase/migrations/`** (convention de la CLI Supabase). | 🔶 | `supabase db push`, `supabase gen types` fonctionnent sans réglage. L'ancien `supabase/snippets/` (AdFacile) est retiré. |
| D7 | Tests : **Vitest** (unitaires, intégration), **Playwright** (parcours), tests de sécurité de la base sur **PGlite** (existants). | 🔶 | Vitest est compatible TypeScript et ESM sans réglage. |
| D8 | Limites de débit stockées **dans Postgres** au lancement (fonction `private.hit_rate_limit`). | 🔶 | Pas de nouveau fournisseur. À remplacer par un cache dédié si la charge l'exige. |
| D9 | Identifiants dans le code en **anglais** ; commentaires, documentation et adresses des écrans en **français** ; textes affichés uniquement via les fichiers de traduction. | 🔶 | Le code existant suit déjà cette règle (`db/`, `bench/`). |

---

## 2. Arborescence du dépôt

### 2.1 L'arbre cible

```
pubeka/                                  ← ce dépôt (Adfacile), renommé plus tard
├─ package.json                          scripts racine (turbo), "packageManager": "pnpm@…"
├─ pnpm-workspace.yaml                   apps/*, packages/*, jobs, bench
├─ turbo.json                            tâches : typecheck, lint, test, build
├─ .env.example                          liste de TOUTES les variables, sans valeur
├─ .github/workflows/ci.yml              typecheck · lint · test · openapi lint · build
│
├─ api/
│  ├─ openapi.yaml                       contrat d'API (source de vérité)
│  ├─ redocly.yaml                       configuration du contrôle
│  └─ .redocly.lint-ignore.yaml
│
├─ supabase/
│  ├─ config.toml                        projet local (Auth, Storage, ports)
│  ├─ migrations/
│  │  ├─ 0001_init.sql                   (déplacé depuis db/migrations)
│  │  ├─ 0002_storage.sql
│  │  └─ 0003_api_support.sql            écarts du §10 (à écrire)
│  ├─ seed.sql                           formules, fournisseurs, pays, réglages (dev)
│  ├─ tests/security.test.mjs            tests RLS et fonctions (PGlite)
│  └─ scripts/gen-data-model.mjs         génère DATA_MODEL.md depuis la vraie base
│
├─ apps/
│  └─ web/                               Next.js (App Router, TypeScript strict)
│     ├─ next.config.ts
│     ├─ proxy.ts                        aiguillage par domaine, session, en-têtes de sécurité (ex-middleware)
│     ├─ instrumentation.ts              Sentry (serveur)
│     ├─ app/
│     │  ├─ layout.tsx                   <html>, police Sora, thème, fournisseurs globaux
│     │  ├─ not-found.tsx
│     │  ├─ global-error.tsx
│     │  ├─ sitemap.ts · robots.ts       site public uniquement
│     │  │
│     │  ├─ site/[locale]/               pubeka.com/{fr|en}/…   (statique : SSG/ISR)
│     │  │  ├─ layout.tsx                GSAP + Lenis, en-tête, pied de page, hreflang
│     │  │  ├─ page.tsx                  accueil
│     │  │  ├─ fonctionnement/page.tsx
│     │  │  ├─ tarifs/page.tsx
│     │  │  ├─ pays/[country]/page.tsx
│     │  │  ├─ aide/page.tsx · aide/[slug]/page.tsx
│     │  │  ├─ blog/page.tsx · blog/[slug]/page.tsx
│     │  │  └─ (legal)/confidentialite · conditions · suppression-des-donnees
│     │  │
│     │  ├─ console/                     app.pubeka.com/…        (connexion obligatoire)
│     │  │  ├─ (auth)/                   sans barre latérale
│     │  │  │  ├─ connexion/page.tsx
│     │  │  │  ├─ inscription/page.tsx
│     │  │  │  ├─ mot-de-passe-oublie/page.tsx
│     │  │  │  └─ auth/callback/route.ts retour OAuth Google / Apple, lien magique
│     │  │  └─ (shell)/                  barre latérale, bandeau, bulle d'aide
│     │  │     ├─ layout.tsx             charge session + espace actif (serveur)
│     │  │     ├─ page.tsx               tableau de bord
│     │  │     ├─ bienvenue/[etape]/page.tsx
│     │  │     ├─ campagnes/page.tsx · nouvelle/page.tsx · [id]/page.tsx
│     │  │     ├─ visuels/page.tsx · nouveau/page.tsx · [id]/page.tsx
│     │  │     ├─ statistiques/page.tsx
│     │  │     ├─ reglages/[section]/page.tsx
│     │  │     ├─ abonnement/page.tsx · payer/page.tsx · preuve/page.tsx
│     │  │     ├─ credits/acheter/page.tsx
│     │  │     ├─ support/page.tsx · [ticket]/page.tsx
│     │  │     └─ parrainage/page.tsx
│     │  │
│     │  ├─ admin/                       app.pubeka.com/<chemin-secret>/…  (aal2)
│     │  │  ├─ layout.tsx                requireAdmin() sinon notFound()
│     │  │  ├─ page.tsx                  vue d'ensemble
│     │  │  ├─ utilisateurs/ · espaces/[id]/ · paiements/ · tickets/
│     │  │  ├─ modeles/ · routage/ · couts/ · tva/ · reglages/ · journal/
│     │  │  └─ references/
│     │  │
│     │  └─ api/v1/                      un dossier = un chemin d'openapi.yaml
│     │     ├─ public/{maintenance,plans}/route.ts
│     │     ├─ me/route.ts · me/export/route.ts
│     │     ├─ workspaces/route.ts
│     │     ├─ workspaces/[workspaceId]/
│     │     │  ├─ route.ts
│     │     │  ├─ members/… · invitations/…
│     │     │  ├─ meta/… · pages/… · ad-accounts/…
│     │     │  ├─ uploads/route.ts · analyses/…
│     │     │  ├─ campaigns/[campaignId]/{route,publish,pause,resume,relaunch,stats,…}
│     │     │  ├─ generations/… · visuals/…
│     │     │  ├─ billing/ · credits/ledger/ · checkout/ · payments/ · payment-proofs/
│     │     │  ├─ recommendations/… · tickets/… · assistant/messages/ · referral/
│     │     ├─ invitations/accept/route.ts
│     │     ├─ meta/callback/route.ts
│     │     ├─ media-models/route.ts
│     │     ├─ notifications/…
│     │     ├─ webhooks/{saspay,meta,[provider]}/route.ts
│     │     └─ admin/…
│     │
│     ├─ features/                       interface par domaine (composants client + hooks)
│     │  ├─ shell/                       barre latérale, sélecteur de Page, bandeau, onglets mobiles
│     │  ├─ auth/                        formulaires, déconnexion pour inactivité
│     │  ├─ onboarding/
│     │  ├─ meta-connection/             bouton connecter, bilan de santé
│     │  ├─ campaign-wizard/             Sources → Questions → Proposition → Visuel → Aperçu → Publier
│     │  ├─ campaigns/                   liste, détail, onglets, refus
│     │  ├─ generation/                  choix du modèle, niveau, attente, bascule
│     │  ├─ visuals/                     atelier, modification, formats
│     │  ├─ stats/                       graphiques, Optimiseur
│     │  ├─ billing/                     abonnement, paiement, crédits, preuve
│     │  ├─ notifications/               cloche, préférences
│     │  ├─ support/                     tickets, bulle d'aide
│     │  ├─ settings/
│     │  ├─ marketing/                   sections du site public (animations GSAP)
│     │  └─ admin/
│     │
│     ├─ server/                         code serveur propre à l'application web
│     │  ├─ http/
│     │  │  ├─ api.ts                    api() : enveloppe commune des routes (§6.1)
│     │  │  ├─ problem.ts                réponse d'erreur standard (§6.2)
│     │  │  ├─ idempotency.ts
│     │  │  ├─ rate-limit.ts
│     │  │  ├─ origin-check.ts
│     │  │  └─ sse.ts                    flux text/event-stream
│     │  ├─ auth/
│     │  │  ├─ session.ts                getSession(), requireUser()
│     │  │  └─ admin.ts                  requireAdmin() (aal2, admin_users, verrouillage)
│     │  └─ webhooks/verify.ts           vérification des signatures (§6.12)
│     │
│     ├─ lib/                            code client partagé de l'application web
│     │  ├─ supabase-browser.ts          client navigateur (Realtime uniquement)
│     │  ├─ api.ts                       client HTTP typé (packages/api-client)
│     │  ├─ query-client.ts              TanStack Query
│     │  ├─ realtime.ts                  abonnements → mise à jour du cache
│     │  ├─ outbox.ts                    file hors connexion (§7.6)
│     │  └─ analytics.ts                 PostHog (masquage des champs sensibles)
│     │
│     ├─ stores/                         Zustand : état client seulement (§7.4)
│     │  ├─ wizard-store.ts
│     │  ├─ outbox-store.ts
│     │  └─ ui-store.ts
│     │
│     └─ e2e/                            Playwright
│
├─ packages/
│  ├─ config/                            tsconfig de base, ESLint, Prettier
│  ├─ shared/                            sans dépendance métier : argent, dates, ids, env, journal
│  ├─ contracts/                         types OpenAPI générés + schémas Zod + codes d'erreur
│  ├─ api-client/                        client HTTP typé (web, puis mobile V3)
│  ├─ db/                                clients Supabase, types générés, dépôts (accès aux tables)
│  ├─ agents/                            6 agents : prompts versionnés, schémas, exécution
│  ├─ media/                             aiguilleur, catalogue, fournisseurs, prix en crédits, calques
│  ├─ platforms/                         connecteurs : meta/ (porté de l'existant), google/, tiktok/
│  ├─ billing/                           registre de crédits, formules, SasPay, TVA, change
│  ├─ notifications/                     catalogue d'événements, e-mails Resend FR/EN, cloche
│  ├─ i18n/                              textes FR/EN (interface, e-mails)
│  ├─ ui/                                composants shadcn habillés Pubeka, jetons, loader
│  ├─ core/                              CAS D'USAGE : la logique métier qui orchestre tout
│  └─ testing/                           tests uniquement : constructeurs, fabriques, fausses implémentations, fixtures (TESTING §5)
│
├─ jobs/                                 Trigger.dev
│  ├─ trigger.config.ts
│  └─ src/
│     ├─ queues.ts                       media-fal, media-higgsfield, media-byteplus-video, agents (limites : queue-limits.ts)
│     ├─ dispatcher.ts                   JobDispatcher, InlineJobDispatcher, TriggerJobDispatcher (S13)
│     ├─ handlers/                       logique de chaque tâche, partagée par `inline` et Trigger.dev
│     ├─ tasks/                          enveloppes Trigger.dev des tâches (génération, publication, analyse…)
│     └─ schedules/                      tâches planifiées (ARCHITECTURE §10)
│
├─ bench/                                banc de test des modèles (existant, inchangé)
└─ docs/                                 documentation (existant)
```

### 2.2 Pourquoi `site/`, `console/` et `admin/`

Un seul projet Next.js sert trois adresses. Sans précaution, `/campagnes` (application) serait capturé par `/[locale]` (site public). Le fichier `proxy.ts` réécrit donc l'adresse **selon le domaine** vers un dossier interne :

| Adresse demandée | Réécrite vers | Accès direct au dossier interne |
|---|---|---|
| `pubeka.com/fr/tarifs` | `/site/fr/tarifs` | `pubeka.com/site/…` → 404 |
| `pubeka.com/` | redirection 308 vers `/fr` ou `/en` (langue du navigateur) | — |
| `app.pubeka.com/campagnes` | `/console/campagnes` | `app.pubeka.com/console/…` → 404 |
| `app.pubeka.com/<ADMIN_PATH>/…` | `/admin/…` | `app.pubeka.com/admin/…` → 404 |
| `app.pubeka.com/api/v1/…` | inchangé | `pubeka.com/api/…` → 404 |

`ADMIN_PATH` est une variable chiffrée de Vercel. Le *layout* `admin/layout.tsx` revérifie l'accès (`requireAdmin()`) : la réécriture cache le chemin, elle **ne protège pas** à elle seule.

### 2.3 Ancien code AdFacile à retirer

À retirer **après** que les tests Meta portés dans `packages/platforms/meta/` passent (ARCHITECTURE §4) : `src/`, `backend/`, `index.html`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`, `Dockerfile`, `Dockerfile.dev`, `docker-compose*.yml`, `nginx.conf`, `render.yaml`, `public/` (ancien), `logs/`, `tmp/`, `supabase/snippets/`. Avant chaque suppression : vérifier que rien n'y est encore utilisé.

---

## 3. Règles de dépendance entre modules

```
            apps/web                      jobs
               │                            │
               └──────────┬─────────────────┘
                          ▼
                    packages/core                (cas d'usage)
                          │
   ┌──────────┬───────────┼───────────┬──────────────┬───────────────┐
   ▼          ▼           ▼           ▼              ▼               ▼
 agents     media     platforms    billing     notifications        db
   │          │           │           │              │               │
   └──────────┴───────────┴─────┬─────┴──────────────┴───────────────┘
                                ▼
                    contracts · shared · i18n
```

1. **Une flèche ne remonte jamais.** `media` n'importe pas `core` ; `core` n'importe pas `apps/web`.
2. Les modules du milieu (`agents`, `media`, `platforms`, `billing`, `notifications`, `db`) **ne s'importent pas entre eux**. S'il faut combiner deux d'entre eux, c'est un cas d'usage : il va dans `core`.
3. `ui` n'est importé que par `apps/web`. Aucun package serveur n'importe `ui`.
4. Seuls `db`, `core` et `jobs` lisent la clé `service_role`. Elle est refusée à la compilation dans tout fichier marqué `"use client"` (`import "server-only"` en tête de chaque module serveur).
5. Règle vérifiée en CI par `eslint-plugin-boundaries` (🔶) : un import interdit casse le build.

---

## 4. Responsabilités des modules

### `apps/web`
Porte d'entrée HTTP et interface. Il affiche les écrans (APPFLOW), expose `/api/v1` tel que décrit dans `openapi.yaml`, et reçoit les webhooks. **Il ne contient aucune règle métier** : une route se limite à « valider l'entrée → appeler un cas d'usage de `core` → renvoyer la réponse ». Il gère `proxy.ts` (domaine, session, en-têtes de sécurité, maintenance), l'état de l'interface (§7) et le site public (SEO, GSAP + Lenis). Il ne parle jamais directement à Meta, SasPay ou un fournisseur IA.

### `jobs`
Tout ce qui est long, répété ou planifié tourne ici, sur Trigger.dev : génération de médias, analyse des sources, publication chez Meta, synchronisation des statistiques, rappels, ménage des fichiers, taux de change, Optimiseur. Une tâche reçoit uniquement des **identifiants** (jamais un objet complet ou un secret), recharge l'état depuis la base, appelle `core`, et peut être relancée sans effet double (idempotente). Les files et leurs limites de simultanéité sont déclarées dans `jobs/src/queues.ts` (ARCHITECTURE §8.4).

### `packages/core`
Le cœur métier. Chaque fonction exportée est **un cas d'usage** (`publishCampaign`, `createGeneration`, `applyUpgrade`…). Elle reçoit un contexte `Ctx` (qui agit, dans quel espace, avec quel rôle), vérifie les règles (rôle, lecture seule, quota, crédits), orchestre les modules du milieu et écrit en base. C'est ici que vivent les **machines d'état** (campagne, génération, paiement, abonnement). `core` ne connaît ni HTTP ni React : il lève des `AppError` avec un code de la liste fermée, que `apps/web` traduit en réponse HTTP.

### `packages/db`
Seul module qui parle à Postgres. Il fournit deux clients (utilisateur, soumis à la RLS ; service, réservé au serveur), les types générés par `supabase gen types`, et des **dépôts** (`campaignsRepo`, `generationsRepo`…) : de petites fonctions nommées qui font une requête précise. Aucune requête SQL écrite à la main en texte : client Supabase ou fonction SQL appelée par `rpc()`. Il expose aussi les appels aux fonctions SQL protégées (`reserve_credits`, `release_credits`, `consume_credits`, `hit_rate_limit`).

### `packages/contracts`
Le contrat partagé entre serveur, client web et application mobile. Il contient les types générés depuis `api/openapi.yaml`, les schémas Zod des corps de requête (vérifiés contre ces types), la liste fermée des **codes d'erreur** avec leur statut HTTP, et les schémas des sorties d'agents (`BusinessProfile`, `CampaignProposal`, `VisualSpec`…). Aucune logique : seulement des formes de données.

### `packages/api-client`
Client HTTP typé (`openapi-fetch`) construit sur les types de `contracts`. Il ajoute `Idempotency-Key` quand l'opération l'exige, lit les erreurs `application/problem+json` et les transforme en `ApiError` typée. Utilisé par `apps/web` côté navigateur, puis par l'application mobile.

### `packages/agents`
Les 6 agents IA (docs/agents). Pour chacun : prompt versionné (`prompts/v3.md`), schéma d'entrée et de sortie, fonction `run`. Le module commun `runtime/` appelle la passerelle IA, valide la sortie (1 nouvel essai avec l'erreur, puis échec), détecte les tentatives d'injection dans les sources, mesure les jetons et le coût, et renvoie de quoi remplir `agent_runs`. Un agent **ne lit pas la base et n'appelle pas Meta** : il reçoit ses données en entrée et rend un JSON validé.

### `packages/media`
Tout ce qui produit une image ou une vidéo. Il contient le **catalogue** (lecture de `media_models`, `model_quality_levels`), l'**aiguilleur** (choix du modèle principal ou de secours, ARCHITECTURE §8.3), le **calcul du prix en crédits**, un client par fournisseur (fal, Higgsfield, BytePlus) avec la même interface, la **copie immédiate** des fichiers vers le stockage privé, et le **rendu des calques** (titre, prix, numéro, logo posés par notre code selon `layout_id`). Il ne réserve pas de crédits lui-même : c'est `core` qui le fait.

### `packages/platforms`
Une interface commune `PlatformConnector` (ARCHITECTURE §6) et une implémentation par plateforme. `meta/` reprend en TypeScript la logique éprouvée d'AdFacile (`facebookAdsService.js`, `campaignController.js`, `facebookErrors.js`, destinations de messagerie) avec ses tests. Il traduit les erreurs de Meta en codes Pubeka (`meta_token_expired`, `meta_payment_method_missing`…), chiffre et déchiffre les jetons. `google/` et `tiktok/` exportent un connecteur qui répond `available: false`.

### `packages/billing`
L'argent et les crédits. Formules et limites, calcul des montants (abonnement, passage à une formule supérieure, achat de crédits, frais SasPay, TVA par pays), conversion USD ↔ XAF/XOF, client SasPay (création de session, vérification d'un paiement), et lecture du **registre de crédits** (soldes par compartiment). Tous les montants sont des **entiers** (FCFA, centimes de dollar). Il ne décide pas d'activer un abonnement : il fournit les calculs et les appels, `core` décide.

### `packages/notifications`
Le catalogue des événements notifiables (ARCHITECTURE §11), les modèles d'e-mails FR/EN (React Email), l'envoi par Resend et l'écriture dans `notifications` (cloche). Il respecte les préférences de l'utilisateur et ne contient aucun texte en dur hors `i18n`.

### `packages/i18n`
Les fichiers de textes `fr.json` et `en.json` (interface, e-mails, messages d'erreur `detail`), et les fonctions de formatage (montants en FCFA avec chiffres tabulaires, dates dans le fuseau de l'utilisateur, salutation selon l'heure).

### `packages/ui`
Les composants shadcn/ui habillés avec les jetons du design system v2 (Sora, couleurs, rayons), le loader « Saisie » en composant React, et les composants Pubeka réutilisables (montant, carte de modèle, badge de statut de campagne). Aucun appel réseau, aucune logique métier : des composants purs pilotés par leurs propriétés.

### `packages/shared`
Les briques sans dépendance métier : type `Money` et arithmétique entière, identifiants, dates et fuseaux, lecture et validation des variables d'environnement (`env.ts`, échoue au démarrage si une variable manque), journal structuré relié à Sentry, utilitaire `assertNever`.

### `supabase/`
Le schéma de la base (migrations SQL numérotées, jamais modifiées une fois appliquées en production), les règles RLS, les fonctions protégées, les données initiales et les tests de sécurité. Toute nouvelle table arrive par une nouvelle migration, avec sa RLS et ses tests.

---

## 5. Chemin d'une requête

Exemple : **lancer une génération** (`POST /api/v1/workspaces/{ws}/generations`).

```
navigateur
  │  api-client : POST + Idempotency-Key (UUID créé au clic)
  ▼
proxy.ts                 domaine = app ? · maintenance ? · en-têtes de sécurité
  ▼
app/api/v1/workspaces/[workspaceId]/generations/route.ts
  │  export const POST = api({ … }, handler)
  ▼
server/http/api.ts       1. request_id         5. rôle (owner|editor)
                         2. Origin (CSRF)       6. espace modifiable ?
                         3. session (getUser)   7. limite de débit
                         4. membre de l'espace  8. idempotence (rejouer ?)
                                                9. corps validé par Zod
  ▼
core/generations/create-generation.ts
  │  catalogue → prix en crédits → aiguilleur → reserve_credits (rpc)
  │  → insert generation_jobs → tasks.trigger("media.generate", { jobId })
  ▼
réponse 202 { Generation }        (ou AppError → problem() → 402/409/422…)
  ▼
jobs/src/tasks/media-generate.ts  (file media-fal / media-higgsfield)
  │  appel fournisseur avec webhook
  ▼
app/api/v1/webhooks/[provider]/route.ts → verify → core.onProviderResult
  │  copie du fichier → calques → visuals → consume / release
  ▼
Realtime (ligne generation_jobs / visuals) → cache TanStack Query → écran
```

---

## 6. Fonctions clés et signatures

Seules les fonctions **non triviales** sont listées. Les signatures sont en TypeScript ; elles font foi pour le nom, les paramètres et le type de retour.

### 6.1 Enveloppe des routes — `apps/web/server/http/api.ts`

```ts
type Access =
  | { auth: 'none' }                                    // /public/*
  | { auth: 'user' }                                    // /me, /notifications
  | { auth: 'member'; roles?: MemberRole[]; writable?: boolean } // /workspaces/{ws}/…
  | { auth: 'admin' }                                   // /admin/* (aal2, sinon 404)
  | { auth: 'webhook'; provider: WebhookProvider };

type RouteOptions<B extends z.ZodTypeAny, Q extends z.ZodTypeAny> = Access & {
  body?: B;
  query?: Q;
  idempotent?: boolean;        // exige Idempotency-Key (API_SPEC §7)
  rateLimit: RateLimitGroup;   // 'read' | 'write' | 'generation' | 'ai' | 'assistant' | …
  stream?: boolean;            // accepte text/event-stream
};

export function api<B extends z.ZodTypeAny, Q extends z.ZodTypeAny>(
  options: RouteOptions<B, Q>,
  handler: (ctx: Ctx, input: { body: z.infer<B>; query: z.infer<Q>; params: Record<string, string> })
    => Promise<ApiResult>,
): (req: NextRequest, segment: { params: Promise<Record<string, string>> }) => Promise<Response>;

type ApiResult =
  | { status: 200 | 201 | 202; body: unknown; location?: string }
  | { status: 204 }
  | { status: 302; location: string }
  | { stream: ReadableStream<Uint8Array> };
```

Ordre fixe des contrôles (ne pas le changer) : `request_id` → maintenance → `Origin` (si écriture avec cookie) → session → appartenance → rôle → espace modifiable → limite de débit → idempotence → validation du corps → *handler*. Toute exception non `AppError` devient `500 internal_error`, envoyée à Sentry avec le `request_id`.

`writable: true` est **obligatoire** sur toute écriture, sauf les trois exceptions de la lecture seule (API_SPEC §2.3) : pause d'une campagne, paiement, tickets.

### 6.2 Erreurs — `packages/contracts/src/errors.ts` et `apps/web/server/http/problem.ts`

```ts
export const ERROR_STATUS = {
  validation_failed: 400, unauthenticated: 401, session_expired: 401, webhook_signature_invalid: 401,
  insufficient_credits: 402, campaign_quota_reached: 402, /* … les 36 codes de API_SPEC §4 … */
  maintenance: 503,
} as const satisfies Record<ErrorCode, number>;

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly opts: { detailKey?: I18nKey; detailVars?: Record<string, string | number>;
                     errors?: FieldError[]; meta?: Record<string, unknown>; retryAfterS?: number;
                     cause?: unknown } = {},
  );
}

export function problem(err: AppError, req: { path: string; requestId: string; locale: Locale }): Response;
export function fromZodError(err: z.ZodError): AppError;   // → validation_failed + errors[]
```

`ErrorCode` est généré depuis l'énumération `ErrorCode` d'`openapi.yaml` : un code ajouté d'un côté seulement ne compile pas.

### 6.3 Idempotence — `apps/web/server/http/idempotency.ts`

```ts
export async function withIdempotency<T extends ApiResult>(
  args: { workspaceId: string; key: string; route: string; bodyHash: string },
  run: () => Promise<T>,
): Promise<T & { replayed: boolean }>;
```

1. Insère `(workspace_id, key)` dans `api_idempotency_keys` avec `state = 'running'` ; si la ligne existe déjà :
   - même `route` et `bodyHash`, `state = 'done'` → renvoie la réponse enregistrée (`replayed: true`) ;
   - même empreinte, `state = 'running'` → `AppError('conflict', { retryAfterS: 2 })` ;
   - empreinte différente → `AppError('idempotency_key_reused')`.
2. Exécute `run()`, enregistre le statut et le corps, passe à `done`.
3. Si `run()` lève une `AppError` de type 4xx : la réponse est enregistrée aussi (même clé = même erreur). Une erreur 5xx **supprime** la ligne (on peut réessayer).

`bodyHash` = SHA-256 du corps JSON canonique (clés triées).

### 6.4 Prix d'une génération en crédits — `packages/media/src/pricing.ts`

```ts
export function creditsFor(args: {
  costUsd: number;            // coût fournisseur pour 1 unité (image, ou seconde de vidéo)
  units: number;              // nombre d'images, ou durée en secondes
  usdToXaf: number;           // taux en vigueur (exchange_rates)
  thresholdXaf: number;       // 125 pour les images ; dérivé de la marge minimale pour la vidéo
  minCredits: number;         // model_quality_levels.min_credits
}): number;
// = max(minCredits, ceil(costUsd × units × usdToXaf ÷ thresholdXaf))
// Lève si un argument n'est pas fini ou est négatif. Résultat entier ≥ 1.

export function thresholdFromMargin(creditPriceXaf: number, minMargin: number): number;
// seuil = prix d'un crédit × (1 − marge minimale)   ex. 1000 × (1 − 0.875) = 125
```

Le prix affiché à l'écran et le prix réservé viennent **du même appel**, fait côté serveur (`GET /media-models` renvoie les crédits calculés).

### 6.5 Crédits — `packages/db/src/credits.ts` (appels aux fonctions SQL)

```ts
export async function reserveCredits(svc: ServiceClient, workspaceId: string, needed: number, jobId: string): Promise<boolean>;
export async function releaseCredits(svc: ServiceClient, jobId: string, amount?: number): Promise<number>; // amount absent = tout
export async function consumeCredits(svc: ServiceClient, jobId: string): Promise<void>;
export async function creditBalances(db: DbClient, workspaceId: string): Promise<{ monthly: number; bonus: number; purchased: number; total: number }>;
```

Réservation → `false` si le solde est insuffisant ; `core` transforme ce `false` en `AppError('insufficient_credits', { meta: { credits_missing } })`. La libération **partielle** (`amount`) n'existe pas encore en SQL : voir §10.

### 6.6 Aiguilleur — `packages/media/src/router.ts`

```ts
export interface RouteDecision {
  model: CatalogModel;          // modèle qui sera appelé
  fallback: CatalogModel | null;// secours proposé si l'attente dépasse maxWaitS
  maxWaitS: number;
}

export function chooseModel(args: {
  capability: Capability;
  requestedModelId: string;     // choix de l'utilisateur
  catalog: Catalog;
  rule: RoutingRule;
  providerState: Record<ProviderCode, { healthy: boolean; balanceLow: boolean; monthSpentUsd: number; monthBudgetUsd: number }>;
}): RouteDecision;
// Lève AppError('provider_unavailable') si le modèle demandé n'est pas 'active' pour cette capacité
// et qu'aucun secours testé n'existe. Ne choisit JAMAIS un secours à la place de l'utilisateur :
// il le renvoie, l'écran le propose.

export function shouldOfferFallback(job: { queued_at: Date; started_at: Date | null; fallback_offered: boolean },
                                    maxWaitS: number, now: Date): boolean;
```

### 6.7 Cycle d'une génération — `packages/core/src/generations/`

```ts
export async function createGeneration(ctx: MemberCtx, input: GenerationRequest): Promise<Generation>;
export async function cancelGeneration(ctx: MemberCtx, generationId: string): Promise<Generation>;
export async function acceptFallback(ctx: MemberCtx, generationId: string): Promise<Generation>;
export async function onProviderResult(svc: ServiceCtx, evt: ProviderResultEvent): Promise<void>;   // appelé par le webhook
export async function sweepStuckGenerations(svc: ServiceCtx, now: Date): Promise<number>;           // tâche planifiée

// Machine d'état (generation-state.ts) — toute autre transition lève.
const GENERATION_TRANSITIONS = {
  queued:    ['running', 'canceled', 'failed'],
  running:   ['completed', 'partial', 'failed', 'nsfw'],
  completed: [], partial: [], failed: [], nsfw: [], canceled: [],
} as const satisfies Record<JobStatus, readonly JobStatus[]>;
```

`onProviderResult`, dans l'ordre : retrouver le job par `provider_requests` (sinon on ignore) → si le job est déjà terminé, ne rien faire → copier le fichier dans le stockage privé → rendre les calques → créer les `visuals` → calculer le statut final → consommer les crédits des visuels réussis et libérer ceux des échecs → notifier. Chaque étape peut être rejouée sans double effet.

### 6.8 Cycle d'une campagne — `packages/core/src/campaigns/`

```ts
export async function createDraft(ctx: MemberCtx, input: { analysis_id: string; page_id: string; platform: Platform }): Promise<Campaign>;
export async function generateProposal(ctx: MemberCtx, campaignId: string, onField?: (path: string, value: unknown) => void): Promise<Proposal>;
export async function publishCampaign(ctx: MemberCtx, campaignId: string, opts: { acceptLiability: boolean }): Promise<Campaign>;
export async function pauseCampaign(ctx: MemberCtx, campaignId: string): Promise<Campaign>;   // autorisé en lecture seule
export async function applyRejectionFix(ctx: MemberCtx, campaignId: string, rejectionId: string): Promise<Campaign>;
export async function onPlatformStatus(svc: ServiceCtx, evt: PlatformStatusEvent): Promise<void>;

const CAMPAIGN_TRANSITIONS = {
  draft:      ['publishing'],
  publishing: ['in_review', 'error'],
  in_review:  ['active', 'rejected', 'paused', 'stopped'],   // `stopped` : supprimée chez Meta ou paiement refusé pendant la vérification (S17, EC-META-08)
  active:     ['paused', 'ended', 'stopped', 'in_review'],   // une modification peut relancer la vérification
  paused:     ['active', 'ended', 'stopped'],
  rejected:   ['publishing', 'stopped'],                     // republication après correction
  error:      ['publishing', 'draft', 'in_review', 'active', 'paused'],   // 0020 : Meta a reçu la campagne malgré l'erreur de republication : son vrai statut remonte
  ended:      [],
  stopped:    ['active'],                                    // `recover` : le client relance après avoir payé chez Meta
} as const satisfies Record<CampaignStatus, readonly CampaignStatus[]>;
```

Table finale : **22 transitions** sur 9 états × 12 événements (108 paires, 86 interdites ; la migration 0020 ajoute `error → in_review | active | paused`, S18 : une republication refusée laisse la campagne en erreur alors qu'elle peut vivre chez Meta, le vrai statut doit remonter et le client doit pouvoir la mettre en pause), répétées dans le déclencheur SQL `private.guard_campaign_status` (migration 0010, remplacée par la migration 0016 qui ajoute `in_review → stopped`, décision de S17 : une pub supprimée chez Meta pendant la vérification passe à `stopped`, historique conservé). Décisions du 16/10/2026 : `stopped → active` existe (événement `recover`), déclenché par la **relance du client** (route `relaunch`, S16) après qu'il a réglé sa facture ou alimenté ses fonds chez Meta ; ce n'est pas une détection automatique, S17 se borne à afficher l'état arrêté et à guider le client. `rejected → publishing` : une campagne refusée repart vers « Publication ».

`publishCampaign`, dans l'ordre :
1. Contrôles : rôle, espace modifiable, Page active dans la formule, connexion Meta valide, responsabilité acceptée (première fois).
2. **Dans une transaction** : verrou sur la campagne, `draft → publishing`, quota décompté (`usage_counters`). Quota atteint → `AppError('campaign_quota_reached')`, rien n'est modifié.
3. Tâche `campaign.publish` lancée avec l'identifiant (réponse 202).
4. La tâche appelle le connecteur Meta. Succès → `in_review`. Échec définitif → `error` et **quota rendu**. Une republication après refus (`applyRejectionFix`) ne décompte pas de quota.

### 6.9 Abonnement et montants — `packages/billing/src/`

```ts
export function workspaceAccess(sub: { status: SubscriptionStatus; period_end: Date; grace_until: Date | null }, now: Date):
  'active' | 'grace' | 'read_only';
// grâce = 3 jours après period_end ; ensuite lecture seule.

export function upgradeQuote(current: Plan, target: Plan, sub: { period_end: Date }, now: Date):
  { amount_xaf: number; extra_credits: number; keeps_period_end: Date };
// montant = prix(cible) − prix(actuelle) ; crédits = crédits(cible) − crédits(actuelle) ; même date de fin.
// Lève si la cible n'est pas supérieure.

export function checkoutAmount(args: { purpose: PaymentPurpose; plan?: Plan; creditsQty?: number;
                                       creditPriceXaf: number; saspayFeeRate: number }): { amount_xaf: number; fees_xaf: number; total_xaf: number };
// Tout en entiers ; frais arrondis au FCFA supérieur ; jamais de montant venant du client.

export function vatTotal(budgetUsdCents: number, vatRate: number): { vat_usd_cents: number; total_usd_cents: number };
export function convert(amount: Money, to: Currency, rate: FxRate): Money;   // arrondi au FCFA le plus proche
```

`packages/core/src/billing/` :

```ts
export async function createCheckout(ctx: OwnerCtx, input: CheckoutRequest): Promise<Checkout>;
export async function onPaymentConfirmed(svc: ServiceCtx, paymentId: string): Promise<void>;
// 1. relit le paiement chez SasPay (on ne croit pas le webhook seul) ; 2. vérifie le montant enregistré ;
// 3. selon purpose : prolonge l'abonnement / applique l'upgrade / ajoute les crédits au registre ;
// 4. paie la récompense de parrainage si c'est le premier paiement du filleul ; 5. reçu par e-mail.
// Idempotent : un paiement déjà 'succeeded' ne déclenche rien.
```

### 6.10 Agents — `packages/agents/src/runtime/run-agent.ts`

```ts
export async function runAgent<I, O>(def: AgentDefinition<I, O>, input: I, opts: {
  workspaceId: string | null;
  signal?: AbortSignal;
  onPartial?: (partial: DeepPartial<O>) => void;   // affichage progressif (Stratège, Assistant)
}): Promise<{ output: O; run: AgentRunRecord }>;

export interface AgentDefinition<I, O> {
  name: 'analyste' | 'stratege' | 'designer' | 'moderateur' | 'optimiseur' | 'aide';
  promptVersion: string;           // ex. 'analyste@3'
  model: string;                   // identifiant passerelle, réglable sans redéploiement
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  buildMessages(input: I): ChatMessage[];
}

export function wrapUntrusted(sourceText: string): string;   // encadre le contenu des sources comme DONNÉE
export function detectInjection(sourceText: string): { suspicious: boolean; reasons: string[] };
```

`model` est un réglage fourni par l'appelant (`resolveAgentModels`, variable `AGENT_MODELS`, passerelle OpenRouter : décision D-2) ; `AgentDefinition` porte aussi `fallbackModel`, `temperature` (fixée par la configuration, docs/agents R10) et `responseFormat`. L'appelant passe la passerelle : `opts.gateway` (`OpenRouterGateway` ou `FakeAiGateway`, choisie par `createAiGateway(env)`). Le réglage de l'agent est lu derrière `AgentConfigSource` (`EnvAgentConfigSource` en S13, source en base en S31) puis appliqué par `applyAgentConfig(def, config)` ; `AgentDefinition` porte `provider` et `keyRef` (clé propre, résolue par `AgentKeyStore`, jamais journalisée). `AgentRunRecord` ajoute `requestedModel`, `provider`, `attempts`, `errorCode` (santé des agents, S31). `onPartial` (affichage progressif) arrive avec S15, premier agent qui en a besoin.

Sortie invalide → un seul nouvel essai avec l'erreur de validation dans le message → sinon échec ; **jamais un 3ᵉ appel**, et une panne de la passerelle n'est jamais rejouée. Tout échec est une `AgentRunError` (une `AppError`) qui porte le journal `run`. `AgentRunRecord` est inscrit dans `agent_runs` **par `core`** (pas par `agents`, qui ne touche pas la base).

### 6.11 Lecture des sources — `packages/core/src/analysis/read-source.ts`

```ts
export async function assertPublicUrl(raw: string): Promise<URL>;
// http(s) uniquement ; résout le DNS et refuse les adresses privées, locales, de lien local et de métadonnées
// (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7…) → AppError('unsafe_url').
// Revérifie après chaque redirection (5 au maximum).

export async function readSource(src: SourceInput, opts: { timeoutMs: number; maxBytes: number }):
  Promise<{ text: string; extractor: 'internal' | 'jina'; status: 'ok' | 'unreadable' }>;
// lecture interne d'abord, Jina Reader en secours ; texte tronqué à 200 000 caractères.
```

### 6.12 Webhooks — `apps/web/server/webhooks/verify.ts`

```ts
export async function verifyWebhook(provider: WebhookProvider, rawBody: ArrayBuffer, headers: Headers):
  Promise<{ eventId: string; payload: unknown }>;
// Lève AppError('webhook_signature_invalid'). Comparaison en temps constant. Horodatage > 5 min refusé.

export async function once(svc: ServiceClient, provider: WebhookProvider, eventId: string, run: () => Promise<void>): Promise<'processed' | 'duplicate'>;
// insère (provider, event_id) dans webhook_events ; doublon → 'duplicate' sans exécuter.
```

### 6.13 Jetons Meta — `packages/platforms/src/meta/token-crypto.ts`

```ts
export function encryptToken(plain: string, key: { id: string; bytes: Uint8Array }): string;
// AES-256-GCM, IV aléatoire de 12 octets ; format "v1.<keyId>.<iv>.<ciphertext>.<tag>" en base64url.
export function decryptToken(sealed: string, keys: Record<string, Uint8Array>): string;
// la clé est choisie par keyId : rotation possible sans tout rechiffrer d'un coup.
```

### 6.14 Connecteur de plateforme — `packages/platforms/src/types.ts`

```ts
export interface PlatformConnector {
  readonly platform: Platform;
  readonly available: boolean;                          // false pour google et tiktok
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<PlatformToken>;
  listAdAccounts(token: PlatformToken): Promise<PlatformAdAccount[]>;
  listPages(token: PlatformToken): Promise<PlatformPage[]>;
  healthCheck(token: PlatformToken, adAccountId: string, pageId: string): Promise<HealthCheckItem[]>;
  createCampaign(token: PlatformToken, spec: PublishSpec): Promise<PlatformCampaignRefs>;
  updateCampaign(token: PlatformToken, refs: PlatformCampaignRefs, patch: PublishPatch): Promise<void>;
  pause(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void>;
  resume(token: PlatformToken, refs: PlatformCampaignRefs): Promise<void>;
  getStatus(token: PlatformToken, refs: PlatformCampaignRefs): Promise<PlatformStatus>;
  fetchStats(token: PlatformToken, refs: PlatformCampaignRefs, range: DateRange): Promise<DailyStats[]>;
  fetchRejection(token: PlatformToken, refs: PlatformCampaignRefs): Promise<PlatformRejection | null>;
}
// Toute erreur de la plateforme est convertie en AppError (meta_token_expired, meta_payment_method_missing,
// budget_too_low, meta_error) ; le message d'origine part dans `cause` (Sentry), jamais au client.
```

### 6.15 Rendu des calques — `packages/media/src/layers/render.ts`

```ts
export async function renderVisual(args: {
  scene: Uint8Array;                    // image de scène (+ produit détouré déjà composé)
  layoutId: LayoutId;                   // bibliothèque fermée, ex. 'hero_bottom_band_v1'
  format: '4:5' | '9:16' | '1:1' | '1.91:1';
  layers: Layer[];                      // titre, prix, numéro, logo, bouton (du VisualSpec)
  brand: BrandKit;
}): Promise<{ png: Uint8Array; overflow: LayerOverflow[] }>;
// Le texte est TOUJOURS posé ici, jamais par l'IA. `overflow` signale un texte trop long pour sa zone.
// Moteur ❓ (Satori + resvg ou sharp, ARCHITECTURE §19 point 3) : caché derrière cette signature.
```

### 6.16 Contexte des cas d'usage — `packages/core/src/context.ts`

```ts
export interface Ctx {
  requestId: string;
  user: { id: string; locale: Locale; timezone: string };
  db: UserClient;                 // client soumis à la RLS (jeton de l'utilisateur)
  svc: ServiceClient;             // client service, pour les fonctions protégées uniquement
  now: () => Date;                // injectable pour les tests
}
export interface MemberCtx extends Ctx { workspace: { id: string; role: MemberRole; access: 'active' | 'grace' | 'read_only'; plan: PlanCode } }
export interface OwnerCtx  extends MemberCtx { workspace: MemberCtx['workspace'] & { role: 'owner' } }
export interface ServiceCtx { requestId: string; svc: ServiceClient; now: () => Date }   // tâches et webhooks
```

Règle : une lecture ou écriture **au nom de l'utilisateur** passe par `ctx.db` (la RLS s'applique en plus de nos contrôles). `ctx.svc` sert seulement aux opérations que l'utilisateur ne peut pas faire seul (crédits, quotas, journal).

---

## 7. Gestion de l'état (frontend)

### 7.1 Les cinq sortes d'état et où chacune vit

| Sorte d'état | Exemple | Outil | Règle |
|---|---|---|---|
| **Données du serveur** | campagnes, visuels, soldes, statistiques | Composants serveur pour le premier affichage, puis **TanStack Query v5** | Le serveur est la seule vérité. Jamais copiées dans Zustand. |
| **Adresse (URL)** | filtres, onglet actif, étape de l'assistant, page de liste | `searchParams` via **nuqs** | Tout ce qu'on veut pouvoir partager ou retrouver après rechargement. |
| **Formulaire** | réglages, textes de la pub, ticket | **react-hook-form + zodResolver** (schémas de `contracts`) | Mêmes règles de validation que le serveur. |
| **État client global** | brouillon de l'assistant de campagne, file hors connexion, préférences d'affichage | **Zustand** (`apps/web/stores/`) | Uniquement ce qui n'existe pas sur le serveur. Trois magasins, pas plus sans raison écrite. |
| **État local** | menu ouvert, survol | `useState` | Reste dans le composant. |

Contexte React : seulement pour ce qui est **fixé au chargement** de la coque (`SessionProvider` : utilisateur, espace actif, rôle, accès, langue). Pas de contexte pour des données qui changent souvent.

### 7.2 Données du serveur (TanStack Query)

- **Clés de requête** construites par une seule fabrique, `apps/web/lib/query-keys.ts` :
  ```ts
  export const qk = {
    workspace: (ws: string) => ['ws', ws] as const,
    campaigns: (ws: string, filters?: CampaignFilters) => ['ws', ws, 'campaigns', filters ?? {}] as const,
    campaign:  (ws: string, id: string) => ['ws', ws, 'campaign', id] as const,
    generation:(ws: string, id: string) => ['ws', ws, 'generation', id] as const,
    billing:   (ws: string) => ['ws', ws, 'billing'] as const,
    // …
  };
  ```
  Changer d'espace de travail = `queryClient.removeQueries({ queryKey: ['ws', ancien] })` : aucune donnée d'un espace ne s'affiche dans un autre.
- **Premier affichage** : la page serveur charge les données via `core`, puis les passe à `HydrationBoundary`. Pas de double chargement.
- **Écritures** : `useMutation` → `api-client`. Mise à jour optimiste **seulement** pour les actions sans argent ni crédits (marquer une notification lue, choisir un visuel). Publier, payer et générer attendent la réponse du serveur.
- **Erreurs** : `ApiError.code` décide de l'affichage (API_SPEC §4, colonne « Ce que l'écran fait »), via une seule fonction `handleApiError(err)` dans `features/shell/`. On ne lit jamais `detail` pour décider.
- **Délais** : `staleTime` 30 s par défaut ; 0 pour `billing` et `generation` ; statistiques 5 min (copiées toutes les heures).

### 7.3 Temps réel (Supabase Realtime)

`apps/web/lib/realtime.ts` abonne la coque aux lignes de l'espace actif (`generation_jobs`, `visuals`, `campaigns`, `notifications`, `stats_daily`). Chaque événement **met à jour le cache** de TanStack Query (`setQueryData` si la ligne suffit, sinon `invalidateQueries`). Les composants ne s'abonnent jamais directement. Si la connexion Realtime tombe, les requêtes concernées passent en interrogation régulière (3 s, puis 10 s après 1 minute), comme prévu dans API_SPEC §9.

### 7.4 Les trois magasins Zustand

```ts
// stores/wizard-store.ts — brouillon de « Nouvelle campagne », gardé sur l'appareil
interface WizardState {
  workspaceId: string;
  step: 'sources' | 'questions' | 'proposal' | 'visual' | 'preview' | 'publish';
  sources: SourceDraft[];
  analysisId: string | null;
  answers: Record<string, string>;
  campaignId: string | null;
  set<K extends keyof WizardState>(key: K, value: WizardState[K]): void;
  reset(): void;
}
// persist → IndexedDB, clé "wizard:<workspaceId>". L'étape affichée vient de l'URL (?etape=) ;
// le magasin garde seulement les saisies.

// stores/outbox-store.ts — reflet de la file hors connexion (§7.6) pour l'affichage
interface OutboxState { pending: number; lastError: string | null; online: boolean }

// stores/ui-store.ts — préférences d'affichage non stockées sur le serveur
interface UiState { sidebarCollapsed: boolean; statsChartRange: '7d' | '30d' }
```

Le thème et la langue sont enregistrés dans le **profil** (serveur) et dans un cookie pour le premier affichage : ils ne vont pas dans Zustand.

### 7.5 Session et inactivité

`features/auth/use-idle-logout.ts` compte l'inactivité (souris, clavier, toucher, visibilité de l'onglet). À 9 minutes, il ouvre la fenêtre « Tu es toujours là ? » avec un compte à rebours de 60 s. À 10 minutes, il appelle `supabase.auth.signOut()`, vide le cache de TanStack Query et redirige vers `/connexion?raison=inactivite`. Les brouillons (assistant, file hors connexion) restent sur l'appareil. Le serveur applique la même règle de son côté : une réponse `401 session_expired` déclenche le même chemin.

### 7.6 Hors connexion (choix B)

```ts
// lib/outbox.ts
type OutboxItem = {
  id: string;                      // sert aussi d'Idempotency-Key quand la route l'exige
  createdAt: number;
  method: 'POST' | 'PUT' | 'PATCH';
  path: string;                    // chemin /api/v1/…, uniquement dans OUTBOX_ALLOWED
  body: unknown;
  workspaceId: string;
};
export const OUTBOX_ALLOWED: readonly RegExp[];   // réglages, kit de marque, brouillon de campagne, tickets
export async function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt'>): Promise<void>;
export async function flush(): Promise<{ sent: number; failed: number }>;   // au retour du réseau, dans l'ordre
```

- File stockée dans **IndexedDB** (`idb-keyval`), renvoyée dans l'ordre d'arrivée au retour du réseau (`online`).
- **Jamais en file** : publier, payer, générer, accepter un secours. Ces boutons sont désactivés hors connexion (APPFLOW §21).
- Un renvoi qui reçoit une erreur 4xx sort de la file et s'affiche ; une erreur 5xx ou réseau reste en file.

### 7.7 Site public

Pas de TanStack Query ni de Zustand. Les pages sont statiques (SSG/ISR). GSAP et Lenis sont chargés **uniquement** dans `site/[locale]/layout.tsx`. Le seul état est local (menu mobile, champ « Colle le lien de ton site », qui redirige vers l'inscription avec l'URL dans un paramètre).

---

## 8. Conventions de nommage

Déplacées dans [CONVENTIONS.md §5](CONVENTIONS.md#5-nommage-des-fichiers-et-du-code), avec les versions, le lint, les commits et les modèles à suivre ou à éviter. Une seule source pour éviter deux tableaux qui divergent.

---

## 9. Tests : où et quoi

Déplacé dans [TESTING.md](TESTING.md) : niveaux de test, ce qui se teste à quel niveau, couverture exigée, données de test et fausses implémentations.

---

## 10. Écarts à corriger avant de coder

En écrivant ce document, j'ai comparé le contrat d'API et la base. E5 et E6 sont corrigés. E1 à E4 et E7 à E10 restent à faire, dans la migration `0003_api_support.sql`.

| # | Écart | Constat | Correction proposée |
|---|---|---|---|
| E1 | **Analyses sans état** | L'API expose `/analyses/{id}` avec un `status` (`queued`, `reading`, `analysing`, `questions`, `ready`, `blocked`, `failed`). La table `business_profiles` n'a pas de colonne d'état et exige un `profile` non vide. | Nouvelle table `analyses` (état, sources liées, `business_profile_id` une fois prêt, `blocked_reason`), avec RLS. |
| E2 | **Clés d'idempotence de l'API** | Seuls les paiements ont une clé (`payments.idempotency_key`). Les générations, publications et corrections n'en ont pas. | Table `api_idempotency_keys` (`workspace_id`, `key`, `route`, `body_hash`, `state`, `response_status`, `response_body`, `expires_at`), purgée après 24 h. |
| E3 | **Webhooks rejoués** | Aucune table ne garde les identifiants d'événements déjà traités (seul `provider_requests` existe, pour les générations). | Table `private.webhook_events` (`provider`, `event_id`, `received_at`), clé primaire sur les deux premières colonnes. |
| E4 | **Crédits partiels** | API_SPEC §9 : crédits consommés pour chaque visuel réussi, libérés pour chaque échec. Les fonctions SQL `release_credits` et `consume_credits` traitent la génération **en entier**. | `private.release_credits(job, amount)` : libère `amount` crédits, puis `consume_credits` confirme le reste. **Si la période des crédits du mois est terminée, ils sont rendus dans le compartiment `bonus`** (décision du 10/10/2026, EC-CRED-12). Avec tests PGlite. |
| E5 | **Taille des fichiers** | ARCHITECTURE §8.7 : image 10 Mo, PDF 20 Mo. API_SPEC et OpenAPI : 20 Mo pour tout. | ✅ **Corrigé** le 10/10/2026 : API_SPEC §4 et §13, description de `size` dans `openapi.yaml`. Le serveur valide selon le type. |
| E6 | **Nombre de références** | ARCHITECTURE §8.7 : 10 images de référence au maximum. OpenAPI : `reference_paths` jusqu'à 16. | ✅ **Corrigé** le 10/10/2026 : `maxItems: 10` dans `openapi.yaml`, API_SPEC §13. |
| E7 | **Limite de débit** | D8 suppose une fonction `private.hit_rate_limit`, absente de la base. | L'ajouter dans `0003_api_support.sql` (table non journalisée, fenêtre fixe). |
| E8 | **Transfert de propriété** | Décision du 10/10/2026 (SECURITY_NOTES EC-TEAM-06). Aucune route ni fonction. | Route `POST /workspaces/{id}/transfer-ownership` (ajoutée à `openapi.yaml`) + fonction `private.transfer_ownership(ws, new_owner)` : l'ancien propriétaire devient éditeur, dans une seule transaction, journalisé. |
| E9 | **Version des campagnes** | Décision du 10/10/2026 (EC-TEAM-08). | Colonne `campaigns.version int not null default 1`, incrémentée par déclencheur à chaque modification ; `version` obligatoire dans `PATCH` (ajouté à `openapi.yaml`). |
| E10 | **Création du compte à l'inscription** | Aucun déclencheur sur `auth.users` dans 0001/0002 : rien ne crée le profil ni l'espace de travail à l'inscription (constaté en écrivant ROADMAP, S03). | Fonction `private.handle_new_user()` + déclencheur `after insert on auth.users` : profil, espace de travail, membre `owner`, code de parrainage ; testée sur PGlite. **Pas d'essai** : il démarre au clic sur [Commencer] de `/bienvenue/essai` (APPFLOW §5, étape 3), implémenté en S24 (décision du 12/10/2026). |
