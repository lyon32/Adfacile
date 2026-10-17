import { AppError } from '@pubeka/contracts';
import { FakeMetaConnector } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { resolveLocations } from './locations';

const TOKEN = { accessToken: 'jeton-de-test', expiresAt: null };

function meta(): FakeMetaConnector {
  const fake = new FakeMetaConnector();
  fake.seedLocation({
    key: '111',
    name: 'Douala',
    type: 'city',
    countryCode: 'CM',
    region: 'Littoral',
  });
  fake.seedLocation({
    key: '222',
    name: 'Yaoundé',
    type: 'city',
    countryCode: 'CM',
    region: 'Centre',
  });
  fake.seedLocation({
    key: '333',
    name: 'Abidjan',
    type: 'city',
    countryCode: 'CI',
    region: 'Lagunes',
  });
  // Même nom dans deux pays.
  fake.seedLocation({
    key: '444',
    name: 'Kinshasa',
    type: 'city',
    countryCode: 'CD',
    region: null,
  });
  fake.seedLocation({
    key: '555',
    name: 'Kinshasa',
    type: 'city',
    countryCode: 'CG',
    region: null,
  });
  return fake;
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('AppError attendue');
}

describe('resolveLocations', () => {
  it('des pays seuls : un lieu « pays » chacun, sans aucun appel à Meta', async () => {
    const fake = meta();
    const result = await resolveLocations(fake, TOKEN, { countries: ['CM', 'CI'] }, null);
    expect(result).toEqual([
      { key: 'CM', type: 'country', countryCode: 'CM' },
      { key: 'CI', type: 'country', countryCode: 'CI' },
    ]);
  });

  it('des villes : la clé de Meta, le nom, le pays et le rayon demandé', async () => {
    const result = await resolveLocations(
      meta(),
      TOKEN,
      { cities: [{ name: 'Douala', radius_km: 10 }] },
      null,
    );
    expect(result).toEqual([
      { key: '111', name: 'Douala', type: 'city', countryCode: 'CM', radiusKm: 10 },
    ]);
  });

  it('pays ET villes : seules les villes sont envoyées (les pays ne servent qu’à chercher), sinon tout le pays serait ciblé', async () => {
    const result = await resolveLocations(
      meta(),
      TOKEN,
      {
        countries: ['CM'],
        cities: [
          { name: 'Douala', radius_km: 20 },
          { name: 'Yaoundé', radius_km: 30 },
        ],
      },
      null,
    );
    expect(result.map((l) => l.type)).toEqual(['city', 'city']);
    expect(result.map((l) => l.key)).toEqual(['111', '222']);
  });

  it('une ville d’un autre pays que ceux demandés est introuvable', async () => {
    const error = await failure(
      resolveLocations(
        meta(),
        TOKEN,
        { countries: ['CM'], cities: [{ name: 'Abidjan', radius_km: 10 }] },
        null,
      ),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'geo.cities.0', code: 'not_found' });
  });

  it('une ville inconnue de Meta : validation_failed sur la bonne ville, avant tout appel de création', async () => {
    const error = await failure(
      resolveLocations(
        meta(),
        TOKEN,
        {
          cities: [
            { name: 'Douala', radius_km: 10 },
            { name: 'Villeinconnue', radius_km: 10 },
          ],
        },
        null,
      ),
    );
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'geo.cities.1', code: 'not_found' });
  });

  it('même nom dans deux pays, sans pays demandé : celui du pays du propriétaire de l’espace', async () => {
    const result = await resolveLocations(
      meta(),
      TOKEN,
      { cities: [{ name: 'Kinshasa', radius_km: 10 }] },
      'CG',
    );
    expect(result[0]).toMatchObject({ key: '555', countryCode: 'CG' });
    const other = await resolveLocations(
      meta(),
      TOKEN,
      { cities: [{ name: 'Kinshasa', radius_km: 10 }] },
      'CD',
    );
    expect(other[0]).toMatchObject({ key: '444' });
  });

  it('même nom dans deux pays, aucun indice : le premier résultat de Meta (son ordre de pertinence)', async () => {
    const result = await resolveLocations(
      meta(),
      TOKEN,
      { cities: [{ name: 'Kinshasa', radius_km: 10 }] },
      null,
    );
    expect(result[0]?.key).toBe('444');
  });

  it('deux villes qui donnent la même clé ne sont envoyées qu’une fois', async () => {
    const result = await resolveLocations(
      meta(),
      TOKEN,
      {
        cities: [
          { name: 'Douala', radius_km: 10 },
          { name: 'douala', radius_km: 40 },
        ],
      },
      null,
    );
    expect(result).toHaveLength(1);
    // Le plus grand rayon l’emporte : on ne réduit jamais la zone voulue.
    expect(result[0]?.radiusKm).toBe(40);
  });

  it('une zone vide est une erreur : au moins un pays ou une ville', async () => {
    const error = await failure(resolveLocations(meta(), TOKEN, {}, null));
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'geo', code: 'required' });
  });

  it('la recherche de Meta qui échoue remonte telle quelle (la tâche conclut, sans rien avoir créé)', async () => {
    const fake = meta();
    fake.simulateTransientError(1);
    const error = await failure(
      resolveLocations(fake, TOKEN, { cities: [{ name: 'Douala', radius_km: 10 }] }, null),
    );
    expect(error.code).toBe('meta_error');
  });
});
