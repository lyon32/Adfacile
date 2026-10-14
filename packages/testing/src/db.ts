// Requête SQL directe sur la base locale, pour vérifier ce que l'API ne montre jamais
// (schéma `private` : jetons chiffrés, registres). Réservé aux tests d'intégration.
import pg from 'pg';
import { testEnv } from './env';

export async function queryTestDb<T extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: testEnv().dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(sql, [...params])).rows;
  } finally {
    await client.end();
  }
}
