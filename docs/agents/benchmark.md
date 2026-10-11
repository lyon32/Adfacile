# Banc de test : choix des modèles (PRD T1, T2, T3)

## Principe
Les spécifications des agents sont fixes. On fait passer **les mêmes cas** à plusieurs modèles, puis on note selon les critères de qualité de chaque agent. On choisit **par agent** le meilleur compromis qualité, coût et vitesse.

## Candidats
| Agents | Modèles à comparer |
|---|---|
| Texte : Analyste, Stratège, Modérateur, Optimiseur, Aide | Claude (Sonnet, Haiku), GPT, Gemini (Pro, Flash), Mistral, Kimi |
| Designer, direction artistique et `VisualSpec` | Claude Sonnet/Opus, GPT, Gemini Pro (vision requise) |
| Génération de scène (image) | Gemini Image, GPT Image, Flux, Ideogram, Seedream, Imagen. Tous testés **sans texte dans l'image** |
| Édition de scène (`scene_edit`) | Les mêmes, en mode édition ou inpainting |
| Détourage du produit | Modèle spécialisé de suppression d'arrière-plan |

## Jeux de test
| Jeu | Contenu | Taille |
|---|---|---|
| `businesses` | Business réels ou réalistes : 15 secteurs, 8 pays, avec site, sans site, PDF, description seule | 50 |
| `trap` | Injections dans le site ou le PDF, informations contradictoires, produits interdits ou restreints | 20 |
| `products` | Photos produit (bonne, moyenne et mauvaise qualité) | 30 |
| `edits` | Instructions de modification (texte, numéro, fond, retrait d'élément) | 30 |
| `stats` | Séries de statistiques de campagnes (gagnante, perdante, fatigue, données insuffisantes) | 20 |
| `help` | Questions d'aide avec états de compte variés | 40 |

## Notation
- **Automatique** : validité du schéma, champs inventés, limites de caractères, OCR de la scène (aucun texte), similarité du produit, pixels inchangés.
- **Humaine** : panel de 3 personnes (dont 1 graphiste), note de 1 à 5 en aveugle, sans savoir quel modèle a produit quoi.
- **Coût** : coût moyen par appel et par campagne complète (Analyste + Stratège + 3 visuels + Modérateur).
- **Latence** : p50 et p95.

## Décision
Pour chaque agent : on élimine les modèles sous les seuils de qualité, puis on prend le **moins cher**, sauf si un modèle plus cher apporte au moins 0,5 point de note humaine. Le coût total par campagne obtenu sert à **fixer les prix des plans** (PRD T8).

## Résultats

### Session 1 (10 oct. 2026) : Gemini, offre gratuite, 18 cas
| Agent | Modèle | Score auto | Remarque |
|---|---|---|---|
| Analyste | gemini-3.1-flash-lite | 90 % | 18/18 JSON valides, 0 invention, injection détectée, conflit de prix détecté. Seul défaut : 2 questions au lieu de 3 minimum dans 6 cas |
| Modérateur | gemini-3.1-flash-lite | 96 % | Tous les produits interdits bloqués, aucun produit autorisé bloqué. 2 sévérités discutables : marque Nike (b01), crème éclaircissante (b06, défendable) |
| Les deux | gemini-3.8-flash, gemma-4-31b | non concluant | Surcharge du service gratuit (503) |
| Les deux | gemini-3.1-pro | non testé | Quota gratuit nul |
| Images | Nano Banana 2 / 2.1 / Pro | non testé | Quota gratuit nul : facturation requise |

À faire : renforcer la règle « 3 questions minimum » dans le prompt de l'Analyste ; relancer gemini-3.8-flash hors des heures de pointe ; ajouter d'autres fournisseurs.

### Session 2 (10 oct. 2026) : prompts v2, 66 cas, gemini-3.1-flash-lite
Changements : Modérateur redéfini (explication après refus Meta) ; Analyste v2 (toujours 3 à 5 questions, marques et cosmétiques non sensibles, drapeau `ILLEGAL_PRODUCT` limité à l'illégal évident) ; ajout du Stratège ; 50 cas pour l'Analyste.

| Agent | Cas | Score auto | Constat |
|---|---|---|---|
| Analyste | 50 | 100 % des contrôles sauf 1 | Toujours 3 ou 4 questions. Illégal signalé uniquement pour le système pyramidal, la contrefaçon et les médicaments sans ordonnance. Aucun faux positif sur 42 commerces normaux (Nike, cosmétiques, transfert d'argent…). 1 écart : système pyramidal étiqueté `crypto` au lieu de `pyramid_scheme` |
| Stratège | 8 | 99 % | Objectifs et destinations corrects, Messenger quand WhatsApp n'est pas lié, pixel repris, budget de 0,5 $ remonté à 1 $, angle changé sur « autre proposition », aucun chiffre inventé. Défauts : texte principal parfois de 1 à 3 caractères au-dessus de 125 ; **vouvoiement au lieu du tutoiement** (pas encore contrôlé automatiquement) |
| Modérateur | 8 | 98 % | v1 : avait inventé une règle (« Meta interdit les produits de marque ») sur les baskets Nike. Après correction du prompt : cause incertaine reconnue et nouvel examen conseillé. Catégories, éléments en cause et produits non corrigeables (vapotage, contrefaçon) corrects |

### Session 3 (10 oct. 2026) : Stratège v3 (ton + longueur) et Designer (direction artistique), 3 modèles Gemini
| Agent | gemini-3.1-flash-lite | gemini-3-flash | gemini-3.5-flash |
|---|---|---|---|
| Stratège (8 cas) | 99 % — 1 « garantis » | **100 %** | **100 %** |
| Designer (6 cas × 3 visuels) | 99 % | 98 % | 97 % (1 erreur 503) |
| Latence p50 Stratège / Designer | **8 s / 5 s** | 10 s / 12 s | 10 s / 15 s |
| Qualité des concepts (lecture humaine) | Corrects mais génériques | **Précis et ancrés localement** (Cocody, terre cuite, lignes orange = livraison 24 h) | **Précis et ancrés localement**, idées fortes (plantains, repas du dimanche) |

- Ton : 100 % de respect de `ad_address` (vous / tu) sur les trois modèles. Longueur : tous ≤ 115 caractères, la relance n'a pas été nécessaire.
- Problème commun : au format 9:16, les 3 modèles placent le bouton d'action dans les 20 % du bas (zone de sécurité Stories). **Décision : les zones de texte sont fixées par le code à partir de `layout_id`**, pas par l'agent.
- gemini-3-flash écrit les codes couleur (#F97316) dans la description de scène, ce qui risque de faire apparaître du texte. À interdire dans le prompt : utiliser des noms de couleur.
- gemini-3.8-flash : quota gratuit épuisé, non testé.
- **Génération d'images (Nano Banana) : toujours non testée, quota gratuit nul.**

Leçon : le modèle reproduit les idées reçues (marques = interdit). Chaque règle Meta sensible doit être **écrite explicitement** dans le prompt, et testée par un cas.
