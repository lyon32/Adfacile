# EasAds — consignes pour les agents IA (Codex et autres)

Les consignes sont écrites **une seule fois**, dans [`CLAUDE.md`](CLAUDE.md), pour tous les agents. Lis-le en entier avant toute action : ta tâche, ce que tu dois toujours ou jamais faire, la définition de « fini », le périmètre de chaque session et les documents de référence.

Résumé, si tu ne peux lire qu'un fichier :

1. On te donne une session (« Session SNN ») : lis sa fiche dans `docs/ROADMAP.md`. Sans session, demande laquelle.
2. Ne modifie que les chemins de ta session (`CLAUDE.md` §5).
3. Le contrat (`api/openapi.yaml`) et les migrations d'abord, puis le code, puis les tests.
4. Jamais de secret dans le code, jamais de vrai service payant dans un test, jamais de modification d'une migration existante.
5. « Fini » = chaque ligne de « Fait quand » est prouvée et la CI est verte.
6. En cas de doute, demande : pas de suppositions.
