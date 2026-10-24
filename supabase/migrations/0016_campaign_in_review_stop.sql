-- =====================================================================
-- Pubeka — migration 0016 (S17) : une campagne en vérification peut passer à « arrêtée »
-- Décision de la personne : une pub supprimée chez Meta (ou dont le paiement est refusé) PENDANT la vérification passe à `stopped`,
-- historique conservé (EC-META-08). Nouvelle transition `in_review → stopped` (événement `stop`) : 19 transitions autorisées sur
-- 9 états × 12 événements (108 paires, 89 interdites). La garde de la migration 0010 n'est pas modifiée : on la REMPLACE ici
-- (create or replace), avec la même liste plus cette ligne. Le code répète la même table (`campaign-state.ts`) ; un test compare les deux.
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
      ('error','publishing'), ('error','draft')
    ) as allowed(from_status, to_status)
    where allowed.from_status = old.status::text and allowed.to_status = new.status::text
  ) then
    raise exception 'Transition de campagne interdite : % vers %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;

commit;
