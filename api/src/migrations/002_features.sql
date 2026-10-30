-- Profil tabac, alertes & e-mails
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tobacco_type VARCHAR(20) DEFAULT 'indus';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tobacco_pack_price DECIMAL(10,2) DEFAULT 13.00;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tobacco_packs_per_week DECIMAL(5,2) DEFAULT 7;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS alert_threshold INTEGER DEFAULT 80;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS month_end_email BOOLEAN DEFAULT true;

-- Mode de paiement des dépenses (espèces / carte)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10) DEFAULT 'cash';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank_transaction_id UUID;

-- Clôture du mois : épargne réellement versée + reste réel
ALTER TABLE savings_history ADD COLUMN IF NOT EXISTS actual_savings DECIMAL(10,2);
ALTER TABLE savings_history ADD COLUMN IF NOT EXISTS actual_remainder DECIMAL(10,2);
ALTER TABLE savings_history ADD COLUMN IF NOT EXISTS remainder_to_goal_id UUID;
ALTER TABLE savings_history ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Retraits d'espèces réellement effectués
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  suggested_amount DECIMAL(10,2),
  mode VARCHAR(10) DEFAULT 'weekly',
  note VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS withdrawals_user_date ON withdrawals (user_id, date DESC);

-- Journal des e-mails envoyés (évite les doublons)
CREATE TABLE IF NOT EXISTS email_log (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL,
  ref VARCHAR(100) NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, ref)
);

-- Connecteur bancaire
CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL,
  bank_name VARCHAR(255),
  state VARCHAR(100),
  session_id VARCHAR(255),
  valid_until TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES bank_connections(id) ON DELETE CASCADE,
  external_uid VARCHAR(255),
  name VARCHAR(255),
  iban VARCHAR(50),
  balance DECIMAL(12,2),
  balance_at TIMESTAMPTZ,
  UNIQUE (user_id, external_uid)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  booking_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  label VARCHAR(500) DEFAULT '',
  is_card BOOLEAN DEFAULT false,
  envelope_id UUID REFERENCES envelopes(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ignored BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);
CREATE INDEX IF NOT EXISTS bank_tx_user_date ON bank_transactions (user_id, booking_date DESC);

-- Règles d'affectation automatique libellé → enveloppe
CREATE TABLE IF NOT EXISTS bank_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern VARCHAR(255) NOT NULL,
  envelope_id UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  UNIQUE (user_id, pattern)
);
