-- ═══════════════════════════════════════════════════════════════════════════════
-- AdsFacile — Migration : Table campaigns
-- ═══════════════════════════════════════════════════════════════════════════════

-- Activer l'extension UUID si pas déjà fait
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Table campaigns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Infos campagne
    name VARCHAR(255) NOT NULL,
    objective VARCHAR(50) NOT NULL CHECK (objective IN ('traffic', 'engagement', 'conversions')),
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),

    -- Audience
    audience_location VARCHAR(100),
    audience_age_min INTEGER DEFAULT 18 CHECK (audience_age_min >= 13),
    audience_age_max INTEGER DEFAULT 65 CHECK (audience_age_max <= 65),
    audience_gender VARCHAR(20) DEFAULT 'all' CHECK (audience_gender IN ('all', 'male', 'female')),
    audience_interests TEXT[], -- Array de tags

    -- Budget
    budget_daily INTEGER NOT NULL DEFAULT 5000, -- en FCFA
    start_date DATE,
    end_date DATE,
    total_budget INTEGER GENERATED ALWAYS AS (
        CASE 
            WHEN start_date IS NOT NULL AND end_date IS NOT NULL 
            THEN budget_daily * (end_date - start_date + 1)
            ELSE budget_daily 
        END
    ) STORED,

    -- Creative
    creative_headline VARCHAR(40),
    creative_primary_text TEXT,
    creative_description VARCHAR(90),
    creative_cta VARCHAR(50) DEFAULT 'LEARN_MORE',
    creative_image_url TEXT,

    -- Stats Facebook (mises à jour par sync)
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    spent INTEGER DEFAULT 0, -- en FCFA
    fb_campaign_id VARCHAR(255), -- ID campagne côté Facebook

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    launched_at TIMESTAMP WITH TIME ZONE
);

-- ─── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Policy : les utilisateurs ne voient que leurs propres campagnes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaigns_user_select') THEN
        CREATE POLICY campaigns_user_select ON campaigns FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaigns_user_insert') THEN
        CREATE POLICY campaigns_user_insert ON campaigns FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaigns_user_update') THEN
        CREATE POLICY campaigns_user_update ON campaigns FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaigns_user_delete') THEN
        CREATE POLICY campaigns_user_delete ON campaigns FOR DELETE USING (true);
    END IF;
END $$;

-- ─── Trigger updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_campaigns_updated_at ON campaigns;
CREATE TRIGGER trigger_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_campaigns_updated_at();
