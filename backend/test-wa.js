const { supabase } = require('./src/config/supabase');
const axios = require('axios');
const fs = require('fs');
const { decryptToken } = require('./src/services/facebookService');

async function testWhatsapp() {
    const { GRAPH_URL: FACEBOOK_GRAPH_URL } = require('./src/config/facebook');
    let output = {};
    try {
        const { data: accounts } = await supabase.from('facebook_accounts').select('*');
        if (!accounts || accounts.length === 0) {
            output.error = 'No accounts found';
            return fs.writeFileSync('wa-out.json', JSON.stringify(output, null, 2));
        }

        output.results = {};
        for (const account of accounts) {
            const userToken = decryptToken(account.fb_user_access_token || account.fb_access_token);
            const pagesRes = await axios.get(`${FACEBOOK_GRAPH_URL}/me/accounts`, {
                params: { access_token: userToken }
            });
            const pageData = pagesRes.data.data.find(p => p.id === account.fb_page_id);
            if (!pageData) continue;

            const pageToken = pageData.access_token;

            try {
                // Testing endpoints 
                output.results[account.fb_page_id] = {};

                // Method 1: Page Node
                const pageRes = await axios.get(`${FACEBOOK_GRAPH_URL}/${account.fb_page_id}`, {
                    params: {
                        fields: 'has_whatsapp_number,whatsapp_number,name',
                        access_token: pageToken
                    }
                });
                output.results[account.fb_page_id].page_node = pageRes.data;

            } catch (e) {
                output.results[account.fb_page_id].page_error = e.response?.data || e.message;
            }
        }
    } catch (e) {
        output.mainError = e.message;
    }
    fs.writeFileSync('wa-out.json', JSON.stringify(output, null, 2));
}

testWhatsapp();
