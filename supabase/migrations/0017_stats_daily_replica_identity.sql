-- =====================================================================
-- 0017 · stats_daily : identité de réplication (correctif de la migration 0015, S17)
-- La migration 0015 publie stats_daily en Realtime. La table n'a pas de clé primaire (seulement un index unique sur une
-- expression) : PostgreSQL refuse alors tout UPDATE et tout DELETE sur une table publiée sans identité de réplication.
-- Trouvé en vérification sur la vraie pile locale. REPLICA IDENTITY FULL envoie l'ancienne ligne entière : aucune
-- colonne sensible (que des compteurs), la RLS limite toujours chaque abonnement à l'espace du membre.
-- =====================================================================

alter table public.stats_daily replica identity full;
