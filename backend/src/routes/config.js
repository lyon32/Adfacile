/**
 * Configuration publique exposée au frontend
 * AdsFacile Backend
 */

const express = require('express');
const { getRate, minDailyBudgetFcfa, ACCOUNT_CURRENCY } = require('../utils/currency');
const { listObjectives, OBJECTIVES } = require('../services/campaignObjectives');

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

/**
 * GET /api/config/objectives
 * Objectifs de campagne, avec pour chacun les objectifs de performance et les
 * destinations que Meta accepte réellement.
 *
 * Le formulaire lit cette table plutôt que d'entretenir la sienne : c'est ce
 * qui empêche l'interface de proposer une combinaison que la création
 * rejettera ensuite. La table complète (destinations par objectif de
 * performance) est incluse pour que le formulaire puisse filtrer sans aller-
 * retour réseau.
 */
router.get('/objectives', (req, res) => {
    res.json({
        success: true,
        data: {
            objectives: listObjectives().map(o => ({
                ...o,
                goals_by_destination: OBJECTIVES[o.value].goals
            }))
        }
    });
});

module.exports = router;
