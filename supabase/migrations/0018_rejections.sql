-- =====================================================================
-- Pubeka — migration 0018 (S18) : refus de Meta et rapport du Modérateur
--  1. rejections : état de l'explication (le Modérateur est appelé UNE fois par refus, jamais relancé d'office : un résultat
--     incertain n'est pas rejoué, EC-META-05) et raison d'un échec.
--  2. Un seul refus OUVERT par campagne et par publicité (le même refus lu deux fois, ou deux synchronisations qui se croisent,
--     n'écrivent qu'une ligne). Une fois corrigé et republié (`fixed_and_republished`), un nouveau refus peut être enregistré.
--  3. Mémoire des refus (anonyme, docs/agents/04 §8) : un compteur par motif générique, écrit par une fonction réservée au serveur.
-- La lecture reste celle de la migration 0001 (membres de l'espace) ; les écritures passent par le client service.
-- =====================================================================

begin;

alter table public.rejections
  add column explain_status text not null default 'pending' check (explain_status in ('pending','running','ready','failed')),
  add column explain_error  text check (explain_error is null or char_length(explain_error) <= 64);

-- Un refus ouvert par publicité ; sans publicité connue (refus de la campagne entière), un seul par campagne.
create unique index rejections_open_per_ad_idx
  on public.rejections (campaign_id, coalesce(ad_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where not fixed_and_republished;

create index rejections_campaign_idx on public.rejections (campaign_id, created_at desc);
create index rejections_pending_idx on public.rejections (created_at) where explain_status = 'pending';

-- Mémoire des refus : +1 sur le motif (déjà anonymisé par le Modérateur), renvoie le compteur. Réservée au serveur.
create or replace function private.record_rejection_pattern(p_pattern text, p_now timestamptz)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_pattern is null or char_length(btrim(p_pattern)) = 0 or char_length(p_pattern) > 200 then
    raise exception 'motif invalide' using errcode = '22023';
  end if;
  insert into private.rejection_memory (pattern, count, last_seen)
  values (lower(btrim(p_pattern)), 1, p_now)
  on conflict (pattern) do update set count = private.rejection_memory.count + 1, last_seen = excluded.last_seen
  returning count into n;
  return n;
end $$;
revoke all on function private.record_rejection_pattern(text, timestamptz) from public, anon, authenticated;
grant execute on function private.record_rejection_pattern(text, timestamptz) to service_role;

create or replace function public.record_rejection_pattern(p_pattern text, p_now timestamptz)
returns int language sql security invoker set search_path = '' as $$
  select private.record_rejection_pattern(p_pattern, p_now) $$;
revoke all on function public.record_rejection_pattern(text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_rejection_pattern(text, timestamptz) to service_role;

commit;
