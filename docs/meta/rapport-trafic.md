# Rapport — fiabilité de la création Trafic vers Facebook Ads

Compte publicitaire de test : **lyon (act_1086412686842710)**, USD, fuseau America/Los_Angeles.
Règle appliquée : rien n'est déclaré « arrivé » sans relecture Graph (`scripts/relire-campagne.cjs`),
chaque campagne créée en PAUSE puis supprimée via l'app, suppression vérifiée chez Meta
(`scripts/verifier-suppression.cjs`). Référence des règles Meta : `docs/meta/reference-trafic.md`.

## Synthèse finale (8 oct. 2026)

| Destination | Avant correctifs | Après correctifs (relecture Meta) |
|---|---|---|
| T1 Site web | 31/31 conformes | **32/32** conformes |
| T2 Messagerie (Messenger + Instagram) | créée, 2 écarts (objectif affiché ≠ envoyé) | **28/28** conformes |
| T3 Instagram ou Facebook | **refusée par Meta** (3907008, compte Instagram manquant) | **29/29** conformes |
| T4 Appels | créée mais **sans bouton Appeler** (« En savoir plus » vers le site) | **28/28** conformes, `CALL_NOW` → `tel:+237699000000` |
| T5 Votre publication | **refusée par AdsFacile** (`ON_POST` non accepté en Trafic) | **30/30** conformes, coût cible inclus |

Couvert par ces tests : ville, pays, région, âge, sexe, centre d'intérêt, budget journalier et total,
dates, objectifs de performance (clics, visites, conversations), coût cible, texte, titre, description,
bouton, lien, lien affiché, UTM, image, message d'accueil, multi-annonceurs, nom de pub, statut PAUSED.

**Localisation** : arrive exactement chez Meta dans tous les cas testés (villes avec rayon 25 km,
pays, région). Le problème constaté venait du jeton Facebook révoqué (voir Préalables), pas du code
de ciblage. Hypothèses de la phase 1 écartées par les preuves : mapping des types, repli `CM`,
sérialisation de `location_types` (Meta renvoie les bons types).

## Causes prouvées et corrections

| # | Gravité | Cause (preuve) | Correction | Test |
|---|---|---|---|---|
| C1 | bloquant | T3 : `object_story_spec` sans compte Instagram → Meta 3907008 | `instagramIdentity()` ajoute `instagram_user_id` (champ v22+, remplace `instagram_actor_id`) ; erreur claire avant tout appel si aucun compte relié | `facebookAdsService.test.js` |
| C2 | bloquant | T5 : la carte « Votre publication » envoie `ON_POST`, Trafic n'accepte que `ON_AD` | `toApiDestination()` traduit la carte vers la valeur acceptée par l'objectif | `campaignObjectives.test.js` |
| C3 | dégradé | T4 : aucun numéro, bouton « En savoir plus » → la pub d'appel ne peut pas appeler | Champ « Numéro à appeler » (étape 2) + `phoneCallToAction()` → `CALL_NOW` / `tel:` ; étape 3 affiche « Appeler » | `facebookAdsService.test.js` |
| C4 | dégradé | T2 : écran « clics », Meta reçoit `CONVERSATIONS` (imposé par le serveur) | Le formulaire affiche l'objectif réellement envoyé pour la messagerie | relecture T2 |
| C5 | cosmétique | Résumé budget : budget total ignoré (35 000 affichés pour 30 000) ; fin non incluse | `totalEstimate` gère le budget total et compte la fin incluse | vérifié à l'écran (30 000 / 40 000) |
| C6 | ménage | Supprimer une campagne laissait la création ACTIVE dans la bibliothèque | `deleteCampaignOnFacebook` supprime aussi `fb_creative_id` | `facebookAdsService.test.js` + vérif. Meta |

Suite backend complète après tous les correctifs : **207/207** tests verts (14 suites).

## Préalables (7–8 oct. 2026)

| Problème | Cause prouvée | Correction |
|---|---|---|
| Localisation « ne marche jamais » | Jeton Facebook invalidé par Meta (190/460) ; serveur en 500 générique | `services/facebookTokenHealth.js` : 401 `FACEBOOK_RECONNECT_REQUIRED`, statut vérifié chez Meta, bannière de reconnexion, message sous le champ |
| Reconnexion impossible (« Feature Unavailable ») | App « Entreprise » (Facebook Login for Business) appelée avec `scope` | Dialogue avec `config_id` (`FACEBOOK_LOGIN_CONFIG_ID`) |
| Fiche d'app incomplète | CGU / suppression des données vers facebook.com | Page `/terms` créée et déployée, fiche Meta complétée |
| Pub refusée (1885183) | App Meta passée en mode Développement | App repassée en Live |

## Points restants (non corrigés, hors périmètre prouvé)

- **WhatsApp** non testé : aucun numéro WhatsApp (`whatsapp_phone_number_id`) relié à la Page Lyon Deals.
- **act_1233160995583864** non autorisé lors de la connexion (portefeuille Business non coché).
- Destination « Application » non proposée pour Trafic (normal : Meta exige une application liée).
