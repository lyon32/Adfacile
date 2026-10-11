-- =====================================================================
-- Pubeka — migration 0002 : stockage des fichiers (Supabase Storage)
-- ⚠ Non testée localement (le schéma "storage" n'existe que dans Supabase).
--   À tester sur le projet Supabase de développement avant la production.
-- Règles :
--   • Tous les compartiments sont PRIVÉS (aucune URL publique permanente).
--   • Chemin obligatoire : <workspace_id>/<…> ; un membre ne lit que son espace.
--   • Les fichiers générés par l'IA et les rendus sont écrits par le SERVEUR uniquement.
--   • Le client ne peut envoyer que ses sources et références, avec taille et type limités.
--   • Lecture côté client par URL signée à durée courte (créée par le serveur).
-- =====================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('sources',   'sources',   false, 20971520, array['image/png','image/jpeg','image/webp','application/pdf',
                                                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('visuals',   'visuals',   false, 52428800, array['image/png','image/jpeg','image/webp','video/mp4']),
  ('brand',     'brand',     false, 5242880,  array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('support',   'support',   false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('admin',     'admin',     false, 20971520, null)
on conflict (id) do nothing;

-- Lecture : membres de l'espace (premier dossier du chemin = workspace_id)
create policy storage_read_own_workspace on storage.objects for select to authenticated
  using (
    bucket_id in ('sources','visuals','brand','support')
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.is_member(((storage.foldername(name))[1])::uuid)
  );

-- Envoi par le client : uniquement sources, kit de marque et pièces jointes du support, dans son espace
create policy storage_upload_own_workspace on storage.objects for insert to authenticated
  with check (
    bucket_id in ('sources','brand','support')
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['owner','editor']::public.member_role[])
    and private.ws_writable(((storage.foldername(name))[1])::uuid)
  );

-- Aucune modification ni suppression par le client (la suppression des 7 jours est faite par le serveur)
-- (pas de politique UPDATE / DELETE pour authenticated = refusé)

-- Compartiment "admin" : administrateur en double vérification uniquement
create policy storage_admin_only on storage.objects for all to authenticated
  using (bucket_id = 'admin' and private.is_admin())
  with check (bucket_id = 'admin' and private.is_admin());

commit;
