-- ═══════════════════════════════════════════════════════════════
-- SCHÉMA COMPLET ADSFACILE - VERSION FINALE
-- À exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
-- FONCTION UTILITAIRE : AUTO UPDATE updated_at
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- TABLE 1 : USERS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE users (
  -- Identité
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     VARCHAR(255) UNIQUE NOT NULL,
  password_hash             VARCHAR(255) NOT NULL,
  phone                     VARCHAR(20) UNIQUE,

  -- Profil
  first_name                VARCHAR(100),
  last_name                 VARCHAR(100),
  business_name             VARCHAR(255),
  niche                     VARCHAR(100),
  city                      VARCHAR(100),
  country                   VARCHAR(50) DEFAULT 'Cameroun',
  profile_picture_url       TEXT,
  bio                       TEXT,
  website_url               TEXT,

  -- Vérification
  email_verified            BOOLEAN DEFAULT FALSE,
  email_verification_token  VARCHAR(255),
  phone_verified            BOOLEAN DEFAULT FALSE,

  -- Abonnement
  plan                      VARCHAR(20) DEFAULT 'free'
                            CHECK (plan IN ('free','starter','pro','agency')),
  plan_started_at           TIMESTAMP WITH TIME ZONE,
  plan_expires_at           TIMESTAMP WITH TIME ZONE,
  stripe_customer_id        VARCHAR(255),

  -- Crédits IA
  ai_credits                INTEGER DEFAULT 3 CHECK (ai_credits >= 0),
  ai_credits_reset_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Usage ce mois
  campaigns_this_month      INTEGER DEFAULT 0,
  campaigns_reset_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Préférences
  language                  VARCHAR(10) DEFAULT 'fr',
  timezone                  VARCHAR(50) DEFAULT 'Africa/Douala',
  notifications_email       BOOLEAN DEFAULT TRUE,
  notifications_whatsapp    BOOLEAN DEFAULT FALSE,
  newsletter                BOOLEAN DEFAULT FALSE,

  -- Sécurité
  two_factor_enabled        BOOLEAN DEFAULT FALSE,
  two_factor_secret         TEXT,
  failed_login_attempts     INTEGER DEFAULT 0,
  locked_until              TIMESTAMP WITH TIME ZONE,

  -- Parrainage
  referral_code             VARCHAR(20) UNIQUE,
  referred_by               UUID REFERENCES users(id),
  referral_credits_earned   INTEGER DEFAULT 0,

  -- Métadonnées
  last_login                TIMESTAMP WITH TIME ZONE,
  last_active               TIMESTAMP WITH TIME ZONE,
  signup_source             VARCHAR(50),
  utm_source                VARCHAR(100),
  utm_medium                VARCHAR(100),
  utm_campaign              VARCHAR(100),
  ip_address_signup         INET,

  -- Timestamps
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at                TIMESTAMP WITH TIME ZONE
);

-- Index users
CREATE INDEX idx_users_email        ON users(email);
CREATE INDEX idx_users_phone        ON users(phone);
CREATE INDEX idx_users_plan         ON users(plan);
CREATE INDEX idx_users_referral     ON users(referral_code);
CREATE INDEX idx_users_created_at   ON users(created_at);

-- Trigger updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- TABLE 2 : PASSWORD RESETS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  token       VARCHAR(255) UNIQUE NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  used_at     TIMESTAMP WITH TIME ZONE,
  ip_address  INET,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_password_resets_token      ON password_resets(token);
CREATE INDEX idx_password_resets_email      ON password_resets(email);
CREATE INDEX idx_password_resets_expires_at ON password_resets(expires_at);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 3 : LOGIN ATTEMPTS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE login_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  email           VARCHAR(255),
  ip_address      INET,
  user_agent      TEXT,
  success         BOOLEAN NOT NULL,
  failure_reason  VARCHAR(100),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_user_id    ON login_attempts(user_id);
