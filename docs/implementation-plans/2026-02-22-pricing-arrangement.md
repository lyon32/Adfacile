# Arrange Pricing Boxes & Fix Alignment

The pricing cards in `PricingPage.tsx` currently have uneven heights and misaligned CTA buttons because the feature lists vary in length. We will fix this by ensuring the cards use a flexible layout that pushes the buttons to the bottom, while also enhancing the visual "premium" feel.

## Proposed Changes

### [UI Components]

#### [MODIFY] [components.css](file:///c:/Users/DELL/Documents/GitHub/Adfacile/src/styles/components.css)
- Update `.pricing-card` to use a more robust `flex` layout.
- Add `flex-grow: 1` to `.pricing-features` to ensure it fills the space and pushes the button down.
- Add hover effects (shadow and scale) to the pricing cards for a premium feel.
- Improve the `featured` badge styling.

#### [MODIFY] [PricingPage.css](file:///c:/Users/DELL/Documents/GitHub/Adfacile/src/pages/PricingPage.css)
- Remove redundant `pricing-card` flex rules (consolidate in `components.css`).
- Ensure the `pricing-grid` has `align-items: stretch` so all cards in a row have equal height.

## Verification Plan

### Manual Verification
- View the `PricingPage` locally.
- Verify that all CTA buttons in a row are perfectly aligned at the bottom.
- Check that the cards have consistent spacing and a modern, premium look.
- Test responsive layout (mobile/tablet).
