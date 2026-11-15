-- Arrondi des retraits à la dizaine supérieure (paramétrable dans le profil)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS round_withdrawals BOOLEAN DEFAULT true;
