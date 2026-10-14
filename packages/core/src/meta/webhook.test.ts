// Enregistrement des événements de statut Meta (EC-META-08, EC-META-09, TR-SEC-04).
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { recordMetaStatusEvents, type MetaStatusEvent } from './webhook';
import { NOW, WS, ok } from './meta.test-helper';

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
  it('un événement déjà vu ne refait rien (200 sans traitement)', async () => {
    const svc = new FakeClient().reply(ok(false));
    expect(await recordMetaStatusEvents(ctx(svc), 'e1', [event('600000000001')])).toEqual({
      duplicate: true,
      recorded: 0,
      unknown: 0,
    });
    expect(svc.calls.map((c) => c.target)).toEqual(['rpc:record_webhook_event']);
    expect(svc.calls[0]?.ops).toContainEqual(['args', { p_provider: 'meta', p_event_id: 'e1' }]);
  });

  it('retrouve la campagne par son identifiant Meta et journalise le signal, sans changer son statut', async () => {
    const svc = new FakeClient().reply(ok(true), ok({ id: 'c1', workspace_id: WS }), ok(null));
    const out = await recordMetaStatusEvents(ctx(svc), 'e1', [event('600000000001')]);
    expect(out).toEqual({ duplicate: false, recorded: 1, unknown: 0 });
    const insert = svc.calls.find((c) => c.target === 'campaign_status_events');
    const [, row] = insert?.ops.find((op) => op[0] === 'insert') ?? [];
    expect(row).toEqual({
      workspace_id: WS,
      campaign_id: 'c1',
      ad_id: null,
      status: 'with_issues',
      source: 'webhook',
      payload: { level: 'AD', error_code: '1815', error_summary: 'Problème' },
    });
    expect(
      svc.calls.some((c) => c.target === 'campaigns' && c.ops.some((op) => op[0] === 'update')),
    ).toBe(false);
  });

  it('retrouve la campagne par l’ensemble de publicités, puis par la publicité', async () => {
    const svc = new FakeClient().reply(
      ok(true),
      ok(null),
      ok({ id: 'c2', workspace_id: WS }), // par ensemble
      ok(null),
      ok(null),
      ok(null),
      ok({ id: 'ad1', workspace_id: WS, campaign_id: 'c3' }), // par publicité
      ok(null),
    );
    const out = await recordMetaStatusEvents(ctx(svc), 'e1', [
      event('600000000002', { kind: 'in_process', detail: { status_name: 'PENDING_REVIEW' } }),
      event('600000000003'),
    ]);
    expect(out.recorded).toBe(2);
    const rows = svc.calls
      .filter((c) => c.target === 'campaign_status_events')
      .map((c) => c.ops.find((op) => op[0] === 'insert')?.[1]);
    expect(rows).toEqual([
      expect.objectContaining({ campaign_id: 'c2', ad_id: null, status: 'in_process' }),
      expect.objectContaining({ campaign_id: 'c3', ad_id: 'ad1', status: 'with_issues' }),
    ]);
  });

  it('EC-META-09 : un objet inconnu de nous est ignoré, sans erreur', async () => {
    const svc = new FakeClient().reply(ok(true), ok(null), ok(null), ok(null));
    expect(await recordMetaStatusEvents(ctx(svc), 'e1', [event('699999999999')])).toEqual({
      duplicate: false,
      recorded: 0,
      unknown: 1,
    });
    expect(svc.calls.some((c) => c.target === 'campaign_status_events')).toBe(false);
  });

  it('un identifiant qui n’a pas la forme d’un identifiant Meta n’interroge pas la base', async () => {
    const svc = new FakeClient().reply(ok(true));
    const out = await recordMetaStatusEvents(ctx(svc), 'e1', [event("1' or '1'='1"), event('abc')]);
    expect(out.unknown).toBe(2);
    expect(svc.calls.map((c) => c.target)).toEqual(['rpc:record_webhook_event']);
  });
});
