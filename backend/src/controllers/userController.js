/**
 * Contrôleur Profil Utilisateur
 * AdsFacile Backend
 * 
 * Gestion du profil : lecture, mise à jour, avatar, email, téléphone,
 * suppression de compte, et limites de plan.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { isValidEmail, isValidCameroonPhone, normalizePhone } = require('../utils/validation');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION MULTER (upload avatar en mémoire)
// ═══════════════════════════════════════════════════════════════════════════════

const avatarStorage = multer.memoryStorage();

const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format non supporté. Utilisez JPEG, PNG ou WebP.'), false);
        }
    }
}).single('avatar');

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

const NICHE_WHITELIST = [
    'Restaurant',
    'Mode',
    'Tech',
    'Formation',
    'Santé',
    'Beauté',
    'Agriculture',
    'Immobilier',
    'Transport',
    'Autre'
];

const PLAN_LIMITS_CONFIG = {
    free: {
        campaigns: 1,
        ai_credits: 3,
        analytics: false,
        competitor: false,
        website_audit: false,
        export_pdf: false,
        multi_account: false,
        whatsapp_alerts: false,
        white_label: false
    },
    starter: {
        campaigns: 5,
        ai_credits: 20,
        analytics: 'basic',
        competitor: false,
        website_audit: 1,
        export_pdf: true,
        multi_account: false,
        whatsapp_alerts: false,
        white_label: false
    },
    pro: {
        campaigns: 999,
        ai_credits: 999,
        analytics: 'advanced',
        competitor: true,
        website_audit: 999,
        export_pdf: true,
        multi_account: true,
        whatsapp_alerts: true,
        white_label: false
    },
    agency: {
        campaigns: 999,
        ai_credits: 999,
        analytics: 'advanced',
        competitor: true,
        website_audit: 999,
        export_pdf: true,
        multi_account: true,
        whatsapp_alerts: true,
        white_label: true
    }
};

// Champs sélectionnés pour le profil (JAMAIS password_hash)
const PROFILE_SELECT = 'id, email, phone, first_name, last_name, business_name, niche, city, bio, profile_picture_url, plan, ai_credits, email_verified, created_at, last_login_at';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER : Audit log
// ═══════════════════════════════════════════════════════════════════════════════

async function logAudit(userId, action, details = {}) {
    try {
        await supabase.from('audit_logs').insert({
            user_id: userId,
            action,
            details,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        // Ne pas bloquer si la table n'existe pas encore
        logger.warn(`⚠️ Audit log échoué (${action}):`, err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère le profil de l'utilisateur connecté
 * GET /api/users/me
 */
