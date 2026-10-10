# PROJECT BRIEF — EasAds

> Version 1 · 10 octobre 2026 · Une page pour se rappeler **pourquoi** on construit EasAds, **pour qui**, **à quoi on reconnaît la réussite**, et **ce qu'on ne construit pas**.
> Le détail est dans le [PRD](PRD.md), le [TRD](TRD.md), l'[AppFlow](APPFLOW.md) et l'[architecture](../architecture/ARCHITECTURE.md). En cas de doute pendant une session de travail : **ce document tranche le périmètre.**

---

## 1. Vision

**N'importe qui doit pouvoir lancer une publicité en ligne professionnelle en quelques clics, à partir de ce qu'il a déjà, et la payer simplement.**

EasAds crée la campagne et le visuel avec l'IA, la publie sur la plateforme choisie (Meta Ads aujourd'hui, Google Ads et TikTok Ads ensuite), et explique tout en langage simple. Le client **choisit et valide** ; EasAds fait le reste.

Promesse : *« Tes pubs en ligne, prêtes en quelques clics. Sur Meta, Google, TikTok et plus. »*

---

## 2. Problème

### Le constat
Des milliers de commerçants et de petites entreprises, surtout en Afrique, vendent sur WhatsApp, Facebook et Instagram, mais **n'osent pas faire de publicité** ou la font mal. Ce n'est pas faute de produit ni de budget : c'est faute de **savoir-faire**, de **visuels** et de **moyen de paiement adapté**.

### Les 5 douleurs
| # | Douleur | Ce qui se passe aujourd'hui |
|---|---|---|
| 1 | **Les outils de pub sont faits pour des experts** | Meta Ads Manager, Google Ads, TikTok Ads Manager : des dizaines de réglages, un outil différent par plateforme. Les gens paient des formations ou abandonnent. |
| 2 | **Un bon visuel coûte un graphiste** | Sans visuel soigné, la pub coûte plus cher pour moins de résultats. |
| 3 | **Tout est en dollars** | Impossible de savoir combien on dépense vraiment en francs CFA, TVA comprise. |
| 4 | **Payer est difficile** | Les plateformes exigent une carte bancaire ; beaucoup n'en ont pas. |
| 5 | **Les refus sont incompréhensibles** | La plateforme refuse la pub sans explication claire ; on ne sait pas quoi corriger. |

Preuve terrain (recherche Google, 10/10/2026) : on tape réellement *« payer publicité facebook avec orange money »*, *« comment payer la publicité sur tiktok »*, *« pourquoi ma publicité facebook ne fonctionne pas »* ([rapport mots-clés](../rapports/mots-cles-seo.md)).

### Énoncé du problème
> **Les commerçants et petites entreprises d'Afrique qui vendent en ligne** veulent attirer des clients avec la publicité, mais **ne savent pas utiliser les outils publicitaires, n'ont ni visuel professionnel ni carte bancaire, et ne comprennent pas ce qu'ils dépensent en francs CFA**. Résultat : ils ne font pas de pub, ou gaspillent leur budget.

---

## 3. Pour qui

**Priorité géographique :** toute l'Afrique (paiement Mobile Money, francs CFA, guides adaptés), **ouvert au reste du monde**. Langues : français et anglais.
**Pas de niche imposée :** tous les profils ci-dessous peuvent créer des pubs, sans priorité entre eux.

### Profils types
> Profils validés par le fondateur le 10/10/2026. À confirmer par **5 entretiens avec de vrais commerçants** : [guide d'entretien](ENTRETIENS.md).

| Profil | Situation | Ce qu'il veut | Ce qui le bloque |
|---|---|---|---|
| **Awa, commerçante sans site** — vend des sacs à Douala via WhatsApp et Instagram, travaille **uniquement sur téléphone** | Clients par le bouche-à-oreille | Recevoir plus de messages WhatsApp de clients de sa ville | Ne sait pas utiliser le gestionnaire de pubs ; pas de carte bancaire ; pas de graphiste |
| **Moussa, PME avec site** — boutique en ligne d'électroménager à Abidjan | Un site, quelques ventes | Plus de visites et de ventes sur son site | Ne sait pas installer un pixel ni choisir un objectif ; ne mesure pas ses résultats |
| **Fatou, entrepreneuse multi-activités** — un restaurant et un service traiteur à Dakar, deux Pages | Gère tout seule | Lancer vite une pub par activité sans y passer des heures | Manque de temps ; refus de pubs qu'elle ne comprend pas |
| **Kofi, freelance / petite agence** — gère la pub de 3 à 10 clients à Lagos | Connaît un peu Meta Ads | Produire vite des campagnes et des visuels pour plusieurs clients | Temps de création des visuels ; facturation en dollars |
| **Créateur de contenu** | Une audience sur Instagram/TikTok | Promouvoir un produit, un événement, une formation | Visuels, ciblage, coût |

### Point commun
Ils ont **déjà** quelque chose à montrer (un site, une photo produit, une publication, une description) et **un téléphone**. Ils n'ont **pas** le temps ni les compétences pour le reste.

---

## 4. Critères de réussite

### 4.1 Le MVP est « terminé » quand
1. **Sur téléphone**, un nouveau client peut, en une session : s'inscrire → connecter Meta → coller le lien de son site → recevoir une proposition → générer 3 visuels → **publier** → voir le statut et les statistiques.
2. Une **vraie campagne** est publiée sur Meta via EasAds (compte de test puis réel).
3. Un **paiement SasPay réel** active un abonnement ; une génération qui échoue **rend les crédits**.
4. **Aucune fuite de données entre clients** : tests d'accès croisé réussis à 100 % (44/44 aujourd'hui sur la base, à refaire sur Supabase).
5. **App Review Meta validée** et vérification d'entreprise acquise.
6. Politique de confidentialité, conditions d'utilisation, URL de suppression des données en ligne et relues.
7. Au moins **2 modèles d'image par usage** ont réussi le banc de test.
8. Les cibles de performance du [TRD](TRD.md) sont tenues (pages publiques et tableau de bord).

