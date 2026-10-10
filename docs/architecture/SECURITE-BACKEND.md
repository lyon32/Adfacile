# Sécurité du backend EasAds

> Version 1 · 10 octobre 2026 · Objectif : **aucune fuite de données, aucune prise de contrôle**, ni sur la production, ni sur l'environnement de test, ni sur l'administration.
> Schéma de la base : [`db/migrations/0001_init.sql`](../../db/migrations/0001_init.sql) · stockage : [`0002_storage.sql`](../../db/migrations/0002_storage.sql) · tests d'attaque : [`db/tests/security.test.mjs`](../../db/tests/security.test.mjs).
> Statut : ✅ en place et **testé** · 🔧 prévu, à implémenter avec le code · ⚠ à tester sur Supabase.
> Règles d'accès par rôle, validation des entrées et cas limites : [SECURITY_NOTES](SECURITY_NOTES.md).

---

## 1. Ce qu'on protège

| Bien | Pourquoi c'est critique |
|---|---|
| Jetons Meta des clients | Donnent accès à leurs comptes publicitaires et à leur argent |
| Données des clients (campagnes, business, fichiers, statistiques) | Confidentielles ; fuite = perte de confiance et sanctions légales |
| Crédits et paiements | Fraude possible (crédits gratuits, abonnement activé sans payer) |
| Administration | Contrôle total sur tous les comptes |
| Clés EasAds (SasPay, IA, fournisseurs médias, Meta App) | Coût et usurpation |
| Environnement de test | Souvent la porte d'entrée : il ne doit contenir **aucune** vraie donnée ni clé de production |

---

## 2. Base de données (testée : 44 tests d'attaque sur 44 réussis)

| Protection | Comment | Statut |
|---|---|---|
| **Isolation entre clients** | RLS sur **100 % des tables** ; chaque politique vérifie l'appartenance à l'espace (`private.is_member`) | ✅ testé |
| **Moindre privilège** | `anon` n'a accès qu'au blog et aux guides publiés ; `authenticated` reçoit des droits **table par table et colonne par colonne** ; tout le reste passe par le serveur | ✅ testé |
| **Colonnes protégées** | Un client ne peut modifier que les colonnes listées (ex. une campagne : nom, budget, textes… jamais `workspace_id`, `status`, `meta_campaign_id`) | ✅ testé |
| **Pas de déplacement entre espaces** | Déclencheur qui refuse tout changement de `workspace_id` | ✅ testé |
| **Secrets séparés** | Jetons Meta, administrateurs, réglages, soldes fournisseurs dans le schéma `private` ; journal dans `audit` ; **non exposés par l'API** | ✅ testé |
| **Jetons chiffrés** | AES-256-GCM par l'application (IV 12 octets, tag 16 octets, version de clé) ; clé hors base | ✅ structure · 🔧 code |
| **Registres en ajout seul** | Crédits et journal d'administration : modification, suppression et vidage **refusés, même pour le serveur** | ✅ testé |
| **Crédits uniquement par le serveur** | Fonctions `reserve` / `consume` / `release` réservées au rôle serveur ; verrou par espace contre les dépenses simultanées ; libération idempotente | ✅ testé |
| **Paiements** | Lecture propriétaire seulement ; écriture serveur seulement (webhook signé) ; `idempotency_key` unique obligatoire | ✅ testé |
| **Rôles d'équipe** | Lecteur : aucune écriture, aucun paiement visible ; espace en lecture seule : création refusée | ✅ testé |
| **Administration en base** | Accès admin = présent dans `private.admin_users` **ET** session en double vérification (`aal2`) **ET** non verrouillé | ✅ testé |
| **Modèles en test invisibles** | Seuls les modèles `active` sont lisibles ; l'identifiant technique du fournisseur (`endpoint`) est illisible | ✅ testé |
| **Validation à l'entrée** | Contraintes sur chaque colonne : formats (e-mail, téléphone E.164, identifiants Meta numériques, URL `https`), longueurs maximales, valeurs autorisées | ✅ |

