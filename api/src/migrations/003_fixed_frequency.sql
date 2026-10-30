-- Charges fixes non mensuelles (trimestrielles, annuelles) : montant par échéance + mois d'échéance
ALTER TABLE fixed_charges ADD COLUMN IF NOT EXISTS frequency VARCHAR(10) DEFAULT 'monthly';
ALTER TABLE fixed_charges ADD COLUMN IF NOT EXISTS due_month INTEGER;

-- Une opération bancaire peut être rattachée à une charge fixe (au lieu d'une enveloppe)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS fixed_charge_id UUID REFERENCES fixed_charges(id) ON DELETE SET NULL;

-- Les règles automatiques peuvent viser une enveloppe OU une charge fixe
ALTER TABLE bank_rules ALTER COLUMN envelope_id DROP NOT NULL;
ALTER TABLE bank_rules ADD COLUMN IF NOT EXISTS fixed_charge_id UUID REFERENCES fixed_charges(id) ON DELETE CASCADE;
