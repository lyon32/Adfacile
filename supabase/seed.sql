-- =====================================================================
-- Pubeka — données de développement local (`supabase db reset`).
-- Jamais appliqué en production. Formules, fournisseurs et réglages : migration 0001 (§18).
-- Ici : les pays de la zone franc CFA (devise et fuseau par défaut), utiles à la première configuration.
-- Les taux de TVA et de change ne sont PAS inventés ici : ils se règlent depuis l'administration.
-- =====================================================================
insert into public.countries (code, name_fr, name_en, currency, timezone_default) values
  ('CM', 'Cameroun',                 'Cameroon',                 'XAF', 'Africa/Douala'),
  ('GA', 'Gabon',                    'Gabon',                    'XAF', 'Africa/Libreville'),
  ('CG', 'Congo',                    'Congo',                    'XAF', 'Africa/Brazzaville'),
  ('TD', 'Tchad',                    'Chad',                     'XAF', 'Africa/Ndjamena'),
  ('CF', 'République centrafricaine','Central African Republic', 'XAF', 'Africa/Bangui'),
  ('GQ', 'Guinée équatoriale',       'Equatorial Guinea',        'XAF', 'Africa/Malabo'),
  ('SN', 'Sénégal',                  'Senegal',                  'XOF', 'Africa/Dakar'),
  ('CI', 'Côte d''Ivoire',           'Côte d''Ivoire',           'XOF', 'Africa/Abidjan'),
  ('BJ', 'Bénin',                    'Benin',                    'XOF', 'Africa/Porto-Novo'),
  ('BF', 'Burkina Faso',             'Burkina Faso',             'XOF', 'Africa/Ouagadougou'),
  ('ML', 'Mali',                     'Mali',                     'XOF', 'Africa/Bamako'),
  ('NE', 'Niger',                    'Niger',                    'XOF', 'Africa/Niamey'),
  ('TG', 'Togo',                     'Togo',                     'XOF', 'Africa/Lome'),
  ('GW', 'Guinée-Bissau',            'Guinea-Bissau',            'XOF', 'Africa/Bissau')
on conflict (code) do nothing;
