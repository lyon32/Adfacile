/**
 * Middleware d'authentification JWT
 * AdsFacile Backend
 */

const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

/**
 * Vérifie le token JWT et attache l'utilisateur à req.user
 */
const authenticate = async (req, res, next) => {
  try {
    // Récupérer le token depuis le header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware 401: Token manquant ou mal formaté', authHeader);
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('Auth middleware: Token reçu (50 premiers chars):', token ? token.substring(0, 50) : 'VIDE');

    // Vérifier et décoder le token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.log('Auth middleware 401: Erreur jwt.verify', err.name, err.message);
      const message = err.name === 'TokenExpiredError'
        ? 'Votre session a expiré. Veuillez vous reconnecter.'
        : 'Token invalide';
      return res.status(401).json({ success: false, message });
    }

    // Récupérer l'utilisateur en base
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, phone, first_name, last_name, business_name, niche, city, plan, ai_credits, is_active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      console.log('Auth middleware 401: Utilisateur non trouvé en DB pour ID', decoded.userId, 'Erreur:', error);
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.is_active) {
      console.log('Auth middleware 403: Compte désactivé pour ID', decoded.userId);
      return res.status(403).json({
        success: false,
        message: 'Compte désactivé'
      });
    }

    // Attacher l'utilisateur à la requête
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Erreur middleware auth:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur d\'authentification'
    });
  }
};

module.exports = { authenticate };
