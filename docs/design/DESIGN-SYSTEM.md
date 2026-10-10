# EasAds — Design system v2

> v1 : [easads-direction-artistique-v1.html](easads-direction-artistique-v1.html) (logo, palette, typo Sora, tokens).
> v2 : la v1 **sans changement de palette**, enrichie avec les règles de mise en page, les composants et les écrans tirés des références ([references/](references/)).
> Démonstration visuelle : [easads-design-system.html](easads-design-system.html).

---

## 1. Ce qu'on retient des références

| Réf. | Ce qu'on prend | Où dans EasAds |
|---|---|---|
| 01 Manila, 06 Nicepay, 09 Uixshuvo | Titre géant avec **un seul mot en accent** ; pastille d'annonce ; champ unique + bouton dans le hero ; bandeau de logos ; capture du produit sous le hero ; **grille bento** dont chaque carte contient une vraie mini-interface | Page d'accueil |
| 02 « One Task » | Hero sombre avec un **halo** à l'horizon ; 3 cartes d'arguments sobres sur fond noir | Hero de la page d'accueil (thème sombre) |
| 07 Guardbase | **Sur-titres** en capitales précédés d'un carré de couleur ; lignes de grille fines avec repères « + » ; liste de problèmes numérotée (c'est une vraie liste de problèmes) | Section « Le problème » de la page d'accueil |
| 08 Saasify | Tarifs en 3 colonnes, **la formule recommandée en sombre** au centre ; statistiques en tuiles décalées | Page Tarifs |
| 03, 04, 05 Kiska, réglages | **Double navigation** (barre latérale + sous-menu des réglages) ; champs **à étiquette encastrée** dans la bordure ; lignes de réglage « icône + titre + description + interrupteur » ; même écran en clair et en sombre | Réglages, Kit de marque, Facturation |
| 11 Modulix, 12 Spark Pixel, 13 Lunor | Fond gris chaud + panneaux clairs ; barre latérale avec **sélecteur d'espace en haut** (= business), sections titrées, **carte utilisateur en bas**, carte « Passer à Pro » ; fil d'Ariane ; « Bonjour, Prénom » ; **cartes chiffres** avec mini-graphique et variation ; graphique **monochrome hachuré avec une seule barre en couleur** ; chiffres en chasse fixe | Tableau de bord, Statistiques |
| 14 Testora (mobile) | Écran mobile en **cartes empilées** ; grand bouton d'action pleine largeur ; tuiles chiffres par deux ; carte d'accent pleine couleur pour l'action principale | Version mobile de l'application web |
| 10 Cardily | **Contre-exemple** : rendu IA générique (textes illisibles, dégradés gratuits, illustrations 3D sans rapport). À ne jamais produire | — |

**Positionnement (PRD §1)** : EasAds crée des pubs sur **toutes** les plateformes. Aucune plateforme n'est mise en avant : Meta Ads, Google Ads et TikTok Ads apparaissent au même niveau (pastilles « Disponible » / « Bientôt »). On n'écrit jamais « ta pub Facebook » : on écrit « ta pub », « tes pubs en ligne ». La v1 portait le slogan « La pub Facebook, sans prise de tête » : il est remplacé.

**Ce qu'on refuse explicitement** : dégradés violets, illustrations 3D décoratives, avatars de stock, faux logos clients, chiffres inventés (« 10 000+ clients »), icônes dans des cercles colorés sur chaque carte.

---

## 2. Palette (inchangée) et rôles

| Nom | Hex | Rôle |
|---|---|---|
| Obsidienne | `#0A0A0A` | Fond sombre, texte sur Lime, formule recommandée |
| Graphite | `#1F2421` | Surfaces sombres, barre latérale sombre |
| Lime | `#C6F432` | **Action principale**, logo, barre mise en avant d'un graphique, état actif |
| Lime foncé | `#8DB01C` | Survol du bouton principal, point « succès » |
| Ardoise | `#8A9088` | Texte secondaire, icônes, axes de graphique |
| Craie | `#F4F4EF` | Fond clair de l'application, texte sur sombre |

