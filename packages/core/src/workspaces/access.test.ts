// S19 : l'accès réel d'un espace vient de l'abonnement et de l'état posé par l'administration.
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { loadWorkspaceAccess } from './access';

const WS = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-12T09:00:00Z');

function clients(status: string | null, sub: Record<string, unknown> | null) {
  const db = new FakeClient().reply({
    data: status === null ? null : { status },
    error: null,
  });
  const svc = new FakeClient().reply({ data: sub === null ? [] : [sub], error: null });
  return { db, svc };
}

describe('loadWorkspaceAccess (TR-PAY-07)', () => {
  it('espace invisible pour le membre : null', async () => {
    const { db, svc } = clients(null, null);
    expect(await loadWorkspaceAccess(db.asDb(), svc.asService(), WS, NOW)).toBeNull();
  });

  it('abonnement échu depuis 1 jour : grâce', async () => {
    const { db, svc } = clients('active', {
      status: 'active',
      period_end: '2026-11-11T09:00:00Z',
      grace_until: null,
    });
    expect(await loadWorkspaceAccess(db.asDb(), svc.asService(), WS, NOW)).toBe('grace');
  });

  it('abonnement échu depuis 5 jours : VERROUILLÉ, même si workspaces.status est encore active', async () => {
    const { db, svc } = clients('active', {
      status: 'active',
      period_end: '2026-11-07T09:00:00Z',
      grace_until: null,
    });
    expect(await loadWorkspaceAccess(db.asDb(), svc.asService(), WS, NOW)).toBe('locked');
  });

  it('suspendu par l’administration : suspended', async () => {
    const { db, svc } = clients('suspended', {
      status: 'active',
      period_end: '2027-01-01T00:00:00Z',
      grace_until: null,
    });
    expect(await loadWorkspaceAccess(db.asDb(), svc.asService(), WS, NOW)).toBe('suspended');
  });

  it('sans abonnement : active (l’essai démarre en S24)', async () => {
    const { db, svc } = clients('active', null);
    expect(await loadWorkspaceAccess(db.asDb(), svc.asService(), WS, NOW)).toBe('active');
  });

  it('lit l’abonnement le plus récent de CET espace', async () => {
    const { db, svc } = clients('active', null);
    await loadWorkspaceAccess(db.asDb(), svc.asService(), WS, NOW);
    expect(svc.calls[0]?.target).toBe('subscriptions');
    expect(svc.calls[0]?.ops).toContainEqual(['eq', 'workspace_id', WS]);
    expect(svc.calls[0]?.ops).toContainEqual(['order', 'created_at', { ascending: false }]);
  });
});
