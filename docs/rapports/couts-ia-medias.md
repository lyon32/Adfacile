# Rapport — Coût des images et vidéos IA au prix normal (Higgsfield)

> 10 octobre 2026 · Source : catalogue [open.higgsfield.ai/explore](https://open.higgsfield.ai/explore) relevé le 10/10/2026.
> **Tous les calculs utilisent le prix normal (barré)**, pas le prix promotionnel (−15 % à −50 %, « 100 % cashback »), pour ne pas être surpris à la fin des promotions.
> ⚠️ Les prix « à partir de » sont des **minimums** (plus basse résolution, durée minimale). Le coût réel d'une requête se lit avec l'endpoint d'estimation de Higgsfield avant chaque génération. **Ces chiffres seront remplacés par les coûts mesurés pendant les tests.**
> Conversion : hypothèse **1 $ ≈ 600 FCFA** (le taux réel sera lu chez SasPay au moment voulu).

## ⚠️ Correction du 10/10/2026
La console Higgsfield affiche **0,374 $ (barré 0,44 $)** pour Marketing Studio Image 2.0 en 2K qualité haute. Les calculs ci-dessous utilisent les prix « à partir de » et **sous-estiment** le coût réel. Ils seront refaits avec les coûts mesurés pendant les tests.

## 1. Images

| Modèle / outil | Usage pour EasAds | Prix normal | ≈ FCFA |
|---|---|---|---|
| Product shots (workflow) | Photo produit → image de campagne | 0,016 $ / image | 10 |
| Marketing Studio Image | Créer et **modifier** une image de campagne (1K à 4K) | à partir de 0,016 $ / image | 10+ |
| Graphic ads (workflow) | Pub complète avec texte (⚠️ texte dessiné par l'IA, contraire à notre règle des deux couches) | 0,016 $ / image | 10 |
| Grok Imagine 2.0 | Modifications précises en gardant le reste de l'image | à partir de 0,040 $ / image | 24+ |
| Soul 2 | Portraits, mode, lifestyle | à partir de 0,003 $ / image | 2+ |
| Recraft 4.1 | Illustrations aux couleurs de la marque | 0,035 $ / image | 21 |
| Ideogram 4.0 | Images avec texte (affiches) | 0,030 $ / image | 18 |
| Ads Studio (workflow) | Du brief à la pub prête | à partir de 0,084 $ / image | 50+ |

## 2. Vidéos (V2)

| Modèle | Points forts | Prix normal / seconde | Vidéo 5 s | Vidéo 10 s | Vidéo 15 s |
|---|---|---|---|---|---|
| Wan 3.0 | Jusqu'à 30 s, son natif | 0,050 $ | 0,25 $ (150 F) | 0,50 $ (300 F) | 0,75 $ (450 F) |
| Wan 3.0 Prime | Rapide, jusqu'à 30 s | 0,068 $ | 0,34 $ | 0,68 $ | 1,02 $ |
| Grok Imagine Video 1.5 | 1080p, jusqu'à 15 s | 0,080 $ | 0,40 $ | 0,80 $ | 1,20 $ |
| Kling 3.0 | Multi-plans, son natif, jusqu'à 15 s | 0,084 $ | 0,42 $ (252 F) | 0,84 $ (504 F) | 1,26 $ (756 F) |
| LTX 2.5 Fast | 4K, contrôle de caméra | 0,090 $ | 0,45 $ | 0,90 $ | 1,35 $ |
| MiniMax H3 | 2K, jusqu'à 15 s | 0,130 $ | 0,65 $ | 1,30 $ | 1,95 $ |
| Seedance 2.0 | 4K, jusqu'à 15 s | 0,141 $ | 0,71 $ | 1,41 $ | 2,12 $ |
| Seedance 2.5 | Jusqu'à 30 s, références texte/image/vidéo/audio | 0,206 $ | 1,03 $ | 2,06 $ | 3,09 $ |

**Une seconde de vidéo coûte autant que 3 à 13 images.** La vidéo doit avoir son propre quota, beaucoup plus petit.

## 3. Coût IA des quotas des formules (images seulement)

Hypothèses : chaque visuel = 1 génération de scène (Product shots ou Marketing Studio, 0,016 $) ; 1 modification de fond sur 3 visuels (0,040 $) ; les formats supplémentaires sont gérés par le code (0 $), sauf extension de scène (0,016 $).

| Formule | Visuels / mois | Coût images au prix normal | ≈ FCFA |
|---|---|---|---|
| Starter | 10 | 10 × 0,016 + 3 × 0,040 = **0,28 $** | 170 |
| Pro | 40 | 40 × 0,016 + 13 × 0,040 = **1,16 $** | 700 |
| Business | 150 | 150 × 0,016 + 50 × 0,040 = **4,40 $** | 2 640 |

À ajouter : les modèles **texte** (Analyste, Stratège, Designer, Modérateur, Optimiseur, Aide), mesurés pendant les tests (Gemini Flash-Lite ≈ quasi gratuit à faible volume), les frais SasPay (payés par le client) et l'hébergement (Vercel, Supabase, Trigger.dev, PostHog).

**Conclusion provisoire :** au prix normal, les images coûtent **moins de 5 $ par mois même en Business**. Le vrai risque de coût est la **vidéo** et les **régénérations en boucle**, d'où le plafond quotidien (voir la mémoire du projet) et un quota vidéo séparé.

## 4. À mesurer pendant les tests (un par un)
1. Coût réel par l'endpoint d'estimation pour chaque outil, en 1K et 2K.
2. Qualité : respect de la photo produit, rendu « non IA », lisibilité de l'espace réservé au texte.
3. Modification ciblée (fond seul) : Marketing Studio vs Grok Imagine 2.0.
4. Temps de génération et limite de requêtes simultanées réelle du compte.
5. Ensuite seulement : vidéos (Kling 3.0, Wan 3.0) à partir d'un visuel choisi.
