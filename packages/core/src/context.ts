// Contexte des cas d'usage (LLD §6.16). `core` ne connaît ni HTTP ni React : `apps/web`
// construit ce contexte dans `api()` et `jobs` construit un `ServiceCtx`.
import type { DbClient, ServiceClient } from '@pubeka/db';

export type Locale = 'fr' | 'en';
export type MemberRole = 'owner' | 'editor' | 'viewer';
export type PlanCode = 'starter' | 'pro' | 'business';
/** État d'accès de l'espace ; la règle complète (grâce, fin d'essai) arrive en S19. */
export type WorkspaceAccess = 'active' | 'grace' | 'read_only' | 'suspended';

export interface Ctx {
  requestId: string;
  user: { id: string; email: string; locale: Locale; timezone: string };
  /** Client soumis à la RLS (jeton de l'utilisateur). */
  db: DbClient;
  /** Client service : fonctions protégées uniquement. */
  svc: ServiceClient;
  now: () => Date;
}

export interface MemberCtx extends Ctx {
  workspace: { id: string; role: MemberRole; access: WorkspaceAccess };
}

export interface OwnerCtx extends MemberCtx {
  workspace: MemberCtx['workspace'] & { role: 'owner' };
}

/** Tâches de fond, webhooks et routes publiques : pas d'utilisateur. */
export interface ServiceCtx {
  requestId: string;
  svc: ServiceClient;
  now: () => Date;
}
