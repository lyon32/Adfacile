// `pnpm e2e:ci` : construit l'application avec la clé de site de TEST de Cloudflare Turnstile
// (publique, « passe toujours » ; la clé secrète de test est dans supabase/config.toml), puis
// lance les parcours. Sans cette clé, l'écran de connexion n'enverrait pas de jeton CAPTCHA et
// Supabase Auth refuserait chaque connexion.
import { spawnSync } from 'node:child_process';

process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY ??= '1x00000000000000000000BB';

const steps = [
  ['exec', 'next', 'build'],
  ['exec', 'playwright', 'test', '--config', 'e2e/journeys/playwright.config.ts'],
];
for (const args of steps) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
