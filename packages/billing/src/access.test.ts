// TR-PAY-07 : grâce de 3 jours après la fin de période, puis lecture seule ; la fin de l'essai
// donne la lecture seule sans grâce (SECURITY_NOTES §2.1, décision 5 du §6).
import { describe, expect, it } from 'vitest';
import {
  GRACE_DAYS,
  accessCause,
  effectiveAccess,
  graceEndsAt,
  workspaceAccess,
  type AccessSubscription,
} from './access';

const END = new Date('2026-11-10T12:00:00.000Z');
const day = 24 * 3600 * 1000;
const sub = (over: Partial<AccessSubscription> = {}): AccessSubscription => ({
  status: 'active',
  period_end: END,
  grace_until: null,
  ...over,
});

describe('workspaceAccess (TR-PAY-07)', () => {
  it('abonnement en cours : active', () => {
    expect(workspaceAccess(sub(), new Date(END.getTime() - 1))).toBe('active');
  });

  it('à la seconde de fin de période : grâce commence', () => {
    expect(workspaceAccess(sub(), END)).toBe('grace');
  });

  it('la grâce dure 3 jours exactement, puis lecture seule', () => {
    expect(GRACE_DAYS).toBe(3);
    expect(workspaceAccess(sub(), new Date(END.getTime() + 3 * day - 1))).toBe('grace');
    expect(workspaceAccess(sub(), new Date(END.getTime() + 3 * day))).toBe('read_only');
  });

  it('grace_until enregistré (prolongation) prime sur les 3 jours', () => {
    const s = sub({ grace_until: new Date(END.getTime() + 10 * day) });
    expect(workspaceAccess(s, new Date(END.getTime() + 9 * day))).toBe('grace');
    expect(workspaceAccess(s, new Date(END.getTime() + 10 * day))).toBe('read_only');
  });

  it('un grace_until antérieur à la fin de période ne raccourcit jamais la période payée', () => {
    const s = sub({ grace_until: new Date(END.getTime() - 5 * day) });
    expect(workspaceAccess(s, new Date(END.getTime() - 1))).toBe('active');
  });

  it('essai terminé : lecture seule tout de suite, sans grâce (décision 5)', () => {
    const s = sub({ status: 'trialing' });
    expect(workspaceAccess(s, new Date(END.getTime() - 1))).toBe('active');
    expect(workspaceAccess(s, END)).toBe('read_only');
  });

  it('abonnement résilié : accès jusqu’à la fin de la période payée, puis lecture seule sans grâce', () => {
    const s = sub({ status: 'canceled' });
    expect(workspaceAccess(s, new Date(END.getTime() - 1))).toBe('active');
    expect(workspaceAccess(s, END)).toBe('read_only');
  });

  it('statut enregistré read_only : lecture seule même avant la fin de période', () => {
    expect(workspaceAccess(sub({ status: 'read_only' }), new Date(END.getTime() - day))).toBe(
      'read_only',
    );
  });

  it('statut enregistré grace : suit l’horloge comme actif (jamais de grâce infinie)', () => {
    const s = sub({ status: 'grace' });
    expect(workspaceAccess(s, new Date(END.getTime() + day))).toBe('grace');
    expect(workspaceAccess(s, new Date(END.getTime() + 4 * day))).toBe('read_only');
  });

  it('accepte des dates en texte ISO (lignes de la base)', () => {
    const s = sub({ period_end: END.toISOString(), grace_until: null });
    expect(workspaceAccess(s, new Date(END.getTime() + day))).toBe('grace');
  });

  it('date illisible : lecture seule (on refuse en cas de doute)', () => {
    expect(workspaceAccess(sub({ period_end: 'pas une date' }), END)).toBe('read_only');
  });
});

describe('effectiveAccess : état stocké de l’espace + abonnement', () => {
  const now = new Date(END.getTime() - day);
  it('suspendu par l’administration : suspended, quoi que dise l’abonnement', () => {
    expect(effectiveAccess('suspended', sub(), now)).toBe('suspended');
  });
  it('read_only stocké : lecture seule même avec un abonnement en cours', () => {
    expect(effectiveAccess('read_only', sub(), now)).toBe('read_only');
  });
  it('actif et sans abonnement (l’essai démarre en S24) : active', () => {
    expect(effectiveAccess('active', null, now)).toBe('active');
  });
  it('actif avec abonnement échu : suit l’abonnement', () => {
    expect(effectiveAccess('active', sub(), new Date(END.getTime() + 5 * day))).toBe('read_only');
    expect(effectiveAccess('active', sub(), new Date(END.getTime() + day))).toBe('grace');
  });
});

describe('graceEndsAt', () => {
  it('3 jours après la fin de période, ou grace_until prolongé', () => {
    expect(graceEndsAt(sub())?.toISOString()).toBe(new Date(END.getTime() + 3 * day).toISOString());
    const longer = new Date(END.getTime() + 8 * day);
    expect(graceEndsAt(sub({ grace_until: longer }))?.getTime()).toBe(longer.getTime());
  });
  it('pas de grâce pour un essai, une résiliation, une lecture seule ou une date illisible', () => {
    expect(graceEndsAt(sub({ status: 'trialing' }))).toBeNull();
    expect(graceEndsAt(sub({ status: 'canceled' }))).toBeNull();
    expect(graceEndsAt(sub({ status: 'read_only' }))).toBeNull();
    expect(graceEndsAt(sub({ period_end: 'x' }))).toBeNull();
  });
});

describe('accessCause : pourquoi l’espace n’est pas actif (bandeau exact)', () => {
  const now = new Date(END.getTime() + day);
  it('active : aucune cause', () => {
    expect(accessCause('active', sub(), new Date(END.getTime() - day))).toBeNull();
    expect(accessCause('active', null, now)).toBeNull();
  });
  it('grâce', () => {
    expect(accessCause('active', sub(), now)).toBe('grace');
  });
  it('essai terminé', () => {
    expect(accessCause('active', sub({ status: 'trialing' }), now)).toBe('trial_ended');
  });
  it('abonnement terminé : formule payée après la grâce, résiliée échue, ou statut read_only', () => {
    expect(accessCause('active', sub(), new Date(END.getTime() + 5 * day))).toBe(
      'subscription_ended',
    );
    expect(accessCause('active', sub({ status: 'canceled' }), now)).toBe('subscription_ended');
    expect(accessCause('active', sub({ status: 'read_only' }), now)).toBe('subscription_ended');
  });
  it('décision de l’administration : lecture seule posée sur l’espace, même sans abonnement ou avec un essai', () => {
    expect(accessCause('read_only', null, now)).toBe('admin');
    expect(accessCause('read_only', sub({ status: 'trialing' }), now)).toBe('admin');
    expect(accessCause('suspended', sub(), now)).toBe('admin');
  });
});
