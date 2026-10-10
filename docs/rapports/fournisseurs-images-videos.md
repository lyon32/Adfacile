# Rapport — Fournisseurs d'images et de vidéos : Higgsfield, fal.ai, BytePlus

> 10 octobre 2026 · **Uniquement ce qui est écrit sur les pages officielles consultées ce jour.** Ce qui n'a pas pu être vérifié est marqué ❓. Aucun test réel n'a encore été fait (clés manquantes) : les tests un par un viendront ensuite.

## 1. Pages consultées

| Fournisseur | Pages lues |
|---|---|
| Higgsfield | docs.higgsfield.ai : index, billing-and-retention, rate-limits, errors, webhooks, sdk, faq ; catalogue open.higgsfield.ai/explore ; GitHub higgsfield-client |
| fal.ai | fal.ai/llms.txt ; docs : pricing, faq, concurrency-limits, fal-cdn, queue ; fiches techniques (llms.txt) de 11 modèles ; recherche « seedance » du catalogue |
| BytePlus (ModelArk) | ai.byteplus.com/en/activity/seedance2-5 ; docs.byteplus.com Pricing (ModelArk/1099320) ; docs.byteplus.com/en/docs/modelark/api-key → **erreur serveur 500 côté BytePlus, contenu illisible** |
| Lien hors sujet | api.byteplus.com/api-explorer?action=CreateDeploymentSet&serviceCode=**ecs** : c'est l'API des **serveurs cloud** (ECS) de BytePlus, pas des modèles d'IA. Inutile pour EasAds |

## 2. Fonctionnement

