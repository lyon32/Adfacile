/**
 * Page mot de passe oublié
 * AdsFacile Frontend
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, AlertCircle, CheckCircle, Zap, Shield, Clock } from 'lucide-react';
import { forgotPassword as apiForgotPassword } from '../services/api';
import { isValidEmail } from '../utils/signupValidation';
import './AuthPages.css';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [devToken, setDevToken] = useState(null);

  const handleBlur = () => {
    if (email && !isValidEmail(email)) {
      setError('Format d\'email invalide');
    }
  };

  const handleChange = (e) => {
    setEmail(e.target.value);
    setError('');
    setApiError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!email) {
      setError('L\'email est requis');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Format d\'email invalide');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiForgotPassword(email.trim());

      if (response.success) {
        setIsSuccess(true);
        // En mode dev, afficher le token
        if (response.resetToken) {
          setDevToken({
            token: response.resetToken,
            url: response.resetUrl
          });
        }
      }
    } catch (error) {
      console.error('Erreur forgot-password:', error);
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
            Récupérez l'accès <span>à votre compte</span>
          </h2>
          <div className="auth-branding-features">
            <div className="auth-feature-item">
              <Zap size={20} />
              <span>Recevez un lien de réinitialisation par email</span>
            </div>
            <div className="auth-feature-item">
              <Shield size={20} />
              <span>Processus sécurisé et confidentiel</span>
            </div>
            <div className="auth-feature-item">
              <Clock size={20} />
              <span>Lien valide pendant 1 heure</span>
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
            <h1>Mot de passe oublié ?</h1>
            <p>Nous vous enverrons un lien de réinitialisation</p>
          </div>

          <div className="auth-card">
            {isSuccess ? (
              /* Success State */
              <>
                <div className="auth-success-alert">
                  <CheckCircle size={18} />
                  <span>
                    Si cet email existe, vous recevrez un lien de réinitialisation dans quelques minutes.
                    Vérifiez votre boîte de réception (et vos spams).
                  </span>
                </div>

                {/* Dev mode: show token */}
                {devToken && (
                  <div className="auth-dev-token">
                    <strong>🛠️ Mode développement :</strong>
                    Token : <code>{devToken.token}</code>
                    <br />
                    <a href={devToken.url}>→ Cliquer ici pour tester le reset</a>
                  </div>
                )}

                <Link to="/login" className="auth-back-link">
                  <ArrowLeft size={16} /> Retour à la connexion
                </Link>
              </>
            ) : (
              /* Form State */
              <>
                <div className="auth-info-alert">
                  <Mail size={18} />
                  <span>
                    Entrez l'adresse email associée à votre compte.
                    Vous recevrez un lien pour créer un nouveau mot de passe.
                  </span>
                </div>

                {apiError && (
                  <div className="auth-error-alert">
                    <AlertCircle size={18} />
                    <span>{apiError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                  <div className="form-group">
                    <label htmlFor="email">
                      Adresse email <span className="required">*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="vous@exemple.com"
                      value={email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={error ? 'input-error' : ''}
                    />
                    {error && <span className="error-message">{error}</span>}
                  </div>

                  <button type="submit" disabled={isLoading} className="auth-submit">
                    {isLoading ? (
                      <>
                        <span className="auth-spinner"></span>
                        <span>Envoi en cours...</span>
                      </>
                    ) : (
                      <>
                        Envoyer le lien
                        <ArrowLeft size={18} style={{ transform: 'rotate(180deg)' }} />
                      </>
                    )}
                  </button>
                </form>

                <Link to="/login" className="auth-back-link">
                  <ArrowLeft size={16} /> Retour à la connexion
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
