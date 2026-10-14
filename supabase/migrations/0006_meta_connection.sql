-- =====================================================================
-- Pubeka — migration 0006 : connexion Meta (S11)
--   M1. Jeton Meta : stockage du format scellé de packages/platforms (LLD §6.13)
--   M2. Connexion + jeton écrits d'un seul bloc (reconnexion = mise à jour de la connexion)
--   M3. Lecture du jeton scellé (serveur seulement)
--   M4. Activation d'une Page : limite de la formule et verrou de la période, sans course
--   M5. Compte publicitaire actif : un seul par espace
-- Les fonctions de `private` ne sont pas exposées par l'API ; les enveloppes `public.*`
-- (security invoker) ne sont exécutables que par service_role (même schéma que la 0003).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- M1. Le jeton chiffré est une chaîne « v1.<keyId>.<iv>.<texte>.<étiquette> » (base64url).
--     L'identifiant de clé est un texte (« k1 »), pas un entier : on remplace les quatre colonnes
--     binaires de la 0001 (table vide : aucun jeton n'a encore été écrit). Si une ligne existait,
--     `set not null` échouerait : on ne perd jamais un jeton en silence.
-- ---------------------------------------------------------------------
alter table private.meta_tokens add column sealed text, add column key_id text;
alter table private.meta_tokens
  drop column ciphertext, drop column iv, drop column auth_tag, drop column key_version;
alter table private.meta_tokens
  alter column sealed set not null,
  alter column key_id set not null,
  add constraint meta_tokens_sealed_check check (sealed ~ '^v1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and char_length(sealed) <= 4000),
  add constraint meta_tokens_key_id_check check (key_id ~ '^[A-Za-z0-9_-]{1,64}$');

-- Un seul compte publicitaire actif par espace (M5) : garanti par la base.
create unique index ad_accounts_one_active on public.ad_accounts (workspace_id) where is_active;

-- ---------------------------------------------------------------------
-- M2. Écrire la connexion et son jeton ensemble. Une reconnexion met à jour la connexion la plus
--     récente de l'espace (même identifiant : les comptes publicitaires qui en dépendent restent).
-- ---------------------------------------------------------------------
create or replace function private.upsert_meta_connection(
  ws uuid, p_token_type text, p_sealed text, p_key_id text, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare conn uuid;
begin
  perform 1 from public.workspaces w where w.id = ws for update;
  if not found then raise exception 'Espace introuvable' using errcode = 'P0002'; end if;
  select c.id into conn from public.meta_connections c
    where c.workspace_id = ws order by c.created_at desc limit 1 for update;
  if conn is null then
    insert into public.meta_connections (workspace_id, token_type, expires_at, status)
      values (ws, p_token_type, p_expires_at, 'ok') returning id into conn;
  else
    update public.meta_connections
      set token_type = p_token_type, expires_at = p_expires_at, status = 'ok', last_health_check = null
      where id = conn;
  end if;
  insert into private.meta_tokens (connection_id, sealed, key_id) values (conn, p_sealed, p_key_id)
    on conflict (connection_id) do update
      set sealed = excluded.sealed, key_id = excluded.key_id, updated_at = now();
  return conn;
end $$;

-- ---------------------------------------------------------------------
-- M3. Jeton scellé d'une connexion de cet espace (jamais renvoyé au navigateur).
-- ---------------------------------------------------------------------
create or replace function private.get_meta_token(ws uuid, conn uuid)
returns table (sealed text, key_id text) language sql security definer stable set search_path = '' as $$
  select t.sealed, t.key_id
  from private.meta_tokens t
  join public.meta_connections c on c.id = t.connection_id
  where c.id = conn and c.workspace_id = ws
$$;

-- ---------------------------------------------------------------------
-- M4. Activer ou désactiver une Page. Renvoie 'ok', 'limit' (formule atteinte), 'locked' (une
--     campagne a été lancée avec cette Page pendant la période : APPFLOW §6.2) ou lève P0002.
--     La ligne de l'espace est verrouillée : deux activations simultanées ne dépassent pas la limite.
-- ---------------------------------------------------------------------
create or replace function private.set_page_active(
  ws uuid, p_page uuid, want boolean, max_pages int, p_period_start timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare current_active boolean; n int;
begin
  perform 1 from public.workspaces w where w.id = ws for update;
  select p.active into current_active from public.pages p where p.id = p_page and p.workspace_id = ws;
  if not found then raise exception 'Page introuvable' using errcode = 'P0002'; end if;
  if current_active = want then return 'ok'; end if;
  if want then
    select count(*) into n from public.pages p where p.workspace_id = ws and p.active;
    if n >= max_pages then return 'limit'; end if;
  elsif p_period_start is not null and exists (
    select 1 from public.page_activations a
    where a.workspace_id = ws and a.page_id = p_page and a.period_start = p_period_start
      and a.first_campaign_at is not null) then
    return 'locked';
  end if;
  update public.pages set active = want where id = p_page and workspace_id = ws;
  return 'ok';
end $$;

-- ---------------------------------------------------------------------
-- M5. Choisir le compte publicitaire actif (un seul par espace).
-- ---------------------------------------------------------------------
create or replace function private.set_active_ad_account(ws uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces w where w.id = ws for update;
  perform 1 from public.ad_accounts a where a.id = p_id and a.workspace_id = ws;
  if not found then raise exception 'Compte publicitaire introuvable' using errcode = 'P0002'; end if;
  update public.ad_accounts set is_active = false where workspace_id = ws and is_active and id <> p_id;
  update public.ad_accounts set is_active = true where id = p_id and workspace_id = ws;
end $$;

-- ---------------------------------------------------------------------
-- Droits : serveur seulement.
-- ---------------------------------------------------------------------
revoke all on function private.upsert_meta_connection(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.get_meta_token(uuid, uuid)                                   from public, anon, authenticated;
revoke all on function private.set_page_active(uuid, uuid, boolean, int, timestamptz)       from public, anon, authenticated;
revoke all on function private.set_active_ad_account(uuid, uuid)                            from public, anon, authenticated;
grant execute on function private.upsert_meta_connection(uuid, text, text, text, timestamptz) to service_role;
grant execute on function private.get_meta_token(uuid, uuid)                                   to service_role;
grant execute on function private.set_page_active(uuid, uuid, boolean, int, timestamptz)       to service_role;
grant execute on function private.set_active_ad_account(uuid, uuid)                            to service_role;

create or replace function public.upsert_meta_connection(
  ws uuid, p_token_type text, p_sealed text, p_key_id text, p_expires_at timestamptz default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.upsert_meta_connection(ws, p_token_type, p_sealed, p_key_id, p_expires_at) $$;
create or replace function public.get_meta_token(ws uuid, conn uuid)
returns table (sealed text, key_id text) language sql security invoker stable set search_path = '' as $$
  select * from private.get_meta_token(ws, conn) $$;
create or replace function public.set_page_active(
  ws uuid, p_page uuid, want boolean, max_pages int, p_period_start timestamptz default null)
returns text language sql security invoker set search_path = '' as $$
  select private.set_page_active(ws, p_page, want, max_pages, p_period_start) $$;
create or replace function public.set_active_ad_account(ws uuid, p_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.set_active_ad_account(ws, p_id) $$;

revoke all on function public.upsert_meta_connection(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_meta_token(uuid, uuid)                                   from public, anon, authenticated;
revoke all on function public.set_page_active(uuid, uuid, boolean, int, timestamptz)       from public, anon, authenticated;
revoke all on function public.set_active_ad_account(uuid, uuid)                            from public, anon, authenticated;
grant execute on function public.upsert_meta_connection(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.get_meta_token(uuid, uuid)                                   to service_role;
grant execute on function public.set_page_active(uuid, uuid, boolean, int, timestamptz)       to service_role;
grant execute on function public.set_active_ad_account(uuid, uuid)                            to service_role;

commit;
