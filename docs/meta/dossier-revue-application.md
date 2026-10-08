# Dossier de revue d'application Meta — AdsFacile

Application Meta : **Ads Live** (`1982764035683375`) · mode Live · entreprise propriétaire : « Lyon Deals » (`1548983646294478`).
État relevé le 8 octobre 2026 (lecture seule, outil Meta Developer Tools) :

| Point | État | Conséquence |
|---|---|---|
| Soumission de revue | aucune (`NO_SUBMISSION`) | aucune permission n'a l'accès avancé |
| Privilèges approuvés | aucun | seuls admin/développeur/testeur peuvent se connecter |
| Vérification d'entreprise | **non validée** | bloque les permissions sensibles |
| Conformité | conforme, aucune action requise | rien à corriger de ce côté |
| Icône d'application | **absente** | à ajouter avant la soumission |
| E-mail de contact | **non vérifié** | à vérifier |
| URI de redirection OAuth | uniquement l'ancien tunnel `trycloudflare` | **Render absent : « URL bloquée »** |
| Domaines de l'application | `adsfacile.xyz` seulement | ajouter `adsfacile-backend.onrender.com` |
| Politique de confidentialité, conditions, suppression de données | présentes (`/privacy-policy`, `/terms`, `/data-deletion`) | OK |

## 1. À faire avant de soumettre (dans l'ordre)

1. **Corriger les URL de retour** (indépendant de la revue, bloque déjà le propriétaire) :
   - Connexion Facebook pour les entreprises → Réglages → *URI de redirection OAuth valides* : ajouter
     `https://adsfacile-backend.onrender.com/api/facebook/callback`.
   - Paramètres → Général → *Domaines de l'application* : ajouter `adsfacile-backend.onrender.com`.