CREATE INDEX idx_login_attempts_ip         ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at);
CREATE INDEX idx_login_attempts_success    ON login_attempts(success);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 4 : FACEBOOK ACCOUNTS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE facebook_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Facebook Identity
  fb_user_id              VARCHAR(255),
  fb_account_id           VARCHAR(255) NOT NULL,
  fb_account_name         VARCHAR(255),
  fb_page_id              VARCHAR(255),
  fb_page_name            VARCHAR(255),
  fb_page_picture_url     TEXT,

  -- Tokens (encrypted)
  fb_access_token         TEXT NOT NULL,
  fb_token_expires_at     TIMESTAMP WITH TIME ZONE,
  fb_token_iv             VARCHAR(100),
  fb_token_auth_tag       VARCHAR(100),

  -- Instagram
  instagram_connected     BOOLEAN DEFAULT FALSE,
  instagram_username      VARCHAR(255),
  instagram_account_id    VARCHAR(255),
  instagram_connected_at  TIMESTAMP WITH TIME ZONE,

  -- WhatsApp
  whatsapp_connected      BOOLEAN DEFAULT FALSE,
  whatsapp_number         VARCHAR(20),
  whatsapp_business_id    VARCHAR(255),
  whatsapp_connected_at   TIMESTAMP WITH TIME ZONE,

  -- Status
  is_active               BOOLEAN DEFAULT TRUE,
  last_sync_at            TIMESTAMP WITH TIME ZONE,
  sync_error              TEXT,

  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fb_accounts_user_id      ON facebook_accounts(user_id);
CREATE INDEX idx_fb_accounts_fb_account   ON facebook_accounts(fb_account_id);
CREATE INDEX idx_fb_accounts_active       ON facebook_accounts(is_active);

CREATE TRIGGER update_fb_accounts_updated_at
  BEFORE UPDATE ON facebook_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- TABLE 5 : CAMPAIGNS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE campaigns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facebook_account_id     UUID NOT NULL REFERENCES facebook_accounts(id),

  -- Facebook IDs
  fb_campaign_id          VARCHAR(255),
  fb_adset_id             VARCHAR(255),
  fb_ad_id                VARCHAR(255),
  fb_creative_id          VARCHAR(255),

  -- Campaign Info
  name                    VARCHAR(255) NOT NULL,
  objective               VARCHAR(100)
                          CHECK (objective IN (
                            'BRAND_AWARENESS','REACH','TRAFFIC',
                            'ENGAGEMENT','APP_INSTALLS','VIDEO_VIEWS',
                            'LEAD_GENERATION','CONVERSIONS','CATALOG_SALES',
                            'STORE_TRAFFIC'
                          )),
  status                  VARCHAR(50) DEFAULT 'draft'
                          CHECK (status IN (
                            'draft','active','paused',
                            'completed','deleted','error'
                          )),

  -- Budget
  budget_type             VARCHAR(20) DEFAULT 'daily'
                          CHECK (budget_type IN ('daily','lifetime')),
  budget_daily            DECIMAL(12,2),
  budget_total            DECIMAL(12,2),
  budget_spent            DECIMAL(12,2) DEFAULT 0,

  -- Schedule
  start_date              TIMESTAMP WITH TIME ZONE,
  end_date                TIMESTAMP WITH TIME ZONE,
  run_schedule            JSONB,

  -- Targeting
  niche                   VARCHAR(100),
  target_locations        JSONB,
  target_age_min          INTEGER DEFAULT 18,
  target_age_max          INTEGER DEFAULT 65,
  target_gender           VARCHAR(20) DEFAULT 'ALL'
                          CHECK (target_gender IN ('ALL','MALE','FEMALE')),
  target_interests        JSONB,
  target_behaviors        JSONB,
  target_custom_audiences JSONB,
  target_lookalike        JSONB,
  estimated_reach         INTEGER,
  estimated_reach_min     INTEGER,
  estimated_reach_max     INTEGER,

  -- Creative
  ad_format               VARCHAR(50) DEFAULT 'single_image'
                          CHECK (ad_format IN (
                            'single_image','carousel','video',
                            'slideshow','collection','story'
                          )),
  ad_text                 TEXT,
  ad_headline             VARCHAR(255),
  ad_description          VARCHAR(500),
  ad_image_url            TEXT,
  ad_video_url            TEXT,
  ad_cta                  VARCHAR(50),
  ad_cta_url              TEXT,
  ad_cta_type             VARCHAR(50),
  ad_placement            JSONB DEFAULT '["facebook_feed","instagram_feed"]',

  -- Destination
  destination_type        VARCHAR(50) DEFAULT 'website'
                          CHECK (destination_type IN (
                            'website','whatsapp','messenger',
                            'instagram','lead_form','call'
                          )),
  destination_url         TEXT,
  destination_phone       VARCHAR(20),

  -- AI
  created_by_assistant    BOOLEAN DEFAULT FALSE,
  ai_generation_id        UUID,
  ai_score                INTEGER,
  ai_recommendations      JSONB,

  -- Performance cache (updated by cron)
  cached_impressions      INTEGER DEFAULT 0,
  cached_clicks           INTEGER DEFAULT 0,
  cached_conversions      INTEGER DEFAULT 0,
  cached_spend            DECIMAL(12,2) DEFAULT 0,
  cached_ctr              DECIMAL(6,4) DEFAULT 0,
  cached_cpc              DECIMAL(10,2) DEFAULT 0,
  cached_roas             DECIMAL(8,4) DEFAULT 0,
  cache_updated_at        TIMESTAMP WITH TIME ZONE,

  -- Metadata
  tags                    TEXT[],
  notes                   TEXT,
  template_id             UUID,
  cloned_from             UUID REFERENCES campaigns(id),

  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at            TIMESTAMP WITH TIME ZONE,
  deleted_at              TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_campaigns_user_id       ON campaigns(user_id);
