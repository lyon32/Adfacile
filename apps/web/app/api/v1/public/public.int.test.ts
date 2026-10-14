// Routes /api/v1/public/* contre la pile Supabase locale. Sans connexion : les cas 401, 404
// et 403 sont sans objet ; leurs cas propres sont la maintenance et la limite par IP.
import { describeRoute, na, setMaintenance, testServiceClient } from '@pubeka/testing';
import { afterAll, expect } from 'vitest';
import { GET as getFxRates } from './fx-rates/route';
import { GET as getMaintenance } from './maintenance/route';
import { GET as getPlans } from './plans/route';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let ipCounter = 0;
const ip = (): string => `192.0.2.${String((ipCounter += 1))}`;

function call(path: string, fromIp = ip()): Request {
  return new Request(`${APP}/api/v1/public/${path}`, { headers: { 'x-forwarded-for': fromIp } });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

afterAll(async () => {
  await setMaintenance(false);
});

describeRoute('getMaintenance', {
  unauthenticated: na('route publique : aucune session demandée'),
  otherWorkspace: na('route publique : aucun espace'),
  forbiddenRole: na('route publique : aucun rôle'),
  invalidBody: na('GET sans corps ni paramètre'),
  success: async () => {
    await setMaintenance(false);
    const res = await getMaintenance(call('maintenance'));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ active: false, message: null });
  },
  extra: {
    'répond pendant la maintenance, avec le message (EC-ADM-02)': async () => {
      await setMaintenance(true, 'Retour à 14 h');
      try {
        const res = await getMaintenance(call('maintenance'));
        expect(res.status).toBe(200);
        expect(await json(res)).toEqual({ active: true, message: 'Retour à 14 h' });
      } finally {
        await setMaintenance(false);
      }
    },
    '429 au-delà de 60 requêtes par minute et par IP, puis une autre IP passe': async () => {
      const same = '198.51.100.7';
      let last: Response | undefined;
      for (let i = 0; i < 61; i += 1) last = await getMaintenance(call('maintenance', same));
      expect(last?.status).toBe(429);
      expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(await last?.json()).toMatchObject({ code: 'rate_limited' });
      expect((await getMaintenance(call('maintenance'))).status).toBe(200);
    },
  },
});

describeRoute('listPlans', {
  unauthenticated: na('route publique : aucune session demandée'),
  otherWorkspace: na('route publique : aucun espace'),
  forbiddenRole: na('route publique : aucun rôle'),
  invalidBody: na('GET sans corps ni paramètre'),
  success: async () => {
    const res = await getPlans(call('plans'));
    expect(res.status).toBe(200);
    expect(res.headers.get('ratelimit-limit')).toBe('60');
    const { data } = (await res.json()) as { data: { code: string; price_xaf: number }[] };
    expect(data.map((p) => p.code)).toEqual(['starter', 'pro', 'business']);
    expect(data[0]).toEqual({
      code: 'starter',
      price_xaf: 5000,
      monthly_credits: 10,
      campaigns_per_period: 2,
      max_pages: 1,
      max_members: 1,
      features: {
        optimizer: false,
        pdf_export: false,
        comparative_stats: false,
        competitor_analysis: false,
      },
    });
    for (const p of data) expect(Number.isInteger(p.price_xaf)).toBe(true);
  },
  extra: {
    '503 pendant la maintenance': async () => {
      await setMaintenance(true);
      try {
        const res = await getPlans(call('plans'));
        expect(res.status).toBe(503);
        expect((await json(res)).code).toBe('maintenance');
      } finally {
        await setMaintenance(false);
      }
    },
  },
});

describeRoute('getFxRates', {
  unauthenticated: na('route publique : aucune session demandée'),
  otherWorkspace: na('route publique : aucun espace'),
  forbiddenRole: na('route publique : aucun rôle'),
  invalidBody: na('GET sans corps ni paramètre'),
  success: async () => {
    const svc = testServiceClient();
    await svc.from('exchange_rates').insert([
      {
        base: 'USD',
        quote: 'XAF',
        rate: 600,
        source: 'manual',
        fetched_at: '2026-01-01T00:00:00Z',
      },
      {
        base: 'USD',
        quote: 'XAF',
        rate: 605.5,
        source: 'saspay',
        fetched_at: new Date().toISOString(),
      },
    ]);
    const res = await getFxRates(call('fx-rates'));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { base: string; quote: string; rate: number }[];
    };
    expect(data.find((r) => r.quote === 'XAF')).toMatchObject({ rate: 605.5, source: 'saspay' });
    for (const r of data) {
      expect(r.base).toBe('USD');
      expect(['XAF', 'XOF']).toContain(r.quote);
      expect(r.rate).toBeGreaterThan(0);
    }
  },
});
