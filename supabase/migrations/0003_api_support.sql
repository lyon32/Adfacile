-- =====================================================================
-- Pubeka — migration 0003 : écarts entre l'API et la base (LLD §10, E1 à E10)
-- Mêmes principes que 0001 : RLS partout, moindre privilège, search_path figé,
-- aucune requête dynamique, registres en ajout seul.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- E1. Analyses (état de l'Analyste, exposé par /analyses/{id})
-- ---------------------------------------------------------------------
create table public.analyses (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  page_id             uuid references public.pages(id) on delete set null,
  created_by          uuid references public.profiles(id) on delete set null,
  status              text not null default 'queued'
                      check (status in ('queued','reading','analysing','questions','ready','blocked','failed')),
  user_intent         text check (char_length(user_intent) <= 1000),
  source_ids          uuid[] not null default '{}' check (cardinality(source_ids) <= 12),
  unreadable_sources  int[]  not null default '{}',
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  blocked_reason      text check (blocked_reason in ('illegal_product')),
  error_code          text check (char_length(error_code) <= 60),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status <> 'blocked' or blocked_reason is not null),
  check (status <> 'ready' or business_profile_id is not null)
);
create index on public.analyses (workspace_id, created_at desc);
create trigger t_analyses_upd before update on public.analyses for each row execute function private.touch_updated_at();
create trigger t_analyses_ws  before update on public.analyses for each row execute function private.lock_workspace_id();

-- ---------------------------------------------------------------------
-- E2. Clés d'idempotence de l'API (API_SPEC §7, LLD §6.3) — serveur uniquement
-- ---------------------------------------------------------------------
create table public.api_idempotency_keys (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  key             uuid not null,
  route           text not null check (char_length(route) <= 200),
  body_hash       text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  state           text not null default 'running' check (state in ('running','done')),
  response_status int check (response_status between 100 and 599),
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours',
  primary key (workspace_id, key),
  check (state <> 'done' or response_status is not null)
);
create index on public.api_idempotency_keys (expires_at);

