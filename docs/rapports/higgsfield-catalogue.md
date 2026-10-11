# Rapport — Catalogue Higgsfield modèle par modèle

> 10 octobre 2026 · Lu sur les pages officielles : 29 modèles d'open.higgsfield.ai/explore + 15 variantes (image vers vidéo, références), soit 44 pages. Pour chaque modèle : documentation complète (`dash.higgsfield.ai/models/<id>/llms.txt` : rôle, paramètres, limites) + phrase de prix de sa page.
> **Prix au tarif normal** (hors promotion). Quand la page n'affiche pas de détail, c'est indiqué « non publié » et on prend le prix « à partir de » de la page Pricing.

## 1. Règle importante : le prix dépend des réglages

Exemple vérifié, **Marketing Studio Image 2.0** (même image, réglages différents) :

| Réglages | Prix normal |
|---|---|
| 1K, qualité basse | 0,0162 $ |
| 2K, qualité basse | 0,0222 $ |
| 2K, qualité haute (capture de la console) | 0,44 $ |
| 4K, qualité haute | 0,7219 $ |

**Entre « 2K basse » et « 2K haute », le prix est multiplié par 20.** Les autres facteurs : résolution, format, nombre d'images par lot (`batch_size`), durée et son pour la vidéo, présence d'une vidéo en entrée.
**Conséquence pour Pubeka :** l'utilisateur ne doit **pas** voir tous les réglages. Pubeka propose 2 ou 3 niveaux simples (« Standard », « Haute qualité »), chacun avec son coût en crédits fixé à partir du prix réel.

## 2. Images

| Modèle (id API) | Rôle documenté | Entrées utiles | Réglages | Prix normal |
|---|---|---|---|---|
| **Marketing Studio Image 2.0 Alpha** (`marketing-studio/image`) | « Generates and edits campaign images from text and image inputs » — catégories `text2image`, `image_edit` | prompt (5 000 car. max) · **jusqu'à 16 images** (`image_urls`) · mode préréglage (`preset_id` + `enhance_prompt` → 1 à 2 images, qualité haute imposée) | qualité low/medium/high · 1K/2K/4K · formats auto, 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9 | 0,0162 $ (1K basse) → 0,7219 $ (4K haute) |
| Marketing Studio Image **2.5 Flare** (`…/image/flare`) | Idem | Idem | qualité **low à max** (5 niveaux) | 0,0126 $ → 0,7219 $ (tableau de la page) |
| Marketing Studio Image **2.5 Sunburst** (`…/image/sunburst`) | Idem | Idem | qualité low à max | 0,0126 $ → 0,7219 $ |
| Product shots (workflow) | « Turn a product photo into campaign-ready hero shots. A Marketing Studio preset steers the composition, lighting and styling » | photo ou lien du produit | préréglages | Mêmes prix que Marketing Studio |
| Graphic ads (workflow) | « Bold graphic ad creatives… layout, typography cues and colour handled by the preset » | photo produit | préréglages | Idem · ⚠️ dessine la typographie |
| Marketplace design (workflow) | « Clean, conversion-ready listing images from a single product photo » | photo produit | préréglages | Idem |
| Ads Studio (workflow) | « From a simple brief to ready-to-use ads » | brief + produit | — | 0,084 $ / image (tableau) |
| **Grok Imagine 2.0** (`xai/grok-imagine-image-2.0`) | `text2image`, `image_edit` | prompt · **jusqu'à 10 images** | qualité low/medium · 1K/2K · 10 formats | 0,04 $ (1K basse) · 0,08 $ (2K moyenne) |
| **Soul 2** (`higgsfield-ai/soul/v2/standard`) | `text2image` | prompt · style · référence perso | **lot de 1 ou 4** · 720p/1080p · 7 formats | 0,0032 $ (720p) · 0,0057 $ (1080p) |
| Soul 2 Image to Image (`…/soul/v2/image-to-image`) | `image_edit` | prompt + **1 image** | idem | 0,0032 $ · 0,0057 $ |
| Soul Standard | `text2image` | prompt · style | lot 1 ou 4 · 720p/1080p | 0,0938 $ · 0,1875 $ |
| Ideogram 4.0 | `text2image`, `image_edit` | prompt · 1 image | 23 formats · vitesse turbo/défaut/qualité | 0,03 $ · ⚠️ spécialiste du texte dans l'image |
| Recraft V4.1 | `text2image` | prompt · **couleurs imposées** · couleur de fond | 1K · 14 formats dont 4:5 | 0,035 $ |
| Qwen Image 3 | `text2image` | prompt · prompt négatif | 1K/2K · 10 formats | 0,04 $ (1K) · 0,075 $ (2K) |
| Z-Image Turbo | `text2image` | prompt | 1K/2K | 0,015 $ |
| AI Influencer | création de personnage | brief · image | — | 0,05 $ (hors sujet Pubeka) |

