/**
 * Hook pour la gestion de la connexion Facebook Business
 * AdsFacile Frontend
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const useFacebook = () => {
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pageName, setPageName] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [fbUserId, setFbUserId] = useState(null);
    const [error, setError] = useState(null);

    /**
     * Récupérer le statut de connexion Facebook
     */
    const getStatus = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/facebook/status');
            if (response.data.success) {
                const { connected: isConnected, pageName: name, accountId: accId, fbUserId: uid } = response.data.data;
                setConnected(isConnected);
                setPageName(name);
                setAccountId(accId);
                setFbUserId(uid || null);
            }
        } catch (err) {
            console.error('Erreur récupération statut Facebook:', err);
            setError('Impossible de vérifier la connexion Facebook');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Obtenir l'URL d'authentification et rediriger vers Facebook
     */
    const getAuthUrl = useCallback(async () => {
        try {
            setError(null);
            const response = await api.get('/facebook/auth/url');
            if (response.data.success && response.data.data.authUrl) {
                window.location.href = response.data.data.authUrl;
            }
        } catch (err) {
            console.error('Erreur récupération URL OAuth:', err);
            setError('Impossible de se connecter à Facebook. Réessayez.');
        }
    }, []);

    /**
     * Déconnecter le compte Facebook
     */
    const disconnect = useCallback(async () => {
        try {
            setError(null);
            const response = await api.post('/facebook/disconnect');
            if (response.data.success) {
                setConnected(false);
                setPageName(null);
                setAccountId(null);
                setFbUserId(null);
            }
            return response.data;
        } catch (err) {
            console.error('Erreur déconnexion Facebook:', err);
            setError('Erreur lors de la déconnexion');
            throw err;
        }
    }, []);

    // Charger le statut au montage
    useEffect(() => {
        getStatus();
    }, [getStatus]);

    return {
        connected,
        loading,
        pageName,
        accountId,
        fbUserId,
        error,
        getAuthUrl,
        getStatus,
        disconnect
    };
};
