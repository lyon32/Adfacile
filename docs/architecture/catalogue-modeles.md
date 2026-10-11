# Catalogue de modèles : l'utilisateur choisit

> 10 octobre 2026 · Remplace l'idée d'un modèle imposé. L'utilisateur choisit le modèle qui correspond à ce qu'il veut créer ; Pubeka explique chaque modèle en langage simple.
> Bénéfice direct : la charge se répartit entre Higgsfield, BytePlus et fal, au lieu de saturer un seul fournisseur.

## 1. Principe

1. Pour chaque **capacité** (texte → image, texte + référence → image, modification, vidéo), Pubeka propose **une courte liste de modèles** : 3 à 4 maximum, pour ne pas noyer un débutant.
2. **Un modèle est présélectionné** (« Recommandé pour ton cas ») selon ce que l'utilisateur crée. Il peut générer directement, ce qui garde la promesse « en quelques clics », ou **changer de modèle**.
3. Chaque modèle a une **fiche simple** : à quoi il sert, son point fort, sa limite, son coût en crédits, sa vitesse.
4. Aucun modèle « meilleur que les autres » : chacun est **le bon choix pour un usage précis**.
5. **Seuls les modèles qui ont réussi nos tests** apparaissent. Les autres restent invisibles (statut « en test » dans l'administration).

## 2. Ce que voit l'utilisateur

```
Créer un visuel
  Que veux-tu créer ?  [ Photo de mon produit en situation ▾ ]
  ┌───────────────────────────────────────────────────────────┐
  │ ★ Recommandé  Marketing Studio · Higgsfield                │
  │   Pour : images de campagne à partir de ta photo produit   │
  │   + Jusqu'à 16 images de référence    − Plus lent          │
  │   Coût : 4 crédits · ~40 s                    [Choisir]    │
  ├───────────────────────────────────────────────────────────┤
  │   Seedream 5.0 flash · BytePlus                            │
  │   Pour : images rapides et économiques                     │
  │   Coût : 1 crédit · ~15 s                     [Choisir]    │
  └───────────────────────────────────────────────────────────┘
                                         [ Générer 3 visuels ]
```

Les chiffres de coût et de durée ci-dessus sont des **exemples d'affichage**, pas des mesures.

## 3. Les quotas passent en crédits

Les modèles n'ont pas le même coût (Seedream 5.0 flash : 0,018 $ ; Marketing Studio 2.0 en 2K qualité haute : 0,374 $ affiché, 0,44 $ barré, soit 20 fois plus). Un quota « 10 visuels » ne peut donc pas valoir pareil pour tous les modèles.

- Chaque formule donne un **nombre de crédits par mois**.
- Chaque modèle coûte **un nombre de crédits** proportionnel à son coût réel (mesuré pendant les tests), affiché avant de générer.
- Les crédits achetés en plus fonctionnent de la même façon (déjà prévu au PRD : ils n'expirent jamais).

## 4. Shortlist de départ (à confirmer par les tests)

Descriptions reprises **uniquement** des pages officielles des fournisseurs (catalogues consultés le 10/10/2026).

### C1 — Texte → image (pas de photo)


| Modèle                | Fournisseur | Ce que dit la page officielle                                                                              |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Marketing Studio Image | Higgsfield  | « Generates and edits campaign images from text and image inputs, with resolutions from 1K to 4K »       |
| Seedream 5.0 flash     | BytePlus    | Modèle d'image ByteDance, 0,018 $ / image (le moins cher de la gamme Seedream 5.0)                        |
| Nano Banana 2          | fal         | « Google's fast image generation and editing model »                                                     |
| Soul 2                 | Higgsfield  | « Generates realistic portraits and fashion images, with natural textures and curated editorial styles » |

### C2 — Texte + photo / références → image


| Modèle                            | Fournisseur | Ce que dit la page officielle                                                                                             |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Marketing Studio Image             | Higgsfield  | « Preset mode uses a product photo and an optional model reference » ; interface :**jusqu'à 16 images** de référence |
| Product shots                      | Higgsfield  | « Turns product photos into campaign images with presets for composition, lighting and visual style »                   |
| Nano Banana 2 edit                 | fal         | Génération et modification à partir d'images en entrée                                                                |
| Seedream (édition / références) | BytePlus    | ❓ support des références à vérifier (doc API indisponible le 10/10)                                                  |

### C3 — Modifier une image (« change seulement le fond »)


| Modèle                | Fournisseur | Ce que dit la page officielle                                                   |
| ---------------------- | ----------- | ------------------------------------------------------------------------------- |
| Grok Imagine 2.0       | Higgsfield  | « Makes precise edits while preserving image details and visual consistency » |
| FLUX.1 Kontext         | fal         | « Instruction-based editing of an existing image »                            |
| SeedEdit 3.0           | BytePlus    | Modèle d'édition image → image                                               |
| Marketing Studio Image | Higgsfield  | « Generates and edits campaign images »                                       |

### C5 à C7 — Vidéo (V2)


| Modèle      | Fournisseur                 | Ce que dit la page officielle                                                                           |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Kling 3.0    | Higgsfield / fal            | « Generates multi-shot videos from text or images, with native audio and durations up to 15 seconds » |
| Seedance 2.5 | BytePlus / fal / Higgsfield | Vidéos de 4 à 30 s, 480p à 1080p, jusqu'à 50 références (BytePlus)                                |
| Wan 3.0      | Higgsfield                  | « Generates videos from text or images with native audio and adjustable duration up to 30 seconds »   |

**Règle d'affichage :** les points forts et limites présentés à l'utilisateur seront réécrits en français simple **à partir des résultats du marketing des fournisseurs.

## 5. Ce que gère l'administration

Table `media_models` (une ligne par modèle) :

- fournisseur, identifiant technique, capacités, usages recommandés ;
- fiche utilisateur FR/EN (pour, point fort, limite) ;
- coût réel mesuré ($), coût en crédits, durée moyenne, résolutions, nombre max de références ;
- statut : `en_test` · `actif` · `désactivé` · `recommandé` pour un usage ;
- ordre d'affichage.

Changer la liste, le modèle recommandé ou le coût en crédits **ne demande aucun redéploiement**.

## 6. Pannes et attente

- L'utilisateur choisit un modèle. Si ce modèle est en panne ou si l'attente dépasse 60 s, Pubeka **propose** (ne force pas) un modèle équivalent : « Marketing Studio est surchargé. Utiliser Seedream 5.0 flash (1 crédit) ? »
- Budget de 15 $/mois par fournisseur atteint → ses modèles passent en « indisponible » jusqu'à la recharge, avec une alerte e-mail à l'administrateur.