CREATE INDEX idx_campaigns_fb_account    ON campaigns(facebook_account_id);
CREATE INDEX idx_campaigns_status        ON campaigns(status);
CREATE INDEX idx_campaigns_fb_campaign   ON campaigns(fb_campaign_id);
CREATE INDEX idx_campaigns_created_at    ON campaigns(created_at);
CREATE INDEX idx_campaigns_niche         ON campaigns(niche);
CREATE INDEX idx_campaigns_tags          ON campaigns USING gin(tags);

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- TABLE 6 : CAMPAIGN STATS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE campaign_stats (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Period
  date                  DATE NOT NULL,
  hour                  INTEGER,

  -- Core Metrics
  impressions           INTEGER DEFAULT 0,
  clicks                INTEGER DEFAULT 0,
  conversions           INTEGER DEFAULT 0,
  reach                 INTEGER DEFAULT 0,
  frequency             DECIMAL(6,2) DEFAULT 0,
  spend                 DECIMAL(12,2) DEFAULT 0,

  -- Calculated Metrics
  ctr                   DECIMAL(8,4) DEFAULT 0,
  cpc                   DECIMAL(10,2) DEFAULT 0,
  cpm                   DECIMAL(10,2) DEFAULT 0,
  cpp                   DECIMAL(10,2) DEFAULT 0,
  roas                  DECIMAL(8,4) DEFAULT 0,
  cost_per_conversion   DECIMAL(10,2) DEFAULT 0,

  -- Engagement
  likes                 INTEGER DEFAULT 0,
  shares                INTEGER DEFAULT 0,
  comments              INTEGER DEFAULT 0,
  video_views           INTEGER DEFAULT 0,
  video_view_rate       DECIMAL(6,4) DEFAULT 0,

  -- Breakdown
  age_gender_breakdown  JSONB,
  placement_breakdown   JSONB,
  region_breakdown      JSONB,
  device_breakdown      JSONB,
  hourly_breakdown      JSONB,

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(campaign_id, date, hour)
);

CREATE INDEX idx_campaign_stats_campaign_id ON campaign_stats(campaign_id);
CREATE INDEX idx_campaign_stats_date        ON campaign_stats(date);
CREATE INDEX idx_campaign_stats_campaign_date ON campaign_stats(campaign_id, date);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 7 : AI GENERATIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE ai_generations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Type
  generation_type   VARCHAR(50) NOT NULL
                    CHECK (generation_type IN (
                      'ad_text','ad_image','audience',
                      'budget','full_campaign','competitor_analysis',
                      'performance_analysis','website_audit'
                    )),

  -- Input/Output
  input_data        JSONB NOT NULL,
  output_data       JSONB NOT NULL,
  prompt_used       TEXT,

  -- Model Info
  model_used        VARCHAR(100),
  tokens_input      INTEGER,
  tokens_output     INTEGER,
  tokens_total      INTEGER,
  cost_usd          DECIMAL(10,6),
  processing_time   INTEGER,

  -- Quality
  user_rating       INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  user_used         BOOLEAN DEFAULT FALSE,
  user_feedback     TEXT,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_gen_user_id   ON ai_generations(user_id);
