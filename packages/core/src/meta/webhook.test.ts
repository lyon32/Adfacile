// Enregistrement des événements de statut Meta (EC-META-09, TR-SEC-04). La transaction elle-même
// (marqueur + écriture) est prouvée par les tests PGlite de la migration 0007 et par les tests
// d'intégration de la route.
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { recordMetaStatusEvents, type MetaStatusEvent } from './webhook';
import { NOW, ok } from './meta.test-helper';

const ctx = (svc: FakeClient) => ({ requestId: 'req_TEST', svc: svc.asService(), now: () => NOW });
const event = (objectId: string, over: Partial<MetaStatusEvent> = {}): MetaStatusEvent => ({
  kind: 'with_issues',
  adAccountId: '100000000001',
  objectId,
  level: 'AD',
  detail: { error_code: '1815', error_summary: 'Problème' },
  ...over,
});

describe('recordMetaStatusEvents', () => {
  it('envoie tout en un seul appel : empreinte du corps et événements', async () => {
    const svc = new FakeClient().reply(ok(2));
    const out = await recordMetaStatusEvents(ctx(svc), 'e1', [
      event('600000000001'),
      event('600000000002', { kind: 'in_process', detail: { status_name: 'PENDING_REVIEW' } }),
    ]);
    expect(out).toEqual({ duplicate: false, recorded: 2, unknown: 0 });
    expect(svc.calls.map((c) => c.target)).toEqual(['rpc:record_meta_webhook']);
    expect(svc.calls[0]?.ops).toContainEqual([
      'args',
      {
        p_event_id: 'e1',
        p_events: [
          {
            kind: 'with_issues',
            object_id: '600000000001',
            payload: { level: 'AD', error_code: '1815', error_summary: 'Problème' },
          },
          {
            kind: 'in_process',
            object_id: '600000000002',
            payload: { level: 'AD', status_name: 'PENDING_REVIEW' },
          },
        ],
      },
    ]);
  });

  it('un événement déjà vu ne refait rien', async () => {
    const svc = new FakeClient().reply(ok(-1));
    expect(await recordMetaStatusEvents(ctx(svc), 'e1', [event('600000000001')])).toEqual({
      duplicate: true,
      recorded: 0,
      unknown: 0,
    });
  });

  it('EC-META-09 : les objets inconnus de Pubeka sont comptés comme ignorés', async () => {
    const svc = new FakeClient().reply(ok(1));
    expect(
      await recordMetaStatusEvents(ctx(svc), 'e1', [event('600000000001'), event('699999999999')]),
    ).toEqual({ duplicate: false, recorded: 1, unknown: 1 });
  });

  it('une écriture qui échoue remonte en erreur (5xx) : Meta réessaiera', async () => {
    const svc = new FakeClient().reply({ data: null, error: { message: 'panne de la base' } });
    await expect(
      recordMetaStatusEvents(ctx(svc), 'e1', [event('600000000001')]),
    ).rejects.toMatchObject({
      code: 'internal_error',
    });
  });
});
