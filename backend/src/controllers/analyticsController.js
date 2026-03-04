/**
 * Contrôleur Analytics — Insights Facebook + Export
 * AdsFacile Backend
 */

const facebookInsightsService = require('../services/facebookInsightsService');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════════
// GET ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

async function getAnalytics(req, res) {
    try {
        const userId = req.user.id;
        const { campaign_id, start_date, end_date } = req.query;

        const dateRange = {
            start: start_date || facebookInsightsService.getDateDaysAgo(7),
            end: end_date || facebookInsightsService.getTodayDate()
        };

        // Validate dates
        if (new Date(dateRange.start) > new Date(dateRange.end)) {
            return res.status(400).json({ success: false, message: 'start_date doit être avant end_date' });
        }

        let data;

        if (campaign_id && campaign_id !== 'all') {
            // Insights d'une campagne spécifique
            data = await facebookInsightsService.getCampaignInsights(userId, campaign_id, dateRange);
        } else {
            // Insights de toutes les campagnes
            const allCampaigns = await facebookInsightsService.getAllCampaignsInsights(userId, dateRange);
            data = facebookInsightsService.aggregateCampaignsData(allCampaigns);
            data.campaigns = allCampaigns;
        }

        return res.json({
            success: true,
            data,
            period: dateRange
        });

    } catch (error) {
        logger.error('❌ Analytics error:', error.message);

        // Si erreur Facebook, renvoyer un message clair
        if (error.message.includes('Facebook') || error.message.includes('connecté')) {
            return res.status(400).json({
                success: false,
                error: 'facebook_not_connected',
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            error: 'analytics_error',
            message: error.message
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT ANALYTICS (PRO only)
// ═══════════════════════════════════════════════════════════════════════════════

async function exportAnalytics(req, res) {
    try {
        const userId = req.user.id;
        const { format, campaign_id, start_date, end_date } = req.body;

        if (!format || !['csv', 'xlsx'].includes(format)) {
            return res.status(400).json({ success: false, message: 'Format invalide. Utilisez csv ou xlsx.' });
        }

        const dateRange = {
            start: start_date || facebookInsightsService.getDateDaysAgo(30),
            end: end_date || facebookInsightsService.getTodayDate()
        };

        let data;
        if (campaign_id && campaign_id !== 'all') {
            data = await facebookInsightsService.getCampaignInsights(userId, campaign_id, dateRange);
        } else {
            const all = await facebookInsightsService.getAllCampaignsInsights(userId, dateRange);
            data = facebookInsightsService.aggregateCampaignsData(all);
            data.campaigns = all;
        }

        if (format === 'csv') {
            const { Parser } = require('json2csv');
            const fields = ['date', 'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'reach', 'conversions'];
            const parser = new Parser({ fields });

            let csvData;
            if (data.timeseries && data.timeseries.length > 0) {
                csvData = parser.parse(data.timeseries);
            } else if (data.campaigns && data.campaigns.length > 0) {
                const campFields = ['name', 'objective', 'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'conversions', 'cpa'];
                const campParser = new Parser({ fields: campFields });
                csvData = campParser.parse(data.campaigns);
            } else {
                csvData = 'Aucune donnée disponible';
            }

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="analytics_${Date.now()}.csv"`);
            return res.send(csvData);

        } else if (format === 'xlsx') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();

            // Feuille Overview
            const overviewSheet = workbook.addWorksheet('Vue d\'ensemble');
            overviewSheet.columns = [
                { header: 'Métrique', key: 'metric', width: 20 },
                { header: 'Valeur', key: 'value', width: 20 }
            ];
            const ov = data.overview || {};
            overviewSheet.addRows([
                { metric: 'Impressions', value: ov.impressions || 0 },
                { metric: 'Clics', value: ov.clicks || 0 },
                { metric: 'Dépenses (FCFA)', value: ov.spend || 0 },
                { metric: 'Portée', value: ov.reach || 0 },
                { metric: 'CTR (%)', value: ov.ctr || 0 },
                { metric: 'CPC (FCFA)', value: ov.cpc || 0 },
                { metric: 'CPM (FCFA)', value: ov.cpm || 0 },
                { metric: 'Conversions', value: ov.conversions || 0 },
                { metric: 'CPA (FCFA)', value: ov.cpa || 0 }
            ]);

            // Style header
            overviewSheet.getRow(1).font = { bold: true };
            overviewSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
            overviewSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

            // Feuille Timeseries si disponible
            if (data.timeseries && data.timeseries.length > 0) {
                const tsSheet = workbook.addWorksheet('Données journalières');
                tsSheet.columns = [
                    { header: 'Date', key: 'date', width: 15 },
                    { header: 'Impressions', key: 'impressions', width: 15 },
                    { header: 'Clics', key: 'clicks', width: 12 },
                    { header: 'Dépenses', key: 'spend', width: 12 },
                    { header: 'CTR (%)', key: 'ctr', width: 10 },
                    { header: 'CPC', key: 'cpc', width: 10 },
                    { header: 'Portée', key: 'reach', width: 12 }
                ];
                tsSheet.addRows(data.timeseries);
                tsSheet.getRow(1).font = { bold: true };
            }

            // Feuille Campagnes si disponible
            if (data.campaigns && data.campaigns.length > 0) {
                const campSheet = workbook.addWorksheet('Campagnes');
                campSheet.columns = [
                    { header: 'Nom', key: 'name', width: 30 },
                    { header: 'Objectif', key: 'objective', width: 20 },
                    { header: 'Impressions', key: 'impressions', width: 15 },
                    { header: 'Clics', key: 'clicks', width: 12 },
                    { header: 'Dépenses', key: 'spend', width: 12 },
                    { header: 'CTR (%)', key: 'ctr', width: 10 },
                    { header: 'CPC', key: 'cpc', width: 10 },
                    { header: 'Conversions', key: 'conversions', width: 14 },
                    { header: 'CPA', key: 'cpa', width: 10 }
                ];
                campSheet.addRows(data.campaigns);
                campSheet.getRow(1).font = { bold: true };
            }

            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="analytics_${Date.now()}.xlsx"`);
            return res.send(Buffer.from(buffer));
        }

    } catch (error) {
        logger.error('❌ Export error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'export_error',
            message: error.message
        });
    }
}

module.exports = {
    getAnalytics,
    exportAnalytics
};
