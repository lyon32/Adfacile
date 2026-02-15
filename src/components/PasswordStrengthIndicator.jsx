/**
 * Composant Indicateur de Force du Mot de Passe
 * AdsFacile Frontend
 */

import { calculatePasswordStrength } from '../utils/signupValidation';
import './PasswordStrengthIndicator.css';

/**
 * PasswordStrengthIndicator
 * Affiche une barre de progression colorée selon la force du mot de passe
 * 
 * @param {Object} props
 * @param {string} props.password - Le mot de passe à évaluer
 */
const PasswordStrengthIndicator = ({ password }) => {
  const { score, label, color } = calculatePasswordStrength(password);

  if (!password) {
    return null;
  }

  return (
    <div className="password-strength">
      {/* Barre de progression */}
      <div className="strength-bar">
        <div
          className="strength-fill"
          style={{
            width: `${score}%`,
            backgroundColor: color
          }}
        />
      </div>
      
      {/* Label textuel */}
      <p className="strength-label" style={{ color }}>
        Force du mot de passe : {label}
      </p>
    </div>
  );
};

export default PasswordStrengthIndicator;
