-- =====================================================================
-- EasAds — migration 0001 : schéma initial et protections
-- Cible : Supabase (PostgreSQL 15+). Rôles Supabase : anon, authenticated, service_role.
-- Principes de sécurité (voir docs/architecture/SECURITE-BACKEND.md) :
--   1. RLS activée sur toutes les tables (public, private, audit).
--   2. Moindre privilège : anon n'a accès à RIEN ; authenticated reçoit des droits
--      table par table ; tout le reste passe par le serveur (service_role).
--   3. Secrets (jetons Meta, réglages internes) dans le schéma "private",
--      jamais exposé par l'API (PostgREST n'expose que "public").
--   4. Registres en ajout seul (crédits, journal d'administration) : toute
--      modification ou suppression est refusée par un déclencheur, même pour le serveur.
--   5. Aucune requête SQL dynamique (pas d'EXECUTE) : aucune injection possible
--      dans les fonctions ; search_path figé sur chaque fonction.
--   6. Administration : rôle admin + double vérification obligatoire (aal2).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Schémas et privilèges par défaut
-- ---------------------------------------------------------------------
create schema if not exists private;
create schema if not exists audit;

revoke all on schema private from public;
revoke all on schema audit   from public;
grant usage on schema private to authenticated, service_role;  -- uniquement pour appeler les fonctions autorisées
grant usage on schema audit   to service_role;

-- Aucune fonction n'est exécutable par défaut ; on accorde au cas par cas.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public  revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from anon, authenticated;

-- Aucune table nouvelle n'est lisible par anon/authenticated sans GRANT explicite.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Énumérations
-- ---------------------------------------------------------------------
create type public.workspace_status    as enum ('active','read_only','suspended');
create type public.member_role         as enum ('owner','editor','viewer');
create type public.subscription_status as enum ('trialing','active','grace','read_only','canceled');
create type public.payment_status      as enum ('pending','succeeded','failed','expired','manual');
create type public.payment_purpose     as enum ('subscription','upgrade','credits');
create type public.credit_bucket       as enum ('monthly','bonus','purchased');
create type public.credit_kind         as enum ('grant_monthly','purchase','reserve','consume','release','expire','admin_grant','admin_revoke','referral','trial');
create type public.job_status          as enum ('queued','running','completed','partial','failed','nsfw','canceled');
create type public.campaign_status     as enum ('draft','publishing','in_review','active','paused','rejected','ended','stopped','error');
create type public.platform            as enum ('meta','google','tiktok');
create type public.source_type         as enum ('website','app_link','image','social_post','document','text');
create type public.model_status        as enum ('testing','active','disabled');
create type public.quality_level       as enum ('standard','high');
create type public.ticket_status       as enum ('open','waiting_user','closed');

-- ---------------------------------------------------------------------
-- 2. Fonctions utilitaires (déclencheurs)
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.forbid_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Table en ajout seul : % interdit sur %', tg_op, tg_table_name
    using errcode = '42501';
end $$;

-- ---------------------------------------------------------------------
-- 3. Comptes, espaces, équipe
-- ---------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  first_name       text check (char_length(first_name) <= 80),
  last_name        text check (char_length(last_name)  <= 80),
  email            text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  phone            text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  ui_language      text not null default 'fr' check (ui_language in ('fr','en')),
  country_code     char(2) check (country_code ~ '^[A-Z]{2}$'),
  city             text check (char_length(city) <= 120),
  timezone         text not null default 'Africa/Douala' check (char_length(timezone) <= 64),
  currency_display text not null default 'XAF' check (currency_display in ('XAF','XOF')),
  theme            text not null default 'light' check (theme in ('light','dark','system')),
  trial_used       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.plans (
  code                 text primary key check (code in ('starter','pro','business')),
  price_xaf            bigint not null check (price_xaf > 0),
  monthly_credits      int    not null check (monthly_credits >= 0),
  campaigns_per_period int    not null check (campaigns_per_period >= 0),
  max_pages            int    not null check (max_pages >= 1),
  max_members          int    not null check (max_members >= 1),
  features             jsonb  not null default '{}'::jsonb,
  active               boolean not null default true
);

create table public.workspaces (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(name) between 1 and 120),
  owner_id                 uuid not null references public.profiles(id),
  status                   public.workspace_status not null default 'active',
  referral_code            text unique check (referral_code ~ '^[A-Z0-9]{6,12}$'),
  referred_by_workspace_id uuid references public.workspaces(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id)   on delete cascade,
  role         public.member_role not null,
  invited_by   uuid references public.profiles(id),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null check (char_length(email) <= 254),
  role         public.member_role not null check (role <> 'owner'),
  token_hash   text not null unique,          -- seul le hachage est stocké, jamais le jeton
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Fonctions d'autorisation utilisées par les politiques RLS
--    SECURITY DEFINER + search_path vide + aucune requête dynamique.
-- ---------------------------------------------------------------------
create or replace function private.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.profile_id = (select auth.uid())
  );
$$;

create or replace function private.has_role(ws uuid, roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.profile_id = (select auth.uid()) and m.role = any(roles)
  );
$$;

-- Espace modifiable : ni suspendu ni en lecture seule.
create or replace function private.ws_writable(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces w where w.id = ws and w.status = 'active');
$$;

-- Administrateur : présent dans private.admin_users, non verrouillé, ET session en double vérification (aal2).
create table private.admin_users (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.admin_users a
    where a.profile_id = (select auth.uid())
      and (a.locked_until is null or a.locked_until < now())
  )
  and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

grant execute on function private.is_member(uuid)                         to authenticated, service_role;
grant execute on function private.has_role(uuid, public.member_role[])    to authenticated, service_role;
grant execute on function private.ws_writable(uuid)                       to authenticated, service_role;
grant execute on function private.is_admin()                              to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Abonnements et paiements
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  plan_code     text not null references public.plans(code),
  status        public.subscription_status not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null check (period_end > period_start),
  grace_until   timestamptz,
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete restrict,
  purpose              public.payment_purpose not null,
  plan_code            text references public.plans(code),
  credits_qty          int check (credits_qty is null or credits_qty between 1 and 1000),
  amount_xaf           bigint not null check (amount_xaf > 0),
  fees_xaf             bigint not null default 0 check (fees_xaf >= 0),
  provider             text not null default 'saspay' check (provider = 'saspay'),
  provider_checkout_id text,
  provider_payment_id  text unique,
  idempotency_key      uuid not null unique,
  method               text check (char_length(method) <= 40),
  status               public.payment_status not null default 'pending',
  paid_at              timestamptz,
  raw_webhook          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.payment_proofs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  payment_id      uuid references public.payments(id),
  transaction_ref text not null check (char_length(transaction_ref) between 3 and 80),
  file_path       text not null check (char_length(file_path) <= 300),
  status          text not null default 'submitted' check (status in ('submitted','accepted','rejected')),
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  note            text check (char_length(note) <= 1000),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Registre des crédits (ajout seul)
-- ---------------------------------------------------------------------
create table public.credit_ledger (
  id                bigint generated always as identity primary key,
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  bucket            public.credit_bucket not null,
  kind              public.credit_kind not null,
  amount            int not null check (amount <> 0 or kind = 'consume'),
  period_end        timestamptz,
  generation_job_id uuid,
  payment_id        uuid references public.payments(id),
  admin_id          uuid references public.profiles(id),
  reason            text check (char_length(reason) <= 300),
  created_at        timestamptz not null default now(),
  check (kind not in ('admin_grant','admin_revoke') or (admin_id is not null and reason is not null))
);
create trigger credit_ledger_no_update before update or delete on public.credit_ledger
  for each row execute function private.forbid_change();
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function private.forbid_change();

create view public.credit_balances with (security_invoker = true) as
  select workspace_id, bucket, sum(amount)::int as balance
  from public.credit_ledger group by workspace_id, bucket;

create table public.usage_counters (
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  period_start        timestamptz not null,
  campaigns_published int not null default 0 check (campaigns_published >= 0),
  generations_date    date,
  generations_today   int not null default 0 check (generations_today >= 0),
  primary key (workspace_id, period_start)
);

-- ---------------------------------------------------------------------
-- 7. Meta : connexions (jetons dans private), comptes, Pages
-- ---------------------------------------------------------------------
create table public.meta_connections (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  token_type        text not null check (token_type in ('system_user','user')),
  expires_at        timestamptz,
  business_id       text check (business_id ~ '^[0-9]{5,25}$'),
  status            text not null default 'ok' check (status in ('ok','expiring','expired','revoked')),
  scopes            text[] not null default '{}',
  last_health_check jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Jeton chiffré AES-256-GCM par l'application (clé hors base). Jamais exposé par l'API.
create table private.meta_tokens (
  connection_id    uuid primary key references public.meta_connections(id) on delete cascade,
  ciphertext       bytea not null,
  iv               bytea not null check (octet_length(iv) = 12),
  auth_tag         bytea not null check (octet_length(auth_tag) = 16),
  key_version      int   not null check (key_version >= 1),
  updated_at       timestamptz not null default now()
);

create table public.ad_accounts (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  meta_connection_id uuid not null references public.meta_connections(id) on delete cascade,
  meta_ad_account_id text not null check (meta_ad_account_id ~ '^act_[0-9]{5,25}$'),
  name               text check (char_length(name) <= 200),
  currency           char(3),
  has_payment_method boolean,
  is_active          boolean not null default false,
  vat_country        char(2),
  unique (workspace_id, meta_ad_account_id)
);

create table public.pages (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  meta_page_id         text not null check (meta_page_id ~ '^[0-9]{5,25}$'),
  name                 text check (char_length(name) <= 200),
  instagram_account_id text check (instagram_account_id ~ '^[0-9]{5,25}$'),
  whatsapp_number      text check (whatsapp_number ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_linked      boolean not null default false,
  pixel_ids            text[] not null default '{}',
  ad_language          text not null default 'fr' check (ad_language in ('fr','en')),
  ad_address           text not null default 'vous' check (ad_address in ('vous','tu')),
  active               boolean not null default false,
  unique (workspace_id, meta_page_id)
);

create table public.page_activations (
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  page_id           uuid not null references public.pages(id) on delete cascade,
  period_start      timestamptz not null,
  first_campaign_at timestamptz,
  primary key (workspace_id, page_id, period_start)
);

create table public.brand_kits (
  page_id      uuid primary key references public.pages(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  logo_path    text check (char_length(logo_path) <= 300),
  colors       jsonb not null default '{}'::jsonb,
  font         text check (char_length(font) <= 60),
  phone        text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp     text check (whatsapp ~ '^\+[1-9][0-9]{6,14}$'),
  tagline      text check (char_length(tagline) <= 120),
  tone         text check (tone in ('premium','friendly','bold','serious','playful')),
  show_number_on_visuals boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Sources, fiches business, agents
-- ---------------------------------------------------------------------
create table public.sources (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  page_id        uuid references public.pages(id) on delete set null,
  type           public.source_type not null,
  url            text check (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
  file_path      text check (char_length(file_path) <= 300),
  extracted_text text check (char_length(extracted_text) <= 200000),
  extractor      text check (extractor in ('internal','jina')),
  status         text not null default 'ok' check (status in ('ok','unreadable')),
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);

create table public.business_profiles (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  page_id           uuid references public.pages(id) on delete set null,
  profile           jsonb not null,
  conflicts         jsonb not null default '[]'::jsonb,
  sensitive_signals text[] not null default '{}',
  flags             text[] not null default '{}',
  questions         jsonb not null default '[]'::jsonb,
  answers           jsonb not null default '[]'::jsonb,
  version           int not null default 1,
  created_at        timestamptz not null default now()
);

create table public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid references public.workspaces(id) on delete set null,
  agent          text not null check (agent in ('analyste','stratege','designer','moderateur','optimiseur','aide')),
  model          text not null check (char_length(model) <= 120),
  prompt_version text not null check (char_length(prompt_version) <= 40),
  input          jsonb,
  output         jsonb,
  valid_schema   boolean not null,
  retried        boolean not null default false,
  tokens_in      int, tokens_out int,
  cost_usd       numeric(12,6),
  latency_ms     int,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. Médias : fournisseurs, catalogue, routage, générations, visuels
-- ---------------------------------------------------------------------
create table public.media_providers (
  code               text primary key check (code in ('fal','higgsfield','byteplus')),
  status             text not null default 'active' check (status in ('active','paused')),
  monthly_budget_usd numeric(10,2) not null default 15,
  concurrency_limit  int not null check (concurrency_limit >= 1),
  retention_hours    int not null check (retention_hours >= 1)
);

create table private.provider_balances (
  provider_code text primary key references public.media_providers(code),
  balance_usd   numeric(12,4),
  checked_at    timestamptz
);

create table public.media_models (
  id              text primary key check (id ~ '^[a-z0-9-]+:[a-z0-9./_-]+$'),
  provider_code   text not null references public.media_providers(code),
  endpoint        text not null,
  capabilities    text[] not null,
  display_name    text not null,
  card            jsonb not null default '{}'::jsonb,
  max_references  int not null default 0 check (max_references between 0 and 50),
  aspect_ratios   text[] not null default '{}',
  status          public.model_status not null default 'testing',
  recommended_for text[] not null default '{}',
  sort_order      int not null default 100,
  test_results    jsonb
);

create table public.model_quality_levels (
  model_id            text not null references public.media_models(id) on delete cascade,
  level               public.quality_level not null,
  provider_params     jsonb not null,
  unit                text not null check (unit in ('image','second')),
  cost_usd            numeric(12,6) not null check (cost_usd >= 0),
  min_margin          numeric(4,3) not null check (min_margin between 0 and 0.95),
  min_credits         int not null check (min_credits >= 1),
  credits             int not null check (credits >= 1),
  durations_allowed   int[],
  credits_by_duration jsonb,
  est_seconds         int,
  primary key (model_id, level)
);

create table public.routing_rules (
  capability        text primary key,
  primary_model_id  text not null references public.media_models(id),
  fallback_model_id text references public.media_models(id),
  max_wait_seconds  int not null default 60 check (max_wait_seconds between 10 and 600),
  active            boolean not null default true
);

create table public.generation_jobs (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  page_id              uuid references public.pages(id) on delete set null,
  created_by           uuid references public.profiles(id),
  capability           text not null,
  model_id             text not null references public.media_models(id),
  level                public.quality_level not null,
  duration_s           int check (duration_s is null or duration_s between 1 and 60),
  count                int not null default 3 check (count between 1 and 6),
  credits_reserved     int not null check (credits_reserved >= 0),
  status               public.job_status not null default 'queued',
  provider_request_ids text[] not null default '{}',
  queue_position       int,
  queued_at            timestamptz not null default now(),
  started_at           timestamptz,
  finished_at          timestamptz,
  fallback_offered     boolean not null default false,
  fallback_accepted    boolean not null default false,
  cost_usd_actual      numeric(12,6),
  error                text check (char_length(error) <= 1000)
);
-- Un identifiant de requête fournisseur ne peut être rattaché qu'à une seule génération (pas de double facturation).
create table private.provider_requests (
  provider_code     text not null references public.media_providers(code),
  request_id        text not null,
  generation_job_id uuid not null references public.generation_jobs(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (provider_code, request_id)
);

create table public.visuals (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  page_id           uuid references public.pages(id) on delete set null,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  kind              text not null check (kind in ('image','video')),
  spec              jsonb not null,
  scene_path        text,
  render_paths      jsonb not null default '{}'::jsonb,
  layers            jsonb not null default '[]'::jsonb,
  chosen            boolean not null default false,
  used_in_campaign  boolean not null default false,
  files_expire_at   timestamptz,
  files_deleted_at  timestamptz,
  created_at        timestamptz not null default now()
);

create table public.visual_references (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visual_id    uuid not null references public.visuals(id) on delete cascade,
  source       text not null check (source in ('user_upload','chosen_visual','library')),
  file_path    text,
  reference_id uuid,
  takeaway     text check (char_length(takeaway) <= 300)
);

create table public.reference_library (
  id        uuid primary key default gen_random_uuid(),
  file_path text not null,
  sector    text, style text, format text,
  score     numeric(3,2) check (score between 0 and 5),
  notes     text,
  active    boolean not null default true
);

create table public.provider_usage (
  provider_code text not null references public.media_providers(code),
  month         date not null,
  spent_usd     numeric(12,4) not null default 0,
  requests      int not null default 0,
  failures      int not null default 0,
  avg_wait_s    numeric(8,2),
  avg_gen_s     numeric(8,2),
  primary key (provider_code, month)
);

-- ---------------------------------------------------------------------
-- 10. Campagnes
-- ---------------------------------------------------------------------
create table public.campaigns (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  page_id                uuid references public.pages(id) on delete set null,
  ad_account_id          uuid references public.ad_accounts(id) on delete set null,
  created_by             uuid references public.profiles(id),
  platform               public.platform not null default 'meta',
  name                   text not null check (char_length(name) between 1 and 200),
  objective              text check (objective in ('OUTCOME_ENGAGEMENT','OUTCOME_TRAFFIC','OUTCOME_AWARENESS','OUTCOME_SALES')),
  destination            text check (destination in ('WHATSAPP','MESSENGER','INSTAGRAM_DIRECT','WEBSITE','APP','ON_POST','NONE')),
  geo                    jsonb not null default '{}'::jsonb,
  targeting              jsonb not null default '{}'::jsonb,
  daily_budget_usd_cents int check (daily_budget_usd_cents is null or daily_budget_usd_cents >= 100),
  vat_rate               numeric(5,4) check (vat_rate between 0 and 0.5),
  fx_rate_xaf            numeric(12,4) check (fx_rate_xaf > 0),
  start_date             date,
  end_date               date check (end_date is null or start_date is null or end_date >= start_date),
  copy                   jsonb not null default '{}'::jsonb,
  tracking               jsonb,
  ab_test                boolean not null default false,
  status                 public.campaign_status not null default 'draft',
  meta_campaign_id       text check (meta_campaign_id ~ '^[0-9]{5,25}$'),
  meta_adset_id          text check (meta_adset_id ~ '^[0-9]{5,25}$'),
  published_at           timestamptz,
  editable               boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.campaign_proposals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  version      int not null,
  proposal     jsonb not null,
  chosen       boolean not null default false,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (campaign_id, version)
);

create table public.ads (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  visual_id        uuid references public.visuals(id) on delete set null,
  format           text check (format in ('4:5','9:16','1:1','1.91:1')),
  meta_ad_id       text check (meta_ad_id ~ '^[0-9]{5,25}$'),
  meta_creative_id text check (meta_creative_id ~ '^[0-9]{5,25}$'),
  status           text,
  variant          text check (variant in ('A','B'))
);

create table public.campaign_status_events (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  ad_id        uuid references public.ads(id) on delete set null,
  status       text not null,
  source       text not null check (source in ('webhook','poll','user')),
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create table public.rejections (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  campaign_id           uuid not null references public.campaigns(id) on delete cascade,
  ad_id                 uuid references public.ads(id) on delete set null,
  meta_reason           text,
  report                jsonb,
  memory_pattern        text,
  fixed_and_republished boolean not null default false,
  created_at            timestamptz not null default now()
);

create table private.rejection_memory (
  pattern   text primary key,
  rule_id   text,
  count     int not null default 1,
  last_seen timestamptz not null default now()
);

create table public.stats_daily (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  ad_id           uuid references public.ads(id) on delete cascade,
  date            date not null,
  spend_usd_cents int not null default 0,
  impressions     int not null default 0,
  reach           int not null default 0,
  clicks          int not null default 0,
  results         int not null default 0,
  result_type     text,
  cpm_usd_cents   int, ctr numeric(8,4), frequency numeric(8,4),
  pixel_events    jsonb,
  synced_at       timestamptz not null default now()
);
create unique index stats_daily_uniq on public.stats_daily (campaign_id, coalesce(ad_id, '00000000-0000-0000-0000-000000000000'::uuid), date);

create table public.optimizer_recommendations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  action       text not null check (action in ('pause','resume','budget_up','budget_down','new_visual','extend','wait')),
  params       jsonb, evidence text, message text,
  confidence   numeric(3,2) check (confidence between 0 and 1),
  status       text not null default 'proposed' check (status in ('proposed','applied','dismissed')),
  decided_by   uuid references public.profiles(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11. Notifications, support, parrainage
-- ---------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (char_length(type) <= 60),
  title        text not null check (char_length(title) <= 200),
  body         text check (char_length(body) <= 2000),
  link         text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),   -- lien interne uniquement
  read_at      timestamptz,
  emailed_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table public.notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  in_app     boolean not null default true,
  email      boolean not null default true,
  primary key (profile_id, type)
);

create table public.tickets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid not null references public.profiles(id),
  subject      text not null check (char_length(subject) between 3 and 200),
  category     text not null check (category in ('payment','campaign','account','other')),
  status       public.ticket_status not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.ticket_messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  author_type  text not null check (author_type in ('user','admin')),
  author_id    uuid not null references public.profiles(id),
  body         text not null check (char_length(body) between 1 and 10000),
  emailed_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table public.attachments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  ticket_message_id uuid not null references public.ticket_messages(id) on delete cascade,
  file_path         text not null,
  mime              text not null check (mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  size              int not null check (size between 1 and 20971520)
);

create table public.referrals (
  id                    uuid primary key default gen_random_uuid(),
  referrer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  referred_workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  status                text not null default 'signed_up' check (status in ('signed_up','paid','rewarded')),
  rewarded_at           timestamptz,
  check (referrer_workspace_id <> referred_workspace_id)
);

-- ---------------------------------------------------------------------
-- 12. Référentiels, paramètres, contenu public
-- ---------------------------------------------------------------------
create table public.countries (
  code             char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name_fr          text not null, name_en text not null,
  currency         char(3) not null,
  timezone_default text not null,
  active           boolean not null default true
);

create table public.vat_rates (
  country_code char(2) not null references public.countries(code),
  rate         numeric(5,4) not null check (rate between 0 and 0.5),
  source_url   text, verified_at date,
  valid_from   date not null default current_date,
  primary key (country_code, valid_from)
);

create table public.exchange_rates (
  id         bigint generated always as identity primary key,
  base       char(3) not null default 'USD',
  quote      char(3) not null check (quote in ('XAF','XOF')),
  rate       numeric(12,4) not null check (rate > 0),
  source     text not null check (source in ('saspay','fallback','manual')),
  fetched_at timestamptz not null default now()
);

create table private.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- Seul le mode maintenance est lisible publiquement, via une fonction dédiée.
create or replace function public.maintenance_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value from private.app_settings s where s.key = 'maintenance'), '{"active":false}'::jsonb);
$$;
grant execute on function public.maintenance_status() to anon, authenticated;

create table public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  locale       text not null check (locale in ('fr','en')),
  slug         text not null check (slug ~ '^[a-z0-9-]{3,120}$'),
  title        text not null, description text,
  body_md      text not null,
  status       text not null default 'draft_ai' check (status in ('draft_ai','reviewed','published')),
  published_at timestamptz,
  keywords     text[] not null default '{}',
  unique (locale, slug)
);

create table public.help_articles (
  id         uuid primary key default gen_random_uuid(),
  locale     text not null check (locale in ('fr','en')),
  slug       text not null check (slug ~ '^[a-z0-9-]{3,120}$'),
  category   text not null, title text not null, body_md text not null,
  public     boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (locale, slug)
);

-- ---------------------------------------------------------------------
-- 13. Journal d'administration (ajout seul, schéma audit non exposé)
-- ---------------------------------------------------------------------
create table audit.admin_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid not null,
  action      text not null,
  target_type text, target_id text,
  before      jsonb, after jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create trigger admin_log_no_update before update or delete on audit.admin_log
  for each row execute function private.forbid_change();
create trigger admin_log_no_truncate before truncate on audit.admin_log
  for each statement execute function private.forbid_change();

-- ---------------------------------------------------------------------
-- 14. Déclencheurs updated_at
-- ---------------------------------------------------------------------
create trigger t_profiles_upd      before update on public.profiles         for each row execute function private.touch_updated_at();
create trigger t_workspaces_upd    before update on public.workspaces       for each row execute function private.touch_updated_at();
create trigger t_subscriptions_upd before update on public.subscriptions    for each row execute function private.touch_updated_at();
create trigger t_payments_upd      before update on public.payments         for each row execute function private.touch_updated_at();
create trigger t_meta_conn_upd     before update on public.meta_connections for each row execute function private.touch_updated_at();
create trigger t_campaigns_upd     before update on public.campaigns        for each row execute function private.touch_updated_at();
create trigger t_tickets_upd       before update on public.tickets          for each row execute function private.touch_updated_at();

-- Un membre ne peut pas changer le workspace_id d'une ligne existante (pas de « déplacement » vers un autre espace).
create or replace function private.lock_workspace_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id ne peut pas être modifié' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_campaigns_ws  before update on public.campaigns  for each row execute function private.lock_workspace_id();
create trigger t_visuals_ws    before update on public.visuals    for each row execute function private.lock_workspace_id();
create trigger t_pages_ws      before update on public.pages      for each row execute function private.lock_workspace_id();
create trigger t_brand_kits_ws before update on public.brand_kits for each row execute function private.lock_workspace_id();

-- ---------------------------------------------------------------------
-- 15. Crédits : fonctions serveur uniquement (service_role)
-- ---------------------------------------------------------------------
-- Réserve des crédits pour une génération. Verrou par espace pour éviter les dépenses en double
-- lors de requêtes simultanées. Ordre : mensuels, bonus, achetés. Retourne false si solde insuffisant.
create or replace function private.reserve_credits(ws uuid, needed int, job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  b public.credit_bucket;
  avail int;
  take int;
  remaining int := needed;
begin
  if needed is null or needed <= 0 or needed > 500 then
    raise exception 'Montant de crédits invalide' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(ws::text, 0));
  if (select coalesce(sum(amount), 0) from public.credit_ledger where workspace_id = ws) < needed then
    return false;
  end if;
  foreach b in array array['monthly','bonus','purchased']::public.credit_bucket[] loop
    exit when remaining = 0;
    select coalesce(sum(amount), 0) into avail from public.credit_ledger where workspace_id = ws and bucket = b;
    take := least(avail, remaining);
    if take > 0 then
      insert into public.credit_ledger (workspace_id, bucket, kind, amount, generation_job_id)
      values (ws, b, 'reserve', -take, job);
      remaining := remaining - take;
    end if;
  end loop;
  return remaining = 0;
end $$;

-- Rend les crédits réservés d'une génération (échec, contenu refusé, annulation). Idempotent.
create or replace function private.release_credits(job uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  total int := 0;
begin
  if exists (select 1 from public.credit_ledger where generation_job_id = job and kind in ('release','consume')) then
    return 0;   -- déjà rendus ou déjà consommés : on ne rend jamais deux fois
  end if;
  for r in select workspace_id, bucket, sum(amount) as amt from public.credit_ledger
           where generation_job_id = job and kind = 'reserve' group by workspace_id, bucket loop
    insert into public.credit_ledger (workspace_id, bucket, kind, amount, generation_job_id)
    values (r.workspace_id, r.bucket, 'release', -r.amt, job);
    total := total - r.amt;
  end loop;
  return total;
end $$;

-- Confirme la consommation (succès). Idempotent.
create or replace function private.consume_credits(job uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.credit_ledger where generation_job_id = job and kind in ('consume','release')) then
    return;
  end if;
  insert into public.credit_ledger (workspace_id, bucket, kind, amount, generation_job_id)
  select workspace_id, bucket, 'consume', 0, job from public.credit_ledger
  where generation_job_id = job and kind = 'reserve' limit 1;
end $$;

revoke all on function private.reserve_credits(uuid,int,uuid) from public, anon, authenticated;
revoke all on function private.release_credits(uuid)          from public, anon, authenticated;
revoke all on function private.consume_credits(uuid)          from public, anon, authenticated;
grant execute on function private.reserve_credits(uuid,int,uuid) to service_role;
grant execute on function private.release_credits(uuid)          to service_role;
grant execute on function private.consume_credits(uuid)          to service_role;

-- ---------------------------------------------------------------------
-- 16. RLS : activée partout (non « forcée » : le propriétaire des tables ne sert qu'aux migrations)
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('public','private','audit') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;
-- (Seul usage d'EXECUTE de toute la migration : noms de tables issus du catalogue système, protégés par %I, exécuté une fois à l'installation.)

-- Tables des schémas private et audit : AUCUNE politique → inaccessibles à anon et authenticated.
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all tables in schema audit   from public, anon, authenticated;
grant all on all tables in schema private to service_role;
grant select, insert on audit.admin_log to service_role;

-- Par défaut, aucun droit pour anon sur public.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant all on all tables in schema public to service_role;

-- ---- profiles : chacun ne voit et ne modifie que son profil
grant select, update (first_name, last_name, phone, ui_language, country_code, city, timezone, currency_display, theme)
  on public.profiles to authenticated;
create policy profiles_self_read   on public.profiles for select to authenticated using (id = (select auth.uid()) or private.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---- plans, countries, vat_rates, exchange_rates : lecture seule (connectés)
grant select on public.plans, public.countries, public.vat_rates, public.exchange_rates to authenticated;
create policy plans_read     on public.plans          for select to authenticated using (active);
create policy countries_read on public.countries      for select to authenticated using (true);
create policy vat_read       on public.vat_rates      for select to authenticated using (true);
create policy fx_read        on public.exchange_rates for select to authenticated using (true);

-- ---- workspaces
grant select, update (name) on public.workspaces to authenticated;
create policy ws_read   on public.workspaces for select to authenticated using (private.is_member(id) or private.is_admin());
create policy ws_rename on public.workspaces for update to authenticated
  using (private.has_role(id, array['owner']::public.member_role[]))
  with check (private.has_role(id, array['owner']::public.member_role[]));

-- ---- workspace_members : lecture par les membres ; gestion par le serveur (limites de formule)
grant select on public.workspace_members to authenticated;
create policy members_read on public.workspace_members for select to authenticated using (private.is_member(workspace_id) or private.is_admin());

-- ---- invitations : propriétaire uniquement (le jeton n'est jamais lisible, seul son hachage est stocké)
grant select (id, workspace_id, email, role, expires_at, accepted_at, created_at) on public.invitations to authenticated;
create policy inv_read on public.invitations for select to authenticated using (private.has_role(workspace_id, array['owner']::public.member_role[]));

-- ---- Facturation : lecture propriétaire, écriture serveur uniquement
grant select on public.subscriptions, public.payments to authenticated;
create policy subs_read on public.subscriptions for select to authenticated
  using (private.has_role(workspace_id, array['owner']::public.member_role[]) or private.is_admin());
create policy pay_read  on public.payments for select to authenticated
  using (private.has_role(workspace_id, array['owner']::public.member_role[]) or private.is_admin());

grant select, insert (workspace_id, payment_id, transaction_ref, file_path) on public.payment_proofs to authenticated;
create policy proofs_read   on public.payment_proofs for select to authenticated
  using (private.has_role(workspace_id, array['owner']::public.member_role[]) or private.is_admin());
create policy proofs_insert on public.payment_proofs for insert to authenticated
  with check (private.has_role(workspace_id, array['owner']::public.member_role[]) and status = 'submitted');

-- ---- Crédits : lecture par les membres ; aucune écriture côté client
grant select on public.credit_ledger, public.credit_balances, public.usage_counters to authenticated;
create policy ledger_read on public.credit_ledger  for select to authenticated using (private.is_member(workspace_id) or private.is_admin());
create policy usage_read  on public.usage_counters for select to authenticated using (private.is_member(workspace_id));

-- ---- Meta (le jeton reste dans private.meta_tokens, jamais lisible)
grant select on public.meta_connections, public.ad_accounts to authenticated;
create policy metaconn_read on public.meta_connections for select to authenticated using (private.is_member(workspace_id));
create policy adacc_read    on public.ad_accounts      for select to authenticated using (private.is_member(workspace_id));

grant select, update (ad_language, ad_address) on public.pages to authenticated;
create policy pages_read   on public.pages for select to authenticated using (private.is_member(workspace_id));
create policy pages_update on public.pages for update to authenticated
  using (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and private.ws_writable(workspace_id))
  with check (private.has_role(workspace_id, array['owner','editor']::public.member_role[]));

grant select on public.page_activations to authenticated;
create policy pact_read on public.page_activations for select to authenticated using (private.is_member(workspace_id));

grant select, insert, update on public.brand_kits to authenticated;
create policy bk_read  on public.brand_kits for select to authenticated using (private.is_member(workspace_id));
create policy bk_write on public.brand_kits for insert to authenticated
  with check (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and private.ws_writable(workspace_id)
              and exists (select 1 from public.pages p where p.id = page_id and p.workspace_id = brand_kits.workspace_id));
create policy bk_upd   on public.brand_kits for update to authenticated
  using (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and private.ws_writable(workspace_id))
  with check (private.has_role(workspace_id, array['owner','editor']::public.member_role[]));

-- ---- Sources, fiches, agents : lecture membres ; création par le serveur (lecture des sites côté serveur, anti-SSRF)
grant select on public.sources, public.business_profiles to authenticated;
create policy src_read on public.sources           for select to authenticated using (private.is_member(workspace_id));
create policy bp_read  on public.business_profiles for select to authenticated using (private.is_member(workspace_id));
-- agent_runs : invisible aux clients (prompts, coûts) ; administrateur seulement
grant select on public.agent_runs to authenticated;
create policy runs_admin on public.agent_runs for select to authenticated using (private.is_admin());

-- ---- Catalogue médias : seuls les modèles actifs sont visibles ; fournisseurs et routage invisibles
grant select (id, provider_code, capabilities, display_name, card, max_references, aspect_ratios, status, recommended_for, sort_order)
  on public.media_models to authenticated;
create policy models_read on public.media_models for select to authenticated using (status = 'active' or private.is_admin());
grant select (model_id, level, unit, credits, credits_by_duration, durations_allowed, est_seconds)
  on public.model_quality_levels to authenticated;
create policy levels_read on public.model_quality_levels for select to authenticated
  using (exists (select 1 from public.media_models m where m.id = model_id and (m.status = 'active' or private.is_admin())));
grant select on public.media_providers, public.routing_rules, public.provider_usage, public.reference_library to authenticated;
create policy prov_admin  on public.media_providers   for select to authenticated using (private.is_admin());
create policy route_admin on public.routing_rules     for select to authenticated using (private.is_admin());
create policy usage_admin on public.provider_usage    for select to authenticated using (private.is_admin());
create policy lib_admin   on public.reference_library for select to authenticated using (private.is_admin());

-- ---- Générations et visuels
grant select on public.generation_jobs to authenticated;
create policy jobs_read on public.generation_jobs for select to authenticated using (private.is_member(workspace_id));
grant select, update (chosen) on public.visuals to authenticated;
create policy vis_read   on public.visuals for select to authenticated using (private.is_member(workspace_id));
create policy vis_choose on public.visuals for update to authenticated
  using (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and private.ws_writable(workspace_id))
  with check (private.has_role(workspace_id, array['owner','editor']::public.member_role[]));
grant select on public.visual_references to authenticated;
create policy vref_read on public.visual_references for select to authenticated using (private.is_member(workspace_id));

-- ---- Campagnes : lecture membres ; brouillons modifiables par owner/editor ; publication par le serveur
grant select, insert, update (name, objective, destination, geo, targeting, daily_budget_usd_cents, start_date, end_date, copy, tracking, ab_test, page_id, ad_account_id)
  on public.campaigns to authenticated;
create policy camp_read   on public.campaigns for select to authenticated using (private.is_member(workspace_id) or private.is_admin());
create policy camp_insert on public.campaigns for insert to authenticated
  with check (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and private.ws_writable(workspace_id)
              and status = 'draft' and created_by = (select auth.uid()));
create policy camp_update on public.campaigns for update to authenticated
  using (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and private.ws_writable(workspace_id) and status = 'draft' and editable)
  with check (private.has_role(workspace_id, array['owner','editor']::public.member_role[]) and status = 'draft');

grant select on public.campaign_proposals, public.ads, public.campaign_status_events, public.rejections, public.stats_daily, public.optimizer_recommendations to authenticated;
create policy prop_read  on public.campaign_proposals        for select to authenticated using (private.is_member(workspace_id));
create policy ads_read   on public.ads                       for select to authenticated using (private.is_member(workspace_id));
create policy cse_read   on public.campaign_status_events    for select to authenticated using (private.is_member(workspace_id));
create policy rej_read   on public.rejections                for select to authenticated using (private.is_member(workspace_id));
create policy stats_read on public.stats_daily               for select to authenticated using (private.is_member(workspace_id));
create policy opt_read   on public.optimizer_recommendations for select to authenticated using (private.is_member(workspace_id));

-- ---- Notifications : chacun ses notifications
grant select, update (read_at) on public.notifications to authenticated;
create policy notif_read on public.notifications for select to authenticated using (profile_id = (select auth.uid()));
create policy notif_mark on public.notifications for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
grant select, insert, update on public.notification_preferences to authenticated;
create policy npref_all on public.notification_preferences for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- ---- Support
grant select, insert (workspace_id, created_by, subject, category) on public.tickets to authenticated;
create policy tk_read   on public.tickets for select to authenticated using (private.is_member(workspace_id) or private.is_admin());
create policy tk_insert on public.tickets for insert to authenticated
  with check (private.is_member(workspace_id) and created_by = (select auth.uid()));
grant select, insert (workspace_id, ticket_id, author_type, author_id, body) on public.ticket_messages to authenticated;
create policy tm_read   on public.ticket_messages for select to authenticated using (private.is_member(workspace_id) or private.is_admin());
create policy tm_insert on public.ticket_messages for insert to authenticated
  with check (private.is_member(workspace_id) and author_type = 'user' and author_id = (select auth.uid())
              and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = ticket_messages.workspace_id));
grant select on public.attachments to authenticated;
create policy att_read on public.attachments for select to authenticated using (private.is_member(workspace_id) or private.is_admin());

-- ---- Parrainage
grant select on public.referrals to authenticated;
create policy ref_read on public.referrals for select to authenticated using (private.is_member(referrer_workspace_id));

-- ---- Contenu public : lisible par tous (anon compris) une fois publié
grant select on public.blog_posts, public.help_articles to anon, authenticated;
create policy blog_public on public.blog_posts    for select to anon          using (status = 'published');
create policy blog_auth   on public.blog_posts    for select to authenticated using (status = 'published' or private.is_admin());
create policy help_public on public.help_articles for select to anon, authenticated using (public);

-- ---------------------------------------------------------------------
-- 17. Index
-- ---------------------------------------------------------------------
create index on public.workspace_members (profile_id);
create index on public.campaigns (workspace_id, status);
create index on public.campaigns (meta_campaign_id);
create index on public.stats_daily (campaign_id, date desc);
create index on public.generation_jobs (workspace_id, queued_at desc);
create index on public.generation_jobs (status, model_id);
create index on public.visuals (files_expire_at) where files_deleted_at is null;
create index on public.credit_ledger (workspace_id, bucket);
create index on public.credit_ledger (generation_job_id);
create index on public.payments (provider_payment_id);
create index on public.notifications (profile_id, read_at);
create index on public.meta_connections (expires_at);

-- ---------------------------------------------------------------------
-- 18. Données de référence
-- ---------------------------------------------------------------------
insert into public.plans (code, price_xaf, monthly_credits, campaigns_per_period, max_pages, max_members, features) values
  ('starter',  5000, 10,  2,  1, 1, '{"optimizer":false,"pdf_export":false,"comparative_stats":false,"competitor_analysis":false}'),
  ('pro',     12000, 15,  5,  3, 2, '{"optimizer":true,"pdf_export":true,"comparative_stats":true,"competitor_analysis":true}'),
  ('business',25000, 30, 15, 10, 5, '{"optimizer":true,"pdf_export":true,"comparative_stats":true,"competitor_analysis":true}');

insert into public.media_providers (code, concurrency_limit, retention_hours) values
  ('fal', 2, 168), ('higgsfield', 20, 168), ('byteplus', 3, 24);

insert into private.app_settings (key, value) values
  ('maintenance', '{"active":false,"message":null}'),
  ('credit_price_xaf', '1000'),
  ('image_margin_threshold_xaf', '125'),
  ('trial', '{"campaigns":1,"visuals":3,"days":7}'),
  ('session_idle_minutes', '10'),
  ('login_lock', '{"attempts":5,"minutes":15}'),
  ('referral_bonus_credits', '2');

commit;
