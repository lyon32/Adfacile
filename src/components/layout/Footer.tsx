import { Link } from 'react-router-dom';
import { Facebook, Twitter, Linkedin, Instagram, MessageCircle, Mail, MapPin, Phone } from 'lucide-react';
import './Footer.css';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-main">
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <span className="logo-icon">📢</span>
              <span className="logo-text">AdsFacile</span>
            </Link>
            <p className="footer-description">
              La plateforme SaaS qui aide les entreprises africaines à créer des publicités Facebook performantes.
            </p>
            <div className="footer-badge">
              🇨🇲 Fait au Cameroun, pour l'Afrique
            </div>
            <div className="footer-socials">
              <a href="#" aria-label="Facebook"><Facebook size={20} /></a>
              <a href="#" aria-label="Twitter"><Twitter size={20} /></a>
              <a href="#" aria-label="LinkedIn"><Linkedin size={20} /></a>
              <a href="#" aria-label="Instagram"><Instagram size={20} /></a>
            </div>
          </div>

          <div className="footer-links-group">
            <h4>Produit</h4>
            <ul>
              <li><Link to="/comment-ca-marche">Comment ça marche</Link></li>
              <li><Link to="/tarifs">Tarifs</Link></li>
              <li><Link to="/#features">Fonctionnalités</Link></li>
              <li><Link to="/#testimonials">Témoignages</Link></li>
            </ul>
          </div>

          <div className="footer-links-group">
            <h4>Ressources</h4>
            <ul>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Guide débutant</a></li>
              <li><a href="#">FAQ</a></li>
              <li><a href="#">API Documentation</a></li>
            </ul>
          </div>

          <div className="footer-links-group">
            <h4>Contact</h4>
            <ul className="footer-contact">
              <li>
                <Mail size={16} />
                <a href="mailto:contact@adsfacile.cm">contact@adsfacile.cm</a>
              </li>
              <li>
                <Phone size={16} />
                <a href="tel:+237699999999">+237 6 99 99 99 99</a>
              </li>
              <li>
                <MapPin size={16} />
                <span>Douala, Cameroun</span>
              </li>
            </ul>
            <a href="https://wa.me/237699999999" className="whatsapp-btn">
              <MessageCircle size={18} />
              Discuter sur WhatsApp
            </a>
          </div>
        </div>

        <div className="footer-markets">
          <span>Marchés cibles :</span>
          <div className="footer-flags">
            <span title="Cameroun">🇨🇲</span>
            <span title="Sénégal">🇸🇳</span>
            <span title="Côte d'Ivoire">🇨🇮</span>
            <span title="Nigeria">🇳🇬</span>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-legal">
            <a href="#">Mentions légales</a>
            <a href="#">Politique de confidentialité</a>
            <a href="#">CGU</a>
          </div>
          <p className="footer-copyright">
            © {currentYear} AdsFacile. Tous droits réservés.
          </p>
        </div>

        <div className="footer-trust">
          <span>🔒 Données sécurisées</span>
          <span>📘 Partenaire Facebook Marketing</span>
          <span>🇪🇺 Conforme RGPD</span>
        </div>
      </div>
    </footer>
  );
};
