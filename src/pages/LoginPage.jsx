/**
 * Page de connexion
 * AdsFacile Frontend
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, AlertCircle, Zap, Shield, Clock } from 'lucide-react';
import { login as apiLogin } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { isValidEmail } from '../utils/signupValidation';
import './AuthPages.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
    remember_me: false
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  const validateIdentifier = (value) => {
    if (!value) return 'Email ou téléphone requis';
    const trimmed = value.trim();
    // Accepter email ou numéro de téléphone
    const isEmail = isValidEmail(trimmed);
    const isPhone = /^(\+?237)?[623]\d{8}$/.test(trimmed.replace(/\s/g, ''));
    if (!isEmail && !isPhone) return 'Entrez un email valide ou un numéro de téléphone';
    return '';
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (name === 'identifier') {
      const error = validateIdentifier(value);
      if (error) setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    // Validation
    const newErrors = {};
    const idError = validateIdentifier(formData.identifier);
    if (idError) newErrors.identifier = idError;
    if (!formData.password) newErrors.password = 'Mot de passe requis';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiLogin({
        identifier: formData.identifier.trim(),
        password: formData.password,
        remember_me: formData.remember_me
      });

      if (response.success) {
        // Stocker via AuthContext
        login(response.data.user, response.data.token);

        // Rediriger vers la page d'origine ou le dashboard
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    } catch (error) {
      console.error('Erreur login:', error);
      if (error.response?.data?.message) {
        setApiError(error.response.data.message);
      } else {
        setApiError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left - Branding (Desktop) */}
      <div className="auth-branding">
        <div className="auth-branding-content">
          <Link to="/" className="auth-branding-logo">
            <span className="logo-icon">📢</span>
            <span className="logo-text">AdsFacile</span>
          </Link>
          <h2 className="auth-branding-headline">
            Gérez vos campagnes Facebook <span>en toute simplicité</span>
          </h2>
          <div className="auth-branding-features">
            <div className="auth-feature-item">
              <Zap size={20} />
              <span>Tableau de bord intelligent et intuitif</span>
            </div>
            <div className="auth-feature-item">
              <Shield size={20} />
              <span>Vos données sont protégées et sécurisées</span>
            </div>
            <div className="auth-feature-item">
              <Clock size={20} />
              <span>Accédez à vos campagnes 24h/24</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="auth-form-side">
        <div className="auth-container">
          {/* Mobile Header */}
          <div className="auth-header">
            <Link to="/" className="auth-logo">
              <span className="logo-icon">📢</span>
              <span className="logo-text">AdsFacile</span>
            </Link>
            <h1>Connexion</h1>
            <p>Accédez à votre espace AdsFacile</p>
          </div>

          <div className="auth-card">
            {/* API Error */}
            {apiError && (
              <div className="auth-error-alert">
                <AlertCircle size={18} />
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              {/* Identifier */}
              <div className="form-group">
                <label htmlFor="identifier">
                  Email ou Téléphone <span className="required">*</span>
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="vous@exemple.com ou 6XX XX XX XX"
                  value={formData.identifier}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={errors.identifier ? 'input-error' : ''}
                />
                {errors.identifier && <span className="error-message">{errors.identifier}</span>}
              </div>

              {/* Password */}
              <div className="form-group">
                <label htmlFor="password">
                  Mot de passe <span className="required">*</span>
                </label>
                <div className="auth-password-wrapper">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    className={errors.password ? 'input-error' : ''}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="auth-password-toggle"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && <span className="error-message">{errors.password}</span>}
              </div>

              {/* Remember me + Forgot password */}
              <div className="auth-options-row">
                <label className="auth-checkbox-label">
                  <input
                    type="checkbox"
                    name="remember_me"
                    checked={formData.remember_me}
                    onChange={handleChange}
                  />
                  <span>Rester connecté 30 jours</span>
                </label>
                <Link to="/forgot-password" className="auth-forgot-link">
                  Mot de passe oublié ?
                </Link>
              </div>

              {/* Submit */}
              <button type="submit" disabled={isLoading} className="auth-submit">
                {isLoading ? (
                  <>
                    <span className="auth-spinner"></span>
                    <span>Connexion en cours...</span>
                  </>
                ) : (
                  <>
                    Se connecter
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="auth-divider"><span>OU</span></div>

            {/* OAuth */}
            <div className="auth-oauth-buttons">
              <button type="button" disabled className="auth-oauth-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </button>
              <button type="button" disabled className="auth-oauth-btn">
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
            <p className="auth-footer-link">
              Pas encore de compte ? <Link to="/signup">Créer un compte</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
