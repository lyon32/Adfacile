# Journal de construction — Pubeka

> Tenu par l'agent chef de projet en mode continu ([ROADMAP §8](ROADMAP.md#8-mode-continu--enchaîner-les-sessions-jusquà-la-fin)). Une entrée par session fusionnée, la plus récente en haut.
> Lis d'abord **Questions en attente** : c'est ce qui attend ta réponse.

## Questions en attente

| Session | Question ou action 👤 | Depuis le |
|---|---|---|
| — | — | — |

## Sessions terminées

### S02 · Briques partagées et contrat — ✅ 2026-10-12
- **PR** : #8 (fusionnée en squash, commit 05a3368)
- **Fait** : `packages/shared` (`env.ts` validé par Zod avec les 4 règles d'ENV_SETUP §1.12, `Money` en entiers sans flottant, dates, identifiants, `logger` avec masquage, `assertNever`) ; `packages/contracts` (types générés depuis `openapi.yaml`, `ErrorCode`, `ERROR_STATUS`, `AppError`) ; scripts `api:types`, `openapi:lint`, `test:coverage`.
- **Preuves** : test qui compare `ErrorCode` à l'énumération d'OpenAPI (36 codes) ; tests d'`env.ts` qui refusent `sk_test_` et `PUBEKA_FAKE_PROVIDERS` en production ; couverture de `shared` 98,63 % des lignes (seuil 80 %), `contracts` 100 % ; « CI terminée » verte sur 8e8aacd.
- **Problèmes et cause** : sous-agent coupé une fois par une erreur d'accès à l'API, puis repris avec son contexte. TypeScript 6 n'inclut plus les types de Node d'office : ajout de `"types": ["node"]`.
- **Décisions prises** : `Money` = `{ amountMinor, currency }` ; une variable vide compte comme absente ; `PUBEKA_JOB_DISPATCH` vaut `trigger` par défaut et `inline` est refusé en production ; liste fermée des variables `NEXT_PUBLIC_` ; clé de traduction d'`AppError` en simple chaîne (`contracts` n'importe pas `i18n`). Hors des chemins de S02 mais exigés par la fiche : tâche `api:types` dans `package.json` racine et `turbo.json`.
- **Correction après fusion** (cette PR, `fix/prettier-sources`) : `.prettierignore` (S01) contenait `src/`, ce qui excluait `packages/*/src` de Prettier. Exclusions ancrées à la racine (`/src/`…), fichier généré `src/generated/` exclu, `env.ts` et `logger.ts` formatés.
- **Remarqué hors périmètre** : `coverage:summary` lance encore `scripts/noop.mjs` ; ajouter `yaml` 2.9.1 (dépendance de test) à ENV_SETUP §4.3.


<!-- Modèle d'une entrée :
### SNN · <titre> — ✅ AAAA-MM-JJ
- **PR** : #NN (fusionnée en squash, commit abcdef0)
- **Fait** : 2 à 4 lignes, ce qui marche maintenant
- **Preuves** : commandes et résultats, tests, captures (liens vers la PR)
- **Décisions prises** : … (ou « aucune »)
- **Remarqué hors périmètre** : … (ou « rien »)
-->

### S01 · Squelette du monodépôt — ✅ 2026-10-12
- **PR** : #5 (fusionnée en squash, commit 79850f0)
- **Fait** : monodépôt pnpm 12.7.0 + Turborepo 2.11.4 ; `packages/config` (tsconfig, ESLint, Prettier) ; 13 paquets vides et `jobs` ; `apps/web` en Next 16.3.6 sur le port 5173 avec `proxy.ts` (site / console / admin) et deux pages vides ; `db/` déplacé dans `supabase/` avec un `config.toml` par défaut.
- **Preuves** : `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test`, `build` OK ; `test:db` 44/44 ; aiguillage vérifié par curl (`/` → 308 `/fr`, `/console` `/site` `/admin` → 404 sur les deux domaines) ; captures 390 et 1280 px ; « CI terminée » verte (exécution 38271674174).
- **Problème et cause** : « Recherche de secrets » rouge parce que gitleaks n'avait pas le droit `pull-requests: read` (« Resource not accessible by integration »). Corrigé dans `main` par #6 ; `main` fusionnée dans la branche, puis CI verte.
- **Décisions prises** (avec la personne) : base `main` ; config racine de l'ancien front remplacée (`src/`, `backend/` gardés en référence) ; `supabase/config.toml` par défaut dès S01. `eslint-plugin-boundaries` remplacé par `no-restricted-imports`, parce que le plugin ne détectait pas les imports interdits (vérifié) ; `settings.react.version` écrite, car `eslint-plugin-react` plante sous ESLint 10.
- **Remarqué hors périmètre** : références à `db/…` dans `docs/` ; en-tête « État du dépôt » de CLAUDE.md périmé ; `bench/` sans `package.json` ; ancien `scripts/` à retirer en S12 ; vérification Vercel en échec (projet Vercel pas encore configuré pour le monodépôt, S07).

