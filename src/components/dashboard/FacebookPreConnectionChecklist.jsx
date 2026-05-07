import { useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, AlertCircle, HelpCircle, ChevronRight, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export function FacebookPreConnectionChecklist({ onReady, isRedirecting }) {
    const [hasPage, setHasPage] = useState(false);
    const [isPageAlreadyCreated, setIsPageAlreadyCreated] = useState(false);
    const [hasIgWa, setHasIgWa] = useState(false);
    const [understands, setUnderstands] = useState(false);

    const canConnect = (hasPage || isPageAlreadyCreated) && hasIgWa && understands;

    return (
        <div className="relative bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10 max-w-2xl mx-auto my-8 overflow-hidden transition-all duration-500 hover:shadow-[0_20px_40px_rgba(79,70,229,0.08)]">

            {/* Dynamic Background Glows */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* Header Section */}
            <div className="relative mb-12 text-center z-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white mb-6 shadow-xl shadow-indigo-500/30 transform -rotate-3 transition-transform hover:rotate-0 duration-300">
                    <Zap size={36} className="animate-pulse" strokeWidth={1.5} />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
                    Propulsez votre Business
                </h2>
                <div className="flex items-center justify-center gap-2 text-slate-500">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <p className="text-sm sm:text-base font-medium">3 étapes requises pour lancer vos publicités</p>
                </div>
            </div>

            {/* Checklist Items */}
            <div className="space-y-5 mb-10 relative z-10">

                {/* Step 1: Facebook Page */}
                <div className={`group relative rounded-2xl border-2 transition-all duration-300 overflow-hidden ${hasPage || isPageAlreadyCreated
                    ? 'bg-emerald-50/50 border-emerald-200 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 hover:-translate-y-1'}`}>

                    {/* Completion Progress Bar effect on top */}
                    <div className={`absolute top-0 left-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700 ${hasPage || isPageAlreadyCreated ? 'w-full' : 'w-0'}`}></div>

                    <div className="p-6 sm:p-7">
                        <div className="flex items-start gap-4 sm:gap-5">
                            <button
                                onClick={() => setHasPage(!hasPage)}
                                className="flex-shrink-0 mt-0.5 transition-transform active:scale-90 focus:outline-none"
                            >
                                {hasPage || isPageAlreadyCreated ? (
                                    <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full p-[3px] shadow-lg shadow-emerald-500/30 animate-in zoom-in duration-300">
                                        <CheckCircle2 className="text-white" size={24} />
                                    </div>
                                ) : (
                                    <div className="rounded-full p-[3px] border-2 border-slate-200 group-hover:border-indigo-400 transition-colors bg-white">
                                        <Circle className="text-transparent" size={20} />
                                    </div>
                                )}
                            </button>

                            <div className="flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                                    <h3 className={`text-lg sm:text-xl font-bold leading-tight transition-colors ${hasPage || isPageAlreadyCreated ? 'text-emerald-900' : 'text-slate-800 group-hover:text-indigo-900'}`}>
                                        1. Page Facebook Pro
                                    </h3>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${hasPage || isPageAlreadyCreated ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {hasPage || isPageAlreadyCreated ? 'Validé' : 'Requis'}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 leading-relaxed mb-5">
                                    Votre marque doit exister officiellement sur le réseau.
                                    <span className="block mt-1 font-semibold text-indigo-500/90">C'est la vitrine de toutes vos annonces.</span>
                                </p>

                                {/* Detailed options only shown if not completed */}
                                {!(hasPage || isPageAlreadyCreated) && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <button
                                            onClick={() => {
                                                setIsPageAlreadyCreated(true);
                                                setHasPage(true);
                                            }}
                                            className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-transparent transition-all flex items-center justify-between group/opt shadow-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center group-hover/opt:border-indigo-500 bg-slate-50">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-0 group-hover/opt:opacity-100 transition-all scale-50 group-hover/opt:scale-100"></div>
                                                </div>
                                                <span className="text-sm font-semibold text-slate-700 group-hover/opt:text-indigo-900">J'ai déjà une Page pour mon activité</span>
                                            </div>
                                            <ChevronRight size={18} className="text-slate-300 group-hover/opt:text-indigo-500 transform group-hover/opt:translate-x-1 transition-all" />
                                        </button>

                                        <div className="flex items-center gap-4 px-4 py-2 opacity-60">
                                            <div className="h-px bg-slate-200 flex-1"></div>
                                            <span className="text-[10px] font-black text-slate-400 tracking-[0.2em]">OU CRÉER</span>
                                            <div className="h-px bg-slate-200 flex-1"></div>
                                        </div>

                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold mb-3 text-sm">
                                                <HelpCircle size={16} className="text-indigo-500" />
                                                <span>Je n'en ai pas encore</span>
                                            </div>
                                            <a
                                                href="https://www.facebook.com/pages/create"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group/link relative inline-flex items-center justify-center w-full px-5 py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-[0_4px_14px_0_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] active:scale-[0.98]"
                                            >
                                                Ouvrir le créateur de Page
                                                <ExternalLink size={16} className="ml-2.5 opacity-70 group-hover/link:opacity-100 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-all" />
                                            </a>
                                            <p className="text-xs text-slate-400 mt-4 text-center font-medium">
                                                Revenez valider cette étape une fois terminé.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {(hasPage || isPageAlreadyCreated) && (
                                    <div className="bg-emerald-100/50 border border-emerald-200 rounded-lg p-3.5 mt-2 flex items-center gap-3 animate-in slide-in-from-left-2 duration-300">
                                        <ShieldCheck size={18} className="text-emerald-600" />
                                        <p className="text-sm text-emerald-800 font-semibold">
                                            {isPageAlreadyCreated ? "Configuration validée : Page existante utilisée." : "Félicitations ! Votre page est prête."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Step 2: Instagram/WhatsApp */}
                <div className={`group relative rounded-2xl border-2 transition-all duration-300 overflow-hidden ${hasIgWa
                    ? 'bg-emerald-50/50 border-emerald-200 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-50/50 hover:-translate-y-1'}`}>

                    <div className={`absolute top-0 left-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700 ${hasIgWa ? 'w-full' : 'w-0'}`}></div>

                    <div className="p-6 sm:p-7">
                        <div className="flex items-start gap-4 sm:gap-5">
                            <button
                                onClick={() => setHasIgWa(!hasIgWa)}
                                className="flex-shrink-0 mt-0.5 transition-transform active:scale-90 focus:outline-none"
                            >
                                {hasIgWa ? (
                                    <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full p-[3px] shadow-lg shadow-emerald-500/30 animate-in zoom-in duration-300">
                                        <CheckCircle2 className="text-white" size={24} />
                                    </div>
                                ) : (
                                    <div className="rounded-full p-[3px] border-2 border-slate-200 group-hover:border-violet-400 transition-colors bg-white">
                                        <Circle className="text-transparent" size={20} />
                                    </div>
                                )}
                            </button>

                            <div className="flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                                    <h3 className={`text-lg sm:text-xl font-bold leading-tight transition-colors ${hasIgWa ? 'text-emerald-900' : 'text-slate-800 group-hover:text-violet-900'}`}>
                                        2. Comptes Instagram & WhatsApp
                                    </h3>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${hasIgWa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {hasIgWa ? 'Validé' : 'Requis'}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 leading-relaxed mb-4">
                                    Associez vos comptes à votre Page Facebook pour multiplier la portée de vos annonces.
                                </p>

                                {!hasIgWa && (
                                    <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4 sm:p-5 animate-in fade-in duration-500 mt-2">
                                        <p className="text-xs font-black text-slate-700 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                                            <AlertCircle size={14} className="text-violet-500" />
                                            Où vérifier ?
                                        </p>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 text-sm text-slate-700 font-medium bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                                                <span>Paramètres <span className="text-slate-300 mx-1">/</span> Comptes associés</span>
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium pl-1">Confirmez que tout est lié avant de cocher.</p>
                                        </div>
                                    </div>
                                )}

                                {hasIgWa && (
                                    <div className="bg-emerald-100/50 border border-emerald-200 rounded-lg p-3.5 mt-2 flex items-center gap-3 animate-in slide-in-from-left-2 duration-300">
                                        <ShieldCheck size={18} className="text-emerald-600" />
                                        <p className="text-sm text-emerald-800 font-semibold">Liaison confirmée avec succès.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Final Certification Box */}
                <div className={`p-5 sm:p-6 rounded-2xl border-2 transition-all duration-500 ${understands
                    ? 'border-indigo-400 bg-gradient-to-r from-indigo-50/80 to-violet-50/80 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'border-dashed border-slate-300 bg-slate-50/50 hover:border-indigo-300 hover:bg-slate-50'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none group/check">
                        <div className="relative mt-0.5">
                            <input
                                type="checkbox"
                                checked={understands}
                                onChange={(e) => setUnderstands(e.target.checked)}
                                className="peer sr-only"
                            />
                            <div className="w-7 h-7 rounded-xl bg-white border-2 border-slate-300 peer-checked:bg-gradient-to-tr peer-checked:from-indigo-600 peer-checked:to-violet-600 peer-checked:border-transparent transition-all flex items-center justify-center group-hover/check:border-indigo-400 peer-checked:shadow-lg peer-checked:shadow-indigo-500/40">
                                <CheckCircle2 size={18} className={`text-white transition-all duration-300 ${understands ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} />
                            </div>
                        </div>
                        <span className={`text-sm sm:text-base font-semibold leading-relaxed pt-0.5 transition-colors duration-300 ${understands ? 'text-indigo-950' : 'text-slate-600 group-hover/check:text-slate-900'}`}>
                            Je certifie avoir préparé ma <strong className="text-slate-900">Page Facebook</strong>, mon <strong className="text-slate-900">Instagram</strong> et mon <strong className="text-slate-900">WhatsApp</strong> pour lancer AdsFacile.
                        </span>
                    </label>
                </div>
            </div>

            {/* Action Area */}
            <div className="space-y-5 relative z-10 mt-12">
                <button
                    onClick={onReady}
                    disabled={!canConnect || isRedirecting}
                    className={`relative overflow-hidden group w-full px-8 py-5 text-white text-lg font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 ${canConnect || isRedirecting
                        ? 'bg-slate-900 shadow-[0_8px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_12px_25px_rgba(0,0,0,0.25)] hover:-translate-y-1'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    {/* Animated gradient background for active state */}
                    {(canConnect || isRedirecting) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[length:200%_auto] animate-gradient"></div>
                    )}

                    <div className="relative z-10 flex items-center gap-3">
                        {isRedirecting ? (
                            <>
                                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>Initialisation...</span>
                            </>
                        ) : canConnect ? (
                            <>
                                <span>Connecter Facebook Business</span>
                                <ArrowRight size={22} className="transform group-hover:translate-x-1.5 transition-transform duration-300" />
                            </>
                        ) : (
                            'Complétez les étapes pour continuer'
                        )}
                    </div>
                </button>

                {/* Progress helper text */}
                <div className={`transition-all duration-500 ${!canConnect ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none absolute'}`}>
                    <div className="flex items-center justify-center gap-2 py-2 px-5 bg-amber-50/80 border border-amber-200/60 rounded-full w-fit mx-auto shadow-sm">
                        <AlertCircle size={14} className="text-amber-600" />
                        <span className="text-xs font-bold text-amber-700 tracking-tight">Le bouton s'activera lorsque tout sera coché.</span>
                    </div>
                </div>
            </div>

            {/* Footer Trust Indicators */}
            <div className="mt-10 pt-6 border-t border-slate-100/80 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 relative z-10">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                    <ShieldCheck size={16} className="text-indigo-400" />
                    <span className="tracking-wide">100% SÉCURISÉ</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                    <Zap size={16} className="text-violet-400" />
                    <span className="tracking-wide">SYNCHRO IMMÉDIATE</span>
                </div>
            </div>
        </div>
    );
}