-- ═══════════════════════════════════════════════════════════════
-- Migration: Add Instagram/WhatsApp columns + multi-page support
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Instagram columns (IF NOT EXISTS for safety)
ALTER TABLE facebook_accounts
ADD COLUMN IF NOT EXISTS instagram_connected BOOLEAN DEFAULT false;

ALTER TABLE facebook_accounts
ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(255);

ALTER TABLE facebook_accounts
ADD COLUMN IF NOT EXISTS instagram_account_id VARCHAR(255);

-- WhatsApp columns
ALTER TABLE facebook_accounts
ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false;

ALTER TABLE facebook_accounts
ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50);

ALTER TABLE facebook_accounts
ADD COLUMN IF NOT EXISTS whatsapp_business_id VARCHAR(255);

-- Index for active page lookup
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_user_active
ON facebook_accounts(user_id, is_active)
WHERE is_active = true;
