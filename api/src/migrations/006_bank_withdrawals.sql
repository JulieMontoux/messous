-- Retraits d'espèces détectés sur le relevé (RETRAIT DAB…) : lien vers l'opération bancaire
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_bank_tx ON withdrawals (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
