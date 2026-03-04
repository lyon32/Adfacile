/**
 * PaymentModal — Modal de paiement Mobile Money via CamPay
 * AdsFacile Frontend
 *
 * 3 étapes : Récapitulatif → Méthode + Numéro → Confirmation/Attente
 * Polling CamPay toutes les 3s pour vérifier le statut du paiement
 */

import { useState, useEffect, useRef } from 'react';
import {
    X as XIcon, ArrowRight, Phone, Loader2,
    CheckCircle2, AlertTriangle, Shield, Info
} from 'lucide-react';
import api from '../../services/api';

const PaymentModal = ({ plan, onClose, onSuccess }) => {
    const [step, setStep] = useState(1);
    const [paymentMethod, setPaymentMethod] = useState('mtn');
    const [phone, setPhone] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [paymentData, setPaymentData] = useState(null);
    const [status, setStatus] = useState('pending'); // pending | successful | failed | timeout
    const [timer, setTimer] = useState(180); // 3 min
    const intervalRef = useRef(null);
    const pollingRef = useRef(null);

    // Nettoyage au démontage
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // ─── Initier le paiement CamPay ───
    const handlePay = async () => {
        const cleaned = phone.replace(/\s/g, '');
        if (!cleaned || cleaned.length < 9) {
            setPhoneError('Numéro invalide (9 chiffres après +237)');
            return;
        }
        setPhoneError('');
        setLoading(true);
        setError('');

        try {
            const res = await api.post('/billing/upgrade', {
                target_plan: plan.id,
                payment_method: paymentMethod,
                phone: `+237${cleaned}`
            });

            if (res.data.success) {
                setPaymentData(res.data.data);
                setStep(3);
                startPolling(res.data.data.reference);
                startTimer();
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Erreur lors du paiement';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // ─── Polling CamPay toutes les 3s ───
    const startPolling = (reference) => {
        pollingRef.current = setInterval(async () => {
            try {
                const res = await api.get('/billing/payment/status', {
                    params: { reference }
                });

                const newStatus = res.data.data?.status;

                if (newStatus === 'successful') {
                    clearInterval(pollingRef.current);
                    clearInterval(intervalRef.current);
                    setStatus('successful');
                    if (onSuccess) onSuccess(plan);
                } else if (newStatus === 'failed') {
                    clearInterval(pollingRef.current);
                    clearInterval(intervalRef.current);
                    setStatus('failed');
                }
            } catch (err) {
                console.error('Status check error:', err);
            }
        }, 3000);
    };

    // ─── Timer 3 minutes ───
    const startTimer = () => {
        setTimer(180);
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

    const formatTimer = (s) => {
        const min = Math.floor(s / 60);
        const sec = s % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    if (!plan) return null;

    return (
        <div className="pm-backdrop" onClick={onClose}>
            <div className="pm-modal" onClick={e => e.stopPropagation()}>
                {/* ─── Header ─── */}
                <div className="pm-header">
                    <h3>
                        {step === 1 && 'Récapitulatif'}
                        {step === 2 && 'Mode de paiement'}
                        {step === 3 && (
                            status === 'successful' ? 'Paiement confirmé !' :
                                status === 'failed' ? 'Paiement échoué' :
                                    status === 'timeout' ? 'Délai expiré' :
                                        'En attente de confirmation...'
                        )}
                    </h3>
                    <button className="pm-close" onClick={onClose}>
                        <XIcon size={20} />
                    </button>
                </div>

                {/* ─── Steps indicator ─── */}
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
                                    <span className="pm-amount">{plan.price.toLocaleString()}</span>
                                    <span className="pm-currency">FCFA/{plan.period}</span>
                                </div>
                            </div>

                            <ul className="pm-features-list">
                                {plan.features.slice(0, 5).map((f, i) => (
                                    <li key={i}><CheckCircle2 size={14} /> {f}</li>
                                ))}
                            </ul>

                            <div className="pm-annual-hint">
                                💡 Économisez <strong>{Math.round(plan.price * 12 * 0.17).toLocaleString()} FCFA</strong> avec un paiement annuel
                                <span className="pm-badge">-17%</span>
                            </div>

                            <button className="pm-btn primary" onClick={() => setStep(2)}>
                                Continuer vers le paiement
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    )}

                    {/* ═══ ÉTAPE 2 : Méthode de paiement ═══ */}
                    {step === 2 && (
                        <div className="pm-payment">
                            <div className="pm-methods">
                                <button
                                    className={`pm-method ${paymentMethod === 'mtn' ? 'active' : ''}`}
                                    onClick={() => setPaymentMethod('mtn')}
                                >
                                    <span className="pm-method-logo mtn">MTN</span>
                                    <span>MTN Mobile Money</span>
                                </button>
                                <button
                                    className={`pm-method ${paymentMethod === 'orange' ? 'active' : ''}`}
                                    onClick={() => setPaymentMethod('orange')}
                                >
                                    <span className="pm-method-logo orange">OM</span>
                                    <span>Orange Money</span>
                                </button>
                            </div>

                            <div className="pm-field">
                                <label htmlFor="pm-phone">
                                    <Phone size={14} /> Numéro de téléphone
                                </label>
                                <div className="pm-phone-input">
                                    <span className="pm-prefix">+237</span>
                                    <input
                                        id="pm-phone"
                                        type="tel"
                                        value={phone}
                                        onChange={e => {
                                            setPhone(e.target.value.replace(/\D/g, '').slice(0, 9));
                                            setPhoneError('');
                                        }}
                                        placeholder="6XX XX XX XX"
                                        maxLength={9}
                                    />
                                </div>
                                {phoneError && <span className="pm-error">{phoneError}</span>}
                            </div>

                            {/* Info sandbox */}
                            {paymentData?.sandbox_mode && (
                                <div className="pm-sandbox-info">
                                    <Info size={14} />
                                    <div>
                                        <strong>Mode Sandbox</strong>
                                        <p>Montant test: {paymentData.sandbox_info?.message}</p>
                                        <p className="pm-test-nums">
                                            MTN OK: 677777777 • MTN FAIL: 677777770<br />
                                            Orange OK: 699999999 • Orange FAIL: 699999990
                                        </p>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="pm-error-box">
                                    <AlertTriangle size={16} />
                                    {error}
                                </div>
                            )}

                            <div className="pm-secure">
                                <Shield size={14} />
                                <span>Paiement sécurisé par CamPay</span>
                            </div>

                            <button
                                className="pm-btn primary"
                                onClick={handlePay}
                                disabled={loading}
                            >
                                {loading ? (
                                    <><Loader2 size={16} className="pm-spin" /> Traitement...</>
                                ) : (
                                    <>Payer {plan.price.toLocaleString()} FCFA maintenant</>
                                )}
                            </button>

                            <button className="pm-btn secondary" onClick={() => setStep(1)}>
                                ← Retour
                            </button>
                        </div>
                    )}

                    {/* ═══ ÉTAPE 3 : Confirmation / Polling ═══ */}
                    {step === 3 && (
                        <div className="pm-confirm">
                            {status === 'pending' && (
                                <>
                                    <div className="pm-waiting">
                                        <Loader2 size={48} className="pm-spin" />
                                    </div>
                                    <h4>En attente de confirmation...</h4>
                                    <p>Vérifiez votre téléphone pour confirmer le paiement de <strong>{plan.price.toLocaleString()} FCFA</strong></p>
                                    <div className="pm-timer">{formatTimer(timer)}</div>
                                    {paymentData && (
                                        <p className="pm-ref">Réf : {paymentData.reference}</p>
                                    )}
                                    {paymentData?.ussd_code && (
                                        <p className="pm-ussd">Code USSD : {paymentData.ussd_code}</p>
                                    )}
                                    {paymentData?.sandbox_mode && (
                                        <div className="pm-sandbox-badge">
                                            ⚠️ Mode sandbox — Montant réel: {paymentData.amount} XAF
                                        </div>
                                    )}
                                </>
                            )}

                            {status === 'successful' && (
                                <>
                                    <div className="pm-success-icon">
                                        <CheckCircle2 size={56} />
                                    </div>
                                    <h4>Plan {plan.name} activé ! 🎉</h4>
                                    <p>Vous avez maintenant accès à toutes les fonctionnalités de votre nouveau plan.</p>
                                    <button className="pm-btn primary" onClick={() => { onClose(); window.location.reload(); }}>
                                        C'est parti !
                                    </button>
                                </>
                            )}

                            {status === 'failed' && (
                                <>
                                    <div className="pm-timeout-icon">
                                        <AlertTriangle size={48} />
                                    </div>
                                    <h4>Paiement échoué</h4>
                                    <p>Le paiement n'a pas pu être traité. Veuillez réessayer.</p>
                                    <button className="pm-btn primary" onClick={() => {
                                        setStep(2);
                                        setStatus('pending');
                                        setPaymentData(null);
                                    }}>
                                        Réessayer
                                    </button>
                                    <button className="pm-btn secondary" onClick={onClose}>
                                        Annuler
                                    </button>
                                </>
                            )}

                            {status === 'timeout' && (
                                <>
                                    <div className="pm-timeout-icon">
                                        <AlertTriangle size={48} />
                                    </div>
                                    <h4>Paiement non reçu</h4>
                                    <p>Le délai de confirmation a expiré. Vérifiez votre historique de paiements.</p>
                                    <button className="pm-btn primary" onClick={() => {
                                        setStep(2);
                                        setStatus('pending');
                                        setPaymentData(null);
                                    }}>
                                        Réessayer
                                    </button>
                                    <button className="pm-btn secondary" onClick={onClose}>
                                        Fermer
                                    </button>
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
