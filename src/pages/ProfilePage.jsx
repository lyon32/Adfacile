/**
 * Page Profil Utilisateur
 * AdsFacile Frontend
 * 
 * Layout 2 colonnes desktop, 1 colonne mobile
 * 4 onglets : Infos personnelles, Sécurité, Notifications, Danger Zone
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    User, Shield, Bell, AlertTriangle,
    Mail, Phone, MapPin, Calendar, Loader2,
    Eye, EyeOff, Lock, Check, X as XIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks/useProfile';
import AvatarUpload from '../components/profile/AvatarUpload';
import PlanLimitsCard from '../components/profile/PlanLimitsCard';
import UpgradeBanner from '../components/profile/UpgradeBanner';
import ConnectFacebookButton from '../components/facebook/ConnectFacebookButton';
import DashboardLayout from '../components/layout/DashboardLayout';
import './ProfilePage.css';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

const NICHE_OPTIONS = [
    'Restaurant', 'Mode', 'Tech', 'Formation',
    'Santé', 'Beauté', 'Agriculture', 'Immobilier', 'Transport', 'Autre'
];

const CITY_OPTIONS = [
    'Douala', 'Yaoundé', 'Bafoussam', 'Garoua',
    'Bamenda', 'Maroua', 'Ngaoundéré', 'Edéa', 'Kribi', 'Autre'
];

const TABS = [
    { id: 'infos', label: 'Infos personnelles', icon: User },
    { id: 'security', label: 'Sécurité', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

const PLAN_LABELS = { free: 'GRATUIT', starter: 'STARTER', pro: 'PRO', agency: 'AGENCY' };
const PLAN_COLORS = { free: 'plan-free', starter: 'plan-starter', pro: 'plan-pro', agency: 'plan-agency' };

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

const ProfilePage = () => {
    const { updateUser, logout } = useAuth();
    const navigate = useNavigate();
    const {
        profile, planLimits, loading, saving,
        activeTab, setActiveTab,
        toast, setToast,
        updateProfile, updateEmail, updatePhone,
        uploadAvatar, deleteAccount, resetPassword
    } = useProfile();

    if (loading) {
        return (
            <div className="profile-loading">
                <Loader2 size={40} className="spinner" />
                <p>Chargement du profil...</p>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="profile-loading">
                <p>Impossible de charger le profil</p>
                <Link to="/login" className="btn btn-primary">Se connecter</Link>
            </div>
        );
    }

    const memberSince = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : '';

    const handleProfileUpdate = async (data) => {
        const updatedUser = await updateProfile(data);
        if (updatedUser) updateUser(updatedUser);
    };

    const handleAvatarUpload = async (file) => {
        const url = await uploadAvatar(file);
        if (url) updateUser({ ...profile, profile_picture_url: url });
    };

    const handleDeleteAccount = async (data) => {
        const success = await deleteAccount(data);
        if (success) {
            logout();
            navigate('/');
        }
    };

    return (
        <DashboardLayout title="Mon Profil">
            <div className="profile-page">
                <div className="container">

                    <div className="profile-layout">
                        {/* ═══════ COLONNE GAUCHE — Carte profil ═══════ */}
                        <aside className="profile-sidebar">
                            <div className="profile-card">
                                <AvatarUpload
                                    profilePictureUrl={profile.profile_picture_url}
                                    firstName={profile.first_name}
                                    lastName={profile.last_name}
                                    onUpload={handleAvatarUpload}
                                    saving={saving}
                                />

                                <h2 className="profile-name">
                                    {profile.first_name || ''} {profile.last_name || ''}
                                </h2>

                                <span className={`plan-badge ${PLAN_COLORS[profile.plan] || 'plan-free'}`}>
                                    {PLAN_LABELS[profile.plan] || 'GRATUIT'}
                                </span>

                                <div className="profile-info-list">
                                    <div className="profile-info-item">
                                        <Mail size={16} />
                                        <span>{profile.email}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <Phone size={16} />
                                        <span>{profile.phone || '—'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <MapPin size={16} />
                                        <span>{profile.city || 'Non défini'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <Calendar size={16} />
                                        <span>Membre depuis {memberSince}</span>
                                    </div>
                                </div>

                                <div className="profile-divider" />

                                <PlanLimitsCard
                                    plan={profile.plan}
                                    aiCredits={profile.ai_credits}
                                />

                                <div className="profile-divider" />

                                <UpgradeBanner currentPlan={profile.plan} />

                                <div className="profile-divider" />

                                {/* Connexion Facebook */}
                                <ConnectFacebookButton />
                            </div>
                        </aside>

                        {/* ═══════ COLONNE DROITE — Onglets ═══════ */}
                        <main className="profile-main">
                            {/* Onglets navigation */}
                            <nav className="profile-tabs">
                                {TABS.map(tab => {
                                    const Icon = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            className={`profile-tab ${activeTab === tab.id ? 'active' : ''} ${tab.id === 'danger' ? 'tab-danger' : ''}`}
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <Icon size={18} />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </nav>

                            {/* Contenu des onglets */}
                            <div className="profile-tab-content">
                                {activeTab === 'infos' && (
                                    <InfosTab
                                        profile={profile}
                                        onSave={handleProfileUpdate}
                                        saving={saving}
                                    />
                                )}
                                {activeTab === 'security' && (
                                    <SecurityTab
                                        profile={profile}
                                        onUpdateEmail={updateEmail}
                                        onUpdatePhone={updatePhone}
                                        onResetPassword={resetPassword}
                                        saving={saving}
                                    />
                                )}
                                {activeTab === 'notifications' && (
                                    <NotificationsTab plan={profile.plan} />
                                )}
                                {activeTab === 'danger' && (
                                    <DangerTab
                                        onDelete={handleDeleteAccount}
                                        saving={saving}
                                    />
                                )}
                            </div>
                        </main>
                    </div>
                </div>

                {/* Toast notification */}
                {toast && (
                    <div className={`toast toast-${toast.type}`}>
                        <span>{toast.message}</span>
                        <button onClick={() => setToast(null)} className="toast-close">
                            <XIcon size={16} />
                        </button>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ONGLET 1 — INFOS PERSONNELLES
// ═══════════════════════════════════════════════════════════════════════════════

const InfosTab = ({ profile, onSave, saving }) => {
    const [form, setForm] = useState({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        business_name: profile.business_name || '',
        niche: profile.niche || '',
        city: profile.city || '',
        bio: profile.bio || ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await onSave(form);
    };

    const bioLength = form.bio.length;

    return (
        <form className="profile-form" onSubmit={handleSubmit}>
            <h3>Informations personnelles</h3>

            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="first_name">Prénom</label>
                    <input
                        id="first_name"
                        name="first_name"
                        type="text"
                        value={form.first_name}
                        onChange={handleChange}
                        maxLength={100}
                        placeholder="Votre prénom"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="last_name">Nom</label>
                    <input
                        id="last_name"
                        name="last_name"
                        type="text"
                        value={form.last_name}
                        onChange={handleChange}
                        maxLength={100}
                        placeholder="Votre nom"
                    />
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="business_name">Nom de l'entreprise</label>
                <input
                    id="business_name"
                    name="business_name"
                    type="text"
                    value={form.business_name}
                    onChange={handleChange}
                    maxLength={255}
                    placeholder="Ex: Boutique Elégance"
                />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="niche">Secteur d'activité</label>
                    <select id="niche" name="niche" value={form.niche} onChange={handleChange}>
                        <option value="">Sélectionner...</option>
                        {NICHE_OPTIONS.map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="city">Ville</label>
                    <select id="city" name="city" value={form.city} onChange={handleChange}>
                        <option value="">Sélectionner...</option>
                        {CITY_OPTIONS.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="bio">Bio</label>
                <textarea
                    id="bio"
                    name="bio"
                    value={form.bio}
                    onChange={handleChange}
                    maxLength={500}
                    rows={4}
                    placeholder="Décrivez votre activité en quelques mots..."
                />
                <span className={`char-counter ${bioLength > 450 ? 'warning' : ''}`}>
                    {bioLength}/500
                </span>
            </div>

            <button type="submit" className="btn-save" disabled={saving}>
                {saving ? (
                    <><Loader2 size={18} className="spinner" /> Enregistrement...</>
                ) : (
                    <><Check size={18} /> Enregistrer les modifications</>
                )}
            </button>
        </form>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ONGLET 2 — SÉCURITÉ
// ═══════════════════════════════════════════════════════════════════════════════

const SecurityTab = ({ profile, onUpdateEmail, onUpdatePhone, onResetPassword, saving }) => {
    const [emailForm, setEmailForm] = useState({ new_email: '', password: '' });
    const [phoneForm, setPhoneForm] = useState({ phone: '' });
    const [showPassword, setShowPassword] = useState(false);

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        try {
            await onUpdateEmail(emailForm);
            setEmailForm({ new_email: '', password: '' });
        } catch { /* handled in hook */ }
    };

    const handlePhoneSubmit = async (e) => {
        e.preventDefault();
        try {
            await onUpdatePhone(phoneForm);
            setPhoneForm({ phone: '' });
        } catch { /* handled in hook */ }
    };

    const handlePasswordReset = async () => {
        await onResetPassword(profile.email);
    };

    return (
        <div className="security-tab">
            <h3>Sécurité du compte</h3>

            {/* Changer email */}
            <div className="security-section">
                <h4>Changer l'adresse email</h4>
                <p className="section-hint">Un email de confirmation sera envoyé à la nouvelle adresse</p>
                <form onSubmit={handleEmailSubmit}>
                    <div className="form-group">
                        <label htmlFor="new_email">Nouvel email</label>
                        <input
                            id="new_email"
                            type="email"
                            value={emailForm.new_email}
                            onChange={e => setEmailForm(p => ({ ...p, new_email: e.target.value }))}
                            placeholder="nouveau@email.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="email_password">Mot de passe actuel</label>
                        <div className="password-input-wrap">
                            <input
                                id="email_password"
                                type={showPassword ? 'text' : 'password'}
                                value={emailForm.password}
                                onChange={e => setEmailForm(p => ({ ...p, password: e.target.value }))}
                                placeholder="Confirmez votre mot de passe"
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn-secondary" disabled={saving}>
                        {saving ? <Loader2 size={16} className="spinner" /> : <Mail size={16} />}
                        Changer l'email
                    </button>
                </form>
            </div>

            {/* Changer téléphone */}
            <div className="security-section">
                <h4>Changer le numéro de téléphone</h4>
                <form onSubmit={handlePhoneSubmit}>
                    <div className="form-group">
                        <label htmlFor="new_phone">Nouveau numéro (+237)</label>
                        <input
                            id="new_phone"
                            type="tel"
                            value={phoneForm.phone}
                            onChange={e => setPhoneForm({ phone: e.target.value })}
                            placeholder="+237 6XX XXX XXX"
                            required
                        />
                    </div>
                    <button type="submit" className="btn-secondary" disabled={saving}>
                        {saving ? <Loader2 size={16} className="spinner" /> : <Phone size={16} />}
                        Mettre à jour
                    </button>
                </form>
            </div>

            {/* Réinitialiser mot de passe */}
            <div className="security-section">
                <h4>Mot de passe</h4>
                <p className="section-hint">Un email de réinitialisation sera envoyé à {profile.email}</p>
                <button
                    className="btn-secondary"
                    onClick={handlePasswordReset}
                    disabled={saving}
                >
                    {saving ? <Loader2 size={16} className="spinner" /> : <Shield size={16} />}
                    Réinitialiser le mot de passe
                </button>
            </div>

            {/* 2FA — bloqué */}
            <div className="security-section locked-section">
                <div className="locked-overlay">
                    <Lock size={20} />
                    <span>Disponible à partir du plan Starter</span>
                    <Link to="/plans" className="locked-link">Voir les plans</Link>
                </div>
                <h4>Authentification à 2 facteurs (2FA)</h4>
                <p className="section-hint">Ajoutez une couche de sécurité supplémentaire à votre compte</p>
                <button className="btn-secondary" disabled>
                    <Shield size={16} />
                    Activer la 2FA
                </button>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ONGLET 3 — NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const NotificationsTab = ({ plan }) => {
    const [notifs, setNotifs] = useState({
        weekly_report: true,
        budget_alert: true,
        new_features: true,
        whatsapp_realtime: false,
        whatsapp_daily: false,
    });

    const handleToggle = (key) => {
        // Bloquer les notifications WhatsApp pour non-PRO
        if ((key === 'whatsapp_realtime' || key === 'whatsapp_daily') && plan !== 'pro' && plan !== 'agency') {
            return;
        }
        setNotifs(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const isPro = plan === 'pro' || plan === 'agency';

    return (
        <div className="notifications-tab">
            <h3>Préférences de notifications</h3>

            <div className="notif-section">
                <h4>📧 Notifications email</h4>
                <NotifToggle
                    label="Rapport hebdomadaire de mes campagnes"
                    checked={notifs.weekly_report}
                    onChange={() => handleToggle('weekly_report')}
                />
                <NotifToggle
                    label="Alerte si budget campagne épuisé"
                    checked={notifs.budget_alert}
                    onChange={() => handleToggle('budget_alert')}
                />
                <NotifToggle
                    label="Nouvelles fonctionnalités AdsFacile"
                    checked={notifs.new_features}
                    onChange={() => handleToggle('new_features')}
                />
            </div>

            <div className={`notif-section ${!isPro ? 'notif-locked' : ''}`}>
                <h4>📱 Notifications WhatsApp</h4>
                {!isPro && (
                    <div className="notif-locked-overlay">
                        <Lock size={18} />
                        <span>Plan PRO requis</span>
                        <Link to="/plans" className="locked-link">Passer PRO</Link>
                    </div>
                )}
                <NotifToggle
                    label="Alertes temps réel performances"
                    checked={notifs.whatsapp_realtime}
                    onChange={() => handleToggle('whatsapp_realtime')}
                    disabled={!isPro}
                />
                <NotifToggle
                    label="Rapports journaliers automatiques"
                    checked={notifs.whatsapp_daily}
                    onChange={() => handleToggle('whatsapp_daily')}
                    disabled={!isPro}
                />
            </div>
        </div>
    );
};

const NotifToggle = ({ label, checked, onChange, disabled = false }) => (
    <label className={`notif-toggle ${disabled ? 'disabled' : ''}`}>
        <span>{label}</span>
        <div className={`toggle-switch ${checked ? 'on' : ''}`} onClick={disabled ? undefined : onChange}>
            <div className="toggle-thumb" />
        </div>
    </label>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ONGLET 4 — DANGER ZONE
// ═══════════════════════════════════════════════════════════════════════════════

const DangerTab = ({ onDelete, saving }) => {
    const [showModal, setShowModal] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const [password, setPassword] = useState('');

    const handleDelete = async (e) => {
        e.preventDefault();
        try {
            await onDelete({ password, confirmation });
        } catch { /* handled in hook */ }
    };

    const canDelete = confirmation === 'SUPPRIMER' && password.length > 0;

    return (
        <div className="danger-tab">
            <h3>Zone dangereuse</h3>

            <div className="danger-card">
                <div className="danger-header">
                    <AlertTriangle size={24} />
                    <div>
                        <h4>Supprimer mon compte</h4>
                        <p>Cette action est irréversible. Toutes vos données seront supprimées définitivement.</p>
                    </div>
                </div>
                <button
                    className="btn-danger"
                    onClick={() => setShowModal(true)}
                >
                    Supprimer mon compte
                </button>
            </div>

            {/* Modal de confirmation */}
            {showModal && (
                <div className="modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header danger">
                            <AlertTriangle size={24} />
                            <h3>Confirmer la suppression</h3>
                        </div>
                        <div className="modal-body">
                            <div className="modal-warning">
                                <strong>⚠️ Attention !</strong> Cette action supprimera définitivement :
                                <ul>
                                    <li>Votre compte et toutes vos données personnelles</li>
                                    <li>Vos campagnes publicitaires</li>
                                    <li>Vos statistiques et historiques</li>
                                    <li>Vos crédits IA restants</li>
                                </ul>
                            </div>

                            <form onSubmit={handleDelete}>
                                <div className="form-group">
                                    <label>Tapez <strong>SUPPRIMER</strong> pour confirmer</label>
                                    <input
                                        type="text"
                                        value={confirmation}
                                        onChange={e => setConfirmation(e.target.value)}
                                        placeholder="SUPPRIMER"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Mot de passe</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Votre mot de passe"
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button
                                        type="button"
                                        className="btn-cancel"
                                        onClick={() => setShowModal(false)}
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn-danger"
                                        disabled={!canDelete || saving}
                                    >
                                        {saving ? <Loader2 size={16} className="spinner" /> : null}
                                        Supprimer définitivement
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfilePage;
