-- Solde saisi à la main (si pas de connexion bancaire donnant le solde)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manual_balance DECIMAL(12,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manual_balance_at TIMESTAMPTZ;

-- Bilan mensuel par e-mail
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_report_email BOOLEAN DEFAULT true;

-- Thème (clair / sombre / auto)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme VARCHAR(10) DEFAULT 'auto';

-- Tabac : arrêt
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tobacco_quit_date DATE;

-- Dépenses avancées pour quelqu'un (hors enveloppes) et leur remboursement
CREATE TABLE IF NOT EXISTS advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  note VARCHAR(255) DEFAULT '',
  date DATE NOT NULL,
  repaid_at DATE,
  bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS advances_user ON advances (user_id, date DESC);

-- Objectif d'épargne : versement mensuel prévu
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS monthly_contribution DECIMAL(10,2);

-- Notifications push (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
