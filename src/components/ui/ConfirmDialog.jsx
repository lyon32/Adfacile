/**
 * ConfirmDialog — Boîte de confirmation applicative
 * Remplace window.confirm() : même palette, clavier accessible, état de chargement.
 */

import { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import '../../styles/ui-feedback.css';

const ConfirmDialog = ({
    open,
    title,
    message,
    hint,
    confirmLabel = 'Confirmer',
    loadingLabel = 'Traitement…',
    cancelLabel = 'Annuler',
    tone = 'danger',
    loading = false,
    onConfirm,
    onCancel
}) => {
    const confirmRef = useRef(null);

    useEffect(() => {
        if (!open) return;

        confirmRef.current?.focus();

        const handleKey = (e) => {
            if (e.key === 'Escape' && !loading) onCancel?.();
        };
        document.addEventListener('keydown', handleKey);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, loading, onCancel]);

    if (!open) return null;

    return (
        <div className="ui-dialog-overlay" role="presentation">
            <div
                className="ui-dialog-backdrop"
                onClick={() => !loading && onCancel?.()}
            />
            <div
                className="ui-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ui-dialog-title"
                aria-describedby="ui-dialog-message"
            >
                <div className={`ui-dialog-icon ui-dialog-icon--${tone}`}>
                    <AlertTriangle size={24} />
                </div>

                <h3 className="ui-dialog-title" id="ui-dialog-title">{title}</h3>
                <p className="ui-dialog-message" id="ui-dialog-message">{message}</p>
                {hint && <p className="ui-dialog-hint">{hint}</p>}

                <div className="ui-dialog-actions">
                    <button
                        type="button"
                        className="ui-dialog-btn ui-dialog-btn--ghost"
                        onClick={() => onCancel?.()}
                        disabled={loading}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        ref={confirmRef}
                        className={`ui-dialog-btn ui-dialog-btn--${tone}`}
                        onClick={() => onConfirm?.()}
                        disabled={loading}
                    >
                        {loading && <Loader2 size={15} className="ui-dialog-spinner" />}
                        {loading ? loadingLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
