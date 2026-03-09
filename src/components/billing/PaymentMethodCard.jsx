import { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Shield, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../../services/api';

export function PaymentMethodCard({ businessId }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPaymentStatus() {
            try {
                const res = await api.get('/billing/payment-method-status');
                setStatus(res.data.data);
            } catch (err) {
                console.error('Payment method status error:', err);
                setStatus({ has_payment_method: false });
            } finally {
                setLoading(false);
            }
        }
        fetchPaymentStatus();
    }, []);

    const adAccountId = status?.ad_account_id;
    const paymentUrl = (businessId && adAccountId)
        ? `https://business.facebook.com/billing_hub/accounts/details/?business_id=${businessId}&asset_id=${adAccountId}&payment_account_id=${adAccountId}&placement=ads_manager`
        : 'https://business.facebook.com/billing_hub/accounts';

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6 flex items-center justify-center gap-3">
                <Loader2 size={18} className="animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Vérification du moyen de paiement…</span>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative">
            {/* Top accent */}
            <div className={`absolute top-0 left-0 right-0 h-[3px] ${status?.has_payment_method ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`} />

            <div className="p-6 sm:p-8">
                {/* Header */}
                <div className="flex items-start gap-4 mb-6">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border ${status?.has_payment_method ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                        <CreditCard className={status?.has_payment_method ? 'text-emerald-600' : 'text-amber-600'} size={24} />
                    </div>
                    <div className="pt-0.5">
                        <h3 className="text-[17px] font-bold text-gray-900 mb-1">
                            Méthode de paiement Facebook
                        </h3>
                        <p className="text-sm text-gray-500">
                            La carte bancaire utilisée pour payer vos publicités Facebook
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main content */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Status */}
                        <div className={`rounded-2xl p-5 border ${status?.has_payment_method ? 'bg-emerald-50/30 border-emerald-100' : 'bg-amber-50/30 border-amber-100'}`}>
                            {status?.has_payment_method ? (
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={22} />
                                    <div>
                                        <p className="text-sm font-bold text-emerald-900">Carte bancaire configurée</p>
                                        {status.display_string && (
                                            <p className="text-[13px] text-emerald-700 mt-0.5">{status.display_string}</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={22} />
                                    <div>
                                        <p className="text-sm font-bold text-amber-900">Aucune carte bancaire configurée</p>
                                        <p className="text-[13px] text-amber-700 mt-1 leading-relaxed">
                                            Pour lancer des publicités Facebook, vous devez d'abord ajouter une carte bancaire dans les paramètres de votre compte publicitaire Facebook.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Security sidebar */}
                    <div>
                        <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100/60">
                            <div className="flex items-start gap-2 mb-3">
                                <Shield className="text-blue-500 flex-shrink-0" size={18} />
                                <h4 className="text-[13px] font-bold text-blue-900 mt-0.5">Sécurité</h4>
                            </div>
                            <p className="text-[13px] text-blue-800/80 leading-relaxed">
                                AdsFacile n'a <strong>jamais</strong> accès à vos informations bancaires. Votre carte est gérée directement et en toute sécurité par Facebook.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Action */}
                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-gray-400 hidden sm:block">
                        Vous payez Facebook directement pour vos publicités.
                    </p>

                    <a
                        href={paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-white text-[13px] font-bold rounded-xl hover:shadow-lg transition-all ${status?.has_payment_method ? 'bg-gray-900 hover:bg-gray-800' : 'bg-amber-600 hover:bg-amber-700'}`}
                    >
                        {status?.has_payment_method ? 'Gérer sur Facebook' : '➕ Ajouter une carte sur Facebook'}
                        <ExternalLink className="ml-2" size={16} />
                    </a>
                </div>
            </div>
        </div>
    );
}
