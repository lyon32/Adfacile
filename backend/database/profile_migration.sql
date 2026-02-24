-- ═══════════════════════════════════════════════════════════════════════════════
-- ADSFACILE - MIGRATION : Colonnes profil + table audit_logs
-- Ajout des colonnes manquantes pour le système de profil utilisateur
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ajouter les colonnes si elles n'existent pas
-- (ALTER TABLE ... ADD COLUMN IF NOT EXISTS est supporté par PostgreSQL 9.6+)

-- Bio utilisateur
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- URL photo de profil
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Token vérification email (pour changement d'email)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);

-- Email en attente de confirmation
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MISE À JOUR CONTRAINTE PLAN
-- Passer de ('free', 'pro', 'business') à ('free', 'starter', 'pro', 'agency')
-- ═══════════════════════════════════════════════════════════════════════════════

-- Étape 1 : Supprimer l'ancienne contrainte
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;

-- Étape 2 : Ajouter la nouvelle contrainte avec les 4 plans
ALTER TABLE users ADD CONSTRAINT users_plan_check 
    CHECK (plan IN ('free', 'starter', 'pro', 'agency'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE AUDIT_LOGS
-- Journal d'audit pour les actions utilisateur
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relation avec l'utilisateur
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Action effectuée
    action VARCHAR(100) NOT NULL,
    
    -- Détails supplémentaires (JSON)
    details JSONB DEFAULT '{}',
    
    -- Adresse IP (optionnel)
    ip_address VARCHAR(45),
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour rechercher les logs par utilisateur
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- Index pour rechercher par action
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Index temporel
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Politique : le backend peut insérer et lire
CREATE POLICY "Service can insert audit_logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can read audit_logs" ON audit_logs
    FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTAIRES
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE audit_logs IS 'Journal d''audit des actions utilisateur';
COMMENT ON COLUMN users.bio IS 'Bio utilisateur, max 500 caractères';
COMMENT ON COLUMN users.profile_picture_url IS 'URL publique de la photo de profil (Supabase Storage)';
COMMENT ON COLUMN users.pending_email IS 'Nouvel email en attente de confirmation';
