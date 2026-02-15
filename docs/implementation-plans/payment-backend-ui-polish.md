# Implementation Plan - Payment Backend & UI Polish

## Backend Payment System (Completed)
- [x] Added `payments` table to SQLite.
- [x] Added `/api/payments/init` and `/api/payments/verify` endpoints.

## UI/UX Improvements & Localization

### Currency Update
#### [MODIFY] dashboard.html
- Replace "€" with "XAF" in "Budget Dépensé" card.
- Replace "€" with "XAF" in "Budget Quotidien" input label.

#### [MODIFY] index.html
- Replace any occurrences of "€" with "XAF".

### Visual Enhancement ("Nouvelle Campagne")
#### [MODIFY] styles.css
- Update `.campaign-form-card` to use glassmorphism effect.
- Enhance form inputs with better padding, borders, and focus effects.
- Add hover effects to form sections to make them feel "alive".

#### [MODIFY] dashboard.html
- Add icons to form section headers if missing.
- Ensure the layout uses the new classes.

## HTTPS Transition (Required for Facebook SDK)
### [NEW] Certificates generation
- Generate `key.pem` and `cert.pem` using OpenSSL.

### [MODIFY] server.js
- Import `https` and `fs`.
- Load SSL certificates.
- Create HTTPS server listening on 3443.
- Update console logs to show https URL.

## Verification Plan
- Open `dashboard.html` and verify "XAF" is used instead of "€".
- Check the "Nouvelle Campagne" form for the new glassmorphism look.
- Verify that inputs look premium and responsive.
