/**
 * Configuration Supabase Client
 * AdsFacile Backend
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Vérification des variables d'environnement requises
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL est requis dans le fichier .env');
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY est requis dans le fichier .env');
}

// Création du client Supabase avec la clé anon
// Note: Les Row Level Security policies doivent autoriser les insertions publiques
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Client Admin avec service_role key — bypass RLS pour opérations privilégiées
// (ex: activation de plan après paiement)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  : supabase; // Fallback si pas de service role key

// Sans cette clé, le dépôt des visuels est refusé par Supabase (403, « new row
// violates row-level security policy ») : la politique du bucket campaign-media
// n'accepte plus la clé anon. Mieux vaut le dire au démarrage qu'à la première
// publicité d'un utilisateur.
const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!serviceRoleConfigured) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY absente : le téléversement des visuels de campagne échouera.');
}

module.exports = { supabase, supabaseAdmin, serviceRoleConfigured };
