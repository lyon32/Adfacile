/**
 * Run migration to add plan_expires_at column
 * Execute with: node run_migration.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function runMigration() {
    console.log('🔄 Running migration: add plan_expires_at column...');

    // Step 1: Add plan_expires_at column
    const { error: err1 } = await supabase.rpc('exec_sql', {
        sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;"
    });

    if (err1) {
        console.log('⚠️ RPC exec_sql not available, trying direct approach...');

        // Alternative: Try to read current structure
        const { data, error } = await supabase
            .from('users')
            .select('id, plan')
            .limit(1);

        console.log('Current user data sample:', data);
        if (error) console.error('Error:', error);

        console.log('\n❌ Cannot run ALTER TABLE via Supabase JS client.');
        console.log('📋 Please run the following SQL in your Supabase SQL Editor:');
        console.log('');
        console.log('-- 1. Add missing column');
        console.log("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;");
        console.log('');
        console.log('-- 2. Drop old CHECK constraint');
        console.log(`DO $$ 
DECLARE constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
    WHERE con.conrelid = 'users'::regclass AND att.attname = 'plan' AND con.contype = 'c';
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;`);
        console.log('');
        console.log('-- 3. Add new CHECK with starter and agency');
        console.log("ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'starter', 'pro', 'agency'));");
        return;
    }

    console.log('✅ Step 1 done: plan_expires_at column added');
}

runMigration().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
