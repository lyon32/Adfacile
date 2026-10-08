#!/usr/bin/env node
/**
 * verifier-suppression.cjs — Confirme chez Meta qu'une campagne de test a disparu
 *
 * Lecture seule : GET sur chaque identifiant Meta. Un objet supprimé répond
 * `effective_status: DELETED` (ou une erreur « n'existe pas »).
 *
 * Usage : node scripts/verifier-suppression.cjs <id Meta> [<id Meta> ...]
 */

const path = require('path');
const depuisBackend = (nom) => require(require.resolve(nom, { paths: [path.resolve(__dirname, '../backend')] }));

const axios = depuisBackend('axios');
depuisBackend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { supabase } = require('../backend/src/config/supabase');
const { decryptToken } = require('../backend/src/services/facebookService');
const { GRAPH_URL } = require('../backend/src/config/facebook');

async function main() {
    const { data, error } = await supabase
        .from('facebook_accounts').select('fb_access_token').eq('is_active', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) throw new Error('Aucun compte Facebook actif');
    const token = decryptToken(data.fb_access_token);

    for (const id of process.argv.slice(2)) {
        const r = await axios.get(`${GRAPH_URL}/${id}`, { params: { fields: 'name,status,effective_status', access_token: token } })
            .then(x => x.data).catch(e => ({ erreur: e.response?.data?.error?.message || e.message }));
        // Une création n'a pas d'effective_status : son état est dans status.
        const supprime = r.effective_status === 'DELETED' || r.status === 'DELETED' || /does not exist|n.existe pas/i.test(r.erreur || '');
        console.log(`${supprime ? 'SUPPRIMÉ' : 'PRÉSENT '} ${id} ${JSON.stringify(r)}`);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
