import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, ChevronDown, ArrowRight } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import './PricingPage.css';

export const PricingPage = () => {
  return (
    <main>
      <HeroSection />
      <PricingSection />
      <ComparisonSection />
      <FAQSection />
      <CTASection />
    </main>
  );
};

const HeroSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="pricing-hero" ref={ref}>
      <div className="container">
        <div className={`pricing-hero-content ${isVisible ? 'visible' : ''}`}>
          <h1>Tarifs simples et transparents</h1>
          <p>
            Choisissez le plan qui correspond à vos besoins. 
            Tous les plans incluent un essai gratuit de 30 jours.
          </p>
        </div>
      </div>
    </section>
  );
};

const PricingSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const plans = [
    {
      name: 'Gratuit',
      description: 'Pour découvrir AdsFacile',
      price: '0',
      currency: 'FCFA',
      period: '/mois',
      features: [
        { text: '1 campagne par mois', included: true },
        { text: 'Recommandations de base', included: true },
        { text: 'Statistiques limitées', included: true },
        { text: 'Support par email', included: true },
        { text: 'Analyse de la concurrence', included: false },
        { text: 'Export des données', included: false },
        { text: 'API access', included: false }
      ],
      cta: 'Commencer gratuitement',
      featured: false
    },
    {
      name: 'Pro',
      description: 'Pour les entrepreneurs ambitieux',
      price: '10,000',
      currency: 'FCFA',
      period: '/mois',
      features: [
        { text: 'Campagnes illimitées', included: true },
        { text: 'Recommandations avancées', included: true },
        { text: 'Statistiques complètes', included: true },
        { text: 'Support prioritaire', included: true },
        { text: 'Analyse de la concurrence', included: true },
        { text: 'Export des données', included: true },
        { text: 'API access', included: false }
      ],
      cta: 'Essai gratuit 30 jours',
      featured: true
    },
    {
      name: 'Business',
      description: 'Pour les agences et grandes équipes',
      price: '25,000',
      currency: 'FCFA',
      period: '/mois',
      features: [
        { text: 'Tout de Pro inclus', included: true },
        { text: 'Multi-comptes (jusqu\'à 10)', included: true },
        { text: 'API access complet', included: true },
        { text: 'Manager dédié', included: true },
        { text: 'Formation personnalisée', included: true },
        { text: 'Rapports sur mesure', included: true },
        { text: 'SLA garanti', included: true }
      ],
      cta: 'Contacter les ventes',
      featured: false
    }
  ];

  return (
    <section className="pricing-cards section" ref={ref}>
      <div className="container">
        <div className={`pricing-grid ${isVisible ? 'visible' : ''}`}>
          {plans.map((plan, index) => (
            <div 
              key={index} 
              className={`pricing-card ${plan.featured ? 'featured' : ''}`}
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              <div className="pricing-header">
                <div className="pricing-name">{plan.name}</div>
                <div className="pricing-description">{plan.description}</div>
                <div className="pricing-price">
                  {plan.price}
                  <span> {plan.currency}{plan.period}</span>
                </div>
              </div>
              <ul className="pricing-features">
                {plan.features.map((feature, i) => (
                  <li key={i} className={feature.included ? '' : 'disabled'}>
                    {feature.included ? (
                      <Check size={18} className="check" />
                    ) : (
                      <X size={18} className="x" />
                    )}
                    {feature.text}
                  </li>
                ))}
              </ul>
              <Link 
                to="/contact" 
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'}`}
                style={{ width: '100%' }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="pricing-guarantee">
          <div className="guarantee-badge">
            🎯 Garantie satisfaction 30 jours
          </div>
          <p>
            Si vous n'êtes pas satisfait, nous vous remboursons intégralement. 
            Aucune question posée, aucune complication.
          </p>
        </div>
      </div>
    </section>
  );
};

const ComparisonSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const features = [
    { name: 'Campagnes par mois', free: '1', pro: 'Illimitées', business: 'Illimitées' },
    { name: 'Recommandations', free: 'Base', pro: 'Avancées', business: 'Avancées + IA' },
    { name: 'Analyse concurrence', free: false, pro: true, business: true },
    { name: 'Statistiques', free: 'Limitées', pro: 'Complètes', business: 'Temps réel' },
    { name: 'Support', free: 'Email', pro: 'Email + Chat', business: 'Prioritaire 24/7' },
    { name: 'Comptes Facebook', free: '1', pro: '1', business: 'Jusqu\'à 10' },
    { name: 'Export données', free: false, pro: true, business: true },
    { name: 'API access', free: false, pro: false, business: true },
    { name: 'Formation', free: false, pro: false, business: 'Personnalisée' },
    { name: 'Manager dédié', free: false, pro: false, business: true }
  ];

  return (
    <section className="comparison section section-alt" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Comparaison détaillée</h2>
          <p>Trouvez le plan parfait pour votre business</p>
        </div>
        <div className={`comparison-table-wrapper ${isVisible ? 'visible' : ''}`}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Fonctionnalité</th>
                <th>Gratuit</th>
                <th className="highlight">Pro</th>
                <th>Business</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <tr key={index}>
                  <td>{feature.name}</td>
                  <td>
                    {typeof feature.free === 'boolean' ? (
                      feature.free ? <Check size={18} className="check" /> : <X size={18} className="x" />
                    ) : (
                      feature.free
                    )}
                  </td>
                  <td className="highlight">
                    {typeof feature.pro === 'boolean' ? (
                      feature.pro ? <Check size={18} className="check" /> : <X size={18} className="x" />
                    ) : (
                      feature.pro
                    )}
                  </td>
                  <td>
                    {typeof feature.business === 'boolean' ? (
                      feature.business ? <Check size={18} className="check" /> : <X size={18} className="x" />
                    ) : (
                      feature.business
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td><Link to="/contact" className="btn btn-outline btn-sm">Choisir</Link></td>
                <td className="highlight"><Link to="/contact" className="btn btn-primary btn-sm">Choisir</Link></td>
                <td><Link to="/contact" className="btn btn-outline btn-sm">Contacter</Link></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
};

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: 'Puis-je changer de plan à tout moment ?',
      answer: 'Oui ! Vous pouvez passer à un plan supérieur ou inférieur à tout moment. Le changement prend effet immédiatement et nous calculons le prorata pour votre facturation.'
    },
    {
      question: 'Comment fonctionne l\'essai gratuit ?',
      answer: 'L\'essai gratuit de 30 jours vous donne accès à toutes les fonctionnalités du plan Pro. Aucune carte bancaire n\'est requise pour commencer. À la fin de l\'essai, vous pouvez choisir de continuer ou repasser au plan gratuit.'
    },
    {
      question: 'Quels moyens de paiement acceptez-vous ?',
      answer: 'Nous acceptons Mobile Money (MTN, Orange Money), les cartes bancaires (Visa, Mastercard), et les virements bancaires pour les entreprises. Tous les paiements sont sécurisés.'
    },
    {
      question: 'Y a-t-il des frais cachés ?',
      answer: 'Absolument aucun. Le prix affiché inclut toutes les fonctionnalités listées. Pas de surprise, pas de frais supplémentaires.'
    },
    {
      question: 'Que se passe-t-il si j\'annule ?',
      answer: 'Vous pouvez annuler à tout moment sans frais. Vos données restent accessibles pendant 30 jours après l\'annulation, vous permettant de les exporter si nécessaire.'
    }
  ];

  return (
    <section className="pricing-faq section" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Questions sur les tarifs</h2>
          <p>Tout ce que vous devez savoir avant de vous lancer</p>
        </div>
        <div className={`faq-container ${isVisible ? 'visible' : ''}`}>
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className={`faq-item ${openIndex === index ? 'open' : ''}`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <button 
                className="faq-question"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span>{faq.question}</span>
                <ChevronDown size={24} />
              </button>
              <div className="faq-answer">
                {faq.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const CTASection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="pricing-cta section section-alt" ref={ref}>
      <div className="container">
        <div className={`pricing-cta-content ${isVisible ? 'visible' : ''}`}>
          <h2>Des questions ? Parlons-en !</h2>
          <p>Notre équipe est là pour vous aider à choisir le plan idéal pour votre business.</p>
          <div className="pricing-cta-buttons">
            <Link to="/contact" className="btn btn-primary btn-lg">
              Nous contacter <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