### 4.2 EasAds réussit quand (6 mois après le lancement)
| Indicateur | Cible |
|---|---|
| Abonnés payants | **500** |
| Campagnes publiées | **1 000** |
| Campagnes publiées **sans modification majeure** de la proposition IA | **≥ 70 %** (mesure la qualité des agents) |
| Visuels générés jugés utilisables (choisis ou notés ≥ 4/5) | **≥ 60 %** |
| Marge brute sur les générations | **≥ 75 %** images et Wan · **≥ 65 %** Seedance ([plans et crédits](plans-et-credits.md)) |
| Taux de refus des pubs par Meta | à mesurer, **en baisse** grâce au Modérateur |

### 4.3 Le test de vérité, pour chaque fonctionnalité
> « Est-ce qu'Awa, sur son téléphone, sans formation, peut le faire seule en quelques minutes ? » Si non, ce n'est pas prêt.

---

## 5. Non-objectifs — ce qu'on NE construit PAS

> À relire en début de session. Toute demande qui tombe dans cette liste est **reportée**, pas improvisée.

### Pas au MVP (prévu plus tard)
| Non-objectif | Quand |
|---|---|
| Publication sur **Google Ads, TikTok Ads** et autres (affichés « Bientôt disponible ») | V2 |
| **Vidéo IA** (Wan 3.0, Seedance 2.5) | V2, après les tests images |
| **Application mobile native** (iOS / Android) — le MVP est une application web responsive | V3 |
| **Optimiseur automatique** qui agit seul — il **propose**, le client valide | Jamais sans validation |
| Analyse avancée des concurrents si la bibliothèque publicitaire ne la permet pas en Afrique | Après vérification |

### Jamais (hors du produit)
| Non-objectif | Pourquoi |
|---|---|
| **Avancer l'argent des pubs** ou payer les plateformes à la place du client | Le client paie Meta lui-même ; EasAds n'est pas un intermédiaire financier pour le budget publicitaire |
| **Lancer des pubs depuis le compte publicitaire d'EasAds** pour les clients | Risque de blocage collectif ; chaque client utilise son Business Manager |
| **Créer à la place du client** sa Page, son portefeuille business, ou lier Instagram/WhatsApp | Impossible par l'API ; EasAds **détecte et guide** |
| **Prélèvement automatique** des abonnements | SasPay ne le propose pas ; le client renouvelle chaque mois |
| **Remboursements** | Décision commerciale |
| **Juger ou bloquer un commerce légal** (marques, cosmétiques, etc.) avant publication | Seul l'illégal évident est écarté ; le Modérateur explique **après** un refus |
| **Dessiner le texte, le prix ou le numéro avec l'IA** dans les visuels | Toujours posés par notre code (système en deux couches) |
| **Imposer un modèle d'IA** | Le client choisit dans un catalogue testé ; EasAds recommande |
| Copier **Meta Ads Manager** ou proposer tous ses réglages experts | EasAds simplifie : quelques choix, l'IA remplit le reste |
| Un outil de **gestion des réseaux sociaux** (publication organique, messagerie, CRM) | Hors sujet : EasAds fait de la publicité |
| Récupérer des images sur **Pinterest** | Conditions d'utilisation et droits d'auteur |
| Conserver les **fichiers** de visuels non utilisés au-delà de 7 jours | Règle de conservation ; seule leur description est gardée |
| **Mélanger les données** de deux clients dans un agent ou une référence | Isolation stricte ; références partagées seulement si anonymisées |

---

## 6. Contraintes connues
- Un seul développeur (avec Claude) ; budget serré : on privilégie les offres gratuites puis les petits paliers payants.
- Dépendances externes critiques : **App Review Meta**, **SasPay** (pas de prélèvement), **fournisseurs IA** (limites simultanées : Higgsfield 20, fal 2→40, BytePlus vidéo 3).
- Entreprise au **Cameroun**, données hébergées en **Irlande**.
- Pas encore de mesures réelles des coûts IA : les prix des crédits seront recalculés après les tests.

---

## 7. Validation terrain
Avant le développement : **5 entretiens de 30 minutes** avec de vrais commerçants, pour valider les douleurs, le parcours et le prix de 5 000 XAF. Guide : [ENTRETIENS.md](ENTRETIENS.md).
