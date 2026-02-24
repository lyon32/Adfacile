-- ═══════════════════════════════════════════════════════════════════════════════
-- ADSFACILE - TABLE AI_GENERATIONS
-- Historique des générations IA (textes publicitaires, ciblage, analyses)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relation avec l'utilisateur
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Type de génération
    type VARCHAR(50) NOT NULL CHECK (type IN ('ad_text', 'targeting', 'analysis')),
    
    -- Données d'entrée et de sortie (JSON)
    input JSONB,
    output JSONB,
    
    -- Modèle IA utilisé
    model_used VARCHAR(100) NOT NULL,
    
    -- Tokens utilisés (optionnel, pour suivi coûts)
    tokens_used INTEGER DEFAULT 0,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour rechercher les générations par utilisateur
CREATE INDEX IF NOT EXISTS idx_ai_generations_user_id ON ai_generations(user_id);

-- Index pour filtrer par type
CREATE INDEX IF NOT EXISTS idx_ai_generations_type ON ai_generations(type);

-- Index pour les requêtes temporelles
CREATE INDEX IF NOT EXISTS idx_ai_generations_created_at ON ai_generations(created_at);

-- RLS
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;

-- Politique : le backend (service_role) peut tout insérer/lire
CREATE POLICY "Service can insert ai_generations" ON ai_generations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can read ai_generations" ON ai_generations
    FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MISE À JOUR CONTRAINTE PLAN (si nécessaire)
-- Ajouter 'starter' et 'agency' à la contrainte du champ plan dans users
-- ═══════════════════════════════════════════════════════════════════════════════

-- Supprimer l'ancienne contrainte si elle existe
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;

-- Ajouter la nouvelle contrainte avec les 4 plans
-- ALTER TABLE users ADD CONSTRAINT users_plan_check 
--     CHECK (plan IN ('free', 'starter', 'pro', 'agency'));

-- NOTE : Décommentez les lignes ci-dessus si votre table users
-- a encore l'ancienne contrainte ('free', 'pro', 'business').
-- Vérifiez d'abord avec :
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint WHERE conrelid = 'users'::regclass;
