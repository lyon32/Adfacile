import { useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

/**
 * reason :
 *  - 'permissions' : permissions Instagram / WhatsApp manquantes ;
 *  - 'revoked'     : Facebook a invalidé la connexion (mot de passe changé,
 *                    session réinitialisée) — plus aucun appel ne passe ;
 *  - 'expiring'    : l'accès aux données accordé à AdsFacile arrive à terme
 *                    (règle Meta des 90 jours), `expiresAt` en ISO.
 */
export function ReconnectFacebookButton({ permissions, reason = 'permissions', message, expiresAt }) {
    const [loading, setLoading] = useState(false);

    const missingPermissions = [];
    if (permissions && !permissions.hasInstagramPermission) {
        missingPermissions.push('Instagram');
    }
    if (permissions && !permissions.hasWhatsAppPermission) {
        missingPermissions.push('WhatsApp Business');
    }

    const handleReconnect = async () => {
        try {
            setLoading(true);
            const res = await api.get('/facebook/auth/url');
            if (res.data.success) {
                window.location.href = res.data.data.authUrl;
            }
        } catch (err) {
            console.error('Reconnect error:', err);
            alert('Erreur lors de la reconnexion. Veuillez réessayer.');
            setLoading(false);
        }
    };

    return (
        <div className="rounded-2xl overflow-hidden shadow-lg border border-orange-200/60 mb-6 bg-white">
            {/* Header */}
            <div className="bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 px-6 py-4 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
                    backgroundSize: '12px 12px'
                }} />
                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                        <AlertTriangle className="text-white" size={20} />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-bold text-white tracking-tight">
                            Reconnexion Facebook requise
                        </h3>
                        <p className="text-[11px] text-orange-100/80 mt-0.5 font-medium">
                            {reason === 'revoked'
                                ? 'Facebook a interrompu la connexion de votre compte'
                                : reason === 'expiring'
                                    ? `L'accès à vos données Facebook expire le ${new Date(expiresAt).toLocaleDateString('fr-FR')}`
                                    : missingPermissions.length > 0
                                        ? `Permissions manquantes : ${missingPermissions.join(', ')}`
                                        : 'Mettez à jour votre connexion'
                            }
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-4">
                {reason === 'revoked' && (
                    <div className="bg-orange-50/60 rounded-xl border border-orange-100 p-4">
                        <p className="text-xs text-gray-700">
                            {message || 'Facebook a interrompu la connexion de votre compte. Reconnectez Facebook pour continuer.'}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                            Cela arrive quand le mot de passe Facebook change, après une déconnexion de tous
                            les appareils, ou quand Facebook réinitialise la session par sécurité. Tant que
                            vous n'êtes pas reconnecté, la recherche de lieux et la création de campagnes
                            ne fonctionnent pas.
                        </p>
                    </div>
                )}

                {reason === 'expiring' && (
                    <div className="bg-orange-50/60 rounded-xl border border-orange-100 p-4">
                        <p className="text-xs text-gray-700">
                            Facebook demande de renouveler l'accès tous les 90 jours. Reconnectez-vous
                            avant cette date pour que vos campagnes et statistiques restent disponibles.
                        </p>
                    </div>
                )}

                {/* Missing permissions detail */}
                {reason === 'permissions' && missingPermissions.length > 0 && (
                    <div className="bg-orange-50/60 rounded-xl border border-orange-100 p-4">
                        <p className="text-xs font-bold text-gray-700 mb-2">Permissions manquantes :</p>
                        <ul className="space-y-1.5">
                            {!permissions?.hasInstagramPermission && (
                                <li className="flex items-start gap-2 text-xs text-gray-600">
                                    <span className="text-red-400 mt-0.5">✗</span>
                                    <span><strong>Instagram</strong> — Détecter votre compte et diffuser des publicités Instagram</span>
                                </li>
                            )}
                            {!permissions?.hasWhatsAppPermission && (
                                <li className="flex items-start gap-2 text-xs text-gray-600">
                                    <span className="text-red-400 mt-0.5">✗</span>
                                    <span><strong>WhatsApp Business</strong> — Créer des publicités Click-to-WhatsApp</span>
                                </li>
                            )}
                        </ul>
                    </div>
                )}

                {/* What will happen */}
                <div className="bg-gray-50/80 rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-bold text-gray-700 mb-2">Ce qui va se passer :</p>
                    <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                        <li>Redirection vers Facebook</li>
                        <li>{reason === 'permissions' ? 'Autorisation des nouvelles permissions' : "Validation de l'accès à votre compte"}</li>
                        <li>Choix de votre Page et de votre compte publicitaire</li>
                        <li>Retour automatique sur AdsFacile</li>
                    </ol>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={handleReconnect}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="animate-spin" size={16} />
                                Redirection...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={16} />
                                Reconnecter Facebook
                            </>
                        )}
                    </button>

                    <button
                        onClick={async () => {
                            if (confirm('Déconnecter votre compte Facebook ?')) {
                                await api.post('/facebook/disconnect');
                                window.location.reload();
                            }
                        }}
                        className="px-4 py-3 border border-gray-200 text-gray-500 text-xs font-medium rounded-xl hover:bg-gray-50 transition-colors"
                    >
                        Déconnecter
                    </button>
                </div>

                <p className="text-[10px] text-gray-400 text-center">
                    💡 Vos campagnes et paramètres existants seront conservés
                </p>
            </div>
        </div>
    );
}
