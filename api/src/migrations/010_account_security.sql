-- Version des jetons de connexion : incrémentée à chaque changement de mot de passe,
-- ce qui déconnecte les autres appareils (les jetons émis avant ne sont plus acceptés)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Liens « mot de passe oublié » : seule l'empreinte SHA-256 du jeton est conservée,
-- valable 1 heure et utilisable une seule fois
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);
