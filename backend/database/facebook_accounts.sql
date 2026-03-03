-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration : facebook_accounts
-- Stocke les connexions Facebook Business des utilisateurs AdsFacile
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extension UUID (si pas déjà activée)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table facebook_accounts
CREATE TABLE IF NOT EXISTS facebook_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fb_user_id VARCHAR(255) NOT NULL,
    fb_account_id VARCHAR(255) NOT NULL,
    fb_page_id VARCHAR(255),
    fb_page_name VARCHAR(255),
    fb_access_token TEXT NOT NULL,  -- chiffré AES-256-CBC
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide par utilisateur
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_user ON facebook_accounts(user_id);

-- Contrainte unique : un seul compte Facebook actif par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_accounts_user_unique
    ON facebook_accounts(user_id) WHERE is_active = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- Chaque utilisateur ne peut voir/modifier que son propre compte Facebook
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE facebook_accounts ENABLE ROW LEVEL SECURITY;

-- Policy : lecture
DROP POLICY IF EXISTS facebook_accounts_select_policy ON facebook_accounts;
CREATE POLICY facebook_accounts_select_policy ON facebook_accounts
    FOR SELECT USING (auth.uid() = user_id);

-- Policy : insertion
DROP POLICY IF EXISTS facebook_accounts_insert_policy ON facebook_accounts;
CREATE POLICY facebook_accounts_insert_policy ON facebook_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy : mise à jour
DROP POLICY IF EXISTS facebook_accounts_update_policy ON facebook_accounts;
CREATE POLICY facebook_accounts_update_policy ON facebook_accounts
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy : suppression
DROP POLICY IF EXISTS facebook_accounts_delete_policy ON facebook_accounts;
CREATE POLICY facebook_accounts_delete_policy ON facebook_accounts
    FOR DELETE USING (auth.uid() = user_id);

-- Policy : accès complet pour service_role (backend)
DROP POLICY IF EXISTS facebook_accounts_service_policy ON facebook_accounts;
CREATE POLICY facebook_accounts_service_policy ON facebook_accounts
    FOR ALL USING (TRUE) WITH CHECK (TRUE);
