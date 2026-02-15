/**
 * Dashboard Page
 * AdsFacile Frontend
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DashboardPage = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    // La redirection sera gérée par ProtectedRoute
    window.location.href = '/login';
  };

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid #e2e8f0',
          borderTopColor: '#10b981',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header du Dashboard */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 64
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📢</span>
            <span style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #10b981, #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              AdsFacile
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '3rem 1rem'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
          border: '1px solid #f1f5f9',
          padding: '2rem'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#ecfdf5',
              marginBottom: '1rem'
            }}>
              <span style={{ fontSize: '2rem' }}>🎉</span>
            </div>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '0.5rem'
            }}>
              Bienvenue, {user.first_name || user.email.split('@')[0]} !
            </h1>
            <p style={{
              color: '#6b7280',
              marginBottom: '2rem'
            }}>
              Votre compte a été créé avec succès. Vous êtes prêt à lancer vos premières publicités.
            </p>

            {/* Infos utilisateur */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: 400,
              margin: '0 auto 2rem'
            }}>
              <h3 style={{ fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>Vos informations</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
                {[
                  ['Email', user.email],
                  ['Téléphone', user.phone],
                  ['Ville', user.city],
                  ['Plan', user.plan],
                  ['Crédits IA', user.ai_credits]
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>{label}</span>
                    <span style={{ fontWeight: 500 }}>
                      {label === 'Plan' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.125rem 0.625rem',
                          borderRadius: 9999,
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          background: '#ecfdf5',
                          color: '#059669',
                          textTransform: 'capitalize'
                        }}>{value}</span>
                      ) : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Link
                to="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                }}
              >
                Créer ma première campagne
              </Link>
              <Link
                to="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #e5e7eb',
                  color: '#374151',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                Retour à l'accueil
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
