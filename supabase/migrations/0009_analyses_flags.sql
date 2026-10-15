-- =====================================================================
-- Pubeka — migration 0009 (S14) : signalements d'une analyse
-- `flags` regroupe ce que l'Analyste et le code signalent (PROMPT_INJECTION_SUSPECTED, UNGROUNDED_VALUE_REMOVED,
-- IMAGES_NOT_READ…). Lisible par les membres comme le reste de `analyses` (RLS déjà en place, migration 0003).
-- =====================================================================

begin;

alter table public.analyses
  add column flags text[] not null default '{}' check (cardinality(flags) <= 40);

commit;
