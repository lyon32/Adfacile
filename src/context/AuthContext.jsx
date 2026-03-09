/**
 * Context d'authentification global
 * AdsFacile Frontend
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

/**
 * Hook pour accéder au contexte d'authentification
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};

/**
 * Provider d'authentification
 * Enveloppe l'app et fournit state + fonctions auth
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Vérifie l'authentification au chargement
   */
  const checkAuth = useCallback(() => {
    try {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        // Vérifier que le token n'a pas expiré côté client
        // (décodage simple du payload JWT sans vérification de signature)
        try {
          const base64Url = storedToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(atob(base64));
          const isExpired = payload.exp * 1000 < Date.now();

          if (isExpired) {
            // Token expiré, nettoyer
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            setToken(null);
            setIsAuthenticated(false);
            return false;
          }
        } catch (e) {
          console.error('Erreur auth context décodage:', e);
          // Si le décodage échoue, considérer le token comme invalide
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
          setToken(null);
          setIsAuthenticated(false);
          return false;
        }

        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setToken(storedToken);
        setIsAuthenticated(true);
        return true;
      }

      setIsAuthenticated(false);
      return false;
    } catch (error) {
      console.error('Erreur checkAuth:', error);
      setIsAuthenticated(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Connexion : stocker user et token
   * Retourne une promesse pour s'assurer que le state est à jour avant redirection
   */
  const login = useCallback((userData, authToken) => {
    return new Promise((resolve) => {
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      setToken(authToken);
      setIsAuthenticated(true);

      // Laisser React faire son cycle de rendu (state batching)
      setTimeout(() => {
        resolve(true);
      }, 0);
    });
  }, []);

  /**
   * Déconnexion : nettoyer state et localStorage
   */
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  /**
   * Mettre à jour les données utilisateur
   */
  const updateUser = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  /**
   * Re-fetch le profil utilisateur depuis le backend
   * Utile après un changement de plan, paiement, etc.
   */
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/users/me');
      if (res.data.success && res.data.data?.user) {
        const freshUser = res.data.data.user;
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
        return freshUser;
      }
    } catch (err) {
      console.error('Erreur refreshUser:', err);
    }
    return null;
  }, []);

  // Vérifier auth au montage
  useEffect(() => {
    const isAuth = checkAuth();
    // Refresh le profil en arrière-plan pour avoir les dernières données (plan, crédits)
    // Utile car le webhook CamPay ou l'auto-repair côté backend met à jour la base
    // sans que le localStorage du frontend ne soit au courant.
    if (isAuth) {
      refreshUser();
    }
  }, [checkAuth, refreshUser]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated,
    login,
    logout,
    checkAuth,
    updateUser,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
