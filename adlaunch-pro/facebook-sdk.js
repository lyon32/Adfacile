// ============================================
// AdLaunch Pro - Facebook SDK Integration
// ============================================

// Load Facebook SDK
(function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s);
    js.id = id;
    js.src = "https://connect.facebook.net/fr_FR/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

// Initialize Facebook SDK
window.fbAsyncInit = function() {
    if (CONFIG.facebook.appId === 'YOUR_FACEBOOK_APP_ID') {
        if (CONFIG.debug && CONFIG.debug.simulateFB) {
            console.info('Facebook SDK: Mode Simulation activé (Pas de vrai App ID).');
            return;
        }
        console.error('Facebook SDK: App ID manquant. La connexion ne fonctionnera pas.');
        const fbStatus = document.getElementById('fbStatus');
        if (fbStatus) fbStatus.innerHTML = '<span style="color: #ef4444;">❌ Erreur: App ID non configuré</span>';
        return;
    }

    FB.init({
        appId: CONFIG.facebook.appId,
        cookie: true,
        xfbml: true,
        version: CONFIG.facebook.apiVersion
    });
    
    // Check login status on load
    FB.getLoginStatus(function(response) {
        handleLoginStatus(response);
    });
};

// Facebook Login Status Handler
function handleLoginStatus(response) {
    const fbStatus = document.getElementById('fbStatus');
    const fbConnectBtn = document.getElementById('fbConnectBtn');
    const fbDisconnectBtn = document.getElementById('fbDisconnectBtn');
    const fbDisconnectedMsg = document.getElementById('fbDisconnectedMsg');
    
    if (response.status === 'connected') {
        // User is logged in to Facebook and has authorized the app
        const accessToken = response.authResponse.accessToken;
        const userId = response.authResponse.userID;
        
        // Store access token
        sessionStorage.setItem('fb_access_token', accessToken);
        sessionStorage.setItem('fb_user_id', userId);

        // Sync with backend
        const adlaunchToken = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
        if (adlaunchToken) {
            fetch('http://localhost:3000/api/user/facebook', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adlaunchToken}`
                },
                body: JSON.stringify({ accessToken, userId })
            }).catch(console.error);
        }
        
        // Update UI
        fbStatus.innerHTML = '<span style="color: #10b981;">✓ Connecté à Facebook Business</span>';
        fbConnectBtn.style.display = 'none';
        fbDisconnectBtn.style.display = 'inline-block';
        if (campaignSection) campaignSection.style.display = 'block';
        if (fbDisconnectedMsg) fbDisconnectedMsg.style.display = 'none';
        
        // Load user's ad accounts
        loadAdAccounts(accessToken);
        
    } else {
        // Check if we have a stored session (persisted from backend)
        const storedToken = sessionStorage.getItem('fb_access_token');
        if (storedToken) {
            console.log('Facebook SDK: Session restaurée depuis le stockage.');
            fbStatus.innerHTML = '<span style="color: #10b981;">✓ Connecté à Facebook Business</span>';
            fbConnectBtn.style.display = 'none';
            fbDisconnectBtn.style.display = 'inline-block';
            if (campaignSection) campaignSection.style.display = 'block';
            if (fbDisconnectedMsg) fbDisconnectedMsg.style.display = 'none';
            
            // Try to load accounts with stored token
            loadAdAccounts(storedToken);
            return;
        }

        // User is not logged in or hasn't authorized the app
        fbStatus.innerHTML = '<span style="color: #f59e0b;">⚠ Non connecté à Facebook</span>';
        fbConnectBtn.style.display = 'inline-block';
        fbDisconnectBtn.style.display = 'none';
        if (campaignSection) campaignSection.style.display = 'none';
        if (fbDisconnectedMsg) fbDisconnectedMsg.style.display = 'block';
    }
}

// Facebook Login
function loginToFacebook() {
    if (CONFIG.facebook.appId === 'YOUR_FACEBOOK_APP_ID' || (CONFIG.debug && CONFIG.debug.simulateFB)) {
        if (CONFIG.debug && CONFIG.debug.simulateFB) {
            simulateLogin();
            return;
        }
        showToast('Veuillez configurer votre App ID dans config.js pour tester la connexion.', 'error');
        return;
    }

    FB.login(function(response) {
        handleLoginStatus(response);
    }, {
        scope: CONFIG.facebook.scope,
        return_scopes: true
    });
}

// Facebook Logout
function logoutFromFacebook() {
    if (CONFIG.debug && CONFIG.debug.simulateFB) {
        sessionStorage.removeItem('fb_access_token');
        sessionStorage.removeItem('fb_user_id');
        handleLoginStatus({ status: 'unknown' });
        return;
    }
    FB.logout(function(response) {
        sessionStorage.removeItem('fb_access_token');
        sessionStorage.removeItem('fb_user_id');
        handleLoginStatus(response);
    });
}

// Load Ad Accounts
async function loadAdAccounts(accessToken) {
    if (CONFIG.debug && CONFIG.debug.simulateFB) {
        simulateAdAccounts();
        return;
    }
    try {
        const response = await fetch(
            `${CONFIG.api.baseUrl}/v18.0/me/adaccounts?fields=name,account_id,currency,account_status&access_token=${accessToken}`
        );
        
        const data = await response.json();
        
        if (data.error) {
            console.error('Facebook API Error:', data.error);
            // If session invalid, logout
            if (data.error.code === 190) { // Invalid OAuth access token
                logout(); 
                return;
            }
            throw new Error(data.error.message);
        }

        if (data.data && data.data.length > 0) {
            populateAdAccountSelect(data.data);
        } else {
            console.warn('No ad accounts found (Empty list)');
            // Check if populateAdAccountSelect handles empty?
            const select = document.getElementById('adAccount');
            if(select) select.innerHTML = '<option value="">Aucun compte publicitaire trouvé</option>';
        }
    } catch (error) {
        console.error('Error loading ad accounts:', error);
        if (window.showToast) showToast('Erreur chargement comptes: ' + error.message, 'error');
    }
}

// Populate Ad Account Select
function populateAdAccountSelect(adAccounts) {
    const select = document.getElementById('adAccount');
    if (!select) return;

    if (!adAccounts || adAccounts.length === 0) {
        select.innerHTML = '<option value="">⚠️ Aucun compte publicitaire trouvé</option>';
        return;
    }

    select.innerHTML = '<option value="">Sélectionnez un compte publicitaire</option>';
    
    adAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.name || 'Compte sans nom'} (${account.id})`;
        select.appendChild(option);
    });
}

