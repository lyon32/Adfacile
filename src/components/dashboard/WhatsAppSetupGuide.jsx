import { ExternalLink, AlertCircle, MessageSquare } from 'lucide-react';

export function WhatsAppSetupGuide({ businessId }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative">
            {/* Decorative top accent */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400 to-teal-500" />

            <div className="p-6 sm:p-8">
                {/* Header */}
                <div className="flex items-start gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <MessageSquare className="text-emerald-600" size={24} />
                    </div>
                    <div className="pt-0.5">
                        <h3 className="text-[17px] font-bold text-gray-900 mb-1">
                            Configurez WhatsApp Business <span className="text-[10px] ml-2 align-middle px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-bold uppercase tracking-wider border border-gray-200">Optionnel</span>
                        </h3>
                        <p className="text-sm text-gray-500">
                            Associez votre numéro professionnel pour recevoir des leads directement via WhatsApp.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Main Content (Left, 2 columns wide) */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Step-by-step instructions */}
                        <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                            <h4 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                                📋 Comment connecter le compte
                            </h4>

                            <ol className="space-y-5">
                                <li className="flex items-start gap-4">
                                    <span className="flex-shrink-0 w-7 h-7 bg-white border border-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 shadow-sm">
                                        1
                                    </span>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Numéro de téléphone dédié</p>
                                        <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
                                            Préparez un numéro unique pour l'entreprise (différent de votre WhatsApp personnel ou de l'application standard).
                                        </p>
                                    </div>
                                </li>

                                <li className="flex items-start gap-4">
                                    <span className="flex-shrink-0 w-7 h-7 bg-white border border-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 shadow-sm">
                                        2
                                    </span>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Meta Business Suite</p>
                                        <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
                                            Ouvrez les paramètres WhatsApp dans le Business Manager via le bouton ci-dessous.
                                        </p>
                                    </div>
                                </li>

                                <li className="flex items-start gap-4">
                                    <span className="flex-shrink-0 w-7 h-7 bg-white border border-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 shadow-sm">
                                        3
                                    </span>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Vérification par SMS</p>
                                        <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
                                            Ajoutez votre numéro et entrez le code reçu par SMS pour finaliser l'intégration.
                                        </p>
                                    </div>
                                </li>
                            </ol>
                        </div>
                    </div>

                    {/* Sidebar (Right, 1 column wide) */}
                    <div className="space-y-4">
                        {/* Info Card */}
                        <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-100/60 transition-colors hover:bg-emerald-50">
                            <h4 className="text-[13px] font-bold text-emerald-900 mb-2">
                                Pourquoi WhatsApp API ?
                            </h4>
                            <p className="text-[13px] text-emerald-800/80 leading-relaxed">
                                Connecter votre numéro à Facebook vous permet de lancer des publicités "Click-to-WhatsApp", captant ainsi une audience directement dans la messagerie.
                            </p>
                        </div>

                        {/* Important notes */}
                        <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-100/60">
                            <div className="flex items-start gap-2 mb-3">
                                <AlertCircle className="text-amber-500 flex-shrink-0" size={18} />
                                <h4 className="text-[13px] font-bold text-amber-900 mt-0.5">Prérequis</h4>
                            </div>
                            <ul className="text-[13px] text-amber-800/80 space-y-2 list-none">
                                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-amber-400 rounded-full" /> Numéro vierge / dédié</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-amber-400 rounded-full" /> Vérification par SMS requise</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-amber-400 rounded-full" /> 100% gratuit par Meta</li>
                            </ul>
                        </div>

                    </div>
                </div>

                {/* Action button at the bottom */}
                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-gray-400 hidden sm:block">
                        Cette étape est informative et peut être passée.
                    </p>

                    {businessId ? (
                        <a
                            href={`https://business.facebook.com/latest/settings/whatsapp_account/?business_id=${businessId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-gray-900 text-white text-[13px] font-bold rounded-xl hover:bg-gray-800 hover:shadow-lg transition-all"
                        >
                            Paramétrer dans Business Suite
                            <ExternalLink className="ml-2" size={16} />
                        </a>
                    ) : (
                        <a
                            href="https://business.facebook.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-gray-900 text-white text-[13px] font-bold rounded-xl hover:bg-gray-800 hover:shadow-lg transition-all"
                        >
                            Ouvrir Business Manager
                            <ExternalLink className="ml-2" size={16} />
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
