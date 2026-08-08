import { useState } from 'react';
import { Check, ExternalLink, ArrowRight, Lock } from 'lucide-react';
import './FacebookPreConnectionChecklist.css';

/** Case à cocher partagée par les 3 étapes. */
function StepCheck({ checked, onChange, label }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={label}
            onClick={onChange}
            className="fbpc-check"
        >
            <Check size={13} strokeWidth={3} aria-hidden="true" />
        </button>
    );
}

/** Puce d'état d'une étape : Requis / Validé. */
function StatusPill({ done }) {
    return (
        <span className={`fbpc-pill${done ? ' is-done' : ''}`}>
            {done ? 'Validé' : 'Requis'}
        </span>
    );
}

export function FacebookPreConnectionChecklist({ onReady, isRedirecting }) {
    const [hasPage, setHasPage] = useState(false);
    const [isPageAlreadyCreated, setIsPageAlreadyCreated] = useState(false);
    const [hasIgWa, setHasIgWa] = useState(false);
    const [understands, setUnderstands] = useState(false);

    const pageDone = hasPage || isPageAlreadyCreated;
    const canConnect = pageDone && hasIgWa && understands;

    const togglePage = () => {
        const next = !pageDone;
        setHasPage(next);
        setIsPageAlreadyCreated(next && isPageAlreadyCreated);
    };

    const rail = [
        { label: 'Page Facebook professionnelle', done: pageDone },
        { label: 'Instagram et WhatsApp associés', done: hasIgWa },
        { label: 'Confirmation', done: understands },
    ];
    // Première étape non validée : c'est là que l'utilisateur en est.
    const currentIndex = rail.findIndex(s => !s.done);

    return (
        <div className="fbpc">
            <div className="fbpc-card">

                {/* ── Rail de progression ── */}
                <div className="fbpc-rail">
                    <span className="fbpc-rail-eyebrow">Avant de diffuser</span>
                    <h2 className="fbpc-rail-title">Trois vérifications, puis vous lancez.</h2>

                    <ol className="fbpc-rail-list">
                        {rail.map((step, i) => (
                            <li
                                key={step.label}
                                className={`fbpc-rail-item${step.done ? ' is-done' : ''}${i === currentIndex ? ' is-current' : ''}`}
                            >
                                <span className="fbpc-rail-dot" aria-hidden="true" />
                                {step.label}
                            </li>
                        ))}
                    </ol>

                    <div className="fbpc-rail-trust">
                        <span>Connexion chiffrée</span>
                        <span>Aucun mot de passe stocké</span>
                    </div>
                </div>

                {/* ── Étapes ── */}
                <div className="fbpc-steps">

                    {/* Étape 1 */}
                    <div className="fbpc-step">
                        <div className="fbpc-step-row">
                            <StepCheck checked={pageDone} onChange={togglePage} label="Page Facebook professionnelle" />
                            <div className="fbpc-step-body">
                                <div className="fbpc-step-head">
                                    <h3 className="fbpc-step-title">Page Facebook professionnelle</h3>
                                    <StatusPill done={pageDone} />
                                </div>
                                <p className="fbpc-step-desc">
                                    Vos annonces sont publiées au nom de cette Page. Sans elle, Facebook refuse la diffusion.
                                </p>
                                {!pageDone && (
                                    <div className="fbpc-actions">
                                        <button
                                            type="button"
                                            onClick={() => { setIsPageAlreadyCreated(true); setHasPage(true); }}
                                            className="fbpc-ghost"
                                        >
                                            J'ai déjà une Page
                                        </button>
                                        <a
                                            href="https://www.facebook.com/pages/create"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="fbpc-ghost"
                                        >
                                            Créer une Page
                                            <ExternalLink size={14} />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Étape 2 */}
                    <div className="fbpc-step">
                        <div className="fbpc-step-row">
                            <StepCheck checked={hasIgWa} onChange={() => setHasIgWa(!hasIgWa)} label="Instagram et WhatsApp associés" />
                            <div className="fbpc-step-body">
                                <div className="fbpc-step-head">
                                    <h3 className="fbpc-step-title">Instagram et WhatsApp associés</h3>
                                    <StatusPill done={hasIgWa} />
                                </div>
                                <p className="fbpc-step-desc">
                                    Une même annonce touche les trois réseaux. Vérifiez la liaison dans{' '}
                                    <strong>Paramètres de la Page → Comptes associés</strong>.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Étape 3 + action */}
                    <div className="fbpc-confirm">
                        <StepCheck
                            checked={understands}
                            onChange={() => setUnderstands(!understands)}
                            label="Je confirme que mes comptes sont prêts"
                        />
                        <span>Je confirme que ma Page, mon compte Instagram et mon WhatsApp sont prêts.</span>
                    </div>

                    <button
                        type="button"
                        onClick={onReady}
                        disabled={!canConnect || isRedirecting}
                        className="fbpc-cta"
                    >
                        {isRedirecting ? (
                            <>
                                <span className="fbpc-spinner" aria-hidden="true" />
                                Redirection vers Facebook…
                            </>
                        ) : canConnect ? (
                            <>
                                Connecter Facebook Business
                                <ArrowRight size={18} aria-hidden="true" />
                            </>
                        ) : (
                            <>
                                <Lock size={15} aria-hidden="true" />
                                Complétez les 3 étapes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
