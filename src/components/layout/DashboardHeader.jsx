/**
 * DashboardHeader — Barre supérieure du dashboard
 * AdsFacile Frontend
 */

import { Menu, Bell } from 'lucide-react';

const DashboardHeader = ({ title = 'Dashboard', onMenuToggle }) => {
    return (
        <header className="dash-header">
            <div className="dash-header-left">
                <button className="dash-menu-btn" onClick={onMenuToggle}>
                    <Menu size={22} />
                </button>
                <h1 className="dash-header-title">{title}</h1>
            </div>

            <div className="dash-header-right">
                <div className="dash-stat-card">
                    <span className="dash-stat-label">Campagnes actives</span>
                    <span className="dash-stat-value">0</span>
                </div>
                <div className="dash-stat-card">
                    <span className="dash-stat-label">Impressions</span>
                    <span className="dash-stat-value">0</span>
                </div>
                <div className="dash-stat-card hide-mobile">
                    <span className="dash-stat-label">Budget</span>
                    <span className="dash-stat-value">0 XAF</span>
                </div>
                <button className="dash-notif-btn" title="Notifications">
                    <Bell size={20} />
                </button>
            </div>
        </header>
    );
};

export default DashboardHeader;
