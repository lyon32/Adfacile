# Capacités médias : qui fait quoi

> 10 octobre 2026 · Décisions validées : aiguilleur avec table de routage dans l'administration (Q76), 2 fournisseurs d'images au lancement + le 3e avec la vidéo (Q77), budget 15 $/mois par fournisseur (Q78), bascule après 60 s d'attente (Q79).
> **Règle : aucun modèle n'est attribué à une capacité sans test réussi.** Colonne « Candidats » = support **documenté** sur la page officielle. Colonne « Retenu » = rempli **uniquement après test**.

## 1. Les capacités

| # | Capacité | Entrée | Sortie | Utilisée par |
|---|---|---|---|---|
| C1 | `image.from_text` | Texte seul (description de la scène) | Image | Designer, quand l'utilisateur n'a **ni photo ni référence** |
| C2 | `image.from_text_and_reference` | Texte + **photo produit** et/ou **images de référence** | Image | Designer, cas le plus fréquent (photo produit, réf. de l'utilisateur, visuel choisi « similaire à B ») |
| C3 | `image.edit` | Image existante + instruction (« change seulement le fond ») | Image modifiée | Designer, mode `edit` de type `scene_edit` |
| C4 | `image.extend` | Image + nouveau format (4:5 → 9:16) | Image élargie | Designer, seulement si la scène manque de place pour le nouveau format |
| C5 | `video.from_image` | Visuel choisi + texte du mouvement | Vidéo | Vidéaste (V2) |
| C6 | `video.from_text` | Texte seul | Vidéo | Vidéaste (V2) |
| C7 | `video.from_references` | Plusieurs images, vidéos, sons + texte | Vidéo | Vidéaste (V2) |

**Ce qui ne passe par aucun modèle (fait par notre code, 0 $) :** titre, prix, numéro, logo, bouton (calques) ; changement de texte ou de numéro (`layer_edit`) ; passage d'un format à l'autre quand la scène a assez de place.

## 2. Candidats documentés par capacité

| Capacité | Higgsfield | BytePlus | fal.ai |
|---|---|---|---|
| C1 texte → image | Marketing Studio Image (« text and image inputs ») · Soul 2 · Soul Standard | Seedream 5.0 flash / lite / pro · Seedream 4.0 / 4.5 | Nano Banana 2 · FLUX.2 pro · Seedream 4.0 |
| C2 texte + référence → image | **Marketing Studio Image** (« uses a product photo and an optional model reference ») · **Product shots** (photo produit + préréglages) | ✅ tous les Seedream 4.0 à 5.0 : « Multi-reference image-to-image » (références + sorties ≤ 15) | Nano Banana 2 edit (entrée image) · Seedream 4.0 edit |
| C3 modification | Marketing Studio Image (« generates and edits ») · Grok Imagine 2.0 (« precise edits while preserving image details ») | SeedEdit 3.0 | FLUX.1 Kontext · Nano Banana 2 edit · Seedream 4.0 edit |
| C4 extension de format | ❌ aucun modèle | ❌ aucun modèle | ✅ Luma Photon Flash Reframe (0,005 $/MP) · FLUX 2 Pro Outpaint · Bria Expand · Ideogram V3 Reframe |
| C5 image → vidéo | Kling 3.0 · Wan 3.0 · Seedance 2.0/2.5 | Seedance 2.5 · 2.0 · 2.0 mini | Kling 3 pro · Seedance 2.5 / 2.0 |
| C6 texte → vidéo | Kling 3.0 · Wan 3.0 · Seedance | Seedance 2.5 · 2.0 | Kling 3 pro · Veo 3.1 · Seedance |
| C7 références → vidéo | Seedance 2.5 · Genjutsu (transfert de mouvement) | Seedance 2.5 (jusqu'à 50 références) | Seedance 2.5 / 2.0 reference-to-video |

Exclus d'office : *Graphic ads* et *Ideogram 4.0* pour le texte (ils dessinent le texte dans l'image, contraire à la règle des deux couches).

Détail complet : [../rapports/higgsfield-catalogue.md](../rapports/higgsfield-catalogue.md) et [../rapports/fal-byteplus-catalogue.md](../rapports/fal-byteplus-catalogue.md).

## 3. Protocole de décision (un test à la fois)

| Ordre | Test | Candidats | Critère pour être retenu |
|---|---|---|---|
| 1 | C2 sur 6 cas avec photo produit | Marketing Studio · Product shots · Nano Banana 2 edit · Seedream (si C2 confirmé) | Produit intact 100 % · aucun texte dans l'image · note panel ≥ 4/5 sur ≥ 60 % |
| 2 | C1 sur 6 cas sans photo | Marketing Studio · Seedream 5.0 flash · Nano Banana 2 | Mêmes critères (hors produit intact) |
| 3 | C3 sur 30 modifications | Marketing Studio · Grok Imagine 2.0 · FLUX Kontext · Nano Banana 2 edit · SeedEdit 3.0 | **0 élément non demandé modifié**, sinon la fonction est retirée (PRD T3) |
| 4 | C4 | À identifier d'abord | Bords invisibles, produit intact |
| 5 | C5 à C7 (après les images) | Seedance 2.5 · Kling 3.0 · Wan 3.0 | Note panel, coût par seconde, durée de génération |

Pour chaque test : coût réel (endpoint d'estimation), temps de génération, taux d'échec. **Le meilleur devient « principal », le deuxième « secours »** (s'il atteint les mêmes seuils), et la table ci-dessous est remplie.

## 4. Table de routage (à remplir après les tests)

| Capacité | Principal | Secours | Statut |
|---|---|---|---|
| C1 | — | — | À tester |
| C2 | — | — | À tester |
| C3 | — | — | À tester |
| C4 | — | — | À tester (candidats fal identifiés) |
| C5 à C7 | — | — | Après les images |

Limite Higgsfield confirmée (ticket #318114) : **20 requêtes simultanées par clé API** en standard ; hausse via *Contact Sales* après les tests. À demander : deux clés donnent-elles 40 ?

Règles de l'aiguilleur : bascule vers le secours si panne, attente > 60 s, solde bas ou budget mensuel de 15 $ atteint chez le principal. Un fournisseur non testé n'est **jamais** utilisé en secours.
