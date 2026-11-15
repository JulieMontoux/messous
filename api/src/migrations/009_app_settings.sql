-- Réglages de l'application (ex. clés VAPID des notifications push, générées au premier usage)
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL
);
