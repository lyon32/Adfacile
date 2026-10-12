// Profil de l'utilisateur connecté (GET et PATCH /me). Lecture et écriture par le client
// soumis à la RLS, filtrées par l'identifiant de l'utilisateur (SECURITY_NOTES §2).
import { AppError } from '@pubeka/contracts';
import { one, type TablesUpdate } from '@pubeka/db';
import type { Ctx, Locale } from '../context';

export type Greeting = 'bonjour' | 'bonsoir' | 'hello' | 'good_evening';

export interface Me {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  ui_language: Locale;
  country_code: string | null;
  city: string | null;
  timezone: string;
  currency_display: 'XAF' | 'XOF';
  theme: 'light' | 'dark' | 'system';
  greeting: Greeting;
}

/** Champs modifiables (MeUpdate d'openapi.yaml) ; déjà validés par la route. */
export interface MeUpdate {
  first_name?: string | undefined;
  last_name?: string | undefined;
  phone?: string | undefined;
  ui_language?: Locale | undefined;
  country_code?: string | undefined;
  city?: string | undefined;
  currency_display?: 'XAF' | 'XOF' | undefined;
  theme?: 'light' | 'dark' | 'system' | undefined;
}

const EDITABLE = [
  'first_name',
  'last_name',
  'phone',
  'ui_language',
  'country_code',
  'city',
  'currency_display',
  'theme',
] as const satisfies readonly (keyof MeUpdate)[];

// Même règle que l'écran d'accueil (S04, TR-PLT-04) : « bonsoir » de 18 h à 3 h 59.
const MORNING_STARTS_AT_HOUR = 4;
const EVENING_STARTS_AT_HOUR = 18;

export function greetingFor(date: Date, timeZone: string, locale: Locale): Greeting {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .find((p) => p.type === 'hour')?.value,
  );
  const morning = hour >= MORNING_STARTS_AT_HOUR && hour < EVENING_STARTS_AT_HOUR;
  if (locale === 'en') return morning ? 'hello' : 'good_evening';
  return morning ? 'bonjour' : 'bonsoir';
}

const COLUMNS =
  'id, email, first_name, last_name, phone, ui_language, country_code, city, timezone, currency_display, theme';

interface ProfileRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  ui_language: string;
  country_code: string | null;
  city: string | null;
  timezone: string;
  currency_display: string;
  theme: string;
}

function toMe(row: ProfileRow, now: Date): Me {
  const ui_language = row.ui_language === 'en' ? 'en' : 'fr';
  const currency_display = row.currency_display === 'XOF' ? 'XOF' : 'XAF';
  const theme = row.theme === 'dark' || row.theme === 'system' ? row.theme : 'light';
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    ui_language,
    country_code: row.country_code,
    city: row.city,
    timezone: row.timezone,
    currency_display,
    theme,
    greeting: greetingFor(now, row.timezone, ui_language),
  };
}

export async function getMe(ctx: Ctx): Promise<Me> {
  const row = one<ProfileRow>(
    await ctx.db.from('profiles').select(COLUMNS).eq('id', ctx.user.id).maybeSingle(),
  );
  return toMe(row, ctx.now());
}

export async function updateMe(ctx: Ctx, patch: MeUpdate): Promise<Me> {
  const changes: TablesUpdate<'profiles'> = {};
  for (const field of EDITABLE) {
    const value = patch[field];
    if (value !== undefined) changes[field] = value;
  }
  if (Object.keys(changes).length === 0) return getMe(ctx);
  const res = await ctx.db
    .from('profiles')
    .update(changes)
    .eq('id', ctx.user.id)
    .select(COLUMNS)
    .maybeSingle();
  // Aucune ligne modifiée = profil absent pour cet utilisateur (RLS).
  if (res.error === null && res.data === null) throw new AppError('not_found');
  return toMe(one<ProfileRow>(res), ctx.now());
}
