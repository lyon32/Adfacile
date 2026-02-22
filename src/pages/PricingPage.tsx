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
            Choisissez le plan qui correspond à votre business. 
            Plan Gratuit pour démarrer, PRO pour scaler, Agency pour gérer 
            plusieurs clients. Paiement simple par Mobile Money.
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
        { text: '1 campagne Facebook / mois', included: true },
        { text: '3 crédits IA / mois', included: true },
        { text: 'Dashboard stats basiques', included: true },
        { text: 'Connexion 1 compte Facebook', included: true },
        { text: 'Support par email', included: true },
        { text: 'Alertes email temps réel', included: false },
        { text: 'Analytics avancés', included: false },
        { text: 'Analyse de la concurrence', included: false },
        { text: 'Export des données PDF', included: false }
      ],
      cta: 'Commencer gratuitement',
      featured: false
    },
    {
      name: 'Starter',
      description: 'Pour les petits commerçants qui lancent',
      price: '5,000',
      currency: 'FCFA',
      period: '/mois',
      features: [
        { text: '5 campagnes / mois', included: true },
        { text: '20 crédits IA / mois', included: true },
        { text: 'Audit site web (1 fois/mois)', included: true },
        { text: 'Export rapports PDF', included: true },
        { text: 'Alertes email basiques', included: true },
        { text: 'Support email prioritaire', included: true },
        { text: 'Analytics avancés', included: false },
        { text: 'Analyse de la concurrence', included: false },
        { text: 'Multi-comptes Facebook', included: false }
      ],
      cta: 'Essai gratuit 30 jours',
      featured: false
    },
    {
      name: 'PRO',
      description: 'Pour les entrepreneurs qui veulent scaler',
      price: '12,000',
      currency: 'FCFA',
      period: '/mois',
      features: [
        { text: 'Campagnes illimitées', included: true },
        { text: 'Crédits IA illimités', included: true },
        { text: 'Analytics avancés complets', included: true },
        { text: 'Analyse de la concurrence', included: true },
        { text: 'Audit site web illimité', included: true },
        { text: 'Multi-comptes Facebook (5)', included: true },
        { text: 'Alertes email temps réel complètes', included: true },
        { text: 'Support email & chat dédié', included: true },
        { text: 'Export PDF illimité', included: true }
      ],
      cta: 'Essai gratuit 30 jours',
      featured: true
    },
    {
      name: 'Agency',
      description: 'Pour les agences qui gèrent plusieurs clients',
      price: '30,000',
      currency: 'FCFA',
      period: '/mois',
      features: [
        { text: 'Tout PRO inclus', included: true },
        { text: 'Comptes Facebook illimités', included: true },
        { text: 'Rapports marque blanche', included: true },
        { text: 'Tableau de bord multi-clients', included: true },
        { text: 'Accès API AdsFacile', included: true },
        { text: 'Account manager dédié', included: true },
        { text: 'Formation personnalisée', included: true },
        { text: 'Alertes email personnalisées', included: true },
        { text: 'SLA garanti', included: true }
      ],
      cta: 'Contacter les ventes',
      featured: false
    }
  ];

  return (
    <section className="pricing-cards section" ref={ref}>
      <div className="container">
        <div className={`pricing-grid pricing-grid-4 ${isVisible ? 'visible' : ''}`}>
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
    {
      name: 'Campagnes / mois',
      free: '1', starter: '5', pro: 'Illimitées', business: 'Illimitées'
    },
    {
      name: 'Crédits IA / mois',
      free: '3', starter: '20', pro: 'Illimités', business: 'Illimités'
    },
    {
      name: 'Génération textes pub IA',
      free: true, starter: true, pro: true, business: true
    },
    {
      name: 'Propositions ciblage IA',
      free: true, starter: true, pro: true, business: true
    },
    {
      name: 'Analytics avancés',
      free: false, starter: false, pro: true, business: true
    },
    {
      name: 'Analyse concurrence',
      free: false, starter: false, pro: true, business: true
    },
    {
      name: 'Audit site web',
      free: false, starter: '1/mois', pro: 'Illimité', business: 'Illimité'
    },
    {
      name: 'Export rapports PDF',
      free: false, starter: true, pro: true, business: true
    },
    {
      name: 'Alertes email temps réel',
      free: false, starter: 'Basiques', pro: 'Complètes', business: 'Personnalisées'
    },
    {
      name: 'Multi-comptes Facebook',
      free: false, starter: false, pro: '5 comptes', business: 'Illimités'
    },
    {
      name: 'Support',
      free: 'Email', starter: 'Email prioritaire', pro: 'Email + Chat', business: 'Account manager'
    },
    {
      name: 'Rapports marque blanche',
      free: false, starter: false, pro: false, business: true
    },
    {
      name: 'Accès API',
      free: false, starter: false, pro: false, business: true
    },
    {
      name: 'Formation personnalisée',
      free: false, starter: false, pro: false, business: true
    }
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
                <th>Starter</th>
                <th className="highlight">PRO</th>
                <th>Agency</th>
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
                  <td>
                    {typeof feature.starter === 'boolean' ? (
                      feature.starter 
                        ? <Check size={18} className="check" /> 
                        : <X size={18} className="x" />
                    ) : (
                      feature.starter
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
      answer: 'Oui ! Vous pouvez upgrader ou downgrader à tout moment. Le changement prend effet immédiatement et nous calculons le prorata pour votre facturation Mobile Money.'
    },
    {
      question: 'Comment fonctionne l\'essai gratuit 30 jours ?',
      answer: 'L\'essai gratuit vous donne accès à toutes les fonctionnalités du plan PRO pendant 30 jours. Aucun paiement requis pour commencer. À la fin de l\'essai, vous choisissez votre plan ou repassez au gratuit.'
    },
    {
      question: 'Quels moyens de paiement acceptez-vous ?',
      answer: 'Nous acceptons MTN Mobile Money et Orange Money. Le paiement est simple, rapide et 100% sécurisé depuis votre téléphone. Aucune carte bancaire nécessaire.'
    },
    {
      question: 'Y a-t-il des frais cachés ?',
      answer: 'Absolument aucun. Le prix affiché est le prix final. Pas de frais d\'installation, pas de commission sur vos campagnes, pas de surprise sur votre facture.'
    },
    {
      question: 'Que se passe-t-il si j\'annule mon abonnement ?',
      answer: 'Vous pouvez annuler à tout moment sans frais ni engagement. Vos données restent accessibles 30 jours après l\'annulation pour vous permettre de tout exporter.'
    },
    {
      question: 'Les crédits IA non utilisés sont-ils reportés ?',
      answer: 'Non, les crédits IA se réinitialisent le 1er de chaque mois. Avec le plan PRO et Agency, les crédits sont illimités donc cette question ne se pose plus.'
    },
    {
      question: 'Quelle est la différence entre PRO et Agency ?',
      answer: 'Le plan PRO est idéal pour un entrepreneur qui gère son propre business (jusqu\'à 5 comptes Facebook). Le plan Agency est fait pour les agences qui gèrent plusieurs clients : comptes illimités, rapports marque blanche, account manager dédié et accès à l\'API AdsFacile.'
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
          <p>Notre équipe est disponible sur WhatsApp pour vous aider à choisir le plan idéal et répondre à toutes vos questions.</p>
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