### 2.1 Nuances dérivées (même famille, pas de nouvelle couleur)
Nécessaires pour les bordures et les surfaces que les références utilisent. Ce sont des mélanges des couleurs de la palette.

| Token | Hex | Usage |
|---|---|---|
| `craie-50` | `#FBFBF8` | Panneaux et cartes sur fond Craie |
| `craie-200` | `#E8E8E1` | Bordures en thème clair, pistes de barres de progression |
| `craie-300` | `#D6D7CF` | Bordures de champs en thème clair |
| `graphite-700` | `#2A302B` | Bordures en thème sombre (déjà dans la v1) |
| `graphite-600` | `#3A4038` | Bordures de champs en thème sombre (déjà dans la v1) |
| `ardoise-700` | `#5C625B` | Texte secondaire **en thème clair** (l'Ardoise seule n'a pas assez de contraste sur Craie : 3,0:1) |

### 2.2 États (ajout minimal, à valider)
La palette n'a pas de rouge ni d'orange : impossible d'afficher « Pub refusée » ou « Paiement échoué » sans eux. Proposition limitée à deux teintes, toujours accompagnées d'une icône et d'un mot (jamais la couleur seule) :

| État | Clair | Sombre |
|---|---|---|
| Succès / actif | point `#8DB01C` + texte Obsidienne | point `#C6F432` |
| Attention (vérification Meta, quota bas) | `#8A5A0F` | `#F2B53A` |
| Erreur (refus, paiement échoué) | `#C2410C` | `#FF8A73` (déjà utilisé dans la v1) |

### 2.3 Règles d'usage
- **Lime = une seule action par écran.** Bouton principal, élément actif du menu, barre mise en avant du graphique. Jamais en texte sur fond clair (contraste ≈ 1,1:1) : sur Craie, la Lime est **un fond** avec du texte Obsidienne.
- Ratio v1 conservé pour le marketing sombre : 70 % Obsidienne/Graphite, 20 % Craie, 10 % Lime.
- **Application** : thème **clair par défaut** (comme les références 11-13, meilleure lisibilité sur téléphone en plein soleil), thème sombre disponible (réf. 03).

---

## 3. Typographie

Une seule famille : **Sora** (v1). Ajouts v2 :

| Rôle | Taille / graisse | Détail |
|---|---|---|
| Hero marketing | 72–96 / 800, interlettrage −3 % | Un seul mot en Lime (sombre) ou sur pastille Lime (clair) |
| Sur-titre | 12 / 700, capitales, interlettrage +12 % | Précédé d'un carré Lime 8 px (réf. 07) |
| Chiffre clé | 32–40 / 700, `font-variant-numeric: tabular-nums` | Les chiffres ne « dansent » pas quand ils changent |
| Libellé de chiffre | 12 / 600, capitales, Ardoise | « DÉPENSÉ CE MOIS » |
| Montant secondaire | 13 / 400, Ardoise | « ≈ 18,20 $ » sous un montant FCFA |

Montants : **FCFA en grand, dollars en petit dessous**. Séparateur de milliers : espace fine (`5 000 FCFA`).

---

## 4. Espacements, rayons, ombres

