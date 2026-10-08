import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './context/AuthContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { HomePage } from './pages/HomePage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { PricingPage } from './pages/PricingPage';
import { ContactPage } from './pages/ContactPage';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { TestPage } from './pages/TestPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import BillingPage from './pages/BillingPage';
import CampaignsListPage from './pages/CampaignsListPage';
import CreateCampaignPage from './pages/CreateCampaignPage';
import FacebookCallback from './pages/FacebookCallback';
import AnalyticsPage from './pages/AnalyticsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import DataDeletionPage from './pages/DataDeletionPage';
import TermsPage from './pages/TermsPage';
import './styles/global.css';
import './styles/components.css';
import './styles/tailwind-campaigns.css';

// Layout conditionnel pour afficher ou non Header/Footer
const AppLayout = () => {
  const location = useLocation();

  // Pages sans Header/Footer (authentification, dashboard)
  const noLayoutPaths = ['/signup', '/login', '/forgot-password', '/reset-password', '/dashboard', '/profil', '/plans', '/campaigns', '/analytics', '/settings', '/facebook'];
  const hideLayout = noLayoutPaths.some(path => location.pathname.startsWith(path));

  return (
    <div className="app">
      {!hideLayout && <Header />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/comment-ca-marche" element={<HowItWorksPage />} />
        <Route path="/tarifs" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/test-sync" element={<TestPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        {/* Repli : lien tronqué ou sans jeton — la page explique et renvoie
            vers une nouvelle demande, au lieu d'une page blanche. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Dashboard pages — auth handled by DashboardLayout */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/plans" element={<BillingPage />} />
        <Route path="/campaigns" element={<CampaignsListPage />} />
        <Route path="/campaigns/new" element={<CreateCampaignPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<ProfilePage />} />
        <Route path="/facebook/callback" element={<FacebookCallback />} />
        {/* Legal pages for Facebook App compliance */}
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/data-deletion" element={<DataDeletionPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
      {!hideLayout && <Footer />}
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
      <Analytics debug={false} />
    </Router>
  );
}

export default App;
