/**
 * useCampaigns — Hook de gestion des campagnes
 * AdsFacile Frontend
 * 
 * CRUD + Plan limits + Status updates
 */

import { useState, useCallback } from 'react';
import api from '../services/api';

export const useCampaigns = () => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState({
        total: 0,
        campaigns_this_month: 0,
        plan_limit: 1,
        can_create: true
    });

    /**
     * Charge la liste des campagnes avec filtre optionnel
     */
    const fetchCampaigns = useCallback(async (filter = 'all') => {
        setLoading(true);
        setError(null);
        try {
            const params = filter !== 'all' ? { status: filter } : {};
            const response = await api.get('/campaigns', { params });
            if (response.data.success) {
                setCampaigns(response.data.data.campaigns || []);
                setMeta({
                    total: response.data.data.total || 0,
                    campaigns_this_month: response.data.data.campaigns_this_month || 0,
                    plan_limit: response.data.data.plan_limit || 1,
                    can_create: response.data.data.can_create !== false
                });
            }
        } catch (err) {
            console.error('Erreur fetchCampaigns:', err);
            setError(err.response?.data?.message || 'Erreur chargement campagnes');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Crée une campagne complète (3 niveaux Facebook)
     */
    const createCampaign = useCallback(async (data) => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/campaigns', data);
            if (response.data.success) {
                return response.data.data;
            }
            throw new Error('Erreur inattendue');
        } catch (err) {
            const errorData = err.response?.data;
            const msg = errorData?.message || 'Erreur création campagne';

            // Enrichir l'erreur avec les détails
            const error = new Error(msg);
            error.code = errorData?.error;
            error.details = errorData?.details;
            error.upgradeUrl = errorData?.upgrade_url;

            setError(msg);
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Met à jour le statut d'une campagne (active/paused)
     */
    const updateStatus = useCallback(async (id, status) => {
        try {
            const response = await api.patch(`/campaigns/${id}/status`, { status });
            if (response.data.success) {
                setCampaigns(prev => prev.map(c => c.id === id ? response.data.data : c));
                return response.data.data;
            }
        } catch (err) {
            throw new Error(err.response?.data?.message || 'Erreur mise à jour statut');
        }
    }, []);

    /**
     * Supprime une campagne
     */
    const deleteCampaign = useCallback(async (id) => {
        try {
            await api.delete(`/campaigns/${id}`);
            setCampaigns(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            throw new Error(err.response?.data?.message || 'Erreur suppression');
        }
    }, []);

    return {
        campaigns,
        loading,
        error,
        meta,
        fetchCampaigns,
        createCampaign,
        updateStatus,
        deleteCampaign
    };
};

export default useCampaigns;
