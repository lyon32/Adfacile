# Architecture technique — Pubeka

> Version 1 · 10 octobre 2026 · Rassemble **toutes** les décisions prises en atelier (PRD, agents, design system, fournisseurs, crédits).
> Documents liés : [PRD](../produit/PRD.md) · [Plans et crédits](../produit/plans-et-credits.md) · [Modèle de données](DATA_MODEL.md) · [Capacités médias](capacites-medias.md) · [Catalogue de modèles](catalogue-modeles.md) · [Agents](../agents/README.md) · [Design system](../design/DESIGN-SYSTEM.md).
> Légende : ✅ décidé · 🧪 à confirmer par un test · ❓ à décider.

---

## 1. Vue d'ensemble

```
                    Navigateur (web responsive ; mobile natif en V3)
                         │
        pubeka.com ──────┼────── app.pubeka.com            (admin : chemin caché dans app)
        site public      │       application
        (SEO, GSAP+Lenis)│       (shadcn/ui, loader)
                         ▼
┌──────────────────────────── Vercel ───────────────────────────────┐
│ Next.js (App Router, TypeScript)                                   │
│  • Pages publiques (SSG/ISR)        • Application (RSC + actions)  │
│  • API interne /api/*               • Webhooks /api/webhooks/*     │
│  • Couches : agents · aiguilleur médias · connecteurs plateformes  │
│             · crédits · paiement · notifications                   │
└───────┬───────────────┬──────────────────┬──────────────────┬──────┘
        │               │                  │                  │
        ▼               ▼                  ▼                  ▼
  Supabase (Irlande)  Trigger.dev      Fournisseurs IA     Plateformes pub
  • Postgres + RLS    • files d'attente • Texte : passerelle • Meta Graph API ✅
  • Auth (Google,     • tâches planif.    IA (Gemini…)       • Google Ads (bientôt)
    Apple, e-mail)    • réessais        • Médias : fal ✅,   • TikTok Ads (bientôt)
  • Storage           • tâches longues    Higgsfield ✅,
  • Realtime                              BytePlus (vidéo, plus tard)
        │                                 • Lecture : Jina Reader
        ▼
  SasPay (paiement)  ·  Resend (e-mails)  ·  PostHog (mesure)  ·  Sentry (erreurs)
```

---

## 2. Choix techniques

| Domaine | Choix | Statut | Raison |
|---|---|---|---|
| Cadre | **Next.js** (App Router, TypeScript strict) | ✅ | Un seul projet, un seul déploiement ; affichage progressif des réponses IA ; pages publiques indexables |
| Interface | **shadcn/ui** (construit sur Radix) + Tailwind + jetons Pubeka | ✅ | Composants accessibles, habillés avec notre design system. **Pas** de Radix Themes (conflit de styles) |
| Animations | **GSAP + Lenis** sur le site public uniquement ; transitions courtes dans l'application | ✅ | Lenis ralentirait le travail dans l'application. Réglage « réduire les animations » respecté partout |
| Police | Sora (Google Fonts), chiffres tabulaires pour les montants | ✅ | Design system v2 |
| Loader | Animation complète « Saisie » (3 s) **une fois par session** à l'ouverture de l'application ; version courte en boucle entre les pages **seulement si le chargement dépasse 300 ms** | ✅ | `docs/design/loader/` ; réécrit en composant React TypeScript, sans `dangerouslySetInnerHTML` |
| Hébergement | **Vercel** (domaine acheté chez Hostinger) | ✅ | Déjà utilisé |
| Base, comptes, fichiers | **Supabase** : Postgres + RLS, Auth, Storage, Realtime | ✅ | Déjà utilisé |
| Région des données | **Irlande** (`eu-west-1`) | ✅ | Q50 |
| Environnements | **2 projets Supabase** (développement, production) + Vercel Preview/Production | ✅ | Q23 |
| Sauvegardes | Supabase Pro (sauvegardes quotidiennes) **en production, quand l'offre Pro est payée** | ✅ | Q43 |
| Tâches en arrière-plan | **Trigger.dev** — **offre gratuite (Free) en ce moment** (12/10/2026, projet `proj_wnjyspfoeknisnyzygkj`), Hobby 10 $/mois plus tard (voir la note ci-dessous) | ✅ | Sans limite de durée ; code ouvert ; files avec limite de simultanéité |
| IA texte | **OpenRouter** (passerelle unique, décision D-2 du 15/10/2026 ; Vercel AI Gateway écartée) | ✅ | Un seul point d'entrée pour tous les modèles : changer de modèle ou en ajouter un secours sans toucher au code, coût par appel renvoyé dans la réponse. Appelée par `fetch`, sans bibliothèque |
| IA médias | **Aiguilleur interne** + catalogue de modèles ; **fal + Higgsfield au lancement**, BytePlus avec la vidéo | ✅ | [capacites-medias.md](capacites-medias.md) |
| Lecture des sources | Notre propre lecture d'abord, **Jina Reader** en secours (sites, PDF) | ✅ | Q36 |
| Paiement | **SasPay** (Mobile Money et carte, paiement unique, pas de prélèvement automatique) | ✅ | Vérifié dans leur API |
| E-mails | **Resend**, `notifications@pubeka.com`, `support@pubeka.com` | ✅ | Q64 |
| Mesure produit | **PostHog** (statistiques, revisionnage de sessions, interrupteurs de fonctionnalités) | ✅ | Q41 |
| Erreurs | **Sentry** | ✅ | Q15 |
| Page de statut | `status.pubeka.com` + alertes e-mail à l'administrateur | ✅ | Q56 |


