-- =====================================================================
-- Pubeka — migration 0008 (S14) : registre des fichiers envoyés + journal des agents complété
--  1. public.uploads : un fichier n'est lu par le serveur que s'il a été annoncé par POST /uploads
--     (chemin construit par le serveur) puis vérifié sur ses premiers octets (SECURITY_NOTES §3.3).
--  2. public.agent_runs : error_code, provider, requested_model, attempts (S13, LLD §6.10).
-- RLS activée ; aucun accès client : le serveur seul (service_role) lit et écrit.
-- =====================================================================

begin;

create table public.uploads (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  created_by     uuid references public.profiles(id) on delete set null,
  purpose        text not null check (purpose in ('source','reference','brand_logo','support_attachment','payment_proof')),
  bucket         text not null check (bucket in ('sources','brand','support')),
  file_path      text not null unique check (char_length(file_path) <= 300),
  declared_mime  text not null check (declared_mime in ('image/png','image/jpeg','image/webp','application/pdf',
                                                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  declared_size  int  not null check (declared_size between 1 and 20971520),
  status         text not null default 'pending' check (status in ('pending','verified','rejected')),
  verified_mime  text check (verified_mime in ('image/png','image/jpeg','image/webp','application/pdf',
                                               'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  verified_size  int  check (verified_size between 1 and 20971520),
  expires_at     timestamptz not null,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  -- le chemin est toujours {workspace_id}/{uuid}.{extension} (SECURITY_NOTES §3.1 règle 7)
  check (file_path ~ ('^' || workspace_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|pdf|docx)$')),
  check (status <> 'verified' or (verified_mime is not null and verified_size is not null and verified_at is not null))
);
create index on public.uploads (workspace_id, created_at desc);

alter table public.uploads enable row level security;
revoke all on public.uploads from public, anon, authenticated;
grant all on public.uploads to service_role;

alter table public.agent_runs
  add column error_code      text check (char_length(error_code) <= 60),
  add column provider        text check (provider in ('openrouter','anthropic','openai','gemini')),
  add column requested_model text check (char_length(requested_model) <= 120),
  add column attempts        int  check (attempts between 0 and 2);

commit;
