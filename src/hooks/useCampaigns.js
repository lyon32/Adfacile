/**
 * useCampaigns — Hook de gestion des campagnes
 * AdsFacile Frontend
 * 
 * CRUD + Plan limits + Status updates
 */

import { useState, useCallback } from 'react';
import api from '../services/api';
import { suivreCreation, stockageCreation } from '../utils/campaignCreation';

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
     * Enrichit une erreur de création avec ce que l'écran affiche.
     * `definitive` : le serveur a répondu (refus ou échec) — réessayer demande
     * une nouvelle soumission. Sinon (réseau coupé), la même clé d'idempotence
     * peut être réutilisée sans risque de doublon.
     */
    const erreurCreation = (err) => {
        const data = err.response?.data || (err.name === 'CreationEchouee' ? {
            message: err.message, error: err.code, details: err.details, upgrade_url: err.upgradeUrl
        } : null);
        const msg = data?.message || err.message || 'Erreur création campagne';

        const error = new Error(msg);
        error.code = data?.error;
        error.details = data?.details;
        error.upgradeUrl = data?.upgrade_url;
        error.definitive = Boolean(data);
        return error;
    };

    const lireCreation = (jobId) => () => api.get(`/campaigns/jobs/${jobId}`).then(r => r.data.data);

    /**
     * Crée une campagne complète (3 niveaux Facebook).
     *
     * Le serveur répond tout de suite (202) et poursuit en arrière-plan : une
     * création avec vidéos dure plusieurs minutes, trop pour une seule requête
     * (coupée par l'hébergement, et l'écran affichait une erreur alors que la
     * campagne existait). La clé d'idempotence évite qu'un nouvel essai crée
     * une seconde campagne.
     *
     * @param {object}   data
     * @param {object}   [options]
     * @param {string}   [options.key]    clé d'idempotence de cette soumission
     * @param {Function} [options.onStep] reçoit l'étape en cours
     */
    const createCampaign = useCallback(async (data, { key, onStep } = {}) => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/campaigns', data, {
                headers: key ? { 'Idempotency-Key': key } : {}
            });
            if (!response.data.success) throw new Error('Erreur inattendue');

            // Serveur sans suivi de création : réponse directe, comme avant.
            const jobId = response.data.data?.job_id;
            if (response.status !== 202 || !jobId) return response.data.data;

            stockageCreation.ecrire({ key, jobId });
            const result = await suivreCreation({ lireJob: lireCreation(jobId), onStep });
            stockageCreation.effacer();
            return result;
        } catch (err) {
            const error = erreurCreation(err);
            // Échec constaté par le serveur : rien à reprendre.
            if (error.definitive) stockageCreation.effacer();
            setError(error.message);
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    /** Reprend le suivi d'une création lancée avant un rechargement de la page. */
    const reprendreCreation = useCallback(async (jobId, onStep) => {
        try {
            const result = await suivreCreation({ lireJob: lireCreation(jobId), onStep });
            stockageCreation.effacer();
            return result;
        } catch (err) {
            const error = erreurCreation(err);
            stockageCreation.effacer();
            throw error;
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
        reprendreCreation,
        updateStatus,
        deleteCampaign
    };
};

export default useCampaigns;
