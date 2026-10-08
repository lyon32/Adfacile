# Référence Meta — objectif Trafic (OUTCOME_TRAFFIC)

Phase 1 du plan « fiabilité Trafic ». Chaque règle cite sa source :
- **[DOC-T]** https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting
- **[DOC-S]** https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search
- **[DOC-C]** https://developers.facebook.com/documentation/ads-commerce/marketing-api/call-ads
- **[SONDE]** réponses réelles de l'API (`execution_options: validate_only`) : `docs/meta/sonde-*.txt`, reprises dans `backend/src/services/campaignObjectives.js`

## 1. Destinations × objectifs de performance (niveau ensemble de pub) — [SONDE]

| Destination (interface) | `destination_type` envoyé | Objectifs acceptés | `promoted_object` exigé |
|---|---|---|---|
| Site Web | `WEBSITE` | LINK_CLICKS, LANDING_PAGE_VIEWS, REACH, IMPRESSIONS, POST_ENGAGEMENT, THRUPLAY, QUALITY_CALL | aucun (pixel facultatif) |
| Applications de messagerie | `MESSENGER` / `WHATSAPP` / `INSTAGRAM_DIRECT` / `MESSAGING_*` selon les applis cochées | les mêmes + CONVERSATIONS | `page_id` ; WhatsApp : + numéro (« La Page est manquante dans l'objet promu » sinon) |
| Instagram ou Facebook | `INSTAGRAM_PROFILE` / `FACEBOOK_PAGE` | LINK_CLICKS, LANDING_PAGE_VIEWS, REACH, IMPRESSIONS | `page_id` |
| Appels | `PHONE_CALL` | LINK_CLICKS, LANDING_PAGE_VIEWS, REACH, IMPRESSIONS, POST_ENGAGEMENT, THRUPLAY, QUALITY_CALL | — |
| Votre publication | `ON_AD` | idem Site Web | — |
| Application | `APP` | **aucun sans application** (« L'application est manquante dans l'objet promu ») | `application_id` + `object_store_url` |

Constat : l'interface ne propose pas « Application » pour Trafic (le serveur ne la sert pas) — cohérent avec la sonde.
`billing_event` : `IMPRESSIONS` pour tous ces cas [SONDE + DOC-C].

## 2. Localisation — `targeting.geo_locations` [DOC-T]

- Clés reconnues : `countries`, `regions`, `cities`, `zips`, `places`, `custom_locations`, `geo_markets`, `electoral_district`, `country_groups`, `location_types`.
- `cities` : **`key` + `radius` + `distance_unit` obligatoires** ; rayon **17 à 80 km** (10 à 50 mi). Rayon actuel du code (25 km) : conforme.
- `regions` : `{ key }`. `countries` : codes ISO-2. `geo_markets` : `{ key, name? }`.
- Limites : 250 villes, 200 régions, 2 500 geo_markets.
- `location_types` (dans le ciblage) : seule valeur valide `['home','recent']`.
- Clés de lieu : uniquement via `/search?type=adgeolocation` ; on cible par **`key`**, jamais par le nom [DOC-S].
- `location_types` de la recherche : **tableau JSON** (`location_types=["city"]`) ; valeurs `country, country_group, region, city, zip, geo_market, electoral_district` [DOC-S]. Le type renvoyé (`type`) correspond au champ de `geo_locations` (city→cities, region→regions, country→countries, zip→zips, geo_market→geo_markets).

## 3. Créative

- Standard : `object_story_spec.page_id` + `link_data { link, message, name (titre), description, caption (lien affiché), image_hash, call_to_action { type, value.link } }`.
- **Appels [DOC-C]** : `call_to_action = { type: "CALL_NOW", value: { link: "tel:+<indicatif><numéro>" } }` ; le numéro doit être du même pays que l'audience ; `optimization_goal` recommandé `QUALITY_CALL`.
- Messagerie : bouton et lien fournis par la destination (`destination.call_to_action` dans le code), `page_welcome_message` facultatif.

## 4. Points du code à vérifier en phase 3 (aucune conclusion avant preuve)

1. **Appels** : aucun champ « numéro de téléphone » dans le formulaire ; le service envoie le bouton choisi par l'utilisateur avec le lien du site (`facebookAdsService.js:669-674`) au lieu de `CALL_NOW` + `tel:` exigé par [DOC-C].
2. **Localisation** : la recherche envoie `location_types` sous forme `location_types[]=…` (axios) et non en tableau JSON ([DOC-S]) ; types inconnus envoyés en `cities` sans rayon conforme au type ; repli silencieux `countries=['CM']`.
3. **Lien** : `creative.link` prioritaire sur `website_url` (`facebookAdsService.js:667`).
