/**
 * AdAccountSelector — Compte publicitaire sur lequel partent les campagnes
 *
 * Ce compte était choisi une fois pour toutes à la connexion Facebook — le
 * premier actif de la liste — sans jamais être montré. Un utilisateur dont les
 * ensembles de données vivent sur un autre compte n'avait aucun moyen de le
 * comprendre : le suivi des achats restait vide sans explication.
 *
 * Le nombre d'ensembles de données et le statut sont affichés pour chaque
 * compte : ce sont les deux informations qui permettent de choisir. Un compte
 * que Meta refuse (désactivé, impayé…) n'est pas sélectionnable — le laisser
 * choisir déplacerait l'échec à la création de la campagne.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Check, Loader2, BarChart3, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

const decrirePixels = (compte) => {
    if (compte.pixels_count === null) return 'Ensembles de données illisibles';
    if (compte.pixels_count === 0) return 'Aucun ensemble de données';
    return `${compte.pixels_count} ensemble${compte.pixels_count > 1 ? 's' : ''} de données`;
};

export function AdAccountSelector({ onSwitch }) {
    const [comptes, setComptes] = useState(null);
    const [ouvert, setOuvert] = useState(false);
    const [enCours, setEnCours] = useState(false);
    const [erreur, setErreur] = useState('');

    const charger = useCallback(async () => {
        try {
            const res = await api.get('/facebook/ad-accounts');
            setComptes(res.data?.data?.ad_accounts || []);
            setErreur('');
        } catch (err) {
            setComptes([]);
            setErreur(
                err.response?.status === 404
                    ? 'Redémarrez le serveur AdsFacile pour activer le choix du compte publicitaire.'
                    : (err.response?.data?.message || 'Comptes publicitaires illisibles.')
            );
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const basculer = async (id) => {
        if (enCours) return;
        setEnCours(true);
        setErreur('');
        try {
            await api.post('/facebook/switch-ad-account', { ad_account_id: id });
            setOuvert(false);
            await charger();
            if (onSwitch) onSwitch(id);
        } catch (err) {
            setErreur(err.response?.data?.message || 'Changement de compte impossible.');
        } finally {
            setEnCours(false);
        }
    };

    if (comptes === null) return null;

    if (comptes.length === 0) {
        return erreur ? (
            <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-50 border border-amber-200 mb-6">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-900">{erreur}</p>
            </div>
        ) : null;
    }

    const actif = comptes.find(c => c.is_active) || comptes[0];

    // Un seul compte : rien à choisir, on informe seulement.
    if (comptes.length === 1) {
        return (
            <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border border-gray-200 mb-6 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/80" />
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 shadow-sm">
                    <BarChart3 size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        Compte publicitaire
                    </p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">{actif.name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        {actif.status_label} · {decrirePixels(actif)}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative mb-6">
            <button
                onClick={() => setOuvert(!ouvert)}
                disabled={enCours}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all disabled:opacity-60 relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
                {ouvert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}

                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 shadow-sm">
                    <BarChart3 size={20} className="text-emerald-600" />
                </div>

                <div className="flex-1 min-w-0 text-left">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        Compte publicitaire
                    </p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">{actif.name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        {actif.status_label} · {decrirePixels(actif)}
                    </p>
                </div>

                {enCours
                    ? <Loader2 size={16} className="text-emerald-500 animate-spin shrink-0" />
                    : <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform duration-200 ${ouvert ? 'rotate-180' : ''}`} />
                }
            </button>

            {ouvert && (
                <div className="absolute z-30 inset-x-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                    <div className="max-h-[320px] overflow-y-auto">
                        {comptes.map(compte => {
                            const indisponible = !compte.usable && !compte.is_active;
                            return (
                                <button
                                    key={compte.id}
                                    onClick={() => basculer(compte.id)}
                                    disabled={enCours || compte.is_active || indisponible}
                                    title={indisponible
                                        ? `Meta n'autorise aucune création de publicité sur un compte ${compte.status_label.toLowerCase()}.`
                                        : undefined}
                                    className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors border-b border-gray-50 last:border-b-0 ${compte.is_active
                                        ? 'bg-emerald-50/40 cursor-default'
                                        : indisponible
                                            ? 'opacity-55 cursor-not-allowed'
                                            : 'hover:bg-gray-50 cursor-pointer'
                                        }`}
                                >
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${compte.is_active
                                        ? 'bg-emerald-500 border-emerald-600 text-white'
                                        : 'bg-white border-gray-200 text-emerald-600'
                                        }`}>
                                        <BarChart3 size={18} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[14px] font-bold truncate ${compte.is_active ? 'text-emerald-900' : 'text-gray-900'}`}>
                                            {compte.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className={`text-[11px] font-medium ${compte.usable ? 'text-gray-500' : 'text-amber-700'}`}>
                                                {compte.status_label}
                                            </span>
                                            <span className="text-[11px] text-gray-300">·</span>
                                            <span className={`text-[11px] font-medium ${compte.pixels_count > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {decrirePixels(compte)}
                                            </span>
                                        </div>
                                    </div>

                                    {compte.is_active && <Check size={18} className="text-emerald-600 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {erreur && (
                <p className="mt-2 text-[12px] text-amber-700 font-medium">{erreur}</p>
            )}
        </div>
    );
}

export default AdAccountSelector;
