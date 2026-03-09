import { useState } from 'react';
import { ExternalLink, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../services/api';

export function WhatsAppSetupGuide({ businessId, onComplete }) {
    const [verifying, setVerifying] = useState(false);

    const handleVerify = async () => {
        try {
            setVerifying(true);
            const res = await api.post('/facebook/refresh-connections');

            if (res.data.connections?.whatsapp?.connected) {
                alert('✅ WhatsApp Business détecté avec succès !');
                if (onComplete) onComplete();
                window.location.reload();
            } else {
                alert('⚠️ WhatsApp Business pas encore détecté. Assurez-vous d\'avoir terminé toutes les étapes dans Meta Business Manager.');
            }
        } catch (err) {
            console.error('Verify error:', err);
            alert('❌ Erreur lors de la vérification');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-6">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xl">💬</span>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-green-900 mb-1">
                        Connectez WhatsApp Business à votre compte
                    </h3>
                    <p className="text-sm text-green-800">
                        Pour créer des publicités Click-to-WhatsApp et automatiser vos messages clients
                    </p>
                </div>
            </div>

            {/* What is WhatsApp Business API */}
            <div className="bg-white rounded-lg p-4 mb-4 border border-green-200">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                    📱 Qu'est-ce que WhatsApp Business API ?
                </p>
                <p className="text-sm text-gray-700">
                    C'est la version professionnelle de WhatsApp qui vous permet de connecter votre numéro
                    d'entreprise à Facebook pour recevoir des messages de vos publicités et automatiser
                    vos réponses.
                </p>
            </div>

            {/* Step-by-step instructions */}
            <div className="bg-white rounded-lg p-4 mb-4 border border-green-200">
                <p className="text-sm font-semibold text-gray-900 mb-3">
                    📋 Comment connecter votre WhatsApp Business
                </p>

                <ol className="space-y-3 text-sm text-gray-700">
                    <li className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            1
                        </span>
                        <div>
                            <p className="font-medium text-gray-900">Préparez votre numéro de téléphone</p>
                            <p className="text-gray-600 mt-1">
                                Vous avez besoin d'un <strong>numéro dédié</strong> pour votre entreprise
                                (différent de votre WhatsApp personnel). Ce numéro recevra un code de vérification par SMS.
                            </p>
                        </div>
                    </li>

                    <li className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            2
                        </span>
                        <div>
                            <p className="font-medium text-gray-900">Ouvrez Meta Business Manager</p>
                            <p className="text-gray-600 mt-1">
                                Cliquez sur le bouton ci-dessous pour accéder directement à la page de configuration
                                WhatsApp dans votre Business Manager.
                            </p>
                        </div>
                    </li>

                    <li className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            3
                        </span>
                        <div>
                            <p className="font-medium text-gray-900">Ajoutez votre compte WhatsApp</p>
                            <p className="text-gray-600 mt-1">
                                Dans Business Manager, cliquez sur <strong>"Ajouter un compte WhatsApp"</strong>
                                ou <strong>"Créer un compte WhatsApp Business"</strong>. Suivez les étapes affichées.
                            </p>
                        </div>
                    </li>

                    <li className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            4
                        </span>
                        <div>
                            <p className="font-medium text-gray-900">Vérifiez votre numéro</p>
                            <p className="text-gray-600 mt-1">
                                Entrez votre numéro de téléphone professionnel. Vous recevrez un code par SMS.
                                Entrez ce code pour vérifier votre numéro.
                            </p>
                        </div>
                    </li>

                    <li className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            5
                        </span>
                        <div>
                            <p className="font-medium text-gray-900">Terminez la configuration</p>
                            <p className="text-gray-600 mt-1">
                                Remplissez les informations de votre entreprise (nom, catégorie, description).
                                Acceptez les conditions d'utilisation WhatsApp Business.
                            </p>
                        </div>
                    </li>
                </ol>
            </div>

            {/* Important notes */}
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg mb-4">
                <div className="flex items-start gap-2">
                    <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
                    <div>
                        <p className="text-sm font-semibold text-yellow-900 mb-1">
                            ⚠️ Points importants
                        </p>
                        <ul className="text-sm text-yellow-800 space-y-1 ml-4 list-disc">
                            <li>
                                <strong>Numéro dédié requis :</strong> Ne peut pas être utilisé sur WhatsApp personnel
                            </li>
                            <li>
                                <strong>Vérification obligatoire :</strong> Vous devez recevoir un SMS de vérification
                            </li>
                            <li>
                                <strong>Gratuit :</strong> La création du compte WhatsApp Business API est gratuite
                            </li>
                            <li>
                                <strong>Temps estimé :</strong> 5-10 minutes pour tout configurer
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
                {businessId ? (
                    <a
                        href={`https://business.facebook.com/latest/settings/whatsapp_account/?business_id=${businessId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md transition-colors"
                    >
                        🔗 Ouvrir Meta Business Manager
                        <ExternalLink className="inline ml-2" size={16} />
                    </a>
                ) : (
                    <a
                        href="https://business.facebook.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md transition-colors"
                    >
                        Créer un Business Manager d'abord
                        <ExternalLink className="inline ml-2" size={16} />
                    </a>
                )}

                <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-green-600 text-green-600 font-semibold rounded-lg hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {verifying ? (
                        <>
                            <RefreshCw className="animate-spin" size={18} />
                            Vérification en cours...
                        </>
                    ) : (
                        <>
                            <CheckCircle size={18} />
                            J'ai terminé — Vérifier ma connexion
                        </>
                    )}
                </button>

                <p className="text-xs text-gray-600 text-center">
                    💡 Après avoir configuré WhatsApp dans Meta, cliquez sur "Vérifier" pour que AdsFacile détecte votre compte
                </p>
            </div>
        </div>
    );
}
