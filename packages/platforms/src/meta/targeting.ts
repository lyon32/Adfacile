// Ciblage et objectif d'optimisation. Porté de `buildTargeting` et `getOptimizationGoal`
// (backend/src/services/facebookAdsService.js), règles inchangées.
// Documentation : https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting
import type { PublishTargeting, TargetingItem } from '../types';

/** Mappe l'objectif de campagne vers l'optimization goal de Meta (repli quand l'assistant n'en donne pas). */
export function getOptimizationGoal(objective: string | undefined): string {
  const goals: Readonly<Record<string, string>> = {
    OUTCOME_TRAFFIC: 'LINK_CLICKS',
    OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT',
    OUTCOME_LEADS: 'LEAD_GENERATION',
    OUTCOME_SALES: 'OFFSITE_CONVERSIONS',
    OUTCOME_AWARENESS: 'REACH',
    OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
  };
  return objective !== undefined && Object.hasOwn(goals, objective)
    ? (goals[objective] ?? 'LINK_CLICKS')
    : 'LINK_CLICKS';
}

/** Rayon autour d'une ville accepté par Meta : de 17 à 80 km (documentation « Basic Targeting »). */
export const META_CITY_RADIUS_MIN_KM = 17;
export const META_CITY_RADIUS_MAX_KM = 80;
const DEFAULT_CITY_RADIUS_KM = 25;

/** Rayon envoyé à Meta : celui du client ramené dans la plage de Meta ; 25 km (AdFacile) quand il n'est pas donné. */
export function cityRadiusKm(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_CITY_RADIUS_KM;
  return Math.min(
    META_CITY_RADIUS_MAX_KM,
    Math.max(META_CITY_RADIUS_MIN_KM, Math.round(requested)),
  );
}

interface GeoLocations {
  countries?: string[];
  cities?: { key: string; radius: number; distance_unit: 'kilometer' }[];
  regions?: { key: string }[];
  geo_markets?: { key: string }[];
}

export interface MetaTargeting {
  age_min: number;
  age_max: number;
  targeting_automation: { advantage_audience: 0 | 1 };
  geo_locations: GeoLocations;
  genders?: number[];
  flexible_spec?: {
    interests?: { id: string; name: string | undefined }[];
    behaviors?: { id: string; name: string | undefined }[];
  }[];
}

const GENRES_META: Readonly<Record<string, number>> = { male: 1, female: 2 };

function withId(
  items: readonly TargetingItem[] | undefined,
): { id: string; name: string | undefined }[] {
  return (items ?? []).flatMap((item) => (item.id ? [{ id: item.id, name: item.name }] : []));
}

/**
 * Construit l'objet targeting de Meta à partir des données de l'application.
 *
 * locations : { key, name, type, country_code } de la Targeting Search API ; interests / behaviors :
 * { id, name }. Les entrées sans identifiant sont écartées plutôt que de faire échouer toute la campagne
 * (l'assistant IA peut renvoyer des libellés seuls).
 */
export function buildTargeting(targeting: PublishTargeting): MetaTargeting {
  const result: MetaTargeting = {
    age_min: targeting.ageMin ?? 18,
    age_max: targeting.ageMax ?? 65,

    // Meta exige un choix explicite sur l'audience Advantage, et refuse la création sans lui
    // (sous-code 1870227). Le champ vit **dans** la spécification de ciblage : le placer à côté, au
    // niveau de l'ensemble de publicités, revient à ne pas le fournir du tout.
    //
    // 0 par défaut : le ciblage composé par l'utilisateur est respecté tel quel. À 1, Meta s'autorise à
    // élargir l'audience au-delà de ce qui a été demandé, ce qui ne doit pas arriver sans que
    // l'utilisateur l'ait choisi.
    targeting_automation: { advantage_audience: targeting.advantageAudience === 1 ? 1 : 0 },
    geo_locations: {},
  };

  // Géolocalisation avec les location keys de Meta.
  const geo = result.geo_locations;
  const countries: string[] = [];
  const cities: NonNullable<GeoLocations['cities']> = [];
  const regions: { key: string }[] = [];
  const geoMarkets: { key: string }[] = [];

  for (const loc of targeting.locations) {
    if (loc.type === 'country') {
      countries.push(loc.countryCode ?? loc.key);
    } else if (loc.type === 'region') {
      regions.push({ key: loc.key });
    } else if (loc.type === 'geo_market') {
      geoMarkets.push({ key: loc.key });
    } else {
      // Ville, et par défaut tout type inconnu.
      cities.push({ key: loc.key, radius: cityRadiusKm(loc.radiusKm), distance_unit: 'kilometer' });
    }
  }

  if (countries.length > 0) geo.countries = countries;
  if (cities.length > 0) geo.cities = cities;
  if (regions.length > 0) geo.regions = regions;
  if (geoMarkets.length > 0) geo.geo_markets = geoMarkets;

  // Repli : sans localisation, le Cameroun. Doit couvrir TOUS les types gérés au-dessus : oublier
  // geo_markets ajouterait le Cameroun entier à un ciblage volontairement restreint.
  if (Object.keys(geo).length === 0) geo.countries = ['CM'];

  // Genre : le formulaire enregistre ['male'] / ['female'] / [] ; Meta attend [1] / [2], et l'absence du
  // champ pour « tous ». Faute de cette conversion, le ciblage par genre était saisi puis perdu en
  // silence : la campagne visait tout le monde sans que rien ne le signale.
  if (targeting.genders && targeting.genders.length > 0) {
    const codes = targeting.genders.flatMap((g) => {
      const code = typeof g === 'number' ? g : GENRES_META[g.toLowerCase()];
      return code === 1 || code === 2 ? [code] : [];
    });
    // Cocher les deux revient à ne pas filtrer : Meta préfère le champ absent.
    if (codes.length === 1) result.genders = codes;
  }

  // Intérêts et comportements vivent dans le même flexible_spec.
  const behaviors = withId(targeting.behaviors);
  const spec: NonNullable<MetaTargeting['flexible_spec']>[number] = {};
  // Comme AdFacile : des intérêts fournis mais sans identifiant donnent `interests: []` (envoyé tel quel) ;
  // les comportements sans identifiant, eux, sont écartés pour ne pas faire échouer toute la campagne.
  if ((targeting.interests?.length ?? 0) > 0) spec.interests = withId(targeting.interests);
  if (behaviors.length > 0) spec.behaviors = behaviors;
  if (Object.keys(spec).length > 0) result.flexible_spec = [spec];

  return result;
}