const getProfile = async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select(PROFILE_SELECT)
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({
                success: false,
                message: 'Profil non trouvé'
            });
        }

        return res.status(200).json({
            success: true,
            data: { user }
        });
    } catch (error) {
        logger.error('❌ Erreur getProfile:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du profil'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Met à jour les informations du profil
 * PUT /api/users/me
 */
const updateProfile = async (req, res) => {
    try {
        const { first_name, last_name, business_name, niche, city, bio } = req.body;

        // Construire l'objet de mise à jour (seulement les champs fournis)
        const updateData = {};

        if (first_name !== undefined) {
            if (first_name.length > 100) {
                return res.status(400).json({ success: false, message: 'Le prénom ne peut pas dépasser 100 caractères' });
            }
            updateData.first_name = first_name.trim();
        }

        if (last_name !== undefined) {
            if (last_name.length > 100) {
                return res.status(400).json({ success: false, message: 'Le nom ne peut pas dépasser 100 caractères' });
            }
            updateData.last_name = last_name.trim();
        }

        if (business_name !== undefined) {
            if (business_name.length > 255) {
                return res.status(400).json({ success: false, message: 'Le nom d\'entreprise ne peut pas dépasser 255 caractères' });
            }
            updateData.business_name = business_name.trim();
        }

        if (niche !== undefined) {
            if (!NICHE_WHITELIST.includes(niche)) {
                return res.status(400).json({
                    success: false,
                    message: `Secteur invalide. Valeurs autorisées : ${NICHE_WHITELIST.join(', ')}`
                });
            }
            updateData.niche = niche;
        }

        if (city !== undefined) {
            updateData.city = city.trim();
        }

        if (bio !== undefined) {
            if (bio.length > 500) {
                return res.status(400).json({ success: false, message: 'La bio ne peut pas dépasser 500 caractères' });
            }
            updateData.bio = bio.trim();
        }

        // Rien à mettre à jour
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Aucune donnée à mettre à jour'
            });
        }

        updateData.updated_at = new Date().toISOString();

        // Mise à jour en base
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', req.user.id)
            .select(PROFILE_SELECT)
            .single();

        if (error) {
            logger.error('❌ Erreur update profil:', error.message);
            throw new Error('Erreur lors de la mise à jour');
        }

        // Audit log
        await logAudit(req.user.id, 'profile_updated', { fields: Object.keys(updateData) });

        logger.info(`✅ Profil mis à jour: ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Profil mis à jour avec succès',
            data: { user: updatedUser }
        });
    } catch (error) {
        logger.error('❌ Erreur updateProfile:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du profil'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Demande de changement d'email (nécessite confirmation)
 * PUT /api/users/me/email
 */
const updateEmail = async (req, res) => {
    try {
        const { new_email, password } = req.body;

        // Validation
        if (!new_email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Le nouvel email et le mot de passe actuel sont requis'
            });
        }

        const normalizedEmail = new_email.toLowerCase().trim();

        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Format d\'email invalide'
            });
        }

        // Vérifier que l'email n'est pas déjà utilisé
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            throw new Error('Erreur vérification email');
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Cet email est déjà utilisé par un autre compte'
            });
        }

        // Vérifier le mot de passe actuel
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', req.user.id)
            .single();

        if (userError || !user) {
            throw new Error('Utilisateur non trouvé');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Mot de passe incorrect'
            });
        }

        // Générer un token de vérification email
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

        // Stocker le token et le nouvel email en attente
        const { error: updateError } = await supabase
            .from('users')
            .update({
                email_verification_token: hashedToken,
                pending_email: normalizedEmail,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.user.id);

        if (updateError) {
            logger.error('❌ Erreur stockage token email:', updateError.message);
            throw new Error('Erreur lors de la demande de changement d\'email');
        }

        // TODO Phase 2 : Envoyer email avec Brevo
        // Pour le moment, log en console (dev)
        const confirmUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/confirm-email/${verificationToken}`;
        logger.info(`📧 Email de confirmation envoyé à ${normalizedEmail}`);
        logger.info(`🔗 Lien de confirmation (dev): ${confirmUrl}`);

        // Audit log
        await logAudit(req.user.id, 'email_change_requested', { new_email: normalizedEmail });

        const response = {
            success: true,
            message: 'Un email de confirmation a été envoyé à votre nouvelle adresse'
        };

        // En dev, inclure le token pour faciliter les tests
        if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
            response.verification_token = verificationToken;
            response.confirm_url = confirmUrl;
        }

        return res.status(200).json(response);
    } catch (error) {
        logger.error('❌ Erreur updateEmail:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la demande de changement d\'email'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE PHONE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Met à jour le numéro de téléphone
 * PUT /api/users/me/phone
 */
const updatePhone = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Le numéro de téléphone est requis'
            });
        }

        // Validation format camerounais
        if (!isValidCameroonPhone(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Format invalide. Utilisez le format +237XXXXXXXXX'
            });
        }

        const normalizedPhone = normalizePhone(phone);

        // Vérifier unicité
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('phone', normalizedPhone)
            .neq('id', req.user.id)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            throw new Error('Erreur vérification téléphone');
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Ce numéro de téléphone est déjà utilisé par un autre compte'
            });
        }

        // Mise à jour
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({ phone: normalizedPhone, updated_at: new Date().toISOString() })
            .eq('id', req.user.id)
            .select(PROFILE_SELECT)
            .single();

        if (error) {
            throw new Error('Erreur lors de la mise à jour du téléphone');
        }

        logger.info(`✅ Téléphone mis à jour pour: ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Numéro de téléphone mis à jour',
            data: { user: updatedUser }
        });
    } catch (error) {
        logger.error('❌ Erreur updatePhone:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du téléphone'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD PROFILE PICTURE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upload et redimensionne la photo de profil
 * POST /api/users/me/avatar
 */
const uploadProfilePicture = async (req, res) => {
    // Multer middleware intégré
    avatarUpload(req, res, async (err) => {
        try {
            // Erreur Multer (taille, format)
            if (err) {
                const message = err.code === 'LIMIT_FILE_SIZE'
                    ? 'L\'image ne doit pas dépasser 2 MB'
                    : err.message;
                return res.status(400).json({ success: false, message });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Aucun fichier sélectionné'
                });
            }

            // Redimensionner avec Sharp (200x200, webp, qualité 80)
            const resizedBuffer = await sharp(req.file.buffer)
                .resize(200, 200, { fit: 'cover', position: 'center' })
                .webp({ quality: 80 })
                .toBuffer();

            const fileName = `${req.user.id}.webp`;
            const filePath = `avatars/${fileName}`;

            // Upload vers Supabase Storage (bucket 'avatars')
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, resizedBuffer, {
                    contentType: 'image/webp',
                    upsert: true // Remplace si existe déjà
                });

            if (uploadError) {
                logger.error('❌ Erreur upload Supabase Storage:', uploadError.message);
                throw new Error('Erreur lors de l\'upload de l\'avatar');
            }

            // Obtenir l'URL publique
            const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const profilePictureUrl = publicUrlData.publicUrl;

            // Mettre à jour l'URL en base
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    profile_picture_url: profilePictureUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', req.user.id);

            if (updateError) {
                throw new Error('Erreur lors de la mise à jour de l\'avatar en base');
            }

            // Audit log
            await logAudit(req.user.id, 'avatar_uploaded', { file_size: req.file.size });

            logger.info(`✅ Avatar uploadé pour: ${req.user.email}`);

            return res.status(200).json({
                success: true,
                message: 'Photo de profil mise à jour',
                data: { profile_picture_url: profilePictureUrl }
            });
        } catch (error) {
            logger.error('❌ Erreur uploadProfilePicture:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de l\'upload de la photo de profil'
            });
        }
    });
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE ACCOUNT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Suppression définitive du compte
 * DELETE /api/users/me
 */
const deleteAccount = async (req, res) => {
    try {
        const { password, confirmation } = req.body;

        // Vérifications
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Le mot de passe est requis pour confirmer la suppression'
            });
        }

        if (confirmation !== 'SUPPRIMER') {
            return res.status(400).json({
                success: false,
                message: 'Tapez "SUPPRIMER" pour confirmer la suppression du compte'
            });
        }

        // Vérifier le mot de passe
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('password_hash, plan, email')
            .eq('id', req.user.id)
            .single();

        if (userError || !user) {
            throw new Error('Utilisateur non trouvé');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Mot de passe incorrect'
            });
        }

        // Vérifier aucun abonnement actif payant
        if (user.plan !== 'free') {
            // Vérifier s'il y a un abonnement actif
            const { data: subscription } = await supabase
                .from('subscriptions')
                .select('id, status')
                .eq('user_id', req.user.id)
                .eq('status', 'active')
                .single();

            if (subscription) {
                return res.status(400).json({
                    success: false,
                    message: 'Veuillez annuler votre abonnement avant de supprimer votre compte',
                    data: { has_active_subscription: true }
                });
            }
        }

        // Supprimer l'avatar de Supabase Storage
        try {
            await supabase.storage
                .from('avatars')
                .remove([`avatars/${req.user.id}.webp`]);
        } catch (storageErr) {
            logger.warn('⚠️ Erreur suppression avatar storage:', storageErr.message);
        }

        // Audit log AVANT suppression
        await logAudit(req.user.id, 'account_deleted', { email: user.email });

        // Suppression du compte (CASCADE supprime les données liées)
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', req.user.id);

        if (deleteError) {
            logger.error('❌ Erreur suppression compte:', deleteError.message);
            throw new Error('Erreur lors de la suppression du compte');
        }

        logger.info(`🗑️ Compte supprimé: ${user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Votre compte a été supprimé définitivement'
        });
    } catch (error) {
        logger.error('❌ Erreur deleteAccount:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du compte'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET PLAN LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retourne les limites du plan de l'utilisateur
 * GET /api/users/me/plan-limits
 */
const getPlanLimits = async (req, res) => {
    try {
        const userPlan = req.user.plan || 'free';
        const limits = PLAN_LIMITS_CONFIG[userPlan] || PLAN_LIMITS_CONFIG.free;

        return res.status(200).json({
            success: true,
            data: {
                plan: userPlan,
                limits,
                ai_credits_remaining: req.user.ai_credits || 0
            }
        });
    } catch (error) {
        logger.error('❌ Erreur getPlanLimits:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des limites'
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    getProfile,
    updateProfile,
    updateEmail,
    updatePhone,
    uploadProfilePicture,
    deleteAccount,
    getPlanLimits,
    NICHE_WHITELIST,
    PLAN_LIMITS_CONFIG
};
