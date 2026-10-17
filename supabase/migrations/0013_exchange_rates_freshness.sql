-- =====================================================================
-- Pubeka — migration 0013 (S15b) : fraîcheur des taux de change et accès réservé au serveur
-- Source des taux : ExchangeRate-API, accès ouvert (https://www.exchangerate-api.com/docs/free), une mise à jour par jour.
--  - provider_updated_at : heure de publication des taux par le fournisseur (`time_last_update_unix`) ; sert à la fraîcheur
--    (un taux de plus de 48 h n'est plus utilisé) ;
--  - next_update_at : prochaine mise à jour annoncée (`time_next_update_unix`) ; la tâche planifiée ne rappelle pas avant ;
--  - un taux n'est écrit qu'une fois par publication du fournisseur (index unique) : la tâche est idempotente.
-- Les conditions du fournisseur INTERDISENT de redistribuer les taux : la table n'est plus lisible par les connectés
-- (le serveur la lit avec la clé de service pour calculer un coût, il ne publie jamais le tableau des taux).
-- =====================================================================

begin;

alter table public.exchange_rates
  add column if not exists provider_updated_at timestamptz,
  add column if not exists next_update_at timestamptz;

create unique index if not exists exchange_rates_quote_provider_uniq
  on public.exchange_rates (quote, provider_updated_at) where provider_updated_at is not null;
create index if not exists exchange_rates_quote_fetched_idx
  on public.exchange_rates (quote, fetched_at desc);

drop policy if exists fx_read on public.exchange_rates;
revoke select on public.exchange_rates from authenticated;

commit;