### Injection SQL
- **Côté base** : aucune fonction applicative n'utilise de SQL dynamique (`EXECUTE`) ; toutes les fonctions `SECURITY DEFINER` ont un `search_path` figé (empêche le détournement par un objet piégé). **Vérifié automatiquement par les tests.**
- **Côté application** 🔧 : uniquement le client Supabase et des requêtes **paramétrées** ; **aucune concaténation de texte dans du SQL** ; toutes les entrées validées par schéma (Zod) avant usage ; règle de lint qui interdit les requêtes construites par concaténation.
- **Défense en profondeur** : même si une injection passait, la RLS limite l'attaquant à son propre espace (testé : `' OR '1'='1' --` ne fait sortir aucune donnée d'un autre client).

---

## 3. Authentification et sessions

| Protection | Statut |
|---|---|
| Connexion Google, Apple, e-mail ; confirmation obligatoire de l'e-mail | 🔧 (réglage Supabase Auth) |
| **Mots de passe compromis refusés** (protection Supabase contre les mots de passe divulgués) | 🔧 |
| **CAPTCHA invisible** (Cloudflare Turnstile ou hCaptcha) à l'inscription, à la connexion et au mot de passe oublié — contre les robots et la création de faux comptes d'essai | 🔧 |
| **Blocage 15 minutes après 5 échecs** de connexion | 🔧 |
| **Déconnexion après 10 minutes d'inactivité**, avertissement 60 s avant | 🔧 |
| Rotation des jetons de session et détection de réutilisation (Supabase) | 🔧 |
| Cookies `Secure`, `HttpOnly`, `SameSite=Lax` | 🔧 |
| Invitations d'équipe : seul le **hachage** du jeton est stocké, expiration obligatoire | ✅ structure |

---

## 4. Administration

| Protection | Statut |
|---|---|
| Chemin secret ; **404** pour tout non-administrateur (y compris les pages de connexion admin) | 🔧 |
| **Double vérification obligatoire** (application d'authentification, code à 6 chiffres) — sans `aal2`, la base refuse les droits admin | ✅ en base · 🔧 écran |
| **Blocage après 5 essais** (verrou dans `private.admin_users`) | ✅ en base · 🔧 logique |
| **Journal de chaque action** (avant / après, adresse IP) dans `audit.admin_log`, impossible à effacer | ✅ testé |
| Actions sensibles (crédits, abonnements) **uniquement via le serveur** avec motif obligatoire | ✅ contraintes |
| « Voir comme le client » en **lecture seule**, journalisé | 🔧 |
| Alerte e-mail à chaque connexion admin et à chaque verrouillage | 🔧 |

---

## 5. Application web (Next.js)

| Menace | Protection | Statut |
|---|---|---|
| Vol de session par script (XSS) | Échappement automatique de React ; **aucun `dangerouslySetInnerHTML`** (le loader est réécrit) ; Markdown du blog nettoyé ; **CSP stricte** avec nonce | 🔧 |
| Requêtes forgées (CSRF) | Pas d'actions serveur Next.js pour les écritures (LLD D2) ; chaque écriture de `/api/v1` avec cookie exige un en-tête `Origin` EasAds (API_SPEC §2.2) ; cookies `SameSite` | 🔧 |
| Clic détourné (clickjacking) | `frame-ancestors 'none'` | 🔧 |
| Lecture de sites clients → attaque du réseau interne (**SSRF**) | Lecture **côté serveur uniquement** ; seulement `http(s)` ; **adresses privées, locales et de métadonnées cloud refusées** (vérifiées après résolution DNS et à chaque redirection) ; 5 redirections max ; taille max ; délai max ; Jina Reader en secours | 🔧 |
| Fichiers piégés | Vérification du type réel (octets magiques, pas l'extension) ; **images ré-encodées** (supprime les scripts et métadonnées EXIF) ; PDF : texte extrait, jamais exécuté ; tailles limitées (10 Mo image, 20 Mo PDF) ; compartiments privés | ✅ stockage · 🔧 code |
| Injection d'instructions dans l'IA | Contenu des sources traité comme donnée ; détection `PROMPT_INJECTION_SUSPECTED` ; aucun agent n'a de droit d'écriture | ✅ testé (banc) |
| Abus et coûts IA | Limites de requêtes par compte et par adresse ; plafond quotidien de générations ; budgets fournisseurs | 🔧 |
| Énumération des comptes | Messages identiques pour « e-mail inconnu » et « mauvais mot de passe » | 🔧 |
| Transport | HTTPS partout, **HSTS** ; CORS limité aux domaines EasAds | 🔧 |
| En-têtes | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive | 🔧 |

---

## 6. Webhooks et intégrations

| Protection | Statut |
|---|---|
| **Signature vérifiée** pour SasPay, Meta, fal, Higgsfield, BytePlus, Resend ; requête refusée sinon | 🔧 |
| **Rejeu bloqué** : identifiant d'événement mémorisé, horodatage vérifié | 🔧 |
| Paiement : **montant recalculé côté serveur**, jamais pris dans la requête du navigateur ; activation **seulement** sur webhook signé ou validation admin | ✅ en base · 🔧 code |
| `Idempotency-Key` envoyée à SasPay sur **chaque** paiement | ✅ structure · 🔧 code |
| Un identifiant de requête fournisseur rattaché à **une seule** génération (pas de double facturation) | ✅ structure |
| Fichiers des fournisseurs copiés **immédiatement** chez nous (fal publie des URL publiques par défaut ; BytePlus efface après 24 h) | 🔧 |

---

## 7. Secrets et clés

| Règle | Statut |
|---|---|
| Clés uniquement dans les variables chiffrées de **Vercel** et **Trigger.dev** ; jamais dans le code, jamais dans le navigateur | 🔧 |
| `.env` exclus de git (vérifié) ; **analyse automatique des secrets** (gitleaks) à chaque commit et dans la CI | 🔧 |
| Clé de service Supabase (`service_role`) **uniquement côté serveur et tâches** | 🔧 |
| Clés différentes entre développement et production | 🔧 |
| **Procédure de rotation** de toutes les clés en cas de fuite (version de clé pour les jetons Meta) | ✅ structure · 🔧 procédure |
| Journaux et Sentry : **masquage automatique** des jetons, mots de passe, téléphones, données de paiement | 🔧 |

---

## 8. Environnement de test (« qu'on ne puisse pas pirater le test »)

| Règle | Statut |
|---|---|
| Projet Supabase de **développement séparé**, **aucune donnée réelle** (données fictives uniquement) | 🔧 |
| Clés **de test** uniquement (SasPay `sk_test_…`, fournisseurs en compte séparé ou budget minimal) | 🔧 |
| **Déploiements de prévisualisation Vercel protégés** (mot de passe ou connexion Vercel obligatoire) | 🔧 |
| Base de développement **non accessible publiquement** hors API avec RLS (mêmes migrations, mêmes protections qu'en production) | ✅ mêmes migrations |
| Aucune copie de la base de production vers le développement | 🔧 règle |
| Comptes de test avec mots de passe forts, désactivés après usage | 🔧 |

---

## 9. Dépendances et code

| Règle | Statut |
|---|---|
| Mises à jour automatiques par Renovate, avec 14 jours d'ancienneté minimale (CONVENTIONS §1.1) ; `pnpm audit` bloquant en CI pour les failles critiques | 🔧 |
| Versions exactes et fichier de verrouillage commité (`pnpm-lock.yaml`, installation `--frozen-lockfile`) | 🔧 |
| Revue de code avant fusion dans `main` | 🔧 |
| Tests de sécurité de la base (`db/tests/security.test.mjs`) **obligatoires en CI** | ✅ test écrit · 🔧 CI |
| Conseiller de sécurité Supabase (alertes sur les tables sans RLS, fonctions risquées) vérifié avant chaque mise en production | 🔧 |

---

## 10. Surveillance et réponse

| Règle | Statut |
|---|---|
| Alertes e-mail : connexion admin, verrouillage, pics d'erreurs 401/403, paiements rejetés en série, générations anormales | 🔧 |
| Sauvegardes quotidiennes (Supabase Pro en production) ; test de restauration trimestriel | 🔧 |
| **Test d'intrusion** avant le lancement public (au minimum : outil automatique + test manuel des points ci-dessus) | 🔧 |
| Procédure d'incident écrite : couper l'accès, faire tourner les clés, prévenir les clients concernés, corriger | 🔧 |

---

## 11. Lancer les tests de sécurité

```bash
mkdir -p /tmp/pglite && cd /tmp/pglite && npm init -y && npm install @electric-sql/pglite@0.5.8
```
```bash
node db/tests/security.test.mjs /tmp/pglite
```
Résultat au 10/10/2026 : **44 réussis, 0 échoué**, sur PGlite 0.3.16 puis sur **0.5.8** (version épinglée). Les tests couvrent : isolation entre clients (7), injection SQL (5), secrets (8), visiteur non connecté (4), crédits et paiements (9), rôles et lecture seule (5), administration (4), couverture RLS (2).
⚠ Ces tests simulent les rôles Supabase. À refaire **sur le projet Supabase de développement** (avec le stockage, migration 0002) avant la production.
