/**
 * Toasts — Notifications discrètes en bas à droite
 * Remplace alert() : succès, erreur, information.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import '../../styles/ui-feedback.css';

const ICONS = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info
};

/** Gestion de la file de toasts (auto-fermeture après 4,5 s). */
export const useToasts = () => {
    const [toasts, setToasts] = useState([]);
    const timers = useRef([]);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((type, message) => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setToasts(prev => [...prev, { id, type, message }]);
        timers.current.push(setTimeout(() => dismissToast(id), 4500));
    }, [dismissToast]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    return { toasts, showToast, dismissToast };
};

const ToastStack = ({ toasts, onDismiss }) => {
    if (!toasts.length) return null;

    return (
        <div className="ui-toast-stack" role="status" aria-live="polite">
            {toasts.map(toast => {
                const Icon = ICONS[toast.type] || Info;
                return (
                    <div key={toast.id} className={`ui-toast ui-toast--${toast.type}`}>
                        <Icon size={18} className="ui-toast-icon" />
                        <span className="ui-toast-message">{toast.message}</span>
                        <button
                            type="button"
                            className="ui-toast-close"
                            onClick={() => onDismiss(toast.id)}
                            aria-label="Fermer la notification"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default ToastStack;
