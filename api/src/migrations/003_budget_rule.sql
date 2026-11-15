-- Règle de répartition affichée dans « Budget idéal » (50-30-20 ou 55-10-5-15-15)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS budget_rule VARCHAR(20) DEFAULT '50-30-20';
