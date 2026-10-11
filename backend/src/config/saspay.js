/**
 * Configuration SasPay
 * AdsFacile Backend
 *
 * Remplace Campay (oct. 2026). Clés : app.saspay.me → Développeur.
 * sk_test_… = paiements simulés, sk_live_… = argent réel.
 * Doc : https://docs.saspay.me/api-reference/introduction
 */

const secretKey = () => process.env.SASPAY_SECRET_KEY || '';

module.exports = {
    get apiUrl() {
        return (process.env.SASPAY_API_URL || 'https://api.saspay.me/api/v1').replace(/\/$/, '');
    },
    get secretKey() {
        return secretKey();
    },
    // Secret de signature du webhook, affiché une seule fois par SasPay à la
    // création du webhook dans le tableau de bord.
    get webhookSecret() {
        return process.env.SASPAY_WEBHOOK_SECRET || '';
    },
    get isTestMode() {
        return secretKey().startsWith('sk_test_');
    },
    // Les clients paient les frais : ils sont ajoutés au montant débité.
    feeChargeMode: 'ADD_ON',
    // Tolérance d'horodatage du webhook recommandée par SasPay.
    webhookToleranceSeconds: 300
};
