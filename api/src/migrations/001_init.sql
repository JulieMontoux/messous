CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) DEFAULT '',
  net_salary DECIMAL(10,2) DEFAULT 0,
  has_car BOOLEAN DEFAULT true,
  is_smoker BOOLEAN DEFAULT false,
  household_adults INTEGER DEFAULT 1,
  household_children INTEGER DEFAULT 0,
  pets JSONB DEFAULT '{"dogs":0,"cats":0,"other":0}',
  region VARCHAR(100) DEFAULT 'Île-de-France',
  supermarket VARCHAR(50) DEFAULT 'leclerc',
  registration_date TIMESTAMPTZ,
  onboarding_done BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  view_mode VARCHAR(20) DEFAULT 'monthly'
);

CREATE TABLE IF NOT EXISTS fixed_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  category_id VARCHAR(50),
  icon VARCHAR(10),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category_id VARCHAR(50),
  icon VARCHAR(10),
  color_key VARCHAR(50),
  type VARCHAR(20) DEFAULT 'need',
  budget_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  note VARCHAR(500) DEFAULT '',
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_history (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  salary DECIMAL(10,2) DEFAULT 0,
  total_fixed DECIMAL(10,2) DEFAULT 0,
  total_envelopes DECIMAL(10,2) DEFAULT 0,
  programmed_savings DECIMAL(10,2) DEFAULT 0,
  saving_envelopes DECIMAL(10,2) DEFAULT 0,
  remainder DECIMAL(10,2) DEFAULT 0,
  total_savings DECIMAL(10,2) DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);


CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_amount DECIMAL(10,2) NOT NULL,
  current_amount DECIMAL(10,2) DEFAULT 0,
  target_date DATE,
  icon VARCHAR(10) DEFAULT '🎯',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  note VARCHAR(500) DEFAULT '',
  day_of_month INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN DEFAULT true,
  last_created_month VARCHAR(7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
