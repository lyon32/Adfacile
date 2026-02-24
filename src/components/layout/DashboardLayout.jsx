/**
 * DashboardLayout — Layout principal du dashboard
 * AdsFacile Frontend
 * 
 * Sidebar fixe gauche + Header + contenu principal
 */

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import DashboardHeader from './DashboardHeader';
import './DashboardLayout.css';

const DashboardLayout = ({ children, title = 'Dashboard' }) => {
    const { user, isAuthenticated, loading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Attendre que l'auth ait fini de charger (checkAuth au montage)
    if (loading) {
        return (
            <div className="dash-layout-loading">
                <Loader2 size={32} className="spinner" />
                <span>Chargement...</span>
            </div>
        );
    }

    // Rediriger seulement APRÈS que le loading soit terminé
    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="dash-layout">
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />
            <div className="dash-main">
                <DashboardHeader
                    title={title}
                    onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
                />
                <main className="dash-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
