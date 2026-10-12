// Données publiques (API_SPEC §14 « Public ») : maintenance, formules, taux de change.
// Lues avec le client service : ces tables ne sont pas ouvertes au rôle anonyme.
import { AppError } from '@pubeka/contracts';
import { unwrap } from '@pubeka/db';
import type { ServiceCtx } from '../context';

export interface Maintenance {
  active: boolean;
  message: string | null;
}

export interface PublicPlan {
  code: 'starter' | 'pro' | 'business';
  price_xaf: number;
  monthly_credits: number;
  campaigns_per_period: number;
  max_pages: number;
  max_members: number;
  features: Record<string, boolean>;
}

export interface PublicFxRate {
  base: 'USD';
  quote: 'XAF' | 'XOF';
  rate: number;
  source: 'saspay' | 'fallback' | 'manual';
  fetched_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Réglage `maintenance` (jsonb) : `{ active, message? }` ; toute autre forme vaut « inactif ». */
export async function getMaintenance(ctx: ServiceCtx): Promise<Maintenance> {
  const value: unknown = unwrap(await ctx.svc.rpc('maintenance_status'));
  if (!isRecord(value)) return { active: false, message: null };
  return {
    active: value.active === true,
    message: typeof value.message === 'string' ? value.message : null,
  };
}

const PLAN_CODES = ['starter', 'pro', 'business'] as const;

export async function listPlans(ctx: ServiceCtx): Promise<PublicPlan[]> {
  const rows = unwrap(
    await ctx.svc
      .from('plans')
      .select(
        'code, price_xaf, monthly_credits, campaigns_per_period, max_pages, max_members, features',
      )
      .eq('active', true)
      .order('price_xaf', { ascending: true }),
  );
  return rows.map((row) => {
    const code = PLAN_CODES.find((c) => c === row.code);
    if (code === undefined) throw new AppError('internal_error');
    const features: Record<string, boolean> = {};
    if (isRecord(row.features)) {
      for (const [k, v] of Object.entries(row.features))
        if (typeof v === 'boolean') features[k] = v;
    }
    return {
      code,
      price_xaf: row.price_xaf,
      monthly_credits: row.monthly_credits,
      campaigns_per_period: row.campaigns_per_period,
      max_pages: row.max_pages,
      max_members: row.max_members,
      features,
    };
  });
}

const QUOTES = ['XAF', 'XOF'] as const;
const SOURCES = ['saspay', 'fallback', 'manual'] as const;

/** Dernier taux connu pour chaque monnaie (XAF, XOF). */
export async function listFxRates(ctx: ServiceCtx): Promise<PublicFxRate[]> {
  const out: PublicFxRate[] = [];
  for (const quote of QUOTES) {
    const rows = unwrap(
      await ctx.svc
        .from('exchange_rates')
        .select('quote, rate, source, fetched_at')
        .eq('base', 'USD')
        .eq('quote', quote)
        .order('fetched_at', { ascending: false })
        .limit(1),
    );
    const row = rows[0];
    if (row === undefined) continue;
    const source = SOURCES.find((s) => s === row.source);
    if (source === undefined) throw new AppError('internal_error');
    out.push({
      base: 'USD',
      quote,
      rate: row.rate,
      source,
      fetched_at: new Date(row.fetched_at).toISOString(),
    });
  }
  return out;
}
