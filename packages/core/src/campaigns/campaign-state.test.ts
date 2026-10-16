// Machine d'état des campagnes (LLD §6.8, APPFLOW §11.2). Le test écrit SA PROPRE liste des transitions voulues :
// il ne se contente pas de relire la table du code (sinon il serait toujours vrai). Il parcourt ensuite TOUTES les
// paires (état × événement) : chaque transition autorisée mène au bon état, chaque autre est refusée par une erreur typée.
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_EVENTS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  allowedTargets,
  canTransition,
  nextCampaignStatus,
  type CampaignEvent,
  type CampaignStatus,
} from './campaign-state';

type Row = readonly [CampaignStatus, CampaignEvent, CampaignStatus];

/** Source : APPFLOW §11.2 (diagramme) réuni à LLD §6.8 (table). Voir les notes de chaque ligne. */
const EXPECTED: readonly Row[] = [
  ['draft', 'publish', 'publishing'],
  ['publishing', 'sent', 'in_review'],
  ['publishing', 'send_failed', 'error'],
  ['in_review', 'approve', 'active'],
  ['in_review', 'refuse', 'rejected'],
  ['in_review', 'pause', 'paused'], // LLD : une pause pendant la vérification
  ['active', 'pause', 'paused'],
  ['active', 'modify', 'in_review'], // LLD : une modification relance la vérification
  ['active', 'finish', 'ended'],
  ['active', 'stop', 'stopped'],
  ['paused', 'resume', 'active'],
  ['paused', 'finish', 'ended'],
  ['paused', 'stop', 'stopped'],
  ['rejected', 'publish', 'publishing'], // republication après correction (sans quota)
  ['rejected', 'stop', 'stopped'],
  ['error', 'publish', 'publishing'],
  ['error', 'reset', 'draft'],
  ['stopped', 'recover', 'active'], // APPFLOW : paiement corrigé (LLD : terminal, voir rapport)
];

describe('machine d’état des campagnes', () => {
  it('liste 9 états et 12 événements', () => {
    expect(CAMPAIGN_STATUSES).toHaveLength(9);
    expect(CAMPAIGN_EVENTS).toHaveLength(12);
  });

  for (const from of CAMPAIGN_STATUSES) {
    for (const event of CAMPAIGN_EVENTS) {
      const wanted = EXPECTED.find((r) => r[0] === from && r[1] === event);
      if (wanted !== undefined) {
        it(`autorisé : ${from} + ${event} → ${wanted[2]}`, () => {
          expect(nextCampaignStatus(from, event)).toEqual({ ok: true, status: wanted[2] });
          expect(canTransition(from, wanted[2])).toBe(true);
        });
      } else {
        it(`interdit : ${from} + ${event}`, () => {
          const result = nextCampaignStatus(from, event);
          expect(result).toEqual({
            ok: false,
            error: { code: 'invalid_transition', from, event },
          });
        });
      }
    }
  }

  it('la table du code contient exactement les transitions voulues, ni plus ni moins', () => {
    const actual: string[] = [];
    for (const from of CAMPAIGN_STATUSES) {
      for (const [event, to] of Object.entries(CAMPAIGN_TRANSITIONS[from])) {
        actual.push(`${from}|${event}|${to}`);
      }
    }
    expect(actual.sort()).toEqual(EXPECTED.map((r) => r.join('|')).sort());
  });

  it('canTransition : toutes les paires (de, vers) sont cohérentes avec les événements', () => {
    for (const from of CAMPAIGN_STATUSES) {
      for (const to of CAMPAIGN_STATUSES) {
        const viaEvent = EXPECTED.some((r) => r[0] === from && r[2] === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(viaEvent);
      }
    }
  });

  it('un état ne mène jamais à lui-même', () => {
    for (const s of CAMPAIGN_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it('108 paires (9 états × 12 événements) : 18 autorisées, 90 interdites', () => {
    let allowed = 0;
    for (const from of CAMPAIGN_STATUSES)
      for (const event of CAMPAIGN_EVENTS) if (nextCampaignStatus(from, event).ok) allowed += 1;
    expect([allowed, CAMPAIGN_STATUSES.length * CAMPAIGN_EVENTS.length - allowed]).toEqual([
      18, 90,
    ]);
  });

  it('DÉCISION 16/10/2026 : une campagne arrêtée repart par « recover » une fois le paiement corrigé chez Meta', () => {
    expect(nextCampaignStatus('stopped', 'recover')).toEqual({ ok: true, status: 'active' });
    expect(allowedTargets('stopped')).toEqual(['active']);
  });

  it('seuls ended n’a aucune sortie ; draft ne peut qu’être publié', () => {
    expect(allowedTargets('ended')).toEqual([]);
    expect(allowedTargets('draft')).toEqual(['publishing']);
  });

  it('rejette un événement inconnu sans exception', () => {
    // @ts-expect-error valeur volontairement hors de la liste fermée
    const result = nextCampaignStatus('draft', 'inconnu');
    expect(result.ok).toBe(false);
  });
});
