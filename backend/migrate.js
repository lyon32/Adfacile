const { supabase } = require('./src/config/supabase');

async function migrate() {
    try {
        console.log('Running migration...');

        // We can't do DDL (ALTER TABLE) directly via typical Supabase client select/insert
        // But we can try to call a postgres function if it exists, or just use raw query via the client
        // Let's use the REST API approach with a special SQL endpoint if available,
        // Actually, the simplest way is to manually add the column in the Supabase Dashboard
        // BUT we can try an RPC call to a generic exec function if the user has one, 
        // OR we can just instruct the user.

        // Let's try inserting a dummy record to see the exact error.
        const { error } = await supabase.from('facebook_accounts').select('fb_business_id').limit(1);
        if (error) {
            console.error('Column check failed (expected if missing):', error);
            console.log('\n--- ACTION REQUIRED ---');
            console.log('Please run this SQL in your Supabase SQL Editor:');
            console.log('ALTER TABLE facebook_accounts ADD COLUMN IF NOT EXISTS fb_business_id TEXT;');
        } else {
            console.log('Column fb_business_id already exists!');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

migrate();
