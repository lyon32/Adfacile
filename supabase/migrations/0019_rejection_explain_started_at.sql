-- =====================================================================
-- Pubeka — migration 0019 (S18, contrôle) : horodatage de la prise d'une explication de refus
-- Un rapport « en cours » (`explain_status = running`) dont le processus est mort ne doit pas rester « en cours » pour toujours :
-- la date de prise permet de le faire passer à « échec » après un délai, SANS relancer le modèle (un appel au résultat incertain
-- n'est jamais rejoué d'office, EC-META-05). La migration 0018 n'est pas modifiée.
-- =====================================================================

begin;

alter table public.rejections add column explain_started_at timestamptz;

-- Les explications déjà « en cours » (avant cette migration) sont jugées sur leur date de création.
update public.rejections set explain_started_at = created_at where explain_status = 'running';

create index rejections_running_idx on public.rejections (explain_started_at) where explain_status = 'running';

commit;
