-- =====================================================================
-- Pubeka — migration 0010 (S15) : brouillon de campagne, propositions du Stratège
--  1. campaigns : lien vers l'analyse, objectif d'optimisation, consigne visuelle, proposition retenue.
--  2. Garde des statuts : UNE seule table de transitions autorisées (LLD §6.8, APPFLOW §11.2), répétée ici pour que
--     même une écriture directe en base ne puisse pas inventer une transition. Miroir de
--     packages/core/src/campaigns/campaign-state.ts : un test compare les deux, paire par paire.
--  3. campaign_proposals : état de la génération et clé d'idempotence (une clé = une génération : jamais deux appels IA
--     facturés pour un double clic ou un renvoi réseau, API_SPEC §7).
-- Aucune donnée de TVA ni de change n'est inventée ici : `vat_rates` et `exchange_rates` restent à renseigner
-- par l'administration (S31).
-- =====================================================================

begin;

-- ---- 1. campaigns -----------------------------------------------------
alter table public.campaigns
  add column analysis_id              uuid references public.analyses(id) on delete set null,
  add column optimization_goal        text check (optimization_goal in
    ('CONVERSATIONS','LINK_CLICKS','LANDING_PAGE_VIEWS','POST_ENGAGEMENT','REACH','OFFSITE_CONVERSIONS')),
  add column visual_brief             text check (char_length(visual_brief) <= 1000),
  add column chosen_proposal_version  int check (chosen_proposal_version >= 1);
create index on public.campaigns (analysis_id);

-- Bornes contre les fautes de frappe (SECURITY_NOTES §3.2) : 1 000 000 centimes = 10 000 $ par jour, 365 jours.
alter table public.campaigns
  add constraint campaigns_daily_budget_max check (daily_budget_usd_cents is null or daily_budget_usd_cents <= 1000000),
  add constraint campaigns_duration_max check (start_date is null or end_date is null or end_date - start_date <= 365);

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
      ('in_review','active'), ('in_review','rejected'), ('in_review','paused'),
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

create trigger t_campaigns_status_guard
  before insert or update of status on public.campaigns
  for each row execute function private.guard_campaign_status();

-- ---- 2. campaign_proposals -------------------------------------------
alter table public.campaign_proposals
  add column status          text not null default 'ready' check (status in ('generating','ready','failed')),
  add column idempotency_key uuid,
  add column error_code      text check (char_length(error_code) <= 60),
  add column created_by      uuid references public.profiles(id) on delete set null,
  add constraint campaign_proposals_ready_has_content check (status <> 'ready' or proposal <> '{}'::jsonb),
  add constraint campaign_proposals_version_positive check (version >= 1);

-- Une clé d'idempotence ne désigne qu'une génération par campagne.
create unique index campaign_proposals_idem_uniq
  on public.campaign_proposals (campaign_id, idempotency_key) where idempotency_key is not null;
-- Au plus une proposition retenue par campagne.
create unique index campaign_proposals_one_chosen
  on public.campaign_proposals (campaign_id) where chosen;

commit;
