/**
 * InfoTooltip — petit « ! » qui explique un terme au survol.
 *
 * Accessible : s'ouvre au survol, au focus clavier et au toucher ; se ferme avec
 * Échap ou en touchant ailleurs (le focus ouvre déjà : un clic « bascule » la
 * refermait aussitôt), reste ouverte quand le pointeur passe dessus (WCAG 1.4.13).
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import '../../styles/info-tooltip.css';

const InfoTooltip = ({ label, children }) => {
    const [open, setOpen] = useState(false);
    const id = useId();
    const ref = useRef(null);
    const bubbleRef = useRef(null);
    const [decalage, setDecalage] = useState(0);

    // La bulle est ancrée à l'icône ; sur un écran étroit elle dépasserait à
    // droite. On mesure à l'ouverture et on la décale pour qu'elle reste
    // entièrement visible.
    useLayoutEffect(() => {
        if (!open || !bubbleRef.current) {
            setDecalage(0);
            return;
        }
        const marge = 12;
        const { left, right } = bubbleRef.current.getBoundingClientRect();
        const enTrop = right - (window.innerWidth - marge);
        setDecalage(enTrop > 0 ? -Math.min(enTrop, left - marge) : 0);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const fermer = (e) => {
            if (e.type === 'keydown' && e.key !== 'Escape') return;
            if (e.type === 'pointerdown' && ref.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('keydown', fermer);
        document.addEventListener('pointerdown', fermer);
        return () => {
            document.removeEventListener('keydown', fermer);
            document.removeEventListener('pointerdown', fermer);
        };
    }, [open]);

    return (
        <span
            ref={ref}
            className="info-tooltip"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                className="info-tooltip-trigger"
                aria-label={label}
                aria-describedby={open ? id : undefined}
                aria-expanded={open}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={() => setOpen(true)}
            >
                <span aria-hidden="true" className="info-tooltip-mark">!</span>
            </button>
            {open && (
                <span
                    role="tooltip"
                    id={id}
                    ref={bubbleRef}
                    className="info-tooltip-bubble"
                    style={decalage ? { left: decalage } : undefined}
                >
                    {children}
                </span>
            )}
        </span>
    );
};

export default InfoTooltip;
