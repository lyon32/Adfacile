/**
 * Dashboard Page — Page d'accueil du tableau de bord
 * AdsFacile Frontend
 * 
 * Utilise DashboardLayout pour le sidebar et le header
 */

import { Link, useSearchParams } from 'react-router-dom';
import {
  Target, Sparkles, BarChart3, ArrowRight,
  TrendingUp, Eye, DollarSign, Zap
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import ConnectFacebookButton from '../components/facebook/ConnectFacebookButton';
import { ConnectionsCard } from '../components/dashboard/ConnectionsCard';
import { SetupInstructions } from '../components/dashboard/SetupInstructions';
import { PaymentMethodCard } from '../components/billing/PaymentMethodCard';
import { ReconnectFacebookButton } from '../components/dashboard/ReconnectFacebookButton';

import { FacebookPreConnectionChecklist } from '../components/dashboard/FacebookPreConnectionChecklist';
import { useFacebook } from '../hooks/useFacebook';
import './DashboardPage.css';

const DashboardPage = () => {
  const { user } = useAuth();
  const { connected: facebookConnected, loading: facebookLoading, disconnect, getAuthUrl } = useFacebook();
  const [searchParams] = useSearchParams();
  const [connections, setConnections] = useState(null);
  const [permissionsData, setPermissionsData] = useState(null);

  const [isRedirecting, setIsRedirecting] = useState(false);

  const plan = user?.plan || 'free';
  const isPro = plan === 'pro' || plan === 'agency';

  // Fetch connection data
  const fetchData = useCallback(async () => {
    try {
      const connRes = await api.get('/facebook/connections');
      setConnections(connRes.data.connections);
      setPermissionsData(connRes.data.permissions || null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
  }, []);

  useEffect(() => {
    if (facebookConnected) {
      fetchData();
    }
  }, [facebookConnected, fetchData]);



  // Called when SetupInstructions refreshes connections
  const handleRefresh = useCallback((updatedConnections) => {
    if (updatedConnections) {
      setConnections(prev => ({
        ...prev,
        instagram: updatedConnections.instagram || prev?.instagram,
        whatsapp: updatedConnections.whatsapp || prev?.whatsapp
      }));
    }
  }, []);

  const handleChecklistReady = async () => {
    setIsRedirecting(true);
    try {
      if (getAuthUrl) {
        await getAuthUrl();
      } else {
        const res = await api.get('/facebook/auth/url');
        const url = res.data?.data?.authUrl || res.data?.authUrl;
        if (url) window.location.href = url;
      }
    } catch (err) {
      console.error('Erreur auth url:', err);
      setIsRedirecting(false);
    }
  };

  // Check for error params from OAuth redirect
  const noPageError = searchParams.get('no_page') === 'true';

  // Determine what to show — only ONE at a time
  const needsReconnect = facebookConnected &&
    permissionsData &&
    (!permissionsData.hasInstagramPermission || !permissionsData.hasWhatsAppPermission) &&
    connections?.hasPage;

  const showSetupInstructions = facebookConnected &&
    connections &&
    !needsReconnect;

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

        {/* ── Connexion Facebook & Plateformes ── */}
        {/* Loading state while checking Facebook connection */}
        {facebookLoading && (
          <div className="dash-facebook-loading">
            <div className="dash-loading-spinner" />
            <p>Vérification de la connexion Facebook…</p>
          </div>
        )}

        {/* SCENARIO 1: Not connected to Facebook (only after loading completes) */}
        {!facebookLoading && !facebookConnected && (
          <FacebookPreConnectionChecklist
            onReady={handleChecklistReady}
            isRedirecting={isRedirecting}
          />
        )}

        {/* SCENARIO 2: Connected but needs reconnection for permissions */}
        {needsReconnect && (
          <ReconnectFacebookButton permissions={permissionsData} reason="permissions" />
        )}

        {/* SCENARIO 3: Connected with proper permissions — show setup & status */}
        {showSetupInstructions && (
          <>

            <SetupInstructions
              hasPage={connections.hasPage}
              connections={connections}
              onRefresh={handleRefresh}
            />

            {/* Config & WhatsApp info below */}
            {connections.hasPage && (
              <>
                <ConnectionsCard
                  connections={connections}
                  onDisconnect={async () => {
                    if (window.confirm("Êtes-vous sûr de vouloir déconnecter votre compte Facebook ? Cela suspendra vos campagnes en cours.")) {
                      try {
                        await disconnect();
                        window.location.reload();
                      } catch (err) {
                        alert("Erreur lors de la déconnexion.");
                      }
                    }
                  }}
                />
                <PaymentMethodCard businessId={connections.whatsapp?.business_id} />
              </>
            )}
          </>
        )}

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