CREATE INDEX idx_ai_gen_type      ON ai_generations(generation_type);
CREATE INDEX idx_ai_gen_created   ON ai_generations(created_at);
CREATE INDEX idx_ai_gen_campaign  ON ai_generations(campaign_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 8 : SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Plan Details
  plan                  VARCHAR(20) NOT NULL
                        CHECK (plan IN ('free','starter','pro','agency')),
  billing_period        VARCHAR(20) DEFAULT 'monthly'
                        CHECK (billing_period IN ('monthly','yearly')),
  status                VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN (
                          'active','canceled','expired',
                          'past_due','trialing','paused'
                        )),

  -- Pricing
  amount                DECIMAL(12,2) NOT NULL,
  currency              VARCHAR(10) DEFAULT 'XAF',
  discount_percent      INTEGER DEFAULT 0,
  discount_code         VARCHAR(50),

  -- Dates
  trial_start           TIMESTAMP WITH TIME ZONE,
  trial_end             TIMESTAMP WITH TIME ZONE,
  current_period_start  TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end    TIMESTAMP WITH TIME ZONE NOT NULL,
  canceled_at           TIMESTAMP WITH TIME ZONE,
  cancel_reason         TEXT,

  -- Auto-renew
  auto_renew            BOOLEAN DEFAULT TRUE,
  renewal_reminder_sent BOOLEAN DEFAULT FALSE,

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status  ON subscriptions(status);
CREATE INDEX idx_subscriptions_plan    ON subscriptions(plan);
CREATE INDEX idx_subscriptions_period  ON subscriptions(current_period_end);

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- TABLE 9 : PAYMENTS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id       UUID REFERENCES subscriptions(id),

  -- Amount
  amount                DECIMAL(12,2) NOT NULL,
  currency              VARCHAR(10) DEFAULT 'XAF',
  amount_before_discount DECIMAL(12,2),
  discount_amount       DECIMAL(12,2) DEFAULT 0,

  -- Status
  status                VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN (
                          'pending','processing','completed',
                          'failed','refunded','canceled','disputed'
                        )),

  -- Payment Method
  payment_method        VARCHAR(50)
                        CHECK (payment_method IN (
                          'mtn_mobile_money','orange_money',
                          'card','bank_transfer','free'
                        )),
  payment_phone         VARCHAR(20),

  -- Provider (MeSomb)
  payment_provider      VARCHAR(50) DEFAULT 'mesomb',
  transaction_id        VARCHAR(255) UNIQUE,
  provider_reference    VARCHAR(255),
  provider_status       VARCHAR(100),
  provider_message      TEXT,
  webhook_received_at   TIMESTAMP WITH TIME ZONE,

  -- Invoice
  invoice_number        VARCHAR(50) UNIQUE,
  invoice_pdf_url       TEXT,
  invoice_sent          BOOLEAN DEFAULT FALSE,

  -- Metadata
  description           TEXT,
  metadata              JSONB,
  failure_reason        TEXT,
  retry_count           INTEGER DEFAULT 0,
  next_retry_at         TIMESTAMP WITH TIME ZONE,

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at               TIMESTAMP WITH TIME ZONE,
  refunded_at           TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_payments_user_id        ON payments(user_id);
CREATE INDEX idx_payments_subscription   ON payments(subscription_id);
CREATE INDEX idx_payments_status         ON payments(status);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX idx_payments_created_at     ON payments(created_at);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 10 : COMPETITOR ADS (Ad Library Cache)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE competitor_ads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Search Context
  search_keyword    VARCHAR(255),
  niche             VARCHAR(100),
  country           VARCHAR(10) DEFAULT 'CM',

  -- Facebook Ad Data
  fb_ad_id          VARCHAR(255),
  fb_page_id        VARCHAR(255),
  fb_page_name      VARCHAR(255),
  fb_page_logo_url  TEXT,

  -- Ad Content
  ad_text           TEXT,
  ad_headline       VARCHAR(255),
  ad_description    TEXT,
  ad_cta            VARCHAR(100),
  ad_image_url      TEXT,
  ad_video_url      TEXT,
  ad_format         VARCHAR(50),

  -- Metadata
  ad_active_status  VARCHAR(50),
  ad_start_date     DATE,
  ad_end_date       DATE,
  placements        JSONB,
  languages         TEXT[],

  -- Analysis
  estimated_budget  DECIMAL(12,2),
  engagement_score  INTEGER,
  ai_analysis       JSONB,

  -- Cache
  fetched_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_competitor_ads_user    ON competitor_ads(user_id);
