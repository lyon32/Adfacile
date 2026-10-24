// TR-PLA-05, EC-META-08 : que fait Pubeka quand Meta et lui ne sont pas d'accord ? Meta fait foi, la machine d'état reste la
// seule porte d'entrée. Chaque ligne du tableau est une règle écrite à la main (pas calculée par le code testé).
import type { PlatformStatus } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_STATUSES, nextCampaignStatus, type CampaignStatus } from '../campaign-state';
import { decideStatusEvent } from './status-decision';

const TODAY = '2026-10-24';
const remote = (
  status: PlatformStatus['status'],
  rawStatus = status.toUpperCase(),
): PlatformStatus => ({
  status,
  rawStatus,
});
const decide = (
  current: CampaignStatus,
  r: PlatformStatus,
  endDate: string | null = '2026-12-31',
) => decideStatusEvent({ current, remote: r, endDate, today: TODAY });

describe('decideStatusEvent — TR-PLA-05 : Meta fait foi', () => {
  const rows: [CampaignStatus, PlatformStatus, string | null, string][] = [
    ['in_review', remote('active'), 'approve', 'Meta a validé la pub'],
    [
      'paused',
      remote('active'),
      'resume',
      'reprise faite dans le gestionnaire de Meta (EC-META-08)',
    ],
    [
      'active',
      remote('paused', 'PAUSED'),
      'pause',
      'pause faite dans le gestionnaire de Meta (EC-META-08)',
    ],
    ['active', remote('paused', 'CAMPAIGN_PAUSED'), 'pause', 'campagne en pause chez Meta'],
    ['active', remote('paused', 'ADSET_PAUSED'), 'pause', 'ensemble en pause chez Meta'],
    ['in_review', remote('paused'), 'pause', 'mise en pause pendant la relecture'],
    ['active', remote('in_review', 'IN_PROCESS'), 'modify', 'Meta relit une modification'],
    ['in_review', remote('rejected', 'DISAPPROVED'), 'refuse', 'refusée par Meta'],
    ['active', remote('stopped', 'DELETED'), 'stop', 'EC-META-08 : supprimée chez Meta → arrêtée'],
    ['paused', remote('stopped', 'ARCHIVED'), 'stop', 'archivée chez Meta → arrêtée'],
    ['rejected', remote('stopped', 'DELETED'), 'stop', 'refusée puis supprimée'],
    [
      'active',
      remote('error', 'PENDING_BILLING_INFO'),
      'stop',
      'paiement Meta refusé → arrêtée (APPFLOW §11.2)',
    ],
    ['paused', remote('error', 'PENDING_BILLING_INFO'), 'stop', 'paiement refusé pendant la pause'],
  ];
  it.each(rows)('%s + %j → %s (%s)', (current, r, event) => {
    const decision = decide(current, r);
    expect(decision.event).toBe(event);
    expect(decision.reason).toBe('applied');
    // Le résultat est toujours un événement que la machine d'état accepte.
    expect(nextCampaignStatus(current, decision.event ?? 'publish').ok).toBe(true);
  });

  it('même statut des deux côtés : rien à faire (« in_sync »)', () => {
    expect(decide('active', remote('active'))).toEqual({ event: null, reason: 'in_sync' });
    expect(decide('paused', remote('paused'))).toEqual({ event: null, reason: 'in_sync' });
    expect(decide('in_review', remote('in_review', 'PENDING_REVIEW'))).toEqual({
      event: null,
      reason: 'in_sync',
    });
    expect(decide('stopped', remote('error', 'PENDING_BILLING_INFO'))).toEqual({
      event: null,
      reason: 'in_sync',
    });
  });

  it('décision du 16/10/2026 : une campagne ARRÊTÉE redevenue active chez Meta n’est PAS relancée toute seule', () => {
    expect(decide('stopped', remote('active'))).toEqual({
      event: null,
      reason: 'client_action_required',
    });
  });

  it('WITH_ISSUES et statut inconnu : journalisés, jamais appliqués (« à regarder, pas à cacher »)', () => {
    expect(decide('active', remote('error', 'WITH_ISSUES'))).toEqual({
      event: null,
      reason: 'needs_attention',
    });
    expect(decide('active', remote('error', 'UNKNOWN'))).toEqual({
      event: null,
      reason: 'needs_attention',
    });
  });

  it('une transition que la machine interdit n’est jamais proposée (« not_allowed »)', () => {
    // active ne peut pas devenir « rejected » ; in_review ne peut pas devenir « stopped ».
    expect(decide('active', remote('rejected', 'DISAPPROVED'))).toEqual({
      event: null,
      reason: 'not_allowed',
    });
    expect(decide('in_review', remote('stopped', 'DELETED'))).toEqual({
      event: null,
      reason: 'not_allowed',
    });
    expect(decide('stopped', remote('paused'))).toEqual({ event: null, reason: 'not_allowed' });
  });

  it('PROPRIÉTÉ : pour tout couple (statut de Pubeka, statut de Meta), l’événement choisi est toujours accepté par la machine', () => {
    const raws = [
      'ACTIVE',
      'PAUSED',
      'CAMPAIGN_PAUSED',
      'ADSET_PAUSED',
      'PENDING_REVIEW',
      'PREAPPROVED',
      'IN_PROCESS',
      'DISAPPROVED',
      'DELETED',
      'ARCHIVED',
      'PENDING_BILLING_INFO',
      'WITH_ISSUES',
      'AUTRE',
    ];
    const mapped: Record<string, PlatformStatus['status']> = {
      ACTIVE: 'active',
      PAUSED: 'paused',
      CAMPAIGN_PAUSED: 'paused',
      ADSET_PAUSED: 'paused',
      PENDING_REVIEW: 'in_review',
      PREAPPROVED: 'in_review',
      IN_PROCESS: 'in_review',
      DISAPPROVED: 'rejected',
      DELETED: 'stopped',
      ARCHIVED: 'stopped',
      PENDING_BILLING_INFO: 'error',
      WITH_ISSUES: 'error',
      AUTRE: 'error',
    };
    let checked = 0;
    for (const current of CAMPAIGN_STATUSES) {
      for (const raw of raws) {
        for (const endDate of [null, '2026-10-01', '2026-12-31']) {
          const decision = decide(
            current,
            { status: mapped[raw] ?? 'error', rawStatus: raw },
            endDate,
          );
          checked += 1;
          if (decision.event !== null) {
            expect(nextCampaignStatus(current, decision.event).ok).toBe(true);
          }
        }
      }
    }
    expect(checked).toBe(CAMPAIGN_STATUSES.length * raws.length * 3);
  });
});

describe('decideStatusEvent — fin de diffusion par la date de fin', () => {
  it('date de fin dépassée et Meta ne contredit pas : « finish »', () => {
    expect(decide('active', remote('active'), '2026-10-23')).toEqual({
      event: 'finish',
      reason: 'ended_by_date',
    });
    expect(decide('paused', remote('paused'), '2026-10-20')).toEqual({
      event: 'finish',
      reason: 'ended_by_date',
    });
  });
  it('le jour de la date de fin, la campagne diffuse encore (strictement après)', () => {
    expect(decide('active', remote('active'), TODAY)).toEqual({ event: null, reason: 'in_sync' });
  });
  it('supprimée ou en défaut de paiement chez Meta : « stop » prime sur « finish »', () => {
    expect(decide('active', remote('stopped', 'DELETED'), '2026-10-01').event).toBe('stop');
    expect(decide('active', remote('error', 'PENDING_BILLING_INFO'), '2026-10-01').event).toBe(
      'stop',
    );
  });
  it('sans date de fin : jamais « finish »', () => {
    expect(decide('active', remote('active'), null).event).toBeNull();
  });
});
