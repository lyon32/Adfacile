# Héritage d'AdFacile : ce qui reste à reprendre

Audit du 26/10/2026 (lecture seule). L'ancien code est supprimé de `main` depuis S12 (PR #51, commit `02849ad`) ; il reste lisible avec `git show 02849ad^:<chemin>`. Le portage Meta (S10, S11) est complet : codes d'erreur, objectifs, destinations de messagerie, formats médias, création de campagne, jetons, anti-SSRF (ajouté en S10).

## À reprendre, par valeur

| # | Élément (chemin dans `02849ad^`) | Pour quelle session | Remarque |
|---|---|---|---|
| 1 | `backend/src/services/saspayService.js`, `saspayService.test.js`, zone webhook de `billingController.js`, `billingWebhook.test.js` | S25 | Paiement `softpay` avec `Idempotency-Key`, vérification, confirmation OTP, tarifs par pays, signature du webhook (HMAC-SHA256 de `horodatage.corps`, tolérance 5 min). **Revérifier chaque point dans `docs.saspay.me`** : le code l'affirme, il n'est pas la source. |
| 2 | Recherche d'intérêts Meta : `backend/src/routes/facebookTargeting.js` (~l. 95-128, `type=adinterest`) | S15/S16 ou session dédiée | Absente de `packages/platforms`. Sans résolution nom → identifiant, les intérêts proposés par l'IA ne peuvent pas partir chez Meta (aujourd'hui : Advantage+ sans intérêts). |
| 3 | `backend/src/services/facebookInsightsService.js` (ventilations âge/sexe, pays/région, emplacements, appareils, heures) et `ttlCache.js` | S29 | Pubeka n'a que l'insights quotidien. Limite constatée : 240 appels/heure pour l'application, jusqu'à 7 appels Graph par campagne ouverte : à noter dans SECURITY_NOTES ou CI_CD. |
| 4 | Conformité Meta : `special_ad_categories` (crédit, emploi, logement, politique) est écrit en dur à `[]` dans `create-campaign.ts` ; `tracking_specs`, `attribution_spec`, `buying_type` | S35 ou avant l'App Review | Traiter comme une exigence produit (déclaration par le client), pas seulement comme du code. Source : `docs/meta/reference-ventes.json` (relevé du 11 août 2026). |
| 5 | Pages légales : `src/pages/PrivacyPolicyPage.jsx`, `TermsPage.jsx`, `DataDeletionPage.jsx` | S33 | Base de texte seulement : à réécrire pour Pubeka. |
| 6 | `docs/meta/dossier-revue-application.md` | App Review | À réécrire pour Pubeka (le seuil de 500 appels réussis sur 15 jours reste valable). |

## À savoir avant de couper adsfacile.xyz

L'application Meta est en mode Live et déclare encore, côté Meta, la politique de confidentialité, les conditions et l'URL de suppression de données sur `adsfacile.xyz`, ainsi que le domaine du backend Render. Tant que ces adresses ne pointent pas vers des pages `pubeka.com` (S33 ou pages provisoires), **ne pas supprimer le projet Vercel `adsfacile` ni son domaine** : l'App Review échouerait.

## Retiré de `scripts/` (26/10/2026)

Neuf scripts cassés (ils chargeaient `backend/`, supprimé en S12), dont trois qui créaient de vraies campagnes chez Meta sans interrupteur de sécurité : `audit-ventes`, `essai-formats`, `relire-campagne`, `sonde-pixels`, `sonde-ventes`, `verifier-suppression`, `tunnel-dev`, `smoke-tests`, `verify-security`. Gardés : `generer-medias-test.cjs` (génère des médias d'essai), `noop.mjs`, `ci/`.
