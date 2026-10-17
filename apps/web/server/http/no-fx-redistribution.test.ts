// Les conditions d'ExchangeRate-API (https://www.exchangerate-api.com/terms) interdisent de REDISTRIBUER les taux : Pubeka
// n'affiche que des montants convertis. Aucune route ne doit donc publier le tableau des taux (S15b).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..', '..', '..');
const ROUTES = resolve(__dirname, '..', '..', 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? routeFiles(path) : name === 'route.ts' ? [path] : [];
  });
}

describe('aucune redistribution des taux de change', () => {
  it('le contrat OpenAPI n’a aucun chemin de taux de change', () => {
    const yaml = readFileSync(join(ROOT, 'api', 'openapi.yaml'), 'utf8');
    const paths = yaml
      .split('\n')
      .filter((line) => /^ {2}\/[^ ]*:\s*$/.test(line))
      .map((line) => line.trim());
    expect(paths.filter((p) => /(^|[/-])(fx|exchange)/i.test(p))).toEqual([]);
  });

  it('aucune route ne lit la table exchange_rates ni ne renvoie un tableau de taux', () => {
    const offenders = routeFiles(ROUTES).filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /exchange_rates|listFxRates|fx-rates/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
