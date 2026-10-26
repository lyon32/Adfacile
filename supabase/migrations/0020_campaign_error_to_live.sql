-- =====================================================================
-- Pubeka — migration 0020 (S18, 2e contrôle) : une campagne en erreur peut redevenir vivante
-- Une republication qui échoue (ancienne campagne encore vivante chez Meta, activation incertaine…) laisse la campagne Pubeka en
-- `error`. Si Meta montre alors cette campagne en vérification, en diffusion ou en pause, Pubeka ne doit pas mentir ni empêcher le
-- client de la mettre en pause : le vrai statut de Meta remonte (événements `sent`, `approve`, `pause`). Trois transitions ajoutées :
-- error → in_review, error → active, error → paused (22 autorisées, 86 interdites sur 108). On REMPLACE la garde de la migration 0016
-- (create or replace) avec la même liste plus ces trois lignes ; le code répète la même table (`campaign-state.ts`).
-- =====================================================================

begin;

create or replace function private.guard_campaign_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Une campagne est créée en brouillon' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not exists (
    select 1 from (values
      ('draft','publishing'),
      ('publishing','in_review'), ('publishing','error'),
      ('in_review','active'), ('in_review','rejected'), ('in_review','paused'), ('in_review','stopped'),
      ('active','paused'), ('active','in_review'), ('active','ended'), ('active','stopped'),
      ('paused','active'), ('paused','ended'), ('paused','stopped'),
      ('rejected','publishing'), ('rejected','stopped'),
      ('stopped','active'),
      ('error','publishing'), ('error','draft'), ('error','in_review'), ('error','active'), ('error','paused')
    ) as allowed(from_status, to_status)
    where allowed.from_status = old.status::text and allowed.to_status = new.status::text
  ) then
    raise exception 'Transition de campagne interdite : % vers %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;

commit;
