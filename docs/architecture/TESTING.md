# Stratégie de test — EasAds

> Version 1 · 10 octobre 2026
> Ce qui est testé, à quel niveau, avec quel outil, quel taux de couverture est exigé, et comment on fabrique les données de test.
>
> Documents liés : [TRD](../produit/TRD.md) (exigences et leur « Vérification ») · [CONVENTIONS §6.12](CONVENTIONS.md#612-tests) (écriture d'un test) · [LLD](LLD.md) · [API_SPEC §15](API_SPEC.md#15-règles-pour-écrire-un-point-dentrée) · [ENV_SETUP](ENV_SETUP.md) · banc de test des agents : [`bench/`](../../bench/).
>
> Légende : ✅ décidé (dans un document précédent) · 🔶 décidé ici, à valider · 🧪 à vérifier à l'installation.

## Sommaire

1. [Principes](#1-principes)
2. [Les niveaux de test](#2-les-niveaux-de-test)
3. [Quoi tester à quel niveau](#3-quoi-tester-à-quel-niveau)
4. [Couverture attendue](#4-couverture-attendue)
5. [Données de test et fixtures](#5-données-de-test-et-fixtures)
6. [Fausses implémentations des services externes](#6-fausses-implémentations-des-services-externes)
7. [Intégration continue](#7-intégration-continue)
8. [Tests manuels avant une mise en production](#8-tests-manuels-avant-une-mise-en-production)
9. [Bibliothèques de test](#9-bibliothèques-de-test)

---

## 1. Principes

1. **Un test prouve une exigence.** Chaque exigence du TRD dont la vérification est « test automatique » a au moins un test qui la cite dans son nom de fichier ou de bloc : `describe('TR-PAY-02 — registre des crédits', …)`.
2. **Le test le plus bas qui suffit.** Une règle de calcul se prouve par un test unitaire, pas par un parcours dans le navigateur. Les parcours sont réservés à ce que seuls eux peuvent prouver.
3. **Aucun appel réseau réel, aucun argent dépensé** dans la CI, sauf dans les deux exceptions planifiées : le banc des agents (§2.6) et le contrôle des fournisseurs (§2.7).
4. **Reproductible.** L'heure, les identifiants et les réponses des fournisseurs sont fixés par le test. Un test qui échoue « de temps en temps » est un défaut à corriger, pas à relancer (§7.3).
5. **La sécurité se teste en attaquant.** Pour chaque route et chaque table : essayer avec un autre espace, un rôle trop faible, sans session, avec une signature fausse. Ces cas sont obligatoires, pas facultatifs.
6. **Un défaut corrigé = d'abord un test qui échoue**, puis la correction (CONVENTIONS §6.12).

---

## 2. Les niveaux de test

| Niveau | Ce qu'il prouve | Outil | Où | Durée visée |
|---|---|---|---|---|
| **Unitaire** | Une fonction ou un composant seul, sans base ni réseau | Vitest (Node) ; Vitest + Testing Library + happy-dom pour les composants | à côté du fichier : `*.test.ts(x)` | < 2 min pour tout le dépôt |
| **Contrat** | Le code respecte `openapi.yaml` ; chaque fausse implémentation se comporte comme le vrai service | Vitest | `packages/contracts`, `packages/testing/contracts/` | < 30 s |
| **Base de données** | RLS, droits, fonctions protégées, ajout seul | Node + PGlite (existant, 44 tests) | `supabase/tests/` | < 1 min |
| **Intégration** | Une route ou un cas d'usage avec la **vraie** base Supabase locale (Auth, PostgREST, RLS, Storage), services externes remplacés | Vitest + Supabase local | `apps/web/server/**/*.int.test.ts`, `packages/core/**/*.int.test.ts` | < 6 min |
| **Parcours (e2e)** | Un parcours complet dans un vrai navigateur | Playwright + `@axe-core/playwright` | `apps/web/e2e/*.spec.ts` | < 10 min (sélection critique) |
| **Banc des agents** | Qualité des sorties d'agents avec les vrais modèles | `bench/` (existant) | `bench/` | selon le nombre de cas |
| **Contrôle des fournisseurs** | Les vrais fournisseurs répondent toujours comme nos fixtures | Vitest, vraies clés | `packages/testing/smoke/` | quelques minutes |

### 2.1 Unitaire

Fonctions pures et règles métier : calculs, transitions d'état, validations, formats. Pas de base, pas de réseau, pas de minuterie réelle. L'heure vient de `fixedClock()` (§5.4).

### 2.2 Contrat

- Chaque schéma Zod de `contracts` **accepte** l'exemple de son schéma OpenAPI et **refuse** un champ inconnu.
- La liste des codes d'erreur du code est **identique** à l'énumération `ErrorCode` d'`openapi.yaml` (test qui compare les deux).
- **Même suite de tests pour la fausse et la vraie implémentation** d'un service externe (§6.2) : la fausse est testée à chaque commit, la vraie lors du contrôle des fournisseurs (§2.7).

### 2.3 Base de données

Les tests existants (`db/tests/security.test.mjs`, déplacés dans `supabase/tests/`) tournent sur PGlite, qui simule les rôles Supabase. Toute nouvelle table ou fonction ajoute ses tests ici **dans la même migration** (CONVENTIONS §8).

### 2.4 Intégration 🔶

Contre la **vraie** pile Supabase locale (`supabase start`), parce que PGlite ne reproduit ni l'API REST de Supabase, ni Auth, ni Storage. Les services externes sont remplacés par leurs fausses implémentations (§6) et les tâches de fond s'exécutent **dans le même processus** (`EASADS_JOB_DISPATCH=inline`, §6.1), pour qu'un test puisse suivre une génération du début à la fin sans Trigger.dev.

Une route est appelée directement (`POST(request, { params })`), sans démarrer de serveur HTTP.

### 2.5 Parcours (e2e)

Playwright contre `next build && next start` sur le port 5173, base Supabase locale, fausses implémentations, tâches en mode `inline`. Deux tailles d'écran à chaque exécution : **390 × 844** (téléphone) et **1280 × 800** (ordinateur). Chaque parcours lance aussi un contrôle d'accessibilité automatique (axe) sur les écrans traversés.

### 2.6 Banc des agents ✅

Le banc existant (`bench/run.mjs`, jeux `businesses`, `strategist`, `designer`, `rejections`, `trap`) appelle les **vrais** modèles. Il est obligatoire pour **tout changement de prompt ou de modèle** (TR-AGT-04) et doit atteindre les seuils de TR-AGT-05. Les cas pièges (`trap.json`) prouvent TR-SEC-07 (injection) et TR-AGT-06 (illégal évident).

### 2.7 Contrôle des fournisseurs 🔶

Lancé **à la main ou une fois par semaine** (pas à chaque commit, car il coûte de l'argent) : une génération au niveau Standard du modèle le moins cher de chaque fournisseur, une lecture de taux SasPay, un appel Meta en lecture sur le compte de test. Il vérifie que les réponses ont toujours la forme de nos fixtures (§5.6). Un écart = fixtures à réenregistrer et code à adapter.

---

## 3. Quoi tester à quel niveau

### 3.1 La règle de choix

| La chose à prouver… | Niveau |
|---|---|
| est un calcul, une règle, une transition, un format | **Unitaire** |
| traverse la base, la RLS, l'authentification ou plusieurs modules | **Intégration** |
| concerne les droits d'une table ou d'une fonction SQL | **Base de données** |
| n'existe que dans le navigateur (enchaînement d'écrans, Realtime à l'écran, hors connexion) | **Parcours** |
| dépend de la qualité d'une réponse d'IA | **Banc des agents** |
| dépend du comportement réel d'un fournisseur | **Contrôle des fournisseurs** |
| est visuel, tactile ou subjectif (rendu à 360 px, animation, thème) | **Manuel** (§8) |

### 3.2 Par module

| Module | Unitaire | Intégration | Parcours |
|---|---|---|---|
| `packages/billing` | **Tout** : montants, frais, TVA, change, upgrade, accès (grâce, lecture seule) | — | paiement de bout en bout |
| `packages/media` | prix en crédits, aiguilleur, `shouldOfferFallback`, rendu des calques (dimensions, zones, débordement) | copie dans le stockage privé | génération visible un par un |
| `packages/platforms/meta` | tests portés d'AdFacile (TR-PLA-02), traduction des erreurs Meta, chiffrement des jetons | — | publication (fausse Meta) |
| `packages/agents` | `runAgent` : validation, 1 seul nouvel essai, détection d'injection, `wrapUntrusted` | — | — (banc) |
| `packages/core` | machines d'état, règles de chaque cas d'usage avec dépôts simulés | **chaque cas d'usage** avec la vraie base | via les parcours |
| `packages/db` | — | chaque dépôt (filtre `workspace_id`, colonnes renvoyées) | — |
| `packages/contracts` | contrat (§2.2) | — | — |
| `packages/notifications` | choix du modèle d'e-mail, langue, respect des préférences | écriture dans `notifications` | — |
| `packages/shared`, `i18n` | argent, dates, fuseaux, salutation (TR-PLT-04), `env.ts` | — | — |
| `apps/web/server/http` | `api()` : ordre des contrôles, `problem()`, idempotence, limites, `Origin` | **chaque route** : les 5 cas d'API_SPEC §15 | — |
| `apps/web/server/webhooks` | signature : bonne, fausse, trop vieille, rejouée | traitement complet d'un webhook | — |
| `apps/web/features` | hooks (avec MSW), composants à logique (assistant, choix du modèle, compte à rebours d'inactivité), `outbox` | — | **parcours critiques** (§3.4) |
| `packages/ui` | uniquement les composants à comportement (sélecteur, montant) | — | — |
| `jobs` | — | chaque tâche avec `inline` : idempotence (lancée deux fois = un seul effet) | — |
| `proxy.ts` | aiguillage par hôte, 404 sur `/site`, `/console`, `/admin` en accès direct | — | — |

### 3.3 Exigences du TRD et leur test automatique

| Exigence | Niveau | Ce que le test fait |
|---|---|---|
| TR-SEC-01 (RLS sur 100 % des tables) | Base + intégration | Pour **chaque** table : un membre de l'espace A ne lit ni n'écrit une ligne de B (tableau généré depuis la liste des tables, une table oubliée fait échouer le test) |
| TR-SEC-04 (webhooks signés) | Unitaire + intégration | Pour **chaque** fournisseur : bonne signature acceptée, fausse refusée (`401`), horodatage de plus de 5 min refusé, même événement deux fois = traité une fois |
| TR-SEC-05 (idempotence des paiements) | Intégration | Même clé et même corps = même réponse et une seule session SasPay ; même clé et autre corps = `409 idempotency_key_reused` |
| TR-SEC-06 (administration) | Intégration + parcours | Non-administrateur, administrateur sans aal2, administrateur verrouillé : `404` ; chaque action écrit une ligne dans le journal |
| TR-SEC-08 (fichiers) | Unitaire + intégration | Image de 10 Mo + 1 octet refusée, PDF de 20 Mo accepté, faux type (PNG renommé en PDF) refusé par les premiers octets, 11 références refusées |
| TR-SEC-09 (limites) | Intégration | 61ᵉ écriture dans la minute → `429` avec `Retry-After` |
| TR-SEC-13 (inactivité) | Unitaire (minuterie simulée) + parcours | Avertissement à 9 min, déconnexion à 10 min, brouillon retrouvé après reconnexion |
| TR-SEC-14 (blocage après 5 échecs) | Intégration | 6ᵉ tentative refusée, acceptée après 15 min (horloge simulée) |
| TR-DON-07 (ajout seul) | Base | `update` et `delete` sur `credit_ledger` et `audit.admin_log` refusés par la base, même avec la clé secrète |
| TR-DON-09 (pas de mélange entre clients) | Unitaire + intégration | L'entrée d'un agent ne contient que des données de l'espace demandé |
| TR-PLA-08 / 09 (Pages, quota) | Intégration | Page hors formule refusée ; quota décompté au clic sur Publier ; republication après refus non décomptée ; échec de publication = quota rendu |
| TR-PLA-10 (budget ≥ 1 $) | Unitaire | 99 centimes refusés (`budget_too_low`) |
| TR-AGT-01 (schéma) | Unitaire | Sortie invalide → 1 nouvel essai avec l'erreur → échec visible ; jamais un 3ᵉ appel |
| TR-AGT-08 (Optimiseur) | Intégration | Aucune action envoyée à Meta sans `apply` explicite |
| TR-MED-03 (texte sans IA) | Intégration | Modifier le titre : aucun appel au fournisseur, 0 crédit, nouveau rendu |
| TR-MED-08 (bascule proposée) | Unitaire + intégration | Attente de 61 s : `fallback_offer` rempli ; rien ne change sans `POST …/fallback` |
| TR-MED-10 (jamais facturé deux fois) | Intégration | Même identifiant de requête fournisseur reçu deux fois : un seul visuel, une seule consommation |
| TR-PAY-01 / 04 (formules, crédits) | Unitaire | Tableau de valeurs fixes (§5.5) |
| TR-PAY-02 / 03 (registre) | Base + intégration | Réservation, consommation, libération, ordre mois → bonus → achetés, crédits achetés jamais expirés |
| TR-PAY-05 (activation sur webhook) | Intégration | Webhook signé + paiement relu chez SasPay → abonnement actif ; montant différent de celui enregistré → refus |
| TR-PAY-07 (grâce, lecture seule) | Intégration | J+3 : écriture refusée `403 workspace_read_only` ; pause **acceptée** ; paiement et ticket acceptés |
| TR-PAY-08 (upgrade) | Unitaire + intégration | Starter → Pro : 7 000 XAF, +5 crédits, même date de fin (APPFLOW §15.4) |
| TR-PAY-10 / 11 (essai, parrainage) | Intégration | Deuxième essai refusé ; 2 + 2 crédits au **premier** paiement du filleul seulement |
| TR-DON-02 / 04, TR-PAY-06, TR-PLA-07, TR-NOT-03, TR-OBS-02 | Intégration (tâches en `inline`) | Chaque tâche planifiée lancée avec une horloge fixée produit exactement l'effet attendu, et rien de plus si on la relance |

### 3.4 Parcours critiques (e2e lancés à chaque pull request)

| # | Parcours | Prouve |
|---|---|---|
| P1 | Inscription par e-mail → lien reçu → première configuration → tableau de bord | compte, langue, fuseau, salutation |
| P2 | Créer une campagne : sources → questions → proposition (affichage progressif) → visuel → aperçu → publier | parcours principal, quota, fausse Meta |
| P3 | Générer 3 visuels : coût affiché, visuels affichés un par un, échec d'un visuel = crédit rendu | crédits, Realtime, TR-PRF-06 |
| P4 | Payer une formule (fausse SasPay) → webhook → abonnement actif ; puis acheter des crédits | paiement, idempotence |
| P5 | Abonnement expiré → lecture seule → mise en pause acceptée, création refusée | TR-PAY-07 |
| P6 | Hors connexion : modifier un réglage, couper le réseau, revenir → envoyé ; bouton Publier désactivé | TR-PLT-08 |
| P7 | Administration : `404` sans droits ; avec aal2 → offrir des crédits → ligne dans le journal | TR-SEC-06, TR-ADM-01 |

Parcours complets supplémentaires (chaque lundi, sur 3 navigateurs — hebdomadaire pour tenir dans le quota de minutes GitHub, CI_CD §10) : refus et Modérateur, relance de campagne, invitation d'un membre et rôles, tickets de support, parrainage, bascule de modèle après 60 s, changement de langue (TR-PLT-03).

---

## 4. Couverture attendue

### 4.1 Seuils par module (Vitest + `@vitest/coverage-v8`) 🔶

La CI **échoue** sous ces seuils. Ils portent sur les tests unitaires et d'intégration réunis.

| Module | Lignes | Branches | Pourquoi |
|---|---|---|---|
| `packages/billing` | **95 %** | **90 %** | Argent : une erreur coûte au client ou à EasAds |
| `packages/media/src/pricing.ts`, `router.ts` | **95 %** | **90 %** | Crédits et bascule |
| `packages/core` (machines d'état, crédits, publication) | **95 %** | **90 %** | Cœur métier |
| `packages/core` (le reste) | 85 % | 80 % | |
| `apps/web/server` (`http/`, `auth/`, `webhooks/`) | **90 %** | **85 %** | Porte d'entrée et sécurité |
| `packages/platforms`, `packages/agents/runtime` | 85 % | 80 % | |
| `packages/shared`, `packages/i18n`, `packages/notifications` | 80 % | 75 % | |
| `apps/web/features` | 60 % | 50 % | Le comportement visible est prouvé par les parcours ; on ne court pas après le pourcentage |
| `packages/ui` | pas de seuil | | Composants d'affichage |

Exclus du calcul : fichiers générés (`database.types.ts`, `openapi.d.ts`), `index.ts` de réexport, fichiers de configuration, `packages/testing`.

### 4.2 Couvertures « 100 % » vérifiées par script

Le pourcentage de lignes ne prouve pas tout. Ces règles-ci sont comptées par des scripts qui échouent en CI :

| Règle | Comment elle est vérifiée |
|---|---|
| **100 % des opérations** d'`openapi.yaml` ont leurs 5 cas (succès, `401`, `404` autre espace, `403` rôle, `400` corps invalide) ; les routes publiques et webhooks ont leurs cas propres | `pnpm test:routes-coverage` compare les `operationId` du contrat aux tests qui les déclarent (`describeRoute('publishCampaign', …)`) |
| **100 % des tables** ont un test d'accès croisé (TR-SEC-01) | le test lit la liste des tables dans la base et échoue pour toute table sans cas |
| **100 % des fournisseurs de webhooks** ont les 4 cas de signature (§3.3) | liste des fournisseurs lue depuis le type `WebhookProvider` |
| **100 % des transitions** des machines d'état : chaque transition permise est testée, et au moins une interdite par état | tests générés depuis les tableaux `*_TRANSITIONS` |
| **100 % des clés de traduction** présentes en FR et en EN | `pnpm i18n:check` |

### 4.3 Ce qu'on ne fait pas

- Pas de test écrit uniquement pour monter un pourcentage (un test sans vérification réelle est refusé en revue).
- Pas d'instantané (*snapshot*) d'un grand composant ou d'une grande réponse : on vérifie les champs qui comptent.
- La couverture d'un module critique **ne baisse jamais** d'une pull request à l'autre, même au-dessus du seuil.

---

## 5. Données de test et fixtures

Tout le matériel de test partagé vit dans un module réservé aux tests : **`packages/testing`** (`@easads/testing`), jamais importé par le code de production (règle de frontière, LLD §3). 🔶

```
packages/testing/
├─ src/
│  ├─ clock.ts                 fixedClock(), advance()
│  ├─ ids.ts                   identifiants déterministes
│  ├─ builders/                build*() : objets en mémoire (unitaire)
│  ├─ factories/               create*() : lignes en base (intégration)
│  ├─ scenarios/               seedWorkspace(), seedAdmin() … (intégration, e2e)
│  ├─ fakes/                   fausses implémentations (§6)
│  ├─ msw/                     gestionnaires MSW construits depuis les fixtures
│  └─ contracts/               suites de contrat partagées faux / vrai (§6.2)
├─ fixtures/
│  ├─ meta/                    réponses enregistrées de l'API Graph (anonymisées)
│  ├─ saspay/                  réponses et webhooks enregistrés
│  ├─ fal/ · higgsfield/       réponses de file, de résultat, de refus (NSFW)
│  ├─ agents/                  sorties d'agents valides et invalides
│  ├─ images/                  photos produit de test (fabriquées, ≤ 50 Ko)
│  └─ README.md                date d'enregistrement, version d'API, méthode
└─ smoke/                      contrôle des fournisseurs (§2.7)
```

### 5.1 Constructeurs (`build*`) — tests unitaires

Un constructeur renvoie un objet **complet et valide** en mémoire, avec des valeurs par défaut réalistes ; le test ne précise que ce qui compte pour lui.

```ts
const campaign = buildCampaign({ status: 'rejected' });
const sub = buildSubscription({ status: 'active', period_end: at('2026-10-31') });
```

Règle : si un test doit préciser plus de 3 champs pour être lisible, il manque un constructeur ou un scénario.

### 5.2 Fabriques (`create*`) — tests d'intégration

Même signature que les constructeurs, mais la ligne est **écrite dans la base locale** avec la clé secrète, et la fonction renvoie la ligne enregistrée.

```ts
const campaign = await createCampaign(svc, { workspace_id: ws.id, status: 'draft' });
```

### 5.3 Scénarios — un espace prêt à l'emploi

```ts
export async function seedWorkspace(opts?: {
  plan?: PlanCode | 'trial';
  access?: 'active' | 'grace' | 'read_only';
  credits?: { monthly?: number; bonus?: number; purchased?: number };
  pages?: number;
  metaConnected?: boolean;
}): Promise<{
  workspace: WorkspaceRow;
  owner: TestUser; editor: TestUser; viewer: TestUser;   // TestUser = { id, email, db: UserClient, headers }
  stranger: TestUser;                                    // membre d'un AUTRE espace : sert aux tests 404
}>;

export async function seedAdmin(opts?: { aal: 'aal1' | 'aal2'; locked?: boolean }): Promise<TestUser>;
```

Chaque fichier de test crée **ses propres** espaces : aucune donnée partagée entre fichiers, donc des tests qui tournent en parallèle sans se gêner. La base locale est vidée une fois au début de l'exécution (`supabase db reset`), pas entre chaque test.

**Utilisateurs de test** : créés par l'API d'administration d'Auth de la pile locale, puis connectés pour obtenir un vrai jeton. Pour l'administration, le facteur TOTP est enrôlé et le code calculé avec `otplib`, afin d'obtenir une vraie session `aal2`. 🧪 À confirmer avec la version de la CLI Supabase épinglée.

### 5.4 Heure et identifiants

- **Heure** : `fixedClock('2026-10-10T09:00:00Z')` passé dans `ctx.now` ; `advance({ days: 3 })` pour tester la grâce, l'expiration à 7 jours, les rappels J-3/J-1/J0. Dans les composants : `vi.useFakeTimers()`.
- **Fuseaux** : les tests de dates tournent avec au moins deux fuseaux, `Africa/Douala` (UTC+1) et `Africa/Abidjan` (UTC+0), plus `UTC`.
- **Identifiants** : générés par `ids.ts` à partir d'une graine dans les tests unitaires (même identifiant à chaque exécution) ; laissés à la base en intégration.

### 5.5 Valeurs fixes pour l'argent et les crédits

Les exemples chiffrés des documents produit deviennent des **tests à valeurs fixes** (tableau d'entrées et de sorties attendues). Si un document change, le test change dans la même pull request.

| Source | Exemples transformés en test |
|---|---|
| [plans-et-credits.md](../produit/plans-et-credits.md) | prix et crédits des 3 formules, prix d'un crédit, minimum vidéo de 2 crédits |
| [calcul-credits.md](../rapports/calcul-credits.md) | crédits par modèle et par niveau selon `max(minimum, arrondi au-dessus(coût XAF ÷ seuil))` |
| [APPFLOW §15.4](../produit/APPFLOW.md) | upgrade Starter → Pro : **7 000 XAF**, **+5 crédits**, même date de fin |
| [ARCHITECTURE §9](ARCHITECTURE.md) | ordre de consommation, grâce de 3 jours, crédits achetés sans expiration |

Cas limites ajoutés à chaque fois : 0, 1, la valeur juste sous un seuil et juste au-dessus, et un taux de change non entier.

### 5.6 Fixtures des fournisseurs

- **Réponses réellement enregistrées**, une fois, avec les clés de test, par `pnpm fixtures:record <fournisseur>` (lancé à la main), puis **anonymisées** par le script (jetons, identifiants de compte, numéros, URL signées remplacés) et **relues dans la pull request**.
- Chaque dossier a un `README.md` : date d'enregistrement, version de l'API (ex. Meta `v25.0`), scénario de chaque fichier.
- Les fixtures alimentent **à la fois** les gestionnaires MSW (tests de clients HTTP et de hooks) et les fausses implémentations (§6).
- Webhooks : le fichier contient le **corps exact**. La signature est recalculée par le test avec un secret de test (`whsec_test…`, `test_signing_secret`), selon la méthode réelle de chaque fournisseur (SasPay : HMAC-SHA256 de `"<timestamp>.<corps>"`).
- Le contrôle des fournisseurs (§2.7) signale toute fixture devenue fausse.

### 5.7 Données personnelles et images

- **Jamais de données de vrais clients** dans un test, une fixture ou une capture, même anonymisées à la main.
- E-mails en `@example.com` (domaine réservé à cet usage) ; numéros de téléphone fictifs ; noms de commerces inventés.
- Les jeux d'entreprises du banc (`bench/datasets/businesses.json`) sont réutilisés comme entrées réalistes pour les tests de l'Analyste et du Stratège.
- Images : photos produit **fabriquées pour les tests** (objets simples sur fond uni), sans marque réelle, 50 Ko au maximum chacune.

---

## 6. Fausses implémentations des services externes

### 6.1 Liste

| Fausse implémentation | Remplace | Ce qu'elle sait simuler |
|---|---|---|
| `FakeMetaConnector` | `packages/platforms/meta` | campagnes en mémoire avec leurs statuts ; jeton expiré, moyen de paiement absent, budget trop bas, refus avec motif, erreur passagère |
| `FakeSaspay` | client SasPay | session de paiement, paiement réussi / échoué / expiré, envoi d'un webhook **signé** vers l'application |
| `FakeMediaProvider` | fal, Higgsfield, BytePlus | file d'attente avec position, délai réglable, succès, échec, contenu refusé (NSFW), panne, résultat ambigu |
| `FakeAiGateway` | passerelle IA texte | sortie d'agent tirée des fixtures ; sortie invalide (pour tester le nouvel essai) ; flux progressif |
| `FakeReader` | lecture interne et Jina | page lue, page illisible, redirection vers une adresse privée (anti-SSRF) |
| `FakeMailer` | Resend | garde les e-mails envoyés pour que le test les lise |
| `InlineJobDispatcher` | Trigger.dev | exécute la tâche dans le même processus ; `EASADS_JOB_DISPATCH=inline`, **refusé en production** 🔶 |

Ce sont **les mêmes** que celles activées par `EASADS_FAKE_PROVIDERS` en développement (ENV_SETUP §1.1) : une seule fausse implémentation par service.

### 6.2 Contrat commun

Chaque service a **une suite de tests de contrat** écrite une fois, et lancée sur deux cibles :

```ts
// packages/testing/src/contracts/media-provider.contract.ts
export function mediaProviderContract(name: string, make: () => MediaProviderClient) {
  describe(`${name} — contrat MediaProviderClient`, () => {
    it('renvoie un identifiant de requête unique pour chaque envoi', async () => { /* … */ });
    it('signale un contenu refusé comme nsfw, pas comme une erreur', async () => { /* … */ });
  });
}
// Faux : à chaque commit.            mediaProviderContract('fake', () => new FakeMediaProvider());
// Vrai : contrôle des fournisseurs.  mediaProviderContract('fal', () => new FalClient(env.FAL_KEY));
```

Ainsi une fausse implémentation ne peut pas « mentir » longtemps : si le vrai service change, le contrôle des fournisseurs échoue.

---

## 7. Intégration continue

### 7.1 Étapes (détail des fichiers : [CI_CD](CI_CD.md))

| Moment | Étapes | Bloquant |
|---|---|---|
| Chaque pull request | format, lint, typage, `openapi:lint`, unitaires + contrat, base (PGlite), intégration (Supabase local), parcours **P1 à P7** sur Chromium (2 tailles), couverture (§4), `routes-coverage`, `i18n:check`, recherche de secrets, build | ✅ |
| Pull request qui touche `packages/agents/**/prompts/**` ou le modèle d'un agent | + **banc des agents** (vraies clés dans les secrets GitHub) | ✅ |
| Chaque lundi (`scheduled.yml`) | parcours complets sur Chromium, Firefox et WebKit ; failles de toutes les dépendances | alerte e-mail |
| Chaque lundi ou à la main | contrôle des fournisseurs (§2.7) | alerte e-mail |
| Avant une mise en production | tests manuels (§8) | ✅ (case cochée dans la pull request de mise en production) |

Supabase local en CI : `supabase start` en excluant les services inutiles aux tests (Studio, analytique). 🧪 Durée à mesurer ; si elle dépasse 4 minutes, l'image est mise en cache.

### 7.2 Rapports

- Résumé de couverture par module affiché dans la page de la tâche de CI (`coverage:summary`) ; fichiers de couverture conservés 14 jours.
- Échec d'un parcours : trace Playwright, capture et vidéo jointes aux artefacts de la CI.

### 7.3 Tests instables

- Unitaires et intégration : **aucune** relance automatique.
- Parcours : **une** relance en CI ; un test qui ne passe qu'à la relance est signalé dans le rapport.
- Un test instable est corrigé, ou mis en quarantaine avec l'étiquette `@quarantaine` et un ticket, **7 jours au maximum**. Passé ce délai, il est corrigé ou supprimé.
- Interdit : `sleep` et attentes fixes. On attend une condition (`expect.poll`, `await expect(locator).toBeVisible()`).

---

## 8. Tests manuels avant une mise en production

Ce que le TRD marque « test manuel » et qu'un test automatique ne prouve pas bien. Liste cochée dans la pull request de mise en production.

| Exigence | Vérification |
|---|---|
| TR-PLT-01 | Parcours P2 à **360, 390, 768 et 1280 px** : pas de défilement horizontal, gouttière de 16 px |
| TR-PLT-02 | Chrome Android, Safari iOS, Chrome, Edge, Firefox, Safari (2 dernières versions) |
| TR-PLT-06, TR-PRF-09 | Thème sombre ; « réduire les animations » activé dans le système |
| TR-PLT-08 | Mode avion sur un vrai téléphone |
| TR-PRF-04 | Loader complet une seule fois par session ; version courte seulement si le chargement dépasse 300 ms (réseau ralenti dans les outils du navigateur) |
| TR-ACC-03 | Navigation au clavier sur P2 et P4, focus visible, cibles tactiles ≥ 44 px |
| TR-PLA-04 | Bilan de santé sur un vrai compte Meta de test |
| Critère d'acceptation 1 | Une **vraie campagne** publiée sur le compte publicitaire de test via EasAds |
| Critère d'acceptation 3 | Un **vrai paiement SasPay** en clé `sk_test_` active un abonnement |
| TR-SEC-06 | Essai d'intrusion manuel sur l'administration (chemin, aal2, verrouillage) |
| TR-DON-05 | Suppression d'un compte de test : données EasAds effacées, campagne toujours présente chez Meta |

---

## 9. Bibliothèques de test

Versions relevées le 10/10/2026 selon la règle des 14 jours (CONVENTIONS §1.1). Elles sont aussi listées dans [ENV_SETUP §4](ENV_SETUP.md#4-dépendances-et-versions).

| Paquet | Version | Usage |
|---|---|---|
| `vitest` | **5.0.2** | unitaires, contrat, intégration |
| `@vitest/coverage-v8` | **5.0.2** | couverture (même version que `vitest`) |
| `@testing-library/react` | **16.3.3** | composants |
| `@testing-library/dom` | **10.4.2** | requis par Testing Library |
| `@testing-library/user-event` | **14.6.7** | clics et saisies réalistes |
| `@testing-library/jest-dom` | **7.0.1** | vérifications sur le DOM |
| `happy-dom` | **20.14.5** | navigateur simulé pour Vitest |
| `msw` | **2.15.0** | réponses HTTP simulées ; la 3.0.0 est sortie le 28/09, trop récente |
| `@playwright/test` | **1.63.0** | parcours |
| `@axe-core/playwright` | **4.13.0** | accessibilité automatique dans les parcours |
| `otplib` | **13.5.0** | codes TOTP pour les sessions d'administration de test |
| `@electric-sql/pglite` | **0.5.8** | tests de sécurité de la base |
