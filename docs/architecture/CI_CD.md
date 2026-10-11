# Pipeline CI/CD — Pubeka

> Version 1 · 10 octobre 2026
> Comment le code passe d'une pull request à la production : vérifications, préproduction, mise en production, migrations, retour arrière, secrets.
>
> Fichiers : [`.github/workflows/`](../../.github/workflows/) · action commune [`.github/actions/setup`](../../.github/actions/setup/action.yml).
> Documents liés : [TESTING](TESTING.md) (quoi tester) · [ENV_SETUP](ENV_SETUP.md) (variables) · [CONVENTIONS](CONVENTIONS.md) (versions, commits) · [SECURITE-BACKEND](SECURITE-BACKEND.md).
>
> Légende : ✅ décidé ou vérifié · 🔶 décidé ici, à valider · 🧪 à vérifier à l'activation.

**État au 10/10/2026 :** les fichiers existent et passent `actionlint` 1.7.12 avec `shellcheck` 0.11.0, sans aucune remarque. Ils **ne font rien** tant que le monodépôt n'existe pas : la CI s'arrête d'elle-même sans `pnpm-workspace.yaml`, et les déploiements attendent la variable `PUBEKA_PIPELINE_ENABLED` (§9). L'ancien `main.yml` d'AdFacile (Railway, Cypress, `staging.adsfacile.cm`), qui échouait à chaque push, est retiré.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Environnements](#2-environnements)
3. [Intégration continue](#3-intégration-continue)
4. [Préproduction](#4-préproduction)
5. [Mise en production](#5-mise-en-production)
6. [Règles des migrations](#6-règles-des-migrations)
7. [Retour arrière](#7-retour-arrière)
8. [Sécurité du pipeline](#8-sécurité-du-pipeline)
9. [Activation](#9-activation)
10. [Coûts](#10-coûts)

---

## 1. Vue d'ensemble

```
 pull request ──► CI (ci.yml) ───────────────► « CI terminée » obligatoire pour fusionner
      │            format · lint · typage · contrat · secrets · migrations intactes
      │            unitaires · base · intégration · parcours P1-P7 · build
      │          + banc des agents si un prompt change (agents-bench.yml)
      │          + préversion Vercel automatique (projet Supabase de développement)
      ▼
 fusion (squash) dans main
      │
      ▼
 CI sur main ──► réussie ──► PRÉPRODUCTION automatique (deploy-staging.yml)
                              1. migrations → Supabase de développement
                              2. tâches → Trigger.dev « staging »
                              3. application → Vercel, adresse fixe de préproduction
                              4. tests de fumée
      │
      ▼
 PRODUCTION, lancée À LA MAIN (release.yml) pour un commit précis de main
      vérifications : commit sur main · préproduction réussie · migrations destructives
      1. migrations → Supabase de production
      2. tâches → Trigger.dev « prod »
      3. application → Vercel production
      4. tests de fumée en lecture seule ── échec ──► retour arrière Vercel automatique
      5. étiquette release-AAAA.MM.JJ-N + note de version

 Chaque lundi (scheduled.yml) : parcours sur 3 navigateurs · failles des dépendances · vrais fournisseurs
```

**Pourquoi la production est lancée à la main** 🔶 : sur un dépôt privé, l'approbation obligatoire avant un déploiement dépend de l'offre GitHub (🧪). Un lancement manuel fonctionne avec toutes les offres, et la personne choisit **quand** les clients reçoivent le changement.

---

## 2. Environnements

| | Local | CI | Préversion (par PR) | Préproduction | Production |
|---|---|---|---|---|---|
| Déclenchement | `pnpm dev` | chaque PR et chaque push sur `main` | automatique, intégration Git de Vercel | après la CI réussie sur `main` | à la main |
| Supabase | local (Docker) | local (Docker, dans la CI) | projet **développement** | projet **développement** | projet **production** |
| Trigger.dev | `trigger.dev dev` | tâches dans le processus (`inline`) | aucune 🔶 | environnement **staging** (offre Hobby, §10) | environnement **prod** |
| Services externes | faux (`PUBEKA_FAKE_PROVIDERS=all`) | faux | clés de **test** | clés de **test** (SasPay `sk_test_`) | clés de production |
| Adresse | `app.localhost:5173` | — | adresse générée par Vercel | adresse fixe 🔶, ex. `staging-app.pubeka.com` | `app.pubeka.com`, `pubeka.com` |
| Variables d'application | `.env.local` | valeurs publiques + secrets aléatoires | Vercel *Preview* | Vercel *Preview* + Trigger.dev *staging* | Vercel *Production* + Trigger.dev *prod* |

Les secrets **de l'application** vivent dans Vercel et Trigger.dev (ENV_SETUP §2). GitHub ne garde que les jetons qui servent à **déployer** (§9.3).

Préversions de PR : elles partagent le projet Supabase de développement avec la préproduction. Une PR qui contient une **nouvelle migration** n'a donc pas sa migration en préversion (elle n'est appliquée qu'après la fusion) : la préversion peut échouer sur les écrans concernés. C'est accepté ; la CI, elle, teste la migration sur sa propre base locale.

---

## 3. Intégration continue

### 3.1 `ci.yml` — à chaque pull request et à chaque push sur `main`

| Tâche | Contenu | Durée visée | Brouillon de PR |
|---|---|---|---|
| Monodépôt présent ? | arrête tout si `pnpm-workspace.yaml` manque | < 1 min | lancée |
| Format, lint, typage, contrat | `format:check`, `lint`, `typecheck`, `openapi:lint`, `i18n:check`, `pnpm audit --prod` (critiques) | 6 min | lancée |
| Recherche de secrets | gitleaks sur tout l'historique | 1 min | lancée |
| Migrations jamais modifiées | échoue si une migration existante est modifiée, renommée ou supprimée | < 1 min | lancée |
| Tests unitaires, contrat et base | Vitest avec seuils de couverture (TESTING §4.1), PGlite, résumé de couverture dans la page de la tâche | 5 min | lancée |
| Intégration | Supabase local, `test:int`, `test:routes-coverage` | 10 min | **ignorée** |
| Parcours critiques P1 à P7 | build + démarrage sur le port 5173 + Playwright Chromium, 390 et 1280 px | 15 min | **ignorée** |
| Build | `pnpm build` | 6 min | lancée |
| **CI terminée** | réussit si aucune tâche n'a échoué ni été annulée | < 1 min | lancée |

- Les tâches lourdes ne tournent pas sur un **brouillon** de PR ; elles se lancent dès que la PR passe « prête pour relecture ».
- Une nouvelle poussée sur la même PR **annule** l'exécution en cours (économie de minutes).
- **« CI terminée »** est la seule vérification à rendre obligatoire dans la protection de `main` (§9.4).

### 3.2 `agents-bench.yml` — si un prompt, un modèle ou un jeu de test d'agent change

Lance `node bench/run.mjs` avec les **vraies** clés (environnement GitHub `pubeka-agents-bench`), conserve `bench/results` 30 jours. Obligatoire pour fusionner une PR qui touche un prompt (TR-AGT-04). 🧪 Le banc doit **échouer** (code de sortie différent de 0) sous les seuils de TR-AGT-05 : à ajouter dans `bench/run.mjs`.

### 3.3 `scheduled.yml` — chaque lundi à 06:00 UTC

- Tous les parcours sur **Chromium, Firefox et WebKit** (TESTING §3.4).
- `pnpm audit` sur toutes les dépendances (seuil « élevé »).
- **Contrôle des vrais fournisseurs** (TESTING §2.7) avec les clés de test de l'environnement `pubeka-provider-tests`.

Un échec envoie l'e-mail de notification habituel de GitHub. Les trois contrôles peuvent aussi être lancés à la main.

---

## 4. Préproduction

`deploy-staging.yml`, déclenché quand la CI **réussit sur un push dans `main`** (jamais pour une PR), ou à la main.

| Étape | Commande | En cas d'échec |
|---|---|---|
| 1. Migrations | `supabase link`, `supabase db push --dry-run` (affiché), puis `supabase db push` | arrêt : ni tâches ni application déployées |
| 2. Tâches | `trigger.dev deploy --env staging --external-id <sha>` | arrêt |
| 3. Application | `vercel pull --environment=preview`, `vercel build`, `vercel deploy --prebuilt`, puis `vercel alias set` vers l'adresse fixe | arrêt |
| 4. Tests de fumée | `pnpm e2e:smoke` contre l'adresse fixe, avec l'en-tête de contournement de la protection Vercel (`VERCEL_AUTOMATION_BYPASS_SECRET`) | la préproduction est marquée en échec ; **ce commit ne peut pas partir en production** |

**L'ordre est fixe** : base → tâches → application. Le nouveau code ne tourne jamais sur une base qui n'a pas encore ses migrations. L'inverse (ancien code sur une base déjà migrée) arrive pendant quelques minutes : c'est pour cela que les migrations doivent rester compatibles avec la version précédente (§6).

Une seule préproduction à la fois ; une nouvelle attend la fin de la précédente au lieu de l'interrompre.

---

## 5. Mise en production

`release.yml`, **Actions → Mise en production → Run workflow**, avec :

- `sha` : le commit de `main` à mettre en production ;
- `allow_destructive_migrations` : case à cocher, seulement après la vérification du §6.3.

| Étape | Ce qui est vérifié ou fait |
|---|---|
| Vérification 1 | Le commit est bien sur `main` |
| Vérification 2 | La préproduction **de ce commit précis** a réussi |
| Vérification 3 | Les migrations ajoutées depuis la dernière mise en production ne contiennent pas d'instruction destructive, sauf si la case est cochée |
| 1. Migrations | aperçu, puis application sur le projet Supabase **de production** |
| 2. Tâches | `trigger.dev deploy --env prod --external-id <sha>` |
| 3. Application | `vercel build --prod` puis `vercel deploy --prebuilt --prod` |
| 4. Tests de fumée | `pnpm e2e:smoke:prod` : **lecture seule**, aucune écriture en production (pages publiques, `/api/v1/public/maintenance`, page de connexion) |
| Si l'étape 4 échoue | `vercel rollback` : le site et l'API reviennent **automatiquement** à la version précédente ; la tâche est marquée en échec |
| 5. Étiquette | `release-AAAA.MM.JJ-N` sur le commit, note de version générée à partir des messages de commit |

Une seule mise en production à la fois. Le projet Vercel **ne publie jamais seul en production** depuis Git (§9.2) : seule cette tâche le fait.

---

## 6. Règles des migrations

### 6.1 Toujours vers l'avant

- **Aucune migration de retour** (*down*). Une erreur se corrige par une **nouvelle** migration.
- Une migration déjà fusionnée n'est **jamais** modifiée : la CI le refuse (tâche « Migrations jamais modifiées »).

### 6.2 Compatible avec la version précédente (« étendre, puis réduire ») 🔶

Pendant un déploiement, l'ancien code tourne quelques minutes sur la base déjà migrée. Une migration ne doit donc **rien casser pour le code actuellement en production** :

| Changement voulu | Mise en production 1 (étendre) | Mise en production 2 (réduire), plus tard |
|---|---|---|
| Renommer une colonne | ajouter la nouvelle colonne, écrire dans les deux, recopier les données | supprimer l'ancienne colonne |
| Supprimer une colonne | le code cesse de la lire et de l'écrire | supprimer la colonne |
| Rendre une colonne obligatoire | ajouter avec une valeur par défaut, remplir les lignes existantes | ajouter `not null` |
| Changer un type | nouvelle colonne du nouveau type, recopie | supprimer l'ancienne |

### 6.3 Migrations destructives

La mise en production refuse une migration qui contient `drop table`, `drop column`, `drop type`, `drop function`, `drop schema`, `drop view`, `truncate`, `delete from` ou un changement de type de colonne, sauf si la case `allow_destructive_migrations` est cochée. Avant de la cocher :

1. Vérifier que la mise en production précédente a déjà retiré tout usage de l'élément supprimé (§6.2).
2. Vérifier dans Supabase qu'une **sauvegarde de moins de 24 heures** existe (sauvegardes quotidiennes de l'offre Pro, ARCHITECTURE §2).
3. Lancer d'abord la même migration en préproduction et regarder le résultat.

Le filtre a été essayé sur des exemples : il détecte `drop column`, `truncate table`, `delete from` et `alter column … type`, et **ne bloque pas** les migrations 0001 et 0002, où le mot « truncate » sert à interdire le vidage des tables protégées.

**Interdit dans la CI** : copier des données de production (sauvegarde, export) vers GitHub ou vers le projet de développement (SECURITE-BACKEND §8).

---

## 7. Retour arrière

| Partie | Comment revenir en arrière | Durée |
|---|---|---|
| Site et API (Vercel) | Automatique si les tests de fumée échouent. Sinon : `vercel rollback`, ou **Promote** sur un déploiement précédent dans le tableau de bord Vercel | < 1 min |
| Tâches (Trigger.dev) | Relancer `trigger.dev deploy --env prod` depuis l'étiquette précédente (`git checkout release-…`). 🧪 Vérifier s'il existe une commande pour revenir à une version déjà déployée | quelques minutes |
| Base de données | **Pas de retour en arrière automatique.** Corriger par une nouvelle migration. En dernier recours : restauration de la sauvegarde quotidienne (perte possible jusqu'à 24 h de données, TR-DSP-02) | selon le cas |
| Fonction risquée | Interrupteur de fonctionnalité PostHog (*feature flag*) : couper la fonction sans redéployer 🔶 | immédiat |
| Tout le service | Mode maintenance depuis l'administration, sans redéployer (TR-DSP-03) ; les webhooks restent traités (SECURITY_NOTES EC-ADM-02) | immédiat |

Comme les migrations restent compatibles avec la version précédente (§6.2), revenir au code précédent **sans toucher à la base** fonctionne dans la très grande majorité des cas.

---

## 8. Sécurité du pipeline

| Règle | Où |
|---|---|
| Chaque action tierce est **épinglée à un commit précis** (SHA de 40 caractères) avec la version en commentaire : une étiquette modifiée par un attaquant ne change rien | tous les fichiers |
| Versions des actions publiées depuis au moins 14 jours (CONVENTIONS §1.1), relevées le 10/10/2026 | §8.1 |
| Droits minimaux : `contents: read` par défaut ; `contents: write` et `actions: read` seulement pour la mise en production | tous les fichiers |
| `persist-credentials: false` : le jeton GitHub n'est pas laissé dans le dépôt cloné | tous les `checkout` |
| Pas de `pull_request_target` ; les secrets ne sont jamais disponibles pour du code de PR non fusionné, sauf le banc des agents (dépôt privé, PR des seuls membres) | `ci.yml`, `agents-bench.yml` |
| Valeurs venues de GitHub (`base_ref`, entrées du formulaire) passées par des variables d'environnement, jamais insérées directement dans un script (injection) | `ci.yml`, `release.yml` |
| Secrets de déploiement rangés par **environnement GitHub** (préproduction, production) : un jeton de production n'est jamais lisible par une tâche de préproduction | §9.3 |
| Aucun secret d'application dans GitHub : ils restent dans Vercel et Trigger.dev | ENV_SETUP §2 |
| Mises à jour des actions par Renovate, avec le même délai de 14 jours | §9.5 |

### 8.1 Actions utilisées

| Action | Version | Commit |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `pnpm/action-setup` | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` |
| `supabase/setup-cli` | v3.0.1 | `45a513f8c64c0bc8e0e3dfe572b5c95be85f6359` |
| `actions/upload-artifact` | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `gitleaks/gitleaks-action` | v3.0.0 | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |

Les paramètres utilisés (`node-version-file`, `cache`, `run_install`, `version`, `fetch-depth`, `persist-credentials`, `retention-days`, `if-no-files-found`) ont été vérifiés dans le fichier `action.yml` de **chaque** version épinglée. Outils lancés dans la CI : CLI Supabase **2.118.0**, CLI Vercel **60.1.1**, CLI Trigger.dev **4.6.4** (ENV_SETUP §4).

**Pas de CodeQL** : sur un dépôt privé, il demande GitHub Advanced Security (offre payante). Le lint de sécurité, gitleaks, `pnpm audit` et les tests d'attaque de la base couvrent l'essentiel.

---

## 9. Activation

À faire **au moment où le monodépôt est créé**, dans cet ordre. Durée : environ 1 h 30.

### 9.1 Dans le dépôt

1. Ajouter à `package.json` les scripts appelés par les fichiers (sinon la CI échoue avec « script introuvable ») :
   `format:check`, `lint`, `typecheck`, `openapi:lint`, `i18n:check`, `test:coverage`, `coverage:summary`, `test:db`, `test:int`, `test:routes-coverage`, `ci:env`, `build`, `e2e:ci`, `e2e:full`, `e2e:smoke`, `e2e:smoke:prod`, `test:smoke-providers`.
2. `ci:env` (script `scripts/ci/write-test-env.mjs`) écrit dans `$GITHUB_ENV` : les clés de la pile Supabase locale (lues avec `supabase status -o env` 🧪 : vérifier les noms qu'affiche la CLI 2.118.0), plus `ADMIN_PATH`, `APP_SIGNING_SECRET`, `TOKEN_ENCRYPTION_KEYS` et `TOKEN_ENCRYPTION_ACTIVE_KEY_ID`, tirés au hasard à chaque exécution.
3. `packages/shared/env.ts` n'exige `TRIGGER_SECRET_KEY` et `TRIGGER_PROJECT_REF` que si `PUBEKA_JOB_DISPATCH=trigger` (la CI tourne en `inline`).
4. Ajouter `vercel` **60.1.1** aux dépendances de développement de la racine.
5. Dans `apps/web/vercel.json`, désactiver la publication automatique de `main` par Vercel 🔶 :
   ```json
   { "git": { "deploymentEnabled": { "main": false } } }
   ```
   Les préversions de PR restent automatiques.
6. `bench/run.mjs` doit sortir en erreur sous les seuils de TR-AGT-05 (§3.2).

### 9.2 Dans Vercel

1. Projet relié au dépôt, **Root Directory** = `apps/web`.
2. **Deployment Protection** activée pour les préversions et la préproduction ; créer le secret **Protection Bypass for Automation**.
3. Domaine de la préproduction (ex. `staging-app.pubeka.com`) 🔶 : ajouter l'enregistrement DNS demandé par Vercel chez l'hébergeur du domaine.
4. Variables *Preview* : projet Supabase de développement, Trigger.dev *staging*, clés de test. Variables *Production* : ENV_SETUP §1.

### 9.3 Dans GitHub

Environnements, secrets et variables :

| Environnement GitHub | Secrets | Variables |
|---|---|---|
| `pubeka-staging` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (développement), `TRIGGER_ACCESS_TOKEN`, `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET` | `SUPABASE_PROJECT_REF` (développement), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `STAGING_APP_HOST` |
| `pubeka-production` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (production), `TRIGGER_ACCESS_TOKEN`, `VERCEL_TOKEN` | `SUPABASE_PROJECT_REF` (production), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| `pubeka-agents-bench` | `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY` | — |
| `pubeka-provider-tests` | `FAL_KEY`, `HF_KEY`, `SASPAY_TEST_SECRET_KEY`, `META_TEST_ACCESS_TOKEN` | `META_TEST_AD_ACCOUNT_ID` |
| (dépôt) | — | `PUBEKA_PIPELINE_ENABLED` = `true` **en dernier**, quand tout le reste est prêt |

🧪 Le dépôt est **privé** et possède déjà deux environnements créés par Vercel (`Preview`, `Production`). Les environnements Pubeka ont des noms différents pour ne pas s'y mélanger. Si l'offre GitHub ne permet pas les environnements sur un dépôt privé, les mêmes secrets passent au niveau du dépôt, avec les préfixes `STAGING_` et `PROD_`.

### 9.4 Protection de la branche `main` 🧪

- Fusion seulement par pull request, en **squash** (CONVENTIONS §4.3).
- Vérification obligatoire : **« CI terminée »** ; plus **« Banc des agents (vrais modèles) »** quand il se lance.
- Branche à jour avec `main` avant la fusion.
- Pas de poussée forcée, pas de suppression de `main`.

🧪 Sur un dépôt privé, ces règles dépendent de l'offre GitHub. Si elles ne sont pas disponibles, la règle reste la même mais n'est pas imposée par GitHub : ne jamais fusionner une PR dont « CI terminée » est rouge.

### 9.5 Renovate 🔶

Installer l'application Renovate sur le dépôt, avec un `renovate.json` à la racine : `minimumReleaseAge: "14 days"`, regroupements par famille (CONVENTIONS §1.1), mise à jour des SHA des actions GitHub (`helpers:pinGitHubActionDigests`).

---

## 10. Coûts

| Poste | Estimation | Remarque |
|---|---|---|
| Minutes GitHub Actions | ~45 min par exécution complète de la CI ; ~70 min par semaine pour les contrôles planifiés | 🧪 Dépôt privé : quota mensuel inclus selon l'offre (2 000 min/mois sur l'offre gratuite d'après la grille publique de GitHub, à confirmer dans **Settings → Billing**). Au-delà : facturé à la minute |
| Leviers si le quota est dépassé | 1. tâches lourdes uniquement quand la PR est prête (déjà en place) · 2. annulation des exécutions remplacées (déjà en place) · 3. parcours seulement si `apps/web` ou `packages/core` changent · 4. cache de l'image Docker de Supabase | à activer dans l'ordre |
| Trigger.dev | **Hobby (10 $/mois) obligatoire pour l'environnement `staging`** (documentation Trigger.dev) | ARCHITECTURE prévoyait gratuit puis Hobby : le passage à Hobby arrive dès la mise en place de la préproduction |
| Contrôle des vrais fournisseurs | une génération Standard par fournisseur et par semaine | compte dans le budget de 15 $/mois par fournisseur |
| Banc des agents | seulement quand un prompt change | coût selon les modèles testés |
| Vercel, Supabase | inchangés (ARCHITECTURE §17) | la préproduction utilise le projet Supabase de développement existant |

Exemple de mois chargé : 30 exécutions de CI × 45 min + 4 semaines × 70 min ≈ **1 630 min**.