// Create Facebook Ad Campaign
async function createFacebookCampaign(campaignData) {
    if (CONFIG.debug && CONFIG.debug.simulateFB) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    campaignId: 'sim_camp_' + Math.random().toString(36).substr(2),
                    adSetId: 'sim_adset_' + Math.random().toString(36).substr(2),
                    message: 'Campagne simulée créée avec succès !'
                });
            }, 2000);
        });
    }

    const accessToken = sessionStorage.getItem('fb_access_token');
    
    if (!accessToken) {
        throw new Error('Not connected to Facebook');
    }
    
    try {
        // 1. Create Campaign
        const payload = {
            name: campaignData.name,
            objective: campaignData.objective,
            status: 'PAUSED',
            special_ad_categories: [], // Required field, empty array for none
            access_token: accessToken,
            // Enable Advantage+ Campaign Budget (CBO)
            advantage_campaign_budget_optimization: true, 
            daily_budget: Math.floor(campaignData.dailyBudget) // Budget at Campaign Level
        };

        console.log('Sending Campaign Payload:', payload);

        const campaignResponse = await fetch(
            `${CONFIG.api.baseUrl}/v18.0/${campaignData.adAccountId}/campaigns`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );
        
        const campaign = await campaignResponse.json();
        
        if (campaign.error) {
            console.error('Facebook API Error:', JSON.stringify(campaign.error, null, 2));
            throw new Error(campaign.error.message + (campaign.error.error_user_msg ? ` (${campaign.error.error_user_msg})` : ''));
        }
        
        // Step 2: Create Ad Set
        const adSetPayload = {
            name: `${campaignData.name} - Ad Set`,
            campaign_id: campaign.id,
            // Budget is now at Campaign level, so removed here.
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'REACH', 
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // Automatic bidding, no bid_amount needed
            targeting: {
                geo_locations: formatGeoLocations(campaignData.locations),
                age_min: campaignData.ageMin,
                age_max: campaignData.ageMax,
                genders: campaignData.gender === 'all' ? [1, 2] : [parseInt(campaignData.gender)],
                // New Requirement (Jan 2025): Advantage+ Audience flag
                targeting_automation: {
                    advantage_audience: 1 // 1 = Enabled (Recommended), 0 = Disabled
                }
            },
            // DSA Transparency info (Required for EU)
            // Use the real account name or fallback to "Entreprise" (which might fail if mismatch)
            dsa_beneficiary: campaignData.adAccountName || "Entreprise", 
            dsa_payor: campaignData.adAccountName || "Entreprise",  
            status: 'PAUSED',
            access_token: accessToken
        };

        // Better defaults based on objective
        if (campaignData.objective === 'OUTCOME_TRAFFIC') {
            adSetPayload.optimization_goal = 'LINK_CLICKS';
            adSetPayload.billing_event = 'IMPRESSIONS'; 
        } else if (campaignData.objective === 'OUTCOME_SALES' || campaignData.objective === 'OUTCOME_LEADS') {
             // For Sales/Leads, usually CONVERSIONS or OFF_SITE_CONVERSIONS, but requires Pixel setup.
             // Fallback to LINK_CLICKS or REACH if Pixel not ready?
             // Let's force LINK_CLICKS for simplicity in MVP to avoid pixel errors
             adSetPayload.optimization_goal = 'LINK_CLICKS'; 
        }

        // Remove bid_amount if it exists (it shouldn't since we didn't add it, but just in case)
        delete adSetPayload.bid_amount;

        console.log('Sending Ad Set Payload:', adSetPayload);

        const adSetResponse = await fetch(
            `${CONFIG.api.baseUrl}/v18.0/${campaignData.adAccountId}/adsets`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adSetPayload)
            }
        );
        
        const adSet = await adSetResponse.json();
        
        if (adSet.error) {
            console.error('Facebook API Error (AdSet):', JSON.stringify(adSet.error, null, 2));
            throw new Error(adSet.error.message + (adSet.error.error_user_msg ? ` (${adSet.error.error_user_msg})` : ''));
        }
        
        return {
            success: true,
            campaignId: campaign.id,
            adSetId: adSet.id,
            message: 'Campagne créée avec succès (en pause pour révision)'
        };
        
    } catch (error) {
        console.error('Error creating campaign:', error);
        throw error;
    }
}

