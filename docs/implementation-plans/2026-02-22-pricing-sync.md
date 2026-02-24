# Synchronize Pricing Plans: Home Page & Pricing Page

The Home Page currently shows 3 plans with outdated pricing (10k, 25k). The Pricing Page has been updated to 4 plans (Gratuit, Starter, PRO, Agency) with new pricing. We will synchronize the Home Page to match.

## Proposed Changes

### [UI Components]

#### [MODIFY] [HomePage.tsx](file:///c:/Users/DELL/Documents/GitHub/Adfacile/src/pages/HomePage.tsx)
- Update the `plans` array in `PricingSection` to match `PricingPage.tsx`:
    - **Gratuit**: 0 FCFA/mois
    - **Starter**: 5,000 FCFA/mois
    - **PRO**: 12,000 FCFA/mois
    - **Agency**: 30,000 FCFA/mois
- Update features and CTAs to align with the new structure.

## Verification Plan

### Manual Verification
- View the `HomePage` locally and verify the 4 pricing cards are displayed with the correct prices.
- Verify that the layout remains clean and aligned (the grid should handle 4 cards correctly now).
