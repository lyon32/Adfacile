// @pubeka/ui : composants purs pilotés par leurs propriétés (LLD §4). Styles : `@pubeka/ui/styles.css`.
export { cn } from './lib/cn';
export { usePrefersReducedMotion } from './lib/use-prefers-reduced-motion';
export { Button, buttonVariants, type ButtonProps } from './components/button';
export { Field, type FieldProps } from './components/field';
export { Switch } from './components/switch';
export { Card, CardTitle, CardDescription, Eyebrow } from './components/card';
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  type DialogContentProps,
} from './components/dialog';
export {
  Amount,
  formatLocalMoney,
  formatXaf,
  formatUsdApprox,
  type AmountProps,
  type UiLocale,
} from './components/amount';
export {
  StatusBadge,
  statusTone,
  CAMPAIGN_STATUSES,
  type CampaignStatus,
  type StatusBadgeProps,
} from './components/status-badge';
export { ModelCard, type ModelCardProps } from './components/model-card';
export {
  FullLoader,
  ShortLoader,
  OpeningLoader,
  PendingLoader,
  type FullLoaderProps,
  type OpeningLoaderProps,
  type PendingLoaderProps,
} from './loader/pubeka-loader';
export {
  claimFullLoader,
  fullLoaderDuration,
  FULL_LOADER_MS,
  FULL_LOADER_REDUCED_MS,
  FULL_LOADER_SESSION_KEY,
  SHORT_LOADER_DELAY_MS,
  type SessionFlagStore,
} from './loader/loader-policy';