## 3. Vidéos (V2)

| Modèle (id API) | Modes utiles | Entrées | Réglages | Prix normal |
|---|---|---|---|---|
| **Seedance 2.5** | texte · **image** (`…/image-to-video`) · **références** (`…/reference-to-video`, **jusqu'à 30 images** + vidéos + sons) · édition · prolongation | image de début + image de fin | 480p/720p/1080p · 6 formats · son · 4 à 30 s | **0,2056 $/s (480p) · 0,4622 $/s (720p) · 1,1372 $/s (1080p)** |
| Seedance 2.0 | texte · image · références (jusqu'à 9 images) | image de début et de fin | jusqu'à 4K · son · 4 à 15 s | non publié sur la page · à partir de 0,141 $/s |
| **Kling 3.0 Standard** (`kling-video/v3.0/std/image-to-video`) | texte · image | image de début et de fin · multi-plans | son | **0,084 $/s (clip 1 s) · 0,126 $/s (3 ou 15 s)** |
| Kling 3.0 Pro | texte · image | idem | son | 0,112 $/s (1 s) · 0,168 $/s (3 ou 15 s) |
| Kling 3.0 Turbo | texte · image | image | 720p/1080p | 0,112 $/s (720p) · 0,14 $/s (1080p) |
| Kling O3 image-reference | références | plusieurs images · première et dernière image | std/pro/4K · son | 0,084 $/s |
| **Wan 3.0** | texte · image · références (jusqu'à 10 images) | image de début et de fin | 480p/720p/1080p · son | non publié sur la page · à partir de 0,050 $/s |
| Wan 3.0 Prime | texte · image · références | image | idem | 0,068 $/s (480p) · 0,14 $/s (720p) · 0,28 $/s (1080p) |
| Wan 2.7 | texte · image · références | image · son | 720p/1080p | 0,10 $/s (720p) · 0,15 $/s (1080p) |
| Grok Imagine Video 1.5 | texte · image · références (jusqu'à 7) | image · son | 480p/720p/1080p | 0,08 $/s (480p) · 0,14 $/s (720p) · 0,25 $/s (1080p) |
| LTX-2.5 Fast / Pro | texte | mouvements de caméra | 6/8/10 s · jusqu'à 4K | 0,09 à 0,30 $/s / 0,12 à 0,17 $/s |
| MiniMax H3 | texte | — | 2K | 0,13 $/s |
| HappyHorse 1.0 / 1.1 | image | — | 720p/1080p | 0,14 à 0,28 $/s / 0,14 à 0,18 $/s |
| Genjutsu, Cinema Studio 4.0 | transformation de vidéo, scènes de cinéma | vidéo en entrée | — | 0,318 à 1,632 $/s d'entrée · hors sujet au départ |

## 4. Ce que ça donne pour Pubeka (faits)

| Capacité | Modèles Higgsfield qui la font (documenté) |
|---|---|
| C1 texte → image | Marketing Studio (Alpha, Flare, Sunburst) · Soul 2 · Grok Imagine 2.0 · Z-Image Turbo · Qwen Image 3 · Recraft V4.1 |
| C2 texte + références → image | **Marketing Studio (jusqu'à 16 images)** · Grok Imagine 2.0 (jusqu'à 10) · Soul 2 Image to Image (1 image) · workflows Product shots / Marketplace design |
| C3 modification | Marketing Studio · Grok Imagine 2.0 · Soul 2 Image to Image (tous classés `image_edit`) |
| C4 extension de format | **aucun modèle documenté** |
| C5 image → vidéo | Kling 3.0 Std/Pro/Turbo · Seedance 2.5/2.0 · Wan 3.0/Prime/2.7 · Grok Video · HappyHorse |
| C7 références → vidéo | Seedance 2.5 (30 images) · Seedance 2.0 (9) · Wan 3.0 (10) · Grok Video (7) · Kling O3 |

**Le format 4:5** (format principal des pubs, PRD §7.4) n'est proposé que par Ideogram 4.0 et Recraft V4.1. Marketing Studio, Grok, Soul : 3:4 au plus proche → recadrage par notre code.

## 5. Données manquantes à mesurer pendant les tests
1. Prix exact de chaque combinaison qualité × résolution pour Marketing Studio Flare et Sunburst (endpoint d'estimation).
2. Prix détaillés de Seedance 2.0 et Wan 3.0 (non publiés sur leur page).
3. Durée réelle de génération de chaque modèle.
