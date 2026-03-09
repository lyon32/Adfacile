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

module.exports = { supabase, supabaseAdmin };
