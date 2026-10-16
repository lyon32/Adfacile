-- =====================================================================
-- Pubeka — migration 0011 (S15, corrections) : durée d'une campagne
-- SECURITY_NOTES §3.2 : fin > début (deux jours au moins) et durée ≤ 365 jours DÉBUT ET FIN COMPRIS, soit un écart
-- end_date − start_date de 364 jours au plus. La 0010 comptait 365 jours d'écart (366 jours comptés) : on la remplace
-- par une nouvelle migration (une migration appliquée n'est jamais modifiée).
-- =====================================================================

begin;

alter table public.campaigns drop constraint campaigns_duration_max;
alter table public.campaigns
  add constraint campaigns_duration_max check (start_date is null or end_date is null or end_date - start_date <= 364),
  add constraint campaigns_end_after_start check (start_date is null or end_date is null or end_date > start_date);
-- La contrainte d'origine (0001) acceptait fin = début ; la nouvelle la remplace.
alter table public.campaigns drop constraint if exists campaigns_check;

commit;
