// i18n:check (TESTING §4.2, TR-PLT-03) : le français et l'anglais ont les mêmes clés.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, flatten } from '../src/check.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const load = (lang) => flatten(JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')));
const fr = load('fr');
const problems = compare(fr, load('en'));
if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`i18n:check : ${Object.keys(fr).length} clés, FR et EN identiques.\n`);
