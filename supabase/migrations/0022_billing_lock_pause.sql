-- =====================================================================
-- Pubeka — migration 0022 (S19b) : pause automatique des publicités à la fin de la grâce (ou de l'essai sans abonnement)
-- Deux ajouts, rien de modifié dans les migrations existantes :
--  1. `campaigns.pause_reason` : POURQUOI une campagne est en pause. Une seule valeur pour l'instant, `billing_lock` (mise en pause par
--     Pubeka, ou par le client depuis l'écran verrouillé, parce que l'espace est verrouillé). Elle sert à une seule chose : la reprise
--     MANUELLE « Reprendre mes pubs » ne reprend QUE ces campagnes, jamais une campagne que le client avait mise en pause lui-même
--     (décision de la personne, 26/10/2026). Elle n'existe que pour une campagne en pause (contrainte) et s'efface toute seule dès que
--     la campagne quitte l'état `paused` (déclencheur) : reprise, fin, arrêt… aucun chemin de code ne peut l'oublier.
--     Les clients (`authenticated`) ne peuvent pas l'écrire : leurs droits de modification sont limités à des colonnes nommées (0001).
--  2. `public.workspaces_to_lock_pause(p_now, p_limit)` : les espaces VERROUILLÉS (même règle que `private.ws_access`, mais à l'heure
--     donnée : testable avec une horloge fixée) qui ont encore des campagnes vivantes chez Meta. Réservée au rôle service (tâche
--     planifiée `campaign.lock-pause`). Ordre aléatoire : un espace dont la pause échoue sans cesse (jeton expiré) ne prive pas les autres.
-- =====================================================================

begin;

alter table public.campaigns
  add column pause_reason text check (pause_reason in ('billing_lock'));

alter table public.campaigns
  add constraint campaigns_pause_reason_only_paused check (pause_reason is null or status = 'paused');

create or replace function private.clear_pause_reason()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'paused' then
    new.pause_reason := null;
  end if;
  return new;
end $$;

create trigger t_campaigns_pause_reason before update on public.campaigns
  for each row execute function private.clear_pause_reason();

-- Reprise manuelle : les campagnes d'un espace mises en pause par le verrouillage.
create index campaigns_pause_reason_idx on public.campaigns (workspace_id) where pause_reason is not null;
-- Pause automatique : les campagnes qui peuvent encore dépenser chez Meta (en vérification, en diffusion, en erreur mais connues de Meta).
create index campaigns_live_idx on public.campaigns (workspace_id)
  where status in ('in_review', 'active', 'error') and meta_campaign_id is not null;

create or replace function private.workspaces_to_lock_pause(p_now timestamptz, p_limit int)
returns table (workspace_id uuid) language sql volatile security definer set search_path = '' as $$
  select w.id
  from public.workspaces w
  left join lateral (
    select sb.status, sb.period_end, sb.grace_until
    from public.subscriptions sb
    where sb.workspace_id = w.id
    order by sb.created_at desc, sb.id desc
    limit 1
  ) s on true
  where private.access_at(w.status, s.status, s.period_end, s.grace_until, p_now) = 'locked'
    and exists (
      select 1 from public.campaigns c
      where c.workspace_id = w.id
        and c.status in ('in_review', 'active', 'error')
        and c.meta_campaign_id is not null
    )
  order by random()
  limit least(greatest(coalesce(p_limit, 1), 1), 500);
$$;
revoke all on function private.workspaces_to_lock_pause(timestamptz, int) from public, anon, authenticated;
grant execute on function private.workspaces_to_lock_pause(timestamptz, int) to service_role;

create or replace function public.workspaces_to_lock_pause(p_now timestamptz, p_limit int)
returns table (workspace_id uuid) language sql volatile security invoker set search_path = '' as $$
  select * from private.workspaces_to_lock_pause(p_now, p_limit) $$;
revoke all on function public.workspaces_to_lock_pause(timestamptz, int) from public, anon, authenticated;
grant execute on function public.workspaces_to_lock_pause(timestamptz, int) to service_role;

commit;
