import { useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, AlertCircle, HelpCircle, ChevronRight, ArrowRight } from 'lucide-react';

export function FacebookPreConnectionChecklist({ onReady, isRedirecting }) {
    const [hasPage, setHasPage] = useState(false);
    const [isPageAlreadyCreated, setIsPageAlreadyCreated] = useState(false);
    const [hasIgWa, setHasIgWa] = useState(false);
    const [understands, setUnderstands] = useState(false);

    const canConnect = (hasPage || isPageAlreadyCreated) && hasIgWa && understands;

    return (
        <div className="bg-white rounded-2xl shadow-2xl shadow-indigo-100/40 border border-gray-100 p-8 max-w-2xl mx-auto mb-12 transition-all hover:shadow-indigo-200/50">
            {/* Header section with subtle background */}
            <div className="mb-10 text-center relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-indigo-50 rounded-full blur-2xl opacity-60 -z-10"></div>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-600 mb-6 shadow-sm ring-1 ring-indigo-200/50">
                    <AlertCircle size={40} strokeWidth={1.5} />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">
                    Préparation Facebook Business
                </h2>
                <div className="flex items-center justify-center gap-2 text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <p className="text-base font-medium">Requis pour lancer vos premières publicités</p>
                </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-6 mb-10">

                {/* Step 1: Facebook Page */}
                <div className={`group rounded-2xl border p-6 transition-all duration-300 ${hasPage || isPageAlreadyCreated
                    ? 'bg-emerald-50/30 border-emerald-100 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 shadow-sm'}`}>

                    <div className="flex items-start gap-4">
                        <button
                            onClick={() => setHasPage(!hasPage)}
                            className="flex-shrink-0 mt-1 transition-transform active:scale-90"
                        >
                            {hasPage || isPageAlreadyCreated ? (
                                <div className="bg-emerald-500 rounded-full p-1 shadow-md shadow-emerald-200">
                                    <CheckCircle2 className="text-white" size={22} />
                                </div>
                            ) : (
                                <Circle className="text-slate-300 group-hover:text-indigo-400" size={26} strokeWidth={1.5} />
                            )}
                        </button>

                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-bold text-slate-800 leading-tight">
                                    1. Page Facebook de l'entreprise
                                </h3>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${hasPage || isPageAlreadyCreated ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                    {hasPage || isPageAlreadyCreated ? 'Prêt' : 'Obligatoire'}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed mb-5">
                                Votre marque doit avoir une présence officielle.
                                <span className="block mt-1 font-medium text-indigo-500/80">C'est le point de départ de toute publicité.</span>
                            </p>

                            {/* Detailed options only shown if not completed */}
                            {!(hasPage || isPageAlreadyCreated) && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {/* Option A: Quick bypass */}
                                    <button
                                        onClick={() => {
                                            setIsPageAlreadyCreated(true);
                                            setHasPage(true);
                                        }}
                                        className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center justify-between group/opt shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center group-hover/opt:border-indigo-400">
                                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 opacity-0 group-hover/opt:opacity-100 transition-opacity"></div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">J'en ai déjà une pour mon business</span>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300 group-hover/opt:text-indigo-400 transform group-hover/opt:translate-x-1 transition-all" />
                                    </button>

                                    {/* Small divider */}
                                    <div className="flex items-center gap-4 px-2">
                                        <div className="h-px bg-slate-100 flex-1"></div>
                                        <span className="text-[10px] font-black text-slate-300 tracking-[0.2em]">OU</span>
                                        <div className="h-px bg-slate-100 flex-1"></div>
                                    </div>

                                    {/* Option B: Instructions to create one */}
                                    <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-5">
                                        <div className="flex items-center gap-2 text-slate-700 font-bold mb-3 text-sm">
                                            <HelpCircle size={16} className="text-indigo-400" />
                                            <span>Je n'en ai pas encore</span>
                                        </div>
                                        <ol className="text-xs text-slate-500 space-y-2.5 ml-4 list-decimal marker:font-bold marker:text-indigo-400 mb-6">
                                            <li>Accédez au lien de création ci-dessous</li>
                                            <li>Sélectionnez le type <strong>"Entreprise ou marque"</strong></li>
                                            <li>Donnez-lui le nom exact de votre activité</li>
                                            <li>Ajoutez une photo de profil et de couverture</li>
                                        </ol>

                                        <a
                                            href="https://www.facebook.com/pages/create"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group relative inline-flex items-center justify-center w-full px-5 py-3 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 transition-all shadow-md active:scale-[0.98]"
                                        >
                                            Ouvrir l'assistant de création Facebook
                                            <ExternalLink size={14} className="ml-2 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                        </a>
                                        <p className="text-[11px] text-slate-400 mt-3 flex items-center justify-center gap-1.5 italic">
                                            Revenez cocher l'étape ici une fois terminé
                                        </p>
                                    </div>
                                </div>
                            )}

                            {(hasPage || isPageAlreadyCreated) && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mt-2 flex items-center gap-3 animate-in zoom-in-95 duration-200">
                                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <CheckCircle2 size={14} className="text-emerald-600" />
                                    </div>
                                    <p className="text-xs text-emerald-800 font-bold">
                                        {isPageAlreadyCreated ? "Configuration validée : Page existante utilisée." : "Félicitations ! Votre page est prête."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Step 2: Instagram/WhatsApp */}
                <div className={`group rounded-2xl border p-6 transition-all duration-300 ${hasIgWa
                    ? 'bg-emerald-50/30 border-emerald-100 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 shadow-sm'}`}>

                    <div className="flex items-start gap-4">
                        <button
                            onClick={() => setHasIgWa(!hasIgWa)}
                            className="flex-shrink-0 mt-1 transition-transform active:scale-90"
                        >
                            {hasIgWa ? (
                                <div className="bg-emerald-500 rounded-full p-1 shadow-md shadow-emerald-200">
                                    <CheckCircle2 className="text-white" size={22} />
                                </div>
                            ) : (
                                <Circle className="text-slate-300 group-hover:text-indigo-400" size={26} strokeWidth={1.5} />
                            )}
                        </button>

                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-bold text-slate-800 leading-tight">
                                    2. Comptes WhatsApp & Instagram
                                </h3>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${hasIgWa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                    {hasIgWa ? 'Liaison OK' : 'Décoché'}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed mb-4">
                                Pour multiplier vos résultats, vos comptes doivent être liés à votre Page Facebook.
                            </p>

                            {!hasIgWa && (
                                <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 animate-in fade-in duration-300">
                                    <p className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-tighter">Comment faire ?</p>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3 text-[13px] text-slate-600 font-medium bg-white/80 p-2.5 rounded-lg border border-slate-100 shadow-sm">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                            <span><strong>Paramètres</strong> {`>`} <strong>Comptes associés</strong></span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 pl-2">Vérifiez que vos comptes y figurent bien puis cochez l'étape ici.</p>
                                    </div>
                                </div>
                            )}

                            {hasIgWa && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3 animate-in zoom-in-95 duration-200">
                                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <CheckCircle2 size={14} className="text-emerald-600" />
                                    </div>
                                    <p className="text-xs text-emerald-800 font-bold">Liaison confirmée avec succès.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Final Confirmation (Certification) */}
                <div className={`p-4 rounded-2xl border-2 transition-all duration-300 ${understands ? 'border-indigo-100 bg-indigo-50/30' : 'border-dashed border-slate-200 bg-slate-50/30'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none">
                        <div className="relative mt-1">
                            <input
                                type="checkbox"
                                checked={understands}
                                onChange={(e) => setUnderstands(e.target.checked)}
                                className="peer sr-only"
                            />
                            <div className="w-6 h-6 rounded-lg bg-white border-2 border-slate-200 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center group-hover:border-indigo-300">
                                <CheckCircle2 size={16} className={`text-white transition-transform duration-200 ${understands ? 'scale-100' : 'scale-0'}`} />
                            </div>
                        </div>
                        <span className="text-sm font-medium text-slate-700 leading-relaxed pt-0.5">
                            Je confirme que ma <strong>Page</strong>, mon compte <strong>Instagram</strong> et mon numéro <strong>WhatsApp</strong> sont prêts à être synchronisés avec AdsFacile.
                        </span>
                    </label>
                </div>
            </div>

            {/* Action buttons with enhanced sizing */}
            <div className="space-y-4">
                <button
                    onClick={onReady}
                    disabled={!canConnect || isRedirecting}
                    className={`group w-full px-8 py-5 text-white text-lg font-black rounded-2xl transition-all shadow-xl shadow-indigo-200/40 active:scale-[0.97] flex items-center justify-center gap-3 ${canConnect || isRedirecting
                        ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-600/20'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed grayscale'
                        }`}
                >
                    {isRedirecting ? (
                        <>
                            <div className="w-6 h-6 border-3 border-white/40 border-t-white rounded-full animate-spin"></div>
                            <span>Traitement en cours...</span>
                        </>
                    ) : canConnect ? (
                        <>
                            <span>Lancer la connexion Facebook Business</span>
                            <ArrowRight size={22} className="group-hover:translate-x-1.5 transition-transform" />
                        </>
                    ) : (
                        'Action bloquée : Étapes manquantes'
                    )}
                </button>

                {!canConnect && (
                    <div className="flex items-center justify-center gap-2 py-2 px-4 bg-slate-50 rounded-full border border-slate-100 w-fit mx-auto transition-all animate-bounce-subtle">
                        <AlertCircle size={14} className="text-amber-500" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Activez le bouton en complétant les étapes</span>
                    </div>
                )}
            </div>

            {/* Footer help with cleaner style */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    <span>Simple & Sécurisé</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    <span>Synchronisation 24/7</span>
                </div>
            </div>
        </div>
    );
}