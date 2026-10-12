# Journal de construction — Pubeka

> Tenu par l'agent chef de projet en mode continu ([ROADMAP §8](ROADMAP.md#8-mode-continu--enchaîner-les-sessions-jusquà-la-fin)). Une entrée par session fusionnée, la plus récente en haut.
> Lis d'abord **Questions en attente** : c'est ce qui attend ta réponse.

## Questions en attente

| Session | Question ou action 👤 | Depuis le |
|---|---|---|
| S07 | 👤 Créer les identifiants Google OAuth et Apple (Services ID et clé), puis les mettre dans `supabase/.env` ; marche à suivre dans la PR #13 | 2026-10-12 |

## Décisions de la personne

| Date | Session | Décision |
|---|---|---|
| 2026-10-12 | S03 | E10 : le déclencheur d'inscription ne crée **pas** l'essai. L'essai (abonnement `trialing`, crédits `trial`) démarre au clic sur [Commencer] de `/bienvenue/essai` (APPFLOW §5, étape 3) et sera fait en S24. LLD §10 et la fiche S03 sont corrigés. Contradiction relevée par le sous-agent S03 : LLD E10 contre APPFLOW étape 3. |
| 2026-10-12 | S04 | D-1 : CAPTCHA **Cloudflare Turnstile**. Google et Apple passent par Supabase Auth (docs supabase.com/docs/guides/auth/social-login/auth-google et auth-apple). S04 démarre avec de faux fournisseurs ; la connexion devient réelle quand la personne ajoute les identifiants (👤, avant S07). |

## Sessions terminées

### S04 · Connexion et inscription — ✅ 2026-10-12
- **PR** : #13 (fusionnée en squash, commit eee4cd0)
- **Fait** : écrans `/inscription`, `/connexion`, `/mot-de-passe-oublie` (sans habillage final) ; session `@supabase/ssr` dans `proxy.ts` ; e-mail, lien magique, Google et Apple via Supabase Auth ; CAPTCHA Turnstile ; blocage 15 min après 5 échecs par couple e-mail + IP (migration 0004) ; déconnexion après 10 min d'inactivité avec alerte ; salutation selon le fuseau.
- **Preuves** : 102 tests web et 14 tests PGlite (EC-AUTH-01 à 06) ; couverture de `server/` 99 % des lignes ; blocage vérifié sur la pile locale (401 ×4 puis 429, une autre IP passe, une autre origine reçoit 403, « mot de passe oublié » répond dans le même délai pour un e-mail connu ou inconnu) ; inscription réelle par e-mail jusqu'à l'accueil ; 32 captures 390/1280 px, clair et sombre (branche `captures/s04`) ; « CI terminée » verte sur 9eaad7d.
- **Problèmes et cause** : une première règle de blocage en fenêtre glissante débloquait à la 14ᵉ minute ; le test PGlite l'a détecté. La fenêtre d'inactivité était décalée à 390 px par la mise en page par défaut de `<dialog>`.
- **Décisions prises** :
  - Migration 0004 : `private.login_failures` stocke seulement une empreinte SHA-256 de l'e-mail et de l'IP.
  - Le CAPTCHA est demandé à chaque connexion (Supabase l'exige une fois activé).
  - « E-mail déjà utilisé » s'affiche à l'inscription, comme le prévoit APPFLOW §4. Cela révèle qu'un compte existe : **à revoir par la personne** si elle préfère un message neutre.
  - Le lien magique ne crée pas de compte. Salutation « Bonsoir » de 18 h à 3 h 59. Actions `/auth/*` hors de `/api/v1`. Textes dans `features/auth/messages.ts` jusqu'à S09.
- **Action 👤 en attente** : créer les identifiants Google et Apple et les mettre dans `supabase/.env` (marche à suivre dans la PR #13), avant S07.
- **Remarqué hors périmètre** : un nouveau mot de passe identique à l'ancien (`same_password`) affiche un message générique ; `private.login_failures` n'a pas de purge planifiée ; pas de `.env.example` à la racine ; la clé de test Turnstile accepte un faux jeton (le refus est prouvé par des tests unitaires).


### S03 · Base de données : migration 0003 et module `db` — ✅ 2026-10-12
- **PR** : #11 (fusionnée en squash, commit 1cc2bcf)
- **Fait** : migration `0003_api_support.sql` (E1 à E4, E7 à E10) ; `seed.sql` (pays de la zone franc CFA) ; `packages/db` (clients utilisateur et service, types générés, crédits, limites de débit, webhooks, dépôts) ; `DATA_MODEL.md` regénéré (57 tables).
- **Preuves** : `pnpm test:db` donne 44/44 pour les tests existants et 53/53 pour la 0003 ; `supabase db reset` passe en local ; une inscription réelle crée profil, espace, membre `owner` et code de parrainage, sans abonnement ni crédit ; `pnpm db:types` ne produit aucune différence ; `packages/db` couvert à 100 % des lignes ; « CI terminée » verte sur 755a8fd.
- **Problèmes et cause** : arrêt de la session sur la contradiction E10 (LLD contre APPFLOW), tranchée par la personne (#10). Docker Desktop plantait au démarrage à cause d'anciens fichiers de socket dans `%LOCALAPPDATA%/Docker/run` et `docker-secrets-engine`. Le sous-agent a **renommé** ces dossiers en `*.old-*` sans rien supprimer ; ils sont à effacer à la main. `gen-data-model.mjs` recevait un chemin relatif : ajout de `resolve()`.
- **Décisions prises** :
  - E4 : une seule libération par génération ; les crédits sont rendus d'abord dans le compartiment acheté, puis bonus, puis mensuel, dans la limite de ce qui a été réservé dans chacun. La réservation suit l'ordre inverse (0001). Les crédits mensuels sont rendus en bonus quand le dernier `period_end` est passé (EC-CRED-12).
  - E8 : chaque transfert de propriété est journalisé dans `audit.workspace_log`, en ajout seul.
  - Fonctions `public.*` réservées à `service_role`, pour appeler les fonctions de `private` par `rpc()`.
  - `seed.sql` ne contient ni TVA ni taux de change, pour ne rien inventer.
  - Hors des chemins de S03 mais exigé : script `db:types` dans le `package.json` racine.
- **Remarqué hors périmètre** : `config.toml` a `site_url` sur le port 3000 (à corriger en S04) ; SECURITE-BACKEND cite encore `db/` ; `packages/db` n'importe pas `server-only`, car le module sert aussi à `jobs`, et un garde-fou à l'exécution le remplace.


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

