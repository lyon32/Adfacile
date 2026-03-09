import { useState } from 'react';
import { CheckCircle2, ExternalLink, Shield, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import api from '../../services/api';

/*
 * ─── INLINE STYLES (CSS-in-JS for animations not possible in Tailwind) ───
 */
const shimmerKeyframes = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes pulse-ring {
  0% { transform: scale(0.9); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.7; }
  100% { transform: scale(0.9); opacity: 1; }
}
@keyframes float-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export function SetupInstructions({ hasPage, connections, onRefresh }) {
    const [permissions, setPermissions] = useState(null);
    const [loadingPerms, setLoadingPerms] = useState(false);
    const [refreshState, setRefreshState] = useState('idle'); // idle | loading | success | error

    if (hasPage && connections?.instagram?.connected) {
        return null;
    }

    async function checkPermissions() {
        setLoadingPerms(true);
        try {
            const res = await api.get('/facebook/permissions');
            setPermissions(res.data.permissions);
        } catch (err) {
            console.error('Error fetching permissions:', err);
            setPermissions([]);
        } finally {
            setLoadingPerms(false);
        }
    }

    const steps = [
        { done: !!hasPage },
        { done: !!connections?.instagram?.connected }
    ];
    const completedSteps = steps.filter(s => s.done).length;
    const progressPercent = Math.round((completedSteps / steps.length) * 100);

    // SVG progress ring
    const ringSize = 44;
    const strokeWidth = 3.5;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    return (
        <>
            <style>{shimmerKeyframes}</style>
            <div
                style={{ animation: 'float-in 0.4s ease-out' }}
                className="rounded-2xl overflow-hidden mb-6 bg-white shadow-xl shadow-indigo-100/40 border border-gray-200/50"
            >
                {/* ═══════ HEADER ═══════ */}
                <div className="relative overflow-hidden">
                    {/* Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#0f172a]" />

                    {/* Animated shimmer accent */}
                    <div
                        className="absolute inset-0 opacity-[0.07]"
                        style={{
                            backgroundImage: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 3s ease-in-out infinite'
                        }}
                    />

                    {/* Grid pattern */}
                    <div
                        className="absolute inset-0 opacity-[0.04]"
                        style={{
                            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                            backgroundSize: '24px 24px'
                        }}
                    />

                    {/* Glow orbs */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl" />
                    <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-500/15 rounded-full blur-3xl" />

                    {/* Content */}
                    <div className="relative z-10 px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                                <Sparkles className="text-indigo-300" size={20} />
                            </div>
                            <div>
                                <h3 className="text-[15px] font-bold text-white tracking-tight">
                                    Configuration du compte
                                </h3>
                                <p className="text-[11px] text-indigo-300/70 mt-0.5 font-medium">
                                    Complétez ces étapes pour lancer vos publicités
                                </p>
                            </div>
                        </div>

                        {/* Circular progress */}
                        <div className="flex items-center gap-3">
                            <div className="relative" style={{ width: ringSize, height: ringSize }}>
                                {/* Track */}
                                <svg className="absolute inset-0 -rotate-90" width={ringSize} height={ringSize}>
                                    <circle
                                        cx={ringSize / 2} cy={ringSize / 2} r={radius}
                                        fill="none" stroke="rgba(255,255,255,0.08)"
                                        strokeWidth={strokeWidth}
                                    />
                                    <circle
                                        cx={ringSize / 2} cy={ringSize / 2} r={radius}
                                        fill="none"
                                        stroke="url(#progressGrad)"
                                        strokeWidth={strokeWidth}
                                        strokeLinecap="round"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                                    />
                                    <defs>
                                        <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#818cf8" />
                                            <stop offset="100%" stopColor="#34d399" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                {/* Center text */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-[11px] font-bold text-white">{progressPercent}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════ STEPS ═══════ */}
                <div className="px-6 py-5">
                    {/* Vertical timeline */}
                    <div className="relative space-y-0">
                        {/* Step 1: Facebook Page */}
                        <TimelineStep
                            number={1}
                            title="Page Facebook"
                            completed={hasPage}
                            isLast={!hasPage}
                            description={hasPage ? "Connectée" : "Nécessaire pour les publicités"}
                            color="blue"
                        >
                            {!hasPage && (
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <ActionCard
                                        label="Page existante"
                                        sublabel="Connecter via Business Manager"
                                        href="https://business.facebook.com/settings/pages"
                                        color="blue"
                                    />
                                    <ActionCard
                                        label="Nouvelle Page"
                                        sublabel="Créer pour votre entreprise"
                                        href="https://www.facebook.com/pages/create"
                                        color="emerald"
                                    />
                                </div>
                            )}
                        </TimelineStep>

                        {/* Step 2: Instagram */}
                        {hasPage && (
                            <TimelineStep
                                number={2}
                                title="Instagram"
                                tag="Optionnel"
                                completed={connections?.instagram?.connected}
                                isLast={true}
                                description={
                                    connections?.instagram?.connected
                                        ? `@${connections.instagram.username}`
                                        : "Feed, Stories, Reels"
                                }
                                color="pink"
                                icon="📷"
                            >
                                {!connections?.instagram?.connected && (
                                    <div className="mt-3 space-y-2.5">
                                        <a
                                            href="https://business.facebook.com/latest/settings/connected_accounts"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all hover:-translate-y-0.5"
                                            style={{ background: 'linear-gradient(135deg, #9333ea, #ec4899)' }}
                                        >
                                            Connecter Instagram
                                            <ExternalLink size={13} />
                                        </a>

                                        <CollapsibleGuide title="Guide de connexion">
                                            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                                                <li>Ouvrez <strong>Meta Business Suite → Paramètres</strong></li>
                                                <li>Cliquez <strong>Comptes connectés</strong></li>
                                                <li>Sélectionnez <strong>Instagram</strong> et connectez-vous</li>
                                                <li>Autorisez la liaison avec votre Page</li>
                                            </ol>
                                            <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3 border border-amber-100">
                                                ⚠️ Compte Instagram <strong>Business</strong> requis — convertissez dans Instagram : Paramètres → Compte → Passer au professionnel
                                            </p>
                                        </CollapsibleGuide>
                                    </div>
                                )}
                            </TimelineStep>
                        )}
                    </div>
                </div>

                {/* ═══════ FOOTER ═══════ */}
                {hasPage && (
                    <div className="px-6 pb-5">
                        <div className="flex items-center gap-3 pt-4 border-t border-gray-100/80">
                            <button
                                onClick={async () => {
                                    setRefreshState('loading');
                                    try {
                                        const res = await api.post('/facebook/refresh-connections');
                                        setRefreshState('success');
                                        if (onRefresh) onRefresh(res.data.connections);
                                        setTimeout(() => setRefreshState('idle'), 2500);
                                    } catch (err) {
                                        console.error('Refresh error:', err);
                                        setRefreshState('error');
                                        setTimeout(() => setRefreshState('idle'), 3000);
                                    }
                                }}
                                disabled={refreshState === 'loading'}
                                className={`text-xs font-semibold transition-colors ${refreshState === 'success'
                                    ? 'text-emerald-600'
                                    : refreshState === 'error'
                                        ? 'text-red-500'
                                        : 'text-indigo-600 hover:text-indigo-700 hover:underline underline-offset-2'
                                    } disabled:opacity-60`}
                            >
                                {refreshState === 'loading' && '⏳ Actualisation...'}
                                {refreshState === 'success' && '✅ Connexions mises à jour'}
                                {refreshState === 'error' && '❌ Erreur — réessayez'}
                                {refreshState === 'idle' && '↻ Actualiser les connexions'}
                            </button>

                            <div className="w-px h-3 bg-gray-200" />

                            <button
                                onClick={checkPermissions}
                                disabled={loadingPerms}
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all disabled:opacity-50"
                            >
                                {loadingPerms ? <Loader2 size={11} className="animate-spin" /> : <Shield size={11} />}
                                Permissions
                            </button>
                        </div>

                        {/* Permissions panel */}
                        {permissions && (
                            <div className="mt-3 rounded-xl bg-gray-50/80 border border-gray-100 p-4" style={{ animation: 'float-in 0.3s ease-out' }}>
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    Permissions Facebook
                                </p>
                                {permissions.length === 0 ? (
                                    <p className="text-xs text-red-500">Aucune permission — reconnectez Facebook.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {permissions.map((p, i) => (
                                            <span
                                                key={i}
                                                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border ${p.status === 'granted'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-red-50 text-red-600 border-red-200'
                                                    }`}
                                            >
                                                {p.status === 'granted' ? '✓' : '✗'}
                                                {p.permission}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {permissions.length > 0 &&
                                    !permissions.find(p => p.permission === 'instagram_basic' && p.status === 'granted') &&
                                    !permissions.find(p => p.permission === 'instagram_manage_insights' && p.status === 'granted') && (
                                        <p className="mt-2.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                                            ⚠️ Permissions Instagram manquantes — reconnectez Facebook.
                                        </p>
                                    )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

/* ─── Timeline Step ─── */
function TimelineStep({ number, title, tag, completed, isLast, description, children, color = 'blue', icon }) {
    const colors = {
        blue: { ring: 'ring-blue-200', dot: 'bg-blue-500', line: 'bg-blue-200' },
        pink: { ring: 'ring-pink-200', dot: 'bg-pink-500', line: 'bg-pink-200' },
        green: { ring: 'ring-emerald-200', dot: 'bg-emerald-500', line: 'bg-emerald-200' }
    };
    const c = colors[color] || colors.blue;

    return (
        <div className="relative flex gap-4 pb-5 last:pb-0">
            {/* Timeline line */}
            {!isLast && (
                <div
                    className={`absolute left-[17px] top-10 bottom-0 w-[2px] ${completed ? 'bg-emerald-300' : 'bg-gray-200'
                        }`}
                />
            )}

            {/* Node */}
            <div className="relative z-10 flex-shrink-0">
                {completed ? (
                    <div className="w-[36px] h-[36px] rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
                        <CheckCircle2 className="text-white" size={18} />
                    </div>
                ) : (
                    <div className="w-[36px] h-[36px] rounded-xl bg-white border-2 border-gray-200 flex items-center justify-center text-sm font-bold text-gray-400 shadow-sm">
                        {icon || number}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-gray-900">{title}</h4>
                    {tag && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200/60">
                            {tag}
                        </span>
                    )}
                </div>
                <p className={`text-xs ${completed ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                    {completed ? '✓ ' : ''}{description}
                </p>
                {children}
            </div>
        </div>
    );
}

/* ─── Action Card (for Page step) ─── */
function ActionCard({ label, sublabel, href, color = 'blue' }) {
    const colorClasses = {
        blue: 'hover:border-blue-300 hover:bg-blue-50/50',
        emerald: 'hover:border-emerald-300 hover:bg-emerald-50/50'
    };
    const btnClasses = {
        blue: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20 hover:shadow-blue-500/30',
        emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 hover:shadow-emerald-500/30'
    };

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`group block rounded-xl p-3.5 border border-gray-200/80 bg-gray-50/50 transition-all ${colorClasses[color]}`}
        >
            <p className="text-xs font-bold text-gray-900 mb-0.5">{label}</p>
            <p className="text-[11px] text-gray-400 mb-2.5">{sublabel}</p>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg shadow-md transition-all group-hover:-translate-y-0.5 ${btnClasses[color]}`}>
                Ouvrir <ExternalLink size={10} />
            </span>
        </a>
    );
}

/* ─── Collapsible Guide ─── */
function CollapsibleGuide({ title, children }) {
    return (
        <details className="group">
            <summary className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 cursor-pointer hover:text-indigo-500 transition-colors select-none">
                <ChevronDown size={12} className="transition-transform duration-200 group-open:rotate-180" />
                {title}
            </summary>
            <div
                className="mt-2 bg-gray-50/80 rounded-xl p-3.5 border border-gray-100"
                style={{ animation: 'float-in 0.25s ease-out' }}
            >
                {children}
            </div>
        </details>
    );
}
