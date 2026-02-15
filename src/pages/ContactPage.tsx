import { useState, FormEvent } from 'react';
import { Mail, Phone, MapPin, MessageCircle, Send, Clock } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import './ContactPage.css';

export const ContactPage = () => {
  return (
    <main>
      <HeroSection />
      <ContactSection />
    </main>
  );
};

const HeroSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="contact-hero" ref={ref}>
      <div className="container">
        <div className={`contact-hero-content ${isVisible ? 'visible' : ''}`}>
          <h1>Contactez-nous</h1>
          <p>
            Notre équipe est disponible pour répondre à toutes vos questions. 
            N'hésitez pas à nous contacter !
          </p>
        </div>
      </div>
    </section>
  );
};

const ContactSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Le nom est requis';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Le téléphone est requis';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Le message est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      // Simulate form submission
      setSubmitted(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <section className="contact-section section" ref={ref}>
      <div className="container">
        <div className={`contact-grid ${isVisible ? 'visible' : ''}`}>
          <div className="contact-info">
            <h2>Parlons de votre projet</h2>
            <p>
              Que vous ayez une question sur nos fonctionnalités, nos tarifs, 
              ou que vous souhaitiez simplement discuter de votre stratégie 
              publicitaire, nous sommes là pour vous aider.
            </p>

            <div className="contact-methods">
              <div className="contact-method">
                <div className="method-icon">
                  <Mail size={24} />
                </div>
                <div className="method-info">
                  <h4>Email</h4>
                  <a href="mailto:contact@adsfacile.cm">contact@adsfacile.cm</a>
                </div>
              </div>

              <div className="contact-method">
                <div className="method-icon">
                  <Phone size={24} />
                </div>
                <div className="method-info">
                  <h4>Téléphone</h4>
                  <a href="tel:+237699999999">+237 6 99 99 99 99</a>
                </div>
              </div>

              <div className="contact-method whatsapp">
                <div className="method-icon">
                  <MessageCircle size={24} />
                </div>
                <div className="method-info">
                  <h4>WhatsApp</h4>
                  <a href="https://wa.me/237699999999" target="_blank" rel="noopener noreferrer">
                    Discuter sur WhatsApp
                  </a>
                </div>
              </div>

              <div className="contact-method">
                <div className="method-icon">
                  <MapPin size={24} />
                </div>
                <div className="method-info">
                  <h4>Adresse</h4>
                  <span>Douala, Cameroun</span>
                </div>
              </div>

              <div className="contact-method">
                <div className="method-icon">
                  <Clock size={24} />
                </div>
                <div className="method-info">
                  <h4>Horaires</h4>
                  <span>Lun - Ven : 8h - 18h</span>
                </div>
              </div>
            </div>

            <div className="contact-badge">
              🇨🇲 Basé au Cameroun, nous servons toute l'Afrique francophone
            </div>
          </div>

          <div className="contact-form-wrapper">
            {submitted ? (
              <div className="form-success">
                <div className="success-icon">✅</div>
                <h3>Message envoyé !</h3>
                <p>
                  Merci pour votre message. Notre équipe vous répondra 
                  dans les 24 heures.
                </p>
                <button 
                  className="btn btn-outline"
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
                  }}
                >
                  Envoyer un autre message
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <h3>Envoyez-nous un message</h3>

                <div className="form-group">
                  <label className="form-label" htmlFor="name">Nom complet *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    placeholder="Votre nom"
                    value={formData.name}
                    onChange={handleChange}
                  />
                  {errors.name && <span className="form-error">{errors.name}</span>}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      className={`form-input ${errors.email ? 'error' : ''}`}
                      placeholder="votre@email.com"
                      value={formData.email}
                      onChange={handleChange}
                    />
                    {errors.email && <span className="form-error">{errors.email}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="phone">Téléphone *</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      className={`form-input ${errors.phone ? 'error' : ''}`}
                      placeholder="+237 6XX XX XX XX"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                    {errors.phone && <span className="form-error">{errors.phone}</span>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="subject">Sujet</label>
                  <select
                    id="subject"
                    name="subject"
                    className="form-select"
                    value={formData.subject}
                    onChange={handleChange}
                  >
                    <option value="">Sélectionnez un sujet</option>
                    <option value="demo">Demande de démo</option>
                    <option value="pricing">Question sur les tarifs</option>
                    <option value="support">Support technique</option>
                    <option value="partnership">Partenariat</option>
                    <option value="other">Autre</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="message">Message *</label>
                  <textarea
                    id="message"
                    name="message"
                    className={`form-textarea ${errors.message ? 'error' : ''}`}
                    placeholder="Comment pouvons-nous vous aider ?"
                    value={formData.message}
                    onChange={handleChange}
                  />
                  {errors.message && <span className="form-error">{errors.message}</span>}
                </div>

                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                  <Send size={20} />
                  Envoyer le message
                </button>

                <p className="form-note">
                  * Champs obligatoires. Nous répondons généralement sous 24h.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
