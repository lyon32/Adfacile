import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Facebook,
  Target,
  BarChart3,
  Zap,
  TrendingUp,
  Clock,
  Users,
  ShoppingBag,
  UtensilsCrossed,
  GraduationCap,
  Megaphone,
  Check,
  X,
  ChevronDown,
  HelpCircle,
  DollarSign,
  Search,
  PieChart
} from 'lucide-react';
import { useState } from 'react';
import { useScrollAnimation, useCounter } from '../hooks/useScrollAnimation';
import './HomePage.css';

export const HomePage = () => {
  return (
    <main>
      <HeroSection />
      <StatsSection />
      <HowItWorksSection />
      <ProblemsSection />
      <FeaturesSection />
      <AudienceSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <BlogSection />
      <CTASection />
    </main>
  );
};

const HeroSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="hero" ref={ref}>
      <div className="container">
        <div className={`hero-content ${isVisible ? 'visible' : ''}`}>
          <div className="hero-badge">
            🇨🇲 Fait au Cameroun, pour l'Afrique
          </div>
          <h1>
            Créez des publicités Facebook qui{' '}
            <span className="hero-highlight">performent vraiment</span> en Afrique
          </h1>
          <p className="hero-subtitle">
            Basé sur l'analyse de milliers de campagnes africaines réussies.
            Optimisé pour <strong>Douala</strong>, <strong>Yaoundé</strong>, <strong>Dakar</strong>, <strong>Abidjan</strong> et <strong>Lagos</strong>.
          </p>
          <div className="hero-cta">
            <Link to="/signup" className="btn btn-primary btn-lg">
              Démarrer gratuitement <ArrowRight size={20} />
            </Link>
            <Link to="/comment-ca-marche" className="btn btn-secondary btn-lg">
              Voir une démo
            </Link>
          </div>
          <div className="hero-trust">
            <span>✅ Aucune carte bancaire requise</span>
            <span>✅ Annulez à tout moment</span>
            <span>✅ Support en français</span>
          </div>
          <div className="hero-flags">
            <span>Marchés disponibles :</span>
            <span title="Cameroun">🇨🇲</span>
            <span title="Sénégal">🇸🇳</span>
            <span title="Côte d'Ivoire">🇨🇮</span>
            <span title="Nigeria">🇳🇬</span>
          </div>
        </div>
        <div className={`hero-visual ${isVisible ? 'visible' : ''}`}>
          <div className="hero-dashboard">
            <div className="dashboard-header">
              <div className="dashboard-dots">
                <span></span><span></span><span></span>
              </div>
              <span>AdsFacile Dashboard</span>
            </div>
            <div className="dashboard-content">
              <div className="dashboard-stat">
                <TrendingUp size={24} />
                <div>
                  <strong>+156%</strong>
                  <span>ROI moyen</span>
                </div>
              </div>
              <div className="dashboard-stat">
                <DollarSign size={24} />
                <div>
                  <strong>-45%</strong>
                  <span>Coût par clic</span>
                </div>
              </div>
              <div className="dashboard-chart">
                <div className="chart-bar" style={{ height: '40%' }}></div>
                <div className="chart-bar" style={{ height: '65%' }}></div>
                <div className="chart-bar" style={{ height: '55%' }}></div>
                <div className="chart-bar" style={{ height: '80%' }}></div>
                <div className="chart-bar" style={{ height: '70%' }}></div>
                <div className="chart-bar active" style={{ height: '95%' }}></div>
              </div>
            </div>
          </div>
          <div className="hero-facebook-badge">
            <Facebook size={24} />
            <span>Intégration officielle</span>
          </div>
        </div>
      </div>
    </section>
  );
};

const StatsSection = () => {
  const { count: count1, ref: ref1 } = useCounter(10000, 2000);
  const { count: count2, ref: ref2 } = useCounter(45, 1500);
  const { count: count3, ref: ref3 } = useCounter(5, 1000);

  return (
    <section className="stats section-alt">
      <div className="container">
        <div className="stats-grid">
          <div className="stat-item" ref={ref1}>
            <div className="stat-number">{count1.toLocaleString()}+</div>
            <div className="stat-label">Campagnes créées</div>
          </div>
          <div className="stat-item" ref={ref2}>
            <div className="stat-number">{count2}%</div>
            <div className="stat-label">Réduction du CPC moyen</div>
          </div>
          <div className="stat-item" ref={ref3}>
            <div className="stat-number">{count3} min</div>
            <div className="stat-label">Pour créer une campagne</div>
          </div>
        </div>
      </div>
    </section>
  );
};

const HowItWorksSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const steps = [
    {
      number: 1,
      icon: <Facebook size={32} />,
      title: 'Connectez votre compte',
      description: 'Liez votre compte Facebook Business en quelques clics. Sécurisé et rapide.'
    },
    {
      number: 2,
      icon: <Target size={32} />,
      title: 'Choisissez votre niche',
      description: 'Sélectionnez votre secteur d\'activité et votre localisation cible.'
    },
    {
      number: 3,
      icon: <Zap size={32} />,
      title: 'Lancez votre campagne',
      description: 'Recevez des recommandations et créez votre campagne en 5 minutes.'
    }
  ];

  return (
    <section className="how-it-works section" id="how-it-works" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Comment ça marche ?</h2>
          <p>Créez votre première campagne publicitaire en 3 étapes simples</p>
        </div>
        <div className={`steps-grid ${isVisible ? 'visible' : ''}`}>
          {steps.map((step, index) => (
            <div key={index} className="step-card" style={{ animationDelay: `${index * 0.2}s` }}>
              <div className="step-number">{step.number}</div>
              <div className="step-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const ProblemsSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const problems = [
    {
      question: 'Vous ne savez pas quels mots-clés utiliser ?',
      solution: 'Notre IA analyse les campagnes réussies de votre secteur et vous suggère les meilleurs mots-clés.',
      icon: <Search size={28} />
    },
    {
      question: 'Vous gaspillez votre budget sur les mauvaises audiences ?',
      solution: 'Nous identifions les audiences les plus rentables basées sur des données réelles du marché africain.',
      icon: <Target size={28} />
    },
    {
      question: 'Vous n\'avez pas le temps de gérer vos campagnes ?',
      solution: 'Automatisez la création et l\'optimisation de vos campagnes. Plus de temps pour votre business.',
      icon: <Clock size={28} />
    }
  ];

  return (
    <section className="problems section section-alt" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Nous résolvons vos problèmes</h2>
          <p>Les défis quotidiens des entrepreneurs africains avec Facebook Ads</p>
        </div>
        <div className={`problems-grid ${isVisible ? 'visible' : ''}`}>
          {problems.map((problem, index) => (
            <div key={index} className="problem-card" style={{ animationDelay: `${index * 0.15}s` }}>
              <div className="problem-icon">{problem.icon}</div>
              <h3>{problem.question}</h3>
              <p>{problem.solution}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const FeaturesSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const features = [
    {
      icon: <BarChart3 size={28} />,
      title: 'Analyse automatique de la concurrence',
      description: 'Découvrez ce que font vos concurrents et dépassez-les.'
    },
    {
      icon: <Users size={28} />,
      title: 'Recommandations d\'audiences',
      description: 'Audiences ciblées basées sur votre niche et localisation.'
    },
    {
      icon: <DollarSign size={28} />,
      title: 'Estimation de budget optimale',
      description: 'Investissez le bon montant pour maximiser votre ROI.'
    },
    {
      icon: <Search size={28} />,
      title: 'Suggestions de mots-clés',
      description: 'Mots-clés populaires et performants pour votre secteur.'
    },
    {
      icon: <Zap size={28} />,
      title: 'Création rapide de campagne',
      description: 'De l\'idée au lancement en seulement 5 minutes.'
    },
    {
      icon: <PieChart size={28} />,
      title: 'Statistiques en temps réel',
      description: 'Suivez vos performances avec des dashboards intuitifs.'
    }
  ];

  return (
    <section className="features section" id="features" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Fonctionnalités clés</h2>
          <p>Tout ce dont vous avez besoin pour réussir vos campagnes publicitaires</p>
        </div>
        <div className={`features-grid ${isVisible ? 'visible' : ''}`}>
          {features.map((feature, index) => (
            <div key={index} className="card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="card-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const AudienceSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const audiences = [
    {
      icon: <ShoppingBag size={32} />,
      title: 'Boutiques e-commerce',
      description: 'Vendez plus de produits en ligne avec des publicités ciblées.'
    },
    {
      icon: <UtensilsCrossed size={32} />,
      title: 'Restaurants & services locaux',
      description: 'Attirez des clients locaux vers votre établissement.'
    },
    {
      icon: <GraduationCap size={32} />,
      title: 'Formateurs & coachs',
      description: 'Remplissez vos formations et augmentez votre audience.'
    },
    {
      icon: <Megaphone size={32} />,
      title: 'Agences marketing',
      description: 'Gérez plusieurs clients avec notre interface multi-comptes.'
    }
  ];

  return (
    <section className="audience section section-alt" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Pour qui ?</h2>
          <p>AdsFacile est conçu pour les entrepreneurs africains ambitieux</p>
        </div>
        <div className={`audience-grid ${isVisible ? 'visible' : ''}`}>
          {audiences.map((audience, index) => (
            <div key={index} className="audience-card" style={{ animationDelay: `${index * 0.15}s` }}>
              <div className="audience-icon">{audience.icon}</div>
              <h3>{audience.title}</h3>
              <p>{audience.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const TestimonialsSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const testimonials = [
    {
      content: 'Avant AdsFacile, je gaspillais 50,000 FCFA par mois sur des publicités inefficaces. Maintenant, je génère 3x plus de ventes avec le même budget !',
      author: 'Marie N.',
      role: 'Boutique de mode, Douala',
      initials: 'MN'
    },
    {
      content: 'En tant que restaurateur, je n\'avais pas le temps de gérer mes pubs. AdsFacile m\'a permis de créer mes campagnes en 5 minutes. Incroyable !',
      author: 'Jean-Pierre K.',
      role: 'Restaurant Le Délice, Yaoundé',
      initials: 'JK'
    },
    {
      content: 'Les recommandations d\'audience sont précises. J\'ai trouvé des clients que je n\'aurais jamais ciblés seul. Mon ROI a augmenté de 200%.',
      author: 'Aminata D.',
      role: 'Coach en développement personnel, Abidjan',
      initials: 'AD'
    }
  ];

  return (
    <section className="testimonials section" id="testimonials" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Ils nous font confiance</h2>
          <p>Découvrez les témoignages de nos clients satisfaits</p>
        </div>
        <div className={`testimonials-grid ${isVisible ? 'visible' : ''}`}>
          {testimonials.map((testimonial, index) => (
            <div key={index} className="testimonial-card" style={{ animationDelay: `${index * 0.15}s` }}>
              <div className="testimonial-content">
                "{testimonial.content}"
              </div>
              <div className="testimonial-author">
                <div className="testimonial-avatar">{testimonial.initials}</div>
                <div className="testimonial-info">
                  <h4>{testimonial.author}</h4>
                  <p>{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
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
    <section className="pricing-cards section section-alt" id="pricing" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Tarifs simples et transparents</h2>
          <p>Choisissez le plan adapté à vos besoins</p>
        </div>
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

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: 'Comment fonctionne l\'intégration avec Facebook ?',
      answer: 'AdsFacile se connecte de manière sécurisée à votre compte Facebook Business via l\'API officielle. Vous gardez le contrôle total de vos données et pouvez révoquer l\'accès à tout moment.'
    },
    {
      question: 'Dois-je avoir des connaissances en marketing ?',
      answer: 'Non ! AdsFacile est conçu pour les débutants. Notre IA vous guide à chaque étape et vous fournit des recommandations prêtes à l\'emploi. Aucune compétence technique requise.'
    },
    {
      question: 'Quels moyens de paiement acceptez-vous ?',
      answer: 'Nous acceptons Mobile Money (MTN, Orange Money), cartes bancaires (Visa, Mastercard), et virements bancaires. Les paiements sont sécurisés par des protocoles de cryptage avancés.'
    },
    {
      question: 'Puis-je utiliser AdsFacile pour plusieurs entreprises ?',
      answer: 'Avec le plan Business, vous pouvez gérer jusqu\'à 10 comptes Facebook différents depuis une seule interface. Idéal pour les agences marketing.'
    },
    {
      question: 'Combien de temps faut-il pour voir des résultats ?',
      answer: 'La plupart de nos clients voient une amélioration de leurs performances dès la première semaine. Les résultats varient selon votre secteur et budget publicitaire.'
    },
    {
      question: 'Proposez-vous une formation ou un accompagnement ?',
      answer: 'Oui ! Nous offrons des tutoriels vidéo gratuits, un blog avec des conseils pratiques, et un support client réactif. Le plan Business inclut une formation personnalisée.'
    }
  ];

  return (
    <section className="faq section" id="faq" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Questions fréquentes</h2>
          <p>Tout ce que vous devez savoir sur AdsFacile</p>
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

const BlogSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const articles = [
    {
      title: '5 erreurs à éviter sur Facebook Ads au Cameroun',
      excerpt: 'Découvrez les pièges les plus courants et comment les éviter pour maximiser votre ROI.',
      category: 'Conseils',
      readTime: '5 min'
    },
    {
      title: 'Comment cibler efficacement à Douala',
      excerpt: 'Guide complet pour atteindre votre audience idéale dans la capitale économique.',
      category: 'Tutoriel',
      readTime: '8 min'
    },
    {
      title: 'Budget pub : combien investir pour votre restaurant ?',
      excerpt: 'Calculez le budget optimal pour attirer des clients locaux vers votre établissement.',
      category: 'Guide',
      readTime: '6 min'
    }
  ];

  return (
    <section className="blog section section-alt" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Ressources & Conseils</h2>
          <p>Apprenez à maîtriser la publicité Facebook en Afrique</p>
        </div>
        <div className={`blog-grid ${isVisible ? 'visible' : ''}`}>
          {articles.map((article, index) => (
            <a key={index} href="#" className="blog-card" style={{ animationDelay: `${index * 0.15}s` }}>
              <div className="blog-image">
                <div className="blog-placeholder">
                  <HelpCircle size={48} />
                </div>
              </div>
              <div className="blog-content">
                <div className="blog-meta">
                  <span className="blog-category">{article.category}</span>
                  <span className="blog-time">{article.readTime}</span>
                </div>
                <h3>{article.title}</h3>
                <p>{article.excerpt}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

const CTASection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="cta-section section" ref={ref}>
      <div className="container">
        <div className={`cta-content ${isVisible ? 'visible' : ''}`}>
          <h2>Prêt à booster vos ventes ?</h2>
          <p>Rejoignez des milliers d'entrepreneurs africains qui ont transformé leur marketing avec AdsFacile.</p>
          <div className="cta-buttons">
            <Link to="/signup" className="btn btn-white btn-lg">
              Démarrer gratuitement <ArrowRight size={20} />
            </Link>
          </div>
          <p className="cta-note">1er mois offert • Aucune carte bancaire requise</p>
        </div>
      </div>
    </section>
  );
};