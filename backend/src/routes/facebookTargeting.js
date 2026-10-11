/**
 * Facebook Targeting Search Routes
 * AdsFacile Backend
 * 
 * Provides autocomplete for locations and interests
 * using the Facebook Targeting Search API.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { decryptToken } = require('../services/facebookService');
const logger = require('../utils/logger');
const tokenHealth = require('../services/facebookTokenHealth');

// Version de l'API Graph : une seule source, config/facebook.js.
const { GRAPH_URL: FACEBOOK_GRAPH_URL } = require('../config/facebook');

/**
 * GET /api/facebook/targeting/locations?q=Douala
 * Search geo-locations (cities, countries, regions) via Facebook API
 */
router.get('/locations', authenticate, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ suggestions: [] });
        }

        // Fetch user's active Facebook credentials
        const { data: fb, error } = await supabase
            .from('facebook_accounts')
            .select('fb_access_token')
            .eq('user_id', req.user.id)
            .eq('is_active', true)
            .single();

        if (error || !fb) {
            return res.status(404).json({ error: 'Compte Facebook non trouvé' });
        }

        const accessToken = decryptToken(fb.fb_access_token);

        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/search`, {
            params: {
                type: 'adgeolocation',
                q,
                location_types: ['city', 'country', 'region', 'geo_market'],
                access_token: accessToken,
                limit: 10
            }
        });

        const suggestions = (response.data.data || []).map(loc => ({
            key: loc.key,
            name: loc.name,
            type: loc.type,
            country_code: loc.country_code,
            country_name: loc.country_name,
            region: loc.region || null
        }));

        logger.info(`🔍 Location search "${q}": ${suggestions.length} résultats`);
        res.json({ suggestions });

    } catch (error) {
        if (tokenHealth.respondIfRevoked(res, error, req.user.id)) return;
        logger.error('❌ Location search error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erreur recherche localisation' });
    }
});

/**
 * GET /api/facebook/targeting/interests?q=Cuisine
 * Search interests via Facebook Targeting Search API
 */
router.get('/interests', authenticate, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ suggestions: [] });
        }

        // Fetch user's active Facebook credentials
        const { data: fb, error } = await supabase
            .from('facebook_accounts')
            .select('fb_access_token')
            .eq('user_id', req.user.id)
            .eq('is_active', true)
            .single();

        if (error || !fb) {
            return res.status(404).json({ error: 'Compte Facebook non trouvé' });
        }

        const accessToken = decryptToken(fb.fb_access_token);

        const response = await axios.get(`${FACEBOOK_GRAPH_URL}/search`, {
            params: {
                type: 'adinterest',
                q,
                access_token: accessToken,
                limit: 25
            }
        });

        const suggestions = (response.data.data || []).map(interest => ({
            id: interest.id,
            name: interest.name,
            audience_size_lower_bound: interest.audience_size_lower_bound || null,
            audience_size_upper_bound: interest.audience_size_upper_bound || null,
            path: interest.path || []
        }));

        logger.info(`🔍 Interest search "${q}": ${suggestions.length} résultats`);
        res.json({ suggestions });

    } catch (error) {
        if (tokenHealth.respondIfRevoked(res, error, req.user.id)) return;
        logger.error('❌ Interest search error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erreur recherche intérêts' });
    }
});

module.exports = router;
