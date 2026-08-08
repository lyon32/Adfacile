/**
 * Composant Indicateur de Force du Mot de Passe
 * Jauge segmentée + liste des critères, alignée sur validatePassword().
 * AdsFacile Frontend
 */

import { Check } from 'lucide-react';
import { getPasswordCriteria } from '../utils/signupValidation';
import './PasswordStrengthIndicator.css';

// Un segment par critère rempli ; la couleur suit le nombre de critères atteints
const SEGMENT_COLORS = ['#e2e8f0', '#EF4444', '#F97316', '#3b82f6', '#10b981'];

/**
 * PasswordStrengthIndicator
 *
 * @param {Object} props
 * @param {string} props.password - Le mot de passe à évaluer
 */
const PasswordStrengthIndicator = ({ password = '' }) => {
  const criteria = getPasswordCriteria(password);
  const metCount = criteria.filter((c) => c.met).length;
  const color = SEGMENT_COLORS[metCount];

  return (
    <div className="password-strength">
      <div className="strength-bars">
        {criteria.map((criterion, index) => (
          <i
            key={criterion.key}
            style={{ background: index < metCount ? color : '#e2e8f0' }}
          />
        ))}
      </div>

      <ul className="strength-criteria">
        {criteria.map((criterion) => (
          <li key={criterion.key} className={criterion.met ? 'ok' : ''}>
            <i><Check size={9} /></i>
            {criterion.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordStrengthIndicator;
