/**
 * ConnectFacebookButton — Bouton de connexion Facebook Business
 * AdsFacile Frontend
 */

import { useState } from 'react';
import { Facebook, Loader2, CheckCircle2, Unplug, AlertCircle } from 'lucide-react';
import { useFacebook } from '../../hooks/useFacebook';
import { FacebookPreConnectionChecklist } from '../dashboard/FacebookPreConnectionChecklist';
import './ConnectFacebookButton.css';

const ConnectFacebookButton = () => {
    const { connected, loading, pageName, accountId, error, getAuthUrl, disconnect } = useFacebook();
    const [redirecting, setRedirecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleConnect = async () => {
        setRedirecting(true);
        await getAuthUrl();
        // La page va rediriger, pas besoin de setRedirecting(false)
    };

    const handleDisconnect = async () => {
        try {
            setDisconnecting(true);
            await disconnect();
            setShowConfirm(false);
        } catch {
            // Erreur gérée dans le hook
        } finally {
            setDisconnecting(false);
        }
    };

    // Loading initial
    if (loading) {
        return (
            <div className="fb-connect-card">
                <div className="fb-connect-loading">
                    <Loader2 size={20} className="spinner" />
                    <span>Vérification Facebook...</span>
                </div>
            </div>
        );
    }

    // Connecté
    if (connected) {
        return (
            <div className="fb-connect-card fb-connected">
                <div className="fb-connect-header">
                    <div className="fb-status-badge connected">
                        <CheckCircle2 size={16} />
                        <span>Connecté</span>
                    </div>
                </div>
                <div className="fb-connect-info">
                    <div className="fb-icon-circle connected">
                        <Facebook size={22} />
                    </div>
                    <div className="fb-connect-details">
                        <strong className="fb-page-name">{pageName || 'Page Facebook'}</strong>
                        {accountId && (
                            <span className="fb-account-id">
                                Compte pub : {accountId.replace('act_', '')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Confirmation de déconnexion */}
                {showConfirm ? (
                    <div className="fb-confirm-disconnect">
                        <p>Déconnecter votre compte Facebook ?</p>
                        <div className="fb-confirm-actions">
                            <button
                                className="fb-btn-cancel"
                                onClick={() => setShowConfirm(false)}
                                disabled={disconnecting}
                            >
                                Annuler
                            </button>
                            <button
                                className="fb-btn-confirm-disconnect"
                                onClick={handleDisconnect}
                                disabled={disconnecting}
                            >
                                {disconnecting ? (
                                    <><Loader2 size={14} className="spinner" /> Déconnexion...</>
                                ) : (
                                    <><Unplug size={14} /> Confirmer</>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        className="fb-btn-disconnect"
                        onClick={() => setShowConfirm(true)}
                    >
                        <Unplug size={14} />
                        Déconnecter
                    </button>
                )}
            </div>
        );
    }

    // Non connecté
    return (
        <FacebookPreConnectionChecklist 
            onReady={handleConnect} 
            isRedirecting={redirecting} 
        />
    );
};

export default ConnectFacebookButton;
