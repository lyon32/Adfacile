import 'server-only';
// Services des routes « propositions » : passerelle IA (réelle ou fausse selon PUBEKA_FAKE_PROVIDERS) et réglage des modèles.
// Les points d'accroche des quotas et des crédits (`beforeSpend`, `afterAccepted`) arrivent avec S24.
import { createProposalDeps, type ProposalDeps } from '@pubeka/core';
import { getEnv } from '@pubeka/shared';

let deps: ProposalDeps | undefined;

export function proposalDeps(): ProposalDeps {
  deps ??= createProposalDeps(getEnv());
  return deps;
}
