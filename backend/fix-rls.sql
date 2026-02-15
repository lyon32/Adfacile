-- ═══════════════════════════════════════════════════════════════════════════════
-- ADSFACILE - CORRECTION RLS POUR SIGNUP
-- Exécutez ce script dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Option 1: Désactiver temporairement RLS (plus simple pour le développement)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- OU Option 2: Si vous voulez garder RLS activé, créez ces policies:
-- (Décommentez les lignes ci-dessous si Option 1 ne fonctionne pas)

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies si elles existent
-- DROP POLICY IF EXISTS "Allow public signup" ON users;
-- DROP POLICY IF EXISTS "Users can view own profile" ON users;
-- DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Créer la policy pour permettre l'inscription publique
-- CREATE POLICY "Allow public signup" ON users
--     FOR INSERT
--     TO anon
--     WITH CHECK (true);

-- CREATE POLICY "Users can view own profile" ON users
--     FOR SELECT
--     TO authenticated
--     USING (auth.uid()::text = id::text);

-- CREATE POLICY "Users can update own profile" ON users
--     FOR UPDATE
--     TO authenticated
--     USING (auth.uid()::text = id::text);
