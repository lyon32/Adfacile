# PRD — Pubeka

> Version 1.0 · 10 octobre 2026 · Statut : brouillon validé en atelier
> Pubeka remplace complètement AdFacile. Le nom AdFacile n'est plus utilisé.
> Nom et domaine : **Pubeka**, `pubeka.com` (décidé le 11/10/2026). Il remplace l'ancien nom de travail, trop proche de concurrents déjà bien référencés (easyadsapp.com, easyads.app) et que Google corrige en « easy ads ».

---

## 1. Vision

**Pubeka** permet à n'importe qui, sans formation en publicité, de créer et lancer une campagne publicitaire professionnelle en quelques clics, à partir de ce qu'il a déjà : son site, une photo de son produit, une publication, un document ou une simple description.

**Mission : la création de publicités sur toutes les plateformes publicitaires.** Pubeka n'est **pas** un outil Facebook. C'est un outil de création de pubs, quelle que soit la plateforme : Meta Ads, Google Ads, TikTok Ads, puis les suivantes au fur et à mesure. Aucune plateforme n'est mise en avant par rapport aux autres dans le discours, la marque ou l'interface.

**Promesse :** *« Tes pubs en ligne, prêtes en quelques clics. Sur Meta, Google, TikTok et plus. »*
(Variante EN : *"Your online ads, ready in a few clicks. On Meta, Google, TikTok and more."*)

- **Plateformes au lancement :** Meta Ads (Facebook, Instagram, WhatsApp, Messenger) est la première **branchée**, parce que l'intégration existe déjà. C'est un ordre de mise en service, pas un positionnement.
- **Plateformes affichées dès le lancement :** Google Ads et TikTok Ads apparaissent au même niveau que Meta dans le choix de plateforme, avec le statut « Bientôt disponible ». Les suivantes s'ajoutent au même endroit.
- **Règle de communication :** on ne dit jamais « ta pub Facebook ». On dit « ta pub », « tes pubs en ligne », « ta campagne ». Le nom d'une plateforme n'apparaît que là où l'utilisateur la choisit ou la connecte.
- **Marché :** toute l'Afrique en priorité (paiement mobile, francs CFA, guides adaptés), mais ouvert à tout utilisateur dans le monde.
- **Langues :** français et anglais, pour l'interface comme pour les pubs générées.

### 1.1 Problème
- Les gestionnaires de publicités (Meta Ads Manager, Google Ads, TikTok Ads Manager) sont complexes, et chacun fonctionne différemment. Les gens paient des formations pour apprendre à s'en servir.
- Créer un visuel professionnel demande un graphiste.
- Le paiement des publicités se fait en dollars, avec une carte bancaire, ce qui bloque de nombreux Africains.
- La configuration nécessaire (Page, Instagram, WhatsApp Business, portefeuille business, pixel, moyen de paiement) est incompréhensible pour un débutant.

### 1.2 Positionnement
| Concurrent | Ce qu'il fait | Ce que Pubeka fait de plus |
|---|---|---|
| AdCreative.ai | Génère des visuels et des textes | Génère **et lance** la campagne complète, avec un paiement local et un guide de configuration |
| Madgicx | Optimise des campagnes Meta existantes (audit IA) | Accessible aux débutants : propositions en langage simple, en FCFA |
| Meta Ads Manager, Google Ads, TikTok Ads Manager | Un outil expert par plateforme | **Un seul endroit pour toutes les plateformes**, quelques clics, l'IA remplit tout, l'utilisateur ne fait que valider |

### 1.3 Indicateurs de succès à 6 mois après le lancement
- 500 abonnés payants.
- 1 000 campagnes publiées.
- Au moins 70 % des campagnes publiées sans modification manuelle majeure, ce qui mesure la qualité des agents.
- Au moins 60 % des visuels générés jugés « utilisables » (choisis, ou notés 4/5 ou plus).

---

## 2. Utilisateurs

