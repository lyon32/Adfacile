# Captures S15 — étape Proposition

Parcours Playwright `apps/web/e2e/journeys/proposal.spec.ts` (PR #80), 360, 390, 768 et 1280 px, clair et sombre, sans défilement horizontal, axe sans violation (52 tests verts).

- Fausse IA (`PUBEKA_FAKE_PROVIDERS`), base locale, compte de test `@example.test` : aucune donnée réelle.
- **Les montants des captures « complète » viennent de valeurs d'ESSAI de la base locale** (TVA 19,25 % pour le Cameroun et taux de change posés par les tests d'intégration). Ce ne sont pas des données du produit : la TVA par pays reste à renseigner par l'administration.
- `proposition-ecriture-*` : écriture en cours simulée côté navigateur ; `proposition-erreur-flux-*`, `proposition-conflit-*`, `proposition-cout-*` : états simulés.