// Get Campaign Insights
async function getCampaignInsights(campaignId) {
    const accessToken = sessionStorage.getItem('fb_access_token');
    
    try {
        const response = await fetch(
            `${CONFIG.api.baseUrl}/v18.0/${campaignId}/insights?fields=impressions,clicks,spend,ctr,cpc&access_token=${accessToken}`
        );
        
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('Error fetching insights:', error);
        return [];
    }
}

// ============================================
// Simulation Helpers (Demo Mode)
// ============================================

function simulateLogin() {
    showToast('Mode Simulation : Connexion en cours...', 'info');
    setTimeout(() => {
        const fakeResponse = {
            status: 'connected',
            authResponse: {
                accessToken: 'fake_access_token_' + Math.random().toString(36).substr(2),
                userID: '123456789'
            }
        };
        handleLoginStatus(fakeResponse);
        showToast('Connecté avec succès (Mode Démo)', 'success');
    }, 1500);
}

function simulateAdAccounts() {
    console.info('Mode Simulation : Chargement des comptes fictifs...');
    const fakeAccounts = [
        { id: 'act_101010101', name: 'Mon Business Local' },
        { id: 'act_202020202', name: 'E-commerce International' },
        { id: 'act_303030303', name: 'Agence Marketing Digitale' }
    ];
    setTimeout(() => {
        populateAdAccountSelect(fakeAccounts);
    }, 1000);
}

// Search Locations (Countries, Cities, Regions)
async function searchLocations(query, type = 'adgeolocation') {
    const accessToken = sessionStorage.getItem('fb_access_token');
    if (!accessToken) throw new Error('Non connecté à Facebook');
    
    try {
        const response = await fetch(
            `${CONFIG.api.baseUrl}/v18.0/search?type=${type}&q=${encodeURIComponent(query)}&location_types=['country','city','region']&access_token=${accessToken}`
        );
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.data; // Array of location objects
    } catch (error) {
        console.error('Location Search Error:', error);
        throw error;
    }
}

// Helper to format/split locations into FB API structure
function formatGeoLocations(locations) {
    const geo = {
        countries: [],
        cities: [],
        regions: []
    };

    if (!locations) return geo;

    // Step 1: Identify all selected Country Codes first
    const selectedCountryCodes = new Set();
    locations.forEach(loc => {
        if (loc.type === 'country' && loc.country_code) {
            selectedCountryCodes.add(loc.country_code);
        }
    });

    // Step 2: Process locations, skipping cities/regions if their country is selected
    locations.forEach(loc => {
        if (loc.type === 'country') {
            geo.countries.push(loc.country_code);
        } else if (loc.type === 'city') {
            // Only add city if its country is NOT selected
            if (!selectedCountryCodes.has(loc.country_code)) {
                geo.cities.push({
                    key: loc.key,
                    radius: 40, // Default radius in km
                    distance_unit: 'kilometer'
                });
            } else {
                console.log(`Skipping city ${loc.name} because its country ${loc.country_code} is already targeted.`);
            }
        } else if (loc.type === 'region') {
            // Only add region if its country is NOT selected
            if (!selectedCountryCodes.has(loc.country_code)) {
               geo.regions.push({
                    key: loc.key
                });
            } else {
                console.log(`Skipping region ${loc.name} because its country ${loc.country_code} is already targeted.`);
            }
        }
    });
    
    // Clean up empty arrays
    if (geo.countries.length === 0) delete geo.countries;
    if (geo.cities.length === 0) delete geo.cities;
    if (geo.regions.length === 0) delete geo.regions;

    return geo;
}

// Export functions for use in dashboard
window.FacebookSDK = {
    loginToFacebook,
    logoutFromFacebook,
    createFacebookCampaign,
    getCampaignInsights,
    handleLoginStatus,
    searchLocations
};
