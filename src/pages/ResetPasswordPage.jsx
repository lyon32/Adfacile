/**
 * Page de réinitialisation de mot de passe
 * AdsFacile Frontend
 */

import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, AlertCircle, CheckCircle, ArrowLeft, Zap, Shield, Clock } from 'lucide-react';
import { resetPassword as apiResetPassword } from '../services/api';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import { validatePassword, passwordsMatch } from '../utils/signupValidation';
import './AuthPages.css';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Countdown après succès
  useEffect(() => {
    if (isSuccess && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (isSuccess && countdown === 0) {
      navigate('/login', { replace: true });
    }
  }, [isSuccess, countdown, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (name === 'newPassword' && value) {
      const { isValid, errors: pwdErrors } = validatePassword(value);
      if (!isValid) setErrors(prev => ({ ...prev, newPassword: pwdErrors[0] }));
    }
    if (name === 'confirmPassword' && value) {
      if (!passwordsMatch(formData.newPassword, value)) {
        setErrors(prev => ({ ...prev, confirmPassword: 'Les mots de passe ne correspondent pas' }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    // Validation
    const newErrors = {};
    if (!formData.newPassword) {
      newErrors.newPassword = 'Le nouveau mot de passe est requis';
    } else {
      const { isValid, errors: pwdErrors } = validatePassword(formData.newPassword);
      if (!isValid) newErrors.newPassword = pwdErrors[0];
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirmez votre mot de passe';
    } else if (!passwordsMatch(formData.newPassword, formData.confirmPassword)) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiResetPassword({
        token,
        newPassword: formData.newPassword,
        confirmPassword: formData.confirmPassword
      });

      if (response.success) {
        setIsSuccess(true);
      }
    } catch (error) {
      console.error('Erreur reset-password:', error);
      if (error.response?.data?.message) {
        setApiError(error.response.data.message);
      } else {
        setApiError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Vérifier si le token est présent
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-form-side">
          <div className="auth-container">
            <div className="auth-card">
              <div className="auth-error-alert">
                <AlertCircle size={18} />
                <span>Lien de réinitialisation invalide. Aucun token fourni.</span>
              </div>
              <Link to="/forgot-password" className="auth-submit" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Demander un nouveau lien
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            Choisissez un <span>nouveau mot de passe</span>
          </h2>
          <div className="auth-branding-features">
            <div className="auth-feature-item">
              <Zap size={20} />
              <span>Minimum 8 caractères requis</span>
            </div>
            <div className="auth-feature-item">
              <Shield size={20} />
              <span>Incluez majuscules, minuscules et chiffres</span>
            </div>
            <div className="auth-feature-item">
              <Clock size={20} />
              <span>Votre ancien mot de passe sera remplacé</span>
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
            <h1>Nouveau mot de passe</h1>
            <p>Choisissez un mot de passe sécurisé</p>
          </div>

          <div className="auth-card">
            {isSuccess ? (
              /* Success State */
              <div className="auth-success-state">
                <div className="auth-success-icon">
                  <CheckCircle size={32} />
                </div>
                <h2>Mot de passe réinitialisé !</h2>
                <p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
                <p className="auth-countdown">
                  Redirection vers la connexion dans {countdown}s...
                </p>
                <Link to="/login" className="auth-submit" style={{ textDecoration: 'none', textAlign: 'center', marginTop: '1rem' }}>
                  Se connecter maintenant
                </Link>
              </div>
            ) : (
              /* Form State */
              <>
                {apiError && (
                  <div className="auth-error-alert">
                    <AlertCircle size={18} />
                    <span>{apiError}</span>
                  </div>
                )}

                {/* Si erreur token, proposer de redemander */}
                {apiError && (apiError.includes('invalide') || apiError.includes('expiré')) && (
                  <Link to="/forgot-password" className="auth-back-link" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    <ArrowLeft size={16} /> Demander un nouveau lien
                  </Link>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                  {/* New Password */}
                  <div className="form-group">
                    <label htmlFor="newPassword">
                      Nouveau mot de passe <span className="required">*</span>
                    </label>
                    <div className="auth-password-wrapper">
                      <input
                        id="newPassword"
                        name="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Min. 8 caractères"
                        value={formData.newPassword}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={errors.newPassword ? 'input-error' : ''}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="auth-password-toggle"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {formData.newPassword && <PasswordStrengthIndicator password={formData.newPassword} />}
                    {errors.newPassword && <span className="error-message">{errors.newPassword}</span>}
                  </div>

                  {/* Confirm Password */}
                  <div className="form-group">
                    <label htmlFor="confirmPassword">
                      Confirmer le mot de passe <span className="required">*</span>
                    </label>
                    <div className="auth-password-wrapper">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Répétez votre mot de passe"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`${errors.confirmPassword ? 'input-error' : ''} ${
                          formData.confirmPassword && passwordsMatch(formData.newPassword, formData.confirmPassword)
                            ? 'input-success'
                            : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="auth-password-toggle"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                    {formData.confirmPassword && passwordsMatch(formData.newPassword, formData.confirmPassword) && (
                      <span className="success-message"><Check size={12} /> Les mots de passe correspondent</span>
                    )}
                  </div>

                  {/* Submit */}
                  <button type="submit" disabled={isLoading} className="auth-submit">
                    {isLoading ? (
                      <>
                        <span className="auth-spinner"></span>
                        <span>Réinitialisation...</span>
                      </>
                    ) : (
                      'Réinitialiser le mot de passe'
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

export default ResetPasswordPage;