Tous les profils peuvent créer des pubs, sans priorité entre eux :
- le commerçant sans site, qui vend sur WhatsApp ou Instagram ;
- la PME avec un site web ;
- le freelance ou l'entrepreneur qui gère plusieurs business ;
- le créateur de contenu.

Contrainte commune : beaucoup utilisent **uniquement un téléphone**. L'application web doit donc être irréprochable sur mobile.

---

## 3. Principes produit (non négociables)

1. **L'IA remplit, l'utilisateur valide.** Aucun long formulaire. Tout champ est pré-rempli et reste modifiable.
2. **Chaque génération doit être parfaite.** Chaque visuel ou campagne générée consomme du quota. Un résultat raté est un échec produit, pas un « essai ».
3. **Un agent = un rôle.** Aucun agent ne fait le travail d'un autre (voir §6).
4. **Transparence de l'argent.** Montants en dollars et en FCFA, TVA incluse, en temps réel.
5. **Pas d'incohérence affichée.** Un utilisateur qui n'a rien lancé ne voit aucun chiffre fictif.
6. **Guider plutôt que bloquer.** Toute configuration manquante est détectée et expliquée pas à pas.
7. **Le client reste propriétaire.** Les campagnes sont créées dans **son** Business Manager et **son** compte publicitaire, et payées par **son** moyen de paiement Meta. Pubeka n'avance jamais d'argent à Meta.

---

## 4. Parcours principaux

### 4.1 Inscription et intégration
1. Inscription ou connexion via **Google, Apple ou e-mail** (pas de connexion Facebook pour le compte Pubeka).
2. Choix du **pays** (qui fixe la TVA et la devise par défaut), de la **devise d'affichage** (XOF ou XAF) et de la **langue de l'interface** (FR ou EN).
3. Démarrage de l'**essai gratuit** : 1 campagne, 3 visuels, 7 jours, sans moyen de paiement.
4. **Connexion du compte Meta** (Facebook Login for Business, permissions publicitaires).
5. **Bilan de santé du compte** (F1) : une liste de contrôle verte ou rouge avec un bouton « Comment faire » pour chaque élément.
   - Portefeuille business (Business Manager) existant. Sinon, guide de création. La création par API n'est pas possible.
   - Compte publicitaire existant, avec un moyen de paiement ou des fonds prépayés.
   - Page Facebook. Sinon, guide de création.
   - Instagram lié à la Page : *recommandé*, l'utilisateur peut ignorer.
   - WhatsApp Business lié à la Page : **fortement recommandé**, parce que c'est là que les clients écrivent.
   - Pixel ou ensemble de données : optionnel (voir §7.3).
6. Création du **kit de marque** (F2) : logo, couleurs, police, numéro WhatsApp ou téléphone, slogan. Ces informations sont réutilisées automatiquement.

> Pubeka **détecte et guide**. Il ne crée jamais de Page, de portefeuille business ni de liaison Instagram ou WhatsApp à la place de l'utilisateur.

### 4.2 Créer une campagne (parcours principal)
1. **Entrée.** L'utilisateur fournit une ou plusieurs sources :
   - lien de site web ;
   - lien d'application ;
   - photo du produit ;
   - photo ou lien d'une publication (Facebook, Instagram, X, tout réseau social) ;
   - document PDF ou Word (business plan, présentation, objectifs) ;
   - description texte libre.
   Un champ de description complémentaire, facultatif, permet de dire « ce que je veux comme pub ».
2. **Analyse** par l'agent Analyste business, qui produit une fiche business structurée.
3. **3 à 5 questions ciblées**, générées selon ce qui manque (zone géographique, offre, numéro à afficher, public, ton…). Pas de questionnaire générique.
4. **Proposition visuels (optionnelle, facturée sur le quota visuels).** Pubeka propose : « Créer aussi le visuel avec l'IA ? ». Si oui :
   - 3 à 5 questions visuelles ;
   - possibilité d'ajouter une ou plusieurs **images de référence personnelles** ;
   - génération de **3 visuels en 4:5** ;
   - l'utilisateur en choisit un, ou importe son propre visuel ou sa vidéo.
