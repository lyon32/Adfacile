-- 0004 — Blocage de la connexion après 5 échecs (S04 ; EC-AUTH-04, TR-SEC-14).
-- Supabase Auth ne compte pas les échecs par e-mail : le serveur de l'application les enregistre ici.
-- Clé = empreinte SHA-256 de « e-mail en minuscules + adresse IP », calculée par l'application :
-- ni l'e-mail ni l'adresse IP ne sont stockés en clair, et un inconnu ne peut pas bloquer le compte
-- de quelqu'un d'autre depuis une autre adresse (EC-AUTH-04).
-- Règle : 5 échecs dans les 15 dernières minutes → connexion refusée jusqu'à 15 minutes après le
-- 5ᵉ échec. Les tentatives refusées pendant le blocage ne sont pas comptées (le mot de passe n'est
-- même pas essayé). Une connexion réussie efface les échecs (« 5 échecs d'affilée », APPFLOW §4.2).

-- ---------------------------------------------------------------------
-- Table : un échec = une ligne. Serveur uniquement (aucune politique).
-- ---------------------------------------------------------------------
create table private.login_failures (
  id        bigint generated always as identity primary key,
  key_hash  text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  failed_at timestamptz not null default now()
);
create index login_failures_key_hash_failed_at_idx on private.login_failures (key_hash, failed_at);

alter table private.login_failures enable row level security;
revoke all on private.login_failures from public, anon, authenticated;
grant all on private.login_failures to service_role;

-- État du blocage pour une clé. p_now sert aux tests (horloge simulée) ; le serveur ne le passe pas.
create or replace function private.login_lock_status(p_key text, p_now timestamptz default now())
returns table (locked boolean, failures int, retry_after_s int)
language plpgsql stable security definer set search_path = '' as $$
declare
  n int;
  last_failure timestamptz;
begin
  -- Les tentatives refusées n'étant pas enregistrées, le dernier échec est celui qui a (ou non)
  -- déclenché le blocage : on compte les échecs des 15 minutes qui le précèdent.
  select max(f.failed_at) into last_failure
  from private.login_failures f where f.key_hash = p_key and f.failed_at <= p_now;
  if last_failure is null then
    return query select false, 0, 0;
    return;
  end if;
  select count(*)::int into n
  from private.login_failures f
  where f.key_hash = p_key and f.failed_at > last_failure - interval '15 minutes' and f.failed_at <= last_failure;
  if n >= 5 and last_failure + interval '15 minutes' > p_now then
    return query select true, n,
      greatest(1, ceil(extract(epoch from (last_failure + interval '15 minutes' - p_now))))::int;
  else
    return query select false, n, 0;
  end if;
end $$;

-- Enregistre un échec, fait le ménage des échecs anciens de cette clé, renvoie l'état après l'échec.
create or replace function private.record_login_failure(p_key text, p_now timestamptz default now())
returns table (locked boolean, failures int, retry_after_s int)
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.login_failures (key_hash, failed_at) values (p_key, p_now);
  delete from private.login_failures f
  where f.key_hash = p_key and f.failed_at <= p_now - interval '1 day';
  return query select * from private.login_lock_status(p_key, p_now);
end $$;

-- Connexion réussie : les échecs de cette clé sont oubliés.
create or replace function private.clear_login_failures(p_key text)
returns void language sql security definer set search_path = '' as $$
  delete from private.login_failures where key_hash = p_key
$$;

-- ---------------------------------------------------------------------
-- Enveloppes publiques (l'API Supabase n'expose que public), service_role SEULEMENT.
-- ---------------------------------------------------------------------
create or replace function public.login_lock_status(p_key text, p_now timestamptz default now())
returns table (locked boolean, failures int, retry_after_s int)
language sql security invoker set search_path = '' as $$ select * from private.login_lock_status(p_key, p_now) $$;
create or replace function public.record_login_failure(p_key text, p_now timestamptz default now())
returns table (locked boolean, failures int, retry_after_s int)
language sql security invoker set search_path = '' as $$ select * from private.record_login_failure(p_key, p_now) $$;
create or replace function public.clear_login_failures(p_key text)
returns void language sql security invoker set search_path = '' as $$ select private.clear_login_failures(p_key) $$;

revoke all on function private.login_lock_status(text, timestamptz)    from public, anon, authenticated;
revoke all on function private.record_login_failure(text, timestamptz) from public, anon, authenticated;
revoke all on function private.clear_login_failures(text)              from public, anon, authenticated;
revoke all on function public.login_lock_status(text, timestamptz)     from public, anon, authenticated;
revoke all on function public.record_login_failure(text, timestamptz)  from public, anon, authenticated;
revoke all on function public.clear_login_failures(text)               from public, anon, authenticated;
grant execute on function private.login_lock_status(text, timestamptz)    to service_role;
grant execute on function private.record_login_failure(text, timestamptz) to service_role;
grant execute on function private.clear_login_failures(text)              to service_role;
grant execute on function public.login_lock_status(text, timestamptz)     to service_role;
grant execute on function public.record_login_failure(text, timestamptz)  to service_role;
grant execute on function public.clear_login_failures(text)               to service_role;