2. **Compléter l'application** : icône 1024×1024, description courte, e-mail de contact vérifié.
3. **Vérification d'entreprise** de « Lyon Deals » (Paramètres d'entreprise → Centre de sécurité → Lancer la vérification). Elle demande des documents officiels de l'entreprise ; c'est l'étape la plus longue.
4. **Atteindre le seuil d'appels** exigé pour le niveau d'accès complet : au moins **500 appels réussis à l'API Marketing sur les 15 derniers jours**, avec moins de 15 % d'erreurs sur les 500 derniers (documentation Meta, mise à jour du 5 mai 2026). La documentation ne précise pas quels comptes comptent : à confirmer dans le tableau de bord (Révision de l'app → Autorisations et fonctionnalités), qui affiche l'avancement réel.
5. **Préparer un compte de démonstration** AdsFacile (plan PRO) pour les évaluateurs, avec une Page et un compte publicitaire de test. **Ne jamais écrire son mot de passe dans ce dépôt** : le saisir uniquement dans le champ « Notes pour l'évaluateur » du formulaire Meta.
6. **Enregistrer la vidéo de démonstration** (section 4) en production, sur `https://www.adsfacile.xyz`.

## 2. Permissions à demander

Le cas d'usage « Créer et gérer des publicités avec l'API Marketing » rend obligatoires, sans pouvoir les retirer : `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_show_list`, `public_profile`, ainsi que la fonctionnalité **Marketing API Access Tier** (ex-« Ads Management Standard Access »).

### Première soumission (cœur du produit)

| Permission / fonctionnalité | Où le code s'en sert | Pourquoi |
|---|---|---|
| `pages_show_list` | `GET /me/accounts` (liste des Pages, jeton de Page) | choisir la Page qui publie |
| `pages_read_engagement` | lecture des champs de la Page (compte Instagram lié, etc.) | dépendance de `business_management` |
| `business_management` | `GET /me/businesses`, `GET {entreprise}/owned_pixels`, `act_…?fields=business` | retrouver l'entreprise du compte publicitaire et ses pixels |
| `ads_management` | création, mise en pause et suppression des campagnes, ensembles, créations, publicités ; dépôt d'images et de vidéos ; recherche de ciblage | cœur du produit |
| `ads_read` | `GET …/insights` (statistiques), `GET /me/adaccounts` | page Analytics |
| `public_profile` | identité de base | accordée d'office |
| Marketing API Access Tier | niveau d'accès complet | lever la limite de débit des comptes réels |

### Deuxième soumission (fonctions optionnelles, cas d'usage distincts)

| Permission | Où le code s'en sert | Remarque |
|---|---|---|
| `instagram_basic` | `instagram_business_account{id,username,profile_picture_url}` sur la Page | diffuser sous l'identité Instagram |
| `whatsapp_business_management` | numéros et comptes WhatsApp Business | destinations WhatsApp, numéro sur la publicité |

Elles dépendent des cas d'usage Instagram et WhatsApp. En les séparant, une éventuelle demande d'informations sur l'une ne retarde pas la mise en ligne du cœur du produit. Vérifier dans le tableau de bord ce que Meta exige pour chacune.

### À RETIRER de la demande (non utilisées par le code)

| Permission | Constat |
|---|---|
| `pages_manage_ads` | demandée dans `FACEBOOK_SCOPES`, mais aucun appel `/leadgen_forms` n'existe dans le code (commentaire seulement) |
| `leads_retrieval` | idem : aucun appel `/leads` ; appartient au cas d'usage « Capturer les prospects » |
| `instagram_manage_insights` | seulement comparée à la liste des permissions accordées, jamais appelée |
| `whatsapp_business_messaging`, `instagram_manage_events`, `ads_mcp_management` | accordées au jeton d'un compte, absentes du code : à retirer de la configuration de connexion si elles y figurent |

Demander ce qu'on n'utilise pas est un motif classique de refus. **Aligner aussi la configuration de connexion** (`config_id=1588765496066346`, côté Meta) et la constante `FACEBOOK_SCOPES` de [facebookController.js](../../backend/src/controllers/facebookController.js) sur cette liste ; le test de [facebookController.test.js](../../backend/src/controllers/facebookController.test.js) devra suivre.

## 3. Textes de justification (à coller dans le formulaire)

Les évaluateurs lisent l'anglais.

**Description générale de l'application**
> AdsFacile is a self-service web tool that helps small businesses in Africa create and manage Facebook and Instagram advertising campaigns without using Ads Manager. The advertiser signs in, connects their own Facebook Page and ad account through Facebook Login for Business, creates a campaign in a three-step wizard (objective, audience and budget, creative), and follows its performance in an Analytics page. AdsFacile only acts on ad accounts and Pages the user chooses to connect, and only on the user's request.

**`ads_management`**
> Used to create and manage ads on behalf of the advertiser who connected their ad account: create campaigns, ad sets, ad creatives and ads; upload images and videos; pause, resume and delete campaigns the user created in AdsFacile. Every call is triggered by an explicit action of the advertiser in the app (for example the "Create the campaign" button). Without this permission an advertiser could not publish any ad from AdsFacile.

**`ads_read`**
> Used to read the performance of the advertiser's own campaigns (impressions, clicks, CTR, spend, reach, conversions) and show them in the Analytics page, per campaign or for all campaigns. Data is shown only to the advertiser who owns the ad account.

**`business_management`**
> Used to find the business portfolio that owns the connected ad account and list its datasets (pixels), so the advertiser can pick the dataset needed to optimise sales campaigns and the app can tell them when a dataset exists but is not shared with the ad account. Read-only use; AdsFacile does not claim or modify business assets.

**`pages_show_list`**
> Used to list the Pages the advertiser manages so they can choose which Page their ads are published from.

**`pages_read_engagement`**
> Used to read basic information of the chosen Page, such as the linked Instagram account and Page token, so ads can be published under that Page. Requested as a dependency of `business_management`.

**Second submission**
> **`instagram_basic`**: used to read the Instagram account linked to the chosen Page (username, profile picture) so the advertiser can run ads under their Instagram identity.
> **`whatsapp_business_management`**: used to read the WhatsApp Business account and phone number linked to the Page so click-to-WhatsApp ads and the WhatsApp number shown on ads can be configured.

**Utilisation des données** : les jetons sont chiffrés au repos (AES-256), jamais partagés ; l'utilisateur peut déconnecter son compte et demander la suppression de ses données (`https://www.adsfacile.xyz/data-deletion`). Vérifier que la politique de confidentialité le dit en toutes lettres avant de soumettre.

## 4. Scénario de la vidéo de démonstration (environ 4 minutes, sous-titres anglais)

Meta exige pour ces permissions : *le processus complet de connexion Facebook*, puis *l'accès aux données de performance des publicités* (impressions, conversions, dépenses, clics, portée).

1. **Connexion à AdsFacile** avec le compte de démonstration, sur `https://www.adsfacile.xyz`.
2. **Connexion Facebook** : cliquer sur « Connecter Facebook », montrer la fenêtre d'autorisation de Meta avec **chaque permission listée et acceptée**, puis le retour dans AdsFacile avec la Page et le compte publicitaire affichés. *(Prouve `pages_show_list`, `pages_read_engagement`, `business_management`.)*
3. **Choix de la Page et du compte publicitaire** (menu des comptes). *(`pages_show_list`.)*
4. **Création d'une campagne Trafic** : objectif → audience et budget → créative avec une image → « Créer la campagne ». Montrer les étapes qui défilent, puis la campagne dans la liste, puis **dans Ads Manager** (en pause). *(`ads_management`.)*
5. **Un second format** : une vidéo ou un carrousel, créé de la même façon. *(`ads_management`.)*
6. **Ventes avec pixel** : choisir l'objectif Ventes, montrer l'étape « Suivi des achats » qui liste les ensembles de données de l'entreprise, en sélectionner un. *(`business_management`.)*
7. **Analytics** : ouvrir la page, montrer impressions, clics, CTR, dépenses, portée, conversions ; filtrer sur une campagne avec le bouton « Analytics » de sa carte. *(`ads_read`.)* Utiliser une campagne qui a réellement diffusé pour que les chiffres ne soient pas à zéro.
8. **Mise en pause puis suppression d'une campagne** depuis AdsFacile, et montrer qu'elle disparaît aussi d'Ads Manager. *(`ads_management`.)*
9. **Déconnexion de Facebook** et accès à la page de suppression des données.

Pour la seconde soumission : ajouter une scène « choisir l'identité Instagram » et une scène « destination WhatsApp avec le numéro de la Page ».

## 5. Liste de contrôle

- [ ] URI de redirection et domaine de Render ajoutés (section 1.1)
- [ ] Icône, description courte, e-mail de contact vérifié
- [ ] Vérification d'entreprise « Lyon Deals » validée
- [ ] 500 appels réussis sur 15 jours atteints (tableau de bord)
- [ ] `FACEBOOK_SCOPES` et configuration de connexion alignées sur la liste de la section 2
- [ ] Compte de démonstration prêt (identifiants saisis dans le formulaire Meta uniquement)
- [ ] Vidéo enregistrée en production selon la section 4
- [ ] Politique de confidentialité à jour (Facebook, jetons, suppression)
- [ ] Soumission du cœur du produit, puis de la seconde liste

## 6. En attendant l'approbation

Ajouter chaque personne qui doit essayer le produit comme **testeur** (Rôles de l'application → Testeurs) ; elle doit accepter l'invitation. Sans rôle, Facebook affiche « Fonctionnalité indisponible » au moment de connecter un compte.

## 7. Ce que ce dossier ne peut pas garantir

- Les délais et la décision de Meta ne dépendent pas d'AdsFacile ; la vérification d'entreprise est l'étape la plus incertaine.
- Je n'ai pas pu reproduire l'erreur « Fonctionnalité indisponible » avec un compte sans rôle : le lien avec l'absence d'accès avancé est très probable (aucun privilège approuvé, aucune soumission, vérification d'entreprise non validée) mais pas vérifié.
- La configuration de connexion (`config_id`) vit chez Meta ; ses permissions exactes n'ont pas été lues par les outils utilisés ici.
