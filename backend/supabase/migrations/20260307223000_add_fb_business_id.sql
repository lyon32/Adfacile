-- Migration to add fb_business_id for WhatsApp onboarding
ALTER TABLE facebook_accounts 
ADD COLUMN IF NOT EXISTS fb_business_id TEXT;