**Note Trigger.dev (12/10/2026) : nous sommes sur l'offre gratuite.** Limites relevées dans la documentation Trigger.dev :

| | Free (actuel) | Hobby (10 $/mois) | Besoin de Pubeka |
|---|---|---|---|
| Environnement « staging » (préproduction) | ❌ | ✅ | préproduction (CI_CD §4) |
| Tâches planifiées par projet | 10 | 100 | environ 15 (§10) |
| Tâches en même temps | 10 | 25 | Higgsfield 20, fal jusqu'à 40 (§8.4) |

Free suffit tant qu'aucune tâche de fond n'existe. **Passer à Hobby au plus tard à S13** (premières tâches de fond), et dans tous les cas **avant le lancement** : au-delà de 10 tâches planifiées, l'offre gratuite ne suffit plus.

---

## 3. Domaines et accès

| Adresse | Contenu | Indexé par Google |
|---|---|---|
| `pubeka.com/fr/…`, `pubeka.com/en/…` | Site public : accueil, tarifs, fonctionnement, pages pays, guides d'aide publics, blog | ✅ |
| `app.pubeka.com` | Application (connexion obligatoire) | ❌ (`noindex`, exclu du sitemap) |
| `app.pubeka.com/<chemin-secret>` | Administration | ❌ ; renvoie **404** à tout non-administrateur |
| `status.pubeka.com` | Page de statut des services | ❌ |

---

## 4. Organisation du code

```
pubeka/
├─ apps/web/                      Next.js (site public + application + API)
│  ├─ app/(public)/[locale]/…     accueil, tarifs, pays, aide, blog (SSG/ISR)
│  ├─ app/(app)/…                 tableau de bord, campagnes, visuels, stats, réglages
│  ├─ app/(admin)/[secret]/…      administration
│  ├─ app/api/…                   API interne (routes et actions serveur)
│  └─ app/api/webhooks/{saspay,meta,higgsfield,fal,byteplus,resend}
├─ packages/
│  ├─ ui/                         composants shadcn habillés Pubeka, loader, jetons
│  ├─ db/                         schéma, migrations SQL, types générés, politiques RLS
│  ├─ agents/                     6 agents : prompts versionnés, schémas JSON (Zod), validation
│  ├─ media/                      aiguilleur, catalogue, clients fal/Higgsfield/BytePlus, rendu des calques
│  ├─ platforms/                  connecteurs : meta/ (repris de l'existant), google/, tiktok/ (vides)
│  ├─ billing/                    crédits (registre), formules, SasPay, TVA, change
│  ├─ notifications/              e-mails Resend (FR/EN), cloche, préférences
│  └─ i18n/                       textes FR/EN
├─ jobs/                          tâches Trigger.dev
├─ bench/                         banc de test des modèles (existant)
└─ docs/                          documentation (existant)
```

**Reprise de l'existant :** la logique qui crée réellement les campagnes Meta (`backend/src/services/facebookAdsService.js`, `campaignController.js`, `facebookErrors.js`, routes de ciblage) et ses tests sont **portés en TypeScript** dans `packages/platforms/meta/`, en conservant leur comportement (tests repris et passés avant tout changement). L'ancien `backend/` est retiré **après** que les tests portés passent.

---

## 5. Comptes, équipe et accès

