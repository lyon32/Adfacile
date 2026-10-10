# Rapport — Catalogues fal.ai et BytePlus, modèle par modèle

> 10 octobre 2026 · Uniquement ce qui est écrit sur les pages officielles consultées ce jour.
> **fal :** catalogue officiel `api.fal.ai/v1/models` = **851 modèles** image et vidéo (741 actifs et sous licence commerciale). Sélection lue en détail : la dernière version de chaque grande famille + tous les modèles qui servent nos capacités (détourage, produit en situation, extension de format). Pour chacun : fiche `fal.ai/models/<id>/llms.txt` (rôle, prix, entrées) et, pour les prix au jeton, le tableau de la page du modèle. **44 modèles lus.**
> **BytePlus :** 8 pages ModelArk (liste des modèles et limites, régions, guides Seedream, Seedream 5.0 Pro, édition, Seedance 2.5, vidéo, paramètres) + page Pricing.
> Choix d'affichage validé : **2 niveaux par modèle** (« Standard », « Haute qualité »).

---

## Partie A — fal.ai

### A1. Images : générer (C1) et générer avec références (C2)

| Modèle (id) | Rôle documenté | Références max | Prix |
|---|---|---|---|
| Nano Banana 2.1 (`google/nano-banana-2.1`, `/edit`) | Génération et édition Google, jusqu'à 4K | images (+ vidéo/PDF en contexte) | **1K 0,040 $ · 2K 0,059 $ · 4K 0,134 $** (édition avec 2 images : +0,004 $) |
| Nano Banana 2 Lite (`google/nano-banana-2-lite`, `nano-banana-lite/edit`) | « Sub-2 second latency », génération et édition, 1K fixe | images | au jeton (1K fixe), à mesurer |
| FLUX 3 (`blackforestlabs/flux-3/text-to-image`, `/edit-image`) | « Precise local edits without changing the rest of the image, and combines up to 10 references » | **10** | **1K 0,048 $** (la promo à 0,024 $ s'est terminée le 8 octobre) |
| FLUX.2 pro (`fal-ai/flux-2-pro`, `/edit`) | Qualité maximale, photoréalisme | images | 0,03 $ le 1er mégapixel + 0,015 $ par mégapixel suivant |
| FLUX.1 Kontext (`fal-ai/flux-pro/kontext`, `/multi`) | « Targeted, local edits » à partir de texte et d'images | multi (version expérimentale) | 0,04 $ |
| Seedream 5.0 Flash (`bytedance/seedream/v5/flash/…`) | « Fast image generation and editing… where speed and budget matter » | **10** | **0,027 $** |
| Seedream 5.0 Pro (`bytedance/seedream/v5/pro/…`) | Texte natif en 14 langues ; édition « changes one element while keeping the rest of the frame intact » | **10** | 0,0675 $ (≤ 1536²) · 0,135 $ (jusqu'à 2048²) · +0,0045 $ par image d'entrée en plus |
| GPT Image 2.5 Flare (`openai/gpt-image-2.5/flare/…`) | « Precise image editing that changes only what's asked » | **16** | selon taille × qualité : **1024² : 0,006 $ (low) · 0,013 $ (medium) · 0,053 $ (high) · 0,094 $ (xhigh) · 0,211 $ (max)** |
| GPT Image 2 (`openai/gpt-image-2`, `/edit`) | « Extremely detailed images with fine typography » | **16** | au jeton, même grille de qualité |
| Qwen Image Edit 2511 | Édition | — | 0,03 $ par mégapixel |
| Ideogram V3 (`fal-ai/ideogram/v3`, `/edit`, `/replace-background`) | Affiches, logos, typographie ; remplacement de fond | 10 | 0,03 $ (Turbo) · 0,06 $ (Balanced) · 0,09 $ (Quality) |
| Recraft V3 | Texte long, vectoriel, style de marque | — | 0,04 $ (0,08 $ en vectoriel) |
| Bria FIBO Gen 1.5 | Photoréalisme, typographie, **format 4:5 disponible** | — | 0,04 $ |

**Observation :** « GPT Image 2.5 Flare » chez fal porte le même nom et les mêmes 5 niveaux de qualité (low → max) que « Marketing Studio Image 2.5 Flare / Sunburst » chez Higgsfield. Probablement le même modèle ; **non confirmé par une page officielle**.

### A2. Produit en situation (notre système en deux couches)

| Modèle | Rôle documenté | Prix |
|---|---|---|
| **Bria Product Shot** (`fal-ai/bria/product-shot`) | « Place any product in any scenery with just a prompt or reference image while maintaining high integrity of the product » | 0,04 $ |
| Bria FIBO Edit 1.5 Product Holding | Une personne qui tient le produit (1 à 3 images du produit) | 0,04 $ |
| Bria FIBO Edit 1.5 Edit | Édition multi-références (jusqu'à 4), « commercially safe » | 0,04 $ |
| Pixelcut Product Photo | Détourage de photos produit e-commerce | 0,024 $ |

### A3. Détourage (enlever le fond de la photo produit)

| Modèle | Prix |
|---|---|
| Pixelcut Background Removal | 0,016 $ |
| Bria RMBG 2.0 | 0,018 $ |
| BiRefNet v2 | facturé au temps de calcul (« $0 per compute seconds » affiché) — à mesurer |

### A4. Extension de format (C4) — **trouvée chez fal**

| Modèle | Rôle documenté | Prix |
|---|---|---|
| **Luma Photon Flash Reframe** | « Intelligently expands your visuals » vers un nouveau format | **0,005 $ par mégapixel** |
| FLUX 2 Pro Outpaint | Extension « maximum quality » | 0,03 $ + 0,015 $ par mégapixel suivant |
| Bria Expand | « Expands images beyond their borders », données sous licence | 0,04 $ |
| Ideogram V3 Reframe | Extension d'image | 0,03 à 0,09 $ |

### A5. Vidéo (V2)

| Modèle | Prix par seconde |
|---|---|
| Veo 3.1 Lite (image → vidéo) | **0,03 $ (720p sans son) · 0,05 $ (720p avec son) · 0,08 $ (1080p avec son)** |
| Gemini Omni Flash 1.1 | 0,03 $ (360p) · 0,10 $ (720p) · 0,15 $ (1080p) |
| Wan 3.0 | 0,05 $ (480p) · 0,10 $ (720p) · 0,20 $ (1080p) |
| Seedance 2.0 Mini | 0,072 $ (480p) · 0,155 $ (720p) |
| Kling 3.0 Standard | 0,084 $ (sans son) · 0,126 $ (avec son) |
| Kling 3.0 Pro | 0,112 $ · 0,168 $ |
| FLUX 3 vidéo | 0,17 $ (720p) · 0,29 $ (1080p) |
| Seedance 2.5 (image ou références, jusqu'à 30 images) | 0,22 $ (480p) · 0,47 $ (720p) · 1,16 $ (1080p) |

### A6. Fonctionnement fal (rappel)
- Au-delà de la limite simultanée : **mise en file, jamais de refus**. Limite : 2 au départ, jusqu'à 40 selon les achats de crédits.
- Fichiers générés : au moins 7 jours, **publics par défaut** (accès privé paramétrable).
- Crédits : expirent après 365 jours.

---

## Partie B — BytePlus (ModelArk)

### B1. Images (Seedream)
D'après la liste officielle des modèles : **tous** les Seedream 4.0 / 4.5 / 5.0 lite / 5.0 Flash / 5.0 Pro font **texte → image, image → image et image à partir de plusieurs références**. ✅ **La question C2 est résolue : BytePlus accepte les références.**

| Modèle | Prix / image | Limite |
|---|---|---|
| dola-seedream-5-0-flash | **0,018 $** | 500 images par minute |
| seedream-5-0-lite | 0,035 $ | 500 / min |
| seedream-4-5 | 0,04 $ | 500 / min |
| seedream-4-0 | 0,03 $ | 500 / min |
| dola-seedream-5-0-pro | 0,045 $ (≤ 1,5K) · 0,09 $ (> 1,5K) | 500 / min |
| seededit-3-0 (édition) | 0,03 $ | — |

Règles du guide Seedream : **références + images générées ≤ 15** par requête ; paramètres `size` (ex. « 2K ») et `watermark` (à mettre explicitement à `false`). ⚠️ **L'URL de l'image générée n'est conservée que 24 heures**, puis effacée.

### B2. Vidéo (Seedance)

| Modèle | Ce qu'il fait | Limites (individuel / entreprise) | Prix |
|---|---|---|---|
| dreamina-seedance-2-5 | Texte, 1re image, 1re + dernière image, références multiples, édition, prolongation · 480p/720p/1080p · 4 à 30 s | **3 simultanées / 180 par minute** (individuel) · **10 / 600** (entreprise) | ≈ 0,103 $/s (480p) · 0,231 $/s (720p) · 0,569 $/s (1080p) |
| dreamina-seedance-2-0 | Idem, jusqu'à 4K, 4 à 15 s | 3 / 180 · 10 / 600 (4K : 1 simultanée) | ≈ 0,067 $/s (480p) · 0,151 $/s (720p) |
| dreamina-seedance-2-0-mini | Idem, 480p/720p, 4 à 15 s | 3 / 180 · 10 / 600 | ≈ 0,034 $/s (480p) · 0,076 $/s (720p) |

(Prix calculés avec la formule officielle : durée × largeur × hauteur × 24 / 1024 jetons × prix au million de jetons, sans vidéo en entrée.)
Forfaits Seedance 2.5 : 32 $ / 64 $ / 640 $, valables 3 mois, **non remboursables**. Suivi d'une tâche vidéo : 7 jours.

### B3. Régions et données
- Deux régions : **Asie-Pacifique (Singapour)** et **Europe (Autriche)**.
- En Europe, seuls **seed-2-0-lite** et **seedream-5-0-lite** sont disponibles (plus l'API d'images). **Seedance et Seedream Flash/Pro ne tournent qu'en Asie-Pacifique.**
- Les requêtes peuvent être déplacées d'une région à l'autre selon la charge.

### B4. Limites constatées
- Vidéo **limitée à 3 générations simultanées** pour un compte individuel (10 en entreprise). C'est 7 fois moins que Higgsfield (20).
- Page « Obtain and configure an API key » en erreur serveur le 10/10/2026.

---

## Partie C — Conclusion par capacité (les 3 fournisseurs)

| Capacité | Options vérifiées, de la moins chère à la plus chère (prix standard) |
|---|---|
| C1 texte → image | Soul 2 (Higgsfield, 0,003 $) · Seedream 5.0 Flash (BytePlus 0,018 $ / fal 0,027 $) · Marketing Studio basse qualité (Higgsfield 0,016–0,022 $) · Nano Banana 2.1 (fal, 0,040 $) · FLUX 3 (fal, 0,048 $) |
| C2 texte + références → image | Seedream 5.0 Flash (BytePlus 0,018 $, 14 réf. max) · Marketing Studio (Higgsfield, 16 réf.) · GPT Image 2.5 Flare (fal, 16 réf.) · FLUX 3 (fal, 10 réf.) · Nano Banana 2.1 edit (fal) |
| Produit en situation | Bria Product Shot (fal, 0,04 $) · Product shots (Higgsfield) · Marketing Studio |
| C3 modification | SeedEdit 3.0 (BytePlus 0,03 $) · FLUX.1 Kontext (fal 0,04 $) · Grok Imagine 2.0 (Higgsfield 0,04 $) · FLUX 3 edit (fal 0,048 $) · Seedream 5.0 Pro edit (fal) · GPT Image 2.5 Flare edit (fal) |
| C4 extension de format | **Luma Photon Flash Reframe (fal, 0,005 $/MP)** · FLUX 2 Pro Outpaint (fal) · Bria Expand (fal) — **seul fal le propose** |
| Détourage | Pixelcut (fal, 0,016 $) · Bria RMBG 2.0 (fal, 0,018 $) |
| C5 image → vidéo | Veo 3.1 Lite (fal, dès 0,03 $/s) · Seedance 2.0 Mini (BytePlus ≈ 0,034 $/s) · Wan 3.0 (fal 0,05 $/s) · Kling 3.0 Std (Higgsfield/fal 0,084 $/s) |
| C7 références → vidéo | Seedance 2.5 (BytePlus ≈ 0,10 $/s en 480p ; jusqu'à 50 réf.) · Seedance 2.5 (fal/Higgsfield ≈ 0,21–0,22 $/s) |

**Ce que ces faits imposent à l'architecture :**
1. **fal devient indispensable**, même au lancement : c'est le seul fournisseur qui propose l'extension de format (C4) et le détourage. Il reste aussi le secours qui ne refuse jamais.
2. **BytePlus garde ses images seulement 24 heures** (Higgsfield et fal : 7 jours) : copie dans notre stockage **immédiatement** après génération.
3. **BytePlus en vidéo = 3 générations simultanées** en compte individuel. Insuffisant pour plusieurs clients en même temps sans compte entreprise.
4. Les prix « à partir de » trompent : ce sont les **réglages** (qualité, taille, son, durée) qui font le prix. Chaque niveau « Standard » / « Haute qualité » aura un réglage fixe et un coût en crédits fixe.
