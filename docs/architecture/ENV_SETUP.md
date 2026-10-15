# Environnement et configuration — Pubeka

> Version 1 · 10 octobre 2026
> Variables d'environnement (noms et rôle, **jamais de valeurs**), installation sur un poste de développement, liste des dépendances avec leurs versions.
>
> Documents liés : [CONVENTIONS](CONVENTIONS.md) (règles d'épinglage) · [LLD](LLD.md) (arborescence) · [SECURITE-BACKEND](SECURITE-BACKEND.md) · [ARCHITECTURE](ARCHITECTURE.md).
>
> Légende : ✅ vérifié ou décidé · 🔶 décidé ici, à valider · 🧪 à vérifier à l'installation · ❓ ouvert.

**Le monodépôt n'existe pas encore.** Ce document décrit l'installation **une fois le squelette créé** (arborescence du LLD §2). Le code AdFacile actuel (`src/`, `backend/`) a ses propres variables (`VITE_API_URL`, `FACEBOOK_*`, `CAMPAY_*`…) qui ne sont **pas** reprises.

## Sommaire

1. [Variables d'environnement](#1-variables-denvironnement)
2. [Où mettre chaque variable](#2-où-mettre-chaque-variable)
3. [Installation sur un poste de développement](#3-installation-sur-un-poste-de-développement)
4. [Dépendances et versions](#4-dépendances-et-versions)
5. [Problèmes fréquents](#5-problèmes-fréquents)

---

## 1. Variables d'environnement

**Colonne « Lue par »** : **N** = navigateur (préfixe `NEXT_PUBLIC_`, donc **publique**) · **W** = serveur de l'application web · **J** = tâches Trigger.dev · **B** = moment du build · **S** = CLI Supabase · **CI** = intégration continue.

**Colonne « Local »** : ✔ obligatoire sur un poste de développement · ○ facultative (sans elle, la fonction utilise une fausse implémentation, voir `PUBEKA_FAKE_PROVIDERS`) · — inutile en local.

Les exemples montrent **la forme** de la valeur, jamais une vraie valeur.

### 1.1 Application et domaines

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | Environnement courant ; sert à Sentry, PostHog, au bandeau « Préversion » et aux garde-fous | N W J | ✔ | `development` · `preview` · `production` |
| `NEXT_PUBLIC_SITE_URL` | Adresse du site public (liens canoniques, sitemap, e-mails) | N W J | ✔ | `http://localhost:5173` · `https://pubeka.com` |
| `NEXT_PUBLIC_APP_URL` | Adresse de l'application (liens dans les e-mails, retour OAuth, retour de paiement) | N W J | ✔ | `http://app.localhost:5173` · `https://app.pubeka.com` |
| `SITE_HOSTS` | Liste des noms d'hôte servis comme **site public** par `proxy.ts`. Tout autre hôte est servi comme application (préversions Vercel, tunnel). 🔶 | W | ✔ | `localhost:5173` · `pubeka.com,www.pubeka.com` |
| `ADMIN_PATH` | Chemin secret de l'administration (LLD §2.2). 32 caractères aléatoires. | W | ✔ | `k3J9…` (lettres et chiffres) |
| `APP_SIGNING_SECRET` | Clé HMAC qui signe les curseurs de pagination et le paramètre `state` de la connexion Meta (anti-CSRF). 🔶 | W | ✔ | 32 octets en base64 |
| `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | Clé publique du CAPTCHA invisible (inscription, connexion, mot de passe oublié — SECURITE-BACKEND §3). ❓ Cloudflare Turnstile ou hCaptcha. La clé **secrète** se règle dans Supabase Auth, pas ici. | N | ○ | texte |
| `PUBLIC_WEBHOOK_BASE_URL` | Adresse **publique** que les fournisseurs rappellent (fal, Higgsfield, BytePlus). En local : l'adresse du tunnel (§3.8). | W J | ○ | `https://xxxx.trycloudflare.com` · `https://app.pubeka.com` |
| `PUBEKA_JOB_DISPATCH` | `trigger` (normal) ou `inline` : les tâches s'exécutent dans le même processus, pour les tests d'intégration et les parcours (TESTING §6.1). **`inline` refusé en production.** 🔶 | W J | ○ | `trigger` · `inline` |
| `PUBEKA_FAKE_PROVIDERS` | Remplace les services externes par de fausses implémentations (pas de coût, pas de réseau). **Refusée au démarrage si `NEXT_PUBLIC_APP_ENV=production`.** 🔶 | W J | ○ | `all` · ou liste : `meta,saspay,media,ai,email` |

### 1.2 Supabase

Supabase remplace les anciennes clés `anon` et `service_role` par une clé **publiable** (`sb_publishable_…`) et des clés **secrètes** (`sb_secret_…`). On utilise uniquement les nouvelles. ✅ (documentation Supabase, « API keys »)

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Adresse du projet Supabase | N W | ✔ | `http://127.0.0.1:54321` · `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publiable : connexion, Realtime, requêtes soumises à la RLS | N W | ✔ | `sb_publishable_…` |
| `SUPABASE_URL` | Même adresse, pour les tâches (hors Next.js) | J | ✔ | comme ci-dessus |
| `SUPABASE_SECRET_KEY` | Clé secrète : **contourne la RLS**. Serveur et tâches uniquement, jamais `NEXT_PUBLIC_`. | W J | ✔ | `sb_secret_…` |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | Connexion Google en local (`supabase/config.toml`). En production : réglé dans le tableau de bord Supabase. | S | ○ | `….apps.googleusercontent.com` |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | Secret OAuth Google, en local | S | ○ | texte |
| `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID` | Connexion Apple en local (identifiant du service) | S | ○ | `com.pubeka.web` |
| `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` | Secret Apple (jeton signé avec la clé Apple, à régénérer tous les 6 mois) | S | ○ | JWT |
| `SUPABASE_ACCESS_TOKEN` | Jeton personnel de la CLI pour appliquer les migrations depuis la CI | CI | — | `sbp_…` |
| `SUPABASE_PROJECT_REF` | Projet visé par la CI (développement ou production) | CI | — | 20 caractères |
| `SUPABASE_DB_PASSWORD` | Mot de passe de la base, pour `supabase db push` | CI | — | texte |

### 1.3 Chiffrement des jetons

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `TOKEN_ENCRYPTION_KEYS` | Clés AES-256-GCM qui chiffrent les jetons Meta (LLD §6.13), sous forme d'objet JSON `{ identifiant: clé }`. Plusieurs clés = rotation sans tout rechiffrer d'un coup. | W J | ✔ | `{"k1":"<32 octets en base64>"}` |
| `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` | Clé utilisée pour **chiffrer** les nouveaux jetons | W J | ✔ | `k1` |

Créer une clé :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### 1.4 Meta

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `META_APP_ID` | Identifiant de l'application Meta | W J | ○ | nombre |
| `META_APP_SECRET` | Secret de l'application : échange du code OAuth **et** vérification de `X-Hub-Signature-256` des webhooks | W J | ○ | 32 caractères hexadécimaux |
| `META_LOGIN_CONFIG_ID` | Configuration « Facebook Login for Business » (autorisations demandées) | W | ○ | nombre |
| `META_GRAPH_API_VERSION` | Version de l'API Graph appelée. Le code AdFacile actuel utilise `v26.0` par défaut (`backend/src/config/facebook.js`, depuis le commit 9b081ca de `main`). | W J | ○ | `v26.0` |
| `META_WEBHOOK_VERIFY_TOKEN` | Jeton comparé à `hub.verify_token` lors de l'abonnement aux webhooks | W | ○ | texte aléatoire |

### 1.5 SasPay

Vérifié dans la documentation SasPay ✅ : authentification `Authorization: Bearer sk_test_…` (test) ou `sk_live_…` (production) ; webhooks signés en HMAC-SHA256 sur `"<X-Webhook-Timestamp>.<corps brut>"`, en-têtes `X-Webhook-Signature`, `X-Webhook-Timestamp`, `X-Webhook-Event`, écart maximal 5 minutes.

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `SASPAY_API_URL` | Adresse de l'API | W J | ○ | `https://api.saspay.me/api/v1` |
| `SASPAY_SECRET_KEY` | Clé secrète marchande. **`sk_live_` uniquement en production.** | W J | ○ | `sk_test_…` · `sk_live_…` |
| `SASPAY_WEBHOOK_SECRET` | Secret de signature des webhooks. **SasPay ne l'affiche qu'une seule fois**, à la création ou à la rotation : le copier immédiatement dans le coffre. | W | ○ | texte |

### 1.6 IA texte et lecture des sources

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `OPENROUTER_API_KEY` | Clé de la passerelle IA texte **OpenRouter** (décision D-2, 15/10/2026 ; Vercel AI Gateway écartée). Sans elle et sans `ai` dans `PUBEKA_FAKE_PROVIDERS`, les agents refusent de démarrer. | W J | ○ | `sk-or-…` · texte |
| `OPENROUTER_DATA_COLLECTION` | Réglage de confidentialité envoyé à chaque requête (`provider.data_collection`). `deny` = refuser les modèles dont le fournisseur peut conserver les textes (les modèles gratuits y échouent). Absente = réglage du compte OpenRouter. ❓ À trancher avant la production (ARCHITECTURE §16). | W J | ○ | `allow` · `deny` |
| `AGENT_MODELS` | Surcharge du modèle de chaque agent, en JSON : `{"analyste":"google/gemma-4-31b-it:free","stratege":{"model":"a/b","fallback":"c/d"}}`. Un texte = le modèle seul ; un objet ajoute le modèle de secours. Agents : `analyste`, `stratege`, `designer`, `moderateur`, `optimiseur`, `aide`. Absente = valeurs de `packages/agents/src/runtime/models.json`. | W J | ○ | JSON |
| `JINA_API_KEY` | Lecture des sites et PDF en secours (Jina Reader) | J | ○ | `jina_…` |

**Le modèle de chaque agent est un réglage**, jamais une constante du code ni du prompt : valeurs par défaut dans `packages/agents/src/runtime/models.json`, surcharge par `AGENT_MODELS`. L'administration (S31) pourra plus tard le stocker en base : `runAgent` reçoit déjà le modèle en paramètre, rien ne changera côté agents (LLD §6.10).

### 1.7 Images et vidéos

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `FAL_KEY` | Clé fal (nom attendu par `@fal-ai/client`). Les webhooks fal sont signés en ED25519 avec des **clés publiques** que fal publie : pas de secret à stocker. | J W | ○ | `<id>:<secret>` |
| `HF_KEY` | Clé Higgsfield, au format retenu pour le banc de test | J | ○ | `<id>:<secret>` |
| `HIGGSFIELD_WEBHOOK_SECRET` | 🧪 Méthode de signature des webhooks Higgsfield à vérifier dans leur documentation avant d'écrire le code. Variable conservée si un secret est nécessaire. | W | ○ | texte |
| `ARK_API_KEY` | Clé BytePlus ModelArk (vidéo, **plus tard**) | J | — | texte |
| `BYTEPLUS_WEBHOOK_SECRET` | 🧪 Même remarque que pour Higgsfield, à vérifier quand la vidéo arrive | W | — | texte |

### 1.8 E-mails

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `RESEND_API_KEY` | Envoi des e-mails | W J | ○ | `re_…` |
| `RESEND_WEBHOOK_SECRET` | Vérification des webhooks Resend (signature Svix) | W | ○ | `whsec_…` |
| `EMAIL_FROM_NOTIFICATIONS` | Expéditeur des notifications | W J | ○ | `Pubeka <notifications@pubeka.com>` |
| `EMAIL_FROM_SUPPORT` | Expéditeur des réponses du support | W J | ○ | `Pubeka <support@pubeka.com>` |

En local, les e-mails de **connexion** (lien magique, confirmation) ne passent pas par Resend : ils arrivent dans la boîte de test de Supabase (§3.6).

### 1.9 Trigger.dev

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `TRIGGER_SECRET_KEY` | Permet à l'application web de **déclencher** des tâches (clé de l'environnement : dev, staging ou prod). Exigée seulement si `PUBEKA_JOB_DISPATCH=trigger` | W | ✔ | `tr_dev_…` · `tr_prod_…` |
| `TRIGGER_PROJECT_REF` | Projet Trigger.dev, lu par `jobs/trigger.config.ts` (à défaut, le projet de préproduction : l'indexation distante de `trigger deploy` n'a pas les variables de la CI ; la CLI préfère `--project-ref` ou cette variable, et la production n'est jamais la valeur par défaut) | J B | ✔ | `proj_…` |
| `TRIGGER_ACCESS_TOKEN` | Déploiement des tâches depuis la CI (environnements GitHub, CI_CD §9.3) | CI | — | `tr_pat_…` |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET` | Déploiement Vercel et tests de fumée de la préproduction depuis la CI | CI | — | texte |

### 1.10 Suivi

| Variable | Rôle | Lue par | Local | Forme |
|---|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Envoi des erreurs depuis le navigateur et le serveur web | N W | ○ | `https://…@….ingest.sentry.io/…` |
| `SENTRY_DSN` | Envoi des erreurs depuis les tâches | J | ○ | comme ci-dessus |
| `SENTRY_AUTH_TOKEN` | Envoi des *source maps* au build (erreurs lisibles) | B CI | — | `sntrys_…` |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Organisation et projet Sentry visés au build | B CI | — | texte |
| `NEXT_PUBLIC_POSTHOG_KEY` | Clé publique du projet PostHog | N | ○ | `phc_…` |
| `NEXT_PUBLIC_POSTHOG_HOST` | Serveur PostHog. 🔶 Région **Europe**, cohérente avec l'hébergement des données en Irlande. | N | ○ | `https://eu.i.posthog.com` |

### 1.11 Banc de test des modèles (`bench/.env`, existant)

Hors application. Déjà en place et ignoré par Git : `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `MOONSHOT_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `GITHUB_MODELS_TOKEN`. Pour les tests d'images et de vidéos : `FAL_KEY`, `HF_KEY`, `ARK_API_KEY`.

### 1.12 Validation au démarrage

Toutes les variables sont lues **uniquement** par `packages/shared/src/env.ts` (CONVENTIONS §6.10). Ce fichier, avec Zod :

1. refuse de démarrer si une variable obligatoire manque ou a une forme invalide, et nomme la variable fautive (sans afficher sa valeur) ;
2. refuse `PUBEKA_FAKE_PROVIDERS` en production ;
3. refuse une clé `sk_test_` en production et une clé `sk_live_` hors production ;
4. refuse toute variable secrète dont le nom commence par `NEXT_PUBLIC_` (liste des noms autorisés à être publics dans `env.ts`).

---

## 2. Où mettre chaque variable

| Lieu | Contenu | Dans Git ? |
|---|---|---|
| `apps/web/.env.local` | Variables **N** et **W** du poste de développement | ❌ (ignoré) |
| `jobs/.env` | Variables **J** du poste de développement (lues par `trigger.dev dev`) | ❌ (ignoré) |
| `supabase/.env` | Variables **S** (fournisseurs de connexion en local) | ❌ (ignoré) |
| `apps/web/.env.example`, `jobs/.env.example`, `supabase/.env.example` | **Noms seulement**, valeurs vides, avec un commentaire par variable | ✅ |
| Vercel → *Environment Variables* | Une valeur par environnement : *Development*, *Preview*, *Production*. Secrets marqués « Sensitive ». | — |
| Trigger.dev → *Environment Variables* | Environnements *Dev* et *Prod* du projet | — |
| GitHub → *Secrets* du dépôt | Variables **CI** uniquement | — |
| Supabase → tableau de bord | Fournisseurs de connexion (Google, Apple), URL de redirection autorisées, SMTP de production | — |

Règles :

1. **Les secrets de production ne quittent jamais Vercel, Trigger.dev et GitHub.** Ils ne sont ni copiés sur un poste, ni envoyés par message.
2. Développement, préversion et production ont **chacun leurs propres clés** (ARCHITECTURE §2 : deux projets Supabase). Une préversion utilise le projet Supabase de **développement** et les clés **de test** (SasPay `sk_test_`).
3. Une clé qui a pu fuiter est **changée partout** le jour même (procédure de rotation, SECURITE-BACKEND).
4. Ajouter une variable = la déclarer dans `env.ts`, dans le bon `.env.example`, dans ce document, puis dans Vercel ou Trigger.dev, **dans la même pull request**.

---

## 3. Installation sur un poste de développement

Poste de référence : **Windows 11**, commandes pour **Git Bash** (différences PowerShell indiquées). Compter **environ 45 minutes** la première fois, surtout pour le téléchargement des images Docker de Supabase.

### 3.1 Prérequis

| Outil | Version | Installation (Windows) |
|---|---|---|
| Git | récente | `winget install Git.Git` |
| fnm (gestionnaire de versions de Node) 🔶 | récente | `winget install Schniz.fnm` |
| Node.js | **24.21.0** (lu dans `.nvmrc`) | `fnm install` puis `fnm use` dans le dépôt |
| pnpm | **12.7.0** (lu dans `package.json`) | `corepack enable` (fourni avec Node) |
| Docker Desktop | récente, **démarré** | `winget install Docker.DockerDesktop` — nécessaire pour Supabase en local |
| cloudflared 🔶 | récente | `winget install Cloudflare.cloudflared` — seulement pour recevoir des webhooks (§3.8) |

Vérifier :

```bash
node --version
```

Le résultat attendu est `v24.21.0`. Ensuite :

```bash
pnpm --version
```

Le résultat attendu est `12.7.0`.

### 3.2 Récupérer le code et installer

```bash
git clone https://github.com/<organisation>/<dépôt>.git pubeka
```

```bash
cd pubeka && fnm use && corepack enable && pnpm install --frozen-lockfile
```

`--frozen-lockfile` échoue si `pnpm-lock.yaml` ne correspond pas à `package.json` : c'est voulu (CONVENTIONS §1.1).

### 3.3 Démarrer Supabase en local

Docker Desktop doit être lancé.

```bash
pnpm supabase start
```

Ports par défaut de la CLI Supabase : API `54321`, base Postgres `54322`, Studio `54323`, boîte e-mail de test `54324`. 🧪 Les confirmer avec `pnpm supabase status`.

Appliquer les migrations et les données initiales :

```bash
pnpm supabase db reset
```

Lancer les tests de sécurité de la base (44 tests aujourd'hui, tous doivent passer) :

```bash
pnpm test:db
```

### 3.4 Créer les fichiers d'environnement

```bash
cp apps/web/.env.example apps/web/.env.local && cp jobs/.env.example jobs/.env && cp supabase/.env.example supabase/.env
```

Remplir les valeurs **Supabase** à partir de :

```bash
pnpm supabase status -o env
```

Valeurs minimales pour démarrer **sans aucun compte externe** :

| Variable | Valeur locale |
|---|---|
| `NEXT_PUBLIC_APP_ENV` | `development` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:5173` |
| `NEXT_PUBLIC_APP_URL` | `http://app.localhost:5173` |
| `SITE_HOSTS` | `localhost:5173` |
| `ADMIN_PATH`, `APP_SIGNING_SECRET`, `TOKEN_ENCRYPTION_KEYS`, `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` | à générer (§1.3) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | depuis `supabase status -o env` |
| `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF` | depuis le projet Trigger.dev, environnement **Dev** |
| `PUBEKA_JOB_DISPATCH` | `trigger` (normal) ou `inline` : les tâches s'exécutent dans le même processus, pour les tests d'intégration et les parcours (TESTING §6.1). **`inline` refusé en production.** 🔶 | W J | ○ | `trigger` · `inline` |
| `PUBEKA_FAKE_PROVIDERS` | `all` |

Vérifier :

```bash
pnpm env:check
```

La commande lit les fichiers avec `env.ts` et nomme chaque variable manquante ou invalide.

### 3.5 Générer les types

```bash
pnpm db:types
```

Écrit `packages/db/src/database.types.ts` depuis la base locale.

```bash
pnpm api:types
```

Écrit `packages/contracts/src/generated/openapi.d.ts` depuis `api/openapi.yaml`.

### 3.6 Lancer

```bash
pnpm dev
```

Turborepo lance ensemble l'application Next.js **sur le port 5173** (`next dev -p 5173`) et `trigger.dev dev` (les tâches tournent sur le poste et sont visibles dans le tableau de bord Trigger.dev).

| Adresse | Contenu |
|---|---|
| http://localhost:5173 | Site public (redirige vers `/fr`) |
| http://app.localhost:5173 | Application |
| http://app.localhost:5173/`<ADMIN_PATH>` | Administration (après §3.7) |
| http://localhost:54323 | Supabase Studio (tables, utilisateurs) |
| http://localhost:54324 | Boîte e-mail de test (liens de connexion) |

Les navigateurs récents (Chrome, Edge, Firefox) envoient `*.localhost` vers le poste local sans réglage. Le port **5173** est fixe : ne pas en changer si un autre programme l'occupe, arrêter ce programme (§5).

### 3.7 Créer un compte et devenir administrateur

1. Ouvrir http://app.localhost:5173/inscription et s'inscrire par e-mail.
2. Ouvrir le lien reçu dans http://localhost:54324.
3. Activer la double vérification sur ce compte (application d'authentification).
4. Donner le rôle d'administrateur (script 🔶, ajoute la ligne dans `private.admin_users`) :

```bash
pnpm db:make-admin vous@exemple.com
```

### 3.8 Travailler avec les vrais services (facultatif)

Par défaut `PUBEKA_FAKE_PROVIDERS=all` : aucune dépense, aucun compte externe. Pour tester un vrai service, le retirer de la liste et remplir ses variables :

| Service | Mode à utiliser en local | Point d'attention |
|---|---|---|
| SasPay | clé `sk_test_` | Le webhook doit être créé dans **leur tableau de bord** avec l'adresse du tunnel ; copier le secret immédiatement (affiché une seule fois) |
| Meta | application Meta en mode **Développement** | 🧪 Vérifier si Meta accepte `http://app.localhost:5173/api/v1/meta/callback` comme adresse de retour ; sinon utiliser l'adresse du tunnel |
| fal, Higgsfield | vraies clés : **chaque génération coûte de l'argent** | Le budget de 15 $/mois par fournisseur s'applique aussi en développement |
| Resend | clé de test, domaine de test Resend | — |
| Passerelle IA | ❓ selon l'outil choisi | Les appels coûtent de l'argent |

Recevoir des webhooks sur le poste (SasPay, fal, Higgsfield, Meta) avec un tunnel :

```bash
cloudflared tunnel --url http://localhost:5173
```

Copier l'adresse `https://….trycloudflare.com` affichée dans `PUBLIC_WEBHOOK_BASE_URL`, puis redémarrer `pnpm dev`. Comme cet hôte n'est pas dans `SITE_HOSTS`, `proxy.ts` le sert comme application. L'adresse change à chaque lancement du tunnel : il faut la remettre à jour chez chaque fournisseur.

### 3.9 Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm dev` | Application (5173) + tâches Trigger.dev |
| `pnpm test` | Tests unitaires et d'intégration (Vitest) |
| `pnpm test:db` | Tests de sécurité de la base (PGlite) |
| `pnpm test:int` | Tests d'intégration contre Supabase local (TESTING §2.4) |
| `pnpm test:routes-coverage` | Vérifie que chaque opération d'OpenAPI a ses 5 cas de test |
| `pnpm fixtures:record <fournisseur>` | Réenregistre les réponses d'un fournisseur (vraies clés de test, à la main) |
| `pnpm e2e` | Parcours complets (Playwright) |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Qualité du code (CONVENTIONS §3) |
| `pnpm openapi:lint` | Contrôle d'`api/openapi.yaml` |
| `pnpm db:types` · `pnpm api:types` | Regénérer les types |
| `pnpm supabase db reset` | Repartir d'une base vide (**efface les données locales**) |
| `pnpm supabase migration new <sujet>` | Créer une migration (nommage : CONVENTIONS §5.1) |
| `pnpm env:check` | Vérifier les variables d'environnement |

---

## 4. Dépendances et versions

Source unique des versions du projet. Règles d'épinglage : [CONVENTIONS §1](CONVENTIONS.md#1-versions-épinglées) (version exacte, au moins 14 jours d'ancienneté). Relevé du **10 octobre 2026** sur le registre npm ; chaque version est la plus récente publiée **avant le 26 septembre 2026**.

### 4.1 Racine du dépôt (outils, `devDependencies`)

| Paquet | Version | Rôle |
|---|---|---|
| `turbo` | **2.11.4** | Lancement et cache des tâches du monodépôt |
| `typescript` | **6.0.3** | ⚠️ pas 7.x : `typescript-eslint` exige TypeScript `< 6.1.0` |
| `@types/node` | **24.19.0** | Suit Node 24, pas la dernière version publiée (26.x) |
| `eslint` | **10.11.0** | Lint |
| `typescript-eslint` | **8.70.1** | Règles TypeScript |
| `eslint-plugin-boundaries` | **7.2.0** | Frontières entre modules (LLD §3) |
| `prettier` | **3.9.9** | Formatage |
| `prettier-plugin-tailwindcss` | **0.8.1** | Tri des classes Tailwind |
| `vitest` | **5.0.2** | Tests |
| `@vitest/coverage-v8` | **5.0.2** | Couverture (même version que `vitest`) |
| `supabase` | **2.118.0** | CLI Supabase (base locale, migrations, types) |
| `@redocly/cli` | **2.54.3** | Contrôle d'`openapi.yaml` |
| `vercel` | **60.1.1** | CLI Vercel : construction et déploiement depuis la CI (CI_CD §4-5) |

### 4.2 `apps/web`

| Paquet | Version | Rôle |
|---|---|---|
| `next` | **16.3.6** | Cadre. Depuis Next 16, `proxy.ts` remplace `middleware.ts` |
| `react`, `react-dom` | **19.3.0** | Interface |
| `@supabase/supabase-js` | **2.117.2** | Client Supabase (Realtime côté navigateur) |
| `@supabase/ssr` | **0.12.7** | Session Supabase en cookies (serveur) |
| `@tanstack/react-query` | **5.103.2** | Données du serveur (LLD §7.2) |
| `zustand` | **5.0.15** | État client (LLD §7.4) |
| `nuqs` | **2.10.1** | État dans l'adresse |
| `react-hook-form` | **7.88.0** | Formulaires |
| `@hookform/resolvers` | **5.9.1** | Lien formulaires ↔ Zod (accepte zod 4) |
| `zod` | **4.6.5** | Validation |
| `next-intl` | **4.14.7** | Textes FR/EN |
| `idb-keyval` | **6.3.0** | File hors connexion (IndexedDB) |
| `gsap` | **3.15.0** | Animations du site public uniquement |
| `lenis` | **1.3.26** | Défilement doux du site public uniquement |
| `@trigger.dev/sdk` | **4.6.4** | Déclencher des tâches depuis l'API |
| `@sentry/nextjs` | **11.0.0** | Erreurs |
| `posthog-js` | **1.434.14** | Mesure produit |
| `server-only` | **0.0.1** | Bloque l'import d'un module serveur côté navigateur |
| `tailwindcss`, `@tailwindcss/postcss` | **4.3.3** | Styles |
| `@types/react` *(dev)* | **19.3.0** | Types |
| `eslint-config-next` *(dev)* | **16.3.6** | Toujours la même version que `next` |
| `@playwright/test` *(dev)* | **1.63.0** | Tests de parcours |
| `@axe-core/playwright` *(dev)* | **4.13.0** | Accessibilité automatique dans les parcours |
| `@testing-library/react` *(dev)* | **16.3.3** | Tests de composants |
| `@testing-library/dom` *(dev)* | **10.4.2** | Requis par Testing Library |
| `@testing-library/user-event` *(dev)* | **14.6.7** | Clics et saisies réalistes |
| `@testing-library/jest-dom` *(dev)* | **7.0.1** | Vérifications sur le DOM |
| `happy-dom` *(dev)* | **20.14.5** | Navigateur simulé pour Vitest |

### 4.3 `packages/*` et `jobs`

| Module | Paquet | Version | Rôle |
|---|---|---|---|
| `ui` | `radix-ui` | **1.6.7** | Base des composants shadcn |
| `ui` | `class-variance-authority` | **0.7.1** | Variantes de composants |
| `ui` | `clsx` | **2.1.1** | Composition de classes |
| `ui` | `tailwind-merge` | **3.7.0** | Fusion des classes Tailwind (`cn()`) |
| `ui` | `tw-animate-css` | **1.4.0** | Animations utilisées par shadcn |
| `ui` | `lucide-react` | **1.48.0** | Icônes |
| `ui` | `shadcn` *(outil, lancé avec `pnpm dlx shadcn@4.21.0`)* | **4.21.0** | Ajout des composants |
| `contracts` | `zod` | **4.6.5** | Schémas |
| `contracts` | `openapi-typescript` *(dev)* | **7.13.0** | 🧪 Déclare TypeScript `^5.x` : à vérifier avec 6.0.3, sinon lancé avec son propre TypeScript 5.9.3 |
| `api-client` | `openapi-fetch` | **0.17.0** | Client HTTP typé |
| `db` | `@supabase/supabase-js` | **2.117.2** | Accès à la base |
| `db` | `@electric-sql/pglite` *(dev)* | **0.5.8** | Tests de sécurité de la base |
| `media` | `@fal-ai/client` | **1.10.1** | Client fal |
| `media` | moteur de rendu des calques | ❓ | Satori + resvg **ou** sharp (ARCHITECTURE §19, point 3) |
| `media` | Higgsfield, BytePlus | — | Appels HTTP avec `fetch`, sans bibliothèque |
| `agents` | client de la passerelle IA | — | OpenRouter (D-2) : appels HTTP avec `fetch`, sans bibliothèque ; `zod` 4.6.5 |
| `notifications` | `resend` | **6.30.0** | Envoi des e-mails |
| `notifications` | `react-email` | **6.11.0** | Modèles d'e-mails. ⚠️ `@react-email/components` est abandonné sur npm |
| `notifications` | `@react-email/render` | **2.1.0** | Rendu HTML des e-mails |
| `i18n` | `next-intl` | **4.14.7** | Textes |
| `jobs` | `@trigger.dev/sdk` | **4.6.4** | Définition des tâches |
| `jobs` | `trigger.dev` *(dev, CLI)* | **4.6.4** | Toujours la même version que le SDK |
| `jobs` | `@sentry/node` | 🧪 | À épingler à la version de `@sentry/nextjs` lors de la création du module |
| `testing` *(dev)* | `msw` | **2.15.0** | Réponses HTTP simulées (la 3.0.0 date du 28/09, trop récente) |
| `testing` *(dev)* | `otplib` | **13.5.0** | Codes TOTP des sessions d'administration de test |

`billing`, `platforms`, `shared` : aucune dépendance externe prévue (Meta, SasPay et le change passent par `fetch`).

### 4.4 Services externes (comptes nécessaires)

| Service | Usage | Offre au départ |
|---|---|---|
| Supabase | Base, Auth, Storage, Realtime (Irlande) | 2 projets : développement, production |
| Vercel | Hébergement Next.js | existant |
| Trigger.dev | Tâches de fond | **gratuit en ce moment** (projet `proj_wnjyspfoeknisnyzygkj`), Hobby au plus tard à S13 (ARCHITECTURE §2) |
| SasPay | Paiement | compte marchand (clés test et production) |
| Meta for Developers | Application Meta, webhooks | existant |
| fal, Higgsfield | Images (et vidéo) | budget 15 $/mois chacun |
| BytePlus ModelArk | Vidéo (plus tard) | — |
| Resend | E-mails | gratuit au départ |
| Jina | Lecture des sites en secours | — |
| Sentry, PostHog | Erreurs, mesure | gratuits au départ |
| Cloudflare (tunnel) | Webhooks en local | sans compte (`trycloudflare.com`) |

---

## 5. Problèmes fréquents

| Symptôme | Cause | Solution |
|---|---|---|
| `supabase start` échoue avec une erreur Docker | Docker Desktop n'est pas lancé | Lancer Docker Desktop, attendre « Engine running », relancer |
| `Port 5173 is already in use` | Un autre programme (souvent l'ancien `vite` d'AdFacile) occupe le port | `netstat -ano \| findstr :5173` (PowerShell) pour trouver le processus, puis l'arrêter. Ne pas changer de port. |
| L'application s'ouvre sur le site public | L'hôte est dans `SITE_HOSTS` | Utiliser `app.localhost:5173`, pas `localhost:5173` |
| `env.ts` refuse de démarrer | Variable manquante ou mal formée | `pnpm env:check` nomme la variable |
| Avertissement Git « LF will be replaced by CRLF » | Ancien réglage Git sous Windows | `.gitattributes` force `LF` (CONVENTIONS §3.1) ; lancer `git add --renormalize .` une fois |
| Connexion Google ou Apple impossible en local | Variables **S** absentes, ou adresse de retour non autorisée | Remplir `supabase/.env`, ajouter `http://app.localhost:5173/auth/callback` dans `additional_redirect_urls` de `supabase/config.toml`, puis `pnpm supabase stop && pnpm supabase start` |
| Les webhooks n'arrivent pas | Tunnel arrêté ou adresse changée | Relancer `cloudflared`, mettre à jour `PUBLIC_WEBHOOK_BASE_URL` et l'adresse chez le fournisseur |
| `pnpm install` refuse : *engine* | Mauvaise version de Node | `fnm use` dans le dossier du dépôt |
