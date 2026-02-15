# 📁 AdsFacile - Structure Fichiers Complète du Projet

```
adsfacile/
├── 📁 backend/
│   ├── 📁 src/
│   │   ├── 📁 config/
│   │   │   ├── supabase.js
│   │   │   ├── redis.js
│   │   │   ├── email.js
│   │   │   └── constants.js
│   │   │
│   │   ├── 📁 controllers/
│   │   │   ├── authController.js
│   │   │   ├── campaignController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── aiController.js
│   │   │   ├── facebookController.js
│   │   │   ├── paymentController.js
│   │   │   ├── competitorController.js
│   │   │   ├── userController.js
│   │   │   ├── notificationController.js
│   │   │   ├── templateController.js
│   │   │   └── websiteAuditController.js
│   │   │
│   │   ├── 📁 middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── checkOwnership.js
│   │   │   ├── checkPlanLimit.js
│   │   │   ├── rateLimiter.js
│   │   │   ├── validateRequest.js
│   │   │   ├── errorHandler.js
│   │   │   ├── requestLogger.js
│   │   │   └── cors.js
│   │   │
│   │   ├── 📁 routes/
│   │   │   ├── auth.js
│   │   │   ├── campaigns.js
│   │   │   ├── analytics.js
│   │   │   ├── ai.js
│   │   │   ├── facebook.js
│   │   │   ├── payments.js
│   │   │   ├── competitors.js
│   │   │   ├── users.js
│   │   │   ├── notifications.js
│   │   │   ├── templates.js
│   │   │   └── websiteAudit.js
│   │   │
│   │   ├── 📁 services/
│   │   │   ├── facebookMarketingService.js
│   │   │   ├── facebookAdLibraryService.js
│   │   │   ├── openaiService.js
│   │   │   ├── paymentService.js
│   │   │   ├── emailService.js
│   │   │   ├── websiteAuditService.js
│   │   │   ├── cronJobsService.js
│   │   │   └── notificationService.js
│   │   │
│   │   ├── 📁 utils/
│   │   │   ├── validation.js
│   │   │   ├── encryption.js
│   │   │   ├── jwt.js
│   │   │   ├── logger.js
│   │   │   ├── helpers.js
│   │   │   └── constants.js
│   │   │
│   │   ├── 📁 templates/
│   │   │   └── 📁 emails/
│   │   │       ├── welcome.html
│   │   │       ├── campaign-launched.html
│   │   │       ├── budget-alert.html
│   │   │       ├── payment-confirmation.html
│   │   │       ├── weekly-report.html
│   │   │       └── password-reset.html
│   │   │
│   │   └── server.js
│   │
│   ├── 📁 tests/
│   │   ├── 📁 unit/
│   │   │   ├── auth.test.js
│   │   │   ├── validation.test.js
│   │   │   └── encryption.test.js
│   │   ├── 📁 integration/
│   │   │   ├── auth.integration.test.js
│   │   │   ├── campaigns.integration.test.js
│   │   │   └── payments.integration.test.js
│   │   └── 📁 security/
│   │       ├── sql-injection.test.js
│   │       ├── xss.test.js
│   │       ├── idor.test.js
│   │       └── rate-limiting.test.js
│   │
│   ├── 📁 scripts/
│   │   ├── migrate.js
│   │   ├── seed.js
│   │   ├── smoke-tests.js
│   │   └── generate-report.js
│   │
│   ├── .env.example
│   ├── .gitignore
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── 📁 frontend/
│   ├── 📁 src/
│   │   ├── 📁 components/
│   │   │   ├── 📁 auth/
│   │   │   │   ├── LoginForm.jsx
│   │   │   │   ├── SignupForm.jsx
│   │   │   │   ├── ForgotPasswordForm.jsx
│   │   │   │   └── PasswordStrengthIndicator.jsx
│   │   │   │
│   │   │   ├── 📁 campaign/
│   │   │   │   ├── CampaignCard.jsx
│   │   │   │   ├── CampaignList.jsx
│   │   │   │   ├── CampaignStats.jsx
│   │   │   │   ├── CampaignPreview.jsx
│   │   │   │   └── wizard/
│   │   │   │       ├── WizardStepper.jsx
│   │   │   │       ├── Step1BasicInfo.jsx
│   │   │   │       ├── Step2Audience.jsx
│   │   │   │       ├── Step3Budget.jsx
│   │   │   │       ├── Step4Creative.jsx
│   │   │   │       └── Step5Review.jsx
│   │   │   │
│   │   │   ├── 📁 dashboard/
│   │   │   │   ├── KPICard.jsx
│   │   │   │   ├── PerformanceChart.jsx
│   │   │   │   ├── RecommendationCard.jsx
│   │   │   │   └── ActivityFeed.jsx
│   │   │   │
│   │   │   ├── 📁 analytics/
│   │   │   │   ├── AnalyticsOverview.jsx
│   │   │   │   ├── CampaignBreakdown.jsx
│   │   │   │   ├── AudienceInsights.jsx
│   │   │   │   └── ExportButton.jsx
│   │   │   │
│   │   │   ├── 📁 facebook/
│   │   │   │   ├── ConnectFacebook.jsx
│   │   │   │   ├── PlatformConnections.jsx
│   │   │   │   └── InstructionsModal.jsx
│   │   │   │
│   │   │   ├── 📁 ai/
│   │   │   │   ├── AITextGenerator.jsx
│   │   │   │   ├── AIImageGenerator.jsx
│   │   │   │   └── SmartAssistantChat.jsx
│   │   │   │
│   │   │   ├── 📁 billing/
│   │   │   │   ├── PricingCard.jsx
│   │   │   │   ├── PaymentModal.jsx
│   │   │   │   ├── InvoiceList.jsx
│   │   │   │   └── UsageMeter.jsx
│   │   │   │
│   │   │   ├── 📁 shared/
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Input.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Toast.jsx
│   │   │   │   ├── Spinner.jsx
│   │   │   │   ├── Badge.jsx
│   │   │   │   ├── Card.jsx
│   │   │   │   ├── Dropdown.jsx
│   │   │   │   ├── Pagination.jsx
│   │   │   │   ├── EmptyState.jsx
│   │   │   │   └── ErrorBoundary.jsx
│   │   │   │
│   │   │   └── 📁 layout/
│   │   │       ├── Sidebar.jsx
│   │   │       ├── Header.jsx
│   │   │       ├── Footer.jsx
│   │   │       └── DashboardLayout.jsx
│   │   │
│   │   ├── 📁 pages/
│   │   │   ├── Landing.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── ForgotPassword.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Campaigns.jsx
│   │   │   ├── CampaignCreate.jsx
│   │   │   ├── CampaignDetails.jsx
│   │   │   ├── Analytics.jsx
│   │   │   ├── Competitors.jsx
│   │   │   ├── SmartAssistant.jsx
│   │   │   ├── WebsiteAudit.jsx
│   │   │   ├── Templates.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── Billing.jsx
│   │   │   ├── Pricing.jsx
│   │   │   ├── Notifications.jsx
│   │   │   ├── FacebookCallback.jsx
│   │   │   ├── PaymentReturn.jsx
│   │   │   └── NotFound.jsx
│   │   │
│   │   ├── 📁 context/
│   │   │   ├── AuthContext.jsx
│   │   │   ├── NotificationContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   │
│   │   ├── 📁 hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useCampaigns.js
│   │   │   ├── useAnalytics.js
│   │   │   ├── useAI.js
│   │   │   ├── useNotifications.js
│   │   │   ├── useDebounce.js
│   │   │   ├── useLocalStorage.js
│   │   │   └── useWindowSize.js
│   │   │
│   │   ├── 📁 services/
│   │   │   ├── api.js
│   │   │   ├── authService.js
│   │   │   ├── campaignService.js
│   │   │   ├── analyticsService.js
│   │   │   ├── aiService.js
│   │   │   ├── facebookService.js
│   │   │   ├── paymentService.js
│   │   │   └── notificationService.js
│   │   │
│   │   ├── 📁 utils/
│   │   │   ├── validation.js
│   │   │   ├── formatters.js
│   │   │   ├── helpers.js
│   │   │   └── constants.js
│   │   │
│   │   ├── 📁 assets/
│   │   │   ├── 📁 images/
│   │   │   ├── 📁 icons/
│   │   │   └── 📁 fonts/
│   │   │
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   │
│   ├── 📁 tests/
│   │   ├── 📁 components/
│   │   ├── 📁 pages/
│   │   └── 📁 hooks/
│   │
│   ├── 📁 public/
│   │   ├── favicon.ico
│   │   ├── robots.txt
│   │   ├── sitemap.xml
│   │   └── manifest.json
│   │
│   ├── .env.example
│   ├── .gitignore
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── package.json
│   └── README.md
│
├── 📁 e2e/
│   ├── 📁 tests/
│   │   ├── auth.spec.js
│   │   ├── campaign-create.spec.js
│   │   ├── payment.spec.js
│   │   └── dashboard.spec.js
│   ├── playwright.config.js
│   └── package.json
│
├── 📁 docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── DEPLOYMENT.md
│   ├── CONTRIBUTING.md
│   └── RUNBOOK.md
│
├── 📁 .github/
│   ├── 📁 workflows/
│   │   ├── main.yml
│   │   ├── security.yml
│   │   └── codeql.yml
│   ├── 📁 ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .gitignore
├── README.md
└── CHANGELOG.md
```
