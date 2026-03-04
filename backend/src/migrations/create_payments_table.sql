-- ═══════════════════════════════════════════════════════════════════════════════
-- Payments Table — CamPay Mobile Money
-- AdsFacile Database
--
-- Run this SQL on your Supabase SQL editor to create the payments table
-- ═══════════════════════════════════════════════════════════════════════════════

-- Activer uuid-ossp si pas déjà fait
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Montants
    amount DECIMAL(10, 2) NOT NULL,           -- Montant facturé (sandbox: 25 XAF)
    real_amount DECIMAL(10, 2),               -- Montant réel du plan (ex: 12000 XAF)
    currency VARCHAR(3) DEFAULT 'XAF',

    -- Plan cible
    target_plan VARCHAR(20) NOT NULL,         -- 'starter', 'pro', 'agency'

    -- Paiement Mobile Money
    payment_method VARCHAR(20),               -- 'mtn' ou 'orange'
    phone_number VARCHAR(20),                 -- +237XXXXXXXXX
    operator VARCHAR(20),                     -- MTN ou ORANGE

    -- Statut
    status VARCHAR(20) DEFAULT 'pending',     -- pending, successful, failed

    -- Références
    campay_reference VARCHAR(255),            -- Référence CamPay
    external_reference VARCHAR(255) UNIQUE,   -- Notre référence unique ADSFACILE_xxx

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_campay_ref ON payments(campay_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- RLS (Row Level Security) - Optionnel mais recommandé
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Policy: un utilisateur ne voit que ses propres paiements
CREATE POLICY payments_user_select ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: le backend peut gérer tout via service role
-- (si vous utilisez la clé service_role pour le backend)
