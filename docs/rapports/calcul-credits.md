# Calcul — Facturation en crédits

> 10 octobre 2026 · Base de travail, à recalculer avec les coûts mesurés pendant les tests.
> **Hypothèses :** 1 crédit = **1 000 XAF** (prix de vente) · 1 $ ≈ **600 XAF** (le XAF suit l'euro ; taux réel lu chez SasPay au moment voulu) · prix des fournisseurs **au tarif normal**, hors promotion · frais SasPay payés par le client (Q46), donc exclus.

## 1. La règle

```
coût réel en XAF   = prix fournisseur en $ × 600
crédits demandés   = arrondi au-dessus de (coût réel en XAF ÷ 250), minimum 1
```

**Pourquoi 250 :** c'est 25 % du prix d'un crédit (1 000 XAF). Le coût réel d'une génération ne dépasse donc **jamais 25 % de ce que paie le client** : la marge brute est toujours d'au moins 75 %. Ce seuil se change dans l'administration.

Conséquence simple pour le client : **1 crédit = 1 image standard.** Seules les générations chères (haute qualité, vidéo) demandent plus.

Ce qui ne coûte pas de crédit (inclus dans l'image) : le détourage du produit (0,016 $), l'adaptation de format (Luma Reframe, environ 0,005 $), les textes posés par notre code.

## 2. Images (prix par image)

| Modèle et réglage | Prix fournisseur | Coût XAF | Crédits | Le client paie | Marge brute |
|---|---|---|---|---|---|
| Soul 2, 720p (Higgsfield) | 0,0032 $ | 2 | **1** | 1 000 XAF | 99,8 % |
| Marketing Studio, 2K basse (Higgsfield) | 0,0222 $ | 13 | **1** | 1 000 XAF | 98,7 % |
| Seedream 5.0 Flash (fal) | 0,027 $ | 16 | **1** | 1 000 XAF | 98,4 % |
| Bria Product Shot (fal) | 0,04 $ | 24 | **1** | 1 000 XAF | 97,6 % |
| Nano Banana 2.1, 1K / 2K / 4K (fal) | 0,040 / 0,059 / 0,134 $ | 24 / 35 / 80 | **1** | 1 000 XAF | 97,6 % / 96,5 % / 92 % |
| FLUX 3, 1K (fal) | 0,048 $ | 29 | **1** | 1 000 XAF | 97,1 % |
| GPT Image 2.5, 1024², haute / max (fal) | 0,053 / 0,211 $ | 32 / 126 | **1** | 1 000 XAF | 96,8 % / 87,4 % |
| **Marketing Studio, 2K haute** (Higgsfield) | 0,44 $ | 264 | **2** | 2 000 XAF | 86,8 % |
| Marketing Studio, 4K haute (Higgsfield) | 0,7219 $ | 433 | **2** | 2 000 XAF | 78,3 % |

## 3. Vidéos (clip de 5 secondes)

| Modèle et réglage | Prix fournisseur | Coût XAF | Crédits | Le client paie | Marge brute |
|---|---|---|---|---|---|
| Veo 3.1 Lite, 720p sans son (fal) | 0,15 $ | 90 | **1** | 1 000 XAF | 91 % |
| Kling 3.0 Standard, sans son (Higgsfield) | 0,42 $ | 252 | **2** | 2 000 XAF | 87,4 % |
| Kling 3.0 Standard, avec son (fal) | 0,63 $ | 378 | **2** | 2 000 XAF | 81,1 % |
| Wan 3.0, 720p (fal) | 0,50 $ | 300 | **2** | 2 000 XAF | 85 % |
| Seedance 2.5, 720p (Higgsfield) | 2,31 $ | 1 387 | **6** | 6 000 XAF | 76,9 % |
| Seedance 2.5, 1080p (Higgsfield) | 5,69 $ | 3 412 | **14** | 14 000 XAF | 75,6 % |

## 4. Exemple : un client avec 20 crédits (20 000 XAF)

| Ce qu'il fait | Crédits | Coût réel pour EasAds |
|---|---|---|
| 3 visuels standard Marketing Studio (2K basse) | 3 | 40 XAF |
| 3 visuels standard avec Bria Product Shot | 3 | 72 XAF |
| 2 visuels en haute qualité Marketing Studio (2K haute) | 4 | 528 XAF |
| 1 vidéo Kling 3.0 de 5 s avec son | 2 | 378 XAF |
| 3 visuels FLUX 3 | 3 | 87 XAF |
| 5 visuels Seedream 5.0 Flash | 5 | 80 XAF |
| **Total** | **20 crédits = 20 000 XAF** | **≈ 1 185 XAF** |

Marge brute sur ces 20 crédits : **≈ 94 %**. Elle ne paie pas encore : l'IA texte (agents), l'hébergement (Vercel, Supabase, Trigger.dev), PostHog, les e-mails.

## 5. Scénario Starter : 10 crédits pour 5 000 XAF

Un crédit vaut alors **500 XAF**. Même règle : coût réel ≤ 25 % du prix, donc seuil = **125 XAF** par crédit.

| Génération | Coût réel | Crédits | Le client paie | Marge brute |
|---|---|---|---|---|
| Image Marketing Studio, 2K standard | 13 XAF | 1 | 500 XAF | 97,3 % |
| Image Seedream 5.0 Flash | 16 XAF | 1 | 500 XAF | 96,8 % |
| Image Bria Product Shot | 24 XAF | 1 | 500 XAF | 95,2 % |
| Image Nano Banana 2.1, 4K | 80 XAF | 1 | 500 XAF | 83,9 % |
| Image GPT Image 2.5, qualité max | 126 XAF | 2 | 1 000 XAF | 87,4 % |
| Image Marketing Studio, 2K haute qualité | 264 XAF | 3 | 1 500 XAF | 82,4 % |
| Image Marketing Studio, 4K haute | 433 XAF | 4 | 2 000 XAF | 78,3 % |
| Vidéo Veo 3.1 Lite, 5 s 720p | 90 XAF | 1 | 500 XAF | 82 % |
| Vidéo Kling 3.0, 5 s sans son | 252 XAF | 3 | 1 500 XAF | 83,2 % |
| Vidéo Wan 3.0, 5 s 720p | 300 XAF | 3 | 1 500 XAF | 80 % |
| Vidéo Kling 3.0, 5 s avec son | 378 XAF | 4 | 2 000 XAF | 81,1 % |
| Vidéo Seedance 2.5, 5 s 720p | 1 387 XAF | 12 | 6 000 XAF | 76,9 % |
| Vidéo Seedance 2.5, 5 s 1080p | 3 412 XAF | 28 | 14 000 XAF | 75,6 % |

**Pire cas pour EasAds :** le client dépense ses 10 crédits sur la génération la plus chère par crédit. Le coût réel reste plafonné à 10 × 125 = **1 250 XAF**, soit au moins **3 750 XAF** de marge brute par abonné Starter, avant IA texte et hébergement.

**Cas typique :** 10 images standard Marketing Studio = **130 XAF** de coût réel, soit **4 870 XAF** de marge brute.

⚠️ **Point d'expérience utilisateur :** « Générer 3 visuels » consomme **3 crédits**. Avec 10 crédits, un client Starter fait **3 générations de 3 visuels** (9 crédits) et il lui en reste 1. C'est cohérent avec le PRD (Starter = 10 visuels), mais peu pour tester plusieurs modèles. Le prix des recharges de crédits devra être visible et simple.

### 5 bis. Images selon la qualité choisie (Starter, 1 crédit = 500 XAF)

Réglage fixé derrière chaque niveau, et crédits **par image** :

| Modèle | « Standard » = réglage | Coût | Crédits | « Haute qualité » = réglage | Coût | Crédits | Images avec 10 crédits (Std / HQ) |
|---|---|---|---|---|---|---|---|
| Marketing Studio (Higgsfield) | 2K, qualité basse | 13 XAF | **1** | 2K, qualité haute | 264 XAF | **3** | 10 / 3 |
| GPT Image 2.5 Flare (fal) | 1024², moyenne | 8 XAF | **1** | 1024², haute | 32 XAF | **1** | 10 / 10 |
| Nano Banana 2.1 (fal) | 1K | 24 XAF | **1** | 2K | 35 XAF | **1** | 10 / 10 |
| Seedream 5.0 Flash (fal) | réglage unique | 16 XAF | **1** | réglage unique | 16 XAF | **1** | 10 / 10 |
| Seedream 5.0 Pro (fal) | ≤ 1536 px | 41 XAF | **1** | ≤ 2048 px | 81 XAF | **1** | 10 / 10 |
| Grok Imagine 2.0 (Higgsfield) | 1K, basse | 24 XAF | **1** | 2K, moyenne | 48 XAF | **1** | 10 / 10 |
| Soul 2 (Higgsfield) | 720p | 2 XAF | **1** | 1080p | 3 XAF | **1** | 10 / 10 |
| Bria Product Shot (fal) | réglage unique | 24 XAF | **1** | réglage unique | 24 XAF | **1** | 10 / 10 |
| Ideogram V3 (fal) | Turbo | 18 XAF | **1** | Quality | 54 XAF | **1** | 10 / 10 |
| FLUX 3 (fal) | 1K | 29 XAF | **1** | 2K | à mesurer | — | 10 / — |

**Constat :** avec la règle des 25 %, **seul Marketing Studio en haute qualité** coûte plus d'un crédit (3 crédits). Tous les autres modèles coûtent 1 crédit par image, en standard comme en haute qualité.

### 5 ter. Vidéo : gain selon la marge minimale choisie (1 crédit = 500 XAF)

Formule : `crédits = arrondi au-dessus de (coût ÷ seuil)` avec seuil = 500 × (1 − marge minimale).

| Vidéo 5 s | Coût réel | Marge min. 50 % (seuil 250) | Marge min. 60 % (seuil 200) | Marge min. 75 % (seuil 125) |
|---|---|---|---|---|
| Veo 3.1 Lite 720p | 90 XAF | 1 cr · paie 500 · **gain 410** | 1 cr · 500 · **410** | 1 cr · 500 · **410** |
| Kling 3.0 sans son | 252 XAF | 2 cr · 1 000 · **748** | 2 cr · 1 000 · **748** | 3 cr · 1 500 · **1 248** |
| Wan 3.0 720p | 300 XAF | 2 cr · 1 000 · **700** | 2 cr · 1 000 · **700** | 3 cr · 1 500 · **1 200** |
| Kling 3.0 avec son | 378 XAF | 2 cr · 1 000 · **622** | 2 cr · 1 000 · **622** | 4 cr · 2 000 · **1 622** |
| Seedance 2.5 720p | 1 387 XAF | 6 cr · 3 000 · **1 613** | 7 cr · 3 500 · **2 113** | 12 cr · 6 000 · **4 613** |
| Seedance 2.5 1080p | 3 412 XAF | 14 cr · 7 000 · **3 588** | 18 cr · 9 000 · **5 588** | 28 cr · 14 000 · **10 588** |

Plus la marge minimale est haute, plus la vidéo coûte de crédits au client.

## 6. À décider
1. Le prix d'un crédit : **1 000 XAF** (exemple de ce rapport) ou autre.
2. Le seuil de marge : coût réel ≤ **25 %** du prix (marge ≥ 75 %) ou autre.
3. Le nombre de crédits inclus dans chaque formule (Starter, Pro, Business).

Tout se recalcule automatiquement si l'un de ces trois chiffres change.
