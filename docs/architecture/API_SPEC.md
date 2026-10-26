# Contrat d'API Pubeka (API_SPEC)

> **Source de vérité :** [`api/openapi.yaml`](../../api/openapi.yaml) (OpenAPI 3.1). Ce document explique les **règles communes**. Si les deux se contredisent, le fichier OpenAPI fait foi et ce document doit être corrigé.
>
> Documents liés : [ARCHITECTURE](ARCHITECTURE.md) · [DATA_MODEL](DATA_MODEL.md) · [SECURITE-BACKEND](SECURITE-BACKEND.md) · [APPFLOW](../produit/APPFLOW.md) · [TRD](../produit/TRD.md)

---

## 1. Principes

| Règle | Détail |
|---|---|
| Adresse de base | `https://app.pubeka.com/api/v1` (production) · `http://localhost:5173/api/v1` (développement) |
| Version | Dans le chemin (`/v1`). Un changement incompatible crée `/v2`. Ajouter un champ ou un code d'erreur **n'est pas** un changement incompatible : les clients doivent ignorer les champs inconnus. |
| Format | JSON en UTF-8 (`application/json`). Erreurs en `application/problem+json`. Flux en `text/event-stream`. |
| Noms des champs | `snake_case` partout (requêtes, réponses, erreurs). |
| Identifiants | UUID v4, sauf les entrées du registre et du journal (entiers) et les modèles (`fournisseur:endpoint`). |
| Dates | ISO 8601 en UTC (`2026-10-10T14:03:00Z`). Les jours seuls en `YYYY-MM-DD`. L'écran convertit dans le fuseau de l'utilisateur. |
| Argent | Objet `Money` : `{ "xaf": 7500, "usd_cents": 1250, "currency": "XAF" }`. Montants FCFA en **entiers** (pas de décimales), dollars en **centimes**. Jamais de nombres à virgule pour l'argent. |
| Espace de travail | Toute ressource métier est sous `/workspaces/{workspaceId}/…`. L'espace est **toujours explicite** : le serveur ne devine jamais l'espace « courant ». |
| Champs inconnus | Les corps de requête sont validés strictement (`additionalProperties: false`) : un champ inconnu renvoie `400 validation_failed`. Cela bloque l'injection de champs comme `role`, `credits` ou `price`. |
| Prix | **Jamais envoyés par le client.** Le serveur calcule chaque montant (formule, crédits, frais ; TVA retirée pour le moment, décision du 17/10/2026). |

---

## 2. Authentification

### 2.1 Mécanismes

