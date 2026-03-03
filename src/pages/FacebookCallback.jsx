/**
 * FacebookCallback — Page de retour OAuth Facebook
 * AdsFacile Frontend
 * 
 * Gère le retour après authentification Facebook OAuth.
 * Le backend traite le code et redirige vers /dashboard.
 * Cette page n'est utilisée que si le frontend gère le callback directement.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, RotateCw, Facebook } from 'lucide-react';
import './FacebookCallback.css';

const FacebookCallback = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
            setStatus('error');
            setErrorMessage(errorDescription || 'L\'authentification Facebook a été refusée.');
            return;
        }

        if (!code) {
            setStatus('error');
            setErrorMessage('Aucun code d\'autorisation reçu de Facebook.');
            return;
        }

        // Le backend redirige directement vers /dashboard après traitement
        // Ce bloc est un fallback si le frontend gère le callback
        const processCallback = async () => {
            try {
                // Rediriger vers le backend callback qui traite le code
                window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/facebook/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(searchParams.get('state') || '')}`;
            } catch {
                setStatus('error');
                setErrorMessage('Erreur lors du traitement de la connexion Facebook.');
            }
        };

        processCallback();
    }, [searchParams, navigate]);

    const handleRetry = () => {
        navigate('/dashboard');
    };

    return (
        <div className="fb-callback-page">
            <div className="fb-callback-card">
                <div className="fb-callback-icon">
                    <Facebook size={32} />
                </div>

                {status === 'loading' && (
                    <>
                        <Loader2 size={36} className="fb-callback-spinner" />
                        <h2 className="fb-callback-title">Connexion en cours...</h2>
                        <p className="fb-callback-text">
                            Nous connectons votre compte Facebook Business.
                            <br />Veuillez patienter...
                        </p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 size={48} className="fb-callback-success-icon" />
                        <h2 className="fb-callback-title">Connexion réussie !</h2>
                        <p className="fb-callback-text">
                            Votre compte Facebook Business est maintenant connecté.
                        </p>
                        <p className="fb-callback-text secondary">
                            Redirection vers le dashboard...
                        </p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertCircle size={48} className="fb-callback-error-icon" />
                        <h2 className="fb-callback-title">Erreur de connexion</h2>
                        <p className="fb-callback-text">
                            {errorMessage}
                        </p>
                        <button className="fb-callback-retry" onClick={handleRetry}>
                            <RotateCw size={16} />
                            Retourner au dashboard
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default FacebookCallback;
