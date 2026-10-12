// Constructeurs (`build*`, TESTING §5.1) : objets complets et valides en mémoire ; le test
// ne précise que ce qui compte pour lui.
import type { Tables } from '@pubeka/db';
import { seededUuid } from '../ids';

export type ProfileRow = Tables<'profiles'>;
export type PlanRow = Tables<'plans'>;
export type WorkspaceRow = Tables<'workspaces'>;

export function buildProfile(over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: seededUuid('profile'),
    email: 'awa@example.com',
    first_name: 'Awa',
    last_name: 'Ndiaye',
    phone: null,
    ui_language: 'fr',
    country_code: 'CM',
    city: 'Douala',
    timezone: 'Africa/Douala',
    currency_display: 'XAF',
    theme: 'light',
    trial_used: false,
    created_at: '2026-10-10T09:00:00Z',
    updated_at: '2026-10-10T09:00:00Z',
    ...over,
  };
}

export function buildPlan(over: Partial<PlanRow> = {}): PlanRow {
  return {
    code: 'starter',
    // Valeurs de la migration 0001 (formule Starter).
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
    active: true,
    ...over,
  };
}

export function buildWorkspace(over: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    id: seededUuid('workspace'),
    name: 'Boutique Awa',
    owner_id: seededUuid('profile'),
    status: 'active',
    referral_code: 'AWA2026',
    referred_by_workspace_id: null,
    created_at: '2026-10-10T09:00:00Z',
    updated_at: '2026-10-10T09:00:00Z',
    ...over,
  };
}