| | Higgsfield | fal.ai | BytePlus ModelArk |
|---|---|---|---|
| Rôle | Agrégateur image/vidéo + outils pub | Agrégateur image/vidéo/audio (catalogue le plus large) | **Source officielle** des modèles ByteDance (Seedream, Seedance) |
| Appel | File + suivi d'état ou webhook | File + suivi d'état ou webhook | API Ark (SDK officiel) |
| SDK Node.js | `@higgsfield/client` | `@fal-ai/client` | SDK Ark ❓ (page non vérifiée) |
| **Au-delà de la limite simultanée** | **Refus** (HTTP 400 « Maximum number of concurrent requests ») | **Jamais refusé** : mis en file automatiquement, sans limite de réessais | ❓ non trouvé |
| Limite simultanée | **20 requêtes simultanées par clé API** (configuration standard, confirmé par le support Higgsfield, ticket #318114, 10/10/2026) ; au-delà : formulaire *Contact Sales* (higgsfield.ai/pricing, Enterprise) ; solde API en dollars payé à l'usage, sans abonnement web | **2 au départ**, monte **automatiquement jusqu'à 40** avec les achats de crédits ; au-delà, contrat entreprise | ❓ |
| Conservation des fichiers générés | **Au moins 7 jours**, puis suppression possible | Au moins 7 jours par défaut, **réglable par requête** ; URL **publiques par défaut** (réglage d'accès privé disponible) | ❓ |
| Échec / contenu refusé facturé ? | Non | Non (erreurs serveur et attente en file non facturées) | Non (« content moderation » non facturé) |
| Crédits | Expirent après 1 an | Expirent après 365 jours | Forfaits Seedance 2.5 valables **3 mois**, **non remboursables**, puis paiement à l'usage |
| Estimation avant génération | Oui (endpoint d'estimation) | Prix publié dans chaque fiche | Calculateurs de prix Seedance |

## 3. Prix des images (prix officiels, par image)

| Modèle | Higgsfield | fal.ai | BytePlus |
|---|---|---|---|
| Outils pub sur photo produit (Product shots, Marketing Studio) | **à partir de** 0,016 $ (catalogue) · ⚠️ **constaté dans la console : Marketing Studio Image 2.0, qualité haute, 2K = 0,374 $ (barré 0,44 $) par génération** | — | — |
| Nano Banana 2 (génération **et modification**) | ❓ non vu au catalogue | **0,08 $** (1K) ; ×1,5 en 2K ; ×2 en 4K | — |
| FLUX.1 Kontext (modification par instruction) | — | **0,04 $** | — |
| FLUX.2 pro | — | 0,03 $ (1 mégapixel) | — |
| Seedream 4.0 | — | 0,03 $ (génération et modification) | 0,03 $ |
| Seedream 4.5 / 5.0 lite | — | — | 0,04 $ / 0,035 $ |
| **Seedream 5.0 flash** | — | — | **0,018 $** |
| Seedream 5.0 pro | — | — | 0,045 $ (≤ 1,5K) ; 0,09 $ (> 1,5K) |
| SeedEdit 3.0 (modification) | — | — | 0,03 $ |
| Z-Image Turbo | 0,015 $ | 0,005 $ par mégapixel | — |
| Grok Imagine 2.0 (modifications précises) | à partir de 0,040 $ | — | — |

## 4. Prix des vidéos (par seconde, prix officiels)

| Modèle | Higgsfield (prix normal) | fal.ai | BytePlus (calcul officiel¹) |
|---|---|---|---|
| Seedance 2.5, 480p | à partir de 0,206 $ | 0,2205 $ | ≈ **0,103 $** |
| Seedance 2.5, 720p | ❓ | 0,473 $ | ≈ **0,231 $** |
| Seedance 2.5, 1080p | ❓ | 1,164 $ | ≈ 0,569 $ |
| Seedance 2.0 mini, 720p | — | 0,155 $ | ≈ 0,076 $ |
| Kling 3.0 | 0,084 $ | 0,112 $ (sans son) ; 0,168 $ (avec son) | — |
| Wan 3.0 | 0,050 $ | ❓ | — |

¹ BytePlus facture en jetons : jetons = durée × largeur × hauteur × 24 / 1024. Seedance 2.5 sans vidéo en entrée : 10,70 $ par million de jetons (480p/720p), 11,70 $ (1080p). Exemple 720p (1280×720) : 21 600 jetons par seconde × 10,70 $/M ≈ 0,231 $/s. Forfaits : 32 $ = 5 M jetons, 64 $ = 10 M, 640 $ = 100 M (3 mois, non remboursables).

## 5. Conclusions (faits, pas suppositions)

1. ⚠️ **Correction (capture de la console, 10/10) :** Marketing Studio Image 2.0 en 2K qualité haute coûte 0,374 $ (0,44 $ barré), pas 0,016 $. Les prix « à partir de » du catalogue sont des minimums trompeurs : seuls les tests mesureront le coût réel par réglage. La limite de 20 simultanées se débloque après vérification de carte et d'e-mail professionnel.
2. **Images pub les moins chères (prix « à partir de ») :** Higgsfield *Product shots / Marketing Studio* (0,016 $), puis BytePlus *Seedream 5.0 flash* (0,018 $). Nano Banana 2 sur fal coûte **5 fois plus** (0,08 $).
2. **Modification ciblée (« change seulement le fond ») :** les candidats documentés comme modèles d'édition sont **Nano Banana 2 edit** (fal, 0,08 $), **FLUX.1 Kontext** (fal, 0,04 $), **SeedEdit 3.0** (BytePlus, 0,03 $), **Seedream 4.0 edit** (fal, 0,03 $), **Grok Imagine 2.0** et **Marketing Studio** (Higgsfield). Leur fidélité reste à prouver par test (PRD T3).
3. **Vidéo Seedance : BytePlus est environ 2 fois moins cher que fal** (0,231 $ contre 0,473 $ la seconde en 720p). Kling 3.0 est moins cher chez Higgsfield que chez fal.
4. **Fiabilité sous charge :** fal est le seul dont la documentation garantit qu'**aucune requête n'est refusée** à cause de la limite simultanée (mise en file automatique). Higgsfield refuse (400), il faut gérer la file nous-mêmes (Trigger.dev). Pour BytePlus, ce n'est pas documenté sur les pages accessibles.
5. **Risques BytePlus constatés :** page de documentation en panne (erreur 500) le jour de la consultation ; forfaits non remboursables et limités à 3 mois.
6. **Point d'attention fal :** les URL des fichiers générés sont **publiques par défaut**. Il faut demander des fichiers privés ou les copier immédiatement chez nous.

## 6. Recommandation pour les tests (un par un)
1. **Images, 1er tour :** Higgsfield Product shots · BytePlus Seedream 5.0 flash · fal Nano Banana 2, sur les mêmes 6 cas.
2. **Modification ciblée :** fal FLUX.1 Kontext · fal Nano Banana 2 edit · BytePlus SeedEdit 3.0 · Higgsfield Marketing Studio.
3. **Vidéo (après les images) :** BytePlus Seedance 2.5 (480p/720p) · Higgsfield Kling 3.0 · Higgsfield Wan 3.0.
4. **Architecture :** un fournisseur principal par usage, **fal en secours** grâce à sa file qui ne refuse jamais, le tout derrière la passerelle IA.

Clés nécessaires pour tester : `HF_KEY` (Higgsfield, format `id:secret`), `FAL_KEY` (fal.ai), `ARK_API_KEY` (BytePlus ModelArk).
