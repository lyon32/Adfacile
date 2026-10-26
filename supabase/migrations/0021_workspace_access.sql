-- =====================================================================
-- Pubeka — migration 0021 (S19) : l'accès réel d'un espace dans la base (troisième barrière, SECURITY_NOTES §2.7)
-- Jusqu'ici `private.ws_writable()` ne lisait que `workspaces.status`. Or la grâce de 3 jours, la lecture seule après échéance et la
-- fin d'essai sont CALCULÉES à partir de l'abonnement (packages/billing, `workspaceAccess`) sans jamais écrire `workspaces.status` :
-- un éditeur dont l'abonnement était échu depuis plus de 3 jours pouvait donc encore écrire (pages, kit de marque, choix d'un
-- visuel, brouillons) en appelant PostgREST directement. `ws_writable` applique maintenant la MÊME règle que le code :
--   suspendu / lecture seule posés par l'administration passent avant tout ; sans abonnement : actif (l'essai démarre en S24) ;
--   abonnement `read_only` : lecture seule ; avant la fin de période : actif ; essai ou abonnement résilié échu : lecture seule
--   tout de suite ; sinon grâce de 72 h après la fin de période (ou jusqu'à `grace_until` si l'administration l'a prolongée),
--   puis lecture seule. Un test (supabase/tests/workspace-access.test.mjs + apps/web, `workspace-access.int.test.ts`) compare cette
--   règle à celle de TypeScript sur une grille de dates et d'états.
-- =====================================================================

begin;

-- La règle, sans lecture de table ni d'horloge : testable avec n'importe quelle date.
create or replace function private.access_at(
  stored public.workspace_status,
  sub_status public.subscription_status,
  period_end timestamptz,
  grace_until timestamptz,
  at timestamptz
) returns text language sql immutable set search_path = '' as $$
  select case
    when stored = 'suspended' then 'suspended'
    when stored = 'read_only' then 'read_only'
    when sub_status is null or period_end is null then 'active'
    when sub_status = 'read_only' then 'read_only'
    when at < period_end then 'active'
    when sub_status in ('trialing', 'canceled') then 'read_only'
    when at < (case when grace_until > period_end then grace_until else period_end + interval '72 hours' end) then 'grace'
    else 'read_only'
  end;
$$;

-- Accès réel d'un espace maintenant : `active`, `grace`, `read_only`, `suspended` (null si l'espace n'existe pas).
create or replace function private.ws_access(ws uuid)
returns text language sql stable security definer set search_path = '' as $$
  select private.access_at(w.status, s.status, s.period_end, s.grace_until, now())
  from public.workspaces w
  left join lateral (
    select sb.status, sb.period_end, sb.grace_until
    from public.subscriptions sb
    where sb.workspace_id = w.id
    order by sb.created_at desc
    limit 1
  ) s on true
  where w.id = ws;
$$;

-- Espace modifiable : actif ou en grâce. Même signature qu'en 0001 : les politiques RLS existantes en profitent sans changer.
create or replace function private.ws_writable(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.ws_access(ws) in ('active', 'grace'), false);
$$;

create index if not exists subscriptions_workspace_created_idx on public.subscriptions (workspace_id, created_at desc);

grant execute on function private.ws_writable(uuid) to authenticated, service_role;
grant execute on function private.ws_access(uuid) to service_role;
grant execute on function private.access_at(public.workspace_status, public.subscription_status, timestamptz, timestamptz, timestamptz) to service_role;

commit;