5. **Proposition de campagne**, générée **une à la fois** par l'agent Stratège :
   - **plateforme(s)** : Meta Ads, Google Ads, TikTok Ads, présentées au même niveau. Au lancement, seule Meta Ads est sélectionnable, les autres portent « Bientôt disponible ». Plus tard, l'utilisateur pourra en cocher plusieurs ;
   - **objectif** recommandé, avec la raison et une description courte de chaque objectif ;
   - **budget par jour** recommandé, avec un texte d'explication (jamais moins de 1 $ par jour, soit environ 600 FCFA) ;
   - **dates** de début et de fin ;
   - **zone** : pays, ville, quartier ou rayon ;
   - **textes** : titre, texte principal, description, bouton d'action, dans la langue choisie ;
   - **destination** : WhatsApp, Messenger, Instagram Direct, site web ou publication ;
   - **ciblage** : Advantage+ par défaut, invisible pour l'utilisateur, en dehors de la zone ;
   - **estimation** de portée et de résultats, à partir de l'estimation de Meta (F6) ;
   - **coût total** : budget + TVA du pays, en $ et en FCFA.
   Tout est modifiable. L'utilisateur peut aussi demander « Une autre proposition ».
6. **Aperçu détaillé** (F3) : fil Facebook, fil Instagram, Stories, Reels, Messenger.
7. **Formats supplémentaires** (optionnel) : ajouter les formats 9:16, 1:1 ou 1.91:1 à partir du visuel choisi. Chaque format consomme du quota visuels.
8. **Test A/B** (optionnel) : « Tester 2 visuels » (voir §7.5).
9. **Publier** (aucun jugement préalable : seul l'illégal évident a été écarté par l'Analyste dès l'étape 2). Une campagne est décomptée du quota **au moment du clic sur Publier**.
10. **Statut synchronisé avec Meta** (F5) : « En vérification chez Meta » → « En diffusion » / « Refusée » / « Arrêtée ». L'utilisateur peut mettre en pause ou arrêter à tout moment.

### 4.3 Atelier visuels (page dédiée)
Même logique que l'étape 4 du parcours campagne, sans créer de campagne :
- Entrée : lien du site, photo du produit, lien de publication, description, images de référence.
- 3 à 5 questions, puis 3 visuels, puis « 3 autres » si l'utilisateur en demande.
- **Modification ciblée** : sélectionner un visuel et écrire « change le numéro », « retire l'icône », « fond plus clair ». Seul l'élément demandé change (voir §8).
- Téléchargement, ou ajout direct à une campagne existante ou nouvelle.

### 4.4 Relancer et réutiliser (F9)
- Les campagnes et visuels **choisis** sont mémorisés comme **références** pour ce compte.
- Les générations suivantes s'en inspirent pour proposer *similaire mais pas identique* : si la campagne B et le visuel C ont été choisis, ils servent de base aux prochaines propositions.
- « Relancer » une campagne permet de garder le même visuel, d'en générer 2 nouveaux ou d'en changer.

### 4.5 Si la pub est refusée par Meta (F4)
- Le motif de refus de Meta est traduit en langage simple.
- Une correction est proposée en un clic.
- Le **Modérateur** rédige un court rapport : pourquoi Meta a refusé, quel élément est en cause, quelle correction appliquer, et s'il faut demander un nouvel examen.
- Le motif est enregistré, anonymisé, dans la **mémoire des refus**.

### 4.6 Fin d'abonnement
- Les campagnes en cours **continuent** chez Meta, puisque c'est le compte du client.
- Pubeka passe en **lecture seule** : statistiques consultables, aucune nouvelle campagne, aucune modification, aucune génération.

---

## 5. Multi-business
- Un compte Pubeka gère **plusieurs business ou Pages** et choisit la Page à chaque campagne.
- Starter = 1 business, Pro = 3, Business = 10.
- Les données de chaque business (fiche, kit de marque, références) sont séparées.

---

## 6. Agents IA

Règle absolue : **chaque agent a une mission unique, des entrées et des sorties strictes (schéma JSON validé), une liste de choses autorisées et interdites, et ne sort jamais de son rôle.** Toute sortie qui ne respecte pas le schéma est rejetée et régénérée. Aucun agent ne voit les données d'un autre utilisateur.

Chaque agent fera l'objet d'un **document de spécification dédié** (`docs/agents/<agent>.md`) avec : le contexte projet, la mission, les règles, la méthodologie pas à pas, les schémas JSON d'entrée et de sortie, des exemples bons et mauvais, les critères de qualité et les cas d'erreur. Le tableau ci-dessous est le résumé.

| # | Agent | Mission | Entrée | Sortie | Interdit |
|---|---|---|---|---|---|
| 1 | **Analyste business** | Comprendre le business | URL, images, PDF/Word, texte | `BusinessProfile` (produit, offre, prix, cible, zone, ton, arguments, contacts, langue) + questions manquantes | Inventer une information absente ; proposer une campagne |
| 2 | **Stratège campagne** | Proposer une campagne Meta complète et justifiée | `BusinessProfile`, réponses, références choisies, pays | `CampaignProposal` (objectif, budget, dates, zone, textes, destination, justification) | Générer des visuels ; dépasser les règles Meta ; budget < 1 $/jour |
| 3 | **Designer visuel** | Produire des visuels au niveau d'un graphiste | `BusinessProfile`, réponses visuelles, photos, références, kit de marque, format | `VisualSpec` (scène, mise en page, calques texte) + images | Dessiner le texte, le prix, le numéro ou le logo dans l'image ; déformer le produit ; modifier ce qui n'est pas demandé |
| 4 | **Modérateur** | Expliquer un refus de Meta **après coup** et proposer la correction | Pub refusée + motif officiel Meta | Rapport (cause, élément en cause, correction, nouvel examen conseillé ou non) | Juger ou bloquer un commerce légal ; inventer une règle Meta |
| 5 | **Optimiseur** | Surveiller les campagnes publiées et proposer des actions | Statistiques Meta | Recommandations (pause, budget ±, nouveau visuel, fatigue) | Agir sans l'accord de l'utilisateur |
| 6 | **Assistant aide** | Bulle d'aide professionnelle qui connaît l'état du compte | Question + état du compte | Réponse et guide pas à pas | Créer ou modifier des campagnes ; sortir du sujet Pubeka |
| V2 | **Vidéaste** | Vidéos publicitaires | — | — | — |

Les modèles d'IA (Claude, Gemini, OpenAI, Mistral, Kimi…) seront **choisis par agent après des tests comparatifs** (§14). Chaque appel est journalisé avec son coût.

---

## 7. Campagnes Meta

### 7.1 Objectifs au MVP
| Objectif | Destination | Usage |
|---|---|---|
| **Messages** (prioritaire) | WhatsApp, Messenger, Instagram Direct | « On t'écrit directement » |
| **Trafic** | Site web, application | Visites |
| **Interaction** | Publication | Mentions J'aime, commentaires, partages |
| **Notoriété / visibilité** | — | Être vu |
| **Ventes** | Site web (conversions) | Achats, avec pixel recommandé |

Chaque objectif a une description courte et compréhensible dans l'interface.

### 7.2 Ciblage
Advantage+ (ciblage automatique de Meta) par défaut. Seule la **zone géographique** est visible et modifiable. Décision du 16/10/2026 : pas de saisie de centres d'intérêt pour l'instant (une saisie sans effet tromperait l'utilisateur) ; les intérêts proposés par l'IA viendront plus tard (voir ROADMAP, « À planifier »). Âge, sexe et langue sont gérés en paramètres avancés et repliés.

### 7.3 Pixel / ensemble de données
- Question posée : « As-tu un pixel Meta sur ton site ? »
- **Oui :** Pubeka liste les pixels du compte (menu déroulant), active le suivi (événements du site web, événements d'application, événements hors ligne) et affiche les statistiques du pixel dans la campagne.
- **Non :** la campagne est créée quand même. Un message explique que sans pixel, on ne voit pas ce qui se passe sur le site. Un guide d'installation du pixel est proposé.
- Guides d'installation par plateforme : **Shopify, WordPress/WooCommerce, Wix, site sur mesure**.
- ⚠️ **À tester :** une campagne Ventes avec conversion site web sans pixel actif est-elle acceptée par Meta ? Le constat actuel est qu'elle n'est pas bloquée.

### 7.4 Formats
| Format | Taille | Statut |
|---|---|---|
| **4:5** | 1080×1350 | Généré par défaut (fil FB/IG) |
| 9:16 | 1080×1920 | En option, quota visuels. Zones de sécurité haut et bas sans texte |
| 1:1 | 1080×1080 | En option, quota visuels |
| 1.91:1 | 1200×628 | En option, quota visuels |
Les vidéos utilisent 4:5, 9:16 et 1:1.

### 7.5 Test A/B
Optionnel. Il lance 2 variantes (visuel ou texte) avec le même budget partagé, puis montre la gagnante dans les statistiques. Il compte pour **une seule** campagne dans le quota.

---

## 8. Système de visuels en deux couches

1. **Couche scène (IA)** : fond, ambiance, lumière, mise en scène. La **vraie photo du produit est détourée et placée** dans la scène, jamais redessinée.
2. **Couche mise en page (code)** : titre, prix, numéro, logo, bouton d'action, positionnés selon des **mises en page conçues comme celles d'un graphiste**, une par format.

Conséquences :
- Modifier un texte, un numéro ou un logo est **exact, instantané** et ne touche rien d'autre.
- Passer d'un format à l'autre se fait par **nouvelle mise en page**, sans redessin : pas de faute, pas de chevauchement.
- Seules les modifications de scène (fond, ambiance) repassent par l'IA.
- **Critère de mise en production :** si les tests montrent que l'IA modifie des éléments non demandés, la fonction « modification de scène » est retirée jusqu'à ce que le Designer soit amélioré.

### 8.1 Références du Designer visuel
1. **Bibliothèque maison** : pubs sélectionnées à la main, classées par secteur, style et format, puis notées. C'est l'actif principal.
2. **Visuels choisis par les utilisateurs**, et ceux qui ont eu de bons résultats. Ils enrichissent la bibliothèque **de façon anonyme**.
3. **Images de référence de l'utilisateur**, fournies à chaque génération.
4. **Meta Ad Library**, pour l'inspiration de composition et d'angle, jamais pour copier.
   ⚠️ Limite connue : l'API de la bibliothèque publicitaire ne donne accès à **toutes** les pubs que pour celles diffusées dans l'UE. Hors UE, elle ne donne que les pubs politiques. Pour l'Afrique, l'accès automatique est donc limité. À valider (§14).
5. Banques d'images libres de droits (Unsplash, Pexels) pour les fonds.
- **Pinterest : exclu**, en raison de ses conditions d'utilisation et des droits d'auteur.

---

## 9. Argent : plans, quotas, paiement

### 9.1 Abonnements (payés via **SasPay**)
| | Starter | Pro | Business |
|---|---|---|---|
| Campagnes publiées / mois | 2 | 5 | 15 |
| Crédits inclus / mois (images et vidéos) | 10 | 15 | 30 |
| Business / Pages | 1 | 3 | 10 |
| Analyse concurrents, export PDF, Optimiseur, statistiques comparatives | — | ✅ | ✅ |
| Prix / mois | 5 000 XAF | 12 000 XAF | 25 000 XAF |

Détail des crédits, coûts par génération et marges : [plans-et-credits.md](plans-et-credits.md). Crédit supplémentaire : 1 000 XAF (vidéo : 2 crédits minimum).

- **Essai** : 1 campagne, 3 visuels, 7 jours, sans moyen de paiement.
- **Au-delà du quota** : achat de **crédits** via SasPay (1 campagne = X crédits, 1 visuel = Y crédits, à fixer).
- **Ce qui consomme du quota** : chaque visuel généré (3 générés = 3), chaque format supplémentaire, chaque campagne publiée.
- **Ce qui n'en consomme pas** : un produit illégal écarté par l'Analyste, un brouillon non publié, la republication après correction d'un refus Meta.

### 9.2 Budget publicitaire (payé à Meta par le client)
- Le client paie Meta avec **sa carte** ou des **fonds prépayés** dans son compte publicitaire.
- Si le client n'a pas de carte : le guide recommande une carte virtuelle (**Keecash**).
- Pubeka affiche : **budget + TVA du pays = total**, en $ et en FCFA (**taux du marché en temps réel**, via une API gratuite), par jour et pour toute la durée.
- Mention : « hors frais éventuels de ta banque ou de ta carte ».

### 9.3 TVA Meta par pays
Meta ajoute la TVA locale selon le pays de facturation (« Sold To ») du compte publicitaire. **Table des taxes par pays modifiable sans redéploiement.** État connu :

| Pays | TVA Meta | Statut |
|---|---|---|
| Nigeria | 7,5 % | Confirmé (depuis 2022) |
| Kenya | 16 % | Confirmé. Exonération possible si l'annonceur déclare un usage professionnel |
| Ghana | Applicable (taux local) | Confirmé (depuis août 2023) |
| Tanzanie | 18 % | Confirmé (depuis déc. 2023) |
| Afrique du Sud | 15 % | À confirmer |
| Maroc | TVA sur services numériques depuis juin 2026 | À confirmer pour les pubs |
| Cameroun, Côte d'Ivoire, Sénégal, Bénin, autres zones CFA | ? | **À vérifier** dans l'aide Meta et les paramètres de taxes d'un compte de test par pays |

---

## 10. Statistiques et tableau de bord

### 10.1 Bandeau du haut (3 informations maximum, uniquement si l'utilisateur a de l'activité)
1. **Campagnes actives**
2. **Dépensé ce mois** (FCFA, avec $ au survol)
3. **Quota restant** (campagnes et visuels)

### 10.2 Statistiques de campagne
- **Toutes** les statistiques Meta disponibles : portée, impressions, clics, CTR, CPM, coût par résultat, conversations, etc.
- **Résultat traduit en argent** (F7) : « 42 messages WhatsApp, soit 357 FCFA par client potentiel ».
- Statistiques du pixel quand il y a un pixel.
- Résultats des tests A/B.
- **Premium** : export PDF ; comparaison avec les campagnes précédentes, puis avec la moyenne anonyme du secteur sur Pubeka (F8) ; analyse des concurrents (F10).
- **V2** : comparaison entre plateformes (Meta, Google, TikTok).

### 10.3 Optimiseur (Pro et Business)
Il propose des actions (mise en pause, hausse ou baisse du budget, fatigue créative avec nouveau visuel). **L'utilisateur valide toujours.** Il peut aussi modifier sa campagne en cours à tout moment.

### 10.4 Notifications (F11, e-mail via Resend)
Pub validée, pub refusée, paiement Meta échoué, budget épuisé, fin de campagne, quota presque atteint, abonnement qui expire, **résumé hebdomadaire**.

---

## 11. Aide

- **Bulle d'aide unique**, professionnelle, qui **connaît l'état du compte**. Exemple : « Je vois que ton WhatsApp Business n'est pas lié à ta Page. Voici comment faire. »
- **Guides intégrés pas à pas, style tutoriel** :
  - créer une Page ;
  - créer un portefeuille business ;
  - lier Instagram ;
  - lier WhatsApp Business ;
  - ajouter une carte ou des fonds prépayés dans Meta ;
  - obtenir une carte virtuelle (Keecash) ;
  - créer et installer un pixel (Shopify, WordPress, Wix, site sur mesure).

---

## 12. Fonctionnalités : récapitulatif et calendrier

| ID | Fonctionnalité | MVP | V2 |
|---|---|---|---|
| F1 | Bilan de santé du compte | ✅ | |
| F2 | Kit de marque | ✅ | |
| F3 | Aperçu détaillé multi-emplacements | ✅ | |
| F4 | Refus Meta expliqués et correction en un clic | ✅ | |
| F5 | Statuts synchronisés avec Meta | ✅ | |
| F6 | Estimation avant publication | ✅ | |
| F7 | Résultat traduit en argent | ✅ | |
| F8 | Statistiques comparatives (premium) | ✅ (historique perso) | moyenne du secteur |
| F9 | Relancer et références | ✅ | |
| F10 | Analyse des concurrents (premium) | ✅ (selon §8.1) | |
| F11 | Notifications e-mail et résumé hebdo | ✅ | |
| F12 | Parrainage (une campagne offerte) | ✅ | |
| — | Atelier visuels + modification ciblée | ✅ | |
| — | Test A/B | ✅ | |
| — | Optimiseur | ✅ | |
| — | Tableau d'administration | ✅ | |
| — | Vidéo IA (Vidéaste) | | ✅ |
| — | Google Ads, TikTok Ads, multi-plateforme | « Bientôt » | ✅ |
| — | Application mobile native | | ✅ (après une web app stable) |

---

## 13. Exigences non fonctionnelles

- **Nouvelle base de code.** L'expérience AdFacile, qui prouve que la création de campagnes via l'API Meta fonctionne, sert de référence technique.
- **Hébergement** : Vercel. Domaine chez Hostinger.
- **Mobile d'abord** : web app très responsive, légère, sans lenteur, utilisable de bout en bout sur téléphone.
- **Bilingue** FR/EN (interface et contenus générés, choisis séparément).
- **Isolation des données** : aucune fuite entre utilisateurs, ni dans les agents ni dans la base. Les références partagées sont anonymisées.
- **Confidentialité** : fichiers et données conservés jusqu'à la suppression du compte. Page de **politique de confidentialité** et **URL de suppression des données** (exigées par Meta).
- **Administration** : utilisateurs, abonnements, **coût IA par utilisateur et par agent**, campagnes modérées et refusées, gestion de la table TVA et de la bibliothèque de références.
- **Prérequis légaux et Meta (bloquants pour la production)** :
  - immatriculation de l'entreprise ;
  - vérification du Business Manager ;
  - **App Review Meta** (accès avancé à `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`…) ;
  - compte marchand SasPay.

---

## 14. À tester ou décider avant la production

| # | Sujet | Critère de réussite |
|---|---|---|
| T1 | Choix du modèle par agent (texte, image) | Benchmark qualité / coût / vitesse sur 50 cas réels |
| T2 | Qualité du Designer visuel | ≥ 60 % des visuels jugés utilisables par un panel |
| T3 | Fidélité de la modification de scène | 0 modification non demandée sur 30 essais, sinon la fonction est retirée |
| T4 | Campagne Ventes sans pixel | Acceptée et diffusée par Meta |
| T5 | TVA Meta pays par pays | Table complétée pour tous les pays du lancement |
| T6 | Accès à la Meta Ad Library pour l'Afrique | Faisabilité de F10 et de la source de références n°4 |
| T7 | API de change gratuite fiable | Mise à jour au moins toutes les heures, disponibilité 99 % |
| T8 | Prix des plans | Fixés après mesure du coût IA réel par campagne et par visuel |
| T9 | Intégration SasPay (abonnements et crédits) | Paiement, renouvellement, échec, remboursement |

---

## 15. Documents suivants
1. `docs/agents/*.md` : spécification complète de chaque agent.
2. Design system Pubeka.
3. Architecture technique et modèle de données.
4. Plan d'implémentation du MVP.
