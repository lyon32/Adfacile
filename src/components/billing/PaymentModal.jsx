/**
 * PaymentModal — Paiement Mobile Money via SasPay (multi-pays)
 * AdsFacile Frontend
 *
 * 3 étapes : Récapitulatif → Pays, réseau, numéro → Confirmation/Attente
 *
 * Les pays, réseaux, frais et codes OTP viennent du backend
 * (/billing/payment-networks), lui-même alimenté par SasPay : aucun réseau
 * n'est codé en dur. Frais payés par le client, affichés avant de payer.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    X as XIcon, ArrowRight, Phone, Loader2,
    CheckCircle2, AlertTriangle, Shield, Info, Globe, ExternalLink
} from 'lucide-react';
import api from '../../services/api';

const formatMontant = (n, devise) => `${Number(n || 0).toLocaleString('fr-FR')} ${devise === 'XAF' || devise === 'XOF' ? 'FCFA' : devise}`;

const PaymentModal = ({ plan, onClose, onSuccess, onRefreshUser }) => {
    const [step, setStep] = useState(1);
    const [pays, setPays] = useState(null); // null = chargement
    const [chargementErreur, setChargementErreur] = useState('');
    const [countryCode, setCountryCode] = useState('');
    const [networkCode, setNetworkCode] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [paymentData, setPaymentData] = useState(null);
    const [status, setStatus] = useState('pending'); // pending | successful | failed | timeout | activation_failed
    const [timer, setTimer] = useState(300);
    const [smsOtp, setSmsOtp] = useState('');
    const [smsOtpOuvert, setSmsOtpOuvert] = useState(false);
    const [smsOtpErreur, setSmsOtpErreur] = useState('');
    const intervalRef = useRef(null);
    const pollingRef = useRef(null);

    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // ─── Pays et réseaux disponibles (frais calculés pour ce plan) ───
    useEffect(() => {
        if (!plan) return;
        let annule = false;
        api.get('/billing/payment-networks', { params: { plan: plan.id } })
            .then(res => {
                if (annule) return;
                const liste = res.data.data?.countries || [];
                setPays(liste);
                const defaut = liste.find(p => p.code === 'CM') || liste[0];
                if (defaut) {
                    setCountryCode(defaut.code);
                    setNetworkCode(defaut.networks[0]?.code || '');
                }
            })
            .catch(err => {
                if (annule) return;
                setPays([]);
                setChargementErreur(err.response?.data?.message || 'Impossible de charger les moyens de paiement.');
            });
        return () => { annule = true; };
    }, [plan]);

    const paysChoisi = useMemo(() => (pays || []).find(p => p.code === countryCode) || null, [pays, countryCode]);
    const reseau = useMemo(() => paysChoisi?.networks.find(n => n.code === networkCode) || null, [paysChoisi, networkCode]);

    const choisirPays = (code) => {
        setCountryCode(code);
        const p = (pays || []).find(x => x.code === code);
        setNetworkCode(p?.networks[0]?.code || '');
        setOtp('');
        setError('');
    };

    // ─── Initier le paiement ───
    const handlePay = async () => {
        const cleaned = phone.replace(/[^\d+]/g, '');
        if (cleaned.replace('+', '').length < 8) {
            setPhoneError('Numéro trop court');
            return;
        }
        if (reseau?.otp_required && !otp.trim()) {
            setError('Saisissez le code de paiement obtenu sur votre téléphone.');
            return;
        }
        setPhoneError('');
        setLoading(true);
        setError('');

        try {
            const res = await api.post('/billing/upgrade', {
                target_plan: plan.id,
                country: countryCode,
                network: networkCode,
                phone: cleaned,
                otp: reseau?.otp_required ? otp.trim() : undefined
            });

            if (res.data.success) {
                const data = res.data.data;
                setPaymentData(data);
                setStep(3);
                // Certains réseaux (Wave, Orange Money…) paient sur une page
                // SasPay : on l'ouvre dans un nouvel onglet et on continue de
                // vérifier le statut ici.
                if (data.checkout_url) window.open(data.checkout_url, '_blank', 'noopener');
                startPolling(data.reference);
                startTimer();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors du paiement');
        } finally {
            setLoading(false);
        }
    };

    const terminer = async (nouveau) => {
        clearInterval(pollingRef.current);
        clearInterval(intervalRef.current);
        setStatus(nouveau);
        if (nouveau === 'successful') {
            if (onRefreshUser) {
                try { await onRefreshUser(); } catch (e) { console.error('refreshUser error:', e); }
            }
            if (onSuccess) onSuccess(plan);
        }
    };

    // ─── Vérification du statut toutes les 3 s ───
    const startPolling = (reference) => {
        pollingRef.current = setInterval(async () => {
            try {
                const res = await api.get('/billing/payment/status', { params: { reference } });
                const nouveau = res.data.data?.status;
                if (['successful', 'failed', 'activation_failed'].includes(nouveau)) await terminer(nouveau);
            } catch (err) {
                console.error('Status check error:', err);
            }
        }, 3000);
    };

    // ─── Code reçu par SMS après la demande (certains réseaux) ───
    const envoyerSmsOtp = async () => {
        if (!smsOtp.trim()) return;
        setSmsOtpErreur('');
        try {
            const res = await api.post('/billing/payment/confirm-otp', { reference: paymentData.reference, otp: smsOtp.trim() });
            const nouveau = res.data.data?.status;
            if (['successful', 'failed', 'activation_failed'].includes(nouveau)) await terminer(nouveau);
            else setSmsOtpOuvert(false);
        } catch (err) {
            setSmsOtpErreur(err.response?.data?.message || 'Code refusé');
        }
    };

    const startTimer = () => {
        setTimer(300);
        intervalRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    clearInterval(pollingRef.current);
                    setStatus('timeout');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const recommencer = () => {
        setStep(2);
        setStatus('pending');
        setPaymentData(null);
        setSmsOtp('');
        setSmsOtpOuvert(false);
    };

    const formatTimer = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    if (!plan) return null;

    // Hors FCFA, le prix part en XAF et SasPay convertit : on affiche donc le
    // montant en FCFA, et les frais (calculés par SasPay) ne sont pas connus.
    const devise = reseau?.amount_currency || paysChoisi?.currency || 'XAF';
    const totalAffiche = reseau?.total ?? reseau?.amount ?? plan.price;

    return (
        <div className="pm-backdrop" onClick={onClose}>
            <div className="pm-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="pm-header">
                    <h3>
                        {step === 1 && 'Récapitulatif'}
                        {step === 2 && 'Mode de paiement'}
                        {step === 3 && (
                            status === 'successful' ? 'Paiement confirmé' :
                                status === 'failed' ? 'Paiement échoué' :
                                    status === 'timeout' ? 'Délai expiré' :
                                        status === 'activation_failed' ? 'Paiement reçu' :
                                            'En attente de confirmation…'
                        )}
                    </h3>
                    <button className="pm-close" onClick={onClose} aria-label="Fermer">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="pm-steps">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`pm-step ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
                            <span>{s}</span>
                        </div>
                    ))}
                </div>

                <div className="pm-body">
                    {/* ═══ ÉTAPE 1 : Récapitulatif ═══ */}
                    {step === 1 && (
                        <div className="pm-recap">
                            <div className="pm-plan-card">
                                <h4>{plan.name}</h4>
                                <div className="pm-plan-price">
                                    <span className="pm-amount">{plan.price.toLocaleString('fr-FR')}</span>
                                    <span className="pm-currency">FCFA/{plan.period}</span>
                                </div>
                            </div>

                            <ul className="pm-features-list">
                                {plan.features.slice(0, 5).map((f, i) => (
                                    <li key={i}><CheckCircle2 size={14} /> {f}</li>
                                ))}
                            </ul>

                            <button className="pm-btn primary" onClick={() => setStep(2)}>
                                Continuer vers le paiement
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    )}

                    {/* ═══ ÉTAPE 2 : Pays, réseau, numéro ═══ */}
                    {step === 2 && (
                        <div className="pm-payment">
                            {pays === null && (
                                <p className="pm-loading-line"><Loader2 size={16} className="pm-spin" /> Chargement des moyens de paiement…</p>
                            )}

                            {pays !== null && pays.length === 0 && (
                                <div className="pm-error-box">
                                    <AlertTriangle size={16} />
                                    {chargementErreur || 'Aucun moyen de paiement disponible pour le moment.'}
                                </div>
                            )}

                            {pays && pays.length > 0 && (
                                <>
                                    <div className="pm-field">
                                        <label htmlFor="pm-country"><Globe size={14} /> Pays</label>
                                        <div className="pm-phone-input">
                                            <select id="pm-country" value={countryCode} onChange={e => choisirPays(e.target.value)}>
                                                {pays.map(p => (
                                                    <option key={p.code} value={p.code}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="pm-methods" role="radiogroup" aria-label="Réseau de paiement">
                                        {paysChoisi?.networks.map(n => (
                                            <button
                                                key={n.code}
                                                type="button"
                                                role="radio"
                                                aria-checked={networkCode === n.code}
                                                className={`pm-method ${networkCode === n.code ? 'active' : ''}`}
                                                onClick={() => { setNetworkCode(n.code); setOtp(''); setError(''); }}
                                            >
                                                <span>{n.name}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="pm-field">
                                        <label htmlFor="pm-phone"><Phone size={14} /> Numéro Mobile Money</label>
                                        <div className="pm-phone-input">
                                            <input
                                                id="pm-phone"
                                                type="tel"
                                                inputMode="tel"
                                                autoComplete="tel"
                                                value={phone}
                                                onChange={e => { setPhone(e.target.value.replace(/[^\d+\s]/g, '').slice(0, 18)); setPhoneError(''); }}
                                                placeholder="Avec l’indicatif, ex. +237 6 99 00 00 00"
                                            />
                                        </div>
                                        {phoneError && <span className="pm-error">{phoneError}</span>}
                                    </div>

                                    {reseau?.otp_required && (
                                        <div className="pm-field">
                                            <label htmlFor="pm-otp"><Info size={14} /> Code de paiement</label>
                                            <p className="pm-hint">{reseau.otp_instructions}</p>
                                            <div className="pm-phone-input">
                                                <input id="pm-otp" type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value.slice(0, 12))} />
                                            </div>
                                        </div>
                                    )}

                                    {reseau && (
                                        <div className="pm-fee-recap">
                                            <span>Abonnement {plan.name}</span><span>{formatMontant(reseau.amount, devise)}</span>
                                            <span>Frais Mobile Money</span>
                                            <span>{reseau.fee === null ? 'Calculés par SasPay' : formatMontant(reseau.fee, devise)}</span>
                                            {reseau.total !== null && (
                                                <><strong>Total débité</strong><strong>{formatMontant(reseau.total, devise)}</strong></>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {error && (
                                <div className="pm-error-box">
                                    <AlertTriangle size={16} />
                                    {error}
                                </div>
                            )}

                            <div className="pm-secure">
                                <Shield size={14} />
                                <span>Paiement sécurisé par SasPay</span>
                            </div>

                            <button
                                className="pm-btn primary"
                                onClick={handlePay}
                                disabled={loading || !reseau}
                            >
                                {loading
                                    ? <><Loader2 size={16} className="pm-spin" /> Traitement…</>
                                    : <>Payer {formatMontant(totalAffiche, devise)}{reseau && reseau.fee === null ? ' + frais' : ''}</>}
                            </button>

                            <button className="pm-btn secondary" onClick={() => setStep(1)}>
                                ← Retour
                            </button>
                        </div>
                    )}

                    {/* ═══ ÉTAPE 3 : Confirmation / attente ═══ */}
                    {step === 3 && (
                        <div className="pm-confirm">
                            {status === 'pending' && (
                                <>
                                    <div className="pm-waiting">
                                        <Loader2 size={48} className="pm-spin" />
                                    </div>
                                    <h4>En attente de confirmation…</h4>
                                    {paymentData?.checkout_url ? (
                                        <p>
                                            Terminez le paiement de <strong>{formatMontant(paymentData.total ?? paymentData.amount, paymentData.currency)}</strong> sur la page sécurisée.{' '}
                                            <a href={paymentData.checkout_url} target="_blank" rel="noopener noreferrer">
                                                Ouvrir la page de paiement <ExternalLink size={12} />
                                            </a>
                                        </p>
                                    ) : (
                                        <p>Validez le paiement de <strong>{formatMontant(paymentData?.total ?? paymentData?.amount, paymentData?.currency)}</strong> sur votre téléphone.</p>
                                    )}
                                    <div className="pm-timer">{formatTimer(timer)}</div>
                                    {paymentData && <p className="pm-ref">Réf : {paymentData.reference}</p>}

                                    {!smsOtpOuvert ? (
                                        <button className="pm-btn secondary" onClick={() => setSmsOtpOuvert(true)}>
                                            J’ai reçu un code par SMS
                                        </button>
                                    ) : (
                                        <div className="pm-field">
                                            <label htmlFor="pm-sms-otp">Code reçu par SMS</label>
                                            <div className="pm-phone-input">
                                                <input id="pm-sms-otp" type="text" inputMode="numeric" value={smsOtp} onChange={e => setSmsOtp(e.target.value.slice(0, 12))} />
                                            </div>
                                            {smsOtpErreur && <span className="pm-error">{smsOtpErreur}</span>}
                                            <button className="pm-btn primary" onClick={envoyerSmsOtp}>Valider le code</button>
                                        </div>
                                    )}

                                    {paymentData?.sandbox_mode && (
                                        <div className="pm-sandbox-badge">Mode test SasPay — aucun argent réel n’est débité</div>
                                    )}
                                </>
                            )}

                            {status === 'successful' && (
                                <>
                                    <div className="pm-success-icon">
                                        <CheckCircle2 size={56} />
                                    </div>
                                    <h4>Plan {plan.name} activé</h4>
                                    <p>Vous avez maintenant accès à toutes les fonctionnalités de votre nouveau plan.</p>
                                    <button className="pm-btn primary" onClick={onClose}>C’est parti</button>
                                </>
                            )}

                            {status === 'activation_failed' && (
                                <>
                                    <div className="pm-timeout-icon">
                                        <AlertTriangle size={48} />
                                    </div>
                                    <h4>Paiement reçu, activation en attente</h4>
                                    <p>Votre paiement est bien enregistré. L’activation du plan sera relancée automatiquement à votre prochaine visite de la page Facturation.</p>
                                    <button className="pm-btn primary" onClick={onClose}>Fermer</button>
                                </>
                            )}

                            {status === 'failed' && (
                                <>
                                    <div className="pm-timeout-icon">
                                        <AlertTriangle size={48} />
                                    </div>
                                    <h4>Paiement échoué</h4>
                                    <p>Le paiement a été refusé ou annulé. Aucun montant n’a été débité.</p>
                                    <button className="pm-btn primary" onClick={recommencer}>Réessayer</button>
                                    <button className="pm-btn secondary" onClick={onClose}>Annuler</button>
                                </>
                            )}

                            {status === 'timeout' && (
                                <>
                                    <div className="pm-timeout-icon">
                                        <AlertTriangle size={48} />
                                    </div>
                                    <h4>Paiement non confirmé</h4>
                                    <p>Aucune confirmation reçue après 5 minutes. Si vous avez validé le paiement, il apparaîtra dans votre historique.</p>
                                    <button className="pm-btn primary" onClick={recommencer}>Réessayer</button>
                                    <button className="pm-btn secondary" onClick={onClose}>Fermer</button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
