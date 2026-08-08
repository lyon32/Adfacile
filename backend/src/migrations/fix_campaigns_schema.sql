-- ═══════════════════════════════════════════════════════════════════════════
-- Aligner la table campaigns sur ce que le code écrit réellement.
--
-- Constat : facebookAdsService.createFullCampaign() insère 13 colonnes, dont 6
-- n'existaient pas. L'insertion échouait donc systématiquement et l'erreur
-- était avalée (« La campagne existe sur FB même si la DB échoue ») : chaque
-- campagne était créée chez Facebook puis perdue côté application, sans
-- décompte du quota du plan. facebookInsightsService lisait lui aussi une
-- colonne inexistante, ce qui cassait les statistiques.
--
-- À exécuter dans l'éditeur SQL Supabase. Le script est idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nom de la colonne budget
--    Tout le code lit et écrit « daily_budget » ; la table disait
--    « budget_daily ». On renomme la colonne plutôt que de modifier le code en
--    six endroits. La colonne générée total_budget suit automatiquement.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'campaigns' AND column_name = 'budget_daily'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'campaigns' AND column_name = 'daily_budget'
    ) THEN
        ALTER TABLE campaigns RENAME COLUMN budget_daily TO daily_budget;
    END IF;
END $$;

-- 2. Identifiants Facebook des trois niveaux
--    Sans eux, impossible de mettre en pause, modifier ou supprimer l'ensemble
--    de publicités et la publicité créés : seul l'ID de campagne était gardé.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fb_adset_id    VARCHAR(64);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fb_ad_id       VARCHAR(64);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fb_creative_id VARCHAR(64);

-- 3. Ciblage et création publicitaire complets
--    Les colonnes audience_* et creative_* existantes ne couvrent qu'une partie
--    de ce que l'application manipule (intérêts avec IDs Facebook, localisations
--    typées, variantes de créa). On stocke l'objet complet en JSONB.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS targeting JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creative  JSONB;

-- 3 bis. Destination
--    destination_type est le type calculé envoyé à Meta ; messaging_destinations
--    garde les cases cochées par l'utilisateur, seule information permettant de
--    réafficher son choix à l'identique (MESSAGING_MESSENGER_WHATSAPP ne dit pas
--    dans quel ordre ni pourquoi les deux ont été retenues).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS destination_type       VARCHAR(64);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS messaging_destinations TEXT[];

-- 4. Contrainte sur objective
--    La contrainte n'acceptait que ('traffic', 'engagement', 'conversions'),
--    alors que l'application envoie les objectifs ODAX de Meta
--    (OUTCOME_TRAFFIC, OUTCOME_SALES, LINK_CLICKS, MESSAGES...). Figer en base
--    une énumération qui appartient à un tiers est précisément ce qui a cassé :
--    on la retire et la validation reste applicative.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_objective_check;

-- 5. Index sur les identifiants Facebook, utilisés pour la synchronisation
CREATE INDEX IF NOT EXISTS idx_campaigns_fb_adset_id ON campaigns (fb_adset_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_fb_ad_id    ON campaigns (fb_ad_id);
