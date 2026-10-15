import { defineConfig } from '@trigger.dev/sdk';

// Configuration Trigger.dev v4 (https://trigger.dev/docs/config/config-file). Le projet vient de la variable
// TRIGGER_PROJECT_REF : `pubeka-staging` en préproduction, le projet de production ensuite (CI_CD §4).
// Aucun identifiant de projet n'est écrit ici ; `trigger.dev init` n'est jamais lancé (LLD §2.1).
const project = process.env.TRIGGER_PROJECT_REF;
if (project === undefined || project === '') {
  throw new Error('TRIGGER_PROJECT_REF est absente : voir docs/architecture/ENV_SETUP.md §1.9.');
}

export default defineConfig({
  project,
  dirs: ['./src/tasks'],
  runtime: 'node-24',
  // Une tâche de fond ne dépasse pas 15 minutes (secondes) ; les générations vidéo longues passent par webhook.
  maxDuration: 900,
  // Le seul nouvel essai automatique est celui du moteur des agents ; une tâche qui dépense (paiement, génération,
  // publication) ne se relance jamais d'elle-même (SECURITY_NOTES EC-META-05) : aucune relance par défaut.
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
});
