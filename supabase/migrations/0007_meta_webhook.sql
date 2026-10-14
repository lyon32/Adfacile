-- =====================================================================
-- Pubeka — migration 0007 : webhook Meta (S11)
-- Marquer « déjà vu » ET écrire dans le journal des statuts d'un seul bloc : si l'écriture
-- échoue, la transaction est annulée, le marqueur disparaît avec elle et la relivraison de Meta
-- (jusqu'à 36 h, documentation de Meta) est traitée normalement.
-- Fonction serveur seulement (service_role), comme les autres (0003, 0006).
-- =====================================================================
begin;

-- Renvoie -1 si l'événement est déjà connu (rien n'est refait), sinon le nombre d'événements
-- rattachés à une campagne ou à une publicité de Pubeka (les autres sont ignorés, EC-META-09).
-- p_events : [{ "kind": "in_process" | "with_issues", "object_id": "123…", "payload": { … } }]
create or replace function private.record_meta_webhook(p_event_id text, p_events jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
  e jsonb;
  oid text;
  c_id uuid;
  c_ws uuid;
  a_id uuid;
  recorded int := 0;
begin
  insert into private.webhook_events (provider, event_id) values ('meta', p_event_id)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return -1; end if;

  for e in select * from jsonb_array_elements(p_events) loop
    oid := e->>'object_id';
    if oid is null or oid !~ '^[0-9]{5,25}$' then continue; end if;
    c_id := null; c_ws := null; a_id := null;
    select c.id, c.workspace_id into c_id, c_ws from public.campaigns c
      where c.meta_campaign_id = oid or c.meta_adset_id = oid limit 1;
    if c_id is null then
      select a.campaign_id, a.workspace_id, a.id into c_id, c_ws, a_id from public.ads a
        where a.meta_ad_id = oid limit 1;
    end if;
    if c_id is null then continue; end if;
    insert into public.campaign_status_events (workspace_id, campaign_id, ad_id, status, source, payload)
      values (c_ws, c_id, a_id, e->>'kind', 'webhook', e->'payload');
    recorded := recorded + 1;
  end loop;
  return recorded;
end $$;

revoke all on function private.record_meta_webhook(text, jsonb) from public, anon, authenticated;
grant execute on function private.record_meta_webhook(text, jsonb) to service_role;

create or replace function public.record_meta_webhook(p_event_id text, p_events jsonb)
returns int language sql security invoker set search_path = '' as $$
  select private.record_meta_webhook(p_event_id, p_events) $$;
revoke all on function public.record_meta_webhook(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_meta_webhook(text, jsonb) to service_role;

commit;
