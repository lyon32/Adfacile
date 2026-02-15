// ============================================
// AdLaunch Pro - Configuration
// ============================================

// Facebook App Configuration
// IMPORTANT: Replace these with your actual Facebook App credentials
// Get them from: https://developers.facebook.com/apps/

const CONFIG = {
    facebook: {
        appId: '878151631605651', // Real App ID
        appSecret: 'YOUR_APP_SECRET', // Keep this secret, never expose in production
        apiVersion: 'v18.0',
        redirectUri: 'https://localhost:3000/dashboard.html',
        scope: [
            'ads_management',
            'ads_read',
            'business_management',
            'pages_read_engagement'
        ].join(',')
    },
    
    api: {
        baseUrl: 'https://graph.facebook.com',
        timeout: 30000
    },
    
    app: {
        name: 'AdLaunch Pro',
        version: '1.0.0'
    },

    debug: {
        simulateFB: false, // Simulation désactivée, utilisation du vrai SDK
        simulatePayment: true // Simulation du paiement Mobile Money
    }
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// Global check for placeholder
if (CONFIG.facebook.appId === 'YOUR_FACEBOOK_APP_ID' && typeof window !== 'undefined') {
    console.warn('Facebook App ID non configuré ! Veuillez le remplacer dans config.js');
}