CREATE INDEX idx_competitor_ads_keyword ON competitor_ads(search_keyword);
CREATE INDEX idx_competitor_ads_niche   ON competitor_ads(niche);
CREATE INDEX idx_competitor_ads_expires ON competitor_ads(expires_at);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 11 : NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  type        VARCHAR(50) NOT NULL
              CHECK (type IN (
                'campaign_published','campaign_paused',
                'budget_alert','performance_alert',
                'payment_success','payment_failed',
                'subscription_renewal','subscription_expiring',
                'ai_generation_complete','competitor_update',
                'system','welcome','tip'
              )),
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  data        JSONB,
  action_url  TEXT,
  icon        VARCHAR(50),

  -- Delivery
  channel     VARCHAR(20) DEFAULT 'in_app'
              CHECK (channel IN ('in_app','email','whatsapp','push')),

  -- Status
  read        BOOLEAN DEFAULT FALSE,
  read_at     TIMESTAMP WITH TIME ZONE,
  sent        BOOLEAN DEFAULT FALSE,
  sent_at     TIMESTAMP WITH TIME ZONE,

  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_type       ON notifications(type);
CREATE INDEX idx_notifications_read       ON notifications(user_id, read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 12 : AUDIT LOGS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Event
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  resource_id UUID,

  -- Details
  old_values  JSONB,
  new_values  JSONB,
  metadata    JSONB,

  -- Context
  ip_address  INET,
  user_agent  TEXT,
  request_id  VARCHAR(100),

  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource   ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 13 : REFERRALS (Programme parrainage)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code   VARCHAR(20) NOT NULL,

  -- Status
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','qualified','rewarded')),

  -- Rewards
  referrer_reward INTEGER DEFAULT 0,
  referred_reward INTEGER DEFAULT 0,
  rewarded_at     TIMESTAMP WITH TIME ZONE,

  -- Qualifications
  qualified_at    TIMESTAMP WITH TIME ZONE,
  payment_made    BOOLEAN DEFAULT FALSE,
  payment_amount  DECIMAL(12,2),

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(referrer_id, referred_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);
CREATE INDEX idx_referrals_status   ON referrals(status);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 14 : TEMPLATES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Content
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  niche           VARCHAR(100),
  objective       VARCHAR(100),
  category        VARCHAR(100),

  -- Template Data
  template_data   JSONB NOT NULL,
  preview_image   TEXT,
  preview_metrics JSONB,

  -- Visibility
  is_public       BOOLEAN DEFAULT FALSE,
  is_premium      BOOLEAN DEFAULT FALSE,
  price           DECIMAL(10,2) DEFAULT 0,

  -- Stats
  uses_count      INTEGER DEFAULT 0,
  rating_avg      DECIMAL(3,2) DEFAULT 0,
  rating_count    INTEGER DEFAULT 0,

  -- Status
  status          VARCHAR(20) DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),

  tags            TEXT[],

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_templates_creator  ON templates(creator_id);
CREATE INDEX idx_templates_niche    ON templates(niche);
CREATE INDEX idx_templates_public   ON templates(is_public);
CREATE INDEX idx_templates_status   ON templates(status);
CREATE INDEX idx_templates_tags     ON templates USING gin(tags);

