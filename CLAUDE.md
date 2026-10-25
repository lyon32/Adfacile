# Pubeka — consignes pour les agents IA

Lu au début de **chaque** session. Court par principe : le détail est dans `docs/`, et ce fichier dit où.

**Pubeka** est un SaaS qui crée des publicités en ligne en quelques clics grâce à l'IA. Meta Ads aujourd'hui, Google et TikTok « bientôt ». Conçu d'abord pour l'Afrique : paiement Mobile Money par SasPay, francs CFA, français et anglais. Il remplace complètement AdFacile. Domaine : `pubeka.com` (application : `app.pubeka.com`). N'utiliser que ce nom : l'ancien nom de travail est abandonné.

**État du dépôt (10/10/2026)** : la documentation est complète ; le monodépôt n'est **pas encore créé** (session S01). Le code AdFacile (`src/`, `backend/`) est encore présent : c'est une **référence** pour porter le connecteur Meta (S10), à supprimer en S12. Ne pas le modifier, ne pas s'en inspirer pour autre chose.

---

## 1. Ta tâche dans cette session

1. La personne te donne une session : « Session SNN ». Lis sa fiche dans [`docs/ROADMAP.md`](docs/ROADMAP.md) §3 : **But**, **Lire**, **Livrables**, **Fait quand**, **Hors périmètre**.
2. **Aucune session donnée ?** Demande laquelle. Ne choisis pas toi-même, ne commence pas « au plus utile ». **Exception : le mode continu** ([ROADMAP §8](docs/ROADMAP.md#8-mode-continu--enchaîner-les-sessions-jusquà-la-fin)), où le chef de projet prend la session suivante **dans l'ordre strict** (S01, S02, S03…), sans jamais en sauter une.
3. Avant de coder : les sessions de « Après » sont fusionnées, et les décisions ❓ de la fiche sont prises. Sinon, **arrête-toi** et dis ce qui manque.
4. Tu ne modifies **que** les chemins du tableau §5 pour ta session (plus ses tests et la documentation qu'elle cite). Ce que tu remarques ailleurs va dans la description de la PR, pas dans le code.
5. Branche `feat/sNN-<sujet>`, une pull request, la CI au vert. **On ne coche une session ✅ dans ROADMAP §2 que si « CI terminée » est vert et chaque « Fait quand » prouvé** ; chaque coche a son entrée dans [`docs/JOURNAL.md`](docs/JOURNAL.md).

---

### Preuve réelle en attente (S14, S15) — règle de la personne, 17/10/2026

**S14 et S15 n’ont jamais été testées avec un vrai modèle.** Ne les coche jamais dans `docs/ROADMAP.md` §2 et n’écris jamais « ✅ » pour elles dans `docs/JOURNAL.md` (leurs entrées restent « ⏳ code fusionné, test réel en attente ») tant que l’analyse réelle d’un site (S14) et la proposition réelle (S15) ne sont pas prouvées avec des crédits OpenRouter ; elles se testent **ensemble**. **Avant de lancer toute nouvelle session, demande à la personne si les crédits sont disponibles.** Décisions du même jour : **tous les pays d’Afrique** sont pris en charge, **chacun avec sa monnaie et son taux de change réel du marché** (aucun taux unique codé en dur), **TVA retirée pour le moment** (aucun calcul ni affichage).

## 2. Toujours

- **Lire avant d'écrire** : la fiche de session, [CONVENTIONS](docs/architecture/CONVENTIONS.md), [LLD §2-3](docs/architecture/LLD.md), puis chaque document de « Lire ».
- **Charger la compétence (skill) adaptée avant de coder** (§6). Un écran : `frontend-design` **d'abord**, toujours.
- **Le contrat d'abord** : nouvelle route → `api/openapi.yaml` puis `pnpm openapi:lint` ; nouvelle table ou fonction SQL → **nouvelle** migration `supabase/migrations/NNNN_sujet.sql` avec sa RLS et ses tests PGlite.
- **Une route = `api({ … }, handler)` + un cas d'usage de `packages/core`.** Toute la logique métier est dans `core` (LLD §5, §6.1).
- **Valider chaque entrée** avec un schéma Zod strict ; renvoyer chaque erreur par `AppError(code)` avec un code de la **liste fermée** (API_SPEC §4) ; le format est Problem Details (API_SPEC §3).
- **Vérifier l'appartenance à l'espace et le rôle**, et filtrer par `workspace_id` même si la RLS le fait déjà (SECURITY_NOTES §2).
- **Argent en entiers** (FCFA, centimes de dollar), unité dans le nom (`amountXaf`, `budgetUsdCents`) ; dates en UTC ; l'heure vient de `ctx.now()`.
- **`Idempotency-Key`** sur toute action qui dépense de l'argent, des crédits ou un quota ; une tâche de fond reçoit des identifiants et peut être relancée sans double effet.
- **Textes affichés via `t('domaine.ecran.element')`**, en FR **et** en EN dans le même commit.
- **Tests** : unitaires pour les règles, les 5 cas pour chaque route (succès, 401, 404 autre espace, 403 rôle, 400 corps invalide), un test qui échoue **avant** de corriger un défaut ; le nom du test cite l'exigence (`TR-…`, `EC-…`). Détail : [TESTING](docs/architecture/TESTING.md).
- **Prouver avant d'annoncer** : commandes lancées et résultat lu ; pour un écran, captures sur `http://app.localhost:5173` à **390 px et 1280 px**. Rien n'est « fonctionnel » sans preuve à l'écran. Le serveur se lance avec l'**outil de prévisualisation** (`.claude/launch.json`), pas avec Bash ; recharger, lire la console et la page. Ne jamais demander à la personne de vérifier à la main.
- **Documentation à jour avant d'utiliser une bibliothèque ou une API** (outil Context7 s'il est disponible, sinon la documentation officielle) : tes connaissances peuvent être dépassées.
- **Un problème avec un logiciel ou un service externe → lire sa documentation officielle avant de proposer une solution.** Supabase, Vercel, Trigger.dev, GitHub Actions, Next.js, SasPay, Meta, fal, Resend, Cloudflare… : erreur, permission, réglage, commande, format d'une clé. Chercher la page qui en parle (Context7, puis le site officiel du logiciel), appliquer **ce qu'elle dit**, et **citer le lien** dans la réponse, la PR ou le journal. Ne jamais deviner une permission, une option ou un réglage, ni enchaîner des essais au hasard. Si la documentation ne répond pas, le dire et poser la question.
- **Demander plutôt que supposer.** Si une règle manque ou si deux documents se contredisent, pose la question. La personne a été explicite : « je ne veux pas des suppositions ».
- **Commits** au format *Conventional Commits*, en français : `feat(credits): libérer les crédits des visuels échoués` (CONVENTIONS §4).
- **Répondre à la personne** en français, court, action en premier (voir sa préférence de lecture) ; dire clairement ce qui est vérifié et ce qui ne l'est pas.

## 3. Jamais

- Toucher un fichier hors du périmètre de ta session (§5), ou commencer la session suivante.
- **Modifier une migration existante**, un fichier généré (`database.types.ts`, `openapi.d.ts`) ou `pnpm-lock.yaml` à la main.
- `any`, `as` sur une donnée externe, `!`, `enum`, `export default` (sauf fichiers imposés par Next.js), `console.log`, `dangerouslySetInnerHTML`, `// eslint-disable` sans raison écrite.
- Logique métier dans une route ou un composant ; *Server Actions* pour une écriture ; `fetch` dans un `useEffect` ; donnée du serveur copiée dans `useState` ou Zustand (LLD §7).
- **Clé secrète Supabase** (ou tout secret) dans un fichier client ou une variable `NEXT_PUBLIC_` ; un secret, un jeton ou une donnée personnelle dans le code, un test, un journal ou un commit.
- SQL construit par concaténation ; faire confiance à un montant venu du navigateur ou d'un webhook ; webhook traité **avant** vérification de sa signature.
- **Relancer automatiquement** un paiement, une génération ou une publication au résultat incertain (SECURITY_NOTES EC-META-05).
- Appeler un vrai service payant (Meta, SasPay, fal, Higgsfield, IA) dans un test ou dans la CI : utiliser les fausses implémentations (TESTING §6).
- Contourner un CAPTCHA ou une protection anti-robot.
- Inventer un point d'entrée, un champ ou un événement d'un fournisseur : sa documentation fait foi (SasPay : `docs.saspay.me`).
- Ajouter une dépendance sans version exacte publiée depuis **au moins 14 jours** ni justification dans la PR (CONVENTIONS §1).
- Changer de port : l'application tourne **toujours sur 5173**.
- **Faire passer la CI en trichant** : désactiver, ignorer ou supprimer un test, baisser un seuil de couverture, `skip`, `only`, `continue-on-error`. Un problème se diagnostique et se corrige (ROADMAP §8.3).
- `git push --force` sur `main`, `--no-verify`, fusionner avec une CI rouge, **lancer une mise en production** (c'est la personne qui lance `release.yml`).
- **Toucher aux couleurs** (voir ci-dessous).
- Écrire « Facebook » dans le nom ou la marque de Pubeka (on dit « Meta » ; « Page Facebook » reste le nom de l'objet), ou mentionner AdFacile dans le produit.

### Règle absolue : les couleurs sont figées

Les couleurs du produit sont celles du [design system](docs/design/DESIGN-SYSTEM.md), reprises dans les jetons de `packages/ui`. **Ne jamais modifier, remplacer, « harmoniser » ou « moderniser » une couleur**, même quand une compétence de design propose une autre direction : on garde la palette et on applique seulement le reste (espacement, hiérarchie, typographie, états).

- Ne pas changer la valeur d'un jeton de couleur ; ne pas écrire de couleur en dur : réutiliser un jeton existant.
- Besoin réel d'une nouvelle couleur : le signaler à la personne et **attendre sa décision**.
- Seule exception : une demande explicite de la personne portant sur cette couleur précise.

---

## 4. Définition de « fini »

La session est finie quand **tout** ce qui suit est vrai, avec la preuve dans la description de la PR :

- [ ]  Chaque ligne de **« Fait quand »** de la fiche de session est prouvée (commande et résultat, test, capture).
- [ ]  `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` passent en local ; la CI est verte, y compris « CI terminée ».
- [ ]  Nouvelle route : présente dans `openapi.yaml`, `pnpm openapi:lint` passe, ses 5 cas sont testés.
- [ ]  Nouvelle table ou fonction SQL : nouvelle migration, RLS, tests PGlite, `DATA_MODEL.md` regénéré.
- [ ]  Nouveau texte : en FR et en EN.
- [ ]  Écran : captures 390 px et 1280 px, clair et sombre, sans défilement horizontal.
- [ ]  Seuils de couverture respectés (TESTING §4).
- [ ]  Rien hors périmètre ; remarques hors périmètre listées dans la PR.
- [ ]  Case de la session cochée dans `docs/ROADMAP.md` §2 ; documents touchés par une décision mis à jour.

---

## 5. Périmètre de chaque session

`web` = `apps/web` · `api` = `apps/web/app/api/v1` · `core` = `packages/core/src`. Les tests et les fixtures de ces chemins sont toujours inclus.


| Session | Chemins que tu peux modifier                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01     | racine (configuration),`packages/config`, squelette de `web` (`proxy.ts`, deux pages), `packages/*/src/index.ts` vides, `db/` → `supabase/`, `.claude/launch.json`   |
| S02     | `packages/shared`, `packages/contracts`                                                                                                                               |
| S03     | `supabase/`, `packages/db`, `docs/architecture/DATA_MODEL.md`                                                                                                         |
| S04     | `web/app/console/(auth)`, `web/proxy.ts`, `web/server/auth`, `web/features/auth`, `supabase/config.toml`                                                              |
| S05     | `web/server/http`, `web/server/auth`, `api/public`, `api/me`, `packages/testing`, `scripts/ci`                                                                        |
| S06     | `core/workspaces`, `api/workspaces` (équipe, invitations, transfert), `api/invitations`                                                                              |
| S07     | `web/vercel.json`, `web/e2e/smoke`                                                                                                                                    |
| S08     | `packages/ui`                                                                                                                                                         |
| S09     | `web/app/console/(shell)`, `web/features/{shell,onboarding,settings}`, `web/lib`, `web/stores`, `packages/i18n`                                                       |
| S10     | `packages/platforms`                                                                                                                                                  |
| S11     | `core/meta`, `api/workspaces/[workspaceId]/{meta,pages,ad-accounts}`, `api/meta`, `api/webhooks/meta`, `web/features/meta-connection`, écrans de réglages Meta      |
| S12     | suppressions de LLD §2.3 uniquement                                                                                                                                  |
| S13     | `jobs/`, `packages/agents/src/runtime`, `bench/`                                                                                                                      |
| S14     | `packages/agents/src/analyste`, `core/analysis`, `api/…/{uploads,analyses}`, `web/features/campaign-wizard` (Sources, Questions)                                     |
| S15     | `packages/agents/src/stratege`, `core/campaigns`, `api/…/campaigns` (CRUD, propositions), `web/features/campaign-wizard` (Proposition)                               |
| S16     | `core/campaigns` (publication), `jobs/src/tasks/campaign-*`, `api/…/campaigns/…/{publish,pause,resume,relaunch}`, `web/features/campaign-wizard` (Aperçu, Publier) |
| S17     | `core/campaigns` (statuts, statistiques), `jobs/src/schedules`, `api/…/stats`, `web/features/campaigns`, tableau de bord                                             |
| S18     | `packages/agents/src/moderateur`, `core/campaigns/rejections`, `api/…/rejections`                                                                                    |
| S19     | `packages/billing` (`workspaceAccess`), `web/server/http` (`writable`), bandeaux dans `web/features/shell`                                                            |
| S20     | `packages/media` (catalogue, prix, aiguilleur), `api/media-models`                                                                                                    |
| S21     | `packages/media/src/providers`, `core/generations`, `jobs/src/tasks/media-*`, `api/…/generations`, `api/webhooks/[provider]`                                         |
| S22     | `packages/media/src/layers`, `packages/agents/src/designer`, `core/visuals`                                                                                           |
| S23     | `web/features/{generation,visuals}`, `api/…/visuals`, étape Visuel de l'assistant                                                                                   |
| S24     | `packages/billing`, `core/billing` (crédits, essai), `api/…/{billing,credits}`, tâche des crédits, écran `/abonnement`                                           |
| S25     | `packages/billing/src/saspay`, `core/billing` (paiement), `api/…/{checkout,payments}`, `api/webhooks/saspay`, `web/features/billing`                                 |
| S26     | `core/billing` (preuves, parrainage), `api/…/{payment-proofs,referral}`, tâches de rappel, écrans preuve et parrainage                                             |
| S27     | `packages/notifications`, `api/notifications`, `api/webhooks/[provider]` (Resend), `web/features/notifications`, tâches de bienvenue et de résumé                  |
| S28     | `core/support`, `packages/agents/src/aide`, `api/…/{tickets,assistant}`, `web/features/support`                                                                      |
| S29     | `packages/agents/src/optimiseur`, `core/optimizer`, `api/…/recommendations`, `web/features/stats`, tâche de l'Optimiseur                                            |
| S30     | `web/app/admin` (accès, clients), `web/server/auth/admin.ts`, `api/admin` (utilisateurs, espaces, crédits), `web/features/admin`                                    |
| S31     | `web/app/admin` (réglages), `api/admin` (le reste)                                                                                                                   |
| S32     | `web/app/site`, `web/features/marketing`, `sitemap.ts`, `robots.ts`                                                                                                   |
| S33     | `web/app/site/[locale]/{aide,blog}`, pages légales, blog dans l'administration                                                                                       |
| S34     | `web/lib/outbox.ts`, `web/stores/outbox-store.ts`, `core/account`, `web/features/settings` (mes données)                                                             |
| S35     | lecture partout ; modifications**uniquement** pour la sécurité, la performance ou l'accessibilité                                                                  |
| S36     | configuration de production ; aucun code métier                                                                                                                      |

---

## 6. Compétences (skills) à appeler

**Règle n° 1 : nommer le domaine de la tâche, appeler la compétence, puis seulement coder.** Jamais l'inverse, y compris pour une « petite » modification (un bouton, une marge, une requête) : c'est là qu'on s'écarte des conventions. Une tâche mixte appelle plusieurs compétences. Aucune ligne ne correspond : appeler `find-skills`.

Deux sources : les compétences **du dépôt** (`.claude/skills/`, disponibles pour tout agent qui clone le projet) et celles **installées sur le poste** de la personne. Si une compétence n'est pas disponible dans ton environnement, suis les documents de `docs/`.

Compétences du dépôt utiles à Pubeka : `turborepo` (monodépôt, S01), `shadcn` (composants shadcn, S08), `test-driven-development`, `debugging-and-error-recovery`, `source-driven-development` (vérifier la documentation d'une bibliothèque avant de l'utiliser), `doubt-driven-development` (décisions à fort enjeu : sécurité, paiement, migration). **Ne pas utiliser** `pr-open`, `unit-tests`, `bklit-*` ni `add-x-tweet` : elles viennent d'un autre projet (bklit-ui) et lancent des outils qui n'existent pas ici.


| Quand                                         | Compétence                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fonction floue, plusieurs approches possibles | `superpowers:brainstorming`, puis `superpowers:writing-plans`                                                                           |
| Exécuter un plan écrit                      | `superpowers:executing-plans`                                                                                                           |
| Écrire du code testé                        | `superpowers:test-driven-development`, `javascript-testing-patterns`, `e2e-testing-patterns`                                            |
| Un défaut, un test qui échoue               | `superpowers:systematic-debugging`, `debugging-strategies`                                                                              |
| Avant de dire « c'est fait »                | `superpowers:verification-before-completion`                                                                                            |
| Fin de session, pull request                  | `superpowers:finishing-a-development-branch`, `superpowers:requesting-code-review`, `code-review-excellence`      |
| **Tout écran ou composant**                  | **`frontend-design`** (obligatoire), puis `typography`, `tailwind-design-system`, `design-system-patterns`, `responsive-design`, `interaction-design` — **sans jamais toucher aux couleurs** (§3) |
| **Retirer le « look IA »** (après `frontend-design`, avant « fini ») | `impeccable`, `emil-design-eng`, `baseline-ui` (du dépôt : pas de dégradés ni de violet, couleurs et jetons existants), puis `improve-ui` (audit en lecture seule) — **ils améliorent le rendu (espacement, hiérarchie, typographie, états, mouvement), jamais les couleurs ni l'identité** (§3) |
| Composants shadcn                             | `shadcn` (du dépôt)                                                                                                                     |
| Monodépôt, Turborepo                          | `turborepo` (du dépôt)                                                                                                                  |
| Accessibilité, mouvement                     | `accessibility-compliance`, puis `accesslint-audit`, `wcag-audit-patterns`, `fixing-accessibility`, `fixing-motion-performance` (du dépôt) |
| Next.js, React, état                         | `nextjs-app-router-patterns`, `react-best-practices`, `react-state-management`, `composition-patterns`, `typescript-advanced-types`     |
| Base de données                              | `postgresql`, `database-migration`, `sql-optimization-patterns`                                                                         |
| API, erreurs, connexion                       | `api-design-principles`, `openapi-spec-generation`, `error-handling-patterns`, `auth-implementation-patterns`                           |
| Prompts des agents                            | `prompt-engineering-patterns`                                                                                                           |
| Animations du site public                     | `gsap-core`, `gsap-react`, `gsap-scrolltrigger`, `gsap-performance`, `improve-animations`                                               |
| Git avancé, historique                        | `git-advanced-workflows`                                                                                                                |
| Référencement du site public                | `seo-technical`, `seo-schema`, `seo-hreflang`, `seo-sitemap`                                                                            |
| CI, déploiement                              | `github-actions-templates`, `deployment-pipeline-design`, `deploy-to-vercel`, `vercel-cli-with-tokens`                                  |
| Mise à jour de dépendances                  | `dependency-upgrade`                                                                                                                    |
| Textes de l'interface                         | `writing-guidelines`                                                                                                                    |
| Une décision 🔶 devient définitive          | `architecture-decision-records`                                                                                                         |


### Compléments installés : ECC (plugin `affaan-m/ECC`)

Installé par la personne. **Facultatif**, à utiliser **si le besoin se présente**, jamais par défaut. Les règles de ce fichier priment toujours.

- **Utile en relecture** (ils lisent, ils ne remplacent ni le contrôleur ni la CI) : `ecc:security-reviewer` (chiffrement, webhooks, paiement, SSRF), `ecc:database-reviewer` (migrations, RLS), `ecc:silent-failure-hunter` (erreurs avalées), `ecc:typescript-reviewer`, `ecc:react-reviewer`, `ecc:build-error-resolver` (build qui échoue, correctif minimal).
- **Pas pour écrire du code métier** hors du périmètre de la session (§5), ni pour contourner une règle (§3).
- **Ne pas lancer** les commandes de workflow qui prennent la main sur le mode continu (`ecc:orch-*`, `ecc:prp-*`, `ecc:multi-*`, `ecc:loop-*`, `ecc:feature-dev`).
- **`ecc:astra-review` est interdit** : il envoie le code à un service tiers (OpenAI).
- **Ne pas activer** ses hooks ni modifier `~/.claude/settings.json` sans l'accord de la personne.
- **Le résultat d'un agent ECC est un avis.** Ce qui touche l'argent, la sécurité ou les données se vérifie dans les documents (ROADMAP §8.2).
---

## 7. Où trouver quoi


| Question                                 | Document                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quoi construire, pour qui                | [PRD](docs/produit/PRD.md) · [PROJECT_BRIEF](docs/produit/PROJECT_BRIEF.md)                                                                                                     |
| Quel écran, quel état                  | [APPFLOW](docs/produit/APPFLOW.md)                                                                                                                                               |
| Quelle exigence prouver                  | [TRD](docs/produit/TRD.md) (`TR-…`)                                                                                                                                             |
| Dans quel ordre                          | [ROADMAP](docs/ROADMAP.md)                                                                                                                                                       |
| Quelle technologie, pourquoi             | [ARCHITECTURE](docs/architecture/ARCHITECTURE.md)                                                                                                                                |
| Où va le fichier, quelle signature      | [LLD](docs/architecture/LLD.md)                                                                                                                                                  |
| Quelle route, quel format, quelle erreur | [`api/openapi.yaml`](api/openapi.yaml) · [API_SPEC](docs/architecture/API_SPEC.md)                                                                                              |
| Quelle table, quelle colonne             | [DATA_MODEL](docs/architecture/DATA_MODEL.md) · `supabase/migrations/`                                                                                                          |
| Qui a le droit, quel cas limite          | [SECURITY_NOTES](docs/architecture/SECURITY_NOTES.md) (`EC-…`) · [SECURITE-BACKEND](docs/architecture/SECURITE-BACKEND.md)                                                     |
| Comment nommer, quelle version           | [CONVENTIONS](docs/architecture/CONVENTIONS.md) · [ENV_SETUP §4](docs/architecture/ENV_SETUP.md)                                                                               |
| Quelles variables, comment installer     | [ENV_SETUP](docs/architecture/ENV_SETUP.md)                                                                                                                                      |
| Quoi tester, comment                     | [TESTING](docs/architecture/TESTING.md)                                                                                                                                          |
| Comment ça se déploie                  | [CI_CD](docs/architecture/CI_CD.md)                                                                                                                                              |
| Agents IA                                | [docs/agents/](docs/agents/README.md) · banc : `bench/`                                                                                                                         |
| Apparence                                | [DESIGN-SYSTEM](docs/design/DESIGN-SYSTEM.md)                                                                                                                                    |
| Médias, crédits                        | [capacites-medias](docs/architecture/capacites-medias.md) · [catalogue-modeles](docs/architecture/catalogue-modeles.md) · [plans-et-credits](docs/produit/plans-et-credits.md) |

## 8. Commandes

Monodépôt créé en S01 (les commandes sans contenu réussissent à vide jusqu'à leur session) :


| Commande                                                   | Effet                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`                                                 | application sur `localhost:5173` (site) et `app.localhost:5173` (application) + tâches |
| `pnpm supabase start` · `pnpm supabase db reset`          | base locale · repartir de zéro                                                       |
| `pnpm format && pnpm lint && pnpm typecheck && pnpm test`  | à lancer avant chaque poussée                                                        |
| `pnpm test:db` · `pnpm test:int` · `pnpm e2e`            | base (PGlite) · intégration · parcours                                              |
| `pnpm openapi:lint` · `pnpm api:types` · `pnpm db:types` | contrat · types de l'API · types de la base                                          |

Depuis S01, les tests de la base se lancent avec `pnpm test:db` (script `supabase/tests/security.test.mjs`, PGlite de `packages/db`) ; les migrations sont dans `supabase/migrations/`. Le banc des agents reste `node bench/run.mjs`.
