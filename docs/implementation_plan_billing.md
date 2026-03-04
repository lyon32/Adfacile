# AdsFacile — Implementation Plan: Billing & CamPay Integration

## Goal Description
Implement a comprehensive billing system for AdsFacile allowing users to manage their subscription plans, view their payment history, and upgrade to premium plans (Starter, PRO, Agency) using Mobile Money via **CamPay** (MTN and Orange Money). The integration uses the CamPay Sandbox for testing.

## Proposed Changes

### Backend Billing API & Database
- **`backend/src/migrations/create_payments_table.sql`**: [NEW] SQL migration to create the `payments` table in Supabase with RLS policies, tracking `amount`, `target_plan`, `payment_method`, `operator`, `status`, and `campay_reference`.
- **`backend/src/config/campay.js`**: [NEW] Centralized CamPay configuration storing API URLs, sandbox test numbers, maximum test amounts, and pricing structures. Environment variables are loaded here.
- **`backend/src/services/campayService.js`**: [NEW] Core service handling all interactions with the CamPay API: authentication (`/token/`), payment collection (`/collect/`), status polling (`/transaction/:ref`), webhook signature validation, and mobile operator detection.
- **`backend/src/controllers/billingController.js`**: [MODIFY] Fully rewritten to integrate with CamPay and Supabase. Added logic for `initiateUpgrade` (calling CamPay), `checkPaymentStatusEndpoint` (polling for real-time updates and activating plans on success), `handleWebhook` (asynchronous payment validation), and `getPaymentHistory`.
- **`backend/src/routes/billing.js`**: [MODIFY] Exposed endpoints for `POST /upgrade`, `GET /payment/status`, `GET /payments`, and `POST /webhook` (public endpoint without auth for CamPay callback).
- **`backend/.env`**: [MODIFY] Added CamPay configuration variables (`CAMPAY_ENV`, `CAMPAY_APP_USERNAME`, `CAMPAY_APP_PASSWORD`, `CAMPAY_WEBHOOK_SECRET`).

### Frontend Billing Flow
- **`src/pages/BillingPage.jsx`**: [MODIFY] Fetches and displays the user's current subscription usage (AI credits, monthly campaigns), available plans, and a complete table of their *real* payment history fetching from `/api/billing/payments`. Added a Sandbox mode warning banner.
- **`src/components/billing/PaymentModal.jsx`**: [MODIFY] Rewritten to implement a stateful 3-step checkout flow: 
  1. Plan summary & annual discount hint.
  2. Mobile Money operator selection (MTN/Orange) and phone number input (+237...).
  3. Confirmation state that automatically polls `/api/billing/payment/status` every 3 seconds to update the UI (Success, Failed, Timeout) in real-time while the user validates on their phone.
- **`src/pages/BillingPage.css`**: [MODIFY] Added premium scoped styling for the CamPay sandbox badge, security footer, and USSD code display to match the AdsFacile high-end aesthetic.

## Verification Plan
1. **Database:** Verify the `payments` table is created in Supabase.
2. **Environment:** Ensure `.env` contains valid CamPay sandbox credentials.
3. **Sandbox Testing:**
   - Test an upgrade to PRO using MTN Success number (`237677777777`). Verify the modal waits, then shows Success, and the plan upgrades in DB.
   - Test an upgrade using Orange Failed number (`237699999990`). Verify the modal shows "Paiement échoué".
   - Test Webhook delivery using CamPay's simulator.
4. **Production Readiness:** Ensure changing `CAMPAY_ENV=production` properly disables the 25 XAF sandbox limit.
