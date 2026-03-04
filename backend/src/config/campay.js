/**
 * Configuration CamPay centralisée
 * AdsFacile Backend
 *
 * Mode Sandbox par défaut pour les tests.
 * Basculer en production en changeant CAMPAY_ENV=production dans .env
 */

module.exports = {
    env: process.env.CAMPAY_ENV || 'sandbox',
    appUsername: process.env.CAMPAY_APP_USERNAME,
    appPassword: process.env.CAMPAY_APP_PASSWORD,
    webhookSecret: process.env.CAMPAY_WEBHOOK_SECRET || '',
    apiUrl: process.env.CAMPAY_API_URL || 'https://demo.campay.net/api',

    // Limites sandbox
    maxTestAmount: 25, // XAF max en sandbox

    // Numéros de test sandbox
    testNumbers: {
        mtnSuccess: '237677777777',   // PENDING → SUCCESSFUL
        mtnFailed: '237677777770',    // PENDING → FAILED
        orangeSuccess: '237699999999', // PENDING → SUCCESSFUL
        orangeFailed: '237699999990'   // PENDING → FAILED
    },

    // Plans tarifaires
    plans: {
        free: { price: 0, name: 'Gratuit' },
        starter: { price: 5000, name: 'Starter' },
        pro: { price: 12000, name: 'PRO' },
        agency: { price: 30000, name: 'Agency' }
    }
};
