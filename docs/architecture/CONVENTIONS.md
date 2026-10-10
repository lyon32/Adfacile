# Conventions de code — EasAds

> Version 1 · 10 octobre 2026
> Règles que **tout** code d'EasAds respecte, qu'il soit écrit par une personne ou par un agent IA. En cas de doute, ce document l'emporte sur les habitudes personnelles et sur ce que « fait d'habitude » un outil.
>
> Documents liés : [LLD](LLD.md) (arborescence, modules, signatures) · [API_SPEC](API_SPEC.md) · [SECURITE-BACKEND](SECURITE-BACKEND.md) · [DESIGN-SYSTEM](../design/DESIGN-SYSTEM.md).
>
> Légende : ✅ décidé · 🔶 décidé ici, à valider · 🧪 à vérifier à l'installation.

## Sommaire

1. [Versions épinglées](#1-versions-épinglées)
2. [TypeScript](#2-typescript)
3. [Lint et formatage](#3-lint-et-formatage)
4. [Messages de commit, branches, pull requests](#4-messages-de-commit-branches-pull-requests)
5. [Nommage des fichiers et du code](#5-nommage-des-fichiers-et-du-code)
6. [Modèles à suivre](#6-modèles-à-suivre)
7. [Modèles à éviter](#7-modèles-à-éviter)
8. [Avant d'ouvrir une pull request](#8-avant-douvrir-une-pull-request)

---

## 1. Versions épinglées

### 1.1 Règles

1. **Versions exactes** dans chaque `package.json` : pas de `^`, pas de `~`. Le fichier `.npmrc` contient `save-exact=true`.
2. **Une version doit avoir au moins 14 jours** avant d'entrer dans le projet. Les versions trop récentes ont plus souvent des défauts ou ont même été retirées pour cause de piratage.
3. Le fichier `pnpm-lock.yaml` est **commité**. La CI installe avec `pnpm install --frozen-lockfile` : si le fichier ne correspond pas, l'installation échoue.
4. Mises à jour par **Renovate** (🔶), regroupées par famille (Next + React, Supabase, outils de test…), avec `minimumReleaseAge: "14 days"`. Une mise à jour majeure = sa propre pull request, avec lecture des notes de version.
5. Ajouter une dépendance demande, dans la pull request : à quoi elle sert, pourquoi le code existant ne suffit pas, sa licence, et sa taille si elle part dans le navigateur.

### 1.2 Environnement d'exécution

| Outil | Version | Où elle est fixée |
|---|---|---|
| Node.js | **24.21.0** (LTS « Krypton ») | `.nvmrc`, `"engines": { "node": "24.x" }`, réglage Vercel, Trigger.dev |
| pnpm | **12.7.0** | `"packageManager": "pnpm@12.7.0"` (activé par Corepack) |
| Supabase CLI | **2.118.0** | `devDependencies` du dépôt racine |

Node 26 deviendra LTS plus tard. On ne change de version majeure de Node qu'après sa sortie en LTS et sa prise en charge par Vercel **et** par Trigger.dev.

### 1.3 Paquets

La liste complète des paquets et de leurs versions, classée par module, est dans [ENV_SETUP §4](ENV_SETUP.md#4-dépendances-et-versions). Une seule liste, pour éviter deux tableaux qui divergent.

Points à retenir :

- **TypeScript 6.0.3, pas 7.x** : `typescript-eslint` exige TypeScript `< 6.1.0`.
- **`react-email`**, pas `@react-email/components` (abandonné sur npm).
- `eslint-config-next` a toujours la même version que `next` ; `trigger.dev` la même que `@trigger.dev/sdk`.

---

## 2. TypeScript

### 2.1 Réglages (`packages/config/tsconfig.base.json`)

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,     // tableau[i] peut être undefined
    "exactOptionalPropertyTypes": true,   // { a?: string } n'accepte pas a: undefined
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,         // import type obligatoire pour les types
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

### 2.2 Règles

- **Pas de `any`.** Une donnée de forme inconnue est `unknown`, puis validée par Zod.
- **Pas de `as` sur une donnée venue de l'extérieur** (requête, base, fournisseur, `localStorage`). On la valide. `as const` est permis.
- **Pas de `!`** pour forcer une valeur non nulle, sauf dans les tests.
- **Pas d'`enum` TypeScript.** On utilise une union de chaînes, ou un objet `as const` quand il faut aussi la liste des valeurs :
  ```ts
  export const CAMPAIGN_STATUSES = ['draft', 'publishing', 'in_review', /* … */] as const;
  export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
  ```
- Les `switch` sur une union se terminent par `default: assertNever(x)` : un nouveau cas oublié ne compile pas.
- Les fonctions exportées ont un **type de retour écrit**.
- Les types de la base viennent de `supabase gen types`, ceux de l'API d'`openapi-typescript`. **On ne les réécrit jamais à la main.**

---

## 3. Lint et formatage

### 3.1 Fichiers de base

| Fichier | Contenu |
|---|---|
| `.editorconfig` | UTF-8, fins de ligne `LF`, 2 espaces, ligne vide finale, pas d'espaces en fin de ligne |
| `.gitattributes` | `* text=auto eol=lf` : sous Windows, Git écrit quand même des fins de ligne `LF` (aujourd'hui, Git avertit « LF will be replaced by CRLF ») |
| `.nvmrc` | `24.21.0` |
| `.npmrc` | `save-exact=true` · `engine-strict=true` |
| `packages/config/eslint.config.mjs` | configuration ESLint commune (format « flat ») |
| `packages/config/prettier.config.mjs` | configuration Prettier commune |

### 3.2 Prettier

```js
export default {
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  arrowParens: 'always',
  plugins: ['prettier-plugin-tailwindcss'],   // trie les classes Tailwind
};
```

Prettier s'occupe **seul** de la mise en forme. ESLint ne contient aucune règle de mise en forme.

### 3.3 ESLint

Base : `eslint-config-next` (règles `core-web-vitals` et `typescript`) + `typescript-eslint` `strictTypeChecked` et `stylisticTypeChecked` + `eslint-plugin-boundaries`.

Règles ajoutées ou durcies (toutes en **erreur**) :

| Règle | Ce qu'elle bloque |
|---|---|
| `@typescript-eslint/no-floating-promises` | une promesse oubliée (erreur jamais vue) |
| `@typescript-eslint/no-misused-promises` | une fonction `async` passée là où on attend une fonction normale |
| `@typescript-eslint/switch-exhaustiveness-check` | un `switch` qui oublie un cas |
| `@typescript-eslint/consistent-type-imports` | `import { Type }` au lieu de `import type { Type }` |
| `@typescript-eslint/no-explicit-any` | `any` |
| `@typescript-eslint/no-non-null-assertion` | `valeur!` (désactivée dans les tests) |
| `eqeqeq` | `==` et `!=` |
| `no-console` | `console.log` (utiliser le journal `logger`) |
| `import/no-default-export` | `export default`, sauf fichiers imposés par Next.js et fichiers de configuration (§6.11) |
| `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` | mauvaise utilisation des hooks |
| `jsx-a11y/*` (recommandées) | images sans texte alternatif, clics sur un `div`… |
| `boundaries/element-types` | un import qui ne respecte pas les règles de dépendance du [LLD §3](LLD.md#3-règles-de-dépendance-entre-modules) |
| `no-restricted-imports` | les imports interdits ci-dessous |

Imports interdits (`no-restricted-imports`) :

| Import | Pourquoi | À la place |
|---|---|---|
| `createClient` de `@supabase/supabase-js` hors de `packages/db` | un seul endroit crée les clients | `packages/db` |
| `axios` | inutile, une dépendance de plus | `fetch`, ou `packages/api-client` |
| `moment`, `dayjs` | poids, fuseaux mal gérés | `Intl` + fonctions de `packages/shared/time` |
| `@react-email/components` | paquet abandonné | `react-email` |
| `../../packages/…` (chemin relatif entre modules) | contourne les frontières | `@easads/<module>` |
| `gsap`, `lenis` hors de `site/` et `features/marketing/` | animations réservées au site public | transitions CSS courtes |

### 3.4 Commandes

```bash
pnpm format        # prettier --write
pnpm lint          # eslint (avec types) sur tout le dépôt
pnpm typecheck     # tsc --noEmit dans chaque module
pnpm test          # vitest
pnpm openapi:lint  # redocly lint api/openapi.yaml
```

La CI lance tout cela et **bloque la fusion** au premier échec. Pas de crochet Git obligatoire au lancement : chacun lance `pnpm format && pnpm lint` avant de pousser. `// eslint-disable` est permis **une ligne à la fois**, avec la raison sur la même ligne :

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- type externe faux dans @x/y 1.2.3, signalé #123
```

### 3.5 SQL

Mots-clés en **minuscules**, comme dans `0001_init.sql`. Une colonne par ligne dans `create table`. Chaque table a son commentaire de section, sa RLS et ses droits **dans la même migration**.

---

## 4. Messages de commit, branches, pull requests

### 4.1 Commits : *Conventional Commits*, en français

```
<type>(<portée>): <résumé à l'infinitif, sans point final, 72 caractères au plus>

<corps : POURQUOI ce changement, et ce qui n'est pas évident. Lignes de 100 caractères au plus.>

<pied : Refs, BREAKING CHANGE, Co-Authored-By>
```

C'est déjà le style de l'historique : `fix(messagerie): ne pas annoncer Instagram et WhatsApp comme non reliés pendant la vérification`.

| Type | Quand |
|---|---|
| `feat` | nouvelle fonction visible par l'utilisateur |
| `fix` | correction d'un défaut |
| `perf` | plus rapide, sans changer le comportement |
| `refactor` | réorganisation sans changement de comportement |
| `test` | tests seulement |
| `docs` | documentation seulement |
| `build` | dépendances, outils de build |
| `ci` | intégration continue |
| `chore` | ménage, réglages divers |
| `revert` | annulation d'un commit |

**Portées** : le nom d'un module (`core`, `db`, `agents`, `media`, `platforms`, `billing`, `notifications`, `ui`, `i18n`, `contracts`, `jobs`, `web`, `api`) ou d'un domaine (`campagnes`, `visuels`, `paiement`, `credits`, `admin`, `meta`, `site`). Une seule portée par commit. Si deux portées sont nécessaires, c'est souvent deux commits.

Exemples :

```
feat(credits): libérer les crédits des visuels échoués d'une génération partielle
fix(paiement): relire le paiement chez SasPay avant d'activer l'abonnement
refactor(platforms): porter facebookAdsService en TypeScript sans changer le comportement
```

Changement incompatible (API, schéma) : `!` après la portée **et** un pied `BREAKING CHANGE: …` qui explique quoi faire.

```
feat(api)!: renommer analyses en business-analyses

BREAKING CHANGE: les clients doivent appeler /workspaces/{id}/business-analyses.
```

Commit écrit avec un agent IA : pied `Co-Authored-By:` avec le nom de l'agent.

### 4.2 Branches

`<type>/<sujet-en-kebab-case>`, courte durée de vie, partie de `main` : `feat/campaign-publish`, `fix/saspay-webhook-replay`, `docs/easads-prd-agents`.

### 4.3 Pull requests

- Titre au format d'un commit ; fusion par **squash** (un commit propre par pull request sur `main`).
- Description : ce qui change, pourquoi, comment c'est vérifié (tests, capture d'écran pour un écran).
- Une pull request = un sujet. Au-delà d'environ 400 lignes modifiées (hors fichiers générés), la découper.
- Les fichiers générés (`database.types.ts`, `openapi.d.ts`) sont commités, mais **jamais modifiés à la main**.

---

## 5. Nommage des fichiers et du code

### 5.1 Fichiers et dossiers

| Élément | Convention | Exemple |
|---|---|---|
| Fichiers et dossiers de code | `kebab-case` | `create-generation.ts`, `campaign-wizard/` |
| Composant React | fichier `kebab-case`, export `PascalCase` | `model-card.tsx` → `export function ModelCard` |
| Hook | fichier `use-….ts`, fonction `useX` | `use-idle-logout.ts` → `useIdleLogout` |
| Hook de données d'un domaine | `features/<domaine>/api/use-<ressource>.ts` | `features/campaigns/api/use-campaign.ts` |
| Magasin Zustand | `…-store.ts` / `useXStore` | `wizard-store.ts` → `useWizardStore` |
| Cas d'usage | `packages/core/src/<domaine>/<verbe-nom>.ts` | `campaigns/publish-campaign.ts` |
| Dépôt (accès aux tables) | `packages/db/src/repos/<table>.ts` | `repos/campaigns.ts` → `campaignsRepo` |
| Tâche Trigger.dev | `jobs/src/tasks/<domaine>-<action>.ts` | `media-generate.ts` |
| Test unitaire | à côté du fichier, `.test.ts` / `.test.tsx` | `pricing.test.ts` |
| Test de parcours | `apps/web/e2e/<parcours>.spec.ts` | `publish-campaign.spec.ts` |
| Fichier généré | suffixe ou dossier explicite | `database.types.ts`, `generated/openapi.d.ts` |
| Adresses des écrans | **français**, `kebab-case` (APPFLOW §1) | `/campagnes/nouvelle`, `/reglages/kit-de-marque` |
| Adresses de l'API | **anglais**, noms au pluriel, `kebab-case` | `/payment-proofs`, `/ad-accounts` |
| Migration SQL | `NNNN_sujet.sql`, jamais renumérotée | `0003_api_support.sql` |
| Prompt d'agent | `packages/agents/src/<agent>/prompts/v<N>.md` | `stratege/prompts/v2.md` |
| Paquet interne | `@easads/<module>` | `@easads/core`, `@easads/db` |

### 5.2 Code TypeScript

| Élément | Convention | Exemple |
|---|---|---|
| Variables, fonctions | `camelCase` ; une fonction commence par un verbe | `reserveCredits`, `chooseModel` |
| Booléens | `is…`, `has…`, `can…`, `should…` | `isWritable`, `shouldOfferFallback` |
| Types, interfaces | `PascalCase`, sans préfixe `I` | `Campaign`, `PlatformConnector` |
| Schémas Zod | `PascalCase` + `Schema` | `GenerationRequestSchema` |
| Constantes de module | `SCREAMING_SNAKE_CASE` | `CAMPAIGN_TRANSITIONS` |
| Valeurs d'une union | `snake_case`, identiques à la base et à l'API | `'in_review'`, `'insufficient_credits'` |
| Montants | suffixe d'unité **obligatoire** | `amountXaf`, `budgetUsdCents`, `costUsd` |
| Durées | suffixe d'unité **obligatoire** | `timeoutMs`, `maxWaitS` |
| Gestionnaires d'événements | `on…` pour la propriété, `handle…` pour la fonction | `onPublish={handlePublish}` |

**Données venant de la base ou de l'API : `snake_case` conservé, sans conversion.** Un objet `Campaign` a `daily_budget`, pas `dailyBudget`. Une couche de conversion crée des erreurs et deux noms pour la même chose. Les variables locales et les paramètres restent en `camelCase`.

### 5.3 Base de données

| Élément | Convention | Exemple |
|---|---|---|
| Tables | `snake_case`, pluriel | `generation_jobs` |
| Colonnes | `snake_case` ; clé étrangère `<singulier>_id` | `workspace_id` |
| Dates | `…_at` (`timestamptz`) ; jours `…_date` | `created_at`, `start_date` |
| Montants | suffixe d'unité | `amount_xaf`, `cost_usd` |
| Booléens | adjectif ou participe, sans `is_` | `active`, `chosen` |
| Énumérations | `snake_case` | `campaign_status` : `in_review` |
| Fonctions | `verbe_nom`, schéma `private` | `private.reserve_credits` |
| Politiques RLS | `<table>_<action>_<qui>` | `campaigns_select_member` |
| Index | `<table>_<colonnes>_idx` | `campaigns_workspace_id_status_idx` |

### 5.4 Tâches, événements, textes, variables

| Élément | Convention | Exemple |
|---|---|---|
| Tâche Trigger.dev (identifiant) | `domaine.action` | `media.generate`, `campaign.publish` |
| Tâche planifiée | `cron.<sujet>` | `cron.files-cleanup` |
| File Trigger.dev | `kebab-case` | `media-higgsfield` |
| Événement PostHog | `objet_verbe_au_passé` | `campaign_published` |
| Notification | `objet.evenement` | `campaign.rejected` |
| Clé de traduction | `domaine.ecran.element` | `campaigns.publish.confirm_button` |
| Variable d'environnement | `SCREAMING_SNAKE_CASE`, préfixe du service | `SASPAY_SECRET_KEY`, `META_APP_SECRET` |
| Variable lisible par le navigateur | préfixe `NEXT_PUBLIC_`, **jamais un secret** | `NEXT_PUBLIC_SUPABASE_URL` |

---

## 6. Modèles à suivre

### 6.1 Route fine, cas d'usage épais

Une route ne fait que : déclarer ses contrôles, valider, appeler **un** cas d'usage, renvoyer.

```ts
// apps/web/app/api/v1/workspaces/[workspaceId]/campaigns/[campaignId]/publish/route.ts
export const POST = api(
  { auth: 'member', roles: ['owner', 'editor'], writable: true, idempotent: true,
    rateLimit: 'write', body: PublishCampaignBodySchema },
  async (ctx, { body, params }) => ({
    status: 202,
    body: await publishCampaign(ctx, params.campaignId, { acceptLiability: body.accept_liability }),
  }),
);
```

### 6.2 Un cas d'usage = un fichier, un contexte, une erreur typée

```ts
// packages/core/src/campaigns/publish-campaign.ts
export async function publishCampaign(ctx: MemberCtx, campaignId: string, opts: { acceptLiability: boolean }): Promise<Campaign> {
  assertRole(ctx, ['owner', 'editor']);
  assertWritable(ctx);
  const campaign = await campaignsRepo.getForWorkspace(ctx.db, ctx.workspace.id, campaignId);
  if (!campaign) throw new AppError('not_found');
  assertTransition(CAMPAIGN_TRANSITIONS, campaign.status, 'publishing');
  // …
}
```

- Entrée déjà validée (Zod à la frontière) : à l'intérieur, on fait confiance aux types.
- Sortie : la donnée, ou une `AppError` avec un code de la liste fermée. Jamais `return { error }`.
- L'heure vient de `ctx.now()`, jamais de `new Date()` (testable).

### 6.3 Dépôt (*repository*) dans `packages/db`

- Une méthode = une requête précise, **nommée par son intention** : `getForWorkspace`, `listActiveForStatsSync`, `markPublished`. Pas de méthode générique `find(filter)`.
- **Toujours filtrer par `workspace_id`**, même si la RLS le fait déjà : deux barrières valent mieux qu'une.
- Pas de règle métier dans un dépôt : pas de « si le quota est atteint… ». Il lit et écrit.
- Les colonnes sont listées (`select('id, status, …')`), jamais `select('*')` pour une réponse envoyée au client.

```ts
export const campaignsRepo = {
  async getForWorkspace(db: UserClient, workspaceId: string, id: string): Promise<CampaignRow | null> {
    const { data, error } = await db.from('campaigns')
      .select(CAMPAIGN_COLUMNS).eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    return data;
  },
};
```

### 6.4 Machines d'état par tableau de transitions

Statut d'une campagne, d'une génération, d'un paiement, d'un abonnement : **un tableau `TRANSITIONS`** et une fonction `assertTransition()`. Aucun `if (status === 'x' || status === 'y')` dispersé dans le code. Voir [LLD §6.7-6.8](LLD.md#6-fonctions-clés-et-signatures).

### 6.5 Tâches de fond idempotentes

- Une tâche reçoit **des identifiants**, jamais un objet complet ni un secret : `{ jobId }`.
- Elle recharge l'état depuis la base et s'arrête sans rien faire si le travail est déjà fait.
- Aucun nouvel essai automatique d'un appel fournisseur au **résultat ambigu** (on ne sait pas si la génération est partie) : on interroge d'abord le fournisseur.

### 6.6 Argent, temps, unités

- Montants en **entiers** : FCFA, centimes de dollar. Calculs dans `packages/billing` et `packages/shared/money`.
- Dates enregistrées en UTC (`timestamptz`) ; conversion dans le fuseau de l'utilisateur **seulement à l'affichage** (`packages/i18n`).
- Tout nom de variable portant un montant ou une durée a son unité (§5.2).

### 6.7 Hooks React

- **Données du serveur : un hook par ressource**, dans `features/<domaine>/api/`, qui enveloppe TanStack Query avec la fabrique de clés `qk` :
  ```ts
  export function useCampaign(workspaceId: string, campaignId: string) {
    return useQuery({ queryKey: qk.campaign(workspaceId, campaignId),
                      queryFn: () => api.getCampaign(workspaceId, campaignId) });
  }
  ```
  Un composant n'appelle jamais `api-client` ni `fetch` directement.
- **Écritures** : un hook `useXMutation` par action, qui met à jour ou invalide le cache concerné.
- `useEffect` sert **uniquement** à se synchroniser avec un système extérieur (abonnement Realtime, écouteur `online`, minuterie d'inactivité). Pas pour charger des données, pas pour calculer une valeur dérivée.
- Valeur dérivée : calculée pendant le rendu (`const total = budget + vat`), sans `useState` ni `useEffect`.
- Un hook personnalisé renvoie un **objet** (`{ data, isPending, publish }`), pas un tableau, dès qu'il renvoie plus de deux choses.
- `packages/ui` ne contient que des hooks de comportement d'interface (`useMediaQuery`, `usePrefersReducedMotion`), jamais de hook de données.

### 6.8 Composants

- **Composant serveur par défaut.** `"use client"` seulement sur la feuille qui en a besoin (clic, état, navigateur).
- Composants de `packages/ui` purs : pilotés par leurs propriétés, sans appel réseau ni texte en dur.
- Les composants shadcn sont copiés **dans `packages/ui`** et adaptés là. On les étend par des variantes (`cva`), on ne les recopie pas dans une fonctionnalité.
- Styles : classes Tailwind qui utilisent les **jetons** du design system (`bg-surface`, `text-ink-2`). Classes combinées avec l'utilitaire `cn()`.
- Accessibilité : un bouton est un `<button>`, un lien un `<a>` ; chaque champ a son `<label>` ; focus visible ; « réduire les animations » respecté.

### 6.9 Textes et langues

Tout texte visible passe par `t('domaine.ecran.element')` (`next-intl`), y compris les e-mails et le `detail` des erreurs. Les deux fichiers `fr.json` et `en.json` sont modifiés dans le **même** commit ; la CI refuse une clé présente dans un seul fichier.

### 6.10 Sécurité dans le code

- Chaque module serveur commence par `import 'server-only'`.
- Variables d'environnement lues **seulement** via `packages/shared/env.ts` (validées au démarrage), jamais via `process.env.X` ailleurs.
- Ne jamais journaliser : jeton, clé, mot de passe, numéro de téléphone complet, contenu d'une preuve de paiement. Le `logger` masque ces champs par leur nom.
- Schémas Zod des requêtes en mode strict (`z.strictObject`) : un champ inconnu est refusé.
- Toute URL fournie par l'utilisateur passe par `assertPublicUrl()` avant d'être lue ([LLD §6.11](LLD.md#6-fonctions-clés-et-signatures)).

### 6.11 Exports

Exports **nommés** partout. `export default` seulement là où Next.js ou un outil l'impose : `page.tsx`, `layout.tsx`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, `sitemap.ts`, `robots.ts`, fichiers de configuration (`*.config.*`). `proxy.ts` (ex-`middleware.ts` depuis Next 16) utilise l'export nommé `proxy`, pas `export default`. Chaque paquet a **un seul** point d'entrée public (`src/index.ts`) qui liste ce qui est exporté ; les autres fichiers du paquet sont privés.

### 6.12 Tests

- Structure *préparer → agir → vérifier*, un comportement par test, nom en français qui décrit le comportement : `it('refuse la publication quand le quota est atteint')`.
- Pas de réseau dans un test unitaire : les connecteurs et fournisseurs ont une **fausse implémentation** (`FakeMetaConnector`, `FakeFalClient`) qui respecte la même interface.
- Un défaut corrigé = d'abord un test qui échoue, puis la correction.

### 6.13 Commentaires

En français. Ils expliquent **pourquoi** (une règle métier, un piège d'un fournisseur, une décision avec sa référence : « Q48 », « ARCHITECTURE §9.1 »), pas ce que le code fait déjà lisiblement.

---

## 7. Modèles à éviter

| À éviter | Pourquoi | À la place |
|---|---|---|
| Règle métier dans une route ou un composant | dupliquée, non testée, contournable | un cas d'usage dans `packages/core` (§6.1-6.2) |
| *Server Actions* pour une écriture métier | deuxième porte d'entrée, hors contrat d'API | route `/api/v1` (LLD D2) |
| `fetch` dans un `useEffect` | courses entre requêtes, pas de cache, pas de nouvel essai | hook TanStack Query (§6.7) |
| Copier une donnée du serveur dans `useState` ou Zustand | deux vérités qui divergent | lire le cache TanStack Query |
| Lire `error.detail` (ou un texte) pour décider de l'affichage | le texte change avec la langue | tester `error.code` |
| `return { error: '…' }`, `throw new Error('…')` vers le client | format d'erreur différent à chaque route | `throw new AppError(code)` |
| Concaténer du texte dans une requête SQL | injection SQL | client Supabase ou fonction SQL paramétrée |
| Client `service_role` pour une action faite au nom de l'utilisateur | contourne la RLS | `ctx.db` (client soumis à la RLS) |
| Faire confiance à un montant venu du client ou d'un webhook | fraude | montant recalculé et enregistré par le serveur |
| Nombre à virgule pour de l'argent | erreurs d'arrondi | entiers (FCFA, centimes) |
| `new Date()` dans `core` | tests non reproductibles | `ctx.now()` |
| Statut écrit en dur (`'active'`) dans la logique | faute de frappe invisible | constantes et tableau de transitions |
| `enum` TypeScript, `any`, `as` sur des données externes, `!` | sécurité de typage perdue | unions, `unknown` + Zod |
| `export default` (hors cas imposés) | renommages silencieux, recherche difficile | export nommé |
| Fichier `index.ts` qui réexporte tout un dossier dans l'application | dépendances circulaires, build plus lent | import direct du fichier ; un seul `index.ts` public par paquet |
| `dangerouslySetInnerHTML` | injection de script | composant React ; seule exception : JSON-LD produit par `JSON.stringify` |
| Couleur en dur (`#3b5bfd`) ou valeur Tailwind arbitraire (`w-[37px]`) | sort du design system | jeton du design system |
| `console.log` | perdu en production, peut exposer des données | `logger` (relié à Sentry, avec `request_id`) |
| Attraper une erreur et l'ignorer (`catch {}`) | défaut invisible | la relancer, ou la convertir en `AppError` et la journaliser |
| Nouvel essai automatique d'un appel au résultat ambigu (génération, paiement, publication) | double facturation, double campagne | vérifier l'état chez le fournisseur, puis décider |
| Texte affiché écrit en dur dans un composant | pas de traduction | `t('…')` |
| Code commenté laissé dans un fichier, `TODO` sans référence | bruit, oubli | supprimer (Git garde l'historique) ; `TODO(#123)` |
| *Mock* du module testé, instantané (*snapshot*) d'un grand composant | le test ne prouve rien | fausse implémentation de la dépendance, vérifications ciblées |
| Dépendance ajoutée sans justification ni règle des 14 jours | poids, risque de piratage | §1.1 |
| Modifier un fichier généré (`database.types.ts`, `openapi.d.ts`) | écrasé à la prochaine génération | modifier la source (migration, `openapi.yaml`) puis regénérer |

---

## 8. Avant d'ouvrir une pull request

- [ ] `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` passent.
- [ ] Nouvelle route : ajoutée d'abord à `openapi.yaml`, `pnpm openapi:lint` passe, tests des 5 cas (API_SPEC §15).
- [ ] Nouvelle table ou fonction SQL : nouvelle migration, RLS, droits, tests PGlite, `DATA_MODEL.md` regénéré.
- [ ] Nouveau texte : présent dans `fr.json` **et** `en.json`.
- [ ] Écran modifié : capture d'écran dans la description (téléphone et ordinateur).
- [ ] Aucun secret, jeton ou donnée personnelle dans le code, les journaux ou les tests.
- [ ] Message de commit au format du §4.
