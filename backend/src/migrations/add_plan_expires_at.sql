-- ═══════════════════════════════════════════════════════════════════════════════
-- ADSFACILE - Migration: Add plan_expires_at column & fix plan CHECK constraint
-- Run this SQL in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add the missing plan_expires_at column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;

-- 2. Drop the old CHECK constraint that only allows 'free', 'pro', 'business'
-- (Supabase/Postgres: constraint name is auto-generated, so we find and drop it)
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
    WHERE con.conrelid = 'users'::regclass
      AND att.attname = 'plan'
      AND con.contype = 'c';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No CHECK constraint found on plan column';
    END IF;
END $$;

-- 3. Add new CHECK constraint with all valid plans: free, starter, pro, agency
ALTER TABLE users 
ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'starter', 'pro', 'agency'));

-- 4. Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('plan', 'plan_expires_at', 'ai_credits')
ORDER BY ordinal_position;
