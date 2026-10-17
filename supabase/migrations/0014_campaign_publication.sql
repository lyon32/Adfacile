-- =====================================================================
-- Pubeka — migration 0014 (S16) : publication des campagnes chez Meta
--  1. campaigns : identifiant de rapprochement (écrit AVANT l'appel à Meta), phase de la publication, clé d'idempotence,
--     état du quota (point d'accroche S24), erreur de publication, date de mise en pause.
--  2. ads : une seule ligne par publicité Meta (la tâche peut être rejouée sans doublon).
--  3. publish_liability_acceptances : fenêtre de responsabilité acceptée UNE fois par espace, avec date et utilisateur
--     (APPFLOW §8.6, EC-CAMP-08). Écriture réservée au serveur.
-- Aucune donnée n'est inventée ici. Les statuts ne changent pas : la garde SQL de la migration 0010 reste le filet.
-- =====================================================================

begin;

-- ---- 1. campaigns -----------------------------------------------------
-- publish_ref : « pk-<8 premiers caractères hexadécimaux de l'identifiant>-<numéro de tentative> ». Il est écrit en
-- base AVANT le premier appel à Meta et placé dans le nom de la campagne chez Meta : si la réponse de Meta se perd, la
-- tâche retrouve la campagne par ce libellé au lieu de la recréer (SECURITY_NOTES EC-META-05).
alter table public.campaigns
  add column publish_ref             text check (publish_ref ~ '^pk-[0-9a-f]{8}-[0-9]{1,4}$'),
  add column publish_attempt         int  not null default 0 check (publish_attempt >= 0),
  add column publish_idempotency_key uuid,
  add column publish_phase           text not null default 'none'
    check (publish_phase in ('none','creating','created','activating','done')),
  add column publish_started_at      timestamptz,
  add column publish_error           jsonb,
  add column quota_state             text not null default 'none'
    check (quota_state in ('none','held','counted','released')),
  add column paused_at               timestamptz;

-- Une référence de publication ne désigne qu'une campagne Pubeka.
create unique index campaigns_publish_ref_uniq on public.campaigns (publish_ref) where publish_ref is not null;
-- Retrouver la publication d'une clé d'idempotence (rejeu de la même clé : même résultat).
create index campaigns_publish_key_idx on public.campaigns (workspace_id, publish_idempotency_key)
  where publish_idempotency_key is not null;

-- ---- 2. ads -----------------------------------------------------------
create unique index ads_campaign_meta_ad_uniq on public.ads (campaign_id, meta_ad_id) where meta_ad_id is not null;

-- ---- 3. Clause de responsabilité -------------------------------------
create table public.publish_liability_acceptances (
  workspace_id   uuid primary key references public.workspaces(id) on delete cascade,
  accepted_by    uuid references public.profiles(id) on delete set null,
  accepted_at    timestamptz not null default now(),
  clause_version text not null default 'v1' check (char_length(clause_version) between 1 and 20)
);

alter table public.publish_liability_acceptances enable row level security;
grant select on public.publish_liability_acceptances to authenticated;
create policy pla_read on public.publish_liability_acceptances for select to authenticated
  using (private.is_member(workspace_id) or private.is_admin());
-- Aucune politique d'écriture : seul le serveur (service_role) enregistre l'acceptation.

commit;
