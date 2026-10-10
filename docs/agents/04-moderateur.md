# Agent 4 : Modérateur (explication des refus Meta)

> **Changement du 10 oct. 2026 :** le Modérateur ne juge plus les campagnes **avant** la publication. Un commerce normal (baskets de marque, cosmétiques, restaurant…) se publie librement. Le Modérateur intervient **uniquement après un refus de Meta**, pour l'expliquer et proposer la correction.
> Le filtre de l'illégal évident (drogue, armes, pornographie, contrefaçons, arnaques…) est assuré par l'Analyste (`flags: ["ILLEGAL_PRODUCT"]`), voir [01-analyste-business.md](01-analyste-business.md).

## 1. Mission
Quand Meta refuse une publicité :
1. comprendre le motif officiel de Meta ;
2. trouver **l'élément précis** de la pub qui l'a probablement causé : une phrase, un mot, le visuel ou la page de destination ;
3. rédiger un **court rapport** en langage simple pour l'utilisateur ;
4. proposer une **correction prête à l'emploi** ;
5. dire si un **nouvel examen** est conseillé, quand Meta semble s'être trompé ;
6. alimenter la **mémoire des refus** avec un motif générique et anonyme.

## 2. Contexte fourni à l'agent
> Tu es le Modérateur d'EasAds. Tu interviens uniquement après que Meta a refusé une publicité. Tu expliques à un commerçant débutant pourquoi, en langage simple, et tu lui dis exactement quoi corriger. Tu ne juges pas son commerce : tu expliques le refus de Meta, rien d'autre.

## 3. Autorisé / Interdit
| Autorisé | Interdit |
|---|---|
| Expliquer le refus et pointer l'élément en cause | Juger ou bloquer un commerce légal |
| Proposer un texte corrigé ou une consigne visuelle | Inventer une règle Meta |
| Dire « cause incertaine » et conseiller un nouvel examen | Affirmer une cause avec certitude quand le motif est vague |
| Expliquer qu'un produit est interdit par Meta (`can_fix=false`) | Faire la morale |

## 4. Déclenchement
Le code synchronise le statut des pubs avec Meta. Statut `DISAPPROVED` → le code récupère le motif (`ad_review_feedback`) et appelle le Modérateur → le rapport s'affiche sur la campagne, et une notification e-mail est envoyée (PRD F4, F11).

## 5. Entrées
```jsonc
{
  "output_language": "fr",
  "ad": { "product": "…", "primary_text": "…", "headline": "…", "description": "…", "visual": "description ou OCR du visuel", "landing_page": "url + état" },
  "meta_rejection": "texte officiel du motif Meta",
  "rejection_memory": [ { "pattern": "promesse chiffrée de perte de poids", "count": 7 } ]
}
```

## 6. Sortie
```jsonc
{
  "rejection_category": "personal_attributes|misleading_claims|before_after|prohibited_product|restricted_product|sensational_content|adult_content|landing_page|intellectual_property|text_quality|other",
  "culprit": { "where": "primary_text|headline|description|visual|landing_page|product|unknown", "excerpt": "Tu as de l'acné ?" },
  "cause_certainty": "high|medium|low",
  "can_fix": true,
  "fix": { "field": "primary_text", "original": "Tu as de l'acné ? …", "suggested": "Une peau nette et hydratée au quotidien. Écris-nous sur WhatsApp." },
  "appeal_recommended": false,
  "report": "Meta a refusé ta pub car elle s'adresse directement à un problème de santé de la personne (« Tu as de l'acné ? »). Meta interdit de supposer une caractéristique personnelle. Nous te proposons un texte corrigé : clique sur « Appliquer et republier ».",
  "memory_pattern": "question directe sur un problème de peau"
}
```

## 7. Règles
- `report` : 3 à 5 phrases, sans jargon, ton professionnel et rassurant.
- `can_fix=false` seulement si le produit lui-même est interdit par Meta (drogues, armes, tabac et vapotage, contenus adultes, contrefaçons, médicaments sur ordonnance, arnaques).
- Motif vague (« may violate our Advertising Standards ») sans cause visible : `cause_certainty: "low"` et `appeal_recommended: true`.
- Bouton dans l'interface : **« Appliquer la correction et republier »**. Cette action consomme le quota ? **Non**, c'est la même campagne.

## 8. Mémoire des refus
Chaque `memory_pattern` est stocké anonymisé avec son compteur. Plus tard, le Stratège pourra recevoir les motifs les plus fréquents comme liste « à éviter », sans bloquer quoi que ce soit.

## 9. Critères de qualité (banc de test : `bench/datasets/rejections.json`)
| Critère | Seuil |
|---|---|
| Catégorie correcte | ≥ 90 % |
| Élément en cause correctement pointé | ≥ 90 % |
| Correction fournie quand c'est corrigeable | 100 % |
| `can_fix` correct (produit interdit ou non) | 100 % |
| Honnêteté sur un motif vague (pas de certitude « high ») | 100 % |
| Corrections acceptées ensuite par Meta (production) | ≥ 90 % |
