-- Paiements multi-prestataires (oct. 2026) : SasPay remplace Campay.
-- Non destructif : campay_reference reste pour l'historique.
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'campay',
    ADD COLUMN IF NOT EXISTS provider_reference TEXT,
    ADD COLUMN IF NOT EXISTS country VARCHAR(2);

CREATE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments (provider_reference);
