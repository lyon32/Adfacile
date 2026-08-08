/**
 * Configuration publique exposée au frontend
 * AdsFacile Backend
 */

const express = require('express');
const { getRate, minDailyBudgetFcfa, ACCOUNT_CURRENCY } = require('../utils/currency');

const router = express.Router();

/**
 * GET /api/config/currency
 * Taux appliqué aux budgets. Le frontend le lit pour afficher exactement la
 * conversion que le backend enverra à Meta, plutôt qu'une valeur codée en dur
 * de son côté qui pourrait diverger.
 */
router.get('/currency', (req, res) => {
    res.json({
        success: true,
        data: {
            input_currency: 'XAF',
            account_currency: ACCOUNT_CURRENCY,
            xaf_per_usd: getRate(),
            min_daily_budget_xaf: minDailyBudgetFcfa()
        }
    });
});

module.exports = router;
