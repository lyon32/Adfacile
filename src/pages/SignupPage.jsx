/**
 * Page d'inscription - Design moderne et compact
 * AdsFacile Frontend
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Check, AlertCircle, Zap, Shield, Clock } from 'lucide-react';
import { signup } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
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

const SignupPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  // État du formulaire
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

  // État des erreurs
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  // États UI
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Gestion des changements de champs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Effacer l'erreur du champ modifié
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    setApiError('');
  };

  // Validation en temps réel pour le téléphone
  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 9);
    setFormData(prev => ({ ...prev, phone: value }));
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  // Validation d'un champ individuel
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
        if (!isValidPhone(value)) return '9 chiffres requis';
        return '';
      case 'password':
        const { isValid, errors: pwdErrors } = validatePassword(value);
        if (!value) return 'Mot de passe requis';
        if (!isValid) return pwdErrors[0];
        return '';
      case 'confirmPassword':
        if (!value) return 'Confirmation requise';
        if (!passwordsMatch(formData.password, value)) return 'Non identiques';
        return '';
      case 'accept_terms':
        if (!value) return 'Acceptation requise';
        return '';
      default:
        return '';
    }
  };

  // Validation au blur
  const handleBlur = (e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;
    const error = validateField(name, fieldValue);
    if (error) {
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  // Validation complète du formulaire
  const validateForm = () => {
    const newErrors = {};
    
    newErrors.first_name = validateField('first_name', formData.first_name);
    newErrors.last_name = validateField('last_name', formData.last_name);
    newErrors.email = validateField('email', formData.email);
    newErrors.phone = validateField('phone', formData.phone);
    newErrors.password = validateField('password', formData.password);
    newErrors.confirmPassword = validateField('confirmPassword', formData.confirmPassword);
    newErrors.accept_terms = validateField('accept_terms', formData.accept_terms);

    const filteredErrors = Object.fromEntries(
      Object.entries(newErrors).filter(([, v]) => v !== '')
    );

    setErrors(filteredErrors);
    return Object.keys(filteredErrors).length === 0;
  };

  // Soumission du formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) {
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
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Erreur inscription:', error);
      
      if (error.response?.data?.errors) {
        const serverErrors = {};
        error.response.data.errors.forEach(err => {
          serverErrors[err.field] = err.message;
        });
        setErrors(serverErrors);
        setApiError(error.response.data.message || 'Erreur lors de l\'inscription');
      } else if (error.response?.data?.message) {
        setApiError(error.response.data.message);
      } else {
        setApiError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="signup-page">
      {/* Left Side - Branding (Desktop only) */}
      <div className="signup-branding">
        <div className="branding-content">
          <Link to="/" className="branding-logo">
            <span className="logo-icon">📢</span>
            <span className="logo-text">AdsFacile</span>
          </Link>
          
          <h2 className="branding-headline">
            Lancez vos pubs Facebook <span>en quelques clics</span>
          </h2>
          
          <div className="branding-features">
            <div className="feature-item">
              <Zap size={20} />
              <span>Création de campagnes en 5 minutes</span>
            </div>
            <div className="feature-item">
              <Shield size={20} />
              <span>Interface simplifiée, sans jargon technique</span>
            </div>
            <div className="feature-item">
              <Clock size={20} />
              <span>Support client réactif 7j/7</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="signup-form-side">
        <div className="signup-container">
          {/* Mobile Header */}
          <div className="signup-header">
            <Link to="/" className="signup-logo">
              <span className="logo-icon">📢</span>
              <span className="logo-text">AdsFacile</span>
            </Link>
            <h1>Créez votre compte</h1>
            <p>Lancez vos publicités en quelques minutes</p>
          </div>

          <div className="signup-card">
            {/* Erreur API globale */}
            {apiError && (
              <div className="signup-error-alert">
                <AlertCircle size={18} />
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="signup-form">
              {/* Prénom et Nom */}
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

              {/* Email */}
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

              {/* Téléphone */}
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

              {/* Mots de passe sur une ligne */}
              <div className="form-row">
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
                      placeholder="Min. 8 caractères"
                      value={formData.password}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={errors.password ? 'input-error' : ''}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
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
                      placeholder="Répétez"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`${errors.confirmPassword ? 'input-error' : ''} ${
                        formData.confirmPassword && passwordsMatch(formData.password, formData.confirmPassword) 
                          ? 'input-success' 
                          : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="password-toggle"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                  {formData.confirmPassword && passwordsMatch(formData.password, formData.confirmPassword) && (
                    <span className="success-message"><Check size={12} /> OK</span>
                  )}
                </div>
              </div>

              {/* Password Strength sous les mots de passe */}
              {formData.password && <PasswordStrengthIndicator password={formData.password} />}

              {/* Secteur et Ville sur une ligne */}
              <div className="form-row selects-row">
                <div className="form-group">
                  <label htmlFor="niche">Secteur</label>
                  <select
                    id="niche"
                    name="niche"
                    value={formData.niche}
                    onChange={handleChange}
                  >
                    {NICHES.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="city">Ville</label>
                  <select
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                  >
                    {CITIES.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checkboxes compacts */}
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
                    J'accepte les <a href="#">CGU</a> et la <a href="#">Politique de confidentialité</a> *
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
                  <span className="checkbox-text">
                    Recevoir des conseils marketing et actualités
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="signup-submit"
              >
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    <span>Création...</span>
                  </>
                ) : (
                  <>
                    Créer mon compte
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="signup-divider">
              <span>OU</span>
            </div>

            {/* OAuth */}
            <div className="oauth-buttons">
              <button type="button" disabled className="oauth-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </button>
              <button type="button" disabled className="oauth-btn">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Google</span>
              </button>
            </div>

            {/* Footer */}
            <p className="signup-footer-link">
              Déjà un compte ? <Link to="/login">Se connecter</Link>
            </p>
          </div>

          {/* Trust badges */}
          <div className="signup-badges">
            <div className="badge-item">
              <Check size={14} />
              <span>Sans carte bancaire</span>
            </div>
            <div className="badge-item">
              <Check size={14} />
              <span>1er mois gratuit</span>
            </div>
            <div className="badge-item">
              <Check size={14} />
              <span>Annulation libre</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