-- ═══════════════════════════════════════════════════════════════
-- TABLE 15 : WEBSITE AUDITS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE website_audits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Target
  url                 TEXT NOT NULL,
  domain              VARCHAR(255),

  -- Scores
  overall_score       INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  performance_score   INTEGER CHECK (performance_score BETWEEN 0 AND 100),
  seo_score           INTEGER CHECK (seo_score BETWEEN 0 AND 100),
  mobile_score        INTEGER CHECK (mobile_score BETWEEN 0 AND 100),
  security_score      INTEGER CHECK (security_score BETWEEN 0 AND 100),
  conversion_score    INTEGER CHECK (conversion_score BETWEEN 0 AND 100),

  -- Checks
  checks_passed       JSONB,
  checks_failed       JSONB,
  recommendations     JSONB,

  -- Technical
  load_time_desktop   INTEGER,
  load_time_mobile    INTEGER,
  page_size_bytes     INTEGER,
  requests_count      INTEGER,

  -- SEO
  meta_title          TEXT,
  meta_description    TEXT,
  h1_tags             TEXT[],
  has_sitemap         BOOLEAN,
  has_robots_txt      BOOLEAN,
  ssl_valid           BOOLEAN,

  -- Tracking
  has_facebook_pixel  BOOLEAN,
  has_google_analytics BOOLEAN,
  has_whatsapp_button BOOLEAN,

  -- Accessibility
  is_mobile_friendly  BOOLEAN,
  has_viewport_meta   BOOLEAN,

  -- Status
  status              VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','failed')),
  error_message       TEXT,

  -- Report
  pdf_url             TEXT,

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at        TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_website_audits_user_id    ON website_audits(user_id);
CREATE INDEX idx_website_audits_url        ON website_audits(url);
CREATE INDEX idx_website_audits_created_at ON website_audits(created_at);

-- ═══════════════════════════════════════════════════════════════
-- VUES UTILES
-- ═══════════════════════════════════════════════════════════════

-- Vue : Stats globales par user
CREATE OR REPLACE VIEW user_dashboard_stats AS
SELECT
  u.id as user_id,
  u.plan,

  -- Campagnes
  COUNT(DISTINCT c.id) as total_campaigns,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') as active_campaigns,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'paused') as paused_campaigns,

  -- Performance
  COALESCE(SUM(c.cached_impressions), 0) as total_impressions,
  COALESCE(SUM(c.cached_clicks), 0) as total_clicks,
  COALESCE(SUM(c.cached_spend), 0) as total_spend,

  -- IA
  u.ai_credits,
  COUNT(DISTINCT ai.id) as total_ai_generations,

  -- Subscription
  s.current_period_end as subscription_expires,

  -- Compte Facebook
  COUNT(DISTINCT fa.id) as facebook_accounts_count

FROM users u
LEFT JOIN campaigns c ON c.user_id = u.id AND c.deleted_at IS NULL
LEFT JOIN ai_generations ai ON ai.user_id = u.id
LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
LEFT JOIN facebook_accounts fa ON fa.user_id = u.id AND fa.is_active = TRUE
GROUP BY u.id, u.plan, u.ai_credits, s.current_period_end;

