# Règles de sécurité et cas limites — Pubeka

> Version 1 · 10 octobre 2026
> **Qui peut faire quoi**, **comment chaque entrée est validée**, et **comment l'application se comporte dans les situations limites**. Ce document fixe des règles de code ; les protections déjà en place (RLS, en-têtes, secrets, administration) sont décrites dans [SECURITE-BACKEND](SECURITE-BACKEND.md).
>
> Documents liés : [API_SPEC](API_SPEC.md) (codes d'erreur) · [LLD](LLD.md) · [TESTING](TESTING.md) · [APPFLOW](../produit/APPFLOW.md) · [TRD](../produit/TRD.md).
>
> Légende : ✅ décidé (dans un document précédent) · 🔶 décidé ici, à valider · 🧪 à vérifier · ❓ à trancher (§6).
>
> Chaque cas limite a un identifiant (`EC-…`) : le test qui le prouve le cite dans son nom (TESTING §1).

## Sommaire

1. [Les acteurs](#1-les-acteurs)
2. [Qui peut faire quoi](#2-qui-peut-faire-quoi)
3. [Validation des entrées](#3-validation-des-entrées)
4. [Ce qui sort : affichage, e-mails, exports, IA](#4-ce-qui-sort--affichage-e-mails-exports-ia)
5. [Cas limites et comportement attendu](#5-cas-limites-et-comportement-attendu)
6. [Points à trancher](#6-points-à-trancher)

---

## 1. Les acteurs

| Acteur | Comment il est reconnu | Ce qu'il voit de la base |
|---|---|---|
| **Visiteur** | aucune session | `/public/*`, blog et guides publiés |
| **Utilisateur connecté** | session Supabase valide (`getUser()` côté serveur) | son profil, ses notifications, les espaces dont il est membre |
| **Membre** d'un espace | ligne dans `workspace_members` avec un rôle : `owner`, `editor`, `viewer` | les données de cet espace uniquement (RLS) |
| **Administrateur** | présent dans `private.admin_users` **et** session `aal2` **et** non verrouillé | tout, en lecture ; écritures limitées (§2.6) ; chaque action journalisée |
| **Fournisseur** (SasPay, Meta, fal, Higgsfield, BytePlus, Resend) | signature du webhook valide | rien : il déclenche un traitement serveur |
| **Tâche de fond** | s'exécute avec la clé secrète Supabase | ce que son code lit, pour l'espace reçu en paramètre |
| **Agent IA** | — | **rien** : il reçoit ses données en entrée et ne lit ni n'écrit la base (LLD §6.10) |

Un utilisateur peut être membre de **plusieurs** espaces, avec un rôle différent dans chacun. Ses droits sont toujours évalués **pour l'espace de la requête** (`/workspaces/{workspaceId}`).

---

## 2. Qui peut faire quoi

### 2.1 L'état de l'espace passe avant le rôle

| État de l'espace | Quand | Effet sur les droits |
|---|---|---|
| `active` | abonnement ou essai en cours | les droits du rôle s'appliquent |
| `grace` | jusqu'à 3 jours après la fin de période d'une formule payée, ou son annulation : la fin de période est le seul moment qui compte, sans relance de facturation (✅ Q48, décision de la personne 26/10/2026) | **lecture** des campagnes et statistiques, **achat de crédits** et **mise en pause** ; ni création, ni publication, ni reprise, ni génération, ni modification (`403 workspace_read_only`) ; bandeau « Renouvelle avant le JJ/MM… toutes tes publicités seront mises en pause » avec compte à rebours |
| `locked` | essai terminé **sans abonnement** (immédiat, sans grâce), ou grâce de 3 jours écoulée (décision de la personne 26/10/2026, remplace la « lecture seule après la grâce » de la décision 5) | **tout est refusé**, lecture des statistiques comprise (`403 workspace_locked`), **sauf** : s'abonner ou renouveler (paiement, preuve de paiement), **mettre en pause** une campagne qui diffuse chez Meta, écrire au support, exporter et supprimer son compte, se déconnecter, lire l'état de l'espace (pour afficher l'écran « Choisis une formule » / « Renouvelle »). Les campagnes déjà lancées continuent chez Meta (EC-PAY-11). La base garde les lectures (export, suppression) |
| `read_only` | décision de l'administration | lecture seule, **sauf** les actions marquées ✱ dans les tableaux |
| `suspended` | décision de l'administration | lecture des campagnes et statistiques, **mise en pause** et **support** seulement ; **pas de paiement** tant que la suspension dure (✅ décision 4) ; tout le reste `403 workspace_suspended` |

✱ = toujours permis en lecture seule, en grâce et verrouillé (la pause et le support aussi en suspension ; le paiement et la preuve de paiement **jamais** en suspension, option `writable: 'not_suspended'`) : **mettre en pause** une campagne (envoyé directement à Meta, pour que le client arrête de dépenser), **payer**, **envoyer une preuve de paiement**, **écrire au support**, **gérer son profil**.

### 2.1 bis Modèle de l'accès (décision de la personne 26/10/2026) et pause automatique (S19b)

- **Essai** (`trialing`, 7 jours, 1 campagne, 3 visuels photo) : actif. **Formule payée** en période : actif. Un espace **sans abonnement ni essai démarré** (avant S24) reste **actif avec les limites Starter** ; S24 branchera l'essai.
- Un espace qui prend un abonnement **sans faire l'essai** n'a plus droit à l'essai : indicateur « essai déjà utilisé ou ignoré » à poser en **S24** (colonne ou ligne d'abonnement d'essai : pas de migration en S19).
- `effectiveAccess()`, `graceEndsAt()` et `lockAt()` (`packages/billing`) exposent le **moment exact** du verrouillage (fin d'essai, fin de grâce, `grace_until` prolongé compris). **Pause automatique livrée en S19b** : la tâche planifiée `campaign.lock-pause` (toutes les 10 minutes) met en pause chez Meta toutes les publicités des espaces verrouillés. Elle n'utilise pas `lockAt` : la liste des espaces vient de `public.workspaces_to_lock_pause(maintenant, limite)` (migration 0022, même règle SQL que `private.ws_access` mais à l'heure donnée, donc testable à horloge fixée), puis chaque espace est **relu** avec `loadWorkspaceAccess` juste avant d'agir (un renouvellement survenu entre-temps n'est pas pausé). Frontières prouvées : J+3 moins une milliseconde = grâce, J+3 exact = verrouillé ; essai terminé = verrouillé à la milliseconde.
- Tâches de fond : la synchronisation des statuts et des statistiques continue pour tous les espaces (miroir de Meta) ; une publication déjà lancée **finit** (pas de contrôle d'accès au démarrage de `runPublication`). Le **Modérateur** (texte IA, coût de Pubeka) n'explique plus rien dès que l'espace n'est plus actif (grâce comprise) : les refus restent « en attente » et sont expliqués au renouvellement.
- **Reprise MANUELLE** (décision confirmée le 26/10/2026) : à la fin de la grâce, et à la fin d'un essai sans abonnement, Pubeka met **automatiquement** en pause toutes les publicités du compte (S19b) ; après le renouvellement ou l'abonnement, **le client les relance lui-même** avec le bouton « Reprendre mes pubs » (`POST /workspaces/{id}/campaigns/resume-all`, confirmation avant dépense) : **jamais automatiquement** (aucune tâche n'appelle `resume`). Elle ne reprend **que** les campagnes au motif `pause_reason = 'billing_lock'` (colonne de la migration 0022, posée par la pause du verrouillage, effacée par un déclencheur dès que la campagne quitte l'état `paused`) : une campagne que le client avait mise en pause lui-même n'est jamais reprise. Reprendre active chez Meta (dépense) : espace **actif** exigé (`workspace_locked` / `workspace_read_only` sinon), `Idempotency-Key`, interrupteur `PUBEKA_META_PUBLISH` vérifié avant le premier appel (`503 publish_disabled`), chaque campagne passe par `resumeCampaign` (Meta d'abord, Page dans la formule, statut relu).
- **Prérequis `pause-all` LIVRÉ (S19b)** : `POST /workspaces/{id}/campaigns/pause-all` (propriétaire et éditeur, `allowLocked: true`, sans `writable`, `Idempotency-Key`, corps `{}`) sert le bouton « Mettre toutes mes publicités en pause » de l'écran verrouillé ; la tâche planifiée utilise le même moteur (`pauseWorkspaceCampaigns`). Règles du moteur : (1) **Meta d'abord et confirmé** : après l'ordre de pause, le statut est **relu** chez Meta ; une campagne n'est marquée « en pause » dans Pubeka que si Meta le confirme (un ordre qui échoue mais dont la relecture montre « en pause » est accepté ; un ordre accepté dont la relecture montre autre chose n'est pas marqué, `meta_error`/`pause_not_confirmed`) ; (2) **rejouable sans double effet** : pause idempotente chez Meta, transition locale gardée par le statut lu (un seul écrit, un seul événement), la pause n'est pas une dépense : un nouvel essai à la passe suivante est sans danger ; (3) **limites de débit** (EC-META-10) : budget de 100 campagnes et 50 espaces par passage, limite de l'application = arrêt de la passe, limite d'un compte publicitaire = on saute ses autres campagnes ; (4) **aucun autre compte touché** : chaque lecture est filtrée par `workspace_id` ; (5) la pause n'est **jamais** bloquée par `PUBEKA_META_PUBLISH` ; (6) une campagne en cours de publication n'est pas touchée (signalée `conflict`), la passe suivante la prend quand elle est en vérification ; (7) journal : chaque campagne mise en pause reçoit une ligne `campaign_status_events` (`status: paused`, `source: poll` pour la tâche, `user` pour le bouton, `payload: { event: pause, reason: billing_lock, from }`). Une pause du bouton en espace verrouillé pose aussi le motif `billing_lock` ; en grâce ou actif, c'est une pause du client, sans motif. Un échec (jeton expiré, réseau) est journalisé sans jeton ni donnée personnelle. **Démarche 👤 non faite ici** : poser les variables d'environnement sur Trigger.dev (staging puis production) pour que la planification tourne ; sans elles, la pause automatique ne tourne pas (le bouton marche, lui, depuis l'application).
- **LIMITE CONNUE** : « plus rien n'est lisible » en verrouillé n'est vrai que **via l'API**. Les lectures directes avec un jeton (PostgREST, stockage ; politiques `is_member`) restent ouvertes en verrouillé : c'est voulu pour l'export et la suppression du compte (§2.2), mais ce n'est pas un blocage de lecture au niveau de la base.
- **DÉPENDANCE S26 / S28** : `POST uploads` est `writable: true` et la politique de stockage `storage_upload_own_workspace` (0002) exige `private.ws_writable()`, vrai seulement en `active` (0021). Un client en grâce ou verrouillé ne peut donc ni envoyer une preuve de paiement (✱) ni une pièce jointe de support (✱). Avant S26 et S28, il faut une route/politique de dépôt dédiée aux ✱ (ex. `not_suspended` côté API et fonction `ws_can_upload_star` côté base, nouvelle migration). Aucune migration ajoutée en S19.
- **Abonnement « le plus récent »** : l'accès se lit sur la ligne la plus récente (`created_at desc, id desc`, SQL et TypeScript). **S24/S25 : un renouvellement ne doit jamais créer une ligne plus récente dont `period_end` est plus ancienne** que celle qu'elle remplace (mettre à jour la ligne ou écrire une `period_end` supérieure).
- **Limite connue du Modérateur** : la lecture des refus en attente est bornée (40 pages de 50, soit 2000 refus, triés par `created_at` puis `id`). Au-delà de 2000 refus `pending` anciens d'espaces non actifs, les espaces actifs ne sont pas atteints dans un passage (ils le seront quand ces refus seront expliqués au renouvellement ou purgés).
- Boutons « Payer » et « Écrire au support » des bandeaux et de l'écran verrouillé : affichés mais grisés, infobulle « Bientôt disponible », tant que `/abonnement` (S24, S25) et `/support` (S28) n'existent pas. Page de paiement **dans Pubeka** : S25.

### 2.2 Compte et équipe

| Action | owner | editor | viewer | Lecture seule | Note |
|---|:-:|:-:|:-:|:-:|---|
| Lire, modifier **son** profil, ses préférences de notification | ✅ | ✅ | ✅ | ✱ | concerne la personne, pas l'espace |
| Exporter **ses** données | ✅ | ✅ | ✅ | ✱ | 1 fois par jour |
| Supprimer **son** compte | ✅ | ✅ | ✅ | ✱ | réauthentification de moins de 5 min ; cas du propriétaire : EC-TEAM-06 |
| Voir l'espace (formule, quotas) | ✅ | ✅ | ✅ | ✅ | |
| Renommer l'espace | ✅ | ❌ | ❌ | ❌ | |
| Voir les membres | ✅ | ✅ | ✅ | ✅ | e-mails des autres membres visibles par tous les membres 🔶 |
| Inviter, retirer, changer un rôle | ✅ | ❌ | ❌ | ❌ | limite de membres de la formule |
| Accepter une invitation | — | — | — | — | la personne invitée, connectée avec **l'e-mail invité** (EC-TEAM-02) |

### 2.3 Meta et marque

| Action | owner | editor | viewer | Lecture seule |
|---|:-:|:-:|:-:|:-:|
| Connecter, déconnecter Meta ; lancer le bilan de santé | ✅ | ❌ | ❌ | ❌ |
| Voir les connexions, Pages, comptes publicitaires (**jamais** le jeton) | ✅ | ✅ | ✅ | ✅ |
| Activer une Page (compte dans la limite de la formule) | ✅ | ❌ 🔶 | ❌ | ❌ |
| Choisir le compte publicitaire actif | ✅ | ❌ | ❌ | ❌ |
| Régler la langue et le ton des pubs d'une Page | ✅ | ✅ | ❌ | ❌ |
| Modifier le kit de marque | ✅ | ✅ 🔶 | ❌ | ❌ |

### 2.4 Campagnes, visuels, statistiques

| Action | owner | editor | viewer | Lecture seule |
|---|:-:|:-:|:-:|:-:|
| Voir campagnes, propositions, visuels, statistiques, rapports de refus | ✅ | ✅ | ✅ | ✅ |
| Envoyer des fichiers, lancer une analyse, répondre aux questions | ✅ | ✅ | ❌ | ❌ |
| Créer, modifier un brouillon ; générer une proposition | ✅ | ✅ | ❌ | ❌ |
| **Publier** (décompte le quota) | ✅ | ✅ | ❌ | ❌ |
| Modifier une campagne publiée (renvoyée à Meta) | ✅ | ✅ | ❌ | ❌ |
| **Mettre en pause** | ✅ | ✅ | ❌ | ✱ |
| Reprendre, relancer, appliquer la correction d'un refus | ✅ | ✅ | ❌ | ❌ |
| Actualiser les statistiques maintenant | ✅ | ✅ | ✅ 🔶 | ✅ |
| Lancer une génération, modifier une scène, accepter la bascule (dépense des crédits) | ✅ | ✅ | ❌ | ❌ |
| Annuler une génération en file | ✅ | ✅ (les siennes et celles des autres) 🔶 | ❌ | ✅ |
| Choisir un visuel, créer un autre format (gratuit) | ✅ | ✅ | ❌ | ❌ |
| Appliquer ou ignorer une suggestion de l'Optimiseur | ✅ | ✅ | ❌ | ❌ |

### 2.5 Argent, support, parrainage

| Action | owner | editor | viewer | Lecture seule |
|---|:-:|:-:|:-:|:-:|
| Voir abonnement, soldes, mouvements de crédits, paiements | ✅ | ❌ | ❌ | ✱ |
| Voir le **total** de crédits restants (bandeau) | ✅ | ✅ | ✅ | ✅ |
| Payer, acheter des crédits, changer de formule | ✅ | ❌ | ❌ | ✱ |
| Envoyer une preuve de paiement | ✅ | ❌ | ❌ | ✱ |
| Ouvrir un ticket, répondre, utiliser la bulle d'aide | ✅ | ✅ | ✅ 🔶 | ✱ |
| Voir les tickets de l'espace | ✅ | ses tickets 🔶 | ses tickets 🔶 | ✅ |
| Voir son code de parrainage et ses filleuls | ✅ | ❌ 🔶 | ❌ | ✅ |

### 2.6 Administration

L'administrateur agit **uniquement** depuis le chemin secret, en `aal2`. Dans l'application client, s'il est aussi membre d'un espace, il n'a **que** les droits de son rôle.

| Peut | Ne peut pas |
|---|---|
| Lire toutes les fiches (journalisé) ; « voir comme le client » en **lecture seule** | Agir **au nom** d'un client dans l'application (publier, payer, générer) |
| Suspendre, réactiver, changer de formule, prolonger (motif obligatoire) | Lire un jeton Meta déchiffré, un mot de passe, un secret TOTP |
| Offrir ou retirer des crédits : de −500 à +500, motif de 3 caractères au moins | Modifier ou supprimer une ligne du registre de crédits ou du journal (la base refuse) |
| Valider ou refuser une preuve de paiement | Modifier le montant d'un paiement reçu |
| Gérer le catalogue de modèles, le routage, la TVA, les réglages, le mode maintenance | Se donner ou retirer des droits d'administration (aucune route ; uniquement par migration SQL) |

### 2.7 Comment ces règles sont appliquées

1. **Dans `api()`** (LLD §6.1) : `roles` et `writable` déclarés sur chaque route ; les actions ✱ sont les **seules** routes d'écriture sans `writable: true`.
2. **Dans le cas d'usage** (`core`) : `assertRole()` et `assertWritable()` revérifient, car une tâche de fond ou une autre route peut appeler le même cas d'usage.
3. **Dans la base** : RLS, droits par colonne, `private.ws_writable()` (déjà testés, SECURITE-BACKEND §2). Depuis la migration 0021 (S19), `ws_writable` applique la MÊME règle que `workspaceAccess` (grâce de 72 h après la fin de période puis état verrouillé ; annulation = même chose ; essai terminé = verrouillé tout de suite ; lecture seule et suspension de l’administration). Seul l’état `active` écrit : un éditeur qui appelle PostgREST directement est refusé comme par l’API. Un test compare la règle SQL à la règle TypeScript sur une grille de dates et d’états.

Les trois barrières sont **indépendantes** : une seule qui manque ne suffit pas à ouvrir un accès. Le test d'une route vérifie la première ; les tests PGlite vérifient la troisième.

---

## 3. Validation des entrées

### 3.1 Règles générales

1. **Toute entrée est validée par un schéma Zod strict** (`z.strictObject`) **avant** d'atteindre un cas d'usage : corps, paramètres d'adresse, paramètres de requête, en-têtes utiles. Champ inconnu → `400 validation_failed`.
2. **La base revérifie** : formats, longueurs et valeurs autorisées sont aussi des contraintes SQL (SECURITE-BACKEND §2). Les deux listes doivent rester identiques ; une différence est un défaut.
3. **Normalisation avant validation**, dans cet ordre : normalisation Unicode **NFC** → suppression des caractères de contrôle (sauf retour à la ligne dans les textes longs) → suppression des espaces au début et à la fin. La longueur est mesurée **après** normalisation.
4. **Les longueurs sont en caractères** (points de code Unicode), pas en octets : un emoji compte pour 1 ou 2 selon ses points de code, comme chez Meta 🧪 (à confirmer sur l'aperçu Meta avant de figer le compteur de l'interface).
5. **Liste d'autorisation, jamais liste d'interdiction** : on définit ce qui est permis (types de fichiers, schémas d'URL, valeurs d'énumérations), tout le reste est refusé.
6. **Taille maximale du corps** : 1 Mo pour une requête JSON, 1 Mo pour un webhook 🔶 ; au-delà, `413` avant toute lecture du JSON. Les fichiers ne passent jamais par l'API (API_SPEC §13).
7. **Aucune donnée d'entrée ne sert de chemin, de nom de fichier, de nom de table, de commande ou de requête SQL.** Les chemins de stockage sont construits par le serveur : `{workspace_id}/{uuid}.{extension déduite du type réel}`.

### 3.2 Par type de donnée

| Donnée | Règle | Refus |
|---|---|---|
| Identifiant | UUID ; on vérifie ensuite qu'il appartient à l'espace de la requête | `400` si mal formé, `404` s'il n'est pas dans l'espace |
| E-mail | ≤ 254 caractères, format standard, mis en minuscules ; les adresses relais d'Apple (« masquer mon e-mail ») sont des e-mails normaux | `400` |
| Téléphone | Stocké au format **E.164** (`^\+[1-9][0-9]{6,14}$`) ; l'interface préfixe l'indicatif du pays choisi (+237, +225…) et retire espaces et tirets avant l'envoi 🔶 | `400` |
| URL fournie par l'utilisateur | `http` ou `https` seulement, ≤ 2 048 caractères, **pas d'identifiants** dans l'adresse (`user:pass@`), nom de domaine converti en punycode, puis `assertPublicUrl()` (adresses privées, locales et de métadonnées refusées, revérifié après chaque redirection, 5 au maximum) | `400` (format) ou `422 unsafe_url` |
| Identifiants Meta | Page, campagne : chiffres seulement ; compte publicitaire : `act_` + chiffres ; pixel : 5 à 25 chiffres | `400` |
| Couleur | `#RRGGBB` | `400` |
| Montant | **entier** ; unité mineure de chaque monnaie (ISO 4217 : FCFA 0 décimale, naira 2, dinar tunisien 3), dollars en centimes ; jamais négatif sauf retrait de crédits par l'administration | `400` |
| Budget quotidien | ≥ **100 centimes** (1 $, TR-PLA-10) ; maximum 1 000 000 centimes (10 000 $) 🔶 contre les fautes de frappe | `422 budget_too_low` / `400` |
| Montants de campagne | Coût = budget par jour × jours, en entiers ; **TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision** | — |
| Dates de campagne | `YYYY-MM-DD` dans le fuseau de l'utilisateur ; début ≥ aujourd'hui ; fin > début (deux jours au moins) ; durée ≤ 365 jours, début et fin compris 🔶 | `400` / `422` |
| Textes de la pub | texte principal ≤ 125, titre ≤ 40, description ≤ 30 caractères ; pas de HTML | `400` |
| Textes libres | ticket ≤ 10 000, message à l'aide ≤ 2 000, consigne de modification d'un visuel 3 à 500, nom 1 à 120 ; enregistrés tels quels, **affichés échappés** | `400` |
| Énumérations | uniquement les valeurs d'`openapi.yaml` | `400` |
| Pagination | `limit` 1 à 100 ; `cursor` signé par le serveur (`APP_SIGNING_SECRET`), refusé s'il a été modifié | `400` |
| `Idempotency-Key` | UUID ; obligatoire sur les routes marquées 🔑 | `400` |
| `Accept-Language` | `fr` ou `en` ; toute autre valeur → langue du profil | — |
| Réponses aux questions de l'Analyste | ≤ 500 caractères, identifiant de question existant dans **cette** analyse | `400` / `422` |

### 3.3 Fichiers

| Contrôle | Règle |
|---|---|
| Type | Liste d'autorisation : PNG, JPEG, WebP, PDF, DOCX. Vérifié sur les **premiers octets** du fichier reçu, pas sur l'extension ni sur le type annoncé |
| Taille | Image ≤ **10 Mo**, PDF et DOCX ≤ **20 Mo** (TR-SEC-08) ; annoncée à la demande d'URL d'envoi **et** revérifiée après l'envoi |
| Dimensions d'image | ≤ 40 mégapixels 🔶 (une petite image peut se décompresser en une énorme : refus avant décodage complet) |
| Ré-encodage | Toute image envoyée est **ré-encodée** : supprime les métadonnées EXIF (dont la position GPS) et tout contenu caché |
| PDF | Texte extrait seulement, jamais exécuté ; ≤ 50 pages lues 🔶 |
| DOCX | C'est une archive ZIP : taille décompressée ≤ 50 Mo et ≤ 1 000 fichiers internes 🔶 (protection contre les « bombes » de décompression) |
| Nom d'origine | Jamais utilisé comme chemin ; conservé seulement comme libellé affiché, échappé |
| Référence `file_path` envoyée par le client | Doit commencer par `{workspace_id}/` de la requête **et** exister en base pour cet espace ; sinon `404` |
| Nombre de références | ≤ 10 par génération, et ≤ `max_references` du modèle choisi |

### 3.4 Webhooks

1. Lire le **corps brut** (≤ 1 Mo), vérifier la signature **avant** de lire le JSON (API_SPEC §12).
2. Horodatage à ± 5 minutes quand le fournisseur l'envoie (SasPay : `X-Webhook-Timestamp`).
3. Identifiant d'événement déjà vu → `200`, aucun traitement (`webhook_events`, LLD §10 E3).
4. Puis validation du JSON par un schéma Zod **propre à chaque événement** ; un événement inconnu est journalisé et ignoré (`200`), jamais traité « au mieux ».
5. Un webhook ne fait **jamais** confiance à un montant, un espace ou un statut sans relire la source (SasPay : relecture du paiement).

### 3.5 Les sorties de l'IA sont aussi des entrées

Une réponse d'agent ou un résultat de génération est traité comme une donnée **non fiable** :

- validée par son schéma (une seule nouvelle tentative, puis échec : TR-AGT-01) ;
- longueurs de la pub revérifiées avant publication, même si le schéma les impose déjà ;
- une URL proposée par un agent n'est **jamais** ouverte par le serveur ;
- aucune sortie d'IA ne devient un chemin, une requête SQL, du HTML interprété ou une commande ;
- le contenu des sources est encadré comme **donnée** (`wrapUntrusted`) et les tentatives d'injection sont signalées (TR-SEC-07).

---

## 4. Ce qui sort : affichage, e-mails, exports, IA

| Sortie | Règle |
|---|---|
| Interface | Échappement automatique de React ; **aucun** `dangerouslySetInnerHTML` (seule exception : JSON-LD produit par `JSON.stringify`) |
| Blog et guides (Markdown) | Convertis puis **nettoyés** (liste d'autorisation de balises, pas de `script`, pas d'attributs `on…`, liens externes en `rel="noopener noreferrer"`) |
| E-mails | Modèles React Email (échappement automatique) ; aucun texte saisi par un utilisateur dans l'**objet** de l'e-mail sans échappement ni limite de longueur |
| Export CSV des statistiques | Toute cellule qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est préfixée par `'` (sinon un tableur l'exécute comme une formule) |
| Export PDF | Généré côté serveur à partir de données, jamais à partir de HTML fourni par l'utilisateur |
| Erreurs | Format Problem Details uniquement ; jamais de trace, de SQL ou de message brut d'un fournisseur (API_SPEC §3.3) |
| Fichiers | Toujours par **URL signée** (15 minutes) ; jamais d'URL publique permanente ; en-tête `Content-Disposition: attachment` pour les téléchargements |
| Journaux, Sentry, PostHog | Masquage par nom de champ : jetons, clés, mots de passe, `authorization`, téléphone, contenu des preuves de paiement ; revisionnage de sessions PostHog avec champs masqués |

---

## 5. Cas limites et comportement attendu

### 5.1 Connexion et session

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-AUTH-01 | La session expire au milieu de l'assistant de campagne | Les saisies restent sur l'appareil ; après reconnexion, retour à la même étape avec les mêmes saisies | `401 session_expired` |
| EC-AUTH-02 | Déconnexion dans un onglet, l'autre onglet reste ouvert | La requête suivante de l'autre onglet reçoit `401` et redirige vers la connexion ; le cache des données est vidé | `401` |
| EC-AUTH-03 | Déconnexion pour inactivité pendant une génération ou une publication | La tâche serveur **continue** ; le résultat est visible à la reconnexion et une notification est envoyée (TR-SEC-13) | — |
| EC-AUTH-04 | Cinq mauvais mots de passe | Blocage de 15 min **pour ce couple e-mail + adresse IP** 🔶, pour qu'un inconnu ne puisse pas bloquer le compte de quelqu'un d'autre ; CAPTCHA (SECURITE-BACKEND §3) dès le 3ᵉ échec 🔶 | message identique à « mauvais mot de passe » |
| EC-AUTH-05 | E-mail inconnu au « mot de passe oublié » | Même message et même délai de réponse qu'un e-mail connu (pas de découverte des comptes) | `200` |
| EC-AUTH-06 | Lien de réinitialisation utilisé deux fois, ou après 1 heure | Refusé ; proposer d'en recevoir un nouveau. Après une réinitialisation réussie, **toutes les autres sessions** sont fermées | — |
| EC-AUTH-07 | Même adresse e-mail utilisée avec Google puis avec mot de passe | 🧪 Comportement de liaison des identités de Supabase Auth à vérifier ; règle : **un seul compte par e-mail vérifié**, donc un seul essai gratuit | — |
| EC-AUTH-08 | Changement d'adresse e-mail | Réauthentification de moins de 5 min, puis confirmation sur **l'ancienne et la nouvelle** adresse 🔶 | `403 mfa_required` si trop ancienne |
| EC-AUTH-09 | Plusieurs personnes derrière la même adresse IP (cybercafé, réseau mobile qui partage une IP entre de nombreux abonnés, très courant) | Limites de débit **par utilisateur d'abord** ; la limite par IP ne s'applique qu'aux routes sans connexion et reste large (API_SPEC §11) | `429` seulement si l'utilisateur lui-même abuse |

### 5.2 Équipe

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-TEAM-01 | Invitation d'une personne déjà membre | Refus | `409 conflict` |
| EC-TEAM-02 | Invitation acceptée par un compte dont l'e-mail **diffère** de l'e-mail invité | Refus : le jeton est lié à l'e-mail invité 🔶 | `403 forbidden` |
| EC-TEAM-03 | Invitation expirée ou déjà utilisée | Refus ; le propriétaire peut réinviter | `410 gone` |
| EC-TEAM-04 | Membre retiré alors qu'il a une session ouverte | Sa requête suivante sur l'espace → `404` ; son abonnement temps réel est fermé ; ses données en attente hors connexion pour cet espace sont effacées | `404` |
| EC-TEAM-05 | Le propriétaire essaie de se retirer lui-même ou de changer son propre rôle | Refus : un espace a toujours **exactement un** propriétaire | `409 conflict` |
| EC-TEAM-06 | Le propriétaire supprime son compte alors que d'autres membres existent | ✅ L'écran propose d'abord de **transférer la propriété** à un membre (`POST /workspaces/{id}/transfer-ownership`). Sans transfert : l'espace et ses données sont supprimés, et chaque membre reçoit un e-mail d'avertissement **avant** la suppression | `202` |
| EC-TEAM-07 | Passage à une formule inférieure avec plus de membres que la nouvelle limite | 🔶 Le changement est refusé tant que le propriétaire n'a pas retiré les membres en trop ; l'écran les liste | `409 member_limit_reached` |
| EC-TEAM-08 | Deux personnes modifient la même campagne en même temps | ✅ Chaque campagne a un numéro `version`, renvoyé à chaque lecture et **obligatoire** dans chaque modification. Version périmée : refus, l'écran recharge et montre ce qui a changé | `409 conflict` (`meta.current_version`) |

### 5.3 Meta

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-META-01 | Jeton expiré au moment de publier | Campagne → `error`, **quota rendu**, notification « Reconnecte Meta » | `424 meta_token_expired` |
| EC-META-02 | L'utilisateur retire l'autorisation de Pubeka dans Facebook | Connexion marquée `revoked` à la prochaine erreur ou par webhook ; campagnes **toujours actives chez Meta** ; bandeau « Reconnecte Meta pour gérer tes campagnes » | `424` |
| EC-META-03 | Page retirée du portefeuille business, ou droits perdus sur la Page | Page désactivée chez nous, campagnes conservées en lecture, notification au propriétaire | — |
| EC-META-04 | Compte publicitaire désactivé par Meta | Bilan de santé en échec, publication bloquée, lien vers l'aide de Meta | `424` |
| EC-META-05 | Publication **réussie chez Meta** mais réponse perdue (délai dépassé) | Résultat ambigu : **pas de nouvel envoi automatique** ; la tâche cherche d'abord chez Meta une campagne portant notre référence de publication 🔶 (ex. libellé contenant l'identifiant de la campagne Pubeka), puis décide | — |
| EC-META-06 | Une seule des deux pubs d'un test A/B est refusée | La campagne reste active avec l'autre pub ; le Modérateur ne traite que la pub refusée (✅ S18 : chaque publicité est lue ; la campagne n'est « refusée » que si TOUTES le sont ; la republication en un clic d'une seule pub n'existe pas encore : `409 partial_rejection`) | — |
| EC-META-07 | Pause demandée alors que Meta ne répond pas | La campagne **n'est pas** affichée comme en pause ; message « Meta ne répond pas, réessaie » ; pas de faux succès | `502 meta_error` |
| EC-META-08 | Campagne modifiée ou supprimée directement dans le gestionnaire de publicités de Meta | La synchronisation horaire reprend les valeurs de Meta (**Meta fait foi** pour statut, budget et dates d'une campagne publiée) 🔶 ; supprimée → `stopped`, historique conservé | — |
| EC-META-09 | Webhook Meta pour une campagne inconnue de nous | Journalisé, ignoré | `200` |
| EC-META-10 | Limite de requêtes de Meta atteinte | Les tâches attendent selon les en-têtes de Meta ; les statistiques gardent leur dernière valeur avec l'heure de mise à jour affichée | — |
| EC-META-11 | Compte publicitaire dans une autre monnaie que le dollar | 🧪 Budget converti dans la monnaie du compte ; minimum de Meta pour cette monnaie à vérifier avant publication | `422 budget_too_low` |

### Interrupteur de la publication réelle (kill-switch, S16)

Risque : avec Meta RÉEL (préproduction, production), un clic sur « Publier » crée puis ACTIVE une vraie campagne, donc dépense de l'argent réel. Mesure : `PUBEKA_META_PUBLISH=enabled` est exigé (ENV_SETUP §1.1) ; absent ou autre valeur, **désactivé**, par défaut aussi en production. Désactivé :

- `publish` refuse en `503 provider_unavailable` (`meta.reason: publish_disabled`) juste après les contrôles de rôle et d'espace, AVANT toute lecture, écriture, clause enregistrée, quota ou tâche ;
- la tâche `campaign.publish` refuse avant de lire le jeton ou d'appeler Meta (rien créé : échec net, quota rendu ; des éléments existent peut-être chez Meta : elle reste en attente et reprend par rapprochement quand l'interrupteur est activé, sans jamais recréer) ;
- `resume` et `relaunch` en mode `recover` (activent chez Meta) refusent de même ; `relaunch` en mode `copy` ne touche pas à Meta ;
- `pause` n'est jamais bloquée (elle arrête la dépense), la lecture reste libre, ainsi que l'estimation de portée (lecture seule).

Défense en profondeur : le connecteur Meta RÉEL est lui-même enveloppé (`core/meta/publish-gate.ts`) : `createCampaign`, `resume` et `updateCampaign` refusent (503, `publish_disabled`) sans `PUBEKA_META_PUBLISH=enabled`, même si un chemin de code oubliait la vérification ; `pause`, les lectures, l'estimation et la suppression d'orphelins en pause restent permises.

Reprise d'une publication restée « en publication » (EC-META-05, tâche planifiée `campaign.reconcile`, toutes les 10 minutes, un seul essai) : seules les campagnes en phase `creating`, `created` ou `activating` depuis plus de 5 minutes sont reprises, 20 au plus par passage. Règle : trouvée chez Meta et déjà en diffusion = `in_review` ; trouvée en pause = activée SEULEMENT si l'interrupteur est activé ; introuvable après lecture COMPLÈTE de la liste = échec net, quota rendu ; lecture en erreur ou incomplète = rien ne change ; plus de 24 h sans issue = `error` (`reason: reconcile_timeout`), quota rendu, Meta n'est pas modifié. Reste à S35 : audit des campagnes qui existeraient encore chez Meta après un abandon, et rattrapage d'un quota resté `held` (`afterAccepted` en échec, S24).

Avec la fausse Meta (`PUBEKA_FAKE_PROVIDERS` contenant `meta`, ou `all`) l'interrupteur n'est pas exigé : rien n'est dépensé. Preuves : `publish-switch.test.ts`, `publish-deps.test.ts`, tests de `publishCampaign`, `runPublication`, `campaign-control` et leurs tests d'intégration (compteur de la fausse Meta à 0).

### 5.4 Campagnes

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-CAMP-01 | Double clic sur **Publier** | Même `Idempotency-Key` → une seule publication, un seul quota décompté | `202` puis réponse rejouée |
| EC-CAMP-02 | Quota atteint entre l'aperçu et la publication (un autre membre a publié) | Brouillon conservé, proposition de formule supérieure | `402 campaign_quota_reached` |
| EC-CAMP-03 | Formule 1 Page : publier avec la Page B alors que la Page A est déjà utilisée ce mois-ci | Refus avec la date à partir de laquelle la Page B sera utilisable (✅ Q28) | `402 page_limit_reached` |
| EC-CAMP-04 | La date de début est passée au moment de publier (minuit, fuseau) | Début ramené à « maintenant » ; si la fin devient antérieure au début, refus avec la correction proposée | `422` |
| EC-FX-01 | Le fournisseur des taux est en panne, bloque l'adresse (429) ou renvoie un taux aberrant | Anciens taux conservés jusqu'à 48 h, puis dollar seul (`fx_not_available`) ; erreur journalisée, aucune relance automatique ; taux nul, négatif, NaN ou variant de plus de 50 % rejeté | — |
| EC-FX-02 | Quelqu'un tente de lire ou de publier le tableau des taux | Table réservée au service (aucune politique pour les connectés), aucune route ne l'expose (le fournisseur interdit la redistribution) | `403` / absent |
| EC-CAMP-05 | Le taux de change a bougé entre l'aperçu et la publication | Montant recalculé ; si l'écart dépasse 2 % 🔶, l'écran redemande la confirmation | `409 conflict` (`meta.new_total`) |
| EC-CAMP-06 | Publication avec un visuel dont les fichiers ont expiré (7 jours) | Refus, propositions : « Générer un visuel similaire » ou en choisir un autre | `410 gone` |
| EC-CAMP-07 | Republication après refus | **Aucun** quota décompté (✅ TR-PLA-09) | `202` |
| EC-CAMP-08 | Première publication de l'espace de travail sans avoir accepté la clause de responsabilité (une seule fois par espace de travail) | Refus ; l'écran affiche la clause (✅ Q54) | `400 validation_failed` (champ `accept_liability`, `meta.reason: liability_required`) : la liste fermée d'API_SPEC §4 n'a pas de `422` générique, `openapi.yaml` fait foi |
| EC-CAMP-09 | Formule inférieure : campagne d'une Page devenue hors formule | Elle continue chez Meta, modification refusée, **pause permise** (✅ Q29) | `402 page_limit_reached` |

### 5.5 Crédits et générations

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-CRED-01 | Deux générations lancées en même temps, crédits suffisants pour une seule | Le verrou par espace (`reserve_credits`) sert la première ; la seconde est refusée | `402 insufficient_credits` |
| EC-CRED-02 | Crédits exactement égaux au coût | Acceptée ; solde à 0 | `202` |
| EC-CRED-03 | 2 visuels sur 3 réussis | Crédits des 2 consommés, celui du 3ᵉ rendu (LLD §10 E4) | statut `partial` |
| EC-CRED-04 | Contenu refusé par le fournisseur (NSFW) | Crédits rendus, message neutre sans détail du refus | statut `nsfw` |
| EC-CRED-05 | Webhook du fournisseur reçu **avant** que notre enregistrement soit visible | La correspondance requête ↔ génération est écrite **avant** l'envoi au fournisseur ; si elle reste introuvable : `404` pour que le fournisseur réessaie, plus une vérification planifiée des générations bloquées | `404` |
| EC-CRED-06 | Même résultat reçu deux fois | Un seul visuel, une seule consommation (✅ TR-MED-10) | `200` |
| EC-CRED-07 | Fichier du résultat introuvable au téléchargement | 3 essais espacés, puis visuel en échec et crédit rendu | — |
| EC-CRED-08 | Annulation demandée alors que le fournisseur a commencé | Refus : annulation possible seulement en file d'attente | `409 conflict` |
| EC-CRED-09 | Bascule acceptée, puis le résultat d'origine arrive quand même | Le premier résultat d'origine est **ignoré** (coût absorbé par Pubeka) ; les crédits d'origine ont été rendus à l'acceptation ; seuls ceux de la bascule sont consommés | — |
| EC-CRED-10 | Modèle désactivé par l'administration pendant qu'une génération attend | Déjà envoyée : continue. Pas encore envoyée : la bascule est proposée, sinon annulation et crédits rendus | — |
| EC-CRED-11 | Budget mensuel de 15 $ d'un fournisseur atteint | Ses modèles passent « indisponibles » ; la bascule vers un modèle testé est proposée (✅ TR-MED-08) | `503 provider_unavailable` si aucun secours |
| EC-CRED-12 | Crédits rendus **après** la fin de la période (génération à cheval) | ✅ Rendus dans le compartiment **bonus** (le client ne perd pas des crédits qu'il n'a pas pu utiliser) ; le registre l'indique avec le motif | — |
| EC-CRED-13 | Texte trop long pour sa zone dans le visuel | Le rendu signale le débordement ; l'écran demande de raccourcir ; la police n'est jamais réduite sous la taille minimale de la mise en page 🔶 | `200` (`overflow`) |

### 5.6 Paiements et abonnement

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-PAY-01 | Le webhook SasPay arrive avant le retour de l'utilisateur sur Pubeka | L'écran « Paiement en cours de vérification » interroge l'état et affiche le succès dès qu'il est connu | — |
| EC-PAY-02 | Le webhook n'arrive jamais | Vérification planifiée des paiements en attente chez SasPay ; sans réponse après 24 h 🔶 → `expired` et proposition d'envoyer une preuve | — |
| EC-PAY-03 | Deux paiements lancés dans deux onglets (clés d'idempotence différentes) | Une seule session de paiement **en attente** par espace et par objet : la deuxième demande renvoie la session existante 🔶 | `200` (session existante) |
| EC-PAY-04 | Montant du paiement relu chez SasPay ≠ montant enregistré | **Pas d'activation** ; paiement en vérification manuelle ; alerte à l'administrateur | — |
| EC-PAY-05 | Paiement réussi pour un espace supprimé entre-temps | Paiement enregistré, alerte à l'administrateur pour traitement manuel | — |
| EC-PAY-06 | Passage à une formule supérieure la veille de la fin de période | Règle ✅ : différence de prix entière, même date de fin ; l'écran affiche avant le paiement « Ta période se termine dans 1 jour » 🔶 | — |
| EC-PAY-07 | Formule inférieure programmée, puis formule supérieure avant la fin de la période | La formule inférieure programmée est annulée | — |
| EC-PAY-08 | Preuve de paiement envoyée pour un paiement déjà activé | Refus | `409 conflict` |
| EC-PAY-09 | Période qui commence un 31 | Le mois suivant se termine le **dernier jour** du mois s'il n'a pas de 31 (ex. 31 janvier → 28 ou 29 février) 🔶 | — |
| EC-PAY-10 | Affichage en XOF au lieu de XAF | Les deux francs CFA ont la même valeur (même parité fixe avec l'euro) : seule l'unité affichée change, aucun calcul | — |
| EC-PAY-11 | Fin de l'essai avec une campagne en cours | Espace **verrouillé** (décision de la personne 26/10/2026) ; la campagne **continue chez Meta** (le client paie Meta directement) **jusqu'à la pause automatique** (`campaign.lock-pause`, S19b : au plus 10 minutes après la fin de l'essai, ou tout de suite par le bouton « Mettre toutes mes publicités en pause »), puis la **reprise est manuelle** (« Reprendre mes pubs », seulement les campagnes au motif `billing_lock`) après abonnement ; un échec de pause chez Meta ne marque rien et est réessayé à la passe suivante | Test d'horloge fixée (`lock-pause-sweep.test.ts`, `workspace-access`/`billing-lock-pause.test.mjs`) ; `lock-pause.int.test.ts` |
| EC-PAY-12 | Parrainage avec son propre code, ou filleul qui paie depuis le même numéro Mobile Money que le parrain | Pas de récompense 🔶 | — |
| EC-PAY-13 | Deuxième essai gratuit sur un nouveau compte | Un essai par compte (✅ Q51) ; la détection des doublons entre comptes viendra plus tard | — |

### 5.7 Sources et analyse

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-SRC-01 | Lien qui redirige vers une adresse interne | Refus à la redirection concernée | `422 unsafe_url` |
| EC-SRC-02 | Page très lourde ou qui ne finit jamais | Lecture coupée à la taille maximale et au délai maximal ; le texte déjà lu est utilisé s'il suffit | — |
| EC-SRC-03 | Site protégé contre les robots (défi anti-robot, connexion obligatoire) | Jina Reader en secours ; sinon source « illisible » et proposition d'ajouter une capture ou du texte. **On ne contourne jamais** une protection anti-robot | `422 source_unreadable` si aucune source lisible |
| EC-SRC-04 | Publication Facebook ou Instagram qui exige d'être connecté | Illisible ; proposition d'envoyer une capture d'écran | — |
| EC-SRC-05 | Instructions cachées dans une page (« ignore tes règles… ») | Signalées (`PROMPT_INJECTION_SUSPECTED`), ignorées ; l'analyse continue (✅ TR-SEC-07) | — |
| EC-SRC-06 | Produit illégal évident | Arrêt **avant** toute dépense de crédits, explication, aucun contournement proposé ; contestation possible par ticket | `200` avec `status: blocked` et `blocked_reason: illegal_product` : l'analyse est asynchrone (`POST /analyses` répond `202`), le refus n'est connu qu'après la lecture des sources et se lit sur `GET /analyses/{id}`. Le code `illegal_product` reste dans la liste fermée (décision du chef de projet, S14) |
| EC-SRC-07 | Site dans une autre langue que celle de l'interface | Analyse dans la langue du site ; pubs dans la langue réglée pour la Page | — |
| EC-SRC-08 | Photos envoyées alors que le modèle réglé pour l'Analyste ne voit pas les images | Aucun appel IA, aucune dépense ; avec du texte l'analyse continue sans les photos (`IMAGES_NOT_READ`), sans texte elle échoue | `provider_unavailable` avec le signalement `MODEL_WITHOUT_VISION` (aucun nouveau code d'erreur, S14) |

### 5.8 Hors connexion

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-OFF-01 | Une modification en attente entre en conflit avec le serveur au retour du réseau | Retirée de la file, affichée à l'utilisateur avec le choix « Garder la version du serveur » ou « Refaire ma modification » | `409` ou `422` |
| EC-OFF-02 | Un autre utilisateur se connecte sur le même appareil | Les données en attente et le brouillon du compte précédent sont **effacés** de l'appareil 🔶 (confidentialité) | — |
| EC-OFF-03 | Tentative de publier, payer ou générer hors connexion | Boutons désactivés avec l'explication (✅ TR-PLT-08) ; jamais mis en file | — |

### 5.9 Administration, maintenance, suppression

| # | Situation | Comportement attendu | Réponse |
|---|---|---|---|
| EC-ADM-01 | L'administrateur est aussi client | Droits d'administration **seulement** sous le chemin secret en `aal2` ; dans l'application, les droits de son rôle | — |
| EC-ADM-02 | Mode maintenance actif | Toute l'API renvoie `503 maintenance`, **sauf** `/public/maintenance`, `/admin/*` et **les webhooks**, qui continuent d'être reçus et traités : un paiement qui arrive pendant la maintenance ne doit pas être perdu 🔶 | `503` |
| EC-ADM-03 | Administrateur verrouillé après 5 essais | Même réponse qu'un non-administrateur, alerte e-mail | `404` |
| EC-DEL-01 | Suppression du compte avec un abonnement payé en cours | Avertissement « aucun remboursement » (✅ Q47) ; confirmation `SUPPRIMER` | `202` |
| EC-DEL-02 | Suppression pendant une génération ou une publication | Tâches annulées ; résultats reçus ensuite ignorés ; campagnes déjà chez Meta conservées chez Meta (✅ Q44) | — |
| EC-DEL-03 | Données de facturation après suppression | Conservées (obligation légale, ✅ Q44), détachées du profil supprimé | — |

### 5.10 Heure et fuseaux

| # | Situation | Comportement attendu |
|---|---|---|
| EC-TIME-01 | L'utilisateur voyage (fuseau de l'appareil différent) | Affichage dans le fuseau **déclaré à l'inscription** (✅ TR-PLT-04), modifiable dans le profil |
| EC-TIME-02 | Échéances (grâce, 7 jours, rappels) | Calculées en UTC côté serveur ; seules les dates affichées sont converties |
| EC-TIME-03 | Horloge de l'appareil fausse | Aucune décision n'utilise l'heure de l'appareil, sauf le compte à rebours d'inactivité (qui s'appuie sur l'activité, pas sur l'heure) |

---

## 6. Décisions prises le 10/10/2026

Les 5 points ouverts ont été tranchés ; les règles sont reportées dans les tableaux ci-dessus.

| # | Question | Décision |
|---|---|---|
| 1 | Le propriétaire supprime son compte alors que l'espace a d'autres membres | Proposer d'abord le **transfert de propriété** ; sinon suppression de l'espace après e-mail d'avertissement aux membres (EC-TEAM-06) |
| 2 | Deux personnes modifient la même campagne | **Numéro de version** obligatoire ; version périmée → `409 conflict` (EC-TEAM-08) |
| 3 | Crédits rendus après la fin de la période | Rendus en **bonus** (EC-CRED-12) |
| 4 | Espace suspendu | Lecture, **pause**, support ; **pas de paiement** (§2.1) |
| 5 | Fin de l'essai | ~~Lecture seule~~ **Remplacée le 26/10/2026** : essai terminé sans abonnement = espace **verrouillé** tout de suite, écran « Choisis une formule » (§2.1) |

Conséquences techniques (LLD §10, migration `0003_api_support.sql`) : route de transfert de propriété et colonne `version` des campagnes ajoutées à `openapi.yaml` (E8, E9) ; libération des crédits en bonus après la fin de période (E4).
