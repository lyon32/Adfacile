import {
  Home,
  LayoutGrid,
  Megaphone,
  Settings,
  CreditCard,
  BarChart3,
  LifeBuoy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavKey = 'home' | 'campaigns' | 'visuals' | 'stats' | 'billing' | 'settings' | 'help';

export interface NavItem {
  href: string;
  key: NavKey;
  icon: LucideIcon;
}

// APPFLOW §2.1 : MENU puis COMPTE.
export const MENU_ITEMS: readonly NavItem[] = [
  { href: '/', key: 'home', icon: Home },
  { href: '/campagnes', key: 'campaigns', icon: Megaphone },
  { href: '/visuels', key: 'visuals', icon: LayoutGrid },
  { href: '/statistiques', key: 'stats', icon: BarChart3 },
];

export const ACCOUNT_ITEMS: readonly NavItem[] = [
  { href: '/abonnement', key: 'billing', icon: CreditCard },
  { href: '/reglages/profil', key: 'settings', icon: Settings },
  { href: '/support', key: 'help', icon: LifeBuoy },
];

/** Onglets du téléphone (APPFLOW §2.2) ; « Compte » ouvre le panneau du compte. */
export const TAB_ITEMS: readonly NavItem[] = MENU_ITEMS.slice(0, 3);

/** Vrai si `pathname` est la page `href` ou l'une de ses sous-pages (`/` : seulement l'accueil). */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  const base = href.startsWith('/reglages') ? '/reglages' : href;
  return pathname === base || pathname.startsWith(`${base}/`);
}
