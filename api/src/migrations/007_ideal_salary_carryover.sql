-- Répartition du budget idéal (besoins / plaisirs / épargne), modifiable dans le profil
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ideal_needs_pct INTEGER DEFAULT 50;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ideal_wants_pct INTEGER DEFAULT 30;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ideal_savings_pct INTEGER DEFAULT 20;

-- Nouveau salaire avec date d'effet (appliqué automatiquement au début du mois indiqué)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_salary DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_salary_from VARCHAR(7);

-- Restes d'enveloppes reportés sur le mois suivant (choisis à la clôture du mois)
CREATE TABLE IF NOT EXISTS envelope_carryovers (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  envelope_id UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (envelope_id, month)
);