- **Connexion :** Google, Apple, e-mail (lien ou mot de passe). **Pas de connexion Facebook pour le compte Pubeka** (Q57).
- **Espace de travail** = le compte client (porte l'abonnement, les crédits, les Pages).
- **Membres et rôles** selon la formule (Q31-32) : Starter 1 · Pro 2 · Business 5.
  - Propriétaire : tout, y compris le paiement.
  - Éditeur : crée et publie des campagnes, génère des visuels.
  - Lecteur : voit les statistiques.
- **Sécurité des données :** RLS Supabase sur **toutes** les tables ; chaque ligne porte `workspace_id` ; aucun agent ne reçoit les données d'un autre espace (règle R4 des agents).
- **Fuseau horaire et salutation :** fuseau déduit du pays et de la ville donnés à l'inscription ; « Bonjour » / « Bonsoir » + prénom selon l'heure locale.
- **Langue :** interface FR ou EN (choix utilisateur) ; langue des pubs et tutoiement/vouvoiement (`ad_address`, défaut « vous ») par Page.

---

## 6. Connecteurs de plateformes

Interface commune à toutes les plateformes (Meta aujourd'hui ; Google et TikTok « bientôt ») :

```
connect() · listAccounts() · listPages() · healthCheck()
createCampaign(proposal) · updateCampaign() · pause() · resume()
getStatus() · fetchStats(range) · fetchRejection()
```

### Meta ✅
- **Connexion :** Facebook Login for Business. **Production : utilisateur système du Business Manager** (jeton durable, Q33). Jetons utilisateur classiques acceptés en filet de sécurité, avec **alerte 7 jours avant expiration** et reconnexion en un clic.
- **Jetons chiffrés** au repos (AES-256-GCM, clé dans les variables chiffrées de Vercel et Trigger.dev, jamais dans le code ni en base en clair). Rotation de toutes les clés si l'une fuit (Q57).
- **Bilan de santé** (F1) à la connexion : portefeuille business, compte publicitaire, moyen de paiement, Page, Instagram, WhatsApp Business, pixel. Pubeka **détecte et guide**, ne crée rien à la place du client.
- **Pages et formule :** nombre de Pages actives limité par la formule (1 / 3 / 10). En formule 1 Page, une fois une campagne lancée avec la Page A, la Page B n'est utilisable **qu'au mois suivant** (Q28). Passage à une formule inférieure : les campagnes des Pages en trop continuent chez Meta mais ne sont plus modifiables (Q29).
- **Compte publicitaire :** librement modifiable, hors formule.
- **Statuts :** webhooks Meta + vérification planifiée ; affichés tels quels (« En vérification chez Meta », « En diffusion », « Refusée », « Arrêtée »).
- **Statistiques :** copiées dans notre base **toutes les heures** + bouton « Actualiser maintenant » ; l'écran se met à jour seul (Supabase Realtime) (Q34).
- **Version de l'API Meta :** vérification planifiée ; **alerte e-mail** avant l'arrêt d'une version utilisée (Q58).
- **Refus :** déclenche l'agent Modérateur (explication + correction prête), republication sans consommer de quota.

---

## 7. Agents IA

Spécifications : [docs/agents/](../agents/README.md). Résultats de tests : [benchmark.md](../agents/benchmark.md).

| Agent | Rôle | Modèle provisoire (🧪) |
|---|---|---|
| Analyste business | Fiche business + 3 à 5 questions ; signale l'illégal évident | Gemini 3.1 Flash-Lite |
| Stratège campagne | Proposition complète (objectif, budget, zone, dates, textes) | Gemini 3 / 3.5 Flash |
| Designer visuel | Direction artistique, `VisualSpec`, calques, modifications | Gemini 3 / 3.5 Flash |
| Modérateur | **Après** un refus de la plateforme : explication + correction | Gemini 3.1 Flash-Lite |
| Optimiseur | Recommandations sur campagnes publiées (validées par l'utilisateur) | à tester |
| Assistant aide | Bulle d'aide, connaît l'état du compte | à tester |

Règles d'exécution :
- Appels **côté serveur uniquement**, via la passerelle IA (OpenRouter) ; sortie JSON validée par schéma (Zod) ; 1 nouvel essai avec l'erreur, puis échec signalé. **Jamais un 3ᵉ appel**, et une panne de la passerelle n'est jamais rejouée (résultat incertain).
- **Le modèle de chaque agent est un réglage**, jamais une constante du code ni du prompt : défaut dans `packages/agents/src/runtime/models.json`, surcharge par la variable `AGENT_MODELS` (JSON), n'importe quel identifiant OpenRouter (ex. `google/gemma-4-31b-it:free`), avec un **modèle de secours** réglable par agent (essayé par OpenRouter lui-même si le premier est indisponible). Exigence produit : des modèles **précis**, qui comprennent leur rôle directement et ne « parlent pas pour rien » : rien d'autre que le JSON demandé. Le banc (`bench/run.mjs`) compare les modèles OpenRouter avant tout changement (TR-AGT-04).
- **Pour S31 (administration, exigence du 15/10/2026)** : tout se règle **sans redéploiement** depuis la page d'administration : (a) santé de chaque agent (taux de réussite, sorties valides, latence, coût, dernier appel, dernière erreur) calculée sur `agent_runs` ; (b) changement du modèle de chaque agent parmi une liste prédéfinie, avec un modèle de repli ; (c) clé d'API propre à un ou plusieurs agents (par défaut : la clé OpenRouter globale ; clé d'un autre fournisseur si OpenRouter ne répond plus). Ce que S13 prépare : le runtime lit le réglage derrière `AgentConfigSource` (S13 : `EnvAgentConfigSource`, `models.json` + `AGENT_MODELS` ; S31 : une source en base) et applique `applyAgentConfig` à la définition, sans modifier `runAgent` ; la passerelle accepte `provider` et `apiKey` par appel (OpenRouter réalisé ; Anthropic, OpenAI, Gemini : interface prête, appel direct **non réalisé** en S13, la passerelle répond `bad_request`) ; `AgentKeyStore.resolve(keyRef)` donne la clé. Une clé saisie par l'administrateur sera stockée **chiffrée** (même mécanisme que `TOKEN_ENCRYPTION_KEYS`), en écriture seule : jamais renvoyée, jamais journalisée (S13 ne stocke aucune clé). **Table `agent_runs` (0001)** : contient déjà agent, modèle utilisé, version du prompt, jetons, coût, durée, `valid_schema`, `retried`. **Manque pour la santé** (nouvelle migration à créer avec le premier écrivain de la table, S14, ou en S31) : `error_code text` (dernière erreur), `provider text`, `requested_model text` (savoir si le repli a répondu), `attempts smallint` ; sans elles, un échec n'est pas distinguable d'une sortie invalide et le taux de repli n'est pas mesurable. `AgentRunRecord` les porte déjà (`errorCode`, `provider`, `requestedModel`, `attempts`).
- **Affichage progressif** (streaming) pour le Stratège et l'Assistant.
- Chaque appel est journalisé (`agent_runs`) : modèle, version du prompt, jetons, coût, durée, validité.
- Contenu des sources = donnée, jamais instruction (détection d'injection).
- Changement de prompt = nouvelle version + passage obligatoire du banc de test.

---

## 8. Médias : images et vidéos

### 8.1 Principe
1. L'utilisateur choisit **ce qu'il veut créer**, puis **un modèle** dans une courte liste (un modèle « Recommandé » présélectionné), puis **2 niveaux de qualité** (Standard / Haute qualité). Prototype : [prototype-choix-modele.html](../design/prototype-choix-modele.html).
2. Le coût en crédits est affiché **avant** de générer.
3. Les modèles visibles et leurs réglages viennent du **catalogue** (table `media_models`), géré dans l'administration sans redéploiement. **Un modèle n'est visible qu'après avoir réussi nos tests.**

### 8.2 Système en deux couches
```
photo produit ──► détourage (fal : Pixelcut / Bria RMBG)
                         │
VisualSpec (Designer) ──►│──► génération de la scène (modèle choisi)
                         ▼
                 scène + produit réel
                         │
                         ▼
        calques posés par NOTRE code (titre, prix, numéro, logo, bouton)
        selon la mise en page (layout_id) et le format
                         │
                         ▼
        rendu final 4:5 (+ 9:16, 1:1, 1.91:1 à la demande)
```
- **Rendu des calques :** côté serveur, mise en page en SVG/HTML convertie en image (moteur à choisir : Satori + resvg ou sharp) avec la police Sora ; **jamais de texte dessiné par l'IA**.
- **Changer un texte, un numéro, un logo** = nouveau rendu des calques, sans IA, instantané, 0 crédit.
- **Autre format :** nouvelle mise en page ; si la scène manque de place → extension par IA (C4 : Luma Photon Flash Reframe chez fal, 🧪), incluse sans crédit.
- **Zones de texte** fixées par le code selon `layout_id` (pas par l'IA), avec zones de sécurité Stories (9:16).

### 8.3 Capacités et routage
| Capacité | Exemples de modèles (catalogue) |
|---|---|
| C1 texte → image | Marketing Studio, Nano Banana 2.1, Soul 2, Seedream 5.0 Flash |
| C2 texte + références → image | Marketing Studio (16 réf.), FLUX 3 (10), GPT Image 2.5 (16), Bria Product Shot |
| C3 modification | FLUX 3 Edit, Grok Imagine 2.0, GPT Image 2.5 Edit |
| C4 extension de format | Luma Photon Flash Reframe, FLUX 2 Pro Outpaint, Bria Expand (fal) |
| Détourage | Pixelcut, Bria RMBG 2.0 (fal) |
| C5-C7 vidéo | **Wan 3.0 720p (fal)** = Standard · **Seedance 2.5 720p (Higgsfield/fal)** = Premium |

**Aiguilleur** (table `routing_rules`) : pour chaque capacité, principal / secours. Bascule **proposée** (jamais forcée) si : panne, **attente > 60 s**, solde fournisseur bas, ou **budget de 15 $/mois** du fournisseur atteint. Un fournisseur non testé n'est jamais utilisé en secours.

### 8.4 Files d'attente (Trigger.dev)
| File | Limite simultanée | Source |
|---|---|---|
| `media-higgsfield` | 20 (par clé API, confirmé ticket #318114) | Higgsfield |
| `media-fal` | selon le compte (2 → 40 automatiquement) ; fal met lui-même en file au-delà | fal |
| `media-byteplus-video` (plus tard) | 3 (compte individuel) / 10 (entreprise) | BytePlus |
| `agents` | selon la passerelle IA | — |
| `meta-publish` | 5 (à mesurer ; limites de débit de Meta par compte publicitaire) | Meta (S16 : `campaign.publish`) |
| `meta-sync` | 3 (lectures seulement ; séparée des publications) | Meta (S17 : `campaign.sync-status`, `campaign.sync-stats`) |
Interrupteur de sécurité (S16) : tant que `PUBEKA_META_PUBLISH` n'est pas `enabled`, `campaign.publish` refuse quand Meta est réel (SECURITY_NOTES, « Interrupteur de la publication réelle »).


Expérience pendant l'attente (validé) :
1. Les visuels s'affichent **un par un** dès qu'ils sont prêts.
2. Position et temps estimé affichés ; **notification + e-mail** si l'utilisateur quitte la page.
3. Bascule proposée vers un modèle équivalent si l'attente dépasse 60 s.
4. Temps d'attente moyen suivi dans l'administration (pour demander une hausse avant les plaintes).

### 8.5 Cycle de vie d'une génération
```
1. Demande (modèle, niveau, références) → coût en crédits calculé
2. Crédits RÉSERVÉS dans le registre
3. Tâche Trigger.dev → appel fournisseur avec webhook (Higgsfield `hf_webhook`, fal webhook)
4. Webhook « terminé » → fichier COPIÉ IMMÉDIATEMENT dans Supabase Storage
   (BytePlus n'en garde que 24 h ; fal publie en URL publique par défaut)
5. Rendu des calques → visuel final
6. Crédits CONSOMMÉS ; échec / contenu refusé / annulation → crédits LIBÉRÉS
7. Sentry + coût réel enregistré (pour recalculer les crédits)
```
**Idempotence :** un même `request_id` ne peut pas être facturé deux fois ; aucune relance automatique d'un envoi au résultat ambigu.

### 8.6 Conservation
| Élément | Durée |
|---|---|
| Fichier d'un visuel **non utilisé** | **7 jours**, puis suppression ; avertissement « Télécharge-le avant le JJ/MM » |
| Fichier d'un visuel **utilisé dans une campagne** | Tant que la campagne existe |
| Description du visuel (`VisualSpec` : idée, scène, couleurs, mise en page, textes) | **Toujours** (sert à « proposer quelque chose de similaire ») |
| Images de référence envoyées | 7 jours, sauf si épinglées dans le kit de marque |
| Bibliothèque de références Pubeka (curatée) | Permanente, gérée dans l'administration |

### 8.7 Limites d'envoi (Q35)
Image 10 Mo · PDF 20 Mo · 10 images de référence maximum par génération (ou moins selon le modèle).

---

## 9. Crédits et facturation

Détail chiffré : [plans-et-credits.md](../produit/plans-et-credits.md).

| | Starter | Pro | Business |
|---|---|---|---|
| Prix / mois | 5 000 XAF | 12 000 XAF | 25 000 XAF |
| Crédits / mois | 10 | 15 | 30 |
| Campagnes publiées / mois | 2 | 5 | 15 |
| Pages | 1 | 3 | 10 |
| Membres | 1 | 2 | 5 |

- **Crédit supplémentaire : 1 000 XAF** ; une vidéo coûte au minimum 2 crédits. Les crédits achetés **n'expirent jamais**, même après la fin de l'abonnement (Q13).
- **Ordre de consommation :** crédits du mois d'abord, puis crédits achetés.
- **Règle de prix d'une génération :** `crédits = max(minimum, arrondi au-dessus(coût réel XAF ÷ seuil))` ; seuil images = 125 XAF (marge ≥ 75 %) ; vidéo **Wan ≥ 75 %**, **Seedance ≥ 65 %**. Valeurs stockées par modèle et par niveau dans `model_quality_levels`, recalculables depuis l'administration.
- **Registre des crédits** (`credit_ledger`) : chaque mouvement est une ligne (attribution mensuelle, achat, réservation, consommation, libération, expiration du mois, don administrateur, parrainage). Le solde = somme du registre. Rien n'est jamais modifié, seulement ajouté.
- **Quota de campagnes :** décompté **au clic sur Publier** ; une republication après refus ne compte pas.
- **Plafond quotidien de générations :** à fixer quand les coûts réels sont mesurés (mémoire du projet) ❓.

### 9.1 Paiement SasPay
- **Pas de prélèvement automatique** (vérifié) : chaque mois, l'utilisateur repaie (Mobile Money ou carte). Rappels sur le site et par e-mail avant l'échéance.
- Page de paiement hébergée (*checkout session*) → **webhook signé** SasPay → activation.
- **Clé d'idempotence obligatoire** sur tout paiement (sinon une relance réseau débite deux fois).
- **Frais SasPay payés par le client** (Q46). **Pas de remboursement** (Q47).
- **Délai de grâce : 3 jours** après l'échéance (Q48 ; décision de la personne 26/10/2026) : lecture, achat de crédits et mise en pause ; aucune nouvelle campagne, publication, reprise, génération ni modification. Puis l'espace est **verrouillé** : plus rien sauf renouveler, mettre en pause, écrire au support et gérer son compte ; un essai terminé sans abonnement est verrouillé tout de suite. À la fin de la grâce, **toutes les publicités du compte sont mises en pause automatiquement** (session S19b, prérequis bloquant de mise en production) ; la **reprise est manuelle** après renouvellement.
- Mois de quota à partir de la **date de souscription** (Q12).
- **Preuve de paiement** (capture + numéro de transaction) envoyée par l'utilisateur → visible dans l'administration → activation manuelle possible (Q38).

### 9.2 Essai, parrainage
- **Essai gratuit** : 1 campagne, 3 visuels, 7 jours, sans moyen de paiement ; **un essai par compte** (détection des doublons plus tard) (Q51).
- **Parrainage** : parrain et filleul récompensés **quand le filleul paie** (Q74).

### 9.3 Monnaie et TVA (retirée)
- **Tous les pays d'Afrique** (décision du 17/10/2026) : la table `countries` porte les 54 pays (migration 0012), chacun avec sa monnaie ISO 4217, son fuseau IANA par défaut (celui de la capitale) et ses noms FR et EN (CLDR). Sources : ISO 3166-1, ISO 4217 (SIX), CLDR, IANA `zone.tab`.
- **Unités mineures par monnaie** : `packages/shared/src/currency.ts` porte l'exposant ISO 4217 de chaque monnaie (0 : FCFA, franc guinéen, ougandais, rwandais… ; 2 : naira, rand… ; 3 : dinar tunisien et libyen). Aucun « /100 » ni « 2 décimales » codé en dur pour une monnaie locale ; une monnaie absente de la table lève une erreur. Le formatage passe par `Intl.NumberFormat` (FR/EN), le FCFA s'écrit « FCFA ».
- **Montants** : `local_minor` (entier, unité mineure de `currency`) et `usd_cents`. Conversion en entiers (taux au dix-millième, arrondi à la demi-unité vers le haut).
- **Taux de change : ExchangeRate-API, accès ouvert** (décision du 17/10/2026, source `exchangerate-api`).
  - Point d'accès : `GET https://open.er-api.com/v6/latest/USD` (doc : https://www.exchangerate-api.com/docs/free ; conditions : https://www.exchangerate-api.com/terms). **Aucune clé, aucune variable d'environnement, rien à créer.** Un seul appel donne les 166 monnaies, dont les 42 d'Afrique prises en charge (relevé réel du 17/10/2026 : ZWG et ZWL y figurent, SLL/MRO/STD n'y figurent pas, on utilise SLE/MRU/STN).
  - **Une mise à jour par jour** (`time_next_update_unix`). La tâche `fx.refresh` (Trigger.dev, `0 */6 * * *` UTC, un seul essai) ne fait la requête que si la prochaine mise à jour annoncée est passée; HTTP 429 puis blocage de 20 minutes si l'on insiste : une erreur est journalisée et on attend la prochaine exécution (jamais de nouvel essai).
  - **Fraîcheur** : un taux publié il y a plus de **48 h** (`provider_updated_at`, sinon `fetched_at`) n'est plus utilisé : l'écran affiche le dollar seul (`fx_not_available`). 48 h laissent passer une mise à jour manquée.
  - **Taux aberrants rejetés et journalisés** : zéro, négatif, NaN, infini, arrondi à zéro, hors de la colonne `numeric(12,4)`, variation de plus de 50 % d'une publication à l'autre (un vrai décrochage de monnaie demande alors un taux saisi à la main, `manual`, depuis l'administration, S31). Un échec ou un rejet laisse les anciens taux en place.
  - **Licence** : usage personnel OU commercial permis, mise en cache permise; **redistribution interdite** (Pubeka n'affiche que des montants convertis : aucune route ne publie le tableau des taux, la route publique `/public/fx-rates` de S05 est supprimée, `exchange_rates` n'est plus lisible par les connectés); **attribution obligatoire** : lien « Rates By Exchange Rate API » (FR : « Taux fournis par Exchange Rate API ») sous les montants convertis de l'écran Proposition, **à reprendre en S16, S17 et S24 partout où un montant converti s'affiche**. Service fourni « tel quel », offre gratuite pouvant être interrompue sans préavis, taux donnés à titre indicatif (la mention « coût estimé » reste affichée).
  - **Risque à lever avant S36** : le point d'accès ouvert n'a aucune garantie de disponibilité; prévoir une offre payante du même fournisseur (clé d'API) si la continuité devient critique.
- Montants affichés **en monnaie locale, dollars en petit dessous**.
- **TVA** : TVA retirée pour le moment (décision du 17/10/2026), à réactiver sur décision. Le coût est `budget par jour × jours` ; la table `vat_rates` (modifiable depuis l'administration) et `ad_accounts.vat_country` restent en base, dormantes (aucune migration destructive).

---

## 10. Tâches planifiées (Trigger.dev)

| Tâche | Fréquence |
|---|---|
| Synchronisation des statistiques des campagnes actives | Toutes les heures (+ à la demande) |
| Vérification des statuts (filet de sécurité des webhooks Meta) | Toutes les 15 min |
| Vérification des jetons Meta (expiration dans 7 jours → alerte) | Chaque jour |
| Vérification des versions de l'API Meta | Chaque semaine |
| Rappels d'abonnement (J-3, J-1, J0, fin de grâce) | Chaque jour |
| Attribution et expiration des crédits mensuels (date anniversaire) | Chaque jour |
| Suppression des fichiers de plus de 7 jours (sauf campagnes) | Chaque jour |
| Taux de change (`fx.refresh`; appelle le fournisseur une fois par jour au plus) | Toutes les 6 heures |
| Reprise des publications restées « en publication » (`campaign.reconcile`, S16) : rapprochement en lecture seule chez Meta, 20 campagnes au plus par passage | Toutes les 10 minutes |
| Pause automatique des publicités des espaces verrouillés (`campaign.lock-pause`, S19b) : fin de grâce ou d'essai sans abonnement ; Meta d'abord et relu, 100 campagnes et 50 espaces au plus par passage, jamais de reprise | Toutes les 10 minutes |
| Explication des refus de Meta par le Modérateur (`campaign.explain-rejections`, S18) : une fois par refus, jamais relancée d'office, 10 refus au plus par passage | Toutes les 5 minutes |
| Résumé du lundi (e-mail) | Chaque lundi |
| Séquence de bienvenue (J1 connecter Meta, J3 première pub, J6 fin d'essai) | Chaque heure |
| Soldes et budgets fournisseurs (alerte solde bas, budget 15 $) | Toutes les heures |
| Optimiseur (Pro, Business) | Chaque jour |
| Page de statut et alertes de panne | En continu (sondes) |

---

## 11. Notifications

- **Cloche dans l'application** + **e-mail** (Resend), préférences par type.
- Événements : pub validée, pub refusée (+ rapport du Modérateur), paiement Meta échoué, budget épuisé, fin de campagne, quota presque atteint, abonnement qui se termine, génération prête, jeton Meta à renouveler, réponse du support, résumé hebdomadaire.
- E-mails FR/EN selon la langue de l'utilisateur.

---

## 12. Support

- **Tickets** dans l'application ; réponse depuis l'administration ; l'utilisateur la reçoit **dans l'application et par e-mail** (Q39).
- Pièces jointes (captures, preuves de paiement).
- **Bulle d'aide** (Assistant) : diagnostic avec l'état du compte ; propose d'ouvrir un ticket si elle ne sait pas.

---

## 13. Administration

Accès : chemin secret, **404** pour tout non-administrateur, **double vérification obligatoire** (application d'authentification, code à 6 chiffres), **blocage après 5 essais**, **journal de toutes les actions**. Pas de restriction d'adresse IP (Q25). Un seul administrateur pour l'instant (Q26).

Fonctions (Q17, Q27) :
- Utilisateurs : voir, modifier les informations, suspendre, **voir l'application comme le client** (lecture seule, journalisé).
- Abonnements : activer à la main après preuve de paiement, prolonger, changer de formule.
- Crédits : offrir, retirer (avec motif).
- Campagnes des clients : consultation.
- Tickets de support.
- **Catalogue de modèles** : visibilité, modèle recommandé, réglages des niveaux, coût et crédits.
- **Table de routage** et budgets par fournisseur (15 $/mois), soldes.
- **Coûts IA** par utilisateur, par agent, par modèle ; temps d'attente moyen par file.
- **Table de TVA** par pays ; taux de change (saisir une valeur à la main, source `manual`, en cas de panne ou de décrochage d'une monnaie).
- **Bibliothèque de références** des visuels.
- **Mode maintenance** (« Retour à 14 h ») sans redéploiement (Q75).
- Paramètres : seuils de marge, prix du crédit, quotas des formules, plafond quotidien.

---

## 14. Site public et SEO

- Pages : accueil (multi-plateforme, champ « Colle le lien de ton site » en héros), tarifs, fonctionnement, **pages pays** (prix en monnaie locale, moyens de paiement), **guides d'aide publics et indexés**, **blog écrit par l'IA et relu par toi** (Q69-71).
- Rendu statique (SSG/ISR) pour la vitesse sur réseau mobile.
- Par page : titre et description uniques, image d'aperçu (Open Graph), données structurées (Organisation, Produit/Offres, FAQ, Article).
- `sitemap.xml`, `robots.txt`, **hreflang FR/EN** (`/fr`, `/en`).
- Application et administration : `noindex`.
- Google Search Console dès le lancement.
- Mots-clés : [rapports/mots-cles-seo.md](../rapports/mots-cles-seo.md) (premier sujet de blog : payer ses pubs sans carte).

---

## 15. Sécurité

| Sujet | Mesure |
|---|---|
| Secrets (Meta, SasPay, IA, fournisseurs) | Variables chiffrées Vercel et Trigger.dev uniquement ; jamais dans le code ; `.env` exclus de git |
| Jetons des clients | Chiffrés en base (AES-256-GCM) ; révocables par le client |
| Accès aux données | RLS sur toutes les tables ; clé de service uniquement côté serveur et tâches |
| Webhooks | Vérification de signature (SasPay, Meta, fal, Higgsfield, Resend) ; rejouabilité bloquée (idempotence) |
| Paiements | Clé d'idempotence obligatoire ; montants recalculés côté serveur |
| Administration | Chemin secret, 404, 2FA, blocage, journal |
| Envois de fichiers | Types et tailles contrôlés ; fichiers servis par URL signée à durée limitée |
| IA | Contenu des sources traité comme donnée ; détection d'injection ; aucune clé IA côté navigateur |
| Abus | Limites de requêtes par compte ; plafond quotidien de générations (à chiffrer) |
| En-têtes | CSP, HSTS, cookies sécurisés |
| Incident | Procédure de rotation de toutes les clés |

---

## 16. Confidentialité et données

- Hébergement en Irlande ; entreprise au **Cameroun** (Q49) : politique de confidentialité et conditions d'utilisation **rédigées par Claude, à faire relire par un juriste** (Q42).
- **URL de suppression des données** (exigée par Meta).
- Suppression de compte : tout est effacé chez nous ; **campagnes conservées chez Meta** ; données de facturation conservées (obligation légale) (Q44).
- Clause de responsabilité affichée avant la première publication (blocage de compte publicitaire par Meta) (Q54).
- PostHog : masquage des champs sensibles dans le revisionnage de sessions.
- ❓ **Textes envoyés aux modèles IA (décision de la personne à prendre AVANT la production, S36).** Les textes des clients (sites, descriptions, réponses aux questions) partent chez OpenRouter, puis chez le fournisseur du modèle. **Les modèles gratuits (`:free`) peuvent enregistrer ces textes** et s'en servir pour s'améliorer ; les modèles payants dépendent de la politique de leur fournisseur. OpenRouter offre un réglage par requête (`provider.data_collection: "deny"`, variable `OPENROUTER_DATA_COLLECTION`) et un réglage de compte (page *Privacy* de l'espace OpenRouter, option « zéro rétention des données »). Options : (1) modèles payants seulement + `deny` en production ; (2) modèles gratuits pour le développement et le banc seulement, jamais avec des données de vrais clients ; (3) accepter les modèles gratuits et le dire dans la politique de confidentialité (§16, Q42). **Recommandation** : option 1 ou 2. Tant que ce n'est pas tranché, le banc et les essais n'utilisent que des textes d'exemple (jeux de `bench/datasets/`), jamais des données de clients. Documentation : https://openrouter.ai/docs/features/provider-routing

---

## 17. Exploitation

- **Branches :** `main` (production) + branches courtes fusionnées par pull request ; ménage des anciennes branches **après vérification** qu'elles sont intégrées (Q24).
- **Intégration continue :** typage, lint, tests unitaires (dont les tests Meta repris), tests des schémas d'agents, build ; banc de test des agents à chaque changement de prompt.
- **Surveillance :** Sentry (erreurs), PostHog (usage), page de statut, alertes e-mail (panne fournisseur, solde bas, version API Meta, jeton expirant).
- **Coûts fixes estimés au lancement :** Vercel, Supabase (gratuit puis Pro ≈ 25 $), Trigger.dev (0 puis 10 $), PostHog (gratuit), Sentry (gratuit), Resend (gratuit au départ), domaine.

---

## 18. Parcours techniques clés

### Créer une campagne
1. Sources (lien, photo, PDF, texte) → lecture (nous, puis Jina) → **Analyste** → fiche + questions (illégal évident → arrêt, 0 crédit).
2. Réponses → **Stratège** (affichage progressif) → proposition (plateforme, objectif, budget, zone, dates, textes).
3. Option visuel : modèle + niveau → génération (section 8.5) → choix.
4. Aperçu Facebook / Instagram / Stories → **Publier** → connecteur Meta → quota de campagne décompté.
5. Statut synchronisé ; refus → **Modérateur** → correction → republication sans quota.

### Payer
1. Choix de la formule ou des crédits → session de paiement SasPay (clé d'idempotence).
2. Webhook signé → paiement validé → abonnement prolongé / crédits ajoutés au registre → e-mail de reçu.
3. Échec ou absence de webhook → vérification planifiée du paiement ; preuve envoyée par l'utilisateur → activation manuelle possible.

---

## 19. Ce qui reste ouvert

| # | Sujet | Comment on tranche |
|---|---|---|
| 1 | Modèles texte définitifs par agent | Banc de test (Higgsfield, fal et BytePlus pour les médias ; passerelle pour le texte) |
| 2 | ✅ Outil de passerelle IA texte : **OpenRouter** (15/10/2026) | Décision D-2, ROADMAP §5. Reste ouverte : la **confidentialité des modèles gratuits** (§16) |
| 3 | Moteur de rendu des calques | Essai Satori + resvg contre sharp sur 3 mises en page |
| 4 | Modèles médias visibles et crédits exacts | Tests un par un (C2, C1, C3, C4, puis vidéo) |
| 5 | Plafond quotidien de générations | Après mesure des coûts réels |
| 6 | Crédits Seedance si BytePlus est branché | Test vidéo BytePlus |
| 7 | Durées autorisées de Veo 3.1 Lite | Non retenu pour l'instant |
| 8 | Application mobile native | V3, sur la même API |
| 9 | Google Ads et TikTok Ads | Connecteurs vides prêts, « Bientôt disponible » |
