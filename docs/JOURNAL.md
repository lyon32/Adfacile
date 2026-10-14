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

### S08 · Design system en composants — ✅ 2026-10-14
- **PR** : #27
- **Fait** : `packages/ui` : jetons du design system (copie exacte de §9, clair et sombre), Button, Field, Switch, Card, Dialog habillés ; Montant, Badge de statut, Carte de modèle ; loader « Saisie » (complet une fois par session, court après 300 ms) ; page de démonstration interne (Vite, port 5180).
- **Preuves** : Playwright 14/14 (axe sans erreur clair/sombre à 390 et 1280 px, réduire les animations, TR-PRF-04) ; Vitest 14/14 ; captures dans `packages/ui/e2e/captures/`.
- **Décisions prises** : démonstration dans `packages/ui` plutôt que dans `apps/web` ; tracé « ubeka » repris du logo SVG ; nouvelles dépendances `vite` 8.3.1, `@vitejs/plugin-react` 6.1.1, `@tailwindcss/vite` 4.3.3.
- **Remarqué hors périmètre** : tracé « ubeka » cassé dans `docs/design/loader/` ; ENV_SETUP §4 à compléter avec les dépendances de la démonstration.

### S07 · Préproduction en ligne — ✅ 2026-10-13
- **PR** : #24 (fusionnée en squash, commit c68f567)
- **Fait** : chaque fusion dans `main` est mise en ligne en préproduction, automatiquement :
  - migrations appliquées sur `pubeka-dev` ;
  - étape Trigger.dev sautée tant que `jobs/` n'existe pas ;
  - construction Vercel ;
  - deux adresses fixes : `pubeka-staging.vercel.app` (application) et `pubeka-staging-site.vercel.app` (site) ;
  - tests de fumée. `apps/web/vercel.json` coupe la mise en ligne automatique de `main` par Vercel.
- **Preuves** :
  - déploiement manuel 38438206070 : tout est vert, 6/6 tests de fumée, migration `0005` présente sur `pubeka-dev` ;
  - déploiement **déclenché par la fusion** 38439376305 (`workflow_run` sur c68f567) : 6/6 ;
  - « CI terminée » verte.