-- Purge des clés de plus de 24 h (appelée par une tâche planifiée). Retourne le nombre supprimé.
create or replace function private.purge_idempotency_keys()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.api_idempotency_keys where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- E3. Webhooks déjà traités (rejeu refusé)
-- ---------------------------------------------------------------------
create table private.webhook_events (
  provider    text not null check (char_length(provider) between 1 and 40),
  event_id    text not null check (char_length(event_id) between 1 and 200),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- true = événement nouveau (à traiter) ; false = déjà vu (répondre 200 sans rien refaire).
create or replace function private.record_webhook_event(p_provider text, p_event_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into private.webhook_events (provider, event_id) values (p_provider, p_event_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ---------------------------------------------------------------------
-- E4. Crédits : libération partielle, retour en bonus après la période (EC-CRED-03, EC-CRED-12)
-- Règle : une génération a au plus UNE libération (totale ou partielle) et au plus UNE consommation.
--   reserve → release(job, n) → consume(job)   : n crédits rendus, le reste consommé
--   reserve → release(job)                      : tout est rendu
--   reserve → consume(job)                      : tout est consommé
-- ---------------------------------------------------------------------
drop function private.release_credits(uuid);

create or replace function private.release_credits(job uuid, amount int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  reserved int;
  to_release int;
  b public.credit_bucket;
  in_bucket int;
  take int;
  target public.credit_bucket;
  period_over boolean;
  total int := 0;
begin
  if amount is not null and amount <= 0 then
    raise exception 'Montant de crédits invalide' using errcode = '22023';
  end if;
  select l.workspace_id, -sum(l.amount)::int into ws, reserved
    from public.credit_ledger l where l.generation_job_id = job and l.kind = 'reserve' group by l.workspace_id;
  if ws is null then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(ws::text, 0));
  if exists (select 1 from public.credit_ledger where generation_job_id = job and kind in ('release','consume')) then
    return 0;   -- déjà rendus ou déjà consommés : on ne rend jamais deux fois
  end if;
  to_release := coalesce(amount, reserved);
  if to_release > reserved then
    raise exception 'Libération supérieure à la réservation' using errcode = '22023';
  end if;
  -- Période des crédits du mois terminée : les crédits mensuels reviennent en bonus.
  select coalesce(max(period_end) <= now(), false) into period_over
    from public.credit_ledger where workspace_id = ws and kind = 'grant_monthly' and period_end is not null;

  -- On rend d'abord les compartiments les plus précieux : achetés, bonus, puis mensuels.
  foreach b in array array['purchased','bonus','monthly']::public.credit_bucket[] loop
    exit when to_release = 0;
    select coalesce(-sum(l.amount), 0)::int into in_bucket from public.credit_ledger l
      where l.generation_job_id = job and l.kind = 'reserve' and l.bucket = b;
    take := least(in_bucket, to_release);
    if take > 0 then
      target := case when b = 'monthly' and period_over then 'bonus'::public.credit_bucket else b end;
      insert into public.credit_ledger (workspace_id, bucket, kind, amount, generation_job_id, reason)
      values (ws, target, 'release', take, job,
              case when target <> b then 'Période terminée : crédits mensuels rendus en bonus (EC-CRED-12)' end);
      to_release := to_release - take;
      total := total + take;
    end if;
  end loop;
  return total;
end $$;

-- Confirme la consommation de ce qui n'a pas été rendu. Idempotent ; sans effet si tout a été rendu.
create or replace function private.consume_credits(job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  reserved int;
  released int;
begin
  if exists (select 1 from public.credit_ledger where generation_job_id = job and kind = 'consume') then
    return;
  end if;
  select coalesce(-sum(amount) filter (where kind = 'reserve'), 0)::int,
         coalesce(sum(amount) filter (where kind = 'release'), 0)::int
    into reserved, released
    from public.credit_ledger where generation_job_id = job;
  if reserved = 0 or released >= reserved then
    return;
  end if;
  insert into public.credit_ledger (workspace_id, bucket, kind, amount, generation_job_id)
  select workspace_id, bucket, 'consume', 0, job from public.credit_ledger
  where generation_job_id = job and kind = 'reserve' limit 1;
end $$;

-- ---------------------------------------------------------------------
-- E7. Limites de débit (API_SPEC §11) : fenêtre fixe, table non journalisée
-- ---------------------------------------------------------------------
create unlogged table private.rate_limits (
  bucket_key   text not null check (char_length(bucket_key) between 1 and 200),
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket_key, window_start)
);

-- Compte un appel. allowed = false si la limite est dépassée ; retry_after_s = secondes avant la fenêtre suivante.
create or replace function private.hit_rate_limit(p_key text, p_limit int, p_window_s int)
returns table (allowed boolean, hits int, retry_after_s int)
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz;
  n int;
begin
  if p_limit is null or p_limit <= 0 or p_window_s is null or p_window_s <= 0 or p_window_s > 86400 then
    raise exception 'Paramètres de limite invalides' using errcode = '22023';
  end if;
  w := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  insert into private.rate_limits as r (bucket_key, window_start, hits) values (p_key, w, 1)
  on conflict (bucket_key, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  -- Ménage léger des fenêtres anciennes de cette clé.
  delete from private.rate_limits where bucket_key = p_key and window_start < w;
  return query select n <= p_limit, n,
    greatest(1, ceil(extract(epoch from (w + make_interval(secs => p_window_s) - now())))::int);
end $$;

-- ---------------------------------------------------------------------
-- E8. Transfert de propriété (EC-TEAM-06) : une transaction, journalisée
-- ---------------------------------------------------------------------
create table audit.workspace_log (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  actor_id     uuid not null,
  action       text not null check (char_length(action) <= 60),
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create trigger workspace_log_no_update before update or delete on audit.workspace_log
  for each row execute function private.forbid_change();
create trigger workspace_log_no_truncate before truncate on audit.workspace_log
  for each statement execute function private.forbid_change();

create or replace function private.transfer_ownership(ws uuid, new_owner uuid, actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare old_owner uuid;
begin
  select owner_id into old_owner from public.workspaces where id = ws for update;
  if old_owner is null then
    raise exception 'Espace introuvable' using errcode = 'P0002';
  end if;
  if old_owner <> actor then
    raise exception 'Seul le propriétaire peut transférer l''espace' using errcode = '42501';
  end if;
  if new_owner = old_owner then
    raise exception 'Déjà propriétaire' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = ws and profile_id = new_owner) then
    raise exception 'Le nouveau propriétaire doit être membre de l''espace' using errcode = 'P0002';
  end if;
  update public.workspace_members set role = 'editor' where workspace_id = ws and profile_id = old_owner;
  update public.workspace_members set role = 'owner'  where workspace_id = ws and profile_id = new_owner;
  update public.workspaces set owner_id = new_owner where id = ws;
  insert into audit.workspace_log (workspace_id, actor_id, action, before, after)
  values (ws, actor, 'transfer_ownership', jsonb_build_object('owner_id', old_owner), jsonb_build_object('owner_id', new_owner));
end $$;

-- ---------------------------------------------------------------------
-- E9. Version des campagnes (EC-TEAM-08) : +1 à chaque modification
-- ---------------------------------------------------------------------
alter table public.campaigns add column version int not null default 1 check (version >= 1);

create or replace function private.bump_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger t_campaigns_version before update on public.campaigns for each row execute function private.bump_version();

-- ---------------------------------------------------------------------
-- E10. Inscription : profil, espace de travail, membre « owner », code de parrainage.
-- L'essai n'est PAS créé ici : il démarre au clic sur l'étape 3 de la première configuration (S24).
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  first text := nullif(left(btrim(meta ->> 'first_name'), 80), '');
  last  text := nullif(left(btrim(meta ->> 'last_name'), 80), '');
  lang  text := case when meta ->> 'ui_language' in ('fr','en') then meta ->> 'ui_language' else 'fr' end;
  ws uuid;
  code text;
begin
  if new.email is null then
    raise exception 'Adresse e-mail obligatoire' using errcode = '23502';
  end if;
  insert into public.profiles (id, email, first_name, last_name, ui_language)
  values (new.id, lower(new.email), first, last, lang);

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.workspaces where referral_code = code);
  end loop;
  insert into public.workspaces (name, owner_id, referral_code)
  values (left(coalesce(first, split_part(new.email, '@', 1)), 120), new.id, code)
  returning id into ws;
  insert into public.workspace_members (workspace_id, profile_id, role) values (ws, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Droits et RLS
-- ---------------------------------------------------------------------
alter table public.analyses             enable row level security;
alter table public.api_idempotency_keys enable row level security;
alter table private.webhook_events      enable row level security;
alter table private.rate_limits         enable row level security;
alter table audit.workspace_log         enable row level security;

revoke all on public.analyses, public.api_idempotency_keys from public, anon, authenticated;
revoke all on private.webhook_events, private.rate_limits from public, anon, authenticated;
revoke all on audit.workspace_log from public, anon, authenticated;
grant all on public.analyses, public.api_idempotency_keys to service_role;
grant all on private.webhook_events, private.rate_limits to service_role;
grant select, insert on audit.workspace_log to service_role;

-- analyses : lecture par les membres (et abonnement Realtime) ; écriture par le serveur.
grant select on public.analyses to authenticated;
create policy analyses_read on public.analyses for select to authenticated using (private.is_member(workspace_id));
-- api_idempotency_keys : aucune politique → serveur uniquement.

revoke all on function private.purge_idempotency_keys()                from public, anon, authenticated;
revoke all on function private.record_webhook_event(text, text)       from public, anon, authenticated;
revoke all on function private.release_credits(uuid, int)              from public, anon, authenticated;
revoke all on function private.consume_credits(uuid)                   from public, anon, authenticated;
revoke all on function private.hit_rate_limit(text, int, int)          from public, anon, authenticated;
revoke all on function private.transfer_ownership(uuid, uuid, uuid)    from public, anon, authenticated;
revoke all on function private.handle_new_user()                       from public, anon, authenticated;
revoke all on function private.bump_version()                          from public, anon, authenticated;
grant execute on function private.purge_idempotency_keys()             to service_role;
grant execute on function private.record_webhook_event(text, text)    to service_role;
grant execute on function private.release_credits(uuid, int)           to service_role;
grant execute on function private.consume_credits(uuid)                to service_role;
grant execute on function private.hit_rate_limit(text, int, int)       to service_role;
grant execute on function private.transfer_ownership(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Points d'appel serveur : l'API Supabase n'expose que le schéma public. Ces enveloppes
-- (security invoker) appellent les fonctions de private ; exécutables par service_role SEULEMENT.
-- ---------------------------------------------------------------------
create or replace function public.reserve_credits(ws uuid, needed int, job uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.reserve_credits(ws, needed, job) $$;
create or replace function public.release_credits(job uuid, amount int default null)
returns int language sql security invoker set search_path = '' as $$ select private.release_credits(job, amount) $$;
create or replace function public.consume_credits(job uuid)
returns void language sql security invoker set search_path = '' as $$ select private.consume_credits(job) $$;
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_s int)
returns table (allowed boolean, hits int, retry_after_s int)
language sql security invoker set search_path = '' as $$ select * from private.hit_rate_limit(p_key, p_limit, p_window_s) $$;
create or replace function public.record_webhook_event(p_provider text, p_event_id text)
returns boolean language sql security invoker set search_path = '' as $$ select private.record_webhook_event(p_provider, p_event_id) $$;
create or replace function public.transfer_ownership(ws uuid, new_owner uuid, actor uuid)
returns void language sql security invoker set search_path = '' as $$ select private.transfer_ownership(ws, new_owner, actor) $$;
create or replace function public.purge_idempotency_keys()
returns int language sql security invoker set search_path = '' as $$ select private.purge_idempotency_keys() $$;

revoke all on function public.reserve_credits(uuid, int, uuid)        from public, anon, authenticated;
revoke all on function public.release_credits(uuid, int)              from public, anon, authenticated;
revoke all on function public.consume_credits(uuid)                   from public, anon, authenticated;
revoke all on function public.hit_rate_limit(text, int, int)          from public, anon, authenticated;
revoke all on function public.record_webhook_event(text, text)       from public, anon, authenticated;
revoke all on function public.transfer_ownership(uuid, uuid, uuid)    from public, anon, authenticated;
revoke all on function public.purge_idempotency_keys()                from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, int, uuid)     to service_role;
grant execute on function public.release_credits(uuid, int)           to service_role;
grant execute on function public.consume_credits(uuid)                to service_role;
grant execute on function public.hit_rate_limit(text, int, int)       to service_role;
grant execute on function public.record_webhook_event(text, text)    to service_role;
grant execute on function public.transfer_ownership(uuid, uuid, uuid) to service_role;
grant execute on function public.purge_idempotency_keys()             to service_role;

commit;
