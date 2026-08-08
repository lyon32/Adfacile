/**
 * MessagingDestinationPicker — choix des applications de messagerie
 *
 * L'utilisateur peut cocher plusieurs applications : Facebook diffuse alors la
 * publicité vers celle où la personne est la plus susceptible de répondre.
 *
 * Instagram et WhatsApp exigent un compte relié à la Page. Plutôt que de
 * masquer ces options, on les montre désactivées avec la raison : l'utilisateur
 * découvre ce qu'il pourrait activer, et sait quoi faire pour y arriver.
 */

import { useEffect, useState } from 'react';
import api from '../../services/api';

const APPS = [
    {
        value: 'messenger',
        label: 'Messenger',
        icon: '💬',
        desc: 'Ouvrir une conversation Messenger'
    },
    {
        value: 'instagram',
        label: 'Instagram',
        icon: '📷',
        desc: 'Ouvrir une conversation Instagram',
        requires: 'instagram',
        missing: 'Aucun compte Instagram professionnel relié à votre Page.'
    },
    {
        value: 'whatsapp',
        label: 'WhatsApp',
        icon: '📱',
        desc: 'Ouvrir une conversation WhatsApp',
        requires: 'whatsapp',
        missing: 'Aucun numéro WhatsApp Business relié à votre Page.'
    }
];

export default function MessagingDestinationPicker({ selected = [], onChange }) {
    const [connections, setConnections] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let annule = false;

        api.get('/facebook/connections')
            .then(res => { if (!annule) setConnections(res.data.connections || {}); })
            .catch(() => { if (!annule) setConnections({}); })
            .finally(() => { if (!annule) setLoading(false); });

        return () => { annule = true; };
    }, []);

    const estDisponible = (app) => {
        if (!app.requires) return true;
        return Boolean(connections?.[app.requires]?.connected);
    };

    const basculer = (value) => {
        const suivant = selected.includes(value)
            ? selected.filter(v => v !== value)
            : [...selected, value];

        // Au moins une application doit rester cochée : un ensemble de
        // publicités de messagerie sans destination est refusé par Facebook.
        if (suivant.length === 0) return;
        onChange(suivant);
    };

    return (
        <div className="adset-field-group">
            <label className="adset-label">
                Applications de messagerie <span className="required">*</span>
            </label>

            <div className="messaging-apps">
                {APPS.map(app => {
                    const disponible = loading ? app.value === 'messenger' : estDisponible(app);
                    const coche = selected.includes(app.value);

                    return (
                        <div key={app.value}>
                            <label
                                className={`messaging-app ${coche ? 'active' : ''} ${disponible ? '' : 'disabled'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={coche}
                                    disabled={!disponible}
                                    onChange={() => basculer(app.value)}
                                    className="messaging-app-checkbox"
                                />
                                <span className="dest-icon">{app.icon}</span>
                                <span className="dest-content">
                                    <span className="dest-label">{app.label}</span>
                                    <span className="dest-desc">{app.desc}</span>
                                </span>
                            </label>

                            {!disponible && !loading && (
                                <p className="messaging-app-missing">{app.missing}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="adset-hint">
                {selected.length > 1
                    ? '💡 Facebook dirigera chaque personne vers l’application où elle répond le plus volontiers.'
                    : '💡 Cochez plusieurs applications pour laisser Facebook choisir la plus adaptée à chaque personne.'}
            </p>
        </div>
    );
}
