/**
 * Dashboard Page — Page d'accueil du tableau de bord
 * AdsFacile Frontend
 * 
 * Utilise DashboardLayout pour le sidebar et le header
 */

import { Link } from 'react-router-dom';
import {
  Target, Sparkles, BarChart3, ArrowRight,
  TrendingUp, Eye, DollarSign, Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import './DashboardPage.css';

const DashboardPage = () => {
  const { user } = useAuth();

  const plan = user?.plan || 'free';
  const isPro = plan === 'pro' || plan === 'agency';

  return (
    <DashboardLayout title="Dashboard">
      <div className="dash-page">
        {/* ── Bienvenue ── */}
        <div className="dash-welcome">
          <div>
            <h2 className="dash-welcome-title">
              Bienvenue, {user?.first_name || user?.email?.split('@')[0]} ! 👋
            </h2>
            <p className="dash-welcome-sub">
              Lancez vos publicités Facebook en quelques minutes
            </p>
          </div>
          <Link to="/campaigns" className="dash-cta-btn">
            <Target size={18} />
            Créer une campagne
          </Link>
        </div>

        {/* ── Statistiques rapides ── */}
        <div className="dash-stats-grid">
          <div className="dash-stat-box">
            <div className="dash-stat-icon green">
              <Target size={20} />
            </div>
            <div>
              <span className="dash-stat-num">0</span>
              <span className="dash-stat-txt">Campagnes ce mois</span>
            </div>
          </div>
          <div className="dash-stat-box">
            <div className="dash-stat-icon blue">
              <Eye size={20} />
            </div>
            <div>
              <span className="dash-stat-num">0</span>
              <span className="dash-stat-txt">Impressions</span>
            </div>
          </div>
          <div className="dash-stat-box">
            <div className="dash-stat-icon purple">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="dash-stat-num">0</span>
              <span className="dash-stat-txt">Clics</span>
            </div>
          </div>
          <div className="dash-stat-box">
            <div className="dash-stat-icon orange">
              <DollarSign size={20} />
            </div>
            <div>
              <span className="dash-stat-num">0 XAF</span>
              <span className="dash-stat-txt">Budget dépensé</span>
            </div>
          </div>
        </div>

        {/* ── Actions rapides ── */}
        <div className="dash-actions-grid">
          <Link to="/campaigns" className="dash-action-card">
            <div className="dash-action-icon">
              <Target size={24} />
            </div>
            <h3>Créer une campagne</h3>
            <p>Lancez une publicité Facebook en 5 étapes simples</p>
            <span className="dash-action-link">
              Commencer <ArrowRight size={14} />
            </span>
          </Link>

          <div className="dash-action-card">
            <div className="dash-action-icon ai">
              <Sparkles size={24} />
            </div>
            <h3>Générer du texte IA</h3>
            <p>
              {isPro
                ? 'Crédits illimités — Générez autant que vous voulez'
                : `${user?.ai_credits || 0}/3 crédits restants ce mois`
              }
            </p>
            <span className="dash-action-link">
              Essayer <ArrowRight size={14} />
            </span>
          </div>

          <Link to="/analytics" className="dash-action-card">
            <div className="dash-action-icon blue">
              <BarChart3 size={24} />
            </div>
            <h3>Voir les analytics</h3>
            <p>Suivez les performances de vos campagnes en temps réel</p>
            <span className="dash-action-link">
              Voir les stats <ArrowRight size={14} />
            </span>
          </Link>
        </div>

        {/* ── Upgrade Banner ── */}
        {plan === 'free' && (
          <div className="dash-upgrade-banner">
            <div className="dash-upgrade-content">
              <Zap size={20} />
              <div>
                <strong>Débloquez tout avec le plan PRO</strong>
                <p>Campagnes illimitées, IA avancée, analytics détaillés — 12,000 FCFA/mois</p>
              </div>
            </div>
            <Link to="/plans" className="dash-upgrade-btn">
              Passer à PRO
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
