/**
 * Contrôleur d'authentification
 * AdsFacile Backend
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { normalizePhone, isValidEmail, isValidCameroonPhone } = require('../utils/validation');

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inscription d'un nouvel utilisateur
 * POST /api/auth/signup
 */
const signup = async (req, res) => {
  try {
    const {
      email,
      password,
      phone,
      first_name,
      last_name,
      business_name,
      niche,
      city = 'Douala',
      accept_terms,
      newsletter = false
    } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = normalizePhone(phone);

    // Vérification unicité email
    const { data: existingEmail, error: emailError } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (emailError && emailError.code !== 'PGRST116') {
      console.error('Erreur vérification email:', emailError);
      throw new Error('Erreur lors de la vérification de l\'email');
    }

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Cet email est déjà utilisé',
        errors: [{ field: 'email', message: 'Cet email est déjà associé à un compte' }]
      });
    }

    // Vérification unicité téléphone
    const { data: existingPhone, error: phoneError } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .single();

    if (phoneError && phoneError.code !== 'PGRST116') {
      console.error('Erreur vérification téléphone:', phoneError);
      throw new Error('Erreur lors de la vérification du téléphone');
    }

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: 'Ce numéro de téléphone est déjà utilisé',
        errors: [{ field: 'phone', message: 'Ce numéro est déjà associé à un compte' }]
      });
    }

    // Hashage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Création de l'utilisateur
    const userData = {
      email: normalizedEmail,
      password_hash: passwordHash,
      phone: normalizedPhone,
      first_name: first_name || null,
      last_name: last_name || null,
      business_name: business_name || null,
      niche: niche || null,
      city: city,
      plan: 'free',
      ai_credits: 3,
      newsletter: newsletter === true || newsletter === 'true',
      accept_terms: true,
      email_verified: false,
      is_active: true
    };

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([userData])
      .select('id, email, phone, first_name, last_name, business_name, niche, city, plan, ai_credits, created_at')
      .single();

    if (insertError) {
      console.error('Erreur création utilisateur:', insertError);
      if (insertError.code === '42501' || insertError.message.includes('row-level security')) {
        console.error('🚨 ERREUR RLS - Exécutez backend/fix-rls.sql dans Supabase SQL Editor');
      }
      throw new Error('Erreur lors de la création du compte');
    }

    // Génération du token JWT
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    console.log(`✅ Nouvel utilisateur créé: ${newUser.email}`);

    return res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          phone: newUser.phone,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          business_name: newUser.business_name,
          niche: newUser.niche,
          city: newUser.city,
          plan: newUser.plan,
          ai_credits: newUser.ai_credits
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ Erreur signup:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la création du compte',
      errors: [{ field: 'general', message: 'Erreur serveur. Veuillez réessayer plus tard.' }]
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Connexion d'un utilisateur
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { identifier, password, remember_me = false } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant et mot de passe requis'
      });
    }

    // Déterminer si l'identifier est un email ou un téléphone
    const trimmed = identifier.trim();
    let query;

    if (isValidEmail(trimmed)) {
      query = supabase
        .from('users')
        .select('id, email, phone, first_name, last_name, business_name, niche, city, plan, ai_credits, password_hash, is_active')
        .eq('email', trimmed.toLowerCase());
    } else {
      // Normaliser le téléphone
      const normalizedPhone = normalizePhone(trimmed);
      query = supabase
        .from('users')
        .select('id, email, phone, first_name, last_name, business_name, niche, city, plan, ai_credits, password_hash, is_active')
        .eq('phone', normalizedPhone);
    }

    const { data: user, error } = await query.single();

    // Utilisateur non trouvé
    if (error || !user) {
      // Log tentative échouée
      await logLoginAttempt(null, trimmed, ip, userAgent, false, 'User not found');
      
      // Timing attack protection: hash quand même pour garder le même temps de réponse
      await bcrypt.hash(password, 10);
      
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects'
      });
    }

    // Vérifier que le compte est actif
    if (!user.is_active) {
      await logLoginAttempt(user.id, trimmed, ip, userAgent, false, 'Account disabled');
      return res.status(401).json({
        success: false,
        message: 'Ce compte a été désactivé'
      });
    }

    // Comparer le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      await logLoginAttempt(user.id, trimmed, ip, userAgent, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects'
      });
    }

    // Mettre à jour last_login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Log tentative réussie
    await logLoginAttempt(user.id, user.email, ip, userAgent, true, null);

    // Générer token JWT
    const expiresIn = remember_me ? '30d' : '24h';
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    console.log(`✅ Connexion réussie: ${user.email} (remember_me: ${remember_me})`);

    // Retourner réponse (sans password_hash)
    const { password_hash, is_active, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      data: {
        user: safeUser,
        token,
        expiresIn
      }
    });

  } catch (error) {
    console.error('❌ Erreur login:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la connexion'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Demande de réinitialisation de mot de passe
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'L\'email est requis'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const genericMessage = 'Si cet email existe, vous recevrez un lien de réinitialisation';

    // Vérifier si l'email existe
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    if (error || !user) {
      // Sécurité: même message que si l'email existe
      return res.status(200).json({
        success: true,
        message: genericMessage
      });
    }

    // Invalider les anciens tokens non-utilisés pour cet email
    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('email', normalizedEmail)
      .eq('used', false);

    // Générer un nouveau token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 heure

    // Stocker le token
    const { error: insertError } = await supabase
      .from('password_resets')
      .insert([{
        email: normalizedEmail,
        token: resetToken,
        expires_at: expiresAt,
        used: false
      }]);

    if (insertError) {
      console.error('Erreur insertion token reset:', insertError);
      throw new Error('Erreur lors de la création du token de réinitialisation');
    }

    console.log(`🔑 Token reset généré pour: ${normalizedEmail}`);

    // TODO Phase 2: Envoyer email avec le lien de réinitialisation
    // Ex: https://adsfacile.com/reset-password/{resetToken}

    const response = {
      success: true,
      message: genericMessage
    };

    // En mode dev, inclure le token dans la réponse pour faciliter les tests
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      response.resetToken = resetToken;
      response.resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Erreur forgot-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Réinitialisation du mot de passe
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    // Validations
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation manquant'
      });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau mot de passe et sa confirmation sont requis'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Les mots de passe ne correspondent pas'
      });
    }

    // Vérifier complexité du mot de passe
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères'
      });
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'
      });
    }

    // Chercher le token en base
    const { data: resetRecord, error: findError } = await supabase
      .from('password_resets')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .single();

    if (findError || !resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation invalide ou déjà utilisé'
      });
    }

    // Vérifier expiration
    if (new Date(resetRecord.expires_at) < new Date()) {
      // Marquer comme utilisé
      await supabase
        .from('password_resets')
        .update({ used: true })
        .eq('id', resetRecord.id);

      return res.status(400).json({
        success: false,
        message: 'Ce lien de réinitialisation a expiré. Veuillez en demander un nouveau.'
      });
    }

    // Hasher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Mettre à jour le mot de passe de l'utilisateur
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('email', resetRecord.email);

    if (updateError) {
      console.error('Erreur mise à jour mot de passe:', updateError);
      throw new Error('Erreur lors de la mise à jour du mot de passe');
    }

    // Marquer le token comme utilisé
    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('id', resetRecord.id);

    console.log(`✅ Mot de passe réinitialisé pour: ${resetRecord.email}`);

    return res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.'
    });

  } catch (error) {
    console.error('❌ Erreur reset-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la réinitialisation'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Log login attempt
// ═══════════════════════════════════════════════════════════════════════════════

async function logLoginAttempt(userId, email, ip, userAgent, success, failureReason) {
  try {
    await supabase
      .from('login_attempts')
      .insert([{
        user_id: userId,
        email: email,
        ip_address: ip,
        user_agent: userAgent,
        success: success,
        failure_reason: failureReason
      }]);
  } catch (err) {
    // Ne pas faire échouer le login si le log échoue
    console.error('⚠️ Erreur log tentative connexion:', err);
  }
}

module.exports = {
  signup,
  login,
  forgotPassword,
  resetPassword
};