-- Vue : Campagnes avec stats récentes
CREATE OR REPLACE VIEW campaigns_with_stats AS
SELECT
  c.*,
  -- Stats 7 derniers jours
  COALESCE(SUM(cs.impressions) FILTER (
    WHERE cs.date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) as impressions_7d,
  COALESCE(SUM(cs.clicks) FILTER (
    WHERE cs.date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) as clicks_7d,
  COALESCE(SUM(cs.spend) FILTER (
    WHERE cs.date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) as spend_7d,
  -- Stats 30 derniers jours
  COALESCE(SUM(cs.impressions) FILTER (
    WHERE cs.date >= CURRENT_DATE - INTERVAL '30 days'
  ), 0) as impressions_30d,
  COALESCE(SUM(cs.clicks) FILTER (
    WHERE cs.date >= CURRENT_DATE - INTERVAL '30 days'
  ), 0) as clicks_30d,
  COALESCE(SUM(cs.spend) FILTER (
    WHERE cs.date >= CURRENT_DATE - INTERVAL '30 days'
  ), 0) as spend_30d
FROM campaigns c
LEFT JOIN campaign_stats cs ON cs.campaign_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

-- Vue : Revenue mensuel
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT
  DATE_TRUNC('month', paid_at) as month,
  COUNT(*) as payments_count,
  SUM(amount) as total_revenue,
  SUM(amount) FILTER (WHERE payment_method = 'mtn_mobile_money') as mtn_revenue,
  SUM(amount) FILTER (WHERE payment_method = 'orange_money') as orange_revenue,
  AVG(amount) as avg_payment
FROM payments
WHERE status = 'completed'
  AND paid_at IS NOT NULL
GROUP BY DATE_TRUNC('month', paid_at)
ORDER BY month DESC;

-- ═══════════════════════════════════════════════════════════════
-- FONCTIONS UTILITAIRES
-- ═══════════════════════════════════════════════════════════════

-- Fonction : Vérifier limite campagnes
CREATE OR REPLACE FUNCTION check_campaign_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan VARCHAR(20);
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM users WHERE id = p_user_id;

  SELECT campaigns_this_month INTO v_count
  FROM users WHERE id = p_user_id;

  v_limit := CASE v_plan
    WHEN 'free'    THEN 1
    WHEN 'starter' THEN 5
    WHEN 'pro'     THEN 999999
    WHEN 'agency'  THEN 999999
    ELSE 0
  END;

  RETURN v_count < v_limit;
END;
$$ LANGUAGE plpgsql;

-- Fonction : Vérifier limite IA
CREATE OR REPLACE FUNCTION check_ai_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  SELECT ai_credits INTO v_credits
  FROM users WHERE id = p_user_id;

  RETURN v_credits > 0;
END;
$$ LANGUAGE plpgsql;

-- Fonction : Reset crédits mensuels (cron monthly)
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
  UPDATE users SET
    ai_credits = CASE plan
      WHEN 'free'    THEN 3
      WHEN 'starter' THEN 20
      WHEN 'pro'     THEN 999999
      WHEN 'agency'  THEN 999999
      ELSE 3
    END,
    campaigns_this_month = 0,
    ai_credits_reset_at = NOW(),
    campaigns_reset_at = NOW()
  WHERE plan IN ('free','starter','pro','agency');
END;
$$ LANGUAGE plpgsql;

-- Fonction : Nettoyer données expirées
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Tokens reset expirés
  DELETE FROM password_resets
  WHERE expires_at < NOW() - INTERVAL '24 hours';

  -- Login attempts > 90 jours
  DELETE FROM login_attempts
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Competitor ads expirés
  DELETE FROM competitor_ads
  WHERE expires_at < NOW();

  -- Notifications expirées
  DELETE FROM notifications
  WHERE expires_at < NOW();

  -- Audit logs > 1 an
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- DONNÉES INITIALES (SEED)
-- ═══════════════════════════════════════════════════════════════

-- Templates de niches
INSERT INTO templates (name, description, niche, objective, template_data, is_public, status)
VALUES
  (
    'Promotion Restaurant - Déjeuner',
    'Template idéal pour promouvoir votre menu du déjeuner',
    'Restaurant / Restauration',
    'REACH',
    '{
      "ad_text": "🍽️ Menu déjeuner à petit prix ! Venez découvrir nos plats du jour, préparés avec des ingrédients frais.",
      "ad_headline": "Le meilleur déjeuner en ville",
      "ad_description": "Réservez maintenant",
      "ad_cta": "GET_DIRECTIONS",
      "target_age_min": 22,
      "target_age_max": 55,
      "target_gender": "ALL",
      "target_interests": ["Restaurants", "Food", "Dining"]
    }',
    TRUE,
    'published'
  ),
  (
    'Promotion Boutique Mode - Soldes',
    'Annoncez vos soldes et promotions mode',
    'Mode / Vêtements',
    'TRAFFIC',
    '{
      "ad_text": "🛍️ SOLDES ! Jusqu''à -50% sur toute notre collection. Offre limitée !",
      "ad_headline": "Soldes Exceptionnelles",
      "ad_description": "Commandez en ligne ou venez en boutique",
      "ad_cta": "SHOP_NOW",
      "target_age_min": 18,
      "target_age_max": 45,
      "target_gender": "FEMALE",
      "target_interests": ["Fashion", "Shopping", "Clothing"]
    }',
    TRUE,
    'published'
  ),
  (
    'Formation en Ligne - Inscription',
    'Recrutez des participants pour votre formation',
    'Formation / Education',
    'LEAD_GENERATION',
    '{
      "ad_text": "📚 Formez-vous et boostez votre carrière ! Notre formation certifiante vous ouvre les portes.",
      "ad_headline": "Formation Certifiante - Inscrivez-vous",
      "ad_description": "Places limitées, inscrivez-vous maintenant",
      "ad_cta": "SIGN_UP",
      "target_age_min": 20,
      "target_age_max": 45,
      "target_gender": "ALL",
      "target_interests": ["Education", "Online Learning", "Career Development"]
    }',
    TRUE,
    'published'
  );

-- ═══════════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- ═══════════════════════════════════════════════════════════════

-- Afficher toutes les tables créées
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = t.table_name
   AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Afficher toutes les vues créées
SELECT table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Afficher toutes les fonctions créées
SELECT routine_name as function_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;
