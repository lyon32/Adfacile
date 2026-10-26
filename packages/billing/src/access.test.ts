// TR-PAY-07 (décision de la personne du 26/10/2026) : essai terminé sans abonnement = VERROUILLÉ tout de suite ; fin de période d'une
// formule payée (ou annulation, même chose) = GRÂCE de 3 jours (lecture, achat de crédits, pause), puis VERROUILLÉ. La lecture seule
// (`read_only`) et la suspension ne viennent que de l'administration.
import { describe, expect, it } from 'vitest';
import {
  GRACE_DAYS,
  accessCause,
  effectiveAccess,
  graceEndsAt,
  lockAt,
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

describe('workspaceAccess : formule payée', () => {
  it('en période : active, jusqu’à la dernière milliseconde', () => {
    expect(workspaceAccess(sub(), new Date(END.getTime() - 1))).toBe('active');
  });

  it('à l’instant de fin de période : grâce', () => {
    expect(workspaceAccess(sub(), END)).toBe('grace');
  });

  it('la grâce dure 3 jours exactement, puis VERROUILLÉ', () => {
    expect(GRACE_DAYS).toBe(3);
    expect(workspaceAccess(sub(), new Date(END.getTime() + 3 * day - 1))).toBe('grace');
    expect(workspaceAccess(sub(), new Date(END.getTime() + 3 * day))).toBe('locked');
  });

  it('grace_until enregistré (prolongation) prime sur les 3 jours', () => {
    const s = sub({ grace_until: new Date(END.getTime() + 10 * day) });
    expect(workspaceAccess(s, new Date(END.getTime() + 10 * day - 1))).toBe('grace');
    expect(workspaceAccess(s, new Date(END.getTime() + 10 * day))).toBe('locked');
  });

  it('un grace_until antérieur à la fin de période ne raccourcit jamais ni la période payée ni la grâce', () => {
    const s = sub({ grace_until: new Date(END.getTime() - 5 * day) });
    expect(workspaceAccess(s, new Date(END.getTime() - 1))).toBe('active');
    expect(workspaceAccess(s, new Date(END.getTime() + 2 * day))).toBe('grace');
  });

  it('annulation : la fin de période est le seul moment qui compte, avec la même grâce de 3 jours', () => {
    const s = sub({ status: 'canceled' });
    expect(workspaceAccess(s, new Date(END.getTime() - 1))).toBe('active');
    expect(workspaceAccess(s, END)).toBe('grace');
    expect(workspaceAccess(s, new Date(END.getTime() + 3 * day))).toBe('locked');
  });

  it('statut stocké « grace » : suit l’horloge (jamais de grâce infinie)', () => {
    const s = sub({ status: 'grace' });
    expect(workspaceAccess(s, new Date(END.getTime() + day))).toBe('grace');
    expect(workspaceAccess(s, new Date(END.getTime() + 4 * day))).toBe('locked');
  });

  it('statut d’abonnement « read_only » (hérité) : verrouillé même avant la fin de période', () => {
    expect(workspaceAccess(sub({ status: 'read_only' }), new Date(END.getTime() - day))).toBe(
      'locked',
    );
  });

  it('accepte des dates en texte ISO (lignes de la base)', () => {
    const s = sub({ period_end: END.toISOString(), grace_until: null });
    expect(workspaceAccess(s, new Date(END.getTime() + day))).toBe('grace');
  });
});

describe('workspaceAccess : essai', () => {
  it('essai en cours : actif ; terminé : VERROUILLÉ tout de suite, sans grâce', () => {
    const s = sub({ status: 'trialing' });
    expect(workspaceAccess(s, new Date(END.getTime() - 1))).toBe('active');
    expect(workspaceAccess(s, END)).toBe('locked');
  });
});

describe('workspaceAccess : horloge ou date illisible', () => {
  it('date de fin illisible ou heure invalide : verrouillé (on n’ouvre jamais par erreur)', () => {
    expect(workspaceAccess(sub({ period_end: 'pas une date' }), END)).toBe('locked');
    expect(workspaceAccess(sub(), new Date('pas une date'))).toBe('locked');
    expect(effectiveAccess('active', sub(), new Date(Number.NaN))).toBe('locked');
  });
});

describe('effectiveAccess : état stocké de l’espace + abonnement', () => {
  const now = new Date(END.getTime() - day);
  it('suspendu par l’administration : suspended, quoi que dise l’abonnement', () => {
    expect(effectiveAccess('suspended', sub(), now)).toBe('suspended');
  });
  it('read_only stocké (administration) : read_only même avec un abonnement en cours', () => {
    expect(effectiveAccess('read_only', sub(), now)).toBe('read_only');
  });
  it('actif et sans abonnement (l’essai démarre en S24) : active avec les limites Starter', () => {
    expect(effectiveAccess('active', null, now)).toBe('active');
  });
  it('actif avec abonnement échu : suit l’abonnement', () => {
    expect(effectiveAccess('active', sub(), new Date(END.getTime() + day))).toBe('grace');
    expect(effectiveAccess('active', sub(), new Date(END.getTime() + 5 * day))).toBe('locked');
  });
});

describe('graceEndsAt et lockAt : le moment exact (pour S19b, pause automatique)', () => {
  it('graceEndsAt : 3 jours après la fin de période, ou grace_until prolongé', () => {
    expect(graceEndsAt(sub())?.toISOString()).toBe(new Date(END.getTime() + 3 * day).toISOString());
    const longer = new Date(END.getTime() + 8 * day);
    expect(graceEndsAt(sub({ grace_until: longer }))?.getTime()).toBe(longer.getTime());
    expect(graceEndsAt(sub({ status: 'canceled' }))?.getTime()).toBe(END.getTime() + 3 * day);
  });

  it('pas de grâce pour un essai, un statut read_only ou une date illisible', () => {
    expect(graceEndsAt(sub({ status: 'trialing' }))).toBeNull();
    expect(graceEndsAt(sub({ status: 'read_only' }))).toBeNull();
    expect(graceEndsAt(sub({ period_end: 'x' }))).toBeNull();
  });

  it('lockAt : l’instant où l’espace devient verrouillé (fin d’essai, fin de grâce)', () => {
    expect(lockAt(sub({ status: 'trialing' }))?.getTime()).toBe(END.getTime());
    expect(lockAt(sub())?.getTime()).toBe(END.getTime() + 3 * day);
    expect(lockAt(sub({ status: 'read_only' }))).toBeNull();
    expect(lockAt(sub({ period_end: 'x' }))).toBeNull();
  });

  it('cohérence : à lockAt exactement, l’accès est « locked » ; une milliseconde avant, il ne l’est pas', () => {
    for (const s of [sub(), sub({ status: 'trialing' }), sub({ status: 'canceled' })]) {
      const at = lockAt(s);
      if (at === null) throw new Error('lockAt attendu');
      expect(workspaceAccess(s, at)).toBe('locked');
      expect(workspaceAccess(s, new Date(at.getTime() - 1))).not.toBe('locked');
    }
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
    expect(accessCause('active', sub({ status: 'canceled' }), now)).toBe('grace');
  });
  it('essai terminé', () => {
    expect(accessCause('active', sub({ status: 'trialing' }), now)).toBe('trial_ended');
  });
  it('abonnement terminé : formule payée après la grâce, ou statut read_only hérité', () => {
    expect(accessCause('active', sub(), new Date(END.getTime() + 5 * day))).toBe(
      'subscription_ended',
    );
    expect(accessCause('active', sub({ status: 'read_only' }), now)).toBe('subscription_ended');
  });
  it('décision de l’administration : lecture seule ou suspension posées sur l’espace', () => {
    expect(accessCause('read_only', null, now)).toBe('admin');
    expect(accessCause('read_only', sub({ status: 'trialing' }), now)).toBe('admin');
    expect(accessCause('suspended', sub(), now)).toBe('admin');
  });
});
