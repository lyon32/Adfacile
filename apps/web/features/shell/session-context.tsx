'use client';
// Seul contexte React de la coque : ce qui est fixé au chargement (LLD §7.1). Les données qui
// changent (campagnes, soldes) passent par TanStack Query, jamais par ici.
import { createContext, useContext, type ReactNode } from 'react';
import type { Locale, Theme } from '@pubeka/i18n';

export type MemberRole = 'owner' | 'editor' | 'viewer';
export type PlanName = 'trial' | 'starter' | 'pro' | 'business';

export interface SessionValue {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: Locale;
  theme: Theme;
  workspace: {
    id: string;
    name: string;
    role: MemberRole;
    plan: PlanName;
    status: 'active' | 'grace' | 'read_only' | 'suspended';
    /** Fin de la grâce (ISO) : seulement utile quand `status` vaut `grace`. */
    graceUntil?: string | null;
  } | null;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}): ReactNode {
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession doit être appelé sous SessionProvider.');
  return value;
}

/** Nom affiché : prénom, sinon la partie locale de l'e-mail. */
export function displayName(
  session: Pick<SessionValue, 'firstName' | 'lastName' | 'email'>,
): string {
  const full = [session.firstName, session.lastName]
    .filter((p) => p !== null && p !== '')
    .join(' ');
  return full !== '' ? full : (session.email.split('@')[0] ?? session.email);
}

export function initialsOf(
  session: Pick<SessionValue, 'firstName' | 'lastName' | 'email'>,
): string {
  const parts = [session.firstName, session.lastName].filter((p): p is string => !!p);
  const letters =
    parts.length > 0 ? parts.map((p) => p.charAt(0)).join('') : session.email.slice(0, 2);
  return letters.slice(0, 2).toUpperCase();
}
