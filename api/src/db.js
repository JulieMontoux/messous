const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');

// DATE (oid 1082) renvoyé tel quel ('YYYY-MM-DD') — évite les décalages de fuseau horaire
types.setTypeParser(1082, v => v);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  console.log(`Migration OK (${files.length} fichiers)`);
}

module.exports = { pool, migrate };
