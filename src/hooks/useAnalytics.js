/**
 * useAnalytics — Hook de récupération des analytics Facebook
 * AdsFacile Frontend
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

function getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

export function useAnalytics(campaignId = 'all', dateRange = null) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAnalytics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = {
                campaign_id: campaignId,
                start_date: dateRange?.start || getDateDaysAgo(7),
                end_date: dateRange?.end || getTodayDate()
            };

            const res = await api.get('/analytics', { params });

            if (res.data.success) {
                setData(res.data.data);
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Erreur lors du chargement des analytics';
            setError(msg);
            console.error('Analytics error:', err);
        } finally {
            setLoading(false);
        }
    }, [campaignId, dateRange?.start, dateRange?.end]);

    const exportData = async (format) => {
        try {
            const res = await api.post('/analytics/export', {
                format,
                campaign_id: campaignId,
                start_date: dateRange?.start || getDateDaysAgo(30),
                end_date: dateRange?.end || getTodayDate()
            }, {
                responseType: 'blob'
            });

            // Trigger download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            const ext = format === 'xlsx' ? 'xlsx' : 'csv';
            link.setAttribute('download', `analytics_${Date.now()}.${ext}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            return { success: true };
        } catch (err) {
            console.error('Export error:', err);
            return {
                success: false,
                error: err.response?.data?.message || 'Erreur export'
            };
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    return {
        data,
        loading,
        error,
        refresh: fetchAnalytics,
        exportData
    };
}
