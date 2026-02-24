/**
 * Sidebar — Navigation latérale fixe du Dashboard
 * AdsFacile Frontend
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Home, Target, BarChart3, CreditCard, Settings,
    LogOut, Zap, Sparkles, X as XIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/campaigns', label: 'Campagnes', icon: Target },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/plans', label: 'Facturation', icon: CreditCard },
    { path: '/settings', label: 'Paramètres', icon: Settings },
];

const PLAN_LABELS = {
    free: 'Gratuit', starter: 'Starter', pro: 'PRO', agency: 'Agency'
};

const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const plan = user?.plan || 'free';
    const aiCredits = user?.ai_credits ?? 0;
    const isPro = plan === 'pro' || plan === 'agency';
    const maxCredits = plan === 'free' ? 3 : plan === 'starter' ? 20 : 99999;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (path) => {
        if (path === '/dashboard') return location.pathname === '/dashboard';
        return location.pathname.startsWith(path);
    };

    return (
        <>
            {/* Backdrop mobile */}
            {isOpen && (
                <div className="sidebar-backdrop" onClick={onClose} />
            )}

            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                {/* ─── Logo ─── */}
                <div className="sidebar-logo">
                    <Link to="/dashboard" className="sidebar-logo-link">
                        <span className="sidebar-logo-icon">📢</span>
                        <span className="sidebar-logo-text">AdsFacile</span>
                    </Link>
                    <button className="sidebar-close-btn" onClick={onClose}>
                        <XIcon size={20} />
                    </button>
                </div>

                {/* ─── Navigation ─── */}
                <nav className="sidebar-nav">
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`sidebar-nav-item ${active ? 'active' : ''}`}
                                onClick={onClose}
                            >
                                <Icon size={20} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* ─── Divider ─── */}
                <div className="sidebar-divider" />

                {/* ─── Plan card ─── */}
                <div className="sidebar-plan-card">
                    <div className="sidebar-plan-header">
                        <span className={`sidebar-plan-badge plan-${plan}`}>
                            {PLAN_LABELS[plan] || 'Gratuit'}
                        </span>
                    </div>

                    <div className="sidebar-credits">
                        <div className="sidebar-credits-label">
                            <Sparkles size={14} />
                            <span>Crédits IA</span>
                            <span className="sidebar-credits-value">
                                {isPro ? '∞' : `${aiCredits}/${maxCredits}`}
                            </span>
                        </div>
                        {!isPro && (
                            <div className="sidebar-credits-bar">
                                <div
                                    className="sidebar-credits-fill"
                                    style={{ width: `${Math.min(100, (aiCredits / maxCredits) * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>

                    {plan === 'free' && (
                        <Link to="/plans" className="sidebar-upgrade-btn" onClick={onClose}>
                            <Zap size={14} />
                            Passer PRO
                        </Link>
                    )}
                </div>

                {/* ─── Profil + Déconnexion ─── */}
                <div className="sidebar-footer">
                    <Link to="/profil" className="sidebar-profile-link" onClick={onClose}>
                        <div className="sidebar-avatar">
                            {user?.first_name ? user.first_name[0].toUpperCase() : user?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="sidebar-profile-info">
                            <span className="sidebar-profile-name">
                                {user?.first_name || user?.email?.split('@')[0] || 'Utilisateur'}
                            </span>
                            <span className="sidebar-profile-email">{user?.email || ''}</span>
                        </div>
                    </Link>
                    <button className="sidebar-logout-btn" onClick={handleLogout} title="Déconnexion">
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
