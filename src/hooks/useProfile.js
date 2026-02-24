/**
 * Hook pour la gestion du profil utilisateur
 * AdsFacile Frontend
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const useProfile = () => {
    const [profile, setProfile] = useState(null);
    const [planLimits, setPlanLimits] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('infos');
    const [toast, setToast] = useState(null);

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
    }, []);

    /**
     * Récupérer le profil utilisateur
     */
    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/users/me');
            if (response.data.success) {
                setProfile(response.data.data.user);
            }
        } catch (error) {
            console.error('Erreur fetchProfile:', error);
            showToast('Erreur lors du chargement du profil', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    /**
     * Récupérer les limites du plan
     */
    const fetchPlanLimits = useCallback(async () => {
        try {
            const response = await api.get('/users/me/plan-limits');
            if (response.data.success) {
                setPlanLimits(response.data.data);
            }
        } catch (error) {
            console.error('Erreur fetchPlanLimits:', error);
        }
    }, []);

    /**
     * Mettre à jour le profil
     */
    const updateProfile = useCallback(async (data) => {
        try {
            setSaving(true);
            const response = await api.put('/users/me', data);
            if (response.data.success) {
                setProfile(response.data.data.user);
                showToast('Profil mis à jour avec succès ✓');
                return response.data.data.user;
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Erreur lors de la mise à jour';
            showToast(message, 'error');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    /**
     * Changer l'email
     */
    const updateEmail = useCallback(async (data) => {
        try {
            setSaving(true);
            const response = await api.put('/users/me/email', data);
            if (response.data.success) {
                showToast('Email de confirmation envoyé ✓');
                return response.data;
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Erreur lors du changement d\'email';
            showToast(message, 'error');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    /**
     * Changer le téléphone
     */
    const updatePhone = useCallback(async (data) => {
        try {
            setSaving(true);
            const response = await api.put('/users/me/phone', data);
            if (response.data.success) {
                setProfile(response.data.data.user);
                showToast('Téléphone mis à jour ✓');
                return response.data.data.user;
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Erreur lors de la mise à jour';
            showToast(message, 'error');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    /**
     * Upload avatar
     */
    const uploadAvatar = useCallback(async (file) => {
        try {
            setSaving(true);
            const formData = new FormData();
            formData.append('avatar', file);
            const response = await api.post('/users/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success) {
                setProfile(prev => ({
                    ...prev,
                    profile_picture_url: response.data.data.profile_picture_url
                }));
                showToast('Photo de profil mise à jour ✓');
                return response.data.data.profile_picture_url;
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Erreur lors de l\'upload';
            showToast(message, 'error');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    /**
     * Supprimer le compte
     */
    const deleteAccount = useCallback(async (data) => {
        try {
            setSaving(true);
            const response = await api.delete('/users/me', { data });
            if (response.data.success) {
                showToast('Compte supprimé');
                return true;
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Erreur lors de la suppression';
            showToast(message, 'error');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    /**
     * Réinitialiser le mot de passe
     */
    const resetPassword = useCallback(async (email) => {
        try {
            setSaving(true);
            const response = await api.post('/auth/forgot-password', { email });
            if (response.data.success) {
                showToast('Email de réinitialisation envoyé ✓');
                return true;
            }
        } catch (error) {
            showToast('Erreur lors de l\'envoi', 'error');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    // Charger au montage
    useEffect(() => {
        fetchProfile();
        fetchPlanLimits();
    }, [fetchProfile, fetchPlanLimits]);

    return {
        profile,
        planLimits,
        loading,
        saving,
        activeTab,
        setActiveTab,
        toast,
        setToast,
        showToast,
        fetchProfile,
        fetchPlanLimits,
        updateProfile,
        updateEmail,
        updatePhone,
        uploadAvatar,
        deleteAccount,
        resetPassword
    };
};
