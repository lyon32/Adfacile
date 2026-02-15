import { Link } from 'react-router-dom';
import { 
  Facebook, 
  Target, 
  Zap, 
  BarChart3, 
  Rocket, 
  Settings,
  ArrowRight,
  Play,
  Database,
  Shield,
  Globe
} from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import './HowItWorksPage.css';

export const HowItWorksPage = () => {
  return (
    <main>
      <HeroSection />
      <StepsSection />
      <VideoSection />
      <DataSection />
      <CTASection />
    </main>
  );
};

const HeroSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="hiw-hero" ref={ref}>
      <div className="container">
        <div className={`hiw-hero-content ${isVisible ? 'visible' : ''}`}>
          <h1>Comment fonctionne AdsFacile ?</h1>
          <p>
            Découvrez comment créer des publicités Facebook performantes en quelques 
            minutes, même sans expérience en marketing digital.
          </p>
        </div>
      </div>
    </section>
  );
};

const StepsSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const steps = [
    {
      number: 1,
      icon: <Facebook size={40} />,
      title: 'Connectez votre compte Facebook Business',
      description: 'Reliez votre compte Facebook Business à AdsFacile en quelques clics. Notre intégration sécurisée via l\'API officielle de Facebook garantit la protection de vos données.',
      features: [
        'Connexion sécurisée OAuth 2.0',
        'Accès en lecture seule à vos statistiques',
        'Révocation possible à tout moment'
      ]
    },
    {
      number: 2,
      icon: <Target size={40} />,
      title: 'Définissez votre niche et localisation',
      description: 'Sélectionnez votre secteur d\'activité parmi notre liste de niches optimisées pour le marché africain. Choisissez vos villes cibles pour des recommandations localisées.',
      features: [
        '+50 niches disponibles',
        'Ciblage par ville et quartier',
        'Données démographiques africaines'
      ]
    },
    {
      number: 3,
      icon: <BarChart3 size={40} />,
      title: 'Analysez la concurrence',
      description: 'Notre IA analyse automatiquement les campagnes de vos concurrents pour identifier les stratégies gagnantes dans votre secteur.',
      features: [
        'Analyse des mots-clés utilisés',
        'Budget estimé des concurrents',
        'Audiences ciblées identifiées'
      ]
    },
    {
      number: 4,
      icon: <Zap size={40} />,
      title: 'Recevez des recommandations personnalisées',
      description: 'Obtenez des suggestions de mots-clés, audiences, et budgets optimaux basées sur les données réelles de milliers de campagnes africaines.',
      features: [
        'Mots-clés à fort potentiel',
        'Audiences à cibler en priorité',
        'Budget optimal recommandé'
      ]
    },
    {
      number: 5,
      icon: <Rocket size={40} />,
      title: 'Lancez votre campagne en 5 minutes',
      description: 'Créez et publiez votre campagne directement depuis AdsFacile. Suivez vos performances en temps réel sur notre tableau de bord intuitif.',
      features: [
        'Publication en un clic',
        'A/B testing automatique',
        'Statistiques en temps réel'
      ]
    }
  ];

  return (
    <section className="hiw-steps section" ref={ref}>
      <div className="container">
        <div className={`steps-timeline ${isVisible ? 'visible' : ''}`}>
          {steps.map((step, index) => (
            <div 
              key={index} 
              className="step-detail"
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              <div className="step-detail-number">{step.number}</div>
              <div className="step-detail-content">
                <div className="step-detail-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <ul className="step-features">
                  {step.features.map((feature, i) => (
                    <li key={i}>✅ {feature}</li>
                  ))}
                </ul>
              </div>
              <div className="step-detail-visual">
                <div className="step-mockup">
                  <div className="mockup-header">
                    <span></span><span></span><span></span>
                  </div>
                  <div className="mockup-content">
                    {step.icon}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const VideoSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="hiw-video section section-alt" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Voyez AdsFacile en action</h2>
          <p>Regardez notre tutoriel vidéo de 3 minutes pour tout comprendre</p>
        </div>
        <div className={`video-container ${isVisible ? 'visible' : ''}`}>
          <div className="video-wrapper">
            <div className="video-placeholder">
              <Play size={64} />
              <span>Cliquez pour voir la démo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const DataSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  const dataPoints = [
    {
      icon: <Database size={32} />,
      title: 'Données réelles africaines',
      description: 'Nos recommandations sont basées sur l\'analyse de milliers de campagnes réelles en Afrique francophone.'
    },
    {
      icon: <Globe size={32} />,
      title: 'Optimisé localement',
      description: 'Chaque recommandation prend en compte les spécificités culturelles et économiques de votre marché.'
    },
    {
      icon: <Shield size={32} />,
      title: 'Données sécurisées',
      description: 'Vos données sont cryptées et hébergées sur des serveurs sécurisés conformes aux normes RGPD.'
    },
    {
      icon: <Settings size={32} />,
      title: 'IA auto-apprenante',
      description: 'Notre algorithme s\'améliore continuellement grâce aux nouvelles données collectées.'
    }
  ];

  return (
    <section className="hiw-data section" ref={ref}>
      <div className="container">
        <div className="section-header">
          <h2>Basé sur des données réelles africaines</h2>
          <p>Notre technologie est conçue spécifiquement pour le marché africain</p>
        </div>
        <div className={`data-grid ${isVisible ? 'visible' : ''}`}>
          {dataPoints.map((item, index) => (
            <div 
              key={index} 
              className="data-card"
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              <div className="data-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
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
    <section className="hiw-cta section section-alt" ref={ref}>
      <div className="container">
        <div className={`hiw-cta-content ${isVisible ? 'visible' : ''}`}>
          <h2>Prêt à créer votre première campagne ?</h2>
          <p>Rejoignez des milliers d'entrepreneurs africains qui ont transformé leur marketing digital.</p>
          <div className="hiw-cta-buttons">
            <Link to="/signup" className="btn btn-primary btn-lg">
              Démarrer gratuitement <ArrowRight size={20} />
            </Link>
            <Link to="/tarifs" className="btn btn-outline btn-lg">
              Voir les tarifs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
