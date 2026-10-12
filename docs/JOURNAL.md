# Journal de construction — Pubeka

> Tenu par l'agent chef de projet en mode continu ([ROADMAP §8](ROADMAP.md#8-mode-continu--enchaîner-les-sessions-jusquà-la-fin)). Une entrée par session fusionnée, la plus récente en haut.
> Lis d'abord **Questions en attente** : c'est ce qui attend ta réponse.

## Questions en attente

| Session | Question ou action 👤 | Depuis le |
|---|---|---|
| — | — | — |

## Sessions terminées

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

