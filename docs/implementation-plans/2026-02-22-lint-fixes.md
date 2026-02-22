# Fix CI/CD Linting Errors

The CI/CD pipeline failed due to linting errors in the frontend. We will fix:
1.  **Ref usage in `useEffect` cleanups**: Capturing `ref.current` in a local variable inside the effect to ensure the cleanup function uses the correct node.
2.  **Ref access during render**: Destructuring hook returns in `HomePage.tsx` to avoid false positives from the linting rules that flag accessing objects containing refs during render.

## Proposed Changes

### [Component Name]

#### [MODIFY] [useScrollAnimation.ts](file:///c:/Users/DELL/Documents/GitHub/Adfacile/src/hooks/useScrollAnimation.ts)
- Modify `useScrollAnimation` effect to capture `ref.current` in a variable.
- Modify `useCounter` effect to capture `ref.current` in a variable.

#### [MODIFY] [HomePage.tsx](file:///c:/Users/DELL/Documents/GitHub/Adfacile/src/pages/HomePage.tsx)
- Destructure `stat1`, `stat2`, and `stat3` from `useCounter` to separate `ref` and `count`, resolving the "Cannot access refs during render" error.

## Verification Plan

### Automated Tests
- Run `npm run lint` locally to ensure all 9 problems are resolved.
- Run `npm run build` to ensure no regression in types or build process.
