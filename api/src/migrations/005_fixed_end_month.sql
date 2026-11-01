-- Mois de fin prévu d'une charge fixe (fin de crédit, d'engagement…), format YYYY-MM
ALTER TABLE fixed_charges ADD COLUMN IF NOT EXISTS end_month VARCHAR(7);