- Grille 4 px (v1). Gouttière mobile : **16 px**. Panneaux : 24 px de marge intérieure (16 px sur mobile).
- Rayons v1 : `sm 6` (badges carrés), `md 12` (boutons, champs), `lg 20` (cartes), `app 28` (cadre de l'application, cartes mobiles), `pill 999` (pastilles, interrupteurs).
- **Ombres** : quasi absentes. Les références séparent par **bordures 1 px + différence de fond**, pas par ombres. Une seule ombre autorisée pour ce qui flotte (menus, modales) : `0 12px 32px rgba(10,10,10,.12)`.

---

## 5. Composants

| Composant | Spécification |
|---|---|
| **Bouton principal** | Fond Lime, texte Obsidienne 16/700, hauteur 48 (44 mobile), rayon 12. Survol Lime foncé. Un seul par écran |
| Bouton secondaire | Fond Obsidienne (clair) / Craie (sombre), texte inversé |
| Bouton discret | Transparent, bordure `craie-300` / `graphite-600` |
| **Champ** | Bordure 1 px, rayon 12, hauteur 48. **Étiquette encastrée** dans la bordure en haut à gauche (réf. 04). Focus : bordure 2 px Obsidienne (clair) / Lime (sombre). Aide sous le champ en 13/400 |
| Champ montant | Unité affichée à droite (« FCFA »), conversion en $ dessous, mise à jour en direct |
| **Ligne de réglage** | Icône 20 px Ardoise · titre 15/600 · description 13 Ardoise · interrupteur à droite (réf. 05) |
| Interrupteur | Pilule 40×24 ; activé = fond Obsidienne (clair) / Lime (sombre) |
| **Pastille d'état** | Point 8 px + mot. « En diffusion », « Vérification Meta », « Refusée », « En pause », « Brouillon », « Terminée » |
| **Carte chiffre** | Libellé en capitales · chiffre tabulaire · mini-graphique à barres fines (une seule barre foncée = aujourd'hui) · variation « +12 % vs mois dernier » |
| **Graphique** | Barres hachurées Ardoise, **barre sélectionnée en Lime** avec info-bulle Obsidienne (réf. 11). Pas de dégradé, pas de 3D |
| Tableau | En-tête 12/600 capitales sur fond `craie-200`, lignes 56 px, séparateurs 1 px, état en pastille |
| **Barre latérale** | Sélecteur de business en haut (nom + Page Facebook), sections titrées, élément actif = fond panneau + bordure ; carte « Passer à Pro » ; carte utilisateur en bas (réf. 11-13) |
| **Bandeau budget** (PRD §10.1) | 3 informations max : Campagnes actives · Dépensé ce mois · Quota restant |
| Carte proposition IA | Bloc empilé à deux étages, rappel du logo : étage Graphite = ce que l'IA propose, étage Lime = l'action « Publier » |
| Carte « Passer à Pro » | Fond Obsidienne, texte Craie, bouton Lime (réf. 13) |
| État vide | Phrase qui dit quoi faire + bouton. « Aucune campagne. Colle le lien de ton site pour en créer une. » |
| Notification | Fond Obsidienne, texte Craie, icône d'état, disparaît après 5 s |

---

## 6. Signature EasAds : le bloc empilé

Le logo empile deux blocs : **EAS** (Graphite) sur **ADS** (Lime). On réutilise cette forme, et seulement elle, comme élément mémorable :
- la **carte de proposition de campagne** : étage du haut = la proposition de l'IA, étage du bas en Lime = « Publier » ;
- les **cartes chiffres importantes** : chiffre en haut, action en bas ;
- l'**icône d'application** (v1).

Tout le reste est sobre : bordures fines, beaucoup d'espace, pas de décoration.

---

## 7. Gabarits d'écrans

```
APPLICATION (bureau)                               APPLICATION (mobile)
┌────────────┬───────────────────────────────┐     ┌──────────────────┐
│ [Business ▾]│ Tableau de bord / Vue        🔍│     │ ≡  EasAds    🔔 ◯│
│            │                                │     │ Bonjour Awa      │
│ MENU       │ Bonjour Awa                    │     │ [+ Nouvelle pub] │
│ ▣ Accueil  │ ┌──────┬──────┬──────┐         │     │ ┌──────┬──────┐  │
│ ▢ Campagnes│ │ACTIVE│DÉPENSÉ│QUOTA │ bandeau │     │ │ 2    │45 000│  │
│ ▢ Visuels  │ └──────┴──────┴──────┘         │     │ └──────┴──────┘  │
│ ▢ Stats    │ ┌──────────────┐┌──────────┐   │     │ ┌──────────────┐ │
│            │ │ graphique    ││ proposit.│   │     │ │ campagne     │ │
│ COMPTE     │ │ hachuré      ││ IA       │   │     │ └──────────────┘ │
│ ▢ Réglages │ └──────────────┘└──────────┘   │     │ ┌──────────────┐ │
│ [Pro card] │ ┌───────────────────────────┐  │     │ │ campagne     │ │
│ [Awa  ⇥]   │ │ tableau des campagnes     │  │     │ └──────────────┘ │
└────────────┴───────────────────────────────┘     └──────────────────┘
```

| Écran | Gabarit | Références |
|---|---|---|
| Accueil marketing | Hero sombre avec halo Lime à l'horizon ; titre géant multi-plateforme ; rangée de pastilles Meta Ads · Google Ads · TikTok Ads ; **le champ « Colle le lien de ton site » est l'action du hero** ; capture du produit ; grille bento ; problème en liste ; tarifs | 01, 02, 06, 07, 08 |
| Tableau de bord | Coquille ci-dessus | 11, 12, 13 |
| Créer une campagne | Une colonne centrée (max 640 px) : sources → questions → proposition (bloc empilé) → aperçu Facebook/Instagram à droite sur grand écran | 05 |
| Atelier visuels | Grille de visuels 4:5, sélection = bordure Lime 2 px, barre de modification en bas | 09 |
| Statistiques | Cartes chiffres + graphique hachuré + tableau | 11, 12 |
| Réglages | Double navigation, lignes de réglage, champs à étiquette encastrée | 03, 04, 05 |
| Mobile | Cartes empilées, bouton d'action pleine largeur, barre d'onglets en bas | 14 |

---

## 8. Accessibilité et qualité
- Contraste texte ≥ 4,5:1 (d'où `ardoise-700` en clair).
- Focus clavier visible : anneau 2 px Obsidienne (clair) / Lime (sombre), décalé de 2 px.
- Cibles tactiles ≥ 44 px. Aucune information portée par la couleur seule.
- `prefers-reduced-motion` : aucune animation sauf les changements d'état.
- Mobile à partir de 360 px, gouttière 16 px, pas de défilement horizontal.

---

## 9. Tokens (code)

```css
:root {
  /* v1, inchangés */
  --easads-obsidienne: #0A0A0A; --easads-graphite: #1F2421;
  --easads-lime: #C6F432; --easads-lime-fonce: #8DB01C;
  --easads-ardoise: #8A9088; --easads-craie: #F4F4EF;
  --easads-font: "Sora", system-ui, sans-serif;
  --easads-radius-sm: 6px; --easads-radius-md: 12px; --easads-radius-lg: 20px;
  --easads-radius-app: 28px; --easads-radius-pill: 999px; --easads-space: 4px;
  /* v2, nuances dérivées et états */
  --easads-craie-50: #FBFBF8; --easads-craie-200: #E8E8E1; --easads-craie-300: #D6D7CF;
  --easads-graphite-700: #2A302B; --easads-graphite-600: #3A4038; --easads-ardoise-700: #5C625B;
  --easads-warn: #8A5A0F; --easads-error: #C2410C;
  --easads-shadow-float: 0 12px 32px rgba(10,10,10,.12);
}
/* Rôles sémantiques : thème clair (application par défaut) */
:root, [data-theme="light"] {
  --bg: var(--easads-craie); --panel: var(--easads-craie-50); --line: var(--easads-craie-200);
  --field-line: var(--easads-craie-300); --text: var(--easads-obsidienne); --muted: var(--easads-ardoise-700);
  --accent: var(--easads-lime); --on-accent: var(--easads-obsidienne); --focus: var(--easads-obsidienne);
}
[data-theme="dark"] {
  --bg: var(--easads-obsidienne); --panel: var(--easads-graphite); --line: var(--easads-graphite-700);
  --field-line: var(--easads-graphite-600); --text: var(--easads-craie); --muted: var(--easads-ardoise);
  --accent: var(--easads-lime); --on-accent: var(--easads-obsidienne); --focus: var(--easads-lime);
  --easads-warn: #F2B53A; --easads-error: #FF8A73;
}
```

## 10. Décisions à valider
1. **Application en thème clair par défaut**, thème sombre en option (les références d'application sont claires ; la v1 était entièrement sombre).
2. **Deux couleurs d'état** ajoutées (attention, erreur), uniquement pour les statuts.
3. **`ardoise-700`** pour le texte secondaire en thème clair (contraste).
