# Auth System — Implementation Walkthrough

Complete login, forgot-password, and reset-password system integrated with the existing signup.

## What was built

### Backend (5 files)

| File | Description |
|------|-------------|
| authController.js | `login()`, `forgotPassword()`, `resetPassword()` + login attempt logging |
| auth.js | JWT verification middleware (Bearer token → `req.user`) |
| rateLimiter.js | Rate limiting: login 5/15min, forgot 3/1h, reset 5/1h |
| routes/auth.js | All 4 auth routes with validation + rate limiting |
| server.js | Updated startup log |

### Frontend (10 files)

| File | Description |
|------|-------------|
| AuthContext.jsx | Global auth state: user, token, login/logout, JWT expiry check |
| ProtectedRoute.jsx | Redirects to `/login` if unauthenticated, saves return URL |
| api.js | Added `login()`, `forgotPassword()`, `resetPassword()` + fixed 401→`/login` |
| LoginPage.jsx | Email/phone login, remember me, password toggle, OAuth placeholders |
| ForgotPasswordPage.jsx | Email input → success state + dev token display |
| ResetPasswordPage.jsx | Token from URL, password strength, 3s countdown redirect |
| AuthPages.css | Shared CSS for all auth pages (dark gradient, responsive) |
| App.tsx | AuthProvider, new routes, ProtectedRoute on `/dashboard` |
| DashboardPage.jsx | Now uses `useAuth()` instead of raw localStorage |
| SignupPage.jsx | Uses AuthContext `login()` after signup |

## API Endpoints

| Method | Route | Auth | Rate Limit |
|--------|-------|------|------------|
| POST | `/api/auth/signup` | ❌ | — |
| POST | `/api/auth/login` | ❌ | 5/15min |
| POST | `/api/auth/forgot-password` | ❌ | 3/1h |
| POST | `/api/auth/reset-password` | ❌ | 5/1h |

## Security Features

- **Timing attack protection**: bcrypt hash even when user not found
- **Generic error messages**: "Identifiants incorrects" (no email/password leak)
- **Login attempt logging**: every attempt logged to `login_attempts` table
- **JWT expiry**: 24h default, 30d with "remember me"
- **Client-side JWT check**: AuthContext decodes token payload to check expiry
- **Rate limiting**: per-IP limits on all auth endpoints

## Verification

✅ **Vite build** passes with no errors (built in 3.88s)

## Manual Testing Instructions

> **IMPORTANT**: Make sure you've run the SQL script in your Supabase SQL Editor **before** testing the login flow.

1. **Restart backend** to pick up new routes (nodemon should auto-restart)
2. Visit `http://localhost:5173/login` — login page should render
3. Visit `http://localhost:5173/forgot-password` — forgot password page
4. Visit `http://localhost:5173/dashboard` — should redirect to `/login`
5. Sign up a new account → verify it redirects to dashboard
6. Log out → log back in with email/password
7. Test forgot-password → copy dev token → visit reset-password URL
