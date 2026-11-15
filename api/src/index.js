require('dotenv').config();
const { migrate } = require('./db');
const { startScheduler } = require('./lib/scheduler');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET manquant : refus de démarrer.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32 || /CHANGE_ME/.test(process.env.JWT_SECRET)) {
  console.warn('⚠️  JWT_SECRET faible (< 32 caractères ou valeur d\'exemple) : génère-en un avec `openssl rand -hex 32`.');
}

const app = require('./app');
const PORT = process.env.PORT || 3001;

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`API running on :${PORT}`));
    startScheduler();
  })
  .catch(err => { console.error('DB init failed', err); process.exit(1); });
