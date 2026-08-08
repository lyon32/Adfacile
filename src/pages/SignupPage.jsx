/**
 * Page d'inscription - Parcours guidé en 3 étapes
 * AdsFacile Frontend
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Eye, EyeOff, Check, AlertCircle, Zap, Shield, Clock } from 'lucide-react';
import { signup } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AuthBackground from '../components/auth/AuthBackground';
import {
  isValidEmail,
  isValidPhone,
  normalizePhone,
  validatePassword,
  passwordsMatch,
  NICHES,
  CITIES
} from '../utils/signupValidation';
import './SignupPage.css';

// Contenu de chaque étape : titre, compteur, phrase d'accompagnement
const STEPS = [
  {
    title: 'Faisons connaissance',
    counter: 'Étape 1 sur 3',
    lede: "Deux minutes suffisent, on ne demande que l'essentiel.",
    fields: ['first_name', 'last_name', 'email', 'phone']
  },
  {
    title: 'Sécurisez votre compte',
    counter: 'Étape 2 sur 3',
    lede: 'Choisissez un mot de passe que vous retiendrez.',
    fields: ['password', 'confirmPassword']
  },
  {
    title: 'Votre activité',
    counter: 'Étape 3 sur 3',
    lede: 'Facultatif, mais ça nous aide à mieux vous conseiller.',
    fields: ['niche', 'city', 'accept_terms', 'newsletter']
  }
];

// Retrouve l'étape qui contient un champ donné (pour renvoyer l'utilisateur
// au bon endroit quand le serveur renvoie une erreur de validation)
const stepOfField = (field) => {
  const index = STEPS.findIndex((step) => step.fields.includes(field));
  return index === -1 ? 0 : index;
};

const SignupPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState(0);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    niche: '',
    city: 'Douala',
    accept_terms: false,
    newsletter: false
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Critères du mot de passe, affichés en direct
  const criteria = {
    length: formData.password.length >= 8,
    upper: /[A-Z]/.test(formData.password),
    digit: /\d/.test(formData.password),
    match: passwordsMatch(formData.password, formData.confirmPassword)
  };
  const criteriaMet = Object.values(criteria).filter(Boolean).length;
  const METER_COLORS = ['#e2e8f0', '#EF4444', '#F97316', '#3b82f6', '#10b981'];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 9);
    setFormData((prev) => ({ ...prev, phone: value }));
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
    setApiError('');
  };

  const validateField = (name, value) => {
    switch (name) {
      case 'first_name':
        if (!value) return 'Prénom requis';
        if (value.length < 2) return 'Min. 2 caractères';
        return '';
      case 'last_name':
        if (!value) return 'Nom requis';
        if (value.length < 2) return 'Min. 2 caractères';
        return '';
      case 'email':
        if (!value) return 'Email requis';
        if (!isValidEmail(value)) return 'Email invalide';
        return '';
      case 'phone':
        if (!value) return 'Téléphone requis';
        if (!isValidPhone(value)) return '9 chiffres commençant par 6, 2 ou 3';
        return '';
      case 'password': {
        if (!value) return 'Mot de passe requis';
        const { isValid, errors: pwdErrors } = validatePassword(value);
        if (!isValid) return pwdErrors[0];
        return '';
      }
      case 'confirmPassword':
        if (!value) return 'Confirmation requise';
        if (!passwordsMatch(formData.password, value)) return 'Les mots de passe diffèrent';
        return '';
      case 'accept_terms':
        if (!value) return 'Vous devez accepter les conditions pour continuer';
        return '';
      default:
        return '';
    }
  };

  const handleBlur = (e) => {
    const { name, value, type, checked } = e.target;
    const error = validateField(name, type === 'checkbox' ? checked : value);
    if (error) setErrors((prev) => ({ ...prev, [name]: error }));
  };

  // Valide uniquement les champs de l'étape courante
  const validateStep = (index) => {
    const stepErrors = {};
    STEPS[index].fields.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) stepErrors[field] = error;
    });
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  };

  const goBack = () => {
    setApiError('');
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validateStep(step)) return;

    // Les deux premières étapes ne font qu'avancer
    if (step < STEPS.length - 1) {
      setStep((prev) => prev + 1);
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        phone: normalizePhone(formData.phone),
        niche: formData.niche || undefined,
        city: formData.city,
        accept_terms: true,
        newsletter: formData.newsletter
      };

      const response = await signup(payload);

      if (response.success) {
        login(response.data.user, response.data.token);
        navigate('/profil');
      }
    } catch (error) {
      console.error('Erreur inscription:', error);

      if (error.response?.data?.errors) {
        const serverErrors = {};
        error.response.data.errors.forEach((err) => {
          serverErrors[err.field] = err.message;
        });
        setErrors(serverErrors);
        setApiError(error.response.data.message || "Erreur lors de l'inscription");
        // Ramener l'utilisateur à l'étape du premier champ en faute
        const firstField = error.response.data.errors[0]?.field;
        if (firstField) setStep(stepOfField(firstField));
      } else if (error.response?.data?.message) {
        setApiError(error.response.data.message);
      } else {
        setApiError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="signup-page">
      <AuthBackground />

      {/* Colonne gauche : promesse produit (desktop) */}
      <div className="signup-branding">
        <div className="branding-content">
          <Link to="/" className="branding-logo">
            <span className="logo-icon">📢</span>
            <span className="logo-text">AdsFacile</span>
          </Link>

          <h2 className="branding-headline">
            Lancez vos pubs Facebook <span>en quelques clics</span>
          </h2>
          <p className="branding-subline">
            Pensé pour les commerçants qui n'ont ni agence ni temps à perdre.
          </p>

          <div className="branding-features">
            <div className="feature-item">
              <Zap size={19} />
              <span>Une campagne prête en 5 minutes</span>
            </div>
            <div className="feature-item">
              <Shield size={19} />
              <span>Zéro jargon technique</span>
            </div>
            <div className="feature-item">
              <Clock size={19} />
              <span>Support 7j/7 en français</span>
            </div>
          </div>
        </div>
      </div>

      {/* Colonne droite : formulaire */}
      <div className="signup-form-side">
        <div className="signup-container">
          <div className="signup-header">
            <Link to="/" className="signup-logo">
              <span className="logo-icon">📢</span>
              <span className="logo-text">AdsFacile</span>
            </Link>
          </div>

          <div className="signup-card">
            {/* Progression */}
            <div className="signup-steps">
              {STEPS.map((_, index) => (
                <i
                  key={index}
                  className={index < step ? 'done' : index === step ? 'now' : ''}
                />
              ))}
            </div>
            <div className="signup-step-meta">
              <b>{STEPS[step].title}</b>
              <span>{STEPS[step].counter}</span>
            </div>
            <p className="signup-step-lede">{STEPS[step].lede}</p>

            {apiError && (
              <div className="signup-error-alert" role="alert">
                <AlertCircle size={18} />
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="signup-form" noValidate>
              {/* ── Étape 1 : identité ── */}
              {step === 0 && (
                <div className="signup-pane">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="first_name">
                        Prénom <span className="required">*</span>
                      </label>
                      <input
                        id="first_name"
                        name="first_name"
                        type="text"
                        autoComplete="given-name"
                        placeholder="Jean"
                        value={formData.first_name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={errors.first_name ? 'input-error' : ''}
                      />
                      {errors.first_name && <span className="error-message">{errors.first_name}</span>}
                    </div>

                    <div className="form-group">
                      <label htmlFor="last_name">
                        Nom <span className="required">*</span>
                      </label>
                      <input
                        id="last_name"
                        name="last_name"
                        type="text"
                        autoComplete="family-name"
                        placeholder="Dupont"
                        value={formData.last_name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={errors.last_name ? 'input-error' : ''}
                      />
                      {errors.last_name && <span className="error-message">{errors.last_name}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">
                      Email <span className="required">*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="vous@exemple.com"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={errors.email ? 'input-error' : ''}
                    />
                    {errors.email && <span className="error-message">{errors.email}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone">
                      Téléphone <span className="required">*</span>
                    </label>
                    <div className="phone-input-wrapper">
                      <span className="phone-prefix">+237</span>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="6XX XX XX XX"
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        onBlur={handleBlur}
                        className={errors.phone ? 'input-error' : ''}
                      />
                    </div>
                    {errors.phone && <span className="error-message">{errors.phone}</span>}
                  </div>
                </div>
              )}

              {/* ── Étape 2 : mot de passe ── */}
              {step === 1 && (
                <div className="signup-pane">
                  <div className="form-group">
                    <label htmlFor="password">
                      Mot de passe <span className="required">*</span>
                    </label>
                    <div className="password-input-wrapper">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="8 caractères minimum"
                        value={formData.password}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={errors.password ? 'input-error' : ''}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="password-toggle"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && <span className="error-message">{errors.password}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirmPassword">
                      Confirmer <span className="required">*</span>
                    </label>
                    <div className="password-input-wrapper">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Répétez le mot de passe"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={errors.confirmPassword ? 'input-error' : ''}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="password-toggle"
                        aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <span className="error-message">{errors.confirmPassword}</span>
                    )}
                  </div>

                  {/* Jauge segmentée + critères */}
                  <div className="password-meter">
                    <div className="meter-bars">
                      {[0, 1, 2, 3].map((i) => (
                        <i
                          key={i}
                          style={{
                            background: i < criteriaMet ? METER_COLORS[criteriaMet] : '#e2e8f0'
                          }}
                        />
                      ))}
                    </div>
                    <div className="meter-criteria">
                      <span className={criteria.length ? 'ok' : ''}><i><Check size={9} /></i> 8 caractères</span>
                      <span className={criteria.upper ? 'ok' : ''}><i><Check size={9} /></i> Une majuscule</span>
                      <span className={criteria.digit ? 'ok' : ''}><i><Check size={9} /></i> Un chiffre</span>
                      <span className={criteria.match ? 'ok' : ''}><i><Check size={9} /></i> Identiques</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Étape 3 : activité et conditions ── */}
              {step === 2 && (
                <div className="signup-pane">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="niche">Secteur</label>
                      <select id="niche" name="niche" value={formData.niche} onChange={handleChange}>
                        <option value="">Facultatif</option>
                        {NICHES.filter((option) => option.value).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="city">Ville</label>
                      <select id="city" name="city" value={formData.city} onChange={handleChange}>
                        {CITIES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="accept_terms"
                        checked={formData.accept_terms}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                      <span className="checkbox-text">
                        J'accepte les <Link to="/conditions">CGU</Link> et la{' '}
                        <Link to="/confidentialite">politique de confidentialité</Link>{' '}
                        <span className="required">*</span>
                      </span>
                    </label>
                    {errors.accept_terms && <span className="error-message">{errors.accept_terms}</span>}
                  </div>

                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="newsletter"
                        checked={formData.newsletter}
                        onChange={handleChange}
                      />
                      <span className="checkbox-text">Recevoir des conseils marketing et actualités</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Navigation entre les étapes */}
              <div className="signup-nav">
                {step > 0 && (
                  <button type="button" className="signup-back" onClick={goBack} disabled={isLoading}>
                    <ArrowLeft size={16} />
                    Retour
                  </button>
                )}
                <button type="submit" className="signup-submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <span className="spinner" />
                      <span>Création...</span>
                    </>
                  ) : (
                    <>
                      {isLastStep ? 'Créer mon compte' : 'Continuer'}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="signup-badges">
              <span className="badge-item"><Check size={13} /> Sans carte bancaire</span>
              <span className="badge-item"><Check size={13} /> 1<sup>er</sup> mois gratuit</span>
              <span className="badge-item"><Check size={13} /> Annulation libre</span>
            </div>

            <div className="signup-divider"><span>ou</span></div>

            <div className="oauth-buttons">
              <button type="button" disabled className="oauth-btn">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span>Facebook</span>
              </button>
              <button type="button" disabled className="oauth-btn">
                <svg viewBox="0 0 24 24" width="17" height="17">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Google</span>
              </button>
            </div>

            <p className="signup-footer-link">
              Déjà un compte ? <Link to="/login">Se connecter</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
