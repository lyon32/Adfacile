/**
 * Serveur Express Principal
 * AdsFacile Backend API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const logger = require('./utils/logger');

// Import des routes
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const userRoutes = require('./routes/users');
const billingRoutes = require('./routes/billing');
const facebookRoutes = require('./routes/facebook');
const facebookTargetingRoutes = require('./routes/facebookTargeting');
const campaignRoutes = require('./routes/campaigns');
const analyticsRoutes = require('./routes/analytics');

// Initialisation de l'application
const app = express();
const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════════════════════════
// CORS — DOIT être avant tout autre middleware
// ═══════════════════════════════════════════════════════════════════════════════

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000,http://localhost:4000')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`⚠️ CORS bloqué pour origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Répondre immédiatement aux requêtes preflight OPTIONS
app.options('*', cors());

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARES DE SÉCURITÉ
// ═══════════════════════════════════════════════════════════════════════════════

// Helmet - Sécurisation des en-têtes HTTP
app.use(helmet());

// Logging HTTP avec Morgan (connecté à Winston)
app.use(morgan('combined', { stream: { write: (message) => logger.http(message.trim()) } }));

// Rate Limiting - Limiter les requêtes répétées
const isDev = process.env.NODE_ENV !== 'production';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 0 : 100, // 0 = désactivé en dev
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer après 15 minutes' },
  skip: (req) => isDev || req.method === 'OPTIONS',
});
app.use(limiter);

// Rate Limiting spécifique pour l'authentification
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 0 : 10, // 0 = désactivé en dev
  message: { success: false, message: 'Trop de tentatives de connexion, veuillez réessayer plus tard' },
  skip: (req) => isDev || req.method === 'OPTIONS',
});
app.use('/api/auth/login', authLimiter);

// Rate Limiting spécifique pour l'IA (20 requêtes/minute)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Trop de requêtes IA, veuillez réessayer dans une minute',
});
app.use('/api/ai', aiLimiter);

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARES GÉNÉRAUX
// ═══════════════════════════════════════════════════════════════════════════════

// Parser JSON
app.use(express.json({ limit: '10mb' }));

// Parser URL-encoded
app.use(express.urlencoded({ extended: true }));

// Data Sanitization
app.use(xss()); // Protection contre XSS
app.use(hpp()); // Protection contre HTTP Parameter Pollution

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 AdsFacile API Secure',
    version: '1.0.0',
    docs: '/api/health'
  });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'AdsFacile API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/facebook/targeting', facebookTargetingRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/analytics', analyticsRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// GESTION DES ERREURS
// ═══════════════════════════════════════════════════════════════════════════════

// 404
app.use((req, res) => {
  logger.warn(`Route non trouvée: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
    path: req.path
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  logger.info(`🚀 AdsFacile Backend API running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