- **Problèmes et cause** (toutes les solutions viennent de la documentation officielle ; règle ajoutée par #25) :
  - jeton Supabase : format, puis permissions. `link` a besoin de Project Settings, API Keys, API Key Secrets et Data API Config en lecture, plus Connection Pooling pour passer en IPv4, car les runners GitHub n'ont pas d'IPv6 ;
  - une panne 502 passagère de Supabase ;
  - `VERCEL_TOKEN` : collé avec un retour à la ligne, puis enregistré vide, puis limité au projet au lieu de l'équipe ;
  - `.vercelignore` d'AdFacile qui excluait `apps/web/.env.example` ;
  - secret de contournement erroné ;
  - `ADMIN_PATH` : la commande donnée par le chef de projet produisait `-` et `_`, refusés par `env.ts` ;
  - `TOKEN_ENCRYPTION_KEYS` et `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` abîmées au collage ; corrigées avec `vercel env update` en lisant l'entrée standard ;
  - test de la racine qui lisait la redirection 307 de Vercel (cookie de contournement) au lieu de notre 308.
- **Décisions prises** :
  - D-6 : adresses Vercel, pas de domaine ;
  - Trigger.dev en offre gratuite : un 2ᵉ projet `pubeka-staging`, dont l'environnement prod sert de préproduction ; `proj_wnjyspfoeknisnyzygkj` est réservé à la production ;
  - nouveau projet Vercel `pubeka` (l'ancien `adsfacile` est à débrancher) ;
  - secrets au niveau du dépôt GitHub ;
  - `PUBEKA_PIPELINE_ENABLED=true` activée par le chef de projet.
- **Remarqué hors périmètre** :
  - `release.yml` : `trigger.dev deploy` sans `--project-ref`, `--token` passé à Vercel, secrets de production à séparer avant S36 ;
  - `e2e:ci` et `e2e:smoke:prod` n'existent dans aucun paquet : la tâche « Parcours critiques » est verte sans rien tester tant que P1 n'existe pas ;
  - `actionlint` n'est pas lancé en CI ;
  - les identifiants Google et Apple restent en attente (👤).


### S06 · Espaces de travail et équipe — ✅ 2026-10-13
- **PR** : #20 (espaces, membres, transfert) et #21 (invitations, e-mail d'invitation), fusionnées en squash. Le sous-agent a coupé la session lui-même (ROADMAP §1.2).
- **Fait** : cas d'usage `core/workspaces` ; routes `/workspaces`, `members`, `invitations`, `invitations/accept` et `transfer-ownership` ; e-mail d'invitation en texte simple, FR et EN, par un faux fournisseur ou par Resend.
- **Preuves** : `test:routes-coverage` couvre 14 opérations, dont les 9 de S06 ; EC-TEAM-01 à 06 en intégration et 07 en test unitaire ; limite de membres par formule testée (Starter, Pro, Business) ; `test:int` 82/82 ; `packages/core` couvert à 100 % des lignes ; « CI terminée » verte sur #20 et #21.
- **Problèmes et cause** : un test de `listMembers` échouait au hasard, parce que deux membres avaient la même date d'arrivée ; un second tri par identifiant a été ajouté. Après la fusion en squash de #20, la PR empilée #21 a eu des conflits ; ils ont été résolus en gardant sa version, qui contient déjà #20, et son diff est resté identique.
- **Décisions prises** :
  - Le propriétaire compte dans la limite de membres (plans-et-credits : Starter = 1). Un espace sans abonnement suit les limites de Starter.
  - EC-TEAM-07 répond 402 `member_limit_reached`, selon la liste fermée d'API_SPEC §4 ; SECURITY_NOTES dit 409 et est à harmoniser.
  - Le transfert de propriété exige une connexion de moins de 5 minutes et est refusé en lecture seule.
  - Invitation valable 7 jours ; les invitations en attente comptent dans la limite ; le jeton est dans le fragment du lien et n'est jamais journalisé.
- **Remarqué hors périmètre** : aucun écran `/invitation` n'est prévu (à ajouter en S09 ou S27) ; dans `turbo.json`, `openapi:lint` et `api:types` ne surveillent pas `api/openapi.yaml` (cache périmé) ; pas de dépôts `db` pour les membres et les invitations ; aucune route pour lister ou annuler les invitations ; pas de purge des invitations expirées ; pas d'état `grace` pour les espaces avant S19.


### S05 · Couche HTTP commune — ✅ 2026-10-13
- **PR** : #16, #17, #18 (fusionnées en squash). La PR d'origine #15 est fermée : 48 fichiers et environ 3 800 lignes dépassaient les plafonds de ROADMAP §1.2. Elle a été coupée en trois parties successives par le chef de projet (§8.5), sans changer le code.
- **Fait** : `server/http` (`api()`, `problem()`, contrôle d'`Origin`, limites de débit, idempotence, SSE) ; `packages/testing` (horloge, fabriques, `seedWorkspace`, `seedAdmin`, `describeRoute`) ; `Ctx` et premiers cas d'usage de `core` ; scripts `ci:env`, `test:int`, `test:routes-coverage` ; routes `/public/*` et `/me`.
- **Preuves** : 45 tests unitaires de `api()` ; `pnpm test:int` 26/26 sur la base locale ; `test:routes-coverage` couvre les 5 opérations codées ; couverture de `server/http` 99,6 % des lignes ; « CI terminée » verte sur les trois PR.
- **Problèmes et cause** : sous-agent coupé une fois par la limite d'utilisation, puis repris. Le premier contrôle d'`Origin` répondait 403 au lieu de 401 sans authentification ; le test d'intégration l'a détecté. Zod 4 ne renvoie pas la valeur reçue dans ses erreurs, d'où une relecture de l'entrée. Dans la partie 2, `test:int` a été retiré tant qu'aucun fichier d'intégration n'existait (vitest échoue sans fichier).
- **Décisions prises** : le contrôle d'`Origin` ne s'applique qu'aux écritures avec cookie ; limites de débit par utilisateur, par IP pour `/public/*` et par espace pour la génération et l'IA ; corps de plus de 1 Mo → 413 ; accès `admin` en 404 jusqu'à S30 ; `DELETE /me` et l'export en S34. Hors chemins mais exigé : `packages/core` (dont `core/account`, de S34) et les réponses 403, 413, 429 et 503 dans `openapi.yaml`.
- **Remarqué hors périmètre** : `proxy.ts` ne rafraîchit pas la session pour `/api` ; règle de salutation en double (`features/auth` et `core/account`) ; `private.rate_limits` sans purge planifiée.


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