| Schéma | Où | Pour qui |
|---|---|---|
| `sessionCookie` | Cookie Supabase `HttpOnly`, `Secure`, `SameSite=Lax` | Application web |
| `bearerAuth` | `Authorization: Bearer <JWT Supabase>` | Application mobile (V3), outils internes |
| `webhookSignature` | En-tête de signature propre à chaque fournisseur | Webhooks entrants uniquement |
| Aucun | — | `/public/*`, `GET /webhooks/meta` (vérification de l'abonnement Meta) |

La connexion elle-même (Google, Apple, e-mail + mot de passe, lien magique) passe par **Supabase Auth**, pas par cette API. L'API reçoit seulement le jeton de session.

### 2.2 Règles

1. **Chaque requête** vérifie le jeton côté serveur (`getUser()`, pas seulement le décodage local).
2. **Appartenance à l'espace** : le serveur vérifie que l'utilisateur est membre de `{workspaceId}`, puis son rôle (`owner`, `editor`, `viewer`). La base applique en plus la RLS (`private.is_member`, `private.has_role`) : deux barrières indépendantes.
3. **Ressource d'un autre espace** → `404 not_found`, jamais `403`. On ne confirme pas qu'une ressource existe.
4. **Protection CSRF** : toute requête qui modifie des données (`POST`, `PUT`, `PATCH`, `DELETE`) avec un cookie doit avoir un en-tête `Origin` égal à `https://app.pubeka.com`. Sinon → `403 forbidden`.
5. **Inactivité** : la session expire après 10 minutes sans activité → `401 session_expired`. Le client redirige vers la connexion et garde les saisies (mode hors connexion, choix B).
6. **Actions sensibles** (supprimer le compte, changer l'e-mail) : réauthentification de moins de 5 minutes, sinon `403 mfa_required` avec `meta.reason = "recent_login_required"`.
7. **Administration** (`/admin/*`) : jeton de niveau `aal2` (double vérification) + présence dans `admin_users` + compte non verrouillé. **Dans tous les autres cas, la réponse est `404 not_found`**, même pour un utilisateur connecté : la zone d'administration n'existe pas pour lui. Chaque action est inscrite dans `audit.admin_log`.
8. La clé `service_role` de Supabase n'existe **que** côté serveur (tâches de fond, webhooks). Elle n'est jamais envoyée au navigateur.

### 2.3 Rôles et droits (résumé)

| Action | owner | editor | viewer |
|---|:-:|:-:|:-:|
| Voir campagnes, visuels, statistiques | ✅ | ✅ | ✅ |
| Créer, modifier, publier, mettre en pause | ✅ | ✅ | ❌ |
| Lancer des générations (dépense des crédits) | ✅ | ✅ | ❌ |
| Facturation, paiements, crédits | ✅ | ❌ | ❌ |
| Inviter, retirer, changer un rôle | ✅ | ❌ | ❌ |
| Connecter ou déconnecter Meta | ✅ | ❌ | ❌ |

**Espace en lecture seule** (abonnement expiré après 3 jours de grâce) : toute écriture renvoie `403 workspace_read_only`, **sauf** la mise en pause d'une campagne, le paiement et les tickets de support.

S19 : `Workspace.status` est l'accès réel de l'espace (`active`, `grace`, `read_only`, `suspended`), calculé à chaque requête avec l'échéance de l'abonnement ; `grace_until` est la fin de la grâce. L'essai terminé donne `read_only` sans grâce. Le test `server/http/write-routes.test.ts` classe chaque route d'écriture du contrat (`writable: true` partout, sauf les actions ✱ de SECURITY_NOTES §2.1) et échoue pour une route non classée.

---

## 3. Format d'erreur standardisé

**Une seule forme pour toutes les erreurs**, quel que soit le point d'entrée : **Problem Details** ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) avec des extensions Pubeka. Type de contenu : `application/problem+json`.

### 3.1 Forme

```json
{
  "type": "https://pubeka.com/errors/insufficient-credits",
  "title": "Insufficient credits",
  "status": 402,
  "detail": "Il te manque 4 crédits pour générer ces 3 visuels.",
  "instance": "/api/v1/workspaces/7b1c…/generations",
  "code": "insufficient_credits",
  "request_id": "req_01JA3K8Z9Q4W",
  "meta": { "credits_needed": 9, "credits_available": 5, "credits_missing": 4 }
}
```

| Champ | Obligatoire | Rôle |
|---|:-:|---|
| `type` | ✅ | URL stable du type d'erreur (`https://pubeka.com/errors/<code-avec-tirets>`) |
| `title` | ✅ | Résumé court, **en anglais**, qui ne change jamais (pour les journaux) |
| `status` | ✅ | Même valeur que le code HTTP |
| `code` | ✅ | **Code machine stable** (liste fermée, §4). C'est lui que le client teste, jamais `detail`. |
| `request_id` | ✅ | Identifiant de la requête, aussi dans l'en-tête `X-Request-Id` et dans Sentry. Affiché à l'utilisateur pour le support. |
| `detail` | — | Message pour l'utilisateur, **dans sa langue** (`fr` ou `en`, selon `Accept-Language` puis son profil). |
| `instance` | — | Chemin de la requête |
| `errors` | — | Erreurs par champ (validation) |
| `retry_after_s` | — | Secondes avant de réessayer (même valeur que l'en-tête `Retry-After`) |
| `meta` | — | Données utiles à l'écran (crédits manquants, formule à prendre…) |

**Aucun autre champ n'est permis** (`additionalProperties: false`). Pas de `message`, pas de `error`, pas de `success: false`.

### 3.2 Erreurs de validation

```json
{
  "type": "https://pubeka.com/errors/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "2 champs sont à corriger.",
  "code": "validation_failed",
  "request_id": "req_01JA3K9B2M7T",
  "errors": [
    { "field": "copy.headline", "code": "too_long", "message": "40 caractères maximum (tu en as 52)." },
    { "field": "daily_budget_usd_cents", "code": "too_small", "message": "Le budget minimum est de 1 $ par jour." }
  ]
}
```

`field` suit le chemin JSON avec des points (`copy.headline`, `sources.2.url`). Codes de champ : `required`, `too_long`, `too_short`, `too_small`, `too_large`, `invalid_format`, `invalid_value`, `unknown_field`.

### 3.3 Ce qu'une erreur ne contient jamais

- Trace d'exécution, requête SQL, nom de table ou de colonne, message brut de Postgres.
- Message brut d'un fournisseur (Meta, SasPay, fal…) : il est traduit en code Pubeka et le texte d'origine reste dans Sentry.
- Jeton, clé, adresse e-mail d'un autre utilisateur, identifiant interne d'un autre espace.

Une erreur inattendue renvoie toujours `500 internal_error` avec le seul `request_id` comme piste.

---

## 4. Codes d'erreur

Liste fermée : tout nouveau code doit être ajouté à l'énumération `ErrorCode` dans `openapi.yaml` **et** à ce tableau.

| `code` | HTTP | Quand | Ce que l'écran fait |
|---|:-:|---|---|
| `validation_failed` | 400 | Corps ou paramètres invalides, champ inconnu | Affiche `errors[]` sous chaque champ |
| `unauthenticated` | 401 | Pas de session | Redirige vers la connexion |
| `session_expired` | 401 | 10 min d'inactivité ou jeton expiré | Redirige, garde les saisies |
| `webhook_signature_invalid` | 401 | Signature de webhook absente ou fausse | (aucun écran) |
| `insufficient_credits` | 402 | Pas assez de crédits | Propose d'acheter des crédits (`meta.credits_missing`) |
| `campaign_quota_reached` | 402 | Quota de campagnes de la période atteint | Propose la formule supérieure (`meta.upgrade_to`) |
| `page_limit_reached` | 402 | Trop de Pages actives pour la formule | Propose la formule supérieure |
| `member_limit_reached` | 402 | Trop de membres pour la formule | Propose la formule supérieure |
| `plan_feature_locked` | 402 | Fonction absente de la formule (ex. Optimiseur en Starter) | Propose la formule supérieure |
| `forbidden` | 403 | Origine refusée, action interdite | Message neutre |
| `role_insufficient` | 403 | Rôle trop faible (ex. `viewer` qui publie) | « Demande au propriétaire » |
| `workspace_read_only` | 403 | Abonnement expiré (après la grâce) | Bandeau « Renouvelle pour modifier » |
| `workspace_suspended` | 403 | Espace suspendu par l'administration | Lien vers le support |
| `mfa_required` | 403 | Réauthentification récente nécessaire | Demande de se reconnecter |
| `trial_already_used` | 403 | Essai déjà utilisé sur ce compte | Propose une formule |
| `not_found` | 404 | Introuvable, autre espace, ou `/admin` sans droits | Page « introuvable » |
| `conflict` | 409 | État incompatible (déjà en pause, déjà annulée…) | Recharge la ressource |
| `already_published` | 409 | Campagne déjà publiée | Recharge la campagne |
| `idempotency_key_reused` | 409 | Même `Idempotency-Key` avec un corps différent | Bug client : nouvelle clé |
| `gone` | 410 | Fichier expiré (7 jours), invitation expirée | Explique et propose de recommencer |
| `file_too_large` | 413 | Image de plus de 10 Mo, ou PDF/DOCX de plus de 20 Mo | Indique la limite |
| `unsupported_file_type` | 415 | Type non accepté | Liste les types acceptés |
| `illegal_product` | 422 | Produit interdit détecté par l'Analyste. **Aujourd'hui renvoyé en `200`** : l'analyse est asynchrone, le refus se lit dans `GET /analyses/{id}` (`status: blocked`, `blocked_reason: illegal_product`, aucune fiche ni question) ; le code est réservé aux routes synchrones futures | Explique le refus, sans contournement |
| `source_unreadable` | 422 | Aucune source lisible | Propose d'ajouter une photo ou du texte |
| `unsafe_url` | 422 | URL interne, privée ou non HTTP(S) (anti-SSRF) | « Ce lien ne peut pas être lu » |
| `budget_too_low` | 422 | Budget sous le minimum de la plateforme | Indique le minimum |
| `meta_not_connected` | 424 | Aucune connexion Meta active | Lance la connexion Meta |
| `meta_token_expired` | 424 | Jeton Meta expiré ou révoqué | Propose de reconnecter |
| `meta_payment_method_missing` | 424 | Pas de moyen de paiement sur le compte publicitaire | Guide pas à pas |
| `rate_limited` | 429 | Trop de requêtes | Attend `retry_after_s` |
| `daily_generation_cap` | 429 | Plafond quotidien de générations atteint (anti-abus) | « Réessaie demain » |
| `internal_error` | 500 | Erreur inattendue | Affiche `request_id` |
| `meta_error` | 502 | Erreur renvoyée par Meta | Message traduit + `request_id` |
| `payment_provider_error` | 502 | Erreur SasPay | Propose de réessayer ou d'envoyer une preuve |
| `provider_unavailable` | 503 | **Aussi** (S16) : publication réelle chez Meta non activée sur l'environnement, `meta.reason: publish_disabled` (routes `publish`, `resume`, `relaunch` en mode `recover`, tâche `campaign.publish` ; jamais `pause`) — voir ENV_SETUP `PUBEKA_META_PUBLISH`. Sinon : Fournisseur médias ou IA indisponible, aucun secours. Pour l'Analyste, aussi quand le modèle réglé ne voit pas les images : l'analyse échoue avec `error_code: provider_unavailable` et le signalement `MODEL_WITHOUT_VISION` (aucun nouveau code) | Propose un autre modèle |
| `maintenance` | 503 | Mode maintenance actif (sauf `/public/maintenance`, `/admin/*` et les webhooks, toujours traités : SECURITY_NOTES EC-ADM-02) | Page de maintenance |

---

## 5. Codes de statut HTTP utilisés

Seuls ces codes sont utilisés. Tout autre code est un bug.

| Code | Sens chez Pubeka |
|:-:|---|
| **200** OK | Lecture, ou action terminée avec un corps de réponse |
| **201** Created | Ressource créée (brouillon, ticket, invitation, session de paiement…). En-tête `Location` fourni. |
| **202** Accepted | Travail lancé en arrière-plan (analyse, génération, publication, export). Le corps contient la ressource avec son `status` ; la suite arrive par Realtime ou par `GET`. |
| **204** No Content | Action réussie sans corps (suppression, préférences enregistrées) |
| **302** Found | Uniquement le retour de la fenêtre Facebook (`/meta/callback`) |
| **400** | Requête invalide |
| **401** | Non authentifié, session expirée, signature de webhook invalide |
| **402** | Il faut payer : crédits, quota ou formule |
| **403** | Authentifié mais pas autorisé |
| **404** | Introuvable (ou volontairement caché) |
| **409** | Conflit d'état ou d'idempotence |
| **410** | Ressource expirée définitivement |
| **413** | Fichier trop lourd |
| **415** | Type de fichier refusé |
| **422** | Requête valide mais refusée par une règle métier |
| **424** | Prérequis manquant chez la plateforme publicitaire |
| **429** | Limite de débit ou plafond quotidien |
| **500** | Erreur interne |
| **502** | Erreur d'un service externe |
| **503** | Maintenance ou fournisseur indisponible |

**Pourquoi 402 pour les crédits et les quotas ?** Le client sait sans lire le corps que la solution est un paiement, et peut ouvrir directement l'écran d'achat ou de changement de formule. Le `code` précise lequel.

**Pourquoi 424 pour Meta ?** La demande de Pubeka est correcte, mais elle dépend d'un réglage côté Meta que seul l'utilisateur peut corriger. Ce n'est ni une erreur de l'utilisateur dans Pubeka (4xx classique) ni une panne (5xx).

---

## 6. En-têtes

| En-tête | Sens | Usage |
|---|---|---|
| `Authorization` | requête | `Bearer <JWT>` (mobile et outils) |
| `Idempotency-Key` | requête | UUID v4, **obligatoire** sur les actions marquées (§7) |
| `Accept-Language` | requête | `fr` ou `en` ; sinon langue du profil |
| `Accept` | requête | `text/event-stream` pour recevoir un flux (§10) |
| `X-Request-Id` | réponse | Identifiant de la requête (aussi dans le corps d'erreur) |
| `Retry-After` | réponse | Secondes avant de réessayer (429, 503) |
| `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | réponse | État de la limite de débit |
| `Location` | réponse | Adresse de la ressource créée (201) |
| `Idempotent-Replayed: true` | réponse | La réponse vient du cache d'idempotence |
| `Cache-Control: no-store` | réponse | Sur toute réponse authentifiée |

En-têtes de sécurité sur toutes les réponses : `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` (voir [SECURITE-BACKEND](SECURITE-BACKEND.md)).

---

## 7. Idempotence

Obligatoire (`Idempotency-Key`) sur les actions qui **dépensent de l'argent, des crédits ou un quota** :

| Point d'entrée | Ce qu'on évite |
|---|---|
| `POST /workspaces/{id}/checkout` | Deux sessions de paiement SasPay pour un seul clic |
| `POST /workspaces/{id}/generations` | Crédits réservés deux fois |
| `POST …/generations/{id}/fallback` | Deux relances sur le modèle de secours |
| `POST …/visuals/{id}/edit` | Deux modifications de scène facturées |
| `POST …/campaigns/{id}/publish` | Deux campagnes créées chez Meta, quota décompté deux fois |
| `POST …/rejections/{id}/apply-fix` | Deux republications |

Règles :

1. Le client génère **une clé par intention** (un clic sur « Générer »), et la réutilise pour chaque nouvel essai de la même intention (coupure réseau, renvoi au retour en ligne).
2. Même clé + même corps → **la même réponse** qu'au premier appel (code et corps), avec `Idempotent-Replayed: true`.
3. Même clé + corps différent → `409 idempotency_key_reused`.
4. Requête encore en cours avec la même clé → `409 conflict` avec `retry_after_s`.
5. Les clés sont gardées **24 heures**, rangées par espace de travail.
6. Clé absente sur un point d'entrée qui l'exige → `400 validation_failed` (`field: "Idempotency-Key"`).

Les webhooks sont aussi idempotents, sans en-tête : l'identifiant d'événement du fournisseur est enregistré, un événement déjà vu renvoie `200` sans rien refaire.

---

## 8. Pagination, tri et filtres

- **Pagination par curseur** sur toutes les listes longues : `?limit=20&cursor=<opaque>`.
- `limit` : 1 à 100, 20 par défaut.
- Réponse : `{ "data": [...], "next_cursor": "…" }`. `next_cursor: null` = dernière page.
- Le curseur est opaque (encodé et signé) : le client ne le construit jamais.
- Tri fixe par point d'entrée, du plus récent au plus ancien (`created_at desc, id desc`).
- Les listes courtes et bornées (membres, Pages, préférences, formules) renvoient `{ "data": [...] }` sans pagination.

---

## 9. Travaux en arrière-plan (202)

Analyse, génération, publication, export, synchronisation : la réponse est `202` avec la ressource et son `status`. Le client suit l'avancement :

1. **Temps réel (préféré)** : abonnement Supabase Realtime à la ligne concernée (`generations`, `campaigns`, `analyses`). La RLS limite l'abonnement aux membres de l'espace.
2. **Secours** : `GET` sur la ressource toutes les 3 secondes, puis toutes les 10 secondes après 1 minute.

États d'une génération : `queued → running → completed | partial | failed | nsfw | canceled`. Après 60 s d'attente, `fallback_offer` est rempli et l'écran propose le modèle équivalent (`POST …/fallback`). Les crédits sont **réservés** au lancement, **consommés** pour chaque visuel réussi, **libérés** pour chaque échec.

---

## 10. Flux (SSE)

Deux points d'entrée peuvent répondre en flux si le client envoie `Accept: text/event-stream` :

- `POST …/campaigns/{id}/proposals` (Stratège, affichage progressif)
- `POST …/assistant/messages` (bulle d'aide)

Événements :

```
event: field
data: {"path":"copy.headline","value":"Livraison gratuite à Douala"}

event: done
data: {"version":3, ...Proposal complète...}

event: retry
data: {}

event: error
data: {"type":"…","title":"…","status":502,"code":"meta_error","request_id":"req_…"}
```

`retry` : la première sortie du Stratège était invalide (règles de contenu) et une seconde tentative commence ; le client **efface l'aperçu déjà affiché** et reprend à zéro (au plus un `retry` par génération). Les `field` ne sont envoyés que pour des valeurs plausibles (listes fermées, bornes, dates réelles, textes sans nombre ni lien inventé) ; l'aperçu n'est jamais enregistré, seul `done` fait foi.

Une erreur **avant** le début du flux renvoie une réponse HTTP normale (`application/problem+json`). Une erreur **pendant** le flux arrive dans un événement `error` qui suit exactement le format du §3, puis le flux se ferme.

---

## 11. Limites de débit

Comptées par utilisateur et par adresse IP (la plus stricte s'applique). Dépassement → `429 rate_limited` + `Retry-After`.

| Groupe | Limite |
|---|---|
| Lecture (GET) | 300 / minute |
| Écriture (POST, PUT, PATCH, DELETE) | 60 / minute |
| Générations médias | 10 / minute par espace, plus le plafond quotidien (`daily_generation_cap`, réglé dans l'administration) |
| Analyses et propositions IA | 20 / heure par espace |
| Bulle d'aide | 30 / heure par utilisateur |
| Actualiser les statistiques | 1 toutes les 5 minutes par campagne |
| Tickets de support | 10 / jour par utilisateur |
| Export des données | 1 / jour par utilisateur |
| `/public/*` | 60 / minute par IP |
| `/admin/*` | 120 / minute par administrateur |

Les tentatives de connexion (5 échecs → blocage 15 min) sont gérées par Supabase Auth et le serveur, hors de cette API.

---

## 12. Webhooks entrants

| Point d'entrée | Fournisseur | Vérification |
|---|---|---|
| `POST /webhooks/saspay` | SasPay | `X-Webhook-Signature` = HMAC-SHA256 (hexadécimal) de `"<X-Webhook-Timestamp>.<corps brut>"` avec le secret de signature ; horodatage à ±5 min ; puis **nouvelle lecture du paiement chez SasPay** avant d'activer quoi que ce soit |
| `GET /webhooks/meta` | Meta | `hub.verify_token` comparé en temps constant, renvoie `hub.challenge` |
| `POST /webhooks/meta` | Meta | `X-Hub-Signature-256` (HMAC-SHA256 avec le secret de l'app) |
| `POST /webhooks/higgsfield` | Higgsfield | Signature du fournisseur |
| `POST /webhooks/fal` | fal | Signature ED25519 (`X-Fal-Webhook-Signature`) |
| `POST /webhooks/byteplus` | BytePlus | Signature du fournisseur |
| `POST /webhooks/resend` | Resend | Signature Svix |

Règles communes :

1. Signature vérifiée sur le **corps brut**, avant toute lecture du JSON. Échec → `401 webhook_signature_invalid`, rien n'est traité.
2. Horodatage de plus de 5 minutes → refusé (anti-rejeu), quand le fournisseur l'envoie.
3. Identifiant d'événement enregistré : un événement déjà vu → `200`, sans rien refaire.
4. Réponse rapide (`200` en moins de 2 s) : le traitement lourd part dans une tâche Trigger.dev.
5. **Un webhook ne fait jamais confiance au montant reçu** : le montant attendu est celui enregistré à la création du paiement.

---

## 13. Fichiers

Les fichiers ne passent **jamais** par l'API :

1. `POST /workspaces/{id}/uploads` avec `purpose`, `mime`, `size` → URL d'envoi signée valable 5 minutes.
2. Le navigateur envoie le fichier directement au stockage privé de Supabase.
3. Le client transmet ensuite le `file_path` reçu (dans une analyse, un ticket, une preuve de paiement…).
4. Le serveur vérifie que le `file_path` appartient bien à l'espace, puis vérifie le **vrai type du fichier** (octets de début), pas seulement l'extension.

Types acceptés : PNG, JPEG, WebP, PDF, DOCX. Taille maximale : **10 Mo pour une image**, **20 Mo pour un PDF ou un DOCX** (ARCHITECTURE §8.7). Au plus **10 images de référence** par génération (moins si le modèle en accepte moins). Les visuels sont lus par des **URL signées valables 15 minutes** (900 s, aussi l'adresse de la photo de l'écran Aperçu, `GET …/readiness`) ; **exception** : l'adresse donnée à **Meta** pour qu'il télécharge la photo pendant la création de la campagne vaut **3 600 s** (1 heure, tâche `campaign.publish`) ; les fichiers générés sont supprimés après **7 jours** (`410 gone` ensuite).

---

## 14. Index des points d'entrée

Détail des corps de requête et de réponse : [`api/openapi.yaml`](../../api/openapi.yaml). `{ws}` = `/workspaces/{workspaceId}`. 🔑 = `Idempotency-Key` obligatoire.

### Public (sans connexion)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/public/maintenance` | Mode maintenance actif ? |
| GET | `/public/plans` | Formules et prix |

### Compte

| Méthode | Chemin | Rôle |
|---|---|---|
| GET · PATCH | `/me` | Lire, modifier son profil |
| DELETE | `/me` | Supprimer son compte |
| POST | `/me/export` | Export de ses données |

### Espaces et équipe

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/workspaces` | Mes espaces |
| GET · PATCH | `{ws}` | Détail, renommer |
| GET | `{ws}/members` | Membres |
| PATCH · DELETE | `{ws}/members/{profileId}` | Changer le rôle, retirer |
| POST | `{ws}/invitations` | Inviter |
| POST | `{ws}/transfer-ownership` | Transférer la propriété (propriétaire ; SECURITY_NOTES EC-TEAM-06) |
| POST | `/invitations/accept` | Accepter une invitation |

### Meta

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `{ws}/meta/connect` | URL de connexion Facebook |
| GET | `/meta/callback` | Retour de Facebook (302) |
| GET | `{ws}/meta/connections` | Connexions |
| DELETE | `{ws}/meta/connections/{id}` | Déconnecter |
| POST | `{ws}/meta/connections/{id}/health-check` | Bilan de santé |
| GET | `{ws}/pages` | Pages |
| PATCH | `{ws}/pages/{pageId}` | Activer, langue et ton des pubs |
| GET · PUT | `{ws}/pages/{pageId}/brand-kit` | Kit de marque |
| GET | `{ws}/ad-accounts` | Comptes publicitaires |
| POST | `{ws}/ad-accounts/{id}/activate` | Choisir le compte actif |

### Sources et analyse

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `{ws}/uploads` | URL d'envoi signée |
| POST | `{ws}/analyses` | Lancer l'Analyste (202) |
| GET | `{ws}/analyses/{id}` | État, fiche, questions |
| POST | `{ws}/analyses/{id}/answers` | Répondre aux questions |

### Campagnes

| Méthode | Chemin | Rôle |
|---|---|---|
| GET · POST | `{ws}/campaigns` | Lister, créer un brouillon |
| GET · PATCH | `{ws}/campaigns/{id}` | Détail, modifier |
| GET · POST | `{ws}/campaigns/{id}/proposals` | Propositions, en générer une (SSE) |
| POST | `{ws}/campaigns/{id}/proposals/{version}/choose` | Retenir une proposition (corps `{ version }` : version du brouillon lue ; périmée → 409 `conflict`) |
| POST 🔑 | `{ws}/campaigns/{id}/publish` | Publier (202) |
| POST | `{ws}/campaigns/{id}/pause` · `/resume` | Pause, reprise |
| POST | `{ws}/campaigns/{id}/relaunch` | Relancer en nouveau brouillon |
| GET | `{ws}/campaigns/{id}/stats` | Statistiques (onglet Résultats ; montants en dollars, en monnaie locale avec un taux de moins de 48 h) |
| POST | `{ws}/campaigns/{id}/stats/refresh` | Actualiser maintenant (202 ; 429 `rate_limited` avec `Retry-After` si moins de 5 minutes) |
| GET | `{ws}/campaigns/{id}/events` | Historique (onglet Historique) |
| GET | `{ws}/campaigns/{id}/ads` | Publicités et visuel (onglet Pubs) |
| GET | `{ws}/overview` | Tableau de bord et bandeau du haut |
| GET | `{ws}/campaigns/{id}/rejections` | Refus de la campagne et leur rapport (le plus récent d'abord) |
| GET | `{ws}/campaigns/{id}/rejections/{rid}` | Rapport du Modérateur |
| POST 🔑 | `{ws}/campaigns/{id}/rejections/{rid}/apply-fix` | Corriger et republier sans quota (202 ; 409 `rejection_not_explained`, `fix_not_applicable`, `partial_rejection`, `already_fixed`) |

### Médias

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/media-models` | Catalogue de modèles, niveaux, crédits |
| POST 🔑 | `{ws}/generations` | Lancer une génération (202) |
| GET | `{ws}/generations/{id}` | État, file, bascule proposée |
| POST | `{ws}/generations/{id}/cancel` | Annuler |
| POST 🔑 | `{ws}/generations/{id}/fallback` | Accepter le modèle de secours |
| GET | `{ws}/visuals` | Atelier visuels |
| GET · PATCH | `{ws}/visuals/{id}` | Détail, marquer comme choisi |
| POST 🔑 | `{ws}/visuals/{id}/edit` | Modifier (calque gratuit ou scène payante) |
| POST | `{ws}/visuals/{id}/formats` | Autre format (gratuit) |

### Facturation et crédits

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `{ws}/billing` | Abonnement, soldes, quotas |
| GET | `{ws}/credits/ledger` | Mouvements de crédits |
| POST 🔑 | `{ws}/checkout` | Session de paiement SasPay |
| GET | `{ws}/payments` · `{ws}/payments/{id}` | Historique, état d'un paiement |
| POST | `{ws}/payment-proofs` | Envoyer une preuve de paiement |

### Optimiseur, notifications, support, parrainage

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `{ws}/recommendations` | Suggestions (Pro, Business) |
| POST | `{ws}/recommendations/{id}/{apply\|dismiss}` | Appliquer ou ignorer |
| GET | `/notifications` | Notifications |
| POST | `/notifications/read` | Marquer comme lues |
| GET · PUT | `/notifications/preferences` | Préférences |
| GET · POST | `{ws}/tickets` | Tickets |
| GET · POST | `{ws}/tickets/{id}/messages` | Messages d'un ticket |
| POST | `{ws}/assistant/messages` | Bulle d'aide (SSE) |
| GET | `{ws}/referral` | Code et filleuls |

### Webhooks

| Méthode | Chemin |
|---|---|
| POST | `/webhooks/saspay` |
| GET · POST | `/webhooks/meta` |
| POST | `/webhooks/{higgsfield\|fal\|byteplus\|resend}` |

### Administration (aal2, 404 sinon)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/admin/users` | Rechercher des utilisateurs |
| GET · PATCH | `/admin/workspaces/{id}` | Fiche client, suspendre, changer de formule, prolonger |
| POST | `/admin/workspaces/{id}/credits` | Offrir ou retirer des crédits |
| POST | `/admin/payment-proofs/{id}/{accept\|reject}` | Traiter une preuve de paiement |
| POST | `/admin/tickets/{id}/messages` | Répondre à un ticket |
| PUT | `/admin/media-models/{modelId}` | Catalogue de modèles |
| PUT | `/admin/routing-rules/{capability}` | Aiguillage et secours |
| PUT | `/admin/settings/{key}` | Paramètres (dont maintenance) |
| PUT | `/admin/vat-rates/{countryCode}` | TVA par pays |
| GET | `/admin/audit-log` | Journal d'administration |
| GET | `/admin/costs` | Coûts et marges |

---

## 15. Règles pour écrire un point d'entrée

À respecter par toute personne (ou agent IA) qui ajoute une route :

1. **Ajouter d'abord la route dans `openapi.yaml`**, puis le code. Le fichier est vérifié par `redocly lint` avant chaque fusion.
2. Valider le corps avec un schéma strict (Zod généré ou écrit à partir d'OpenAPI), `additionalProperties: false`.
3. Toute erreur passe par **une seule fonction** `problem(code, { detail, errors, meta })` qui construit le corps du §3. Interdit : `return Response.json({ error: … })`, `throw new Error("…")` renvoyé tel quel.
4. Utiliser uniquement un `code` de la liste du §4 et le statut HTTP associé.
5. Vérifier l'appartenance à l'espace et le rôle **avant** toute lecture ou écriture.
6. Requêtes SQL uniquement via le client Supabase ou des requêtes paramétrées. Jamais de concaténation de texte dans une requête.
7. Action qui dépense de l'argent, des crédits ou un quota → `Idempotency-Key` obligatoire.
8. Ajouter un test pour : succès, non connecté (401), autre espace (404), rôle insuffisant (403), corps invalide (400).
