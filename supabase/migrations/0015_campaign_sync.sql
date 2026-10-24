-- =====================================================================
-- Pubeka — migration 0015 (S17) : synchronisation des statuts et des statistiques
--  1. campaigns : dates de dernière synchronisation (statut, statistiques), demande d'actualisation manuelle (limite de
--     5 minutes appliquée par la base, une seule requête gardée) et dernière raison d'un échec de synchronisation
--     (affichée avec l'heure de la dernière mise à jour, EC-META-10).
--  2. Index pour le tableau de bord (dépensé du mois par espace) et pour l'historique d'une campagne.
--  3. Realtime : campaigns, stats_daily et campaign_status_events sont publiées ; la RLS (lecture des membres) limite chaque
--     abonnement à l'espace du membre (LLD §7.3). Sans effet là où la publication n'existe pas (PGlite).
--  4. bump_version : les écritures qui ne touchent que ces colonnes de synchronisation ne changent plus la version.
-- Aucune donnée n'est inventée ici. Les statuts ne changent pas : la garde SQL de la migration 0010 reste le filet.
-- =====================================================================

begin;

alter table public.campaigns
  add column status_synced_at           timestamptz,
  add column stats_synced_at            timestamptz,
  add column stats_refresh_requested_at timestamptz,
  add column stats_sync_error           text check (stats_sync_error in ('rate_limited','fx_not_available','meta_error','token_expired'));

create index stats_daily_workspace_date_idx on public.stats_daily (workspace_id, date desc);
create index campaign_status_events_campaign_idx on public.campaign_status_events (campaign_id, id desc);
create index campaign_status_events_webhook_idx on public.campaign_status_events (created_at desc) where source = 'webhook';

-- Demande d'actualisation manuelle : UNE instruction qui réserve la fenêtre de 5 minutes. Renvoie vrai si la demande est
-- acceptée, faux si une actualisation a été demandée il y a moins de 5 minutes (deux clics simultanés : un seul passe).
create or replace function private.request_stats_refresh(p_workspace uuid, p_campaign uuid, p_now timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.campaigns
     set stats_refresh_requested_at = p_now
   where workspace_id = p_workspace and id = p_campaign
     and (stats_refresh_requested_at is null or stats_refresh_requested_at <= p_now - interval '5 minutes');
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function private.request_stats_refresh(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.request_stats_refresh(uuid, uuid, timestamptz) to service_role;

create or replace function public.request_stats_refresh(p_workspace uuid, p_campaign uuid, p_now timestamptz)
returns boolean language sql security invoker set search_path = '' as $$
  select private.request_stats_refresh(p_workspace, p_campaign, p_now) $$;
revoke all on function public.request_stats_refresh(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.request_stats_refresh(uuid, uuid, timestamptz) to service_role;

-- La version d'une campagne (EC-TEAM-08) ne bouge que pour une VRAIE modification. Une synchronisation qui ne fait qu'écrire
-- ses dates (ou sa raison d'échec) ne doit pas la changer : sinon une synchronisation toutes les heures ferait échouer, en
-- `409 conflict`, la modification ou la relance que le client prépare à l'écran.
create or replace function private.bump_version()
returns trigger language plpgsql set search_path = '' as $$
declare
  sync_columns constant text[] := array['status_synced_at','stats_synced_at','stats_refresh_requested_at','stats_sync_error','updated_at'];
begin
  if (to_jsonb(new) - sync_columns) is distinct from (to_jsonb(old) - sync_columns) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['campaigns','stats_daily','campaign_status_events'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;
