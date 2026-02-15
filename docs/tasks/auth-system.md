# Auth System - Login, Forgot/Reset Password

## Backend
- [x] Install `express-rate-limit`
- [x] Add `password_resets` + `login_attempts` tables to `supabase-schema.sql` (provided by user)
- [x] Create `auth.js` middleware (JWT verification)
- [x] Create `rateLimiter.js` middleware
- [x] Add `login()` to `authController.js`
- [x] Add `forgotPassword()` to `authController.js`
- [x] Add `resetPassword()` to `authController.js`
- [x] Update `routes/auth.js` with new routes
- [x] Update `server.js` route listing

## Frontend
- [x] Create `AuthContext.jsx`
- [x] Create `ProtectedRoute.jsx`
- [x] Add `login`, `forgotPassword`, `resetPassword` to `api.js`
- [x] Create `LoginPage.jsx` + `AuthPages.css`
- [x] Create `ForgotPasswordPage.jsx`
- [x] Create `ResetPasswordPage.jsx`
- [x] Update `App.tsx` (AuthProvider, routes, ProtectedRoute)
- [x] Update `DashboardPage.jsx` to use AuthContext
- [x] Update `SignupPage.jsx` to use AuthContext
- [x] Fix 401 interceptor in `api.js` (redirect to /login)

## Verification
- [x] Build check

## À faire plus tard (après déploiement du site)
- [ ] Intégrer Nodemailer + Gmail (ou Resend avec domaine) pour envoyer les emails de reset password
- [ ] Supprimer l'affichage du token en mode dev une fois le service email configuré
