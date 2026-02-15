# Complete Auth System: Login + Forgot/Reset Password

Implementation of login, forgot-password, reset-password, AuthContext, ProtectedRoute and related backend endpoints for AdsFacile. Integrates with the existing signup system.

---

## Proposed Changes

### Backend - Database Schema

#### [MODIFY] supabase-schema.sql
- Add `password_resets` table: `id`, `email`, `token`, `expires_at`, `used`, `created_at`
- Add `login_attempts` table: `id`, `user_id`, `ip_address`, `user_agent`, `success`, `created_at`
- Add RLS policies for both new tables

---

### Backend - Middleware

#### [NEW] middleware/auth.js
- JWT verification middleware: extract Bearer token → `jwt.verify()` → attach `req.user`
- Returns 401 if token missing/invalid

#### [NEW] middleware/rateLimiter.js
- `loginLimiter`: 5 attempts / 15 min per IP
- `forgotPasswordLimiter`: 3 attempts / 1 hour per IP
- `resetPasswordLimiter`: 5 attempts / 1 hour per IP

---

### Backend - Controller & Routes

#### [MODIFY] authController.js
Add 3 new functions:

| Function | Logic |
|---|---|
| `login()` | Detect email/phone → find user → bcrypt.compare → update `last_login_at` → sign JWT (24h or 30d) → return user+token |
| `forgotPassword()` | Find email → generate `crypto.randomBytes(32)` token → store in `password_resets` → return generic message (+ token in dev) |
| `resetPassword()` | Validate token not expired → hash new password → update `users.password_hash` → delete used token |

#### [MODIFY] routes/auth.js
- `POST /login` with validation rules + `loginLimiter`
- `POST /forgot-password` with email validation + `forgotPasswordLimiter`
- `POST /reset-password` with token/password validation + `resetPasswordLimiter`

#### [MODIFY] server.js
- Update route listing in startup log

---

### Frontend - Auth Infrastructure

#### [NEW] AuthContext.jsx
- State: `user`, `token`, `loading`, `isAuthenticated`
- Functions: `login()`, `logout()`, `checkAuth()`, `updateUser()`
- On mount: check localStorage for existing session
- Provider wraps entire app

#### [NEW] ProtectedRoute.jsx
- Uses `useAuth()` → if not authenticated redirects to `/login`

---

### Frontend - Pages

#### [NEW] LoginPage.jsx + LoginPage.css
- Same dark gradient two-column layout as SignupPage
- Identifier field (email or phone), password with toggle, remember me, forgot-password link
- OAuth placeholders, link to signup

#### [NEW] ForgotPasswordPage.jsx + ForgotPasswordPage.css
- Email input only, success message after submit, link back to login

#### [NEW] ResetPasswordPage.jsx + ResetPasswordPage.css
- Token from URL, two password fields + strength indicator
- Success → auto redirect to login after 3s
- Invalid token → error + link to forgot-password

---

### Frontend - Modifications

#### [MODIFY] api.js
- Add `login()`, `forgotPassword()`, `resetPassword()` API functions
- Fix 401 interceptor to redirect to `/login` instead of `/signup`

#### [MODIFY] App.tsx
- Wrap with `AuthProvider`
- Add routes: `/login`, `/forgot-password`, `/reset-password/:token`
- Wrap `/dashboard` with `ProtectedRoute`
- Add auth pages to `noLayoutPaths`

#### [MODIFY] DashboardPage.jsx
- Use `useAuth()` instead of raw localStorage
- Use `logout()` from context

#### [MODIFY] SignupPage.jsx
- Call `login()` from AuthContext after successful signup

---

## Verification Plan

### Manual Testing

1. **Login Flow**: Navigate to `/login`, enter email+password of an existing account → should redirect to `/dashboard`
2. **Login with Phone**: Enter phone number instead of email → should work the same
3. **Wrong Password**: Enter wrong password → red error alert, no redirect
4. **Remember Me**: Check "remember me" → token should have 30d expiry
5. **Forgot Password**: Click "Mot de passe oublié" → enter email → should show success message with reset token (dev mode)
6. **Reset Password**: Navigate to `/reset-password/{token}` → enter new password → should show success and redirect to login
7. **Protected Route**: Try accessing `/dashboard` while logged out → should redirect to `/login`
8. **Logout**: Click logout on dashboard → should clear session and redirect to `/login`
9. **Session Persistence**: Login → refresh page → should remain authenticated
10. **Rate Limiting**: Send 6 rapid login requests → 6th should return 429

### Backend API Testing (curl)
```bash
# Test login
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"test@test.com\",\"password\":\"Test1234\"}"

# Test forgot-password
curl -X POST http://localhost:5000/api/auth/forgot-password -H "Content-Type: application/json" -d "{\"email\":\"test@test.com\"}"

# Test reset-password (use token from forgot-password response)
curl -X POST http://localhost:5000/api/auth/reset-password -H "Content-Type: application/json" -d "{\"token\":\"TOKEN_HERE\",\"newPassword\":\"NewPass1234\",\"confirmPassword\":\"NewPass1234\"}"
```
