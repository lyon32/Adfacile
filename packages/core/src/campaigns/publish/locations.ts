// Zone de la campagne → lieux de ciblage de Meta (clés de la Targeting Search API, lecture seule).
//
// La zone d'une campagne Pubeka porte des PAYS et des VILLES (nom + rayon). Meta, lui, veut des clés de lieu :
//  - pays seuls : le code du pays suffit ;
//  - villes : on cherche chaque ville chez Meta. Quand la zone a des villes, SEULES les villes sont envoyées : les pays ne
//    servent qu'à choisir la bonne ville. Envoyer aussi le pays ciblerait le pays entier, ce que le client n'a pas demandé.
//
// Une ville introuvable est une erreur de validation sur CETTE ville, levée avant tout appel de création (aucun objet orphelin).
import { AppError, type FieldError } from '@pubeka/contracts';
import type {
  LocationMatch,
  LocationQuery,
  PlatformToken,
  TargetingLocation,
} from '@pubeka/platforms';
import type { Geo } from '../campaign-schemas';

export interface LocationFinder {
  searchLocations(token: PlatformToken, query: LocationQuery): Promise<LocationMatch[]>;
}

function notFound(index: number, name: string): AppError {
  const errors: FieldError[] = [
    {
      field: `geo.cities.${String(index)}`,
      code: 'not_found',
      message: `Meta ne trouve pas la ville « ${name} ». Vérifie son nom ou choisis une autre zone.`,
    },
  ];
  return new AppError('validation_failed', { errors });
}

/** Parmi les résultats de Meta : le pays du propriétaire de l'espace d'abord, sinon l'ordre de pertinence de Meta. */
function pick(matches: LocationMatch[], ownerCountry: string | null): LocationMatch | undefined {
  return matches.find((m) => ownerCountry !== null && m.countryCode === ownerCountry) ?? matches[0];
}

export async function resolveLocations(
  finder: LocationFinder,
  token: PlatformToken,
  geo: Geo,
  ownerCountry: string | null,
): Promise<TargetingLocation[]> {
  const countries = geo.countries ?? [];
  const cities = geo.cities ?? [];
  if (countries.length === 0 && cities.length === 0) {
    const errors: FieldError[] = [
      { field: 'geo', code: 'required', message: 'Indique au moins un pays ou une ville.' },
    ];
    throw new AppError('validation_failed', { errors });
  }
  if (cities.length === 0) {
    return countries.map((code) => ({ key: code, type: 'country', countryCode: code }));
  }

  const byKey = new Map<string, TargetingLocation>();
  for (const [index, city] of cities.entries()) {
    const found = await finder.searchLocations(token, {
      name: city.name,
      type: 'city',
      ...(countries.length === 1 && countries[0] !== undefined
        ? { countryCode: countries[0] }
        : {}),
    });
    const wanted = city.name.trim().toLowerCase();
    const candidates = found.filter(
      (m) =>
        m.type === 'city' &&
        m.name.trim().toLowerCase() === wanted &&
        (countries.length === 0 || (m.countryCode !== null && countries.includes(m.countryCode))),
    );
    const chosen = pick(candidates, ownerCountry);
    if (chosen === undefined) throw notFound(index, city.name);
    const known = byKey.get(chosen.key);
    // Deux saisies de la même ville : le plus grand rayon l'emporte, on ne réduit jamais la zone voulue.
    if (known !== undefined) {
      byKey.set(chosen.key, { ...known, radiusKm: Math.max(known.radiusKm ?? 0, city.radius_km) });
    } else {
      byKey.set(chosen.key, {
        key: chosen.key,
        name: chosen.name,
        type: 'city',
        ...(chosen.countryCode === null ? {} : { countryCode: chosen.countryCode }),
        radiusKm: city.radius_km,
      });
    }
  }
  return [...byKey.values()];
}
