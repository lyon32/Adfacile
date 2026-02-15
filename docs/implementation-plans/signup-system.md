# AdsFacile Signup System - Implementation Plan

Complete signup system for AdsFacile B2B SaaS platform targeting Cameroonian entrepreneurs.

## Proposed Changes

### Backend - Node.js/Express + Supabase

#### [NEW] backend/package.json
- Express server configuration
- Dependencies: express, cors, dotenv, bcryptjs, jsonwebtoken, @supabase/supabase-js, express-validator

#### [NEW] backend/src/config/supabase.js
- Supabase client initialization with service key

#### [NEW] backend/src/utils/validation.js
- Email validation regex
- Phone validation (Cameroon +237 format)
- Password strength validation

#### [NEW] backend/src/middleware/validateSignup.js
- express-validator middleware for all signup fields

#### [NEW] backend/src/controllers/authController.js
- `signup()` function with:
  - Password hashing (bcrypt, 10 rounds)
  - User creation in Supabase
  - JWT generation (24h expiry)

#### [NEW] backend/src/routes/auth.js
- POST `/api/auth/signup` route

#### [NEW] backend/src/server.js
- Express app with CORS, JSON parsing
- Routes mounting
- Error handling middleware

---

### Frontend - React + Tailwind CSS

#### [NEW] src/services/api.js
- Axios instance with base URL from env
- Request/response interceptors

#### [NEW] src/utils/signupValidation.js
- Client-side validation functions
- Password strength calculation

#### [NEW] src/components/PasswordStrengthIndicator.jsx
- Visual progress bar component
- Dynamic color based on strength

#### [NEW] src/pages/SignupPage.jsx
- Complete signup form with Tailwind
- Real-time validation
- API integration
- Loading states
- Success redirect

#### [MODIFY] App.tsx
- Add `/signup` and `/dashboard` routes

---

### Configuration Files

#### [NEW] backend/.env.example
- Template for backend environment variables

#### [NEW] .env.example
- Template for frontend environment variables

---

### Documentation

#### [NEW] README-SIGNUP.md
- Setup instructions
- Environment variables
- API documentation
- Architecture overview

## Verification Plan

### Automated Tests
- Start backend: `cd backend && npm run dev`
- Start frontend: `npm run dev`
- Test signup endpoint with curl

### Manual Verification
- Test form validation in browser
- Test successful signup flow
- Verify JWT token and localStorage
