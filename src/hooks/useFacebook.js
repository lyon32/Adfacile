/**
 * Hook pour la gestion de la connexion Facebook Business
 * AdsFacile Frontend
 *
 * Le statut Facebook est partagé entre tous les composants via un petit store
 * de module plutôt que dupliqué dans chaque instance du hook.
 *
 * Auparavant, chaque appel à useFacebook() gérait son propre état et lançait
 * son propre GET /facebook/status au montage. Le hook étant utilisé dans trois
 * composants (ConnectFacebookButton, DashboardPage, CampaignsListPage), une
 * seule page déclenchait déjà plusieurs requêtes, et chaque remontage en
 * relançait d'autres — jusqu'à huit appels en quelques secondes. Comme chaque
 * instance remettait `loading` à true, le message « Vérification Facebook… »
 * ne se stabilisait jamais.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';

// ── Store partagé ────────────────────────────────────────────────────────────

const ETAT_INITIAL = {
    connected: false,
    loading: true,
    pageName: null,
    accountId: null,
    fbUserId: null,
    error: null,
    // `false` tant qu'aucune réponse n'a été reçue : sert à savoir si un
    // remontage doit réafficher un état de chargement ou réutiliser le cache.
    charge: false
};

let etat = ETAT_INITIAL;
const abonnes = new Set();

/** Remplace l'état et notifie les composants abonnés. */
const majEtat = (partiel) => {
    etat = { ...etat, ...partiel };
    abonnes.forEach(notifier => notifier());
};

const souscrire = (notifier) => {
    abonnes.add(notifier);
    return () => abonnes.delete(notifier);
};

const lireEtat = () => etat;

// Requête en cours, partagée : les instances montées simultanément attendent
// la même promesse au lieu d'en déclencher chacune une.
let requeteEnCours = null;

/**
 * Récupère le statut de connexion Facebook.
 * @param {boolean} force - refait la requête même si le statut est déjà en cache
 */
const chargerStatut = (force = false) => {
    if (requeteEnCours) return requeteEnCours;
    if (etat.charge && !force) return Promise.resolve();

    majEtat({ loading: true, error: null });

    requeteEnCours = api.get('/facebook/status')
        .then(response => {
            if (response.data.success) {
                const { connected, pageName, accountId, fbUserId } = response.data.data;
                majEtat({
                    connected,
                    pageName: pageName ?? null,
                    accountId: accountId ?? null,
                    fbUserId: fbUserId ?? null
                });
            }
        })
        .catch(err => {
            console.error('Erreur récupération statut Facebook:', err);
            majEtat({ error: 'Impossible de vérifier la connexion Facebook' });
        })
        .finally(() => {
            requeteEnCours = null;
            majEtat({ loading: false, charge: true });
        });

    return requeteEnCours;
};

/** Réinitialise le store — utilisé à la déconnexion du compte AdsFacile. */
export const resetFacebookStatus = () => {
    requeteEnCours = null;
    etat = ETAT_INITIAL;
    abonnes.forEach(notifier => notifier());
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useFacebook = () => {
    const snapshot = useSyncExternalStore(souscrire, lireEtat, lireEtat);

    // Seul le premier consommateur monté déclenche la requête ; les suivants,
    // comme les remontages, réutilisent le cache ou la requête en cours.
    useEffect(() => { chargerStatut(); }, []);

    /** Force un rechargement du statut (après une reconnexion par exemple). */
    const getStatus = useCallback(() => chargerStatut(true), []);

    /**
     * Obtenir l'URL d'authentification et rediriger vers Facebook
     */
    const getAuthUrl = useCallback(async () => {
        try {
            majEtat({ error: null });
            const response = await api.get('/facebook/auth/url');
            if (response.data.success && response.data.data.authUrl) {
                window.location.href = response.data.data.authUrl;
            }
        } catch (err) {
            console.error('Erreur récupération URL OAuth:', err);
            majEtat({ error: 'Impossible de se connecter à Facebook. Réessayez.' });
        }
    }, []);

    /**
     * Déconnecter le compte Facebook
     */
    const disconnect = useCallback(async () => {
        try {
            majEtat({ error: null });
            const response = await api.post('/facebook/disconnect');
            if (response.data.success) {
                majEtat({
                    connected: false,
                    pageName: null,
                    accountId: null,
                    fbUserId: null
                });
            }
            return response.data;
        } catch (err) {
            console.error('Erreur déconnexion Facebook:', err);
            majEtat({ error: 'Erreur lors de la déconnexion' });
            throw err;
        }
    }, []);

    return {
        connected: snapshot.connected,
        loading: snapshot.loading,
        pageName: snapshot.pageName,
        accountId: snapshot.accountId,
        fbUserId: snapshot.fbUserId,
        error: snapshot.error,
        getAuthUrl,
        getStatus,
        disconnect
    };
};
