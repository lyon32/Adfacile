import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import './Header.css';

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Accueil' },
    { path: '/comment-ca-marche', label: 'Comment ça marche' },
    { path: '/tarifs', label: 'Tarifs' },
    { path: '/contact', label: 'Contact' }
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="header">
      <div className="container">
        <nav className="nav">
          <Link to="/" className="logo">
            <span className="logo-icon">📢</span>
            <span className="logo-text">AdsFacile</span>
          </Link>

          <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="nav-cta-mobile">
              <Link to="/contact" className="btn btn-secondary btn-sm" onClick={() => setIsMenuOpen(false)}>
                Connexion
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm" onClick={() => setIsMenuOpen(false)}>
                Démarrer gratuitement
              </Link>
            </div>
          </div>

          <div className="nav-cta">
            <Link to="/login" className="btn btn-outline btn-sm">
              Connexion
            </Link>
            <Link to="/signup" className="btn btn-primary btn-sm">
              Démarrer gratuitement
            </Link>
          </div>

          <button 
            className="menu-toggle" 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>
      </div>
    </header>
  );
};
