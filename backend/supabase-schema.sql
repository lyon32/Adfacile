-- ═══════════════════════════════════════════════════════════════════════════════
-- ADSFACILE - SCHEMA SQL POUR SUPABASE
-- Table 'users' pour le système d'inscription
-- ═══════════════════════════════════════════════════════════════════════════════

-- Activer l'extension UUID si pas déjà activée
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE USERS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    -- Identifiant unique
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Informations d'authentification
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    
    -- Informations personnelles (optionnelles)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    
    -- Informations business
    business_name VARCHAR(255),
    niche VARCHAR(100),
    city VARCHAR(100) DEFAULT 'Douala',
    
    -- Plan et crédits
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
    ai_credits INTEGER DEFAULT 3,
    
    -- Préférences
    newsletter BOOLEAN DEFAULT false,
    accept_terms BOOLEAN NOT NULL DEFAULT true,
    
    -- Statut du compte
    email_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEX POUR OPTIMISER LES RECHERCHES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Index sur email (déjà unique, mais explicite pour les recherches)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index sur phone pour vérification unicité
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Index sur plan pour filtrer les utilisateurs par plan
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- Index sur created_at pour les requêtes temporelles
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER POUR MISE À JOUR AUTOMATIQUE DE updated_at
-- ═══════════════════════════════════════════════════════════════════════════════

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger sur la table users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) - SÉCURITÉ
-- ═══════════════════════════════════════════════════════════════════════════════

-- Activer RLS sur la table users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'insertion (signup) sans authentification
CREATE POLICY "Allow public signup" ON users
    FOR INSERT
    WITH CHECK (true);

-- Politique pour permettre aux utilisateurs de lire leur propre profil
CREATE POLICY "Users can read own profile" ON users
    FOR SELECT
    USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

-- Politique pour permettre aux utilisateurs de modifier leur propre profil
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE
    USING (auth.uid()::text = id::text)
    WITH CHECK (auth.uid()::text = id::text);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTAIRES SUR LES COLONNES (DOCUMENTATION)
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE users IS 'Table des utilisateurs AdsFacile';
COMMENT ON COLUMN users.id IS 'Identifiant unique UUID';
COMMENT ON COLUMN users.email IS 'Email unique de l''utilisateur (lowercase)';
COMMENT ON COLUMN users.password_hash IS 'Mot de passe hashé avec bcrypt';
COMMENT ON COLUMN users.phone IS 'Numéro de téléphone format +237XXXXXXXXX';
COMMENT ON COLUMN users.plan IS 'Plan abonnement: free, pro, business';
COMMENT ON COLUMN users.ai_credits IS 'Crédits IA restants pour le mois';
COMMENT ON COLUMN users.niche IS 'Secteur d''activité de l''utilisateur';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION - Afficher la structure de la table
-- ═══════════════════════════════════════════════════════════════════════════════

-- Pour vérifier que tout est bien créé, exécutez :
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'users';
