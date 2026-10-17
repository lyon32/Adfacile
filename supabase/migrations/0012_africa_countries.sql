-- =====================================================================
-- Pubeka — migration 0012 (S15b) : les 54 pays d'Afrique, chacun avec SA monnaie
-- Décision de la personne du 17/10/2026 : Pubeka prend en charge tous les pays d'Afrique, chaque pays avec sa monnaie et
-- son taux de change réel du marché (aucun taux unique, aucune valeur de repli).
--
-- Sources (rien n'est inventé) :
--  - pays : ISO 3166-1 alpha-2 (54 États africains membres de l'ONU) ; le Sahara occidental (EH) n'est PAS inclus (territoire
--    contesté, absent de la liste ONU) ;
--  - monnaies : ISO 4217 (SIX). Zimbabwe : ZWG (or du Zimbabwe, depuis avril 2024) ;
--  - noms FR et EN : CLDR (Intl.DisplayNames de Node 24, CLDR 48) ;
--  - fuseau par défaut : base de fuseaux IANA, zone.tab (https://github.com/eggert/tz/blob/main/zone.tab), fuseau de la
--    CAPITALE (RD Congo : deux fuseaux, Africa/Kinshasa retenu).
-- Idempotente : on peut la rejouer sans erreur ; `active` n'est jamais modifié (un pays désactivé le reste).
--
-- Le schéma de la 0001 limitait les taux de change à XAF et XOF et les sources à saspay/fallback/manual : ces contraintes sont
-- remplacées (aucune donnée supprimée). La table `vat_rates` et `ad_accounts.vat_country` restent dormantes.
-- =====================================================================

begin;

insert into public.countries (code, name_fr, name_en, currency, timezone_default) values
  ('DZ', 'Algérie', 'Algeria', 'DZD', 'Africa/Algiers'),
  ('AO', 'Angola', 'Angola', 'AOA', 'Africa/Luanda'),
  ('BJ', 'Bénin', 'Benin', 'XOF', 'Africa/Porto-Novo'),
  ('BW', 'Botswana', 'Botswana', 'BWP', 'Africa/Gaborone'),
  ('BF', 'Burkina Faso', 'Burkina Faso', 'XOF', 'Africa/Ouagadougou'),
  ('BI', 'Burundi', 'Burundi', 'BIF', 'Africa/Bujumbura'),
  ('CV', 'Cap-Vert', 'Cape Verde', 'CVE', 'Atlantic/Cape_Verde'),
  ('CM', 'Cameroun', 'Cameroon', 'XAF', 'Africa/Douala'),
  ('CF', 'République centrafricaine', 'Central African Republic', 'XAF', 'Africa/Bangui'),
  ('TD', 'Tchad', 'Chad', 'XAF', 'Africa/Ndjamena'),
  ('KM', 'Comores', 'Comoros', 'KMF', 'Indian/Comoro'),
  ('CG', 'Congo-Brazzaville', 'Congo - Brazzaville', 'XAF', 'Africa/Brazzaville'),
  ('CD', 'Congo-Kinshasa', 'Congo - Kinshasa', 'CDF', 'Africa/Kinshasa'),
  ('CI', 'Côte d’Ivoire', 'Côte d’Ivoire', 'XOF', 'Africa/Abidjan'),
  ('DJ', 'Djibouti', 'Djibouti', 'DJF', 'Africa/Djibouti'),
  ('EG', 'Égypte', 'Egypt', 'EGP', 'Africa/Cairo'),
  ('GQ', 'Guinée équatoriale', 'Equatorial Guinea', 'XAF', 'Africa/Malabo'),
  ('ER', 'Érythrée', 'Eritrea', 'ERN', 'Africa/Asmara'),
  ('SZ', 'Eswatini', 'Eswatini', 'SZL', 'Africa/Mbabane'),
  ('ET', 'Éthiopie', 'Ethiopia', 'ETB', 'Africa/Addis_Ababa'),
  ('GA', 'Gabon', 'Gabon', 'XAF', 'Africa/Libreville'),
  ('GM', 'Gambie', 'Gambia', 'GMD', 'Africa/Banjul'),
  ('GH', 'Ghana', 'Ghana', 'GHS', 'Africa/Accra'),
  ('GN', 'Guinée', 'Guinea', 'GNF', 'Africa/Conakry'),
  ('GW', 'Guinée-Bissau', 'Guinea-Bissau', 'XOF', 'Africa/Bissau'),
  ('KE', 'Kenya', 'Kenya', 'KES', 'Africa/Nairobi'),
  ('LS', 'Lesotho', 'Lesotho', 'LSL', 'Africa/Maseru'),
  ('LR', 'Liberia', 'Liberia', 'LRD', 'Africa/Monrovia'),
  ('LY', 'Libye', 'Libya', 'LYD', 'Africa/Tripoli'),
  ('MG', 'Madagascar', 'Madagascar', 'MGA', 'Indian/Antananarivo'),
  ('MW', 'Malawi', 'Malawi', 'MWK', 'Africa/Blantyre'),
  ('ML', 'Mali', 'Mali', 'XOF', 'Africa/Bamako'),
  ('MR', 'Mauritanie', 'Mauritania', 'MRU', 'Africa/Nouakchott'),
  ('MU', 'Maurice', 'Mauritius', 'MUR', 'Indian/Mauritius'),
  ('MA', 'Maroc', 'Morocco', 'MAD', 'Africa/Casablanca'),
  ('MZ', 'Mozambique', 'Mozambique', 'MZN', 'Africa/Maputo'),
  ('NA', 'Namibie', 'Namibia', 'NAD', 'Africa/Windhoek'),
  ('NE', 'Niger', 'Niger', 'XOF', 'Africa/Niamey'),
  ('NG', 'Nigeria', 'Nigeria', 'NGN', 'Africa/Lagos'),
  ('RW', 'Rwanda', 'Rwanda', 'RWF', 'Africa/Kigali'),
  ('ST', 'Sao Tomé-et-Principe', 'São Tomé & Príncipe', 'STN', 'Africa/Sao_Tome'),
  ('SN', 'Sénégal', 'Senegal', 'XOF', 'Africa/Dakar'),
  ('SC', 'Seychelles', 'Seychelles', 'SCR', 'Indian/Mahe'),
  ('SL', 'Sierra Leone', 'Sierra Leone', 'SLE', 'Africa/Freetown'),
  ('SO', 'Somalie', 'Somalia', 'SOS', 'Africa/Mogadishu'),
  ('ZA', 'Afrique du Sud', 'South Africa', 'ZAR', 'Africa/Johannesburg'),
  ('SS', 'Soudan du Sud', 'South Sudan', 'SSP', 'Africa/Juba'),
  ('SD', 'Soudan', 'Sudan', 'SDG', 'Africa/Khartoum'),
  ('TZ', 'Tanzanie', 'Tanzania', 'TZS', 'Africa/Dar_es_Salaam'),
  ('TG', 'Togo', 'Togo', 'XOF', 'Africa/Lome'),
  ('TN', 'Tunisie', 'Tunisia', 'TND', 'Africa/Tunis'),
  ('UG', 'Ouganda', 'Uganda', 'UGX', 'Africa/Kampala'),
  ('ZM', 'Zambie', 'Zambia', 'ZMW', 'Africa/Lusaka'),
  ('ZW', 'Zimbabwe', 'Zimbabwe', 'ZWG', 'Africa/Harare')
on conflict (code) do update
  set name_fr = excluded.name_fr,
      name_en = excluded.name_en,
      currency = excluded.currency,
      timezone_default = excluded.timezone_default;

-- ---- Taux de change : toutes les monnaies, une source de plus ------------------------------------------------------------
alter table public.exchange_rates drop constraint if exists exchange_rates_quote_check;
alter table public.exchange_rates
  add constraint exchange_rates_quote_check check (quote ~ '^[A-Z]{3}$');
alter table public.exchange_rates drop constraint if exists exchange_rates_source_check;
alter table public.exchange_rates
  add constraint exchange_rates_source_check check (source in ('saspay','fallback','manual','exchangerate-api'));

-- ---- Monnaie d'affichage du profil : n'importe quel code ISO 4217 ---------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_currency_display_check;
alter table public.profiles
  add constraint profiles_currency_display_check check (currency_display ~ '^[A-Z]{3}$');

-- ---- Campagne : monnaie du taux enregistré avec le brouillon (le nom fx_rate_xaf est historique) -----------------------------
alter table public.campaigns add column if not exists fx_currency char(3) check (fx_currency ~ '^[A-Z]{3}$');
comment on column public.campaigns.fx_rate_xaf is 'Taux de change enregistré avec le brouillon : unités de la monnaie fx_currency pour 1 $ (nom historique, valait pour le FCFA).';

commit;
